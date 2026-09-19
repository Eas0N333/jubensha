/**
 * 线索墙：把线索铺成一面卡墙，像卡牌游戏的卡组界面。
 *
 * 两页：我的线索 / 公开线索。墙上每张卡只露概要（图 + 名字 + 出处），
 * 点哪张才把那张放大、显示全文和「公开这张线索」。
 * 每次状态推送都会 refreshClueWall，所以抽到新卡、别人公开了线索都不用关掉重开。
 */

import { h, artUrl } from './ui.js';

let root = null;          // 覆盖层元素
let ctx = { state: null, onReveal: null, onGive: null };
let tab = 'mine';         // 'mine' | 'public'
let focusId = null;       // 放大显示的那张
let deck = [];            // 当前页的卡（每次 render 重算）

export const isClueWallOpen = () => !!root;

export function openClueWall(state, options = {}) {
  ctx = { ...ctx, ...options, state };
  if (!root) {
    root = h('div', { class: 'clue-wall' });
    document.body.append(root);
    document.addEventListener('keydown', onKey);
  }
  if (options.tab) tab = options.tab;
  focusId = options.focus || null;
  render();
}

export function closeClueWall() {
  if (!root) return;
  document.removeEventListener('keydown', onKey);
  root.remove();
  root = null;
  focusId = null;
}

export function refreshClueWall(state) {
  if (!root) return;
  ctx.state = state;
  render();
}

/* ── 渲染 ─────────────────────────────────────────── */
const isMine = (S, id) => S.me.clues.some((c) => c.id === id);
const isPublic = (S, id) => S.revealed.some((c) => c.id === id);

function render() {
  if (!root) return;
  const S = ctx.state;
  if (!S) return closeClueWall();

  deck = tab === 'mine' ? S.me.clues : S.revealed;
  // 手上的线索被公开后就不再是「我的」了；放大镜跟着卡片走
  if (focusId && !deck.some((c) => c.id === focusId)) focusId = null;

  root.classList.toggle('detail-open', !!focusId);
  root.replaceChildren(
    bar(S),
    h('div', { class: 'cw-scroll' },
      deck.length
        ? h('div', { class: 'cw-grid' }, ...deck.map((c, i) => card(c, i)))
        : h('p', { class: 'cw-empty', text: tab === 'mine'
            ? '还没有线索。到搜证阶段，在中间的地图上点房间抽取。'
            : '还没有人公开线索。把线索公开，全房间都能看到——这是全场最快的信息交换方式。' })),
    focusId ? detail(deck.find((c) => c.id === focusId)) : null,
    h('div', { class: 'cw-foot' },
      h('span', { class: 'cw-tip', text: focusId ? '← → 换一张，Esc 先收起这张卡' : '点开哪张，才看得到那张的全文' }),
      h('span', { class: 'cw-page', text: `共 ${deck.length} 张` })),
  );
}

function bar(S) {
  const mine = S.me.clues;
  const keyMine = mine.filter((c) => c.key).length;
  const left = S.keyLeft || { total: 0, byRoom: [] };
  const info = tab === 'mine'
    ? (left.total > 0
      ? `手上 ${mine.length} 张（◆ 关键 ${keyMine}）　·　这栋楼里还有 ${left.total} 张没被翻出来`
      : `手上 ${mine.length} 张（◆ 关键 ${keyMine}），楼里的线索已经被翻空了`)
    : `已公开 ${S.revealed.length} 张，全房间都能看到`;

  return h('header', { class: 'cw-bar' },
    h('span', { class: 'cw-mark', text: '证' }),
    h('div', { class: 'cw-tabs' },
      tabBtn('mine', '我的线索', mine.length),
      tabBtn('public', '公开线索', S.revealed.length)),
    h('div', { class: 'cw-info', text: info }),
    h('div', { class: 'cw-count' }, '手上 ',
      h('b', { text: String(mine.length) }), ' 张'),
    h('button', { class: 'cw-close', text: '合上 ✕', onclick: closeClueWall }));
}

function tabBtn(id, label, n) {
  return h('button', {
    class: `cw-tab ${tab === id ? 'active' : ''}`,
    onclick: () => { tab = id; focusId = null; render(); },
  }, label, h('span', { class: 'badge', text: String(n) }));
}

