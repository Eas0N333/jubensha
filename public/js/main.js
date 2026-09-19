/**
 * 客户端主程序：连接、三块屏幕（首页 / 大厅 / 游戏）、按阶段渲染主舞台。
 */

import { $, $$, h, esc, artUrl, toast, openModal, closeModal, clueCard, openClueModal, renderFloorPlan, isModalOpen } from './ui.js';
import { createMiniGame } from './minigames.js';
import { Voice } from './voice.js';
import { openBook, refreshBook, refreshBookMics, closeBook, isBookOpen } from './book.js';

/* ══════════ 全局状态 ══════════ */
const socket = io({ transports: ['websocket', 'polling'] });
let S = null;            // 服务器下发的个人视角状态
let voice = null;
let game = null;         // 当前挂载的小游戏实例
let gameNodeId = null;   // 小游戏实例对应的节点 id
let timerId = 0;
let timerLeft = 0;
let unread = 0;
let chatOpen = false;
let currentCode = null;   // 用来发现「换了房间」

const LS = {
  get name() { return localStorage.getItem('wuyin.name') || ''; },
  set name(v) { localStorage.setItem('wuyin.name', v); },
  // 座位令牌放 sessionStorage：同一个浏览器开两个标签页时，
  // localStorage 会互相覆盖，第二个标签页会把第一个的座位顶掉。
  // sessionStorage 每个标签页独立，且刷新后仍在，正好符合「刷新不掉线」的需求。
  tokenFor(code) { return sessionStorage.getItem(`wuyin.token.${code}`) || ''; },
  setToken(code, t) { sessionStorage.setItem(`wuyin.token.${code}`, t); },
  get access() { return localStorage.getItem('wuyin.access') || ''; },
  set access(v) { localStorage.setItem('wuyin.access', v || ''); },
};

/* ══════════ 屏幕切换 ══════════ */
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

/* ══════════ 首页 ══════════ */
$('#input-name').value = LS.name;

function homeError(msg) { $('#home-error').textContent = msg || ''; }

function withName(fn) {
  const name = $('#input-name').value.trim();
  if (!name) { homeError('先给自己起个名字'); $('#input-name').focus(); return; }
  LS.name = name;
  const access = $('#input-access').value.trim();
  if (accessRequired && !access) { homeError('这台服务器要通行码，问一下开房的人'); $('#input-access').focus(); return; }
  LS.access = access;
  homeError('');
  fn(name, access);
}

$('#btn-create').onclick = () => withName((name, access) => {
  socket.emit('room:create', { name, scenarioId: pickedScenario, access }, (res) => {
    if (!res?.ok) return homeError(res?.error || '创建失败');
    LS.setToken(res.code, res.token);
  });
});

$('#btn-join').onclick = () => withName((name, access) => {
  const code = $('#input-code').value.trim().toUpperCase();
  if (code.length !== 4) return homeError('房号是四位数');
  socket.emit('room:join', { code, name, token: LS.tokenFor(code), access }, (res) => {
    if (!res?.ok) return homeError(res?.error || '进不去');
    LS.setToken(res.code, res.token);
  });
});

$('#input-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-join').click(); });
$('#input-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-create').click(); });

/* ── 首页：剧本选择 ───────────────────────────────── */
let scenarioList = [];
let pickedScenario = null;
let accessRequired = false;
const SCENARIO_KEY = 'wuyin.scenario';

async function loadScenarios() {
  try {
    const res = await fetch('/api/scenarios');
    const data = await res.json();
    scenarioList = data.scenarios || [];
    accessRequired = !!data.accessRequired;
    const saved = localStorage.getItem(SCENARIO_KEY);
    pickedScenario = scenarioList.some((x) => x.id === saved) ? saved : data.defaultId;
    paintScenarios();
    // 这台服务器要通行码才让进
    $('#access-field').hidden = !accessRequired;
    $('#input-access').value = LS.access;
  } catch (err) {
    $('#home-lead').textContent = '读不到剧本清单，检查一下服务器还在不在。';
  }
}

function paintScenarios() {
  const picker = $('#scenario-picker');
  picker.innerHTML = '';
  for (const sc of scenarioList) {
    picker.append(h('div', {
      class: `scenario-card ${sc.id === pickedScenario ? 'on' : ''}`,
      onclick: () => {
        pickedScenario = sc.id;
        localStorage.setItem(SCENARIO_KEY, sc.id);
        paintScenarios();
      },
    },
      h('div', { class: 'sc-top' },
        h('h3', { text: sc.title }),
        h('span', { class: 'sc-size', text: `${sc.castSize} 人本` })),
      h('p', { class: 'sc-tag', text: sc.tagline }),
      h('div', { class: 'sc-meta', text: `${sc.roomCount} 个搜证地点 · ${sc.clueTotal} 张线索 · ${sc.nodeCount} 个解谜节点 · ${sc.phaseCount} 个阶段` }),
      h('div', { class: 'sc-cast' }, ...sc.cast.map((c) => h('span', { text: `${c.name}（${c.gender} · ${c.age}）` })))));
  }
  paintScenarioDetail();
}

function paintScenarioDetail() {
  const sc = scenarioList.find((x) => x.id === pickedScenario);
  if (!sc) return;
  $('#home-title').textContent = sc.title;
  $('#home-kicker').textContent = `线上剧本杀 · ${sc.subtitle}`;
  $('#home-lead').textContent = sc.tagline;
  $('#victim-art').src = artUrl(sc.cover);
  $('#victim-name').textContent = `${sc.victim.name} · ${sc.victim.age} 岁`;
  $('#victim-role').textContent = sc.victim.role;
  $('#victim-scene').textContent = sc.victim.scene || '';
  const strip = $('#home-cast');
  strip.innerHTML = '';
  strip.style.gridTemplateColumns = `repeat(${sc.cast.length}, 1fr)`;
  for (const c of sc.cast) {
    strip.append(h('div', { class: 'cs' },
      h('div', { class: 'avatar', style: { background: `${c.color}22`, borderColor: c.color, color: c.color, margin: '0 auto' }, text: c.name.slice(0, 1) }),
      h('div', { class: 'cs-name', text: c.name }),
      h('div', { class: 'cs-title', text: c.title })));
  }
}
loadScenarios();

