/**
 * 解谜节点（小游戏）。五种类型：
 *   map   —— 山庄平面图探索（点遍所有房间换线索）
 *   code  —— 四位密码锁（保险柜）
 *   wire  —— 左右连线配对（出诊箱里的药）
 *   order —— 拖动排序（拼合当晚时间线）
 *   slide —— 3×3 滑块拼图（修复烧焦的全家福）
 *
 * 生命周期：mount() 建一次 DOM，之后每次服务器状态推送只调 update() 打补丁，
 * 以免把玩家排到一半的连线/顺序重置掉。
 */

import { h, artUrl } from './ui.js';

/* ── 通用外壳 ─────────────────────────────────────── */
class Base {
  constructor(ctx) {
    this.ctx = ctx;          // { node, submit, onVisit, renderPlan }
    this.node = ctx.node;
    this.el = h('div', { class: 'mg-wrap' });
  }
  mount() { this.build(); return this.el; }
  build() { throw new Error('not implemented'); }
  update(node) {
    this.node = node;
    if (node.solved) this.showSolved();
    else this.patch?.(node);
  }
  destroy() {}

  brief() {
    const n = this.node;
    return h('div', { class: 'mg-brief' },
      h('h4', { text: `节点 · ${n.title}` }),
      h('p', { class: 'muted small', text: n.sub }),
      ...(n.brief || []).map((b) => h('p', { text: b })),
    );
  }

  canvas(...kids) {
    return h('div', { class: 'mg-canvas' }, ...kids);
  }

  solvedPanel() {
    const n = this.node;
    return h('div', { class: 'mg-solved' },
      h('h3', { text: `✓ ${n.title}` }),
      h('p', { text: `解开了。${n.rewardText || ''}` }),
      h('p', { class: 'muted small', text: '奖励线索已进入「公开线索」区，全房间都能看到。' }),
      h('p', { class: 'muted small', text: `尝试次数：${n.attempts}` }),
    );
  }

  showSolved() {
    this.el.innerHTML = '';
    this.el.append(this.brief(), this.solvedPanel());
  }

  status(text, cls = '') {
    if (!this._status) this._status = h('div', { class: 'mg-status' });
    this._status.className = `mg-status ${cls}`;
    this._status.textContent = text;
    return this._status;
  }

  submit(payload) {
    return new Promise((resolve) => this.ctx.submit(this.node.id, payload, resolve));
  }
}

/* ── 1. 地图探索 ──────────────────────────────────── */
class MapGame extends Base {
  build() {
    this.host = h('div', { class: 'map-scroll' });
    this.legend = h('div', { class: 'map-legend' });
    this.el.append(this.brief(), this.host, this.legend);
    this.paint();
  }
  patch() { this.paint(); }
  paint() {
    const n = this.node;
    const visited = n.visited || [];
    this.ctx.renderPlan(this.host, {
      mode: 'tour',
      visited,
      onRoom: (r) => {
        if (visited.includes(r.id)) return this.showEnv(r);
        this.ctx.onVisit?.(r.id);
      },
      onInfo: (r) => this.showEnv(r),
    });
    this.ctx.mapLegend?.(this.legend, {
      mode: 'tour',
      visitedCount: visited.length,
      roomCount: this.ctx.rooms.length,
    });
  }
  showEnv(r) {
    this.ctx.showRoomInfo?.(r, { mode: 'tour' });
  }
}

/* ── 2. 密码锁 ────────────────────────────────────── */
class CodeGame extends Base {
  build() {
    this.value = '';
    this.slots = h('div', { class: 'code-display' });
    this.pad = h('div', { class: 'keypad' });
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '清除', '0', '确认']) {
      this.pad.append(h('button', {
        text: k,
        onclick: () => (k === '清除' ? this.clear() : k === '确认' ? this.confirm() : this.push(k)),
      }));
    }
    this.hintBox = h('p', { class: 'mg-note' });
    this.el.append(this.brief(), this.canvas(this.slots, this.status('输入四位数字'), this.pad, this.hintBox));
    this.paintSlots();
    this.patch(this.node);
  }
  patch(n) {
    if (n.hint) this.hintBox.textContent = `提示：${n.hint}`;
    if (n.attempts && !this._said) this.status(`已经试了 ${n.attempts} 次，还没对`, 'wrong');
  }
  push(k) {
    if (this.value.length >= this.node.length) return;
    this.value += k;
    this.paintSlots();
  }
  clear() { this.value = ''; this.paintSlots(); }
  paintSlots() {
    this.slots.innerHTML = '';
    for (let i = 0; i < this.node.length; i++) {
      this.slots.append(h('div', {
        class: `code-slot ${this.value[i] ? 'filled' : ''}`, text: this.value[i] || '',
      }));
    }
  }
  async confirm() {
    if (this.value.length < this.node.length) return this.status('还没输满四位', 'wrong');
    const res = await this.submit({ value: this.value });
    if (res?.ok) return;
    this.status(res?.error || '不对', 'wrong');
    this.clear();
  }
}

