/**
 * 端到端自测：两个客户端跑完整局流程（创建 → 选角 → 开始 → 搜证 → 公开 →
 * 每个解谜节点 → 投票 → 揭晓），并断言服务端的行为。
 * 用完即弃的测试脚本，不属于游戏运行时。
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
  s.on('clue:revealed', (e) => c.events.push(['revealed', e]));
  s.on('toast', (e) => c.events.push(['toast', e]));
  s.on('connect', () => resolve(c));
});

const call = (c, ev, payload) => new Promise((r) => c.s.emit(ev, payload, r));
const fire = (c, ev, payload) => c.s.emit(ev, payload);   // 无 ack 的事件
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 2500) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await wait(40); }
  return false;
};

const A = await mk('阿甲');
const B = await mk('阿乙');
const C = await mk('阿丙');

/* ── 建房 / 加入 ─────────────────────────────────── */
const created = await call(A, 'room:create', { name: '阿甲', scenarioId: 'wuyin', access: ACCESS });
await until(() => !!A.state);
check(created.ok && /^[A-Z0-9]{4}$/.test(created.code), `建房成功，房号 ${created.code}`);
check(A.state.scenario.id === 'wuyin', `开的是五人本《${A.state.scenario.title}》`);
check(A.state.scenario.castSize === 5, '人数上限 5');
const code = created.code;

const joined = await call(B, 'room:join', { code, name: '阿乙', access: ACCESS });
check(joined.ok, '第二个玩家加入成功');
const joinedC = await call(C, 'room:join', { code, name: '阿丙', access: ACCESS });
check(joinedC.ok, '第三个玩家加入成功');

const badJoin = await call(B, 'room:join', { code: 'ZZZZ', name: 'x' });
check(!badJoin.ok, '错误的房号被拒绝');

/* ── 选角 ────────────────────────────────────────── */
fire(A, 'lobby:pickRole', { roleId: 'shenmo' });
fire(B, 'lobby:pickRole', { roleId: 'linxue' });
fire(C, 'lobby:pickRole', { roleId: 'suyang' });
await until(() => A.state?.me.roleId === 'shenmo' && B.state?.me.roleId === 'linxue' && C.state?.me.roleId === 'suyang');
check(A.state.me.roleId === 'shenmo', '玩家甲选到沈墨');
check(B.state.me.roleId === 'linxue', '玩家乙选到林雪');
check(C.state.me.roleId === 'suyang', '玩家丙选到苏漾');

// 抢已经被选走的角色
fire(A, 'lobby:pickRole', { roleId: 'linxue' });
await wait(200);
check(A.state.me.roleId === 'shenmo', '不能抢别人已经选走的角色');

/* ── 剧本可见性 ──────────────────────────────────── */
const shenmoCh1 = A.state.me.script.map((c) => c.title);
check(shenmoCh1.length === 1, `开局只解锁第一章（实际 ${shenmoCh1.length} 章）`);
check(A.state.me.script[0].body.join('').includes('沈墨'), '甲的剧本里是沈墨的内容');
check(!A.state.me.script.some((c) => c.body.join('').includes('林小雨')), '甲看不到乙的剧本内容');
check(!JSON.stringify(A.state).includes('乌头碱粗提物'), '状态里没有泄露密室答案');

/* ── 开始 ────────────────────────────────────────── */
fire(A, 'game:start');
await until(() => A.state.started && B.state.started);
check(A.state.phase.id === 'prologue', '第一幕是序章');
check(A.state.phase.kind === 'story', '序章是剧情阶段');

/* 非房主不能推进阶段 */
const notHost = await call(B, 'game:nextPhase', {});
await wait(200);
check(B.state.phase.id === 'prologue', '非房主推不动阶段');
check(!notHost.ok && notHost.error.includes('主持人'), '非房主推进被点名拒绝');

/* ── 全员准备闸门 ───────────────────────────────── */
check(A.state.readyCheck?.active === true, '这一幕有「全员准备」闸门');
check(A.state.readyCheck.total === 3 && A.state.readyCheck.submitted === 0, '开局 0/3 人准备');
check(A.state.readyCheck.mine === false, '房主自己也在准备名单里');

let gate = await call(A, 'game:nextPhase', {});
check(!gate.ok && gate.error.includes('没准备'), '没人准备时，房主也推不动下一幕');
check(gate.total === 3 && gate.submitted === 0, '拒绝时把准备情况一并回了（2/3 那种计数）');

