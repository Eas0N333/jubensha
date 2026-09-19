/**
 * 阅读视图：像翻一本小册子那样读自己的本子。
 *
 * 结构：左侧目录 + 右侧纸页，底部翻页，左右边缘点击也能翻。
 * 每次服务器状态推送都会 refreshBook()，所以新章节解锁时不用关掉重开。
 */

import { h } from './ui.js';

let root = null;      // 覆盖层元素
let pages = [];       // 可读的页
let tocRows = [];     // 目录行 [{ label, page, locked, note, group, owner }]
let idx = 0;
let ctx = { state: null, micDot: null, onClose: null };

export const isBookOpen = () => !!root;

export function openBook(state, options = {}) {
  ctx = { ...ctx, ...options, state };
  if (!root) {
    root = h('div', { class: 'book' });
    document.body.append(root);
    document.addEventListener('keydown', onKey);
  }
  build();
  idx = Math.min(idx, pages.length - 1);
  render(true);
}

export function closeBook() {
  if (!root) return;
  document.removeEventListener('keydown', onKey);
  root.remove();
  root = null;
  ctx.onClose?.();
}

export function refreshBook(state) {
  if (!root) return;
  ctx.state = state;
  const keepTitle = pages[idx]?.title;
  build();
  const found = pages.findIndex((p) => p.title === keepTitle);
  idx = found >= 0 ? found : Math.min(idx, pages.length - 1);
  render(false);
}

/**
 * 只刷新顶栏的麦克风状态。音量变化每秒会调好几次，
 * 整本重绘会把正在读的那页滚回顶部，所以单独开一个轻量入口。
 */
export function refreshBookMics(state) {
  if (!root) return;
  ctx.state = state;
  const box = root.querySelector('.bb-mics');
  if (!box) return;
  box.innerHTML = '';
  for (const p of state.players || []) {
    box.append(h('span', { class: 'bb-mic' },
      h('span', { text: p.isMe ? '你' : p.name }),
      ctx.micDot ? ctx.micDot(p) : null));
  }
}

/* ── 组页 ─────────────────────────────────────────── */
/* 顺序就是页序：任务页在最前面，然后是自己的章节，最后是主持人手册 */
function build() {
  const S = ctx.state;
  pages = [];
  tocRows = [];

  const brief = S.me.role?.brief;
  if (brief) {
    tocRows.push({ label: '你的任务', page: pages.length, group: '开场' });
    pages.push({ kind: 'task', title: '你的任务', brief, role: S.me.role });
  }

  for (const ch of S.me.script) {
    tocRows.push({ label: ch.title, page: pages.length, group: '你的本子' });
    pages.push({ kind: 'chapter', title: ch.title, body: ch.body });
  }
  for (const l of S.me.locked || []) {
    tocRows.push({ label: l.title, page: null, locked: true, note: `在「${l.unlockPhase}」解锁`, group: '你的本子' });
  }
  if (!S.me.role) {
    tocRows.push({ label: '本局你没有角色', page: null, locked: true, group: '你的本子' });
  }

  // 主持人手册：无人扮演的角色，整本都能翻
  for (const r of S.hostNotes || []) {
    for (const ch of r.script) {
      tocRows.push({ label: ch.title, page: pages.length, group: `主持人手册 · ${r.name}`, owner: r.name });
      pages.push({ kind: 'chapter', title: `${r.name} · ${ch.title}`, body: ch.body, owner: r.name });
    }
  }

  if (!pages.length) pages.push({ kind: 'empty', title: '没有内容' });
}

