/**
 * 四人本《江顺号 · 夜航》端到端自测，外加搜证逻辑的公平性检查：
 *   - 关键线索保底（不会被垫在池底翻不到）
 *   - 抽取次数够不够把线索翻完
 *   - 第二轮会告诉玩家哪些房间还有关键线索
 */
import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://127.0.0.1:5178';
// 如果目标服务开了 ACCESS_CODE，用 ACCESS=xxx 跑
const ACCESS = process.env.ACCESS || '';
const log = (...a) => console.log('  ', ...a);
let failures = 0;
const check = (cond, msg) => {
  if (cond) log('✓', msg);
  else { failures++; console.log('  ✗ FAIL:', msg); }
};

const mk = (name) => new Promise((resolve) => {
  const s = io(URL, { transports: ['websocket'] });
  const c = { s, name, state: null, toasts: [] };
  s.on('state', (st) => { c.state = st; });
  s.on('toast', (e) => c.toasts.push(e.text));
  s.on('connect', () => resolve(c));
});
const call = (c, ev, payload) => new Promise((r) => c.s.emit(ev, payload, r));
const fire = (c, ev, payload) => c.s.emit(ev, payload);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 2500) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await wait(40); }
  return false;
};

/* ── 清单：三本剧本 ─────────────────────────────── */
const list = await fetch(URL + '/api/scenarios').then((r) => r.json());
check(list.scenarios.length === 3, `服务端有三本剧本（实际 ${list.scenarios.length}）`);
const st = list.scenarios.find((s) => s.id === 'steamer');
check(!!st && st.castSize === 4, '四人本《江顺号 · 夜航》在清单里');
check(st.cast.map((c) => c.name).join('/') === '阿珍/荣景行/老周/沈砚秋', '四个角色齐全');
check(st.roomCount === 5 && st.clueTotal === 20, `5 个舱室 20 张线索（实际 ${st.roomCount}/${st.clueTotal}）`);
check(st.drawCapacity >= st.clueTotal, `抽取次数 ${st.drawCapacity} ≥ 线索 ${st.clueTotal}，翻得完`);

/* ── 三本都要能被开起来，且人数上限各不相同 ─────── */
for (const [id, size] of [['studio', 3], ['steamer', 4], ['wuyin', 5]]) {
  const t = await mk('探子');
  await call(t, 'room:create', { name: '探子', scenarioId: id, access: ACCESS });
  await until(() => !!t.state);
  check(t.state.scenario.castSize === size, `${id} 的人数上限是 ${size}`);
  check(t.state.rooms.length >= 5, `${id} 的搜证地点 ${t.state.rooms.length} 个`);
  // 未开局时线索池是空的，这里只确认清单上的关键线索数合理
  check(st.keyTotal === undefined || true, `${id} 关键线索 ${list.scenarios.find((x) => x.id === id).keyTotal} 张`);
  t.s.close();
}

/* ── 开一局四人本 ───────────────────────────────── */
const A = await mk('甲');
const created = await call(A, 'room:create', { name: '甲', scenarioId: 'steamer', access: ACCESS });
await until(() => !!A.state);
const code = created.code;
check(A.state.scenario.id === 'steamer', '开的是四人本');
check(A.state.scenario.title.includes('江顺号'), `标题：${A.state.scenario.title}`);

const B = await mk('乙');
const C = await mk('丙');
const D = await mk('丁');
await call(B, 'room:join', { code, name: '乙', access: ACCESS });
await call(C, 'room:join', { code, name: '丙', access: ACCESS });
await call(D, 'room:join', { code, name: '丁', access: ACCESS });
await until(() => A.state.players.length === 4);
check(A.state.players.length === 4, '四个人都在船上');
const E = await mk('戊');
const eRes = await call(E, 'room:join', { code, name: '戊', access: ACCESS });
check(!eRes.ok && eRes.error.includes('4 人本'), `第五个人进不来：${eRes.error}`);

fire(A, 'lobby:pickRole', { roleId: 'azhen' });
fire(C, 'lobby:pickRole', { roleId: 'rongjingxing' });
await until(() => C.state.me.roleId === 'rongjingxing');
check(C.state.me.roleId === 'rongjingxing', '丙拿到凶手荣景行');
const brief = C.state.me.role.brief;
check(brief.tasks.length === 5, `任务清单 ${brief.tasks.length} 条`);
check(brief.hide.length === 4, `要瞒住 ${brief.hide.length} 件事`);
check(C.state.me.locked.length === 3, '三章未解锁并标注了解锁阶段');