/* ══════════ 大厅 ══════════ */
/* 只重画玩家列表：音量变化时会被高频调用，避免整页重绘 */
function paintLobbyPlayers() {
  const list = $('#lobby-players');
  if (!list || !S) return;
  list.innerHTML = '';
  for (const p of S.players) {
    const role = S.cast.find((c) => c.id === p.roleId);
    list.append(h('li', { class: p.isMe ? 'me' : '' },
      h('div', { class: 'avatar', text: p.name.slice(0, 1) }),
      h('div', { class: 'p-name' },
        h('span', {}, p.name + (p.isMe ? '（你）' : ''), micDot(p)),
        h('div', { class: 'p-role', text: role ? `扮演 ${role.name}` : '还没选角色' })),
      p.isHost ? h('span', { class: 'tag host', text: '房主' }) : null,
      !p.connected ? h('span', { class: 'tag off', text: '掉线' }) : null,
      p.ready ? h('span', { class: 'tag ready', text: '已准备' }) : null,
    ));
  }
}

function paintLobby() {
  if (!S) return;
  $('#lobby-code').textContent = S.code;
  $('#lobby-count').textContent = `${S.players.length} / ${S.scenario.castSize}`;
  paintLobbyPlayers();

  const cast = $('#lobby-cast');
  cast.innerHTML = '';
  for (const c of S.cast) {
    const mine = S.me.roleId === c.id;
    const taken = c.takenBy && !mine;
    const card = h('div', {
      class: `cast-card ${mine ? 'picked' : ''} ${taken ? 'taken' : ''}`,
      onclick: () => { if (!taken) socket.emit('lobby:pickRole', { roleId: mine ? null : c.id }); },
    },
      taken ? h('div', { class: 'cc-owner', text: c.takenBy }) : null,
      h('div', { class: 'cc-top' }, h('h4', { text: c.name }), h('span', { class: 'cc-title', text: `${c.gender} · ${c.age} 岁` })),
      h('div', { class: 'muted small', text: c.title }),
      h('p', { class: 'cc-bio', text: c.publicBio }),
      mine ? h('div', { class: 'cc-tag tag host', text: '这是你 · 点一下取消' }) : null,
    );
    cast.append(card);
  }

  const me = S.players.find((p) => p.isMe);
  $('#btn-ready').textContent = me?.ready ? '取消准备' : '我准备好了';
  $('#btn-start').disabled = !S.isHost;
  $('#btn-random').disabled = !S.isHost;
  $('#btn-host').hidden = !S.isHost;
  $('#btn-next-phase').hidden = true;
  $('#lobby-hint').textContent = S.isHost
    ? (S.players.length < S.scenario.castSize
      ? `现在是 ${S.players.length} 人。人不满也能开：没被扮演的角色会转成「主持人手册」，只有你看得到，需要你替他们说话。`
      : '人齐了，随时可以开始。')
    : '等房主开始。你可以先点右上角试试麦克风。';
}

$('#btn-copy-code').onclick = async () => {
  const code = S?.code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast(`房号 ${code} 已复制，发给朋友吧`, 'good');
  } catch {
    toast(`房号是 ${code}`, 'info');
  }
};
$('#btn-ready').onclick = () => {
  const me = S?.players.find((p) => p.isMe);
  socket.emit('lobby:ready', { ready: !me?.ready });
};
$('#btn-random').onclick = () => socket.emit('lobby:randomRoles');
$('#btn-start').onclick = () => socket.emit('game:start');

/* ══════════ 游戏界面 ══════════ */
function paintGame() {
  if (!S) return;
  const ph = S.phase;

  $('#phase-name').textContent = ph.name;
  $('#phase-step').textContent = `${ph.index + 1} / ${ph.total}`;
  $('#phase-hint').textContent = ph.hint || '';
  $('#btn-host').hidden = !S.isHost;
  const last = ph.index >= ph.total - 1;
  const next = $('#btn-next-phase');
  next.hidden = !S.isHost || last;
  next.textContent = ph.kind === 'vote' ? '揭晓真相 ▶' : '下一阶段 ▶';

  // 行动力
  const apBox = $('#ap-display');
  apBox.innerHTML = '';
  if (ph.kind === 'search') {
    apBox.append(h('div', { class: 'ap-dots' }, '行动力 ',
      ...Array.from({ length: ph.ap || 2 }, (_, i) =>
        h('span', { class: `ap-dot ${i < S.me.ap ? 'full' : 'used'}` }))));
  }

  paintMeCard();
  paintScript();
  paintPeople();
  paintClues();
  paintStage();
  paintVoiceStrip();
  $('#mine-count').textContent = S.me.clues.length;
  $('#public-count').textContent = S.revealed.length;
}

function paintMeCard() {
  const box = $('#me-card');
  box.innerHTML = '';
  if (!S.me.role) {
    box.append(h('div', { class: 'mc-role', text: '旁观中' }), h('div', { class: 'mc-line', text: '本局你没有角色。' }));
    if (S.hostNotes?.length) box.append(openBookButton('主持人手册'));
    return;
  }
  const r = S.me.role;
  box.append(
    h('div', { class: 'mc-role' }, h('span', { class: 'role-mark', style: { background: r.color } }), r.name),
    h('div', { class: 'mc-title', text: r.title }),
    h('div', { class: 'mc-line', text: `${r.gender} · ${r.age} 岁` }),
  );
  if (r.brief?.win) {
    box.append(h('div', { class: 'st-win', style: { marginTop: '10px', fontSize: '12.5px' } },
      h('b', { style: { color: 'var(--gold)' }, text: '赢的条件：' }), r.brief.win));
  }
  box.append(openBookButton());
}

/** 翻开本子的入口，侧栏里点哪都是它 */
function openBookButton(label = '翻开我的本子') {
  const unread = unreadChapters();
  return h('button', { class: 'btn btn-primary', style: { width: '100%', marginTop: '12px' }, onclick: () => openMyBook() },
    label,
    unread > 0 ? h('span', { class: 'badge', style: { marginLeft: '8px', background: 'rgba(0,0,0,.25)', color: '#16120a' }, text: `新 +${unread}` }) : null);
}

