/**
 * 三人本《光明照相馆》端到端自测：三个客户端跑完整局，
 * 并验证多剧本机制（两本剧本互不串数据、按 castSize 限制人数）。
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
  const c = { s, name, state: null, events: [] };
  s.on('state', (st) => { c.state = st; });
  s.on('node:solved', (e) => c.events.push(['solved', e]));
  s.on('toast', (e) => c.events.push(['toast', e]));
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

/* ── 剧本清单 ────────────────────────────────────── */
const list = await fetch(URL + '/api/scenarios').then((r) => r.json());
check(list.scenarios.length >= 2, `服务端有多本剧本（实际 ${list.scenarios.length}）`);
const studio = list.scenarios.find((s) => s.id === 'studio');
check(!!studio && studio.castSize === 3, '三人本《光明照相馆》在清单里');
check(studio.roomCount === 5 && studio.clueTotal === 17, `三人本：5 个地点 17 张线索（实际 ${studio.roomCount}/${studio.clueTotal}）`);
check(studio.cast.map((c) => c.name).join('/') === '周晓棠/许青/康福', '三人本角色正确');

/* ── 建房：指定三人本 ───────────────────────────── */
const A = await mk('阿甲');
const created = await call(A, 'room:create', { name: '阿甲', scenarioId: 'studio', access: ACCESS });
await until(() => !!A.state);
check(created.ok, '建房成功');
const code = created.code;
check(A.state.scenario.title.includes('光明照相馆'), `房间用的是三人本（${A.state.scenario.title}）`);
check(A.state.scenario.castSize === 3, '开局人数上限是 3');
check(A.state.scenario.id === 'studio', '状态里带上了剧本 id');

const B = await mk('阿乙');
const C = await mk('阿丙');
await call(B, 'room:join', { code, name: '阿乙', access: ACCESS });
await call(C, 'room:join', { code, name: '阿丙', access: ACCESS });
await until(() => A.state.players.length === 3);
check(A.state.players.length === 3, '三个人都在房里');

// 第四个人进不来
const D = await mk('阿丁');
const dRes = await call(D, 'room:join', { code, name: '阿丁', access: ACCESS });
check(!dRes.ok && dRes.error.includes('3 人本'), `第四个人被挡在外面：${dRes.error}`);

/* ── 选角 ────────────────────────────────────────── */
fire(A, 'lobby:pickRole', { roleId: 'zhouxiaotang' });
fire(B, 'lobby:pickRole', { roleId: 'xuqing' });
fire(C, 'lobby:pickRole', { roleId: 'kangfu' });
await until(() => A.state.me.roleId === 'zhouxiaotang' && C.state.me.roleId === 'kangfu');
check(C.state.me.roleId === 'kangfu', '阿丙拿到凶手角色康福');

/* ── 剧本与任务 ──────────────────────────────────── */
const brief = C.state.me.role.brief;
check(!!brief, '角色带任务简报');
check(brief.tasks.length >= 5, `任务清单有 ${brief.tasks.length} 条`);
check(brief.tasks.every((t) => t.phase && t.when && t.what), '每条任务都锚定了阶段');
check(typeof brief.win === 'string' && brief.win.length >= 6, `写清了赢的条件：${brief.win}`);
check(brief.hide.length === 4, `要瞒住 ${brief.hide.length} 件事`);
check(C.state.me.locked.length === 3, '没解锁的章节带解锁阶段信息');
check(C.state.me.locked.every((l) => l.unlockPhase), `锁定章节标注了解锁时机：${C.state.me.locked[0].unlockPhase}`);

/* ── 开始 ────────────────────────────────────────── */
fire(A, 'game:start');
await until(() => A.state.started);
check(A.state.phase.id === 'prologue', '第一幕是序章');
check(A.state.phaseList.length === 12, `三人本共 ${A.state.phaseList.length} 个阶段`);
check(A.state.rooms.length === 5, '平面图上有 5 个地点');
check(A.state.rooms.reduce((n, r) => n + r.total, 0) === 17, '7 个地点共 17 张线索');