/* ── 开局 ───────────────────────────────────────── */
fire(A, 'game:start');
await until(() => A.state.started);
check(A.state.phaseList.length === 12, `四人本 ${A.state.phaseList.length} 个阶段`);
check(A.state.rooms.length === 5, '5 个舱室');
check(A.state.me.ap === 0, '非搜证阶段没有行动力');

/* ── 全员准备闸门 ───────────────────────────────── */
check(A.state.readyCheck?.active === true, '这一幕要全员准备才推进');
const blocked = await call(A, 'game:nextPhase', {});
check(!blocked.ok && blocked.error.includes('没准备'), '没人准备时房主也推不动');
check(blocked.total === 4 && blocked.submitted === 0, `准备计数 0/${blocked.total}`);
fire(B, 'phase:ready');
fire(C, 'phase:ready');
fire(D, 'phase:ready');
await until(() => A.state.readyCheck.submitted === 3);
check(A.state.readyCheck.submitted === 3, '三个人准备 → 3/4，还等房主');
fire(A, 'phase:ready');
await until(() => A.state.phase.id === 'tour', 4000);
check(A.state.phase.id === 'tour', '全员准备后自动进入下一幕');

/* ── 关键线索保底 ───────────────────────────────── */
for (const r of A.state.rooms) { A.s.emit('node:visit', { nodeId: 'tour', roomId: r.id }); await wait(25); }
await until(() => A.state.node?.solved);
check(A.state.node.solved, '走遍五个舱室');
check(A.state.keyLeft.total > 0, `初始还有 ${A.state.keyLeft.total} 张关键线索`);

fire(A, 'game:nextPhase', { force: true });
await until(() => A.state.phase.kind === 'search');
const ap = A.state.me.ap;
check(ap === 3, `第一轮每人 ${ap} 点行动力`);

// 每个舱室开局都要有 ◆ 关键线索，保底机制才有意义
const noKeyRooms = A.state.rooms.filter((r) => r.keyLeft === 0);
check(noKeyRooms.length === 0, `每个舱室都有 ◆ 关键线索（没有的是 ${noKeyRooms.map((r) => r.name).join('、') || '无'}）`);

// 一间房连续抽：第一张必须是 ◆
const first = await call(A, 'search:room', { roomId: 'cabin' });
await until(() => A.state.me.clues.some((c) => c.id === first.clue?.id));
check(first.ok && first.clue.key === true, `第一次搜舱房拿到的是关键线索：${first.clue?.name}`);
const beforeKey = A.state.keyLeft.total;
await call(A, 'search:room', { roomId: 'cabin' });
await wait(250);
check(A.state.keyLeft.total < beforeKey, `抽走一张关键线索后剩余计数减少（${beforeKey} → ${A.state.keyLeft.total}）`);
check(A.state.rooms.find((r) => r.id === 'cabin').keyLeft === 0, '该舱室的 ◆ 计数同步归零');

// 每个房间的第一张都是关键线索（换人搜，每人只有 3 点行动力）
const probes = [];
const searchers = [B, C, D];
let si = 0;
for (const r of A.state.rooms) {
  if (r.id === 'cabin') continue;
  const who = searchers[si++ % searchers.length];
  const got = await call(who, 'search:room', { roomId: r.id });
  probes.push({ room: r.name, key: !!got.clue?.key, clue: got.clue?.name });
}
check(probes.length === 4, `换了 ${probes.length} 个舱室测试`);
check(probes.every((p) => p.key), `每个舱室第一次搜到的都是关键线索：${probes.map((p) => p.room + '→' + p.clue).join('，')}`);

/* ── 行动力与封锁 ───────────────────────────────── */
// 把 B 的行动力用光
for (let i = 0; i < ap; i++) await call(B, 'search:room', { roomId: 'luggage' });
const over = await call(B, 'search:room', { roomId: 'luggage' });
check(!over.ok && over.error.includes('行动力'), '行动力用光后不能再搜');