/* ── 渲染 ─────────────────────────────────────────── */
function render(animate) {
  if (!root) return;
  const S = ctx.state;
  root.innerHTML = '';

  const role = S.me.role;
  const bar = h('header', { class: 'book-bar' },
    h('span', { class: 'bb-mark', text: '本' }),
    h('div', { class: 'bb-id' },
      h('span', { class: 'bb-title', text: role ? `${role.name} 的本子` : '剧本' }),
      h('span', { class: 'bb-sub', text: role ? `${role.title} · ${role.gender} · ${role.age} 岁` : '本局你没有角色' })),
    h('div', { class: 'bb-mics' },
      ...(S.players || []).map((p) => h('span', { class: 'bb-mic' },
        h('span', { text: p.isMe ? '你' : p.name }), ctx.micDot ? ctx.micDot(p) : null))),
    h('button', { class: 'bb-close', text: '合上 ✕', onclick: closeBook }));

  const toc = h('nav', { class: 'book-toc scroll' });
  let lastGroup = null;
  for (const row of tocRows) {
    if (row.group !== lastGroup) {
      toc.append(h('div', { class: 'toc-group', text: row.group }));
      lastGroup = row.group;
    }
    const active = row.page !== null && row.page === idx;
    toc.append(h('button', {
      class: `toc-row ${active ? 'active' : ''} ${row.locked ? 'locked' : ''}`,
      disabled: row.locked,
      onclick: () => { if (row.page === null) return; idx = row.page; render(true); },
    },
      h('span', { class: 'tr-label', text: row.label }),
      row.locked ? h('span', { class: 'tr-lock', text: '🔒' }) : null,
      row.note ? h('span', { class: 'tr-note', text: row.note }) : null));
  }

  const page = pages[idx] || pages[0];
  const sheet = h('article', { class: `book-sheet ${animate ? 'flip' : ''}`, 'data-kind': page.kind },
    page.kind === 'task' ? taskPage(page) : null,
    page.kind === 'chapter' ? chapterPage(page) : null,
    page.kind === 'empty' ? h('p', { class: 'sheet-note', text: '这一局你是旁观者。' }) : null);

  const stage = h('div', { class: 'book-stage' },
    sheet,
    h('button', { class: 'page-edge prev', title: '上一页', onclick: () => turn(-1) }),
    h('button', { class: 'page-edge next', title: '下一页', onclick: () => turn(1) }));

  const foot = h('footer', { class: 'book-foot' },
    h('button', { class: 'btn btn-ghost', text: '← 上一页', disabled: idx === 0, onclick: () => turn(-1) }),
    h('span', { class: 'bf-num', text: `第 ${idx + 1} 页 / 共 ${pages.length} 页` }),
    h('button', { class: 'btn btn-ghost', text: '下一页 →', disabled: idx >= pages.length - 1, onclick: () => turn(1) }),
    h('span', { class: 'bf-tip', text: '← → 翻页，Esc 合上' }));

  root.append(bar, h('div', { class: 'book-main' }, toc, stage), foot);
}

function turn(delta) {
  const next = idx + delta;
  if (next < 0 || next >= pages.length) return;
  idx = next;
  render(true);
}

function onKey(e) {
  if (e.key === 'Escape') { closeBook(); return; }
  if (e.key === 'ArrowLeft') { turn(-1); e.preventDefault(); }
  if (e.key === 'ArrowRight') { turn(1); e.preventDefault(); }
  // 书打开时不要触发「开麦(m)」「聊天(c)」这类快捷键
  e.stopPropagation();
}

/* ── 两种页 ───────────────────────────────────────── */
function taskPage(page) {
  const b = page.brief;
  const role = page.role;
  const nowPhase = ctx.state.phase?.id;

  const tasks = (b.tasks || []).map((t) => {
    const isNow = t.phase && t.phase === nowPhase;
    const done = t.phase && ctx.state.phaseList?.find((p) => p.id === t.phase)?.done;
    return h('li', { class: `task ${isNow ? 'now' : ''} ${done ? 'done' : ''}` },
      h('span', { class: 'tk-mark', text: done ? '✓' : isNow ? '▶' : '·' }),
      h('div', {},
        h('div', { class: 'tk-when' }, t.when, isNow ? h('span', { class: 'tk-now', text: '现在' }) : null),
        h('div', { class: 'tk-what', text: t.what })));
  });

  return h('div', { class: 'sheet-inner' },
    h('div', { class: 'sheet-head' },
      h('h2', { text: '你的任务' }),
      h('div', { class: 'sheet-sub', text: role ? `${role.name} · ${role.title}` : '' })),

    h('section', { class: 'sheet-sec' },
      h('h3', { text: '你是谁' }),
      h('p', { class: 'lead', text: b.identity })),

    h('section', { class: 'sheet-sec' },
      h('h3', { text: '你要什么' }),
      h('p', { text: b.goal }),
      h('p', { class: 'win' }, h('b', { text: '怎样算赢：' }), b.win)),

    h('section', { class: 'sheet-sec' },
      h('h3', { text: '你必须瞒住' }),
      h('ul', { class: 'hide-list' }, ...(b.hide || []).map((x) => h('li', { text: x })))),

    h('section', { class: 'sheet-sec' },
      h('h3', { text: '按这个顺序做' }),
      h('ul', { class: 'task-list' }, ...tasks)),
  );
}

function chapterPage(page) {
  return h('div', { class: 'sheet-inner' },
    page.owner ? h('div', { class: 'sheet-owner', text: `主持人手册 · ${page.owner}` }) : null,
    h('div', { class: 'sheet-head' },
      h('h2', { text: page.title }),
      page.owner ? h('div', { class: 'sheet-sub', text: '这一页不是你的本子，是你替别人保管的' }) : null),
    ...page.body.map((p, i) => h('p', { class: i === 0 ? 'lead' : '', text: p })),
  );
}