function paintScript() {
  const box = $('#tab-script');
  box.innerHTML = '';
  const role = S.me.role;
  const brief = role?.brief;

  // 封面卡：点一下就是整本小册子
  box.append(h('div', { class: 'book-cover', onclick: () => openMyBook() },
    h('div', { class: 'bc-kicker', text: '你的本子' }),
    h('div', { class: 'bc-role', text: role ? role.name : '旁观者' }),
    h('div', { class: 'bc-title', text: role ? role.title : '本局你没有角色' }),
    h('div', { class: 'bc-open' },
      h('b', { text: `已解锁 ${S.me.script.length} / ${S.me.script.length + (S.me.locked?.length || 0)} 章` }),
      h('span', { text: '翻开阅读 →' }))));

  // 任务速览：讨论到一半不想翻本子也能瞄一眼
  if (brief) {
    const nowPhase = S.phase.id;
    box.append(h('div', { class: 'side-task' },
      h('h5', { text: '你的任务' }),
      h('div', { class: 'st-win' }, h('b', { style: { color: '#e9e1cf' }, text: '赢的条件：' }), brief.win),
      h('ul', {}, ...(brief.tasks || []).map((t) => {
        const on = t.phase && t.phase === nowPhase;
        return h('li', { class: on ? 'on' : '' },
          on ? `▶ ${t.when}：${t.what}` : `${t.when}：${t.what}`);
      })),
      h('p', { class: 'st-now', text: nowPhase === 'reveal' ? '已经结束了。' : '带 ▶ 的那条是这一步该做的。' })));
  }

  if (S.hostNotes?.length) {
    box.append(h('div', { class: 'side-task', style: { marginTop: '12px' } },
      h('h5', { text: '主持人手册' }),
      h('div', { class: 'st-win', text: `无人扮演：${S.hostNotes.map((r) => r.name).join('、')}` }),
      h('p', { class: 'st-now', text: '他们的整本剧本都在阅读视图里，替他们保管好。' }),
      openBookButton('翻开阅读视图')));
  }
}

/* ── 阅读视图 ─────────────────────────────────────── */
const readKey = () => (S?.code ? `wuyin.read.${S.code}` : 'wuyin.read');
const readCount = () => Number(sessionStorage.getItem(readKey()) || 0);
/** 有多少章是解锁了但还没翻开过的 */
function unreadChapters() {
  if (!S?.me?.script) return 0;
  return Math.max(0, S.me.script.length - readCount());
}

function openMyBook() {
  openBook(S, { micDot });
  sessionStorage.setItem(readKey(), String(S.me.script.length));
  paintScript();
  paintMeCard();
}

function paintPeople() {
  const box = $('#tab-people');
  box.innerHTML = '';
  for (const p of S.players) {
    const c = S.cast.find((x) => x.id === p.roleId);
    box.append(h('div', { class: 'person' },
      h('h5', {}, c ? c.name : p.name, h('span', { class: 'pp-owner', text: p.isMe ? '  （你）' : '' })),
      h('div', { class: 'muted small' },
        `${p.name} 扮演`, !p.connected ? ' · 掉线' : '',
        p.roleId ? '' : ' · 无角色'),
      c ? h('p', { text: c.publicBio }) : null,
    ));
  }
}

function paintClues() {
  const mine = $('#clue-mine');
  mine.innerHTML = '';
  if (!S.me.clues.length) {
    mine.append(h('div', { class: 'empty-note', text: '还没有线索。到搜证阶段，在中间的地图上点房间抽取。' }));
  }
  for (const c of S.me.clues) {
    mine.append(clueCard(c, { onOpen: (clue) => openMyClue(clue) }));
  }

  const pub = $('#clue-public');
  pub.innerHTML = '';
  if (!S.revealed.length) {
    pub.append(h('div', { class: 'empty-note', text: '还没有人公开线索。把线索拍到桌上，是全房间共享信息最快的方法。' }));
  }
  for (const c of S.revealed) {
    pub.append(clueCard(c, { public: true, onOpen: (clue) => openClueModal(clue) }));
  }
}

function openMyClue(clue) {
  const actions = [];
  if (!S.revealed.some((c) => c.id === clue.id)) {
    actions.push({
      label: '公开这张线索', cls: 'btn-primary',
      onClick: () => socket.emit('clue:reveal', { clueId: clue.id }, (res) => {
        if (res?.ok) closeModal(); else toast(res?.error || '公开失败', 'warn');
      }),
    });
  }
  actions.push({
    label: '私下交给某人',
    onClick: () => pickPlayerToGive(clue),
  });
  openClueModal(clue, actions);
}

function pickPlayerToGive(clue) {
  const others = S.players.filter((p) => !p.isMe);
  openModal(h('div', {},
    h('p', { class: 'muted small', text: `把「${clue.name}」交给谁？（对方会收到提示）` }),
    h('div', { class: 'row', style: { marginTop: '14px' } },
      ...others.map((p) => h('button', {
        class: 'btn', text: p.name,
        onclick: () => socket.emit('clue:give', { clueId: clue.id, toPlayerId: p.id }, (res) => {
          if (res?.ok) { closeModal(); toast(`已经把线索给了 ${p.name}`, 'good'); }
          else toast(res?.error || '给不出去', 'warn');
        }),
      }))),
    h('div', { class: 'row', style: { marginTop: '16px' } },
      h('button', { class: 'btn btn-ghost', text: '算了', onclick: closeModal })),
  ), { head: '私下转交线索' });
}

/* ── 主舞台：按阶段分发 ───────────────────────────── */
function paintStage() {
  const stage = $('#stage');
  const kind = S.phase.kind;

  if (kind === 'node') { paintNodeStage(stage); return; }
  destroyGame();

  if (kind === 'story') return stage.replaceChildren(storyPanel());
  if (kind === 'search') return stage.replaceChildren(searchPanel());
  if (kind === 'discuss') return stage.replaceChildren(discussPanel());
  if (kind === 'vote') return stage.replaceChildren(votePanel());
  if (kind === 'reveal') return stage.replaceChildren(revealPanel());
}