/* ── 地图节点 ────────────────────────────────────── */
fire(A, 'game:nextPhase');
await until(() => A.state.phase.id === 'tour');
check(A.state.node?.type === 'map', '进入照相馆探索节点');
for (const r of A.state.rooms) {
  A.s.emit('node:visit', { nodeId: 'tour', roomId: r.id });
  C.s.emit('node:visit', { nodeId: 'tour', roomId: r.id });
  await wait(30);
}
await until(() => A.state.node?.solved);
check(A.state.node.solved, '走遍 5 个房间后完成');
check(A.state.me.clues.some((c) => c.id === 'e_smell'), '拿到「暗房外的气味」这条关键环境线索');
check(A.state.revealed.some((c) => c.id === 'e_smell'), '环境线索直接进了公开线索');

/* ── 搜证 ────────────────────────────────────────── */
fire(A, 'game:nextPhase');
await until(() => A.state.phase.kind === 'search');
const s1 = await call(A, 'search:room', { roomId: 'darkroom' });
check(s1.ok, `在暗房搜到「${s1.clue?.name}」`);
const s2 = await call(A, 'search:room', { roomId: 'storeroom' });
check(s2.ok, '第二次搜证成功');
for (let i = 0; i < (A.state.phase.ap - 2); i++) await call(A, 'search:room', { roomId: 'backyard' });
const s3 = await call(A, 'search:room', { roomId: 'backyard' });
check(!s3.ok, '行动力用完就搜不动了');
const spent = A.state.me.clues.find((c) => !c.id.startsWith('e_'));
await call(A, 'clue:reveal', { clueId: spent.id });
await until(() => C.state.revealed.some((c) => c.id === spent.id));
check(C.state.revealed.some((c) => c.id === spent.id), '公开的线索队友能看到');

