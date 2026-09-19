/** 通用 UI 小工具：DOM 构造、转义、弹窗、浮动提示、线索卡渲染 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 生成 DOM 元素 */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'data' && typeof v === 'object') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const artUrl = (name) => `/api/art/${encodeURIComponent(name || 'rumor')}`;

/* ── 浮动提示 ─────────────────────────────────────── */
export function toast(text, kind = 'info', ms = 3600) {
  const root = $('#toast-root');
  const el = h('div', { class: `toast ${kind}`, text });
  root.append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(24px)';
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/* ── 弹窗 ─────────────────────────────────────────── */
let modalOpen = false;

export function openModal(content, opts = {}) {
  const root = $('#modal-root');
  root.innerHTML = '';
  const box = h('div', { class: `modal-box ${opts.plain ? 'plain' : ''} ${opts.cls || ''}` });
  if (opts.head) {
    box.append(h('div', { class: 'modal-head' },
      h('h3', { text: opts.head }),
      h('button', { class: 'modal-close', text: '×', onclick: closeModal })));
  }
  box.append(content);
  const veil = h('div', { class: 'modal-veil', onclick: () => { if (opts.dismissable !== false) closeModal(); } });
  root.append(veil, box);
  root.classList.add('open');
  modalOpen = true;
  if (opts.onMount) opts.onMount(box);
  return box;
}

export function closeModal() {
  const root = $('#modal-root');
  root.classList.remove('open');
  root.innerHTML = '';
  modalOpen = false;
}

export const isModalOpen = () => modalOpen;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen) closeModal();
});

/* ── 线索卡 ───────────────────────────────────────── */
export function clueCard(clue, opts = {}) {
  const card = h('div', {
    class: `clue-card ${opts.public ? 'public' : ''}`,
    onclick: () => opts.onOpen?.(clue),
  },
    h('img', {
      src: artUrl(clue.art), alt: clue.name, loading: 'lazy',
      // 以后换成真图，某张挂了也别在卡片上留个破图框
      onerror: (e) => { e.target.remove(); card.classList.add('no-art'); },
    }),
    // 关键线索钉在图的角上：卡片窄，混进名字里会把名字挤成两行
    clue.key ? h('span', { class: 'cc-key-tag', text: '◆ 关键', title: '关键线索' }) : null,
    h('div', { class: 'cc-body' },
      h('div', { class: 'cc-name', text: clue.name }),
      h('div', { class: 'cc-meta', text: clue.roomName || '' }),
      clue.by ? h('div', { class: 'cc-by', text: `由 ${clue.by} 公开` }) : null,
    ),
  );
  return card;
}

/** 打开一张线索的详情弹窗 */
export function openClueModal(clue, actions = []) {
  const body = h('div', { class: 'cm-body' },
    h('p', { class: 'mini-label', text: clue.key ? '关键线索' : '线索' }),
    h('h3', { text: clue.name }),
    h('p', { class: 'muted small', text: `${clue.roomName || ''}${clue.by ? ` · 由 ${clue.by} 公开` : ' · 未公开'}` }),
    h('p', { class: 'cm-text', text: clue.text }),
  );
  const box = h('div', { class: 'clue-modal' },
    h('img', { src: artUrl(clue.art), alt: clue.name }),
    body,
  );
  const acts = h('div', { class: 'modal-actions' });
  for (const a of actions) acts.append(h('button', { class: `btn ${a.cls || ''}`, text: a.label, onclick: a.onClick }));
  acts.append(h('button', { class: 'btn btn-ghost', text: '关掉', onclick: closeModal }));
  body.append(acts);
  return openModal(box, { dismissable: true, cls: 'clue-box' });
}