function stageShell({ title, sub, tools, body, foot, flush }) {
  const head = h('div', { class: 'stage-head' }, h('div', {}, h('h2', { text: title }),
    sub ? h('div', { class: 'sh-sub', text: sub }) : null), tools || null);
  return h('div', { class: 'stage-panel' },
    head,
    h('div', { class: `stage-body ${flush ? 'flush' : ''}` }, body),
    foot || null);
}

function storyPanel() {
  const body = h('div', { class: 'story-text' }, ...S.scenario.intro.map((p) => h('p', { text: p })));
  const victim = S.scenario.victim;
  return stageShell({
    title: S.phase.name, sub: '先读完这一段，再轮流介绍自己',
    body: h('div', {},
      body,
      h('div', { class: 'brief-box', style: { marginTop: '30px' } },
        h('h4', { text: '案情简报' }),
        h('p', { text: `死者：${victim.name}，${victim.age} 岁，${victim.role}` }),
        h('p', { text: `发现：${victim.found}` }),
        h('p', { text: `现场：${victim.scene}` }),
      ),
    ),
  });
}

/* ── 搜证地图 ─────────────────────────────────────── */
function searchPanel() {
  // 地图自己占满可滚区域，图例钉在面板底部——
  // 之前图例跟着地图一起流式排布，会溢出到下面的语音条上。
  const mapHost = h('div', { class: 'map-scroll' });
  const legend = h('div', { class: 'map-legend' });

  const panel = stageShell({
    title: '搜证 · 点房间抽线索',
    sub: `你还有 ${S.me.ap} 点行动力。每个房间的线索是有限的，谁先搜谁先得。`,
    tools: h('div', { class: 'muted small', text: `手上已有 ${S.me.clues.length} 张线索` }),
    body: mapHost,
    foot: legend,
    flush: true,
  });

  renderFloorPlan(mapHost, {
    rooms: S.rooms, mapView: S.mapView, mode: 'search',
    onRoom: (r) => doSearch(r),
    onInfo: (r) => showRoomInfo(r, { mode: 'search' }),
  });

  const total = S.rooms.reduce((n, r) => n + r.remaining, 0);
  const keyLeft = S.keyLeft?.total || 0;
  legend.append(
    h('span', {}, h('i', { style: { background: 'rgba(216,167,90,.6)' } }), '还有线索'),
    h('span', {}, h('i', { style: { background: 'rgba(255,255,255,.12)' } }), '已翻空'),
    h('span', {}, h('i', { style: { background: 'rgba(127,158,196,.5)' } }), '已查看'),
    h('span', {}, h('i', { style: { background: 'rgba(216,167,90,.85)', transform: 'rotate(45deg)' } }), '还有关键线索'),
    h('span', { style: { marginLeft: 'auto', color: 'var(--gold)' } },
      keyLeft ? `楼里还剩 ${total} 张，其中 ◆ 关键线索 ${keyLeft} 张` : `楼里还剩 ${total} 张没被翻出来`),
  );
  return panel;
}

/** 图例（节点里的地图模式用同一套） */
function mapLegend(legend, { mode, visitedCount = 0, roomCount = 0 }) {
  legend.innerHTML = '';
  legend.append(
    h('span', {}, h('i', { style: { background: 'rgba(216,167,90,.6)' } }), mode === 'search' ? '还有线索' : '未查看'),
    h('span', {}, h('i', { style: { background: 'rgba(255,255,255,.12)' } }), mode === 'search' ? '已翻空' : '—'),
    h('span', {}, h('i', { style: { background: 'rgba(127,158,196,.5)' } }), '已查看'),
  );
  if (mode !== 'search') {
    legend.append(h('span', { style: { marginLeft: 'auto', color: 'var(--gold)' } }, `已查看 ${visitedCount} / ${roomCount} 个房间`));
  }
  return legend;
}

function showRoomInfo(r, { mode }) {
  const actions = [];
  if (mode === 'search') {
    actions.push({
      label: `在这里搜证（消耗 1 点行动力）`, cls: 'btn-primary',
      onClick: () => { closeModal(); doSearch(r); },
    });
  }
  openModal(h('div', {},
    h('p', { class: 'mini-label', text: r.sub }),
    h('h3', { text: r.name }),
    h('p', { class: 'cm-text', style: { marginTop: '14px' }, text: r.env }),
    mode === 'search'
      ? h('p', { class: 'muted small', text: `这个房间原本藏着 ${r.total} 张线索，还剩 ${r.remaining} 张。` })
      : null,
    h('div', { class: 'row', style: { marginTop: '18px' } },
      ...actions.map((a) => h('button', { class: `btn ${a.cls || ''}`, text: a.label, onclick: a.onClick })),
      h('button', { class: 'btn btn-ghost', text: '关掉', onclick: closeModal })),
  ), { head: r.name });
}

function doSearch(r) {
  if (S.me.ap <= 0) return toast('这一轮的行动力用完了，等下一轮', 'warn');
  if (r.remaining === 0) return toast(`${r.name}已经被翻空了`, 'warn');
  socket.emit('search:room', { roomId: r.id }, (res) => {
    if (!res?.ok) return toast(res?.error || '搜不了', 'warn');
    flyCard(res.clue);
    setTimeout(() => openMyClue(res.clue), 620);
  });
}

/** 抽卡动画：一张卡从中间飞出来 */
function flyCard(clue) {
  const el = h('div', { class: 'card-fly', style: { left: '50%', top: '46%' } },
    h('img', { src: artUrl(clue.art), alt: '' }));
  $('#fx-root').append(el);
  setTimeout(() => el.remove(), 900);
}

/* ── 讨论 ─────────────────────────────────────────── */
/* 计时器状态放在模块级：主舞台会随状态推送重建，元素必须靠 id 重新找回来 */
function tickTimer() {
  timerLeft = Math.max(0, timerLeft - 1);
  paintTimerEls();
  if (timerLeft === 0) {
    clearInterval(timerId); timerId = 0; paintTimerEls();
    toast('时间到了，该收一收了', 'warn');
  }
}