/* ── 3. 连线配对 ──────────────────────────────────── */
class WireGame extends Base {
  build() {
    this.links = [];        // [{ l, r, li, ri }]
    this.selLeft = null;
    this.board = h('div', { class: 'wire-board' });
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'wire-svg');
    this.colL = h('div', { class: 'wire-col' });
    this.colR = h('div', { class: 'wire-col' });
    this.board.append(this.svg, this.colL, this.colR);

    this.node.lefts.forEach((it, idx) => {
      const b = h('button', { class: 'wire-node', onclick: () => this.pickLeft(it, idx) },
        h('span', { class: 'wn-num', text: String(idx + 1).padStart(2, '0') }), it.text);
      this.colL.append(b);
    });
    this.node.rights.forEach((it, idx) => {
      const b = h('button', { class: 'wire-node', onclick: () => this.pickRight(it, idx) },
        h('span', { class: 'wn-num', text: String(idx + 1).padStart(2, '0') }), it.text);
      this.colR.append(b);
    });

    this.el.append(this.brief(), this.canvas(this.board, this.status('先点左边的试剂瓶，再点右边的标签')));
    window.addEventListener('resize', this._onResize = () => this.draw());
    setTimeout(() => this.draw(), 60);
  }
  destroy() { window.removeEventListener('resize', this._onResize); }

  pickLeft(item, idx) {
    if (this.links.some((l) => l.l === item.i)) return;
    this.selLeft = { item, idx };
    [...this.colL.children].forEach((c, i) => c.classList.toggle('sel', i === idx));
    this.status('再点右边的标签，连上它');
  }
  pickRight(item, idx) {
    if (!this.selLeft) return this.status('先点左边的试剂瓶', 'wrong');
    if (this.links.some((l) => l.r === item.i)) return this.status('这个标签已经用过了', 'wrong');
    this.links.push({ l: this.selLeft.item.i, r: item.i, li: this.selLeft.idx, ri: idx });
    this.colR.children[idx].classList.add('done');
    this.colL.children[this.selLeft.idx].classList.remove('sel');
    this.colL.children[this.selLeft.idx].classList.add('done');
    this.selLeft = null;
    this.draw();
    if (this.links.length === this.node.pairCount) this.confirm();
    else this.status(`已连 ${this.links.length} / ${this.node.pairCount} 组`);
  }

  draw() {
    const box = this.board.getBoundingClientRect();
    this.svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    this.svg.innerHTML = '';
    for (const lk of this.links) {
      const a = this.colL.children[lk.li]?.getBoundingClientRect();
      const b = this.colR.children[lk.ri]?.getBoundingClientRect();
      if (!a || !b) continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.right - box.left);
      line.setAttribute('y1', a.top + a.height / 2 - box.top);
      line.setAttribute('x2', b.left - box.left);
      line.setAttribute('y2', b.top + b.height / 2 - box.top);
      if (lk.bad) line.setAttribute('class', 'bad');
      this.svg.append(line);
    }
  }

  async confirm() {
    const res = await this.submit({ links: this.links.map((l) => [l.l, l.r]) });
    if (res?.ok) return;
    const bad = new Set((res?.bad || []).map((p) => `${p[0]}-${p[1]}`));
    const survivors = [];
    for (const lk of this.links) {
      const isBad = bad.size ? bad.has(`${lk.l}-${lk.r}`) : false;
      lk.bad = isBad && bad.size > 0;
      if (lk.bad) {
        this.colL.children[lk.li]?.classList.remove('done');
        this.colR.children[lk.ri]?.classList.remove('done');
      } else survivors.push(lk);
    }
    this.links = survivors;
    this.draw();
    this.status(bad.size ? `有 ${bad.size} 组连错了，红的那些断开了，再看看线索` : '再核对一下', 'wrong');
  }
}

/* ── 4. 拖动排序 ──────────────────────────────────── */
class OrderGame extends Base {
  build() {
    this.items = this.node.cards.slice();
    this.list = h('div', { class: 'order-list' });
    this.el.append(this.brief(), this.canvas(this.list, this.status('把八张卡片按发生顺序排好'), this.actions()));
    this.paint();
  }