fire(B, 'phase:ready');
await until(() => A.state.readyCheck.submitted === 1);
check(A.state.readyCheck.submitted === 1, '阿乙点了准备 → 1/3');

fire(C, 'phase:ready');
await until(() => A.state.readyCheck.submitted === 2);
check(A.state.readyCheck.submitted === 2, '阿丙也点了 → 2/3');
check(A.state.readyCheck.allReady === false, '2/3 时闸门还没开');

gate = await call(A, 'game:nextPhase', {});
check(!gate.ok, '还差房主自己，依然推不动');

fire(B, 'phase:ready', { ready: false });
await until(() => A.state.readyCheck.submitted === 1);
check(A.state.readyCheck.submitted === 1, '阿乙撤销准备 → 退回 1/3');

fire(B, 'phase:ready');
await until(() => A.state.readyCheck.submitted === 2);
fire(A, 'phase:ready');
await until(() => A.state.readyCheck.allReady, 1500);
check(A.state.readyCheck.allReady && A.state.readyCheck.submitted === 3, '三人都准备 → 3/3');

/* ── 节点 1：山庄探索 ───────────────────────────── */
await until(() => A.state.phase.id === 'tour', 4000);
check(A.state.phase.id === 'tour', '全员准备后自动进入下一幕');
check(A.state.readyCheck.submitted === 0, '新一幕的准备状态清零');
check(A.state.node?.type === 'map', '进入地图节点');
check(A.state.node.answer === undefined, '地图节点不下发答案字段');

const roomIds = A.state.rooms.map((r) => r.id);
for (const rid of roomIds) {
  A.s.emit('node:visit', { nodeId: 'tour', roomId: rid });
  B.s.emit('node:visit', { nodeId: 'tour', roomId: rid });
  await wait(30);
}
await until(() => A.state.node?.solved);
check(A.state.node.solved, '走遍全部房间后地图节点自动完成');
check(A.state.me.clues.some((c) => c.id === 'e_dark'), '地图奖励线索已到手');
check(A.state.revealed.some((c) => c.id === 'e_bridge'), '环境线索直接进公开线索区');

/* ── 搜证 ────────────────────────────────────────── */
fire(A, 'game:nextPhase', { force: true });
await until(() => A.state.phase.kind === 'search');
check(A.state.me.ap === A.state.phase.ap, `搜证阶段发放 ${A.state.me.ap} 点行动力`);

const r1 = await call(A, 'search:room', { roomId: 'parlor' });
check(r1.ok && r1.clue, `抽到线索「${r1.clue?.name}」`);
check(r1.ap === A.state.phase.ap - 1, `行动力扣了 1 点（剩 ${r1.ap}）`);

const r2 = await call(A, 'search:room', { roomId: 'study' });
check(r2.ok, '第二次搜证成功');
const r3 = await call(A, 'search:room', { roomId: 'garden' });
if (A.state.phase.ap <= 2) check(!r3.ok && r3.error.includes('行动力'), '行动力用完就被拦住');
else check(r3.ok, '行动力够就还能继续搜');

// 抽干一个房间
const parlorLeft = A.state.rooms.find((r) => r.id === 'parlor').remaining;
log(`会客厅还剩 ${parlorLeft} 张`);

/* 公开线索 */
const mine = A.state.me.clues.find((c) => !c.id.startsWith('e_'));
const rev = await call(A, 'clue:reveal', { clueId: mine.id });
check(rev.ok, `公开线索「${mine.name}」成功`);
await until(() => B.state.revealed.some((c) => c.id === mine.id));
check(B.state.revealed.some((c) => c.id === mine.id), '乙能看到甲公开的线索');
check(B.state.me.clues.every((c) => c.id !== mine.id), '公开的线索不会复制进别人的手牌（走公共线索区）');

// 公开自己没有的线索
const rev2 = await call(B, 'clue:reveal', { clueId: 'p_ash' });
check(!rev2.ok, '不能公开自己没有的线索');

/* 私下转交 */
const beforeB = B.state.me.clues.length;
const giveTarget = A.state.players.find((p) => !p.isMe);
const give = await call(A, 'clue:give', { clueId: 'e_people', toPlayerId: giveTarget.id });
await until(() => B.state.me.clues.length > beforeB);
check(give.ok, '私下转交线索成功');