function paintTimerEls(el) {
  // 元素可能还没插进文档（讨论页刚构建时），所以允许直接传入
  const target = el || document.getElementById('discuss-timer');
  const btn = document.getElementById('timer-btn');
  if (!target) return;
  const m = String(Math.floor(timerLeft / 60)).padStart(2, '0');
  const s = String(timerLeft % 60).padStart(2, '0');
  target.textContent = `${m}:${s}`;
  target.classList.toggle('warn', timerLeft <= 60);
  if (btn) btn.textContent = timerId ? '暂停' : '开始计时';
}

function toggleTimer() {
  if (timerId) { clearInterval(timerId); timerId = 0; }
  else if (timerLeft > 0) timerId = setInterval(tickTimer, 1000);
  paintTimerEls();
}

function discussPanel() {
  const total = (S.phase.minutes || 8) * 60;
  if (!timerLeft) timerLeft = total;

  const tools = h('div', { class: 'row' },
    S.isHost ? h('button', { class: 'btn btn-primary', text: '进入下一阶段', onclick: nextPhase }) : null,
    S.isHost ? h('button', { class: 'btn btn-ghost', text: '主持人面板', onclick: openHostPanel }) : null,
  );

  const people = h('div', { class: 'people-row' },
    ...S.players.map((p) => {
      const c = S.cast.find((x) => x.id === p.roleId);
      const speaking = voice?.isSpeaking(p.id);
      return h('div', { class: `pc ${speaking ? 'live' : ''}`, 'data-pid': p.id },
        h('div', { class: 'pc-name' }, c ? c.name : p.name, micDot(p)),
        h('div', { class: 'pc-sub', text: `${p.name}${p.isMe ? '（你）' : ''}${p.connected ? '' : ' · 掉线'}` }),
        h('div', { class: 'pc-stat', text: `手上 ${p.clueCount} 张线索 · 积分 ${p.score}` }));
    }));

  const timerEl = h('div', { class: 'timer', id: 'discuss-timer' });
  const keyLeft = S.keyLeft?.total || 0;
  const panel = stageShell({
    title: S.phase.name,
    sub: keyLeft
      ? `随时可以翻左边的剧本和右边的线索。还有 ${keyLeft} 张 ◆ 关键线索没被翻出来（${S.keyLeft.byRoom.map((b) => b.roomName).join('、')}）。`
      : '随时可以翻左边的剧本和右边的线索。讨论不用等，想说就说。',
    tools,
    body: h('div', {},
      h('div', { class: 'discuss-hero' },
        h('p', { class: 'muted small', text: '计时只是提醒，不会打断你们' }),
        timerEl,
        h('div', { class: 'timer-ctrl' },
          h('button', { class: 'btn', id: 'timer-btn', text: '开始计时', onclick: toggleTimer }),
          h('button', { class: 'btn btn-ghost', text: '重置', onclick: () => { clearInterval(timerId); timerId = 0; timerLeft = total; paintTimerEls(); } }),
        )),
      people,
    ),
  });

  paintTimerEls(timerEl);
  return panel;
}

/* ── 小游戏舞台 ───────────────────────────────────── */
function paintNodeStage(stage) {
  const node = S.node;
  if (!node) {
    destroyGame();
    return stage.replaceChildren(stageShell({
      title: S.phase.name, sub: '', body: h('div', { class: 'empty-note', text: '这个节点已经结束了。' }),
    }));
  }

  if (game && gameNodeId === node.id) {
    game.update(node);
    return;
  }

  destroyGame();
  gameNodeId = node.id;
  game = createMiniGame({
    node,
    rooms: S.rooms,
    submit: (nodeId, payload, cb) => socket.emit('node:submit', { nodeId, payload }, cb),
    onVisit: (roomId) => socket.emit('node:visit', { nodeId: node.id, roomId }),
    renderPlan: (host, opts) => renderFloorPlan(host, { rooms: S.rooms, mapView: S.mapView, ...opts }),
    mapLegend,
    showRoomInfo: (r, o) => showRoomInfo(r, o),
  });
  if (!game) {
    return stage.replaceChildren(stageShell({
      title: node.title, sub: node.sub,
      body: h('div', { class: 'empty-note', text: '未知的节点类型：' + node.type }),
    }));
  }
  stage.replaceChildren(h('div', { class: 'stage-panel' }, game.mount()));
}

function destroyGame() {
  if (game) { game.destroy(); game = null; }
  gameNodeId = null;
}

/* ── 投票 ─────────────────────────────────────────── */
function votePanel() {
  const { submitted, total, pending, allVoted, mine } = S.vote;

  const voters = h('div', { class: 'voter-chips' },
    ...S.players.map((p) => h('span', { class: `voter ${p.hasVoted ? 'done' : 'wait'}` },
      h('span', { class: 'vtick', text: p.hasVoted ? '✓' : '○' }),
      p.name + (p.isMe ? '（你）' : ''))));

  const status = h('div', { class: 'vote-status' },
    h('div', {},
      h('div', { class: 'vs-line', text: allVoted ? '所有人都投完了，正在揭晓…' : `还差 ${total - submitted} 人没投` }),
      h('div', { class: 'vs-sub', text: allVoted ? '马上进入真相揭晓。' : '可以改票，直到揭晓。所有人投完会自动揭晓。' })),
    voters);

  const grid = h('div', { class: 'vote-grid' });
  for (const c of S.cast) {
    const isMine = S.me.roleId === c.id;
    const chosen = mine === c.id;
    grid.append(h('div', {
      class: `vote-card ${chosen ? 'mine' : ''} ${isMine ? 'disabled' : ''}`,
      onclick: () => {
        if (isMine) return toast('不能投自己', 'warn');
        socket.emit('vote:cast', { roleId: c.id }, (res) => {
          if (res?.ok) toast(chosen ? `你已经投过 ${c.name} 了` : `你把票投给了 ${c.name}`, 'good');
          else toast(res?.error || '投不出去', 'warn');
        });
      },
    },
      h('h4', {}, c.name, isMine ? h('span', { class: 'muted small', text: '（你）' }) : null),
      h('div', { class: 'vc-sub', text: `${c.takenBy || '无人扮演'} · ${c.title}` }),
      h('div', { class: 'vc-tag', text: chosen ? '★ 你投了这个人' : '点一下投给他' }),
    ));
  }

  const foot = h('div', { class: 'vote-foot' },
    S.isHost
      ? h('button', {
          class: 'btn btn-primary',
          text: allVoted ? '揭晓真相 ▶' : `揭晓真相 ▶（还差 ${total - submitted} 人）`,
          onclick: () => confirmReveal(allVoted),
        })
      : h('span', { class: 'vf-note', text: '等主持人揭晓。你还可以继续改票。' }),
    h('span', { class: 'vf-note', text: '凶手只有一个。想清楚了再点。' }));

  return stageShell({
    title: '指认凶手',
    sub: '选出你认定的凶手，多数决。',
    body: h('div', {}, status, grid, foot),
  });
}