  actions() {
    return h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('button', { class: 'btn', text: '打乱重来', onclick: () => { this.items = shuffleArr(this.items); this.paint(); } }),
      h('button', { class: 'btn btn-primary', text: '确认时间线', onclick: () => this.confirm() }),
    );
  }

  paint() {
    this.list.innerHTML = '';
    this.items.forEach((item, pos) => {
      const card = h('div', {
        class: 'order-card', draggable: 'true',
        ondragstart: (e) => { this._drag = pos; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; },
        ondragend: () => card.classList.remove('dragging'),
        ondragover: (e) => { e.preventDefault(); card.classList.add('over'); },
        ondragleave: () => card.classList.remove('over'),
        ondrop: (e) => { e.preventDefault(); card.classList.remove('over'); this.move(this._drag, pos); },
      },
        h('span', { class: 'idx', text: String(pos + 1) }),
        h('span', { style: { flex: '1' }, text: item.text }),
        h('span', { class: 'mv' },
          h('button', { text: '▲', onclick: (e) => { e.stopPropagation(); this.move(pos, pos - 1); } }),
          h('button', { text: '▼', onclick: (e) => { e.stopPropagation(); this.move(pos, pos + 1); } }),
        ),
      );
      this.list.append(card);
    });
  }

  move(from, to) {
    if (from === to || from == null || to < 0 || to >= this.items.length) return;
    const arr = this.items.slice();
    const [it] = arr.splice(from, 1);
    arr.splice(to, 0, it);
    this.items = arr;
    this.paint();
  }

  async confirm() {
    const res = await this.submit({ order: this.items.map((c) => c.i) });
    if (res?.ok) return;
    this.status('顺序还不对。再想想，谁的记忆应该排在最前面？', 'wrong');
  }
}

/* ── 5. 滑块拼图 ──────────────────────────────────── */
class SlideGame extends Base {
  build() {
    const n = this.node.size;
    this.n = n;
    this.board = new Array(n * n).fill(0).map((_, i) => i);
    this.board[n * n - 1] = null;       // 最后一格是空位
    this.shuffle();
    this.grid = h('div', {
      class: 'slide-board',
      style: { gridTemplateColumns: `repeat(${n}, 1fr)`, aspectRatio: `${n} / ${n}` },
    });
    this.hintImg = h('img', {
      src: this.node.image, alt: '原图',
      style: {
        width: 'min(430px, 78vw)', borderRadius: '10px', opacity: '0.28',
        position: 'absolute', pointerEvents: 'none', display: 'none',
      },
    });
    this.wrap = h('div', { style: { position: 'relative', display: 'grid', placeItems: 'center' } }, this.hintImg, this.grid);
    this.el.append(this.brief(), this.canvas(this.wrap,
      this.status('点一块碎片，它会和旁边的空格交换'),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn', text: '看原图', onclick: () => this.toggleHint() }),
        h('button', { class: 'btn', text: '重新打乱', onclick: () => { this.shuffle(); this.paint(); } }),
      )));
    this.paint();
  }

  toggleHint() {
    this._hint = !this._hint;
    this.hintImg.style.display = this._hint ? 'block' : 'none';
  }

  shuffle() {
    const n = this.n;
    // 用合法移动打乱，保证一定可解
    for (let i = 0; i < 400; i++) {
      const gap = this.board.indexOf(null);
      const opts = [];
      const r = Math.floor(gap / n); const c = gap % n;
      if (r > 0) opts.push(gap - n);
      if (r < n - 1) opts.push(gap + n);
      if (c > 0) opts.push(gap - 1);
      if (c < n - 1) opts.push(gap + 1);
      const pick = opts[Math.floor(Math.random() * opts.length)];
      [this.board[gap], this.board[pick]] = [this.board[pick], this.board[gap]];
    }
    if (this.isSolved()) this.shuffle();
  }

  isSolved() { return this.board.every((v, i) => v === i || (i === this.board.length - 1 && v === null)); }

  paint() {
    const n = this.n;
    this.grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    this.grid.innerHTML = '';
    this.board.forEach((val, pos) => {
      const tile = h('div', { class: `slide-tile ${val === null ? 'gap' : ''}` });
      if (val !== null) {
        const col = val % n; const row = Math.floor(val / n);
        const step = 100 / (n - 1);
        tile.style.backgroundImage = `url("${this.node.image}")`;
        tile.style.backgroundSize = `${n * 100}% ${n * 100}%`;
        tile.style.backgroundPosition = `${col * step}% ${row * step}%`;
        tile.onclick = () => this.tap(pos);
      }
      this.grid.append(tile);
    });
  }

  tap(pos) {
    const n = this.n;
    const gap = this.board.indexOf(null);
    const adjacent = (Math.abs(pos - gap) === 1 && Math.floor(pos / n) === Math.floor(gap / n)) || Math.abs(pos - gap) === n;
    if (!adjacent) return;
    [this.board[gap], this.board[pos]] = [this.board[pos], this.board[gap]];
    this.paint();
    if (this.isSolved()) this.finish();
  }

  async finish() {
    this.status('拼好了！', 'right');
    await this.submit({ solved: true });
  }
}