/* ── 节点 2：保险柜密码锁 ───────────────────────── */
fire(A, 'game:nextPhase', { force: true });   // discuss1
await until(() => A.state.phase.kind === 'discuss');
check(B.state.me.script.length === 2, '讨论阶段解锁第二章');

fire(A, 'game:nextPhase', { force: true });   // safe
await until(() => A.state.node?.type === 'code');
check(A.state.node.length === 4, '密码锁是四位');
check(A.state.node.answer === undefined, '密码锁不下发答案');
check(A.state.node.hint === null, '一开始不给提示');

const wrong = await call(A, 'node:submit', { nodeId: 'safe', payload: { value: '1234' } });
check(!wrong.ok, '错误密码被拒绝');
await until(() => A.state.node.attempts >= 1);
check(A.state.node.attempts === 1, '记录了失败次数');

await call(B, 'node:submit', { nodeId: 'safe', payload: { value: '0812' } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '正确密码 0812 解开了保险柜');
check(A.state.revealed.some((c) => c.id === 'n_will'), '真遗嘱进入公开线索');
check(A.state.me.clues.some((c) => c.id === 'n_stamp'), '铜印名单也到手了');

// 已解开的节点不能再提交
const again = await call(A, 'node:submit', { nodeId: 'safe', payload: { value: '0812' } });
check(!again.ok && again.solved, '解开的节点不能重复提交');

/* ── 节点 3：药箱连线 ───────────────────────────── */
fire(A, 'game:nextPhase', { force: true });   // search2
await until(() => A.state.phase.kind === 'search');
check(A.state.me.ap === A.state.phase.ap, '第二轮搜证重新发放行动力');
fire(A, 'game:nextPhase', { force: true });   // medbox
await until(() => A.state.node?.type === 'wire');
const wireNode = A.state.node;
check(wireNode.lefts.length === 6 && wireNode.rights.length === 6, '连线题左右各 6 项');
check(!('answer' in wireNode), '连线题不下发对应关系');

const layoutA = JSON.stringify(wireNode.lefts.map((l) => l.i));
await wait(300);
check(JSON.stringify(A.state.node.lefts.map((l) => l.i)) === layoutA, '刷新状态不会重新洗牌（布局已持久化）');

// 先故意连错两组
const wrongLinks = [[wireNode.lefts[0].i, wireNode.rights[0].i], [wireNode.lefts[1].i, wireNode.rights[1].i]];
const badRes = await call(A, 'node:submit', { nodeId: 'medbox', payload: { links: wrongLinks } });
check(!badRes.ok && Array.isArray(badRes.bad), '连错会返回错误的那几组');

// 正确连法
const rightLinks = wireNode.lefts.map((l) => [l.i, l.i]);
await call(A, 'node:submit', { nodeId: 'medbox', payload: { links: rightLinks } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '全部连对后药箱解开');
check(A.state.revealed.some((c) => c.id === 'n_missing'), '缺两支注射器的线索被公开');

/* ── 节点 4：时间线排序 ─────────────────────────── */
fire(A, 'game:nextPhase', { force: true });   // discuss2
await until(() => A.state.phase.kind === 'discuss');
check(B.state.me.script.length === 3, '第二轮讨论解锁第三章');
fire(A, 'game:nextPhase', { force: true });   // timeline
await until(() => A.state.node?.type === 'order');
const cards = A.state.node.cards;
check(cards.length === 8, '时间线有 8 张卡');
check(!cards.every((c, i) => c.i === i), '初始顺序是打乱的');

const shuffleAttempt = cards.slice().reverse().map((c) => c.i);
const badOrder = await call(A, 'node:submit', { nodeId: 'timeline', payload: { order: shuffleAttempt } });
if (cards.every((c, i) => c.i === 7 - i)) {
  check(true, '（跳过：反序恰好是正确顺序）');
} else {
  check(!badOrder.ok, '错误顺序被拒绝');
}
await call(A, 'node:submit', { nodeId: 'timeline', payload: { order: [0, 1, 2, 3, 4, 5, 6, 7] } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '时间线排对后解开');
check(A.state.revealed.some((c) => c.id === 'n_timeline'), '时间线线索被公开');

/* ── 节点 5：拼图 ───────────────────────────────── */
fire(A, 'game:nextPhase', { force: true });   // photo
await until(() => A.state.node?.type === 'slide');
check(A.state.node.image === '/api/art/family', '拼图下发图片地址而不下发答案');
await call(B, 'node:submit', { nodeId: 'photo', payload: { solved: true } });
await until(() => A.state.node?.solved);
check(A.state.node.solved, '拼图完成后节点解开');
check(A.state.revealed.some((c) => c.id === 'n_photo'), '修复后的全家福被公开');

/* ── 投票 ────────────────────────────────────────── */
fire(A, 'game:nextPhase', { force: true });   // final
await until(() => A.state.phase.kind === 'discuss');
fire(A, 'game:nextPhase', { force: true });   // vote
await until(() => A.state.phase.kind === 'vote');

const selfVote = await call(A, 'vote:cast', { roleId: 'shenmo' });
check(!selfVote.ok, '不能投自己');
// 乙扮演林雪，投自己也会被挡住
const killerSelf = await call(B, 'vote:cast', { roleId: 'linxue' });
check(!killerSelf.ok, '扮演凶手的人也不能投自己');

check(A.state.vote.allVoted === false, '有人没投时 allVoted 为 false');
check(A.state.vote.pending.length === 3, `三个人都还没投（实际 ${A.state.vote.pending.length}）`);

await call(A, 'vote:cast', { roleId: 'linxue' });
await until(() => A.state.vote.submitted === 1);
check(A.state.vote.tally === null, '投票过程中不泄露票数统计');
check(A.state.vote.mine === 'linxue', '甲能看到自己投了谁');
check(A.state.vote.pending.length === 2, '投完后待投名单减少');

await call(C, 'vote:cast', { roleId: 'linxue' });
await call(B, 'vote:cast', { roleId: 'suyang' });
await until(() => A.state.vote.allVoted);
check(A.state.vote.allVoted === true, '三人都投完后 allVoted 为 true');
check(A.state.vote.pending.length === 0, '没有待投的人');
check(A.state.vote.tally === null, '还没揭晓前依然不下发票数统计');

// 揭晓前可以改票
const revote = await call(B, 'vote:cast', { roleId: 'zhouguodong' });
check(revote.ok, '揭晓前可以改票');

// 所有人投完 → 服务端自动进入揭晓，不需要房主再点一次
const autoAdvanced = await until(() => A.state.phase.kind === 'reveal', 8000);
check(autoAdvanced, '全员投完后自动揭晓（无需手动推进）');

/* ── 揭晓 ────────────────────────────────────────── */
const t = A.state.truth;
check(!!t, '揭晓阶段下发真相');
check(t.killer === 'linxue', '凶手是林雪');
check(t.summary.length > 3 && t.chain.length >= 5, '真相包含完整叙事与推理链');
check(A.state.vote.tally.rows.length === 5, '票数统计覆盖全部角色');
check(A.state.vote.tally.killer === 'linxue', '统计里标出了真凶');
check(A.state.vote.tally.correct === true, '2/3 多数指认林雪 → 判定为指认正确');
check(A.state.vote.total === 3, '应投票人数 = 在线玩家数');
check(A.state.vote.tally.unanimous === false, '没有全票一致，unanimous 为 false');
check(A.state.vote.tally.rows[0].roleId === 'linxue' && A.state.vote.tally.rows[0].votes === 2, '票数统计第一行是林雪 2 票');
check(A.state.me.score > 0, `甲拿到积分 ${A.state.me.score}`);

/* ── 无人扮演的角色转入主持人手册 ───────────────── */
check(A.state.hostNotes?.length === 2, `2 个无人扮演的角色进入主持人手册（实际 ${A.state.hostNotes?.length}）`);
check(!B.state.hostNotes, '非房主看不到主持人手册');
const leak = JSON.stringify(B.state).includes('你叫周国栋');
check(!leak, '乙的状态里没有泄露无人扮演角色的剧本');

/* ── 线索池守恒 ──────────────────────────────────── */
const totalRemaining = A.state.rooms.reduce((n, r) => n + r.remaining, 0);
log(`全楼还剩 ${totalRemaining} 张线索未被翻出`);

console.log('');
console.log(failures === 0 ? '  全部通过 ✅' : `  ${failures} 项失败 ❌`);
A.s.close(); B.s.close(); C.s.close();
process.exit(failures === 0 ? 0 : 1);