/** 房主提前揭晓要过一道确认，避免有人没投就草草结束 */
function confirmReveal(allVoted) {
  if (allVoted) return nextPhase();
  const { total, submitted, pending } = S.vote;
  openModal(h('div', {},
    h('p', { text: `还有 ${total - submitted} 人没投票：${pending.join('、')}` }),
    h('p', { class: 'muted small', text: '现在揭晓的话，他们的票就不算了。' }),
    h('div', { class: 'row', style: { marginTop: '18px' } },
      h('button', { class: 'btn btn-primary', text: '现在就揭晓', onclick: () => { closeModal(); nextPhase(); } }),
      h('button', { class: 'btn btn-ghost', text: '再等等', onclick: closeModal })),
  ), { head: '还有人在想', plain: true });
}

/* ── 真相揭晓 ─────────────────────────────────────── */
function revealPanel() {
  const t = S.truth || {};
  const tally = S.vote?.tally;
  const wrap = h('div', { class: 'reveal-wrap' });

  wrap.append(h('div', { class: 'reveal-hero' },
    h('div', { class: 'rh-kicker', text: '真 相' }),
    h('h2', { text: t.headline || '真相揭晓' }),
    h('div', { class: 'rh-who', text: t.killerName || '' }),
  ));

  if (tally) {
    const right = tally.correct;
    const voteRows = tally.rows.filter((r) => r.votes > 0).map((r) => h('tr', {},
      h('td', { text: r.name }),
      h('td', { class: 'num', text: String(r.votes) }),
      h('td', { class: 'muted small', text: r.voters.join('、') }),
    ));
    const voteTable = h('table', { class: 'score-table' },
      h('thead', {}, h('tr', {},
        h('th', { text: '被投票的人' }), h('th', { text: '票数' }), h('th', { text: '投票者' }))),
      h('tbody', {}, ...voteRows),
    );
    wrap.append(h('div', { class: 'verdict' },
      h('div', { class: `vd-line ${right ? 'ok' : 'no'}`, text: right ? '✓ 你们指认了真正的凶手。' : '× 你们指错了人。' }),
      voteTable,
    ));
  }

  wrap.append(section('发生了什么', t.summary?.map((p) => h('p', { text: p }))));
  wrap.append(section('推理链', (t.chain || []).map((c) => h('div', { class: 'chain-card' },
    h('h4', { text: c.title }), h('p', { text: c.text })))));

  if (t.motive) wrap.append(section('动机', [h('p', { text: t.motive })]));
  if (t.epilogue) wrap.append(section('尾声', t.epilogue.map((p) => h('p', { text: p }))));

  const ranked = [...S.players].sort((a, b) => b.score - a.score);
  wrap.append(section('本局积分', [h('table', { class: 'score-table' },
    h('thead', {}, h('tr', {}, h('th', { text: '玩家' }), h('th', { text: '角色' }), h('th', { text: '线索' }), h('th', { text: '积分' }))),
    h('tbody', {}, ...ranked.map((p) => h('tr', {},
      h('td', { text: p.name + (p.isMe ? '（你）' : '') }),
      h('td', { text: S.cast.find((c) => c.id === p.roleId)?.name || '—' }),
      h('td', { class: 'num', text: String(p.clueCount) }),
      h('td', { class: 'num', text: String(p.score) })))))]));

  return h('div', { class: 'stage-panel' }, h('div', { class: 'stage-body' }, wrap));

  function section(title, kids) {
    return h('div', { class: 'reveal-sec' }, h('h3', { text: title }), ...kids);
  }
}

/* ── 主持人面板 ───────────────────────────────────── */
const PHASE_KIND = {
  story: '剧情', search: '搜证', discuss: '讨论',
  node: '解谜', vote: '投票', reveal: '揭晓',
};

function hostStat(k, v, suffix) {
  return h('div', { class: 'host-stat' },
    h('div', { class: 'hs-k', text: k }),
    h('div', { class: 'hs-v' }, v, suffix ? h('small', { text: suffix }) : null));
}

