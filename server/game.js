/**
 * 游戏引擎：房间生命周期、阶段推进、搜证 / 公开线索 / 解谜节点 / 投票。
 *
 * 安全模型：服务器从不把「别人的剧本」和「未公开的线索」下发给客户端。
 * 每次状态变化都对每个玩家单独构造视图（viewFor），因此客户端拿不到不该拿的东西。
 */

import { randomUUID } from 'node:crypto';
import { getScenario, DEFAULT_SCENARIO_ID } from './data/registry.js';
import { config } from './config.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ── 工具 ───────────────────────────────────────────── */
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const makeCode = (rooms) => {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
};

/** 去掉线索里的答案性内容，只保留展示字段 */
const pubClue = (c) => ({
  id: c.id, name: c.name, art: c.art || 'rumor', text: c.text,
  key: !!c.key, roomId: c.roomId || null, roomName: c.roomName || null,
});

/* ── 房间 ───────────────────────────────────────────── */
class Room {
  constructor(code, scenario) {
    this.code = code;
    this.scenario = scenario;
    this.createdAt = Date.now();
    this.phaseIndex = 0;
    this.players = new Map(); // socketId -> player
    this.tokens = new Map(); // token -> socketId
    this.started = false;
    this.pools = new Map(); // roomId -> 剩余线索 id 队列
    this.visited = new Set(); // 地图节点已探索的房间
    this.nodes = new Map(); // nodeId -> { solved, attempts, progress }
    this.revealed = new Set(); // 已公开线索 id
    this.revealOrder = []; // 公开顺序
    this.votes = new Map(); // playerId -> roleId
    this.voteTimer = null;
    this.chat = [];
    this.log = [];
    for (const n of this.scenario.nodes) this.nodes.set(n.id, { solved: false, attempts: 0, progress: null });
  }

  get phase() { return this.scenario.phases[this.phaseIndex]; }
  get host() { return [...this.players.values()].find((p) => p.isHost) || null; }
  get assignedRoles() { return new Set([...this.players.values()].map((p) => p.roleId).filter(Boolean)); }
  get unplayedRoles() { return this.scenario.cast.filter((r) => !this.assignedRoles.has(r.id)); }

  /**
   * 每个房间的线索池：打乱，但**关键线索永远排在最前面**。
   * 不这么做的话，一间房的决定性证据可能刚好排在最后一张，
   * 而全场的抽取次数是有限的 —— 运气差就直接变成"这局破不了案"。
   */
  resetPools() {
    this.pools.clear();
    for (const r of this.scenario.rooms) {
      const key = shuffle(r.clues.filter((c) => c.key).map((c) => c.id));
      const rest = shuffle(r.clues.filter((c) => !c.key).map((c) => c.id));
      // 注意：抽线索用的是 pop()，从数组末尾取。
      // 所以关键线索要放在**末尾**，才会先被抽走。
      this.pools.set(r.id, [...rest, ...key]);
    }
  }

  /** 还没被翻出来的关键线索，以及它们在哪些房间（给玩家一个找的方向） */
  keyRemaining() {
    const byRoom = [];
    let total = 0;
    for (const r of this.scenario.rooms) {
      const left = (this.pools.get(r.id) || []).filter((id) => this.scenario.clueIndex.get(id)?.key);
      if (left.length) { byRoom.push({ roomId: r.id, roomName: r.name, count: left.length }); total += left.length; }
    }
    return { total, byRoom };
  }

  get maxPlayers() { return this.scenario.castSize; }

  addLog(text) {
    this.log.push({ t: Date.now(), text });
    if (this.log.length > 200) this.log.shift();
  }
}