/* ── 6. 暗房显影 ──────────────────────────────────── */
class DevelopGame extends Base {
  build() {
    this.order = [];        // 已排定的工序（药盘的原始索引）
    this.time = null;       // 选定的显影时间（秒）
    this.baths = this.node.baths;
    this.trays = h('div', { class: 'tray-row' });
    this.slots = h('div', { class: 'bath-slots' });
    this.times = h('div', { class: 'time-row' });
    this.el.append(this.brief(), this.canvas(
      h('div', { class: 'darkroom-stage' },
        h('div', { class: 'dr-lamp' }),
        h('div', { class: 'dr-bench' },
          h('div', { class: 'dr-label', text: '工序' }),
          this.slots,
          h('div', { class: 'dr-label', text: '药盘 · 点击按顺序放进去' }),
          this.trays,
          h('div', { class: 'dr-label', text: '显影时间' }),
          this.times,
        ),
      ),
      this.status('先决定工序：底片要先过哪一盘？'),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn', text: '重来', onclick: () => { this.order = []; this.time = null; this.paint(); } }),
        h('button', { class: 'btn btn-primary', text: '开始显影', onclick: () => this.confirm() })),
    ));
    this.paint();
  }

  paint() {
    // 工序槽
    this.slots.innerHTML = '';
    for (let i = 0; i < this.node.bathCount; i++) {
      const idx = this.order[i];
      this.slots.append(h('div', {
        class: `bath-slot ${idx === undefined ? 'empty' : 'filled'}`,
        onclick: () => { if (idx !== undefined) { this.order.splice(i, 1); this.paint(); } },
      }, idx === undefined ? String(i + 1) : this.baths.find((b) => b.i === idx).text));
    }
    // 药盘（已经用掉的置灰）
    this.trays.innerHTML = '';
    for (const b of this.node.baths) {
      const used = this.order.includes(b.i);
      this.trays.append(h('button', {
        class: `tray ${used ? 'used' : ''}`,
        disabled: used,
        onclick: () => { if (this.order.length < this.node.bathCount && !used) { this.order.push(b.i); this.paint(); } },
      }, h('span', { class: 'tray-liquid' }), b.text));
    }
    // 时间
    this.times.innerHTML = '';
    for (const t of this.node.times) {
      this.times.append(h('button', {
        class: `time-chip ${this.time === t.value ? 'on' : ''}`,
        onclick: () => { this.time = t.value; this.paint(); },
      }, t.label));
    }
  }

  async confirm() {
    if (this.order.length < this.node.bathCount) return this.status('还有药盘没放进去', 'wrong');
    if (this.time === null) return this.status('还没定显影时间', 'wrong');
    const res = await this.submit({ order: this.order, time: this.time });
    if (res?.ok) return;
    if (res?.orderOk === false) {
      this.status(res.error || '工序顺序不对', 'wrong');
      this.order = [];
      this.paint();
    } else {
      this.status(res?.error || '时间不对', 'wrong');
    }
  }

  /** 成功时先把"显影"演一遍，再交给通用的完成面板 */
  async showSolved() {
    this.el.innerHTML = '';
    this.el.append(this.brief(), h('div', { class: 'developing' },
      h('img', { class: 'dev-photo', src: '/api/art/negative', alt: 'B-1975' }),
      h('div', { class: 'dev-caption', text: '显影 9 分 30 秒 · 停显 30 秒 · 定影 12 分' }),
      h('p', { class: 'dev-echo', text: '影像从灰雾里浮出来……' })));
    await new Promise((r) => setTimeout(r, 2600));
    this.el.innerHTML = '';
    this.el.append(this.brief(), this.solvedPanel());
  }
}

function shuffleArr(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createMiniGame(ctx) {
  const map = { map: MapGame, code: CodeGame, wire: WireGame, order: OrderGame, slide: SlideGame, develop: DevelopGame };
  const Cls = map[ctx.node.type];
  if (!Cls) return null;
  return new Cls(ctx);
}