/** 墙上的卡：只有概要，不写正文 */
function card(c, i) {
  const S = ctx.state;
  const pub = isPublic(S, c.id);
  return h('div', {
    class: `cw-card ${c.key ? 'key' : ''} ${pub ? 'pub' : ''} ${c.id === focusId ? 'focus' : ''}`,
    'data-index': String(i),
    onclick: () => { focusId = c.id; render(); },
  },
    h('img', {
      src: artUrl(c.art), alt: c.name, loading: 'lazy',
      onerror: (e) => { e.target.remove(); },
    }),
    c.key ? h('span', { class: 'cw-tag', text: '◆ 关键' }) : null,
    pub ? h('span', { class: 'cw-pub', text: '已公开' }) : null,
    h('div', { class: 'cw-body' },
      h('div', { class: 'cw-name', text: c.name }),
      h('div', { class: 'cw-room', text: c.roomName || '' }),
      c.by ? h('div', { class: 'cw-by', text: `由 ${c.by} 公开` }) : null),
  );
}

/** 放大后的那张：正文 + 公开 / 转交 */
function detail(c) {
  if (!c) return null;
  const S = ctx.state;
  const pub = isPublic(S, c.id);
  const mine = isMine(S, c.id);
  const i = deck.findIndex((x) => x.id === c.id);

  const step = (d) => {
    const n = i + d;
    if (n < 0 || n >= deck.length) return;
    focusId = deck[n].id;
    render();
  };

  return h('div', { class: 'cw-veil', onclick: (e) => { if (e.target === e.currentTarget) { focusId = null; render(); } } },
    h('div', { class: 'cw-big' },
      h('div', { class: 'cw-big-art' }, h('img', { src: artUrl(c.art), alt: c.name })),
      h('div', { class: 'cw-big-body' },
        h('div', { class: 'cw-kicker', text: `${c.key ? '关键线索' : '线索'}${c.roomName ? ` · ${c.roomName}` : ''}` }),
        h('h3', { text: c.name }),
        pub ? h('div', { class: 'cw-pub-line', text: `已公开${c.by ? ` · 由 ${c.by} 公开` : ''}` }) : null,
        h('p', { class: 'cw-text', text: c.text }),
        h('div', { class: 'cw-actions' },
          mine && !pub
            ? h('button', {
                class: 'btn btn-primary', text: '公开这张线索',
                onclick: () => ctx.onReveal?.(c),
              })
            : h('span', { class: 'cw-note', text: pub ? '这张已经在公开线索区了' : '这不是你的线索' }),
          mine && !pub
            ? h('button', { class: 'btn', text: '私下交给某人', onclick: () => ctx.onGive?.(c) })
            : null,
          // 搜证阶段抽完卡就想接着搜下一间，别让人再多点一次「合上」
          ctx.state?.phase?.kind === 'search' && ctx.state.me.ap > 0
            ? h('button', { class: 'btn btn-ghost', text: `继续搜证（剩 ${ctx.state.me.ap} 点）`, onclick: closeClueWall })
            : null,
          h('button', { class: 'btn btn-ghost', text: '收起来', onclick: () => { focusId = null; render(); } }))),
      h('div', { class: 'cw-nav' },
        h('button', { class: 'cw-arrow', text: '‹', title: '上一张', disabled: i <= 0, onclick: () => step(-1) }),
        h('span', { class: 'cw-pos', text: `${i + 1} / ${deck.length}` }),
        h('button', { class: 'cw-arrow', text: '›', title: '下一张', disabled: i >= deck.length - 1, onclick: () => step(1) })),
    ));
}

function onKey(e) {
  if (e.key === 'Escape') {
    if (focusId) { focusId = null; render(); } else closeClueWall();
    e.preventDefault();
  } else if (focusId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    const i = deck.findIndex((x) => x.id === focusId);
    const n = i + (e.key === 'ArrowRight' ? 1 : -1);
    if (n >= 0 && n < deck.length) { focusId = deck[n].id; render(); }
    e.preventDefault();
  }
}