function openHostPanel() {
  const solved = S.nodeStates.filter((n) => n.solved).length;
  const npcs = S.hostNotes || [];
  const isLast = S.phase.index >= S.phase.total - 1;

  const top = h('div', { class: 'host-top' },
    h('button', { class: 'code-chip', text: `房号 ${S.code}　点击复制`, onclick: () => copyCode() }),
    h('button', {
      class: 'btn btn-primary',
      text: isLast ? '已经是最后一个阶段' : (S.phase.kind === 'vote' ? '揭晓真相 ▶' : '推进到下一阶段 ▶'),
      disabled: isLast,
      onclick: () => { closeModal(); nextPhase(); },
    }),
    h('span', { class: 'muted small', text: '往届阶段可以重复进入，已经搜到的线索不会丢。' }));

  const stats = h('div', { class: 'host-stats' },
    hostStat('当前阶段', `${S.phase.index + 1}`, ` / ${S.phase.total}`),
    hostStat('已公开线索', String(S.revealed.length), ' 张'),
    hostStat('解谜进度', `${solved}`, ` / ${S.nodeStates.length}`),
    hostStat('已投票', `${S.vote.submitted}`, ` / ${S.vote.total}`),
    hostStat('无主角色', String(npcs.length), ' 个'));

  // 阶段列表：类型已经在每行右侧标出来了，不用再按类型分组（会切得稀碎）
  const list = h('div', {}, ...S.phaseList.map((p, i) => {
    const now = i === S.phase.index;
    return h('button', {
      class: `host-row ${now ? 'now' : ''} ${i < S.phase.index ? 'past' : ''}`,
      disabled: now,
      onclick: () => { socket.emit('game:setPhase', { index: i }); closeModal(); },
    },
      h('span', { class: 'hr-no', text: String(i + 1) }),
      h('span', { class: 'hr-main' },
        h('span', { class: 'hr-name', text: p.name }),
        p.hint ? h('span', { class: 'hr-hint', text: p.hint }) : null),
      now ? h('span', { class: 'hr-now', text: '← 现在' }) : null,
      h('span', { class: 'hr-kind', text: PHASE_KIND[p.kind] || p.kind }));
  }));

  const body = h('div', { class: 'host-panel' },
    top,
    stats,
    h('div', { class: 'host-sec-title', text: '阶段' }),
    list,
  );

  if (npcs.length) {
    body.append(
      h('div', { class: 'host-sec-title', text: '无人扮演的角色' }),
      h('p', { class: 'muted small', style: { marginTop: 0 }, text: '他们的剧本只有你能看。必要时替他们提供信息、替他们发言。' }),
      ...npcs.map((r) => h('div', { class: 'host-npc' },
        h('span', { class: 'hn-role', text: r.name }),
        h('span', { class: 'muted small', text: r.title }))),
      h('button', {
        class: 'btn', style: { marginTop: '10px' }, text: '在左侧「我的剧本」里查看他们的本子',
        onclick: () => { closeModal(); activateTab('script'); },
      }),
    );
  }

  openModal(body, { head: '主持人面板', cls: 'host-box' });
}

function copyCode() {
  const code = S?.code;
  if (!code) return;
  navigator.clipboard?.writeText(code)
    .then(() => toast(`房号 ${code} 已复制`, 'good'))
    .catch(() => toast(`房号是 ${code}`, 'info'));
}

function nextPhase() {
  // 投票阶段提前揭晓要确认，别让人手滑跳过投票
  if (S?.phase.kind === 'vote' && !S.vote.allVoted) return confirmReveal(false);
  socket.emit('game:nextPhase');
}
$('#btn-next-phase').onclick = nextPhase;
$('#btn-host').onclick = () => openHostPanel();

/* ══════════ 侧栏标签页 ══════════ */
/* 左右两块面板各有一组 tab，按 data-tab 切到同名的 tab-pane */
function wireTabs() {
  for (const bar of $$('.tabs')) {
    const panel = bar.closest('.panel') || bar.parentElement;
    for (const tab of $$('.tab', bar)) {
      tab.onclick = () => {
        for (const t of $$('.tab', bar)) t.classList.toggle('active', t === tab);
        for (const pane of $$('.tab-pane', panel)) {
          pane.classList.toggle('active', pane.id === `tab-${tab.dataset.tab}`);
        }
      };
    }
  }
}
wireTabs();

function activateTab(name) {
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  tab?.click();
  return tab;
}

/* ══════════ 麦克风状态圆点 ══════════ */
function micDotEl(on, speaking, who) {
  const state = on ? (speaking ? '正在说话' : '麦克风已开') : '麦克风未开';
  return h('span', {
    class: `mic-dot ${on ? 'on' : 'off'} ${on && speaking ? 'speaking' : ''}`,
    title: `${who || ''} ${state}`.trim(),
  });
}

/** 本地玩家的麦克风以 voice.enabled 为准（比服务端回包更即时） */
function micDot(p) {
  const on = p.isMe ? !!voice?.enabled : !!p.micOn;
  const speaking = p.isMe ? (voice?.level || 0) > 0.045 : !!voice?.isSpeaking(p.id);
  return micDotEl(on, speaking, p.name);
}

/* ══════════ 语音条 ══════════ */
function paintVoiceStrip() {
  const strip = $('#voice-strip');
  if (!strip || !S) return;
  strip.innerHTML = '';
  if (!voice?.enabled) {
    strip.append(h('span', { class: 'voice-hint', text: '点右上角「开麦」加入语音。五个人一起推理，还是说话最快。' }));
    return;
  }
  const me = S.players.find((p) => p.isMe);
  const onMic = 1 + S.players.filter((p) => !p.isMe && p.micOn).length;
  strip.append(h('span', { class: 'voice-label' },
    '语音室', h('b', { text: `${onMic} 人在麦上` })));

  strip.append(h('div', { class: `vp me ${(voice.level || 0) > 0.045 ? 'speaking' : ''}` },
    h('span', { text: `你（${me?.name || ''}）` }),
    micDotEl(true, (voice.level || 0) > 0.045, me?.name)));

  for (const p of S.players) {
    if (p.isMe) continue;
    const c = S.cast.find((x) => x.id === p.roleId);
    const connected = voice.peers.has(p.id);
    strip.append(h('div', { class: `vp ${connected ? '' : 'pending'} ${voice.isSpeaking(p.id) ? 'speaking' : ''}` },
      h('span', { text: c ? c.name : p.name }),
      c ? h('span', { class: 'vp-role', text: p.name }) : null,
      micDot(p),
      connected ? null : h('span', { class: 'vp-state', text: p.micOn ? '连接中…' : '未开麦' })));
  }
}

function refreshSpeaking() {
  if (!S) return;
  const now = Date.now();
  if (now - (refreshSpeaking._t || 0) < 260) return;   // 音量变化很频繁，节流一下
  refreshSpeaking._t = now;
  // 大厅里只更新玩家列表的麦克风标记，避免整页重绘
  if (isBookOpen()) refreshBookMics(S);
  if ($('#screen-lobby').classList.contains('active')) { paintLobbyPlayers(); return; }
  if (!$('#screen-game').classList.contains('active')) return;
  paintVoiceStrip();
  // 讨论页的人名卡也同步高亮，避免整块重绘
  for (const el of $$('.people-row .pc')) {
    el.classList.toggle('live', voice?.isSpeaking(el.dataset.pid));
  }
}