/* ── 房间平面图（搜证阶段与「山庄探索」节点共用） ── */
export function renderFloorPlan(container, opts) {
  const { rooms, mapView, mode = 'search', visited = [], onRoom, onInfo } = opts;
  const { w, h: vh } = mapView;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${vh}`);
  svg.setAttribute('class', 'map-svg');
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };

  /* 楼体轮廓 / 回廊 / 前院的位置全部从房间包围盒推导出来。
     写死坐标的话，换一本剧本（房间高度不同）色带就会压到房间上。 */
  const xs = rooms.map((r) => r.x);
  const rs = rooms.map((r) => r.x + r.w);
  const ys = rooms.map((r) => r.y);
  const bs = rooms.map((r) => r.y + r.h);
  const left = Math.min(...xs), right = Math.max(...rs);
  const top = Math.min(...ys), bottom = Math.max(...bs);
  const midY = (top + bottom) / 2;
  const topRowBottom = Math.max(...rooms.filter((r) => r.y + r.h / 2 < midY).map((r) => r.y + r.h));
  const botRowTop = Math.min(...rooms.filter((r) => r.y + r.h / 2 >= midY).map((r) => r.y));
  const twoRows = Number.isFinite(topRowBottom) && Number.isFinite(botRowTop) && botRowTop - topRowBottom >= 46;

  svg.append(mk('rect', { x: left - 8, y: top - 8, width: right - left + 16, height: bottom - top + 16, rx: 12, class: 'building' }));
  if (twoRows) {
    const cy = topRowBottom + 8;
    const ch = botRowTop - topRowBottom - 16;
    svg.append(mk('rect', { x: left, y: cy, width: right - left, height: ch, rx: 8, class: 'corridor' }));
    svg.append(mk('text', { x: (left + right) / 2, y: cy + ch / 2 - 4, 'text-anchor': 'middle', class: 'map-label' }, '回 廊'));
    svg.append(mk('text', { x: (left + right) / 2, y: cy + ch / 2 + 14, 'text-anchor': 'middle', class: 'map-label dim' }, '过 道 · 通 后 院'));
  }
  // 前院带在最下排房间之下，留 16px 空隙
  const yardY = bottom + 16;
  if (yardY + 42 <= 600) {
    svg.append(mk('rect', { x: left, y: yardY, width: right - left, height: 42, rx: 8, class: 'yard' }));
    svg.append(mk('text', { x: (left + right) / 2, y: yardY + 27, 'text-anchor': 'middle', class: 'map-label' }, '门 口 · 街'));
  }
  svg.append(mk('text', { x: right - 6, y: yardY + 24, 'text-anchor': 'end', class: 'map-label dim' }, '北 ↑'));

  for (const r of rooms) {
    const isVisited = visited.includes(r.id);
    const empty = mode === 'search' && r.remaining === 0;
    const cls = ['room-hit'];
    if (mode === 'search') {
      if (empty) cls.push('empty'); else cls.push('searchable');
    }
    if (isVisited) cls.push('visited');

    const g = mk('g', { class: cls.join(' '), 'data-room': r.id });
    g.append(mk('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 8, class: 'room-shape' }));
    const hasCount = mode === 'search';
    const nameY = r.y + r.h / 2 + (hasCount ? -20 : -4);
    g.append(mk('text', { x: r.x + r.w / 2, y: nameY, 'text-anchor': 'middle', class: 'room-name' }, r.name));
    g.append(mk('text', { x: r.x + r.w / 2, y: nameY + 24, 'text-anchor': 'middle', class: 'room-sub' },
      mode === 'search' ? r.sub : (isVisited ? '已查看' : '点击查看环境')));

    if (hasCount) {
      const keyLeft = r.keyLeft || 0;
      g.append(mk('text', {
        x: r.x + r.w / 2, y: r.y + r.h - 20, 'text-anchor': 'middle',
        class: `room-left ${r.remaining === 0 ? 'none' : ''}`,
      }, r.remaining === 0
        ? '已翻空'
        : `还剩 ${r.remaining} 张线索${keyLeft ? `　◆ ${keyLeft}` : ''}`));
      // 还有关键线索的房间，左上角钉一个小菱形，一眼能看出来该去哪儿
      if (keyLeft > 0) {
        g.append(mk('path', {
          d: `M${r.x + 16} ${r.y + 12} l7 6 l-7 6 l-7 -6 Z`,
          fill: 'rgba(216,167,90,.85)', stroke: 'none',
        }));
      }
    } else if (isVisited) {
      g.append(mk('text', { x: r.x + r.w / 2, y: r.y + r.h - 20, 'text-anchor': 'middle', class: 'room-left' }, '✓'));
    }

    g.addEventListener('click', (e) => {
      e.stopPropagation();
      onRoom?.(r);
    });
    svg.append(g);

    // 环境说明小按钮
    if (onInfo) {
      const info = mk('g', { class: 'room-hit room-info', 'data-info': r.id, style: 'cursor:pointer' });
      info.append(mk('circle', { cx: r.x + r.w - 20, cy: r.y + 20, r: 11, fill: 'rgba(216,167,90,.18)', stroke: 'rgba(216,167,90,.45)' }));
      info.append(mk('text', { x: r.x + r.w - 20, y: r.y + 25, 'text-anchor': 'middle', class: 'room-sub', style: 'font-size:13px;fill:#d8a75a' }, 'i'));
      info.addEventListener('click', (e) => { e.stopPropagation(); onInfo(r); });
      svg.append(info);
    }
  }

  container.innerHTML = '';
  container.append(svg);
  return svg;
}