/* ── 密码节点：1975 ─────────────────────────────── */
fire(A, 'game:nextPhase');   // discuss1
await until(() => A.state.phase.kind === 'discuss');
check(B.state.me.script.length === 2, '讨论阶段解锁第二章');
fire(A, 'game:nextPhase');   // safe
await until(() => A.state.node?.type === 'code');
check(A.state.node.length === 4, '储物柜是四位密码');
const wrongCode = await call(A, 'node:submit', { nodeId: 'safe', payload: { value: '1987' } });
check(!wrongCode.ok, '错误年份 1987 打不开');
await call(C, 'node:submit', { nodeId: 'safe', payload: { value: '1975' } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '正确答案 1975 打开储物柜');
check(A.state.revealed.some((c) => c.id === 'n_letter'), '拿到那封没寄出的信');

/* ── 显影节点（新类型） ─────────────────────────── */
fire(A, 'game:nextPhase');   // search2
await until(() => A.state.phase.kind === 'search');
check(A.state.me.ap === A.state.phase.ap, '第二轮重新发行动力');
fire(A, 'game:nextPhase');   // develop
await until(() => A.state.node?.type === 'develop');
const dev = A.state.node;
check(dev.baths.length === 3, '三只药盘');
check(dev.times.length === 3, '三个时间选项');
check(!('answerTime' in dev), '不下发正确答案时间');
check(dev.baths.every((b) => typeof b.i === 'number'), '药盘带原始序号（客户端据此提交顺序）');
const layoutBefore = JSON.stringify(dev.baths.map((b) => b.i));
await wait(300);
check(JSON.stringify(A.state.node.baths.map((b) => b.i)) === layoutBefore, '刷新状态不会重新洗牌药盘');

// 服务端认的正确答案永远是原始下标顺序 [0,1,2]；
// 错的那组用一个轮换，保证不可能等于正序（不要拿打乱后的数组去反推，
// 洗牌恰好是"交换前两个"时反推出来的"错误顺序"会正好是正确答案）。
const wrongOrder = [1, 2, 0];
const r1 = await call(A, 'node:submit', { nodeId: 'develop', payload: { order: wrongOrder, time: 570 } });
check(!r1.ok && r1.orderOk === false, '工序顺序错了会被指出来');
const r2 = await call(A, 'node:submit', { nodeId: 'develop', payload: { order: [0, 1, 2], time: 120 } });
check(!r2.ok && r2.orderOk === true && r2.timeOk === false, '顺序对了但时间不对，会单独提示时间');
await call(B, 'node:submit', { nodeId: 'develop', payload: { order: [0, 1, 2], time: 570 } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '工序与时间都对，显影成功');
check(A.state.revealed.some((c) => c.id === 'n_b1975'), '洗出 B-1975 那张照片');

/* ── 时间线 ──────────────────────────────────────── */
fire(A, 'game:nextPhase');   // discuss2
await until(() => A.state.phase.kind === 'discuss');
check(C.state.me.script.length === 3, '第二轮讨论解锁第三章');
fire(A, 'game:nextPhase');   // timeline
await until(() => A.state.node?.type === 'order');
check(A.state.node.cards.length === 8, '时间线 8 张卡');
await call(A, 'node:submit', { nodeId: 'timeline', payload: { order: [0, 1, 2, 3, 4, 5, 6, 7] } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '按顺序排好后解开');

/* ── 投票与揭晓 ──────────────────────────────────── */
fire(A, 'game:nextPhase');   // final
await until(() => A.state.phase.kind === 'discuss');
check(C.state.me.script.length === 4, '最终陈述解锁第四章');
fire(A, 'game:nextPhase');   // vote
await until(() => A.state.phase.kind === 'vote');
check(A.state.vote.total === 3, '应投票人数是 3');
await call(A, 'vote:cast', { roleId: 'kangfu' });
await call(B, 'vote:cast', { roleId: 'kangfu' });
await call(C, 'vote:cast', { roleId: 'zhouxiaotang' });
const autoReveal = await until(() => A.state.phase.kind === 'reveal', 8000);
check(autoReveal, '三人投完自动揭晓');
const t = A.state.truth;
check(t.killer === 'kangfu', '凶手是康福');
check(t.killerName === '康福', '真相里写明了凶手名字');
check(t.chain.length === 6, `推理链 ${t.chain.length} 步`);
check(t.summary.length >= 8, `案情叙述 ${t.summary.length} 段`);
check(A.state.vote.tally.correct === true, '2:1 多数指认康福 → 判定正确');
check(A.state.vote.tally.rows.length === 3, '票数统计覆盖三个角色');

/* ── 两本剧本互不串数据 ──────────────────────────── */
const W = await mk('阿戊');
const w = await call(W, 'room:create', { name: '阿戊', scenarioId: 'wuyin', access: ACCESS });
await until(() => !!W.state);
check(w.ok && W.state.scenario.castSize === 5, '另一间房开的是五人本');
check(W.state.scenario.title.includes('雾隐山庄'), '五人本标题正确');
check(W.state.rooms.length === 7, '五人本 7 个地点');
check(W.state.phaseList.length === 13, '五人本 13 个阶段');
const leak = JSON.stringify(W.state).includes('照相馆') || JSON.stringify(W.state).includes('康福');
check(!leak, '五人本的状态里没有混进三人本的内容');
const leak2 = JSON.stringify(A.state).includes('雾隐山庄');
check(!leak2, '三人本的状态里没有混进五人本的内容');
check(A.state.rooms.length === 5 && W.state.rooms.length === 7, '两间房各自维护自己的房间池');

/* ── 不存在的剧本 id 会退回默认本 ────────────────── */
const E = await mk('阿己');
const e = await call(E, 'room:create', { name: '阿己', scenarioId: 'nonexistent', access: ACCESS });
await until(() => !!E.state);
check(e.ok && !!E.state.scenario.id, `未知剧本 id 退回默认本（${E.state.scenario.id}）`);

console.log('');
console.log(failures === 0 ? '  全部通过 ✅' : `  ${failures} 项失败 ❌`);
for (const c of [A, B, C, D, W, E]) c.s.close();
process.exit(failures === 0 ? 0 : 1);