/* ══════════ 聊天 ══════════ */
function paintChat() {
  const log = $('#chat-log');
  log.innerHTML = '';
  for (const m of S?.chat || []) log.append(chatLine(m));
  log.scrollTop = log.scrollHeight;
}
function chatLine(m) {
  if (m.sys) return h('div', { class: 'chat-msg sys', text: m.text });
  return h('div', { class: 'chat-msg' },
    h('span', { class: 'cm-who', text: m.from }),
    m.roleName ? h('span', { class: 'cm-role', text: m.roleName }) : null,
    h('span', { text: m.text }));
}
function appendChat(m) {
  const log = $('#chat-log');
  if (!log) return;
  log.append(chatLine(m));
  log.scrollTop = log.scrollHeight;
  if (!chatOpen && !m.sys) {
    unread += 1;
    const b = $('#chat-unread');
    b.textContent = unread;
    b.classList.add('show');
  }
}

$('#btn-chat-toggle').onclick = () => {
  chatOpen = !chatOpen;
  $('#chat-drawer').classList.toggle('open', chatOpen);
  if (chatOpen) {
    unread = 0;
    $('#chat-unread').classList.remove('show');
    $('#chat-input').focus();
  }
};
$('#chat-form').onsubmit = (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat:send', { text });
  input.value = '';
};

/* ══════════ 语音按钮 ══════════ */
$('#btn-voice').onclick = toggleVoice;
$('#btn-lobby-mic').onclick = toggleVoice;

async function toggleVoice() {
  if (!voice) {
    voice = new Voice(socket);
    voice.onChange = () => { refreshSpeaking(); paintVoiceButton(); };
  }
  try {
    const on = await voice.toggle();
    toast(on ? '麦克风已开，其他人能听见你了' : '麦克风已关', on ? 'good' : 'info');
  } catch (err) {
    toast(err.message || '打不开麦克风', 'warn');
  }
  paintVoiceButton();
  if (S) paintVoiceStrip();
}

function paintVoiceButton() {
  const on = !!voice?.enabled;
  $('#voice-label').textContent = on ? '关麦' : '开麦';
  $('#btn-voice').classList.toggle('on', on);
  $('#btn-lobby-mic').classList.toggle('on', on);
  $('#btn-lobby-mic').textContent = on ? '🎙 麦克风已开' : '🎙 语音测试';
}

/* ══════════ 阶段推进提示 ══════════ */
socket.on('phase', ({ name, kind }) => {
  timerId && clearInterval(timerId);
  timerId = 0;
  timerLeft = 0;
  toast(`—— ${name} ——`, 'info');
  if (kind === 'discuss') toast('讨论阶段：说话就行，不用等谁', 'info');
});

socket.on('node:solved', ({ title }) => {
  toast(`✓ ${title} 解开了`, 'good', 5000);
});

socket.on('vote:complete', () => {
  toast('所有人都投完了，正在揭晓真相…', 'good', 3000);
});

socket.on('clue:revealed', ({ clue, by }) => {
  toast(`${by} 公开了线索：${clue.name}`, 'info');
});

socket.on('node:progress', ({ type, by, wrong }) => {
  if (!wrong) return;
  const what = { code: '输了一组密码，不对', wire: '连错了一组', order: '时间线排错了' }[type] || '试了一次';
  toast(`${by} ${what}`, 'warn', 2600);
});

socket.on('toast', ({ text, kind }) => toast(text, kind));

socket.on('chat:new', (m) => appendChat(m));

/* ══════════ 状态同步 ══════════ */
socket.on('state', (state) => {
  const wasStarted = S?.started;
  const roomChanged = state.code && state.code !== currentCode;
  if (roomChanged) {
    currentCode = state.code;
    voice?.reannounce();   // 换房间后重新登记麦克风状态
    closeBook();           // 换局了就把上一局的本子合上
  }
  const prevChapters = S?.me?.script?.length || 0;
  S = state;
  // 新章节解锁时提醒一下，免得忘了翻本子
  if (state.started && state.me.script.length > prevChapters && prevChapters > 0) {
    const fresh = state.me.script[state.me.script.length - 1];
    toast(`新章节解锁：${fresh.title}`, 'good', 6000);
  }
  if (isBookOpen()) refreshBook(S);

  if (!state.started) {
    show('screen-lobby');
    paintLobby();
    paintChat();
    return;
  }

  show('screen-game');
  if (!wasStarted) toast('游戏开始，先读你的第一章', 'good', 5000);
  paintGame();
  paintChat();
  paintVoiceButton();
});

socket.on('disconnect', () => toast('和服务器断开了，正在重连…', 'warn'));
socket.on('connect', () => { if (S?.code) socket.emit('sync'); });

// 座位被另一个连接接管（例如在别处打开了同一个房间）
socket.on('room:kicked', () => {
  voice?.disable();
  closeBook();
  S = null;
  destroyGame();
  closeModal();
  show('screen-home');
  toast('这个座位已经在别处打开了，你被移出了房间', 'warn', 6000);
});

/* ══════════ 离开 ══════════ */
function leave() {
  voice?.disable();
  closeBook();
  socket.emit('room:leave');
  S = null;
  destroyGame();
  show('screen-home');
  $('#input-code').value = '';
}
$('#btn-leave-1').onclick = leave;
$('#btn-leave-2').onclick = () => {
  if (confirm('退出之后就是你自己的事了，确定？')) leave();
};

/* ══════════ 快捷键 ══════════ */
document.addEventListener('keydown', (e) => {
  if (isModalOpen() || isBookOpen() || /input|textarea/i.test(e.target.tagName)) return;
  if (e.key === 'm' || e.key === 'M') toggleVoice();
  if (e.key === 'c' || e.key === 'C') $('#btn-chat-toggle').click();
});