/* ── 引擎 ───────────────────────────────────────────── */
export function attachGame(io) {
  const rooms = new Map();

  const roomOf = (socket) => rooms.get(socket.data.code);

  const pushState = (room) => {
    for (const p of room.players.values()) {
      // room.players 以 player.id 为键，而 socket 加入的是 room.code 频道，
      // 所以必须按 p.socketId 定向推送。
      if (!p.socketId || !p.connected) continue;
      io.to(p.socketId).emit('state', viewFor(room, p));
    }
  };

  const broadcast = (room, event, payload) => io.to(room.code).emit(event, payload);

  const toast = (room, text, kind = 'info') => broadcast(room, 'toast', { text, kind });

  /** 玩家个人视角的状态快照 */
  function viewFor(room, me) {
    const role = me.roleId ? room.scenario.roleIndex.get(me.roleId) : null;
    const unlocked = role ? role.script.filter((ch) => phaseReached(room, ch.unlock)) : [];
    const locked = role ? role.script.filter((ch) => !phaseReached(room, ch.unlock)) : [];
    const phaseName = (id) => room.scenario.phases.find((p) => p.id === id)?.name || '';
    return {
      code: room.code,
      started: room.started,
      isHost: me.isHost,
      scenario: {
        title: room.scenario.title,
        subtitle: room.scenario.subtitle,
        tagline: room.scenario.tagline,
        intro: room.scenario.intro,
        victim: room.scenario.victim,
        id: room.scenario.id,
        castSize: room.scenario.castSize,
      },
      phase: { ...room.phase, index: room.phaseIndex, total: room.scenario.phases.length },
      phaseList: room.scenario.phases.map((p, i) => ({ id: p.id, name: p.name, kind: p.kind, hint: p.hint || '', done: i < room.phaseIndex })),
      me: {
        id: me.id,
        name: me.name,
        roleId: me.roleId,
        role: role
          ? {
              id: role.id, name: role.name, gender: role.gender, age: role.age,
              title: role.title, color: role.color, publicBio: role.publicBio,
              brief: role.brief || null,
            }
          : null,
        script: unlocked.map((ch) => ({ title: ch.title, body: ch.body, unlock: ch.unlock })),
        locked: locked.map((ch) => ({
          title: ch.title,
          unlock: ch.unlock,
          unlockPhase: phaseName(ch.unlock),
        })),
        clues: [...me.clues].map((id) => pubClue(room.scenario.clueIndex.get(id))).filter(Boolean),
        ap: me.ap,
        score: me.score,
        ready: me.ready,
      },
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        roleId: p.roleId,
        roleName: p.roleId ? room.scenario.roleIndex.get(p.roleId).name : null,
        roleTitle: p.roleId ? room.scenario.roleIndex.get(p.roleId).title : null,
        connected: p.connected,
        ready: p.ready,
        isHost: p.isHost,
        isMe: p.id === me.id,
        clueCount: p.clues.size,
        score: p.score,
        hasVoted: room.votes.has(p.id),
        micOn: !!p.micOn,
      })),
      cast: room.scenario.cast.map((r) => ({
        id: r.id, name: r.name, gender: r.gender, age: r.age, title: r.title,
        color: r.color, publicBio: r.publicBio,
        takenBy: [...room.players.values()].find((p) => p.roleId === r.id)?.name || null,
      })),
      rooms: room.scenario.rooms.map((r) => ({
        id: r.id, name: r.name, sub: r.sub, x: r.x, y: r.y, w: r.w, h: r.h,
        env: r.env,
        remaining: (room.pools.get(r.id) || []).length,
        total: r.clues.length,
        keyLeft: (room.pools.get(r.id) || []).filter((id) => room.scenario.clueIndex.get(id)?.key).length,
      })),
      keyLeft: room.keyRemaining(),
      mapView: room.scenario.mapView,
      // 只在当前阶段确实是某个节点时下发该节点配置（且不含答案）
      node: room.phase.kind === 'node' ? nodePublicConfig(room, room.phase.nodeId) : null,
      nodeStates: room.scenario.nodes.map((n) => ({
        id: n.id, type: n.type, title: n.title, sub: n.sub,
        solved: room.nodes.get(n.id).solved,
        attempts: room.nodes.get(n.id).attempts,
      })),
      visited: [...room.visited],
      revealed: room.revealOrder.map((id) => pubClue(room.scenario.clueIndex.get(id))).filter(Boolean),
      vote: (() => {
        const prog = voteProgress(room);
        return {
          submitted: prog.submitted,
          total: prog.total,
          pending: prog.pending,
          allVoted: allVoted(room),
          mine: room.votes.get(me.id) || null,
          tally: room.phase.kind === 'reveal' ? tallyVotes(room) : null,
        };
      })(),
      truth: room.phase.kind === 'reveal' ? room.scenario.truth : null,
      hostNotes: me.isHost
        ? room.unplayedRoles.map((r) => ({ id: r.id, name: r.name, title: r.title, script: r.script }))
        : null,
      chat: room.chat.slice(-60),
    };
  }

  const phaseReached = (room, unlockId) => {
    const target = room.scenario.phases.findIndex((p) => p.id === unlockId);
    return target >= 0 && room.phaseIndex >= target;
  };

  /** 节点首次进入时生成一次布局并持久化，避免每次状态推送都重新洗牌 */
  function makeLayout(node) {
    if (node.type === 'wire') {
      return {
        lefts: shuffle(node.pairs.map((p, i) => ({ i, text: p.left }))),
        rights: shuffle(node.pairs.map((p, i) => ({ i, text: p.right }))),
      };
    }
    if (node.type === 'order') {
      // 保证初始顺序不是正确答案
      let cards;
      do { cards = shuffle(node.events.map((text, i) => ({ i, text }))); }
      while (cards.length > 1 && cards.every((c, i) => c.i === i));
      return { cards };
    }
    if (node.type === 'develop') {
      let baths;
      do { baths = shuffle(node.baths.map((text, i) => ({ i, text }))); }
      while (baths.length > 1 && baths.every((b, i) => b.i === i));
      return { baths };
    }
    if (node.type === 'map') return { visited: [] };
    return null;
  }

  /** 节点配置的玩家可见部分：剥掉 answer / 对应关系 / 正确顺序 */
  function nodePublicConfig(room, nodeId) {
    const node = room.scenario.nodeIndex.get(nodeId);
    if (!node) return null;
    const st = room.nodes.get(nodeId);
    const base = {
      id: node.id, type: node.type, title: node.title, sub: node.sub,
      brief: node.brief, solved: st.solved, attempts: st.attempts, rewardText: node.rewardText,
    };
    const layout = st.progress || {};
    if (node.type === 'map') {
      return { ...base, visited: layout.visited || [] };
    }
    if (node.type === 'code') {
      return { ...base, length: node.length, hint: st.attempts >= 2 ? node.hint : null };
    }
    if (node.type === 'wire') {
      return {
        ...base,
        lefts: layout.lefts || [], rights: layout.rights || [],
        pairCount: node.pairs.length,
      };
    }
    if (node.type === 'order') {
      return { ...base, cards: layout.cards || [] };
    }
    if (node.type === 'develop') {
      return {
        ...base,
        baths: layout.baths || [],
        times: node.times,
        bathCount: node.baths.length,
      };
    }
    if (node.type === 'slide') {
      return { ...base, size: node.size, image: `/api/art/${node.answerArt}` };
    }
    return base;
  }

  function tallyVotes(room) {
    const counts = new Map();
    for (const target of room.votes.values()) counts.set(target, (counts.get(target) || 0) + 1);
    const rows = room.scenario.cast.map((r) => ({
      roleId: r.id, name: r.name, votes: counts.get(r.id) || 0,
      voters: [...room.votes.entries()].filter(([, t]) => t === r.id)
        .map(([pid]) => room.players.get(pid)?.name || '?'),
    })).sort((a, b) => b.votes - a.votes);
    const top = rows[0]?.votes || 0;
    const leaders = rows.filter((r) => r.votes === top && top > 0);
    return {
      rows,
      leaders: leaders.map((l) => l.roleId),
      correct: leaders.length === 1 && leaders[0].roleId === room.scenario.truth.killer,
      killer: room.scenario.truth.killer,
      unanimous: top === room.votes.size && room.votes.size > 0,
    };
  }

  /** 投票只算还在线的人：掉线的人不该把整局卡住 */
  function voteProgress(room) {
    const eligible = [...room.players.values()].filter((p) => p.connected);
    const pending = eligible.filter((p) => !room.votes.has(p.id)).map((p) => p.name);
    return { total: eligible.length, submitted: eligible.filter((p) => room.votes.has(p.id)).length, pending };
  }

  const allVoted = (room) => {
    const { total, submitted } = voteProgress(room);
    return total > 0 && submitted >= total;
  };

  /**
   * 所有人都投完 → 停 2.5 秒让大家看清票型，然后自动揭晓。
   * 房主也可以随时手动提前揭晓；一旦离开投票阶段就把定时器清掉。
   */
  function scheduleReveal(room) {
    const next = room.scenario.phases[room.phaseIndex + 1];
    if (!next || next.kind !== 'reveal') return;
    if (!allVoted(room)) return;
    if (room.voteTimer) return;
    room.voteTimer = setTimeout(() => {
      room.voteTimer = null;
      if (room.phase.kind === 'vote' && allVoted(room)) {
        broadcast(room, 'vote:complete', {});
        enterPhase(room, room.phaseIndex + 1);
      }
    }, 2500);
  }

  /** 领取节点奖励：进入公共线索区，人人可见 */
  function grantNodeRewards(room, nodeId) {
    const node = room.scenario.nodeIndex.get(nodeId);
    const st = room.nodes.get(nodeId);
    if (st.solved || !node.rewards) return;
    st.solved = true;
    st.progress = null;
    for (const cid of node.rewards) {
      if (!room.scenario.clueIndex.has(cid)) continue;
      room.revealed.add(cid);
      room.revealOrder.push(cid);
      for (const p of room.players.values()) {
        p.clues.add(cid);
        p.score += 2;
      }
    }
    room.addLog(`【解谜成功】${node.title} —— ${node.rewardText}`);
    broadcast(room, 'node:solved', { nodeId, title: node.title, rewardText: node.rewardText, rewards: node.rewards });
  }

  /* ── 阶段切换的副作用 ─────────────────────────────── */
  function enterPhase(room, index) {
    room.phaseIndex = Math.max(0, Math.min(room.scenario.phases.length - 1, index));
    const phase = room.phase;
    room.addLog(`—— ${phase.name} ——`);
    if (phase.kind === 'search') {
      for (const p of room.players.values()) p.ap = phase.ap || 2;
      // 第二轮的搜证：如果还有关键线索没翻出来，明确告诉大家还剩几张、在哪些房间。
      // 线索是有限的，不提醒的话很容易整局都碰不到定案的那张，玩起来就太难了。
      const hadSearch = room.scenario.phases.slice(0, room.phaseIndex).some((p) => p.kind === 'search');
      const left = room.keyRemaining();
      if (hadSearch && left.total > 0) {
        broadcast(room, 'toast', {
          text: `还有 ${left.total} 张关键线索没被翻出来，分别在：${left.byRoom.map((b) => b.roomName).join('、')}`,
          kind: 'warn',
        });
      }
    }
    if (phase.kind === 'vote') {
      room.votes.clear();
    } else if (room.voteTimer) {
      clearTimeout(room.voteTimer);
      room.voteTimer = null;
    }
    if (phase.kind === 'node') {
      const st = room.nodes.get(phase.nodeId);
      const node = room.scenario.nodeIndex.get(phase.nodeId);
      if (st && node && !st.solved && !st.progress) st.progress = makeLayout(node);
    }
    broadcast(room, 'phase', { id: phase.id, name: phase.name, kind: phase.kind, index: room.phaseIndex });
    pushState(room);
  }

  /* ── socket 处理 ──────────────────────────────────── */
  io.on('connection', (socket) => {
    const ack = (cb, payload) => { if (typeof cb === 'function') cb(payload); };

    /** 公网部署时用通行码挡一下，别让路人开房占内存 */
    const badAccess = (access) =>
      config.accessCode && String(access || '').trim() !== config.accessCode;

    const joinRoomAs = (room, player, cb) => {
      socket.join(room.code);
      socket.data.code = room.code;
      socket.data.playerId = player.id;
      player.socketId = socket.id;
      player.connected = true;
      ack(cb, { ok: true, code: room.code, token: player.token, playerId: player.id });
      broadcast(room, 'toast', { text: `${player.name} 进入了山庄`, kind: 'info' });
      pushState(room);
    };

    socket.on('room:create', ({ name, scenarioId, access } = {}, cb) => {
      if (badAccess(access)) return ack(cb, { ok: false, error: '通行码不对', needAccess: true });
      const code = makeCode(rooms);
      const room = new Room(code, getScenario(scenarioId));
      rooms.set(code, room);
      const player = {
        id: randomUUID(), token: randomUUID(), socketId: socket.id,
        name: (name || '').trim().slice(0, 12) || '房主',
        roleId: null, ready: false, isHost: true, connected: true,
        ap: 0, clues: new Set(), score: 0, micOn: false,
      };
      room.players.set(player.id, player);
      room.tokens.set(player.token, player.id);
      room.addLog(`${player.name} 创建了房间`);
      joinRoomAs(room, player, cb);
    });

    socket.on('room:join', ({ code, name, token, access } = {}, cb) => {
      if (badAccess(access)) return ack(cb, { ok: false, error: '通行码不对', needAccess: true });
      const room = rooms.get((code || '').toUpperCase().trim());
      if (!room) return ack(cb, { ok: false, error: '房间不存在，检查一下房号' });

      // 断线重连：token 命中则恢复原座位
      const existingId = token && room.tokens.get(token);
      if (existingId && room.players.has(existingId)) {
        const p = room.players.get(existingId);
        const old = p.socketId;
        if (old && old !== socket.id) {
          // 同一个座位被新连接接管（多半是刷新）。明确告知旧连接，
          // 别让对方傻等着一个已经不属于他的界面。
          io.to(old).emit('room:kicked', { reason: '这个座位已经在别处打开了' });
          const dead = io.sockets.sockets.get(old);
          if (dead) { dead.leave(room.code); dead.data.code = null; }
        }
        p.name = (name || '').trim().slice(0, 12) || p.name;
        return joinRoomAs(room, p, cb);
      }

      if (room.started) return ack(cb, { ok: false, error: '这局已经开始了，等下一局吧' });
      if (room.players.size >= room.maxPlayers) return ack(cb, { ok: false, error: `这本是 ${room.maxPlayers} 人本，房间满了` });

      const player = {
        id: randomUUID(), token: randomUUID(), socketId: socket.id,
        name: (name || '').trim().slice(0, 12) || `玩家${room.players.size + 1}`,
        roleId: null, ready: false, isHost: false, connected: true,
        ap: 0, clues: new Set(), score: 0, micOn: false,
      };
      if (!room.host) player.isHost = true;
      room.players.set(player.id, player);
      room.tokens.set(player.token, player.id);
      joinRoomAs(room, player, cb);
    });

    socket.on('lobby:pickRole', ({ roleId } = {}) => {
      const room = roomOf(socket); if (!room || room.started) return;
      const me = room.players.get(socket.data.playerId); if (!me) return;
      if (roleId && !room.scenario.roleIndex.has(roleId)) return;
      if (roleId && [...room.players.values()].some((p) => p.roleId === roleId && p.id !== me.id)) {
        return socket.emit('toast', { text: '这个角色已经被别人选了', kind: 'warn' });
      }
      me.roleId = roleId || null;
      pushState(room);
    });

    socket.on('lobby:randomRoles', () => {
      const room = roomOf(socket); if (!room || room.started) return;
      const me = room.players.get(socket.data.playerId);
      if (!me?.isHost) return;
      const free = shuffle(room.scenario.cast.filter((r) => !room.assignedRoles.has(r.id)).map((r) => r.id));
      for (const p of room.players.values()) {
        if (!p.roleId && free.length) p.roleId = free.pop();
      }
      pushState(room);
    });

    socket.on('lobby:ready', ({ ready } = {}) => {
      const room = roomOf(socket); if (!room) return;
      const me = room.players.get(socket.data.playerId); if (!me) return;
      me.ready = !!ready;
      pushState(room);
    });

    socket.on('game:start', () => {
      const room = roomOf(socket); if (!room || room.started) return;
      const me = room.players.get(socket.data.playerId);
      if (!me?.isHost) return;
      // 未选角色的玩家随机补齐
      const free = shuffle(room.scenario.cast.filter((r) => !room.assignedRoles.has(r.id)).map((r) => r.id));
      for (const p of room.players.values()) if (!p.roleId && free.length) p.roleId = free.pop();
      if (free.length) {
        room.addLog(`本局有 ${free.length} 个角色无人扮演，其剧本已转为主持人手册`);
      }
      room.resetPools();
      room.started = true;
      enterPhase(room, 0);
      broadcast(room, 'toast', { text: '雨夜开始了。', kind: 'info' });
    });

    socket.on('game:setPhase', ({ index } = {}) => {
      const room = roomOf(socket); if (!room?.started) return;
      const me = room.players.get(socket.data.playerId);
      if (!me?.isHost) return;
      enterPhase(room, Number(index) || 0);
    });

    socket.on('game:nextPhase', () => {
      const room = roomOf(socket); if (!room?.started) return;
      const me = room.players.get(socket.data.playerId);
      if (!me?.isHost) return;
      if (room.phaseIndex >= room.scenario.phases.length - 1) return;
      enterPhase(room, room.phaseIndex + 1);
    });

    /* ── 搜证 ───────────────────────────────────────── */
    socket.on('search:room', ({ roomId } = {}, cb) => {
      const room = roomOf(socket); if (!room?.started) return ack(cb, { ok: false, error: '还没开始' });
      const me = room.players.get(socket.data.playerId);
      const phase = room.phase;
      if (phase.kind !== 'search') return ack(cb, { ok: false, error: '现在不是搜证阶段' });
      if (me.ap <= 0) return ack(cb, { ok: false, error: '行动力用完了' });
      const pool = room.pools.get(roomId);
      const def = room.scenario.rooms.find((r) => r.id === roomId);
      if (!pool || !def) return ack(cb, { ok: false, error: '没有这个地方' });
      if (pool.length === 0) return ack(cb, { ok: false, error: '这个房间已经被翻空了' });

      const cid = pool.pop();
      me.clues.add(cid);
      me.ap -= 1;
      const clue = pubClue(room.scenario.clueIndex.get(cid));
      room.addLog(`${me.name} 在${def.name}搜到「${clue.name}」`);
      ack(cb, { ok: true, clue, ap: me.ap, remaining: pool.length });
      io.to(socket.id).emit('search:result', { clue, ap: me.ap, remaining: pool.length });
      pushState(room);
    });

    /* ── 线索公开 / 转交 ─────────────────────────────── */
    socket.on('clue:reveal', ({ clueId } = {}, cb) => {
      const room = roomOf(socket); if (!room) return ack(cb, { ok: false });
      const me = room.players.get(socket.data.playerId);
      if (!me.clues.has(clueId)) return ack(cb, { ok: false, error: '你手上没有这张线索' });
      if (room.revealed.has(clueId)) return ack(cb, { ok: false, error: '已经公开过了' });
      room.revealed.add(clueId);
      room.revealOrder.push(clueId);
      me.score += 1;
      const clue = pubClue(room.scenario.clueIndex.get(clueId));
      room.addLog(`${me.name} 公开了线索「${clue.name}」`);
      broadcast(room, 'clue:revealed', { clue, by: me.name });
      ack(cb, { ok: true });
      pushState(room);
    });

    socket.on('clue:give', ({ clueId, toPlayerId } = {}, cb) => {
      const room = roomOf(socket); if (!room) return ack(cb, { ok: false });
      const me = room.players.get(socket.data.playerId);
      const target = room.players.get(toPlayerId);
      if (!me.clues.has(clueId)) return ack(cb, { ok: false, error: '你手上没有这张线索' });
      if (!target || target.id === me.id) return ack(cb, { ok: false, error: '对象不对' });
      me.clues.delete(clueId);
      target.clues.add(clueId);
      const name = room.scenario.clueIndex.get(clueId)?.name || '线索';
      room.addLog(`${me.name} 把「${name}」给了 ${target.name}`);
      io.to(target.socketId).emit('toast', { text: `${me.name} 把线索「${name}」交给了你`, kind: 'good' });
      ack(cb, { ok: true });
      pushState(room);
    });

    /* ── 解谜节点 ───────────────────────────────────── */
    const nodeGuard = (nodeId) => {
      const room = roomOf(socket);
      if (!room?.started) return { error: '还没开始' };
      const phase = room.phase;
      if (phase.kind !== 'node' || phase.nodeId !== nodeId) return { error: '现在不是这个节点' };
      const st = room.nodes.get(nodeId);
      if (!st) return { error: '没有这个节点' };
      if (st.solved) return { error: '这个谜题已经解开了', solved: true };
      return { room, st, node: room.scenario.nodeIndex.get(nodeId) };
    };

    socket.on('node:visit', ({ nodeId, roomId } = {}) => {
      const g = nodeGuard(nodeId);
      if (g.error || g.node.type !== 'map') return;
      const { room, st, node } = g;
      room.visited.add(roomId);
      st.progress = { visited: [...room.visited], needed: room.scenario.rooms.length };
      pushState(room);
      if (room.scenario.rooms.every((r) => room.visited.has(r.id))) {
        if (!st.solved) {
          grantNodeRewards(room, nodeId);
          broadcast(room, 'toast', { text: '你们走遍了整栋楼，环境线索全部到手。', kind: 'good' });
          pushState(room);
        }
      }
    });

    socket.on('node:submit', ({ nodeId, payload } = {}, cb) => {
      const g = nodeGuard(nodeId);
      if (g.error) return ack(cb, { ok: false, error: g.error, solved: !!g.solved });
      const { room, st, node } = g;
      const me = room.players.get(socket.data.playerId);
      let ok = false;

      if (node.type === 'code') {
        st.attempts += 1;
        const v = String(payload?.value ?? '').replace(/\D/g, '');
        ok = v === node.answer;
        if (!ok) {
          room.addLog(`${me.name} 试了一组保险柜密码，不对`);
          broadcast(room, 'node:progress', { nodeId, type: 'code', attempts: st.attempts, by: me.name, wrong: true });
        }
      } else if (node.type === 'wire') {
        st.attempts += 1;
        const links = Array.isArray(payload?.links) ? payload.links : [];
        const bad = links.filter((l) => !Array.isArray(l) || Number(l[0]) !== Number(l[1]));
        ok = links.length === node.pairs.length && bad.length === 0;
        if (!ok) {
          broadcast(room, 'node:progress', { nodeId, type: 'wire', attempts: st.attempts, by: me.name, wrong: true });
          ack(cb, { ok: false, error: '有连错的', attempts: st.attempts, bad });
          return pushState(room);
        }
      } else if (node.type === 'order') {
        st.attempts += 1;
        const order = Array.isArray(payload?.order) ? payload.order.map(Number) : [];
        ok = order.length === node.events.length && order.every((v, i) => v === i);
        if (!ok) {
          broadcast(room, 'node:progress', { nodeId, type: 'order', attempts: st.attempts, by: me.name, wrong: true });
        }
      } else if (node.type === 'develop') {
        st.attempts += 1;
        const order = Array.isArray(payload?.order) ? payload.order.map(Number) : [];
        const time = Number(payload?.time);
        const orderOk = order.length === node.baths.length && order.every((v, i) => v === i);
        const timeOk = time === node.answerTime;
        ok = orderOk && timeOk;
        if (!ok) {
          broadcast(room, 'node:progress', { nodeId, type: 'develop', attempts: st.attempts, by: me.name, wrong: true });
          ack(cb, {
            ok: false,
            orderOk, timeOk,
            error: !orderOk ? '工序顺序不对——这一卷废了' : '时间不对，翻翻工作手册',
            attempts: st.attempts,
          });
          return pushState(room);
        }
      } else if (node.type === 'slide') {
        // 拼图由客户端判定完成（合作游戏，无需防作弊）
        ok = payload?.solved === true;
        st.attempts += 1;
      }

      if (ok) {
        grantNodeRewards(room, nodeId);
        ack(cb, { ok: true, solved: true });
        pushState(room);
      } else {
        ack(cb, { ok: false, error: '还不对，再想想', attempts: st.attempts });
        pushState(room);
      }
    });

    /* ── 投票 ───────────────────────────────────────── */
    socket.on('vote:cast', ({ roleId } = {}, cb) => {
      const room = roomOf(socket); if (!room?.started) return ack(cb, { ok: false });
      if (room.phase.kind !== 'vote') return ack(cb, { ok: false, error: '还没到投票环节' });
      const me = room.players.get(socket.data.playerId);
      if (!room.scenario.roleIndex.has(roleId)) return ack(cb, { ok: false, error: '没有这个角色' });
      if (roleId === me.roleId) return ack(cb, { ok: false, error: '不能投自己' });
      room.votes.set(me.id, roleId);
      ack(cb, { ok: true });
      pushState(room);
      scheduleReveal(room);
    });

    /* ── 聊天 ───────────────────────────────────────── */
    socket.on('chat:send', ({ text } = {}) => {
      const room = roomOf(socket); if (!room) return;
      const me = room.players.get(socket.data.playerId); if (!me) return;
      const body = String(text || '').slice(0, 500).trim();
      if (!body) return;
      const msg = { id: randomUUID(), from: me.name, roleName: me.roleId ? room.scenario.roleIndex.get(me.roleId).name : null, text: body, t: Date.now() };
      room.chat.push(msg);
      if (room.chat.length > 300) room.chat.shift();
      broadcast(room, 'chat:new', msg);
    });

    /* ── 语音信令 ───────────────────────────────────── */
    socket.on('voice:ready', ({ on } = {}) => {
      const room = roomOf(socket); if (!room) return;
      const me = room.players.get(socket.data.playerId); if (!me) return;
      me.micOn = !!on;
      const peers = [...room.players.values()].filter((p) => p.id !== me.id && p.connected && p.micOn).map((p) => p.id);
      // 新加入者主动向已有成员发起 offer，避免同时双向 offer 造成冲突
      socket.emit('voice:peers', { peers });
      socket.to(room.code).emit('voice:peer-join', { id: me.id, name: me.name });
      pushState(room);
    });

    socket.on('voice:signal', ({ to, data } = {}) => {
      const room = roomOf(socket); if (!room) return;
      const me = room.players.get(socket.data.playerId);
      const target = room.players.get(to);
      if (!target?.socketId) return;
      io.to(target.socketId).emit('voice:signal', { from: me.id, name: me.name, data });
    });

    socket.on('voice:leave', () => {
      const room = roomOf(socket); if (!room) return;
      const me = room.players.get(socket.data.playerId); if (!me) return;
      me.micOn = false;
      socket.to(room.code).emit('voice:peer-left', { id: me.id });
      pushState(room);
    });

    /* ── 通用：拿房间日志 / 主动重推状态 ─────────────── */
    socket.on('sync', () => {
      const room = roomOf(socket); if (!room) return;
      pushState(room);
    });

    socket.on('room:leave', () => {
      const room = roomOf(socket); if (!room) return;
      const me = room.players.get(socket.data.playerId);
      socket.leave(room.code);
      socket.data.code = null;
      if (!me) return;
      if (!room.started) {
        room.players.delete(me.id);
        room.tokens.delete(me.token);
        broadcast(room, 'toast', { text: `${me.name} 离开了`, kind: 'warn' });
      } else {
        me.connected = false;
        me.micOn = false;
        broadcast(room, 'toast', { text: `${me.name} 断线了`, kind: 'warn' });
      }
      if (me.isHost) {
        const next = [...room.players.values()].find((p) => p.connected);
        if (next) { next.isHost = true; room.addLog(`${next.name} 成为房主`); }
      }
      if (room.players.size === 0) rooms.delete(room.code);
      pushState(room);
    });

    socket.on('disconnect', () => {
      const room = roomOf(socket); if (!room) return;
      const me = room.players.get(socket.data.playerId);
      if (!me) return;
      me.connected = false;
      me.micOn = false;
      socket.to(room.code).emit('voice:peer-left', { id: me.id });
      if (!room.started) {
        room.players.delete(me.id);
        room.tokens.delete(me.token);
      }
      broadcast(room, 'toast', { text: `${me.name} 断线了`, kind: 'warn' });
      if (me.isHost) {
        const next = [...room.players.values()].find((p) => p.connected);
        if (next) { next.isHost = true; }
      }
      if (room.players.size === 0) rooms.delete(room.code);
      else pushState(room);
    });
  });

  return { rooms };
}

export { getScenario, DEFAULT_SCENARIO_ID };