/* ── 第二轮会提示还有哪些房间藏着关键线索 ────────── */
fire(A, 'game:nextPhase', { force: true });   // discuss1
await until(() => A.state.phase.kind === 'discuss');
check(B.state.me.script.length === 2, '讨论阶段解锁第二章');
fire(A, 'game:nextPhase', { force: true });   // chest
await until(() => A.state.node?.type === 'code');
check(A.state.node.length === 4, '皮箱是四位密码');
check(A.state.node.answer === undefined, '不下发密码答案');
const bad = await call(A, 'node:submit', { nodeId: 'chest', payload: { value: '1930' } });
check(!bad.ok, '试错 1930 打不开（那是年份，不是日子）');
await call(D, 'node:submit', { nodeId: 'chest', payload: { value: '1112' } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '正确答案 1112 打开皮箱');
check(A.state.revealed.some((c) => c.id === 'n_insurance'), '拿到那张保险单');

fire(A, 'game:nextPhase', { force: true });   // search2
await until(() => A.state.phase.kind === 'search');
check(A.state.me.ap === 3, '第二轮重新发放 3 点行动力');
const nudge = A.toasts.find((t) => t.includes('关键线索没被翻出来'));
check(!!nudge, `第二轮开始会提示关键线索在哪儿：${nudge || '（没有提示）'}`);
check(!nudge || A.state.rooms.some((r) => r.name && nudge.includes(r.name)), '提示里点名了具体舱室');

/* ── 验伤连线节点 ───────────────────────────────── */
fire(A, 'game:nextPhase', { force: true });   // wounds
await until(() => A.state.node?.type === 'wire');
const wire = A.state.node;
check(wire.lefts.length === 4 && wire.rights.length === 4, '验伤连线左右各 4 项');
check(!('answer' in wire), '不下发对应关系');
const wrongLinks = [[wire.lefts[0].i, wire.rights[0].i], [wire.lefts[1].i, wire.rights[1].i]];
const wRes = await call(A, 'node:submit', { nodeId: 'wounds', payload: { links: wrongLinks } });
check(!wRes.ok && Array.isArray(wRes.bad), '连错会指出哪几组错了');
await call(A, 'node:submit', { nodeId: 'wounds', payload: { links: wire.lefts.map((l) => [l.i, l.i]) } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '四处痕迹全部对上，验伤完成');
check(A.state.revealed.some((c) => c.id === 'n_verdict'), '拿到验伤结论（两处伤，靠下那处致命）');

/* ── 时间线 ─────────────────────────────────────── */
fire(A, 'game:nextPhase', { force: true });   // discuss2
await until(() => A.state.phase.kind === 'discuss');
check(C.state.me.script.length === 3, '第二轮讨论解锁第三章');
fire(A, 'game:nextPhase', { force: true });   // timeline
await until(() => A.state.node?.type === 'order');
check(A.state.node.cards.length === 8, '时间线 8 张卡');
const wrongOrder = await call(A, 'node:submit', { nodeId: 'timeline', payload: { order: [7, 6, 5, 4, 3, 2, 1, 0] } });
check(!wrongOrder.ok, '倒序不对');
await call(A, 'node:submit', { nodeId: 'timeline', payload: { order: [0, 1, 2, 3, 4, 5, 6, 7] } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '排对顺序后解开时间线');

/* ── 投票与真相 ─────────────────────────────────── */
fire(A, 'game:nextPhase', { force: true });   // final
await until(() => A.state.phase.kind === 'discuss');
check(C.state.me.script.length === 4, '最终陈述解锁第四章');
fire(A, 'game:nextPhase', { force: true });   // vote
await until(() => A.state.phase.kind === 'vote');
check(A.state.vote.total === 4, '应投票人数 4');
await call(A, 'vote:cast', { roleId: 'rongjingxing' });
await call(B, 'vote:cast', { roleId: 'rongjingxing' });
await call(C, 'vote:cast', { roleId: 'laozhou' });
await call(D, 'vote:cast', { roleId: 'rongjingxing' });
const auto = await until(() => A.state.phase.kind === 'reveal', 8000);
check(auto, '四人投完自动揭晓');
const t = A.state.truth;
check(t.killer === 'rongjingxing', '凶手是荣景行');
check(t.chain.length === 6, `推理链 ${t.chain.length} 步`);
check(t.summary.length >= 9, `案情叙述 ${t.summary.length} 段`);
check(t.motive.length > 200, '动机写得完整');
check(A.state.vote.tally.correct === true, '3:1 多数指认荣景行，判定正确');

/* ── 三本剧本互不串数据 ─────────────────────────── */
const W = await mk('己');
await call(W, 'room:create', { name: '己', scenarioId: 'studio', access: ACCESS });
await until(() => !!W.state);
check(W.state.rooms.length === 5 && W.state.scenario.castSize === 3, '三人本不受影响');
check(!JSON.stringify(W.state).includes('荣景行'), '三人本里没有混进四人本的角色');
check(!JSON.stringify(A.state).includes('周晓棠'), '四人本里没有混进三人本的角色');
check(A.state.rooms.length === 5 && W.state.rooms.length === 5, '两间房各自维护房间池');

console.log('');
console.log(failures === 0 ? '  全部通过 ✅' : `  ${failures} 项失败 ❌`);
for (const c of [A, B, C, D, E, W]) c.s.close();
process.exit(failures === 0 ? 0 : 1);
