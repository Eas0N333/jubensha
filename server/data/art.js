/**
 * 线索卡插画库：全部用程序化 SVG 生成，不依赖任何外部图片资源。
 * 每个函数返回一段 SVG 字符串，客户端直接以 <img src="data:image/svg+xml,..."> 使用。
 * 统一风格：暗色照片底 + 颗粒噪点 + 描边式物件。
 */

const C = {
  bg: '#161a21',
  bg2: '#0f1218',
  paper: '#e6d9bb',
  paper2: '#cbb98f',
  ink: '#2a251d',
  sepia: '#b99a63',
  gold: '#d8a75a',
  steel: '#9aa4b0',
  steel2: '#5f6a77',
  blood: '#8e2f2f',
  jade: '#6f8f7a',
};

const W = 360;
const H = 240;

/** 通用外壳：底纹、暗角、颗粒、四角定位角标 */
function wrap(inner, opts = {}) {
  const bg = opts.bg || C.bg;
  const grad = opts.grad || C.bg2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${grad}"/>
  </linearGradient>
  <radialGradient id="vig" cx="0.5" cy="0.45" r="0.75">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.72"/>
  </radialGradient>
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.16"/></feComponentTransfer>
  </filter>
  <filter id="soft"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="soft6"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${inner}
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.5"/>
<g stroke="${C.sepia}" stroke-opacity="0.35" stroke-width="1" fill="none">
  <path d="M8 22 L8 8 L22 8"/><path d="M${W - 22} 8 L${W - 8} 8 L${W - 8} 22"/>
  <path d="M8 ${H - 22} L8 ${H - 8} L22 ${H - 8}"/><path d="M${W - 22} ${H - 8} L${W - 8} ${H - 8} L${W - 8} ${H - 22}"/>
</g>
</svg>`;
}

/** 纸面底（用于信件、剪报、照片等） */
function paperSheet(x, y, w, h, rot = 0, fill = C.paper) {
  return `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">
    <rect x="${x + 3}" y="${y + 4}" width="${w}" height="${h}" fill="#000" opacity="0.45" filter="url(#soft)"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>
  </g>`;
}

/** 横排文字占位线 */
function lines(x, y, w, n, gap = 13, color = C.ink, op = 0.55) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const ww = i === n - 1 ? w * 0.62 : w * (0.86 + (i % 3) * 0.05);
    s += `<rect x="${x}" y="${y + i * gap}" width="${ww}" height="2.6" rx="1.3" fill="${color}" opacity="${op}"/>`;
  }
  return s;
}

const A = {
  /* ── 匕首 ───────────────────────────────────────────── */
  knife: () => wrap(`
    <ellipse cx="180" cy="196" rx="120" ry="16" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <g transform="rotate(-24 180 120)">
      <path d="M96 118 L232 106 L248 120 L232 134 L96 122 Z" fill="${C.steel}" opacity="0.92"/>
      <path d="M96 118 L232 106 L240 113 L100 124 Z" fill="#dfe6ee" opacity="0.8"/>
      <path d="M196 109 L232 106 L248 120 L232 134 L200 131 Z" fill="${C.blood}" opacity="0.55"/>
      <rect x="82" y="110" width="14" height="20" rx="3" fill="${C.steel2}"/>
      <rect x="46" y="112" width="38" height="16" rx="7" fill="#4a3524"/>
      <circle cx="58" cy="120" r="2.6" fill="${C.gold}"/><circle cx="70" cy="120" r="2.6" fill="${C.gold}"/>
    </g>
    <g fill="${C.blood}" opacity="0.6">
      <ellipse cx="128" cy="176" rx="9" ry="6"/><ellipse cx="150" cy="192" rx="6" ry="4"/>
      <ellipse cx="106" cy="188" rx="4" ry="3"/>
    </g>`),

  /* ── 注射器 ─────────────────────────────────────────── */
  syringe: () => wrap(`
    <ellipse cx="180" cy="180" rx="130" ry="14" fill="#000" opacity="0.45" filter="url(#soft6)"/>
    <g transform="rotate(-16 180 120)">
      <rect x="118" y="72" width="96" height="26" rx="4" fill="${C.steel}" opacity="0.25" stroke="${C.steel}" stroke-width="2"/>
      <rect x="118" y="86" width="88" height="12" fill="${C.jade}" opacity="0.55"/>
      <rect x="60" y="76" width="60" height="18" rx="2" fill="#2b3138"/>
      <rect x="46" y="66" width="16" height="38" rx="3" fill="${C.steel2}"/>
      <rect x="52" y="82" width="10" height="6" fill="#1b1f24"/>
      <path d="M214 84 L268 84" stroke="${C.steel}" stroke-width="3"/>
      <path d="M268 84 L292 84" stroke="#e8eef4" stroke-width="1.6"/>
      <g stroke="${C.steel2}" stroke-width="1.4" opacity="0.8">
        <path d="M132 73 L132 80"/><path d="M148 73 L148 80"/><path d="M164 73 L164 80"/><path d="M180 73 L180 80"/>
      </g>
      <circle cx="292" cy="84" r="3.4" fill="${C.jade}" opacity="0.9"/>
    </g>`),

  /* ── 怀表 ───────────────────────────────────────────── */
  watch: () => wrap(`
    <ellipse cx="180" cy="196" rx="110" ry="14" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <g>
      <circle cx="180" cy="122" r="58" fill="${C.steel2}" stroke="${C.gold}" stroke-width="3"/>
      <circle cx="180" cy="122" r="46" fill="#efe6d0"/>
      <circle cx="180" cy="122" r="46" fill="none" stroke="${C.ink}" stroke-width="1" opacity="0.4"/>
      <g stroke="${C.ink}" stroke-width="2" opacity="0.75">
        <path d="M180 82 L180 92"/><path d="M180 152 L180 162"/>
        <path d="M140 122 L150 122"/><path d="M210 122 L220 122"/>
      </g>
      <path d="M180 122 L180 96" stroke="${C.ink}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M180 122 L204 136" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="180" cy="122" r="3.4" fill="${C.ink}"/>
      <rect x="174" y="58" width="12" height="8" rx="2" fill="${C.gold}"/>
      <path d="M206 66 q34 -6 40 26 q4 26 -22 34" stroke="${C.gold}" stroke-width="3" fill="none" stroke-dasharray="7 5"/>
      <path d="M150 150 q-22 12 -30 34" stroke="${C.blood}" stroke-width="2" fill="none" opacity="0.7"/>
    </g>`),

  /* ── 威士忌杯 ───────────────────────────────────────── */
  glass: () => wrap(`
    <ellipse cx="180" cy="200" rx="104" ry="14" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <path d="M132 74 L228 74 L216 180 L144 180 Z" fill="#cfe0e8" opacity="0.16"/>
    <path d="M140 118 L220 118 L214 180 L146 180 Z" fill="${C.gold}" opacity="0.42"/>
    <path d="M132 74 L228 74 L216 180 L144 180 Z" fill="none" stroke="#cfe0e8" stroke-opacity="0.5" stroke-width="2"/>
    <g fill="#eaf3f8" opacity="0.28">
      <rect x="152" y="126" width="26" height="24" rx="4" transform="rotate(-12 165 138)"/>
      <rect x="184" y="134" width="24" height="22" rx="4" transform="rotate(9 196 145)"/>
    </g>
    <ellipse cx="180" cy="118" rx="40" ry="7" fill="${C.gold}" opacity="0.5"/>
    <g opacity="0.35">
      <circle cx="250" cy="172" r="22" fill="none" stroke="${C.paper2}" stroke-width="4"/>
      <circle cx="250" cy="172" r="14" fill="none" stroke="${C.paper2}" stroke-width="2"/>
    </g>`),

  /* ── 烧毁的照片 ─────────────────────────────────────── */
  photoBurnt: () => wrap(`
    <rect x="112" y="46" width="140" height="152" fill="#000" opacity="0.5" filter="url(#soft)"/>
    <path d="M114 50 L248 46 L252 150 q-10 8 -20 4 q-12 -6 -22 2 q-14 10 -26 -2 q-12 -10 -24 0 q-16 12 -44 4 Z" fill="#dccba6"/>
    <path d="M114 50 L248 46 L250 96 q-30 8 -60 4 q-46 -6 -76 2 Z" fill="${C.ink}" opacity="0.86"/>
    <path d="M114 50 L248 46 L249 78 q-40 10 -80 4 q-34 -6 -55 0 Z" fill="#0b0d10"/>
    <g fill="#221d16" opacity="0.9">
      <circle cx="150" cy="126" r="11"/><path d="M136 172 q14 -34 28 0 Z"/>
      <circle cx="180" cy="118" r="13"/><path d="M163 172 q17 -40 34 0 Z"/>
      <circle cx="212" cy="128" r="9"/><path d="M201 172 q11 -30 22 0 Z"/>
    </g>
    <g stroke="${C.gold}" stroke-width="1.6" opacity="0.8" fill="none">
      <path d="M124 160 q8 -12 14 0"/><path d="M228 128 q-6 -10 -12 -2"/>
    </g>
    <g fill="${C.gold}" opacity="0.35">
      <circle cx="140" cy="140" r="1.6"/><circle cx="196" cy="150" r="1.4"/><circle cx="220" cy="160" r="1.6"/>
    </g>`),

  /* ── 遗嘱 / 信件 ────────────────────────────────────── */
  letter: () => wrap(`
    ${paperSheet(96, 40, 168, 168, -3)}
    <g transform="rotate(-3 180 124)">
      <rect x="112" y="54" width="60" height="7" rx="3" fill="${C.ink}" opacity="0.7"/>
      ${lines(112, 76, 136, 6, 14, C.ink, 0.4)}
      <path d="M112 172 q22 -16 40 2 q10 10 24 -6" stroke="${C.ink}" stroke-width="2.2" fill="none" opacity="0.8"/>
      <circle cx="238" cy="176" r="16" fill="${C.blood}" opacity="0.75"/>
      <circle cx="238" cy="176" r="16" fill="none" stroke="${C.blood}" stroke-width="2"/>
      <g stroke="${C.paper}" stroke-width="1.6" opacity="0.6" fill="none">
        <path d="M230 176 h16 M238 168 v16"/>
      </g>
    </g>`),

  /* ── 钥匙 ───────────────────────────────────────────── */
  key: () => wrap(`
    <ellipse cx="180" cy="190" rx="90" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <g transform="rotate(-18 180 120)">
      <circle cx="118" cy="112" r="26" fill="none" stroke="${C.gold}" stroke-width="7"/>
      <circle cx="118" cy="112" r="9" fill="none" stroke="${C.gold}" stroke-width="4"/>
      <rect x="142" y="106" width="118" height="12" rx="3" fill="${C.gold}"/>
      <path d="M198 118 L198 140 L212 140 L212 118 Z" fill="${C.gold}"/>
      <path d="M230 118 L230 134 L242 134 L242 118 Z" fill="${C.gold}"/>
    </g>
    <g stroke="${C.sepia}" stroke-width="1" opacity="0.3" fill="none">
      <path d="M60 60 q60 -20 120 0"/><path d="M250 190 q30 -10 50 6"/>
    </g>`),

  /* ── 台历 ───────────────────────────────────────────── */
  calendar: () => wrap(`
    ${paperSheet(94, 44, 172, 156, 2, '#ded0ad')}
    <g transform="rotate(2 180 122)">
      <rect x="94" y="44" width="172" height="30" fill="${C.blood}" opacity="0.7"/>
      <rect x="94" y="44" width="172" height="30" fill="none" stroke="#00000055"/>
      <g stroke="${C.steel2}" stroke-width="2.4">
        <path d="M126 36 v18"/><path d="M172 36 v18"/><path d="M218 36 v18"/>
      </g>
      <g stroke="${C.ink}" stroke-width="1" opacity="0.22">
        <path d="M96 88 H264 M96 108 H264 M96 128 H264 M96 148 H264 M96 168 H264"/>
        <path d="M118 76 V190 M146 76 V190 M174 76 V190 M202 76 V190 M230 76 V190"/>
      </g>
      <circle cx="160" cy="140" r="17" fill="none" stroke="${C.blood}" stroke-width="3.4"/>
      <path d="M160 132 v16 M152 140 h16" stroke="${C.blood}" stroke-width="2" opacity="0.7"/>
    </g>`),

  /* ── 拖拽痕迹（地毯） ───────────────────────────────── */
  dragMark: () => wrap(`
    <rect x="0" y="150" width="${W}" height="90" fill="#2b2a25"/>
    <g opacity="0.5" stroke="#171614" stroke-width="1">
      ${Array.from({ length: 14 }, (_, i) => `<path d="M0 ${156 + i * 6} H${W}"/>`).join('')}
    </g>
    <g stroke="#4a4436" stroke-width="9" stroke-linecap="round" opacity="0.85" fill="none">
      <path d="M58 186 q60 -16 132 -4 q42 6 84 -4"/>
      <path d="M64 200 q64 -14 130 -4 q40 6 80 -6"/>
    </g>
    <g stroke="${C.blood}" stroke-width="2" opacity="0.5" fill="none">
      <path d="M96 182 q46 -10 92 -2"/><path d="M150 196 q50 -8 96 -4"/>
    </g>
    <g fill="${C.blood}" opacity="0.45">
      <ellipse cx="120" cy="176" rx="7" ry="3"/><ellipse cx="196" cy="172" rx="5" ry="2.4"/>
      <ellipse cx="248" cy="182" rx="6" ry="2.6"/>
    </g>`),

  /* ── 沙发 ───────────────────────────────────────────── */
  sofa: () => wrap(`
    <ellipse cx="180" cy="204" rx="130" ry="14" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <rect x="70" y="104" width="220" height="76" rx="12" fill="#3d4a52"/>
    <rect x="56" y="126" width="26" height="56" rx="10" fill="#33414a"/>
    <rect x="278" y="126" width="26" height="56" rx="10" fill="#33414a"/>
    <rect x="86" y="118" width="88" height="52" rx="9" fill="#48565f"/>
    <rect x="186" y="118" width="88" height="52" rx="9" fill="#48565f"/>
    <rect x="86" y="150" width="188" height="8" fill="#000" opacity="0.25"/>
    <ellipse cx="212" cy="150" rx="34" ry="14" fill="${C.blood}" opacity="0.42"/>
    <ellipse cx="212" cy="150" rx="34" ry="14" fill="none" stroke="${C.blood}" stroke-width="1.4" opacity="0.6"/>
    <g opacity="0.55" stroke="${C.gold}" stroke-width="2" fill="none">
      <path d="M108 138 q10 -8 20 0"/><path d="M126 148 q8 -6 16 0"/>
    </g>`),

  /* ── 药箱 ───────────────────────────────────────────── */
  medBox: () => wrap(`
    <ellipse cx="180" cy="204" rx="120" ry="13" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <rect x="84" y="92" width="192" height="98" rx="8" fill="#4a3b2c"/>
    <rect x="84" y="92" width="192" height="22" rx="8" fill="#5a4835"/>
    <rect x="156" y="126" width="48" height="10" rx="5" fill="${C.gold}"/>
    <rect x="170" y="112" width="20" height="14" rx="4" fill="${C.gold}"/>
    <g>
      <rect x="104" y="132" width="16" height="44" rx="4" fill="#7f8a93"/>
      <rect x="128" y="140" width="16" height="36" rx="4" fill="${C.jade}" opacity="0.8"/>
      <rect x="152" y="132" width="16" height="44" rx="4" fill="#7f8a93"/>
      <rect x="200" y="136" width="16" height="40" rx="4" fill="#8a6f4a"/>
      <rect x="224" y="144" width="16" height="32" rx="4" fill="#7f8a93" opacity="0.5"/>
      <g stroke="#000" stroke-opacity="0.3" stroke-width="2">
        <path d="M108 146 h8"/><path d="M212 150 h8"/><path d="M228 156 h8"/>
      </g>
      <rect x="240" y="150" width="10" height="26" rx="3" fill="none" stroke="${C.blood}" stroke-width="1.6" stroke-dasharray="4 3"/>
    </g>`),

  /* ── 乌头草 ─────────────────────────────────────────── */
  aconite: () => wrap(`
    <g stroke="${C.jade}" stroke-width="3.4" fill="none" opacity="0.9">
      <path d="M180 214 L180 96"/><path d="M180 160 q-34 -8 -50 -34"/><path d="M180 138 q34 -6 52 -32"/>
    </g>
    <g fill="#2f4a3c" opacity="0.95">
      <path d="M132 126 q-22 -6 -30 10 q18 8 30 -10 Z"/>
      <path d="M230 106 q22 -6 30 10 q-18 8 -30 -10 Z"/>
      <path d="M148 168 q-24 -2 -32 14 q20 6 32 -14 Z"/>
    </g>
    <g fill="#6f5a8f" opacity="0.95">
      <path d="M180 92 q-20 -6 -22 -26 q-2 -16 10 -22 q14 6 14 24 q0 16 -2 24 Z"/>
      <path d="M160 118 q-18 -4 -22 -22 q-3 -14 8 -20 q13 6 14 22 q1 14 0 20 Z"/>
      <path d="M200 112 q18 -4 22 -22 q3 -14 -8 -20 q-13 6 -14 22 q-1 14 0 20 Z"/>
    </g>
    <g fill="#9c86bd" opacity="0.6">
      <path d="M178 78 q-8 -12 -2 -22 q6 10 6 22 Z"/>
      <path d="M158 104 q-8 -10 -3 -20 q7 9 7 20 Z"/>
    </g>
    <path d="M172 150 L192 150" stroke="${C.blood}" stroke-width="3"/>
    <path d="M176 150 L176 162" stroke="${C.blood}" stroke-width="2" opacity="0.7"/>
    <circle cx="182" cy="152" r="9" fill="${C.blood}" opacity="0.2"/>`),

  /* ── 笔记本 ─────────────────────────────────────────── */
  notebook: () => wrap(`
    <rect x="94" y="52" width="176" height="148" rx="6" fill="#000" opacity="0.5" filter="url(#soft)"/>
    <rect x="90" y="48" width="176" height="148" rx="6" fill="#3a3228"/>
    <rect x="102" y="56" width="152" height="132" rx="3" fill="#ded0ad"/>
    ${lines(114, 74, 128, 8, 14, C.ink, 0.45)}
    <path d="M196 60 L214 60 L214 96 L205 88 L196 96 Z" fill="${C.blood}" opacity="0.7"/>
    <g stroke="${C.ink}" stroke-width="1.6" opacity="0.7" fill="none">
      <path d="M114 152 q14 -14 26 0 q10 10 22 -6 q12 -16 26 2"/>
    </g>
    <g fill="${C.gold}" opacity="0.85">
      <rect x="80" y="66" width="10" height="10" rx="2"/><rect x="80" y="106" width="10" height="10" rx="2"/>
      <rect x="80" y="146" width="10" height="10" rx="2"/>
    </g>`),

  /* ── 剪报 ───────────────────────────────────────────── */
  clipping: () => wrap(`
    ${paperSheet(84, 40, 192, 164, 1.5, '#d8c9a4')}
    <g transform="rotate(1.5 180 122)">
      <rect x="98" y="52" width="164" height="18" fill="${C.ink}" opacity="0.8"/>
      <rect x="98" y="76" width="164" height="8" fill="${C.ink}" opacity="0.5"/>
      ${lines(98, 96, 92, 7, 13, C.ink, 0.4)}
      <rect x="200" y="94" width="62" height="52" fill="#8d9099" opacity="0.75"/>
      <g fill="${C.ink}" opacity="0.5">
        <circle cx="220" cy="112" r="7"/><circle cx="242" cy="110" r="6"/>
        <path d="M206 146 q16 -26 34 -6 q12 12 22 6"/>
      </g>
      <path d="M200 146 q22 14 30 -8 q6 -16 32 -6" stroke="${C.blood}" stroke-width="2.4" fill="none" opacity="0.8"/>
      ${lines(98, 152, 164, 3, 13, C.ink, 0.4)}
      <rect x="98" y="72" width="60" height="0" fill="none"/>
    </g>`),

  /* ── 印章 ───────────────────────────────────────────── */
  stamp: () => wrap(`
    <ellipse cx="180" cy="196" rx="80" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <g transform="rotate(-8 180 120)">
      <rect x="150" y="58" width="60" height="54" rx="14" fill="#4a3524"/>
      <rect x="162" y="50" width="36" height="14" rx="6" fill="#5c452f"/>
      <rect x="128" y="112" width="104" height="20" rx="5" fill="#3a2a1d"/>
      <rect x="122" y="132" width="116" height="52" rx="6" fill="#2f2216"/>
      <path d="M122 184 v10 h116 v-10 Z" fill="${C.blood}" opacity="0.6"/>
    </g>
    <g transform="rotate(6 268 78)">
      <rect x="234" y="52" width="68" height="52" rx="4" fill="${C.blood}" opacity="0.5"/>
      <rect x="234" y="52" width="68" height="52" rx="4" fill="none" stroke="${C.blood}" stroke-width="2.4"/>
      <g stroke="${C.blood}" stroke-width="3" opacity="0.85" fill="none">
        <path d="M248 66 h40 M248 78 h40 M248 90 h30"/>
      </g>
    </g>`),

  /* ── 录音带 ─────────────────────────────────────────── */
  tape: () => wrap(`
    <rect x="66" y="76" width="228" height="120" rx="10" fill="#21262c"/>
    <rect x="66" y="76" width="228" height="120" rx="10" fill="none" stroke="${C.steel2}" stroke-width="2"/>
    <rect x="88" y="98" width="184" height="52" rx="6" fill="#0d1014"/>
    <circle cx="146" cy="124" r="20" fill="none" stroke="${C.sepia}" stroke-width="3"/>
    <circle cx="214" cy="124" r="20" fill="none" stroke="${C.sepia}" stroke-width="3"/>
    <g stroke="${C.sepia}" stroke-width="2" opacity="0.6">
      <path d="M146 106 v36 M214 106 v36"/>
    </g>
    <rect x="130" y="160" width="100" height="12" rx="3" fill="#3a4149"/>
    <g fill="${C.steel}" opacity="0.6">
      <rect x="86" y="162" width="8" height="8" rx="2"/><rect x="266" y="162" width="8" height="8" rx="2"/>
    </g>
    <path d="M96 88 q84 -14 168 0" stroke="${C.gold}" stroke-width="1.4" fill="none" opacity="0.4"/>`),

  /* ── 脚印 ───────────────────────────────────────────── */
  shoePrint: () => wrap(`
    <rect x="0" y="0" width="${W}" height="${H}" fill="#241f19" opacity="0.5"/>
    <g opacity="0.6" stroke="#151210" stroke-width="1">
      ${Array.from({ length: 20 }, (_, i) => `<path d="M0 ${30 + i * 11} q90 -10 180 0 q90 10 180 0"/>`).join('')}
    </g>
    <g transform="rotate(-14 150 120)">
      <path d="M126 60 q22 -12 34 8 q10 18 6 52 q-4 34 -12 48 q-10 18 -24 10 q-14 -8 -14 -30 q0 -30 2 -52 q2 -26 8 -36 Z" fill="#0f0d0b" opacity="0.85"/>
      <g stroke="#4c4436" stroke-width="2.4" opacity="0.9">
        <path d="M132 84 h26 M130 100 h30 M130 116 h30 M132 132 h26 M134 148 h22"/>
      </g>
    </g>
    <g transform="rotate(10 246 150)" opacity="0.7">
      <path d="M232 112 q18 -10 28 6 q8 15 5 43 q-3 28 -10 40 q-8 15 -20 8 q-11 -7 -11 -25 q0 -25 1 -43 q2 -21 7 -29 Z" fill="#0f0d0b"/>
      <g stroke="#4c4436" stroke-width="2" opacity="0.85">
        <path d="M237 132 h22 M235 146 h25 M236 160 h23 M239 174 h19"/>
      </g>
    </g>
    <g fill="${C.blood}" opacity="0.35">
      <ellipse cx="96" cy="188" rx="8" ry="4"/><ellipse cx="288" cy="86" rx="6" ry="3"/>
    </g>`),

  /* ── 侧门 ───────────────────────────────────────────── */
  sideDoor: () => wrap(`
    <rect x="86" y="34" width="130" height="182" fill="#1d2128" stroke="#3d4650" stroke-width="3"/>
    <rect x="100" y="48" width="102" height="154" fill="#2b3138"/>
    <g stroke="#39414a" stroke-width="2" fill="none">
      <rect x="112" y="62" width="78" height="52" rx="3"/><rect x="112" y="126" width="78" height="62" rx="3"/>
    </g>
    <circle cx="192" cy="130" r="6" fill="${C.gold}"/>
    <rect x="186" y="122" width="12" height="16" rx="2" fill="${C.gold}" opacity="0.85"/>
    <g fill="${C.steel2}" opacity="0.9">
      <rect x="82" y="56" width="12" height="22" rx="2"/><rect x="82" y="164" width="12" height="22" rx="2"/>
    </g>
    <path d="M216 190 L216 100" stroke="${C.gold}" stroke-width="2" stroke-dasharray="6 5" opacity="0.7" fill="none"/>
    <path d="M206 96 L226 96 L216 78 Z" fill="${C.gold}" opacity="0.7"/>
    <g fill="#0c0e11" opacity="0.7">
      <ellipse cx="252" cy="206" rx="18" ry="8"/><ellipse cx="276" cy="190" rx="14" ry="6"/>
    </g>`),

  /* ── 账本 ───────────────────────────────────────────── */
  ledger: () => wrap(`
    <rect x="60" y="60" width="240" height="130" rx="5" fill="#000" opacity="0.5" filter="url(#soft)"/>
    <path d="M180 62 L56 70 L56 178 L180 186 Z" fill="#dccba6"/>
    <path d="M180 62 L304 70 L304 178 L180 186 Z" fill="#e8dcc0"/>
    <path d="M180 62 L180 186" stroke="${C.ink}" stroke-width="2" opacity="0.5"/>
    <g stroke="${C.ink}" stroke-width="1.2" opacity="0.35">
      <path d="M74 92 L166 88 M74 112 L166 108 M74 132 L166 128 M74 152 L166 148"/>
      <path d="M194 88 L290 92 M194 108 L290 112 M194 128 L290 132 M194 148 L290 152"/>
    </g>
    <g fill="${C.blood}" opacity="0.8">
      <rect x="222" y="104" width="52" height="8" rx="2"/>
      <rect x="222" y="144" width="42" height="8" rx="2"/>
    </g>
    <g stroke="${C.ink}" stroke-width="1.6" opacity="0.6" fill="none">
      <path d="M200 80 q14 8 24 0 q10 -8 22 2"/>
    </g>`),

  /* ── 手臂烧伤疤 ─────────────────────────────────────── */
  scar: () => wrap(`
    <ellipse cx="180" cy="200" rx="120" ry="12" fill="#000" opacity="0.45" filter="url(#soft6)"/>
    <g transform="rotate(-16 180 120)">
      <path d="M96 78 q40 -18 76 -4 q46 18 88 6 q18 -4 22 12 q6 26 -14 42 q-28 22 -74 26 q-46 4 -74 -14 q-24 -16 -24 -40 Z" fill="#c9a184"/>
      <path d="M96 78 q40 -18 76 -4 q46 18 88 6 q18 -4 22 12 q6 26 -14 42 q-28 22 -74 26 q-46 4 -74 -14 q-24 -16 -24 -40 Z" fill="none" stroke="#8e6b54" stroke-width="2"/>
      <g fill="${C.blood}" opacity="0.55">
        <path d="M148 106 q18 -14 34 2 q12 12 26 -4 q8 -10 20 2 q10 10 -4 22 q-18 14 -34 2 q-12 -12 -26 2 q-10 8 -18 -6 q-6 -12 2 -20 Z"/>
      </g>
      <g stroke="#8e2f2f" stroke-width="1.4" opacity="0.6" fill="none">
        <path d="M156 110 q16 -8 28 4"/><path d="M186 122 q14 -8 24 2"/><path d="M164 128 q16 -8 28 2"/>
      </g>
      <g stroke="#c9a184" stroke-width="1" opacity="0.5" fill="none">
        <path d="M110 96 q40 -12 74 0"/><path d="M112 152 q40 14 76 6"/>
      </g>
    </g>`),

  /* ── 酒瓶 ───────────────────────────────────────────── */
  bottle: () => wrap(`
    <ellipse cx="180" cy="206" rx="90" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <path d="M162 56 L198 56 L198 96 q22 14 22 46 v50 q0 12 -12 12 h-56 q-12 0 -12 -12 v-50 q0 -32 22 -46 Z" fill="#2f4a3c" opacity="0.85"/>
    <path d="M166 60 L182 60 L182 100 q-8 6 -8 14 v86 h-6 q-8 0 -8 -8 v-78 q0 -32 20 -44 Z" fill="#4d7360" opacity="0.5"/>
    <rect x="158" y="42" width="44" height="20" rx="4" fill="#3a2a1d"/>
    <rect x="142" y="140" width="76" height="40" rx="3" fill="${C.paper}" opacity="0.9"/>
    <g fill="${C.ink}" opacity="0.6">
      <rect x="152" y="150" width="56" height="5" rx="2"/><rect x="152" y="162" width="40" height="4" rx="2"/>
    </g>
    <path d="M148 128 q34 8 66 -2" stroke="${C.gold}" stroke-width="1.6" fill="none" opacity="0.6"/>`),

  /* ── 手帕 ───────────────────────────────────────────── */
  handkerchief: () => wrap(`
    <rect x="0" y="0" width="${W}" height="${H}" fill="#1a1d23"/>
    <rect x="38" y="34" width="284" height="172" fill="#000" opacity="0.5" filter="url(#soft)"/>
    <path d="M44 40 L316 40 L316 200 L44 200 Z" fill="#ddd4bd"/>
    <g stroke="#b7ab8d" stroke-width="1.6" fill="none" opacity="0.9">
      <path d="M44 52 L316 52"/><path d="M44 188 L316 188"/><path d="M56 40 L56 200"/><path d="M304 40 L304 200"/>
    </g>
    <g transform="rotate(-6 180 130)">
      <path d="M96 96 q40 -20 84 -6 q46 14 78 -2" stroke="#c8bda2" stroke-width="1.6" fill="none"/>
      <ellipse cx="176" cy="132" rx="46" ry="30" fill="${C.blood}" opacity="0.32"/>
      <ellipse cx="176" cy="132" rx="46" ry="30" fill="none" stroke="${C.blood}" stroke-width="1.4" opacity="0.5"/>
      <g fill="${C.jade}" opacity="0.4">
        <ellipse cx="150" cy="118" rx="16" ry="10"/><ellipse cx="206" cy="146" rx="14" ry="9"/>
      </g>
    </g>`),

  /* ── 台灯 ───────────────────────────────────────────── */
  lamp: () => wrap(`
    <path d="M232 40 L330 210 L134 210 Z" fill="${C.gold}" opacity="0.08"/>
    <ellipse cx="180" cy="206" rx="70" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <path d="M150 92 L210 92 L228 130 L132 130 Z" fill="#4a5560"/>
    <path d="M150 92 L210 92 L218 108 L142 108 Z" fill="#5d6a76"/>
    <rect x="174" y="130" width="12" height="60" fill="#3d4650"/>
    <ellipse cx="180" cy="194" rx="34" ry="8" fill="#3d4650"/>
    <ellipse cx="180" cy="132" rx="46" ry="5" fill="${C.gold}" opacity="0.55"/>
    <g fill="${C.paper}" opacity="0.5">
      <rect x="236" y="176" width="60" height="12" rx="2"/>
      <rect x="240" y="192" width="52" height="3" rx="1.5"/>
    </g>`),

  /* ── 通话记录 ───────────────────────────────────────── */
  callLog: () => wrap(`
    ${paperSheet(78, 38, 204, 168, -1.5, '#d9ceb0')}
    <g transform="rotate(-1.5 180 122)">
      <rect x="92" y="50" width="120" height="10" rx="3" fill="${C.ink}" opacity="0.7"/>
      <g stroke="${C.ink}" stroke-width="1.4" opacity="0.4">
        <path d="M92 74 H266 M92 94 H266 M92 114 H266 M92 134 H266 M92 154 H266 M92 174 H266 M92 190 H266"/>
        <path d="M186 66 V196"/>
      </g>
      <g fill="${C.blood}" opacity="0.85">
        <rect x="200" y="100" width="54" height="8" rx="2"/>
        <rect x="200" y="140" width="44" height="8" rx="2"/>
        <rect x="200" y="180" width="58" height="8" rx="2"/>
      </g>
      <g fill="${C.ink}" opacity="0.45">
        <rect x="98" y="80" width="70" height="6" rx="2"/><rect x="98" y="100" width="62" height="6" rx="2"/>
        <rect x="98" y="120" width="72" height="6" rx="2"/><rect x="98" y="140" width="56" height="6" rx="2"/>
        <rect x="98" y="160" width="68" height="6" rx="2"/><rect x="98" y="180" width="60" height="6" rx="2"/>
      </g>
    </g>`),

  /* ── 雨伞 ───────────────────────────────────────────── */
  umbrella: () => wrap(`
    <ellipse cx="180" cy="206" rx="104" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <path d="M62 122 q118 -104 236 0 q-30 -18 -59 0 q-30 -18 -59 0 q-30 -18 -59 0 q-30 -18 -59 0 Z" fill="#2b3540"/>
    <path d="M62 122 q118 -104 236 0" fill="none" stroke="${C.steel2}" stroke-width="2.4"/>
    <path d="M180 70 L180 196" stroke="#3d4650" stroke-width="4"/>
    <path d="M180 196 q0 16 -16 16 q-12 0 -14 -12" stroke="${C.gold}" stroke-width="4" fill="none"/>
    <path d="M180 60 L180 74" stroke="${C.gold}" stroke-width="4"/>
    <g stroke="#3d4650" stroke-width="1.6" fill="none" opacity="0.7">
      <path d="M120 92 q60 -34 120 0"/><path d="M92 108 q88 -50 176 0"/>
    </g>
    <g fill="${C.steel}" opacity="0.3">
      <circle cx="96" cy="196" r="4"/><circle cx="262" cy="202" r="3"/><circle cx="118" cy="208" r="3"/>
    </g>`),

  /* ── 花瓶 / 花（温室） ─────────────────────────────── */
  greenhouse: () => wrap(`
    <g stroke="${C.steel2}" stroke-width="1.4" fill="none" opacity="0.45">
      <path d="M0 40 H${W} M0 96 H${W} M0 152 H${W}"/>
      <path d="M60 0 V${H} M150 0 V${H} M240 0 V${H} M310 0 V${H}"/>
    </g>
    <path d="M40 24 L320 24 L300 0 L60 0 Z" fill="#5c6a74" opacity="0.16"/>
    <g transform="translate(0,-6)">
      <path d="M150 200 q-8 -60 22 -96" stroke="${C.jade}" stroke-width="3" fill="none"/>
      <path d="M196 202 q6 -52 -22 -88" stroke="${C.jade}" stroke-width="3" fill="none"/>
      <g fill="#2f4a3c">
        <path d="M150 140 q-26 -8 -34 12 q22 8 34 -12 Z"/>
        <path d="M186 150 q26 -8 34 12 q-22 8 -34 -12 Z"/>
      </g>
      <g fill="#6f5a8f">
        <path d="M172 104 q-18 -6 -20 -24 q-2 -14 9 -20 q13 6 13 22 q0 14 -2 22 Z"/>
        <path d="M162 126 q-16 -4 -20 -20 q-3 -13 7 -18 q12 5 13 20 q1 12 0 18 Z"/>
      </g>
      <rect x="128" y="170" width="76" height="34" rx="6" fill="#8a5a3c"/>
      <rect x="128" y="166" width="76" height="10" rx="4" fill="#a06a48"/>
    </g>`),

  /* ── 保险柜 ─────────────────────────────────────────── */
  safe: () => wrap(`
    <ellipse cx="180" cy="208" rx="110" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
    <rect x="86" y="48" width="188" height="156" rx="8" fill="#252b33"/>
    <rect x="98" y="60" width="164" height="132" rx="5" fill="#2f3740"/>
    <rect x="98" y="60" width="164" height="132" rx="5" fill="none" stroke="${C.steel2}" stroke-width="2"/>
    <circle cx="180" cy="126" r="40" fill="#1b2027" stroke="${C.steel}" stroke-width="3"/>
    <circle cx="180" cy="126" r="30" fill="none" stroke="${C.steel2}" stroke-width="1.6"/>
    <g stroke="${C.gold}" stroke-width="3">
      <path d="M180 96 v10"/><path d="M180 146 v10"/><path d="M150 126 h10"/><path d="M200 126 h10"/>
      <path d="M159 105 l7 7"/><path d="M194 140 l7 7"/><path d="M201 105 l-7 7"/><path d="M166 140 l-7 7"/>
    </g>
    <path d="M180 126 L180 104" stroke="${C.gold}" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="180" cy="126" r="5" fill="${C.gold}"/>
    <rect x="240" y="112" width="8" height="28" rx="3" fill="${C.steel2}"/>
    <g fill="${C.gold}" opacity="0.6">
      <rect x="112" y="76" width="30" height="6" rx="3"/>
    </g>`),

  /* ── 全家福（拼图用，需要有足够辨识度） ─────────────── */
  family: () => wrap(`
    <rect x="0" y="0" width="${W}" height="86" fill="#20262e"/>
    <path d="M0 86 L0 62 L34 62 L34 40 L58 40 L58 62 L74 62 L74 34 L98 34 L98 62 L120 62 L120 46 L146 46 L146 62 L180 62 L180 28 L206 28 L206 62 L232 62 L232 44 L258 44 L258 62 L286 62 L286 38 L312 38 L312 62 L${W} 62 L${W} 86 Z" fill="#12161b"/>
    <g fill="#2c3440">
      <rect x="176" y="4" width="34" height="30" rx="3"/>
      <rect x="70" y="10" width="26" height="24" rx="3"/>
      <rect x="282" y="12" width="28" height="22" rx="3"/>
    </g>
    <g fill="${C.gold}" opacity="0.4">
      <rect x="182" y="12" width="8" height="10" rx="1.5"/><rect x="196" y="12" width="8" height="10" rx="1.5"/>
      <rect x="76" y="18" width="6" height="8" rx="1.5"/><rect x="288" y="18" width="6" height="8" rx="1.5"/>
    </g>
    <rect x="0" y="86" width="${W}" height="12" fill="#3a3630"/>
    <g stroke="#5b5548" stroke-width="2" fill="none">
      <path d="M0 92 H${W}"/>
    </g>
    <rect x="0" y="98" width="${W}" height="100" fill="#4a453c"/>
    <g opacity="0.35" stroke="#2f2b25" stroke-width="1.4">
      <path d="M0 118 H${W} M0 140 H${W} M0 162 H${W} M0 184 H${W}"/>
      <path d="M40 98 V198 M96 98 V198 M152 98 V198 M208 98 V198 M264 98 V198 M320 98 V198"/>
    </g>
    <g fill="#6b6355" opacity="0.5">
      <ellipse cx="60" cy="196" rx="46" ry="8"/><ellipse cx="300" cy="196" rx="46" ry="8"/>
    </g>
    <g>
      <circle cx="126" cy="112" r="17" fill="#c9a184"/>
      <path d="M109 108 q17 -22 34 0 q-6 -14 -17 -14 q-11 0 -17 14 Z" fill="#3a2f27"/>
      <path d="M112 132 q14 -12 28 0 l6 42 h-40 Z" fill="#7c6a72"/>
      <path d="M126 126 v50" stroke="#000" stroke-opacity="0.15" stroke-width="1.4"/>
      <circle cx="234" cy="112" r="17" fill="#c9a184"/>
      <path d="M217 110 q4 -22 20 -20 q14 2 14 22 q2 -26 -17 -26 q-19 0 -17 24 Z" fill="#4a3b30"/>
      <path d="M220 132 q14 -12 28 0 l6 42 h-40 Z" fill="#5b6b74"/>
      <path d="M234 126 v50" stroke="#000" stroke-opacity="0.15" stroke-width="1.4"/>
    </g>
    <g>
      <circle cx="176" cy="140" r="11" fill="#d3ab8c"/>
      <path d="M176 128 v26" stroke="#000" stroke-opacity="0.1" stroke-width="1.2"/>
      <path d="M164 158 q12 -10 24 0 l5 34 h-34 Z" fill="#8a6f5a"/>
      <path d="M166 128 q10 -12 20 0" stroke="#4a3b30" stroke-width="5" fill="none"/>
      <circle cx="204" cy="158" r="9" fill="#d3ab8c"/>
      <path d="M195 176 q9 -8 18 0 l4 26 h-26 Z" fill="#6f5f52"/>
    </g>
    <path d="M204 158 q14 -2 20 6" stroke="#d3ab8c" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M218 160 q6 2 8 6" stroke="#d3ab8c" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <g fill="${C.blood}" opacity="0.5">
      <ellipse cx="228" cy="166" rx="7" ry="5"/>
      <path d="M222 162 q6 -4 13 0 q5 4 -1 7 q-7 4 -12 -1 Z"/>
    </g>
    <path d="M0 198 h${W}" stroke="#2a2620" stroke-width="2"/>
    <g fill="${C.ink}" opacity="0.72">
      <path d="M158 214 q22 -6 44 0 q6 2 0 5 q-22 6 -44 0 q-6 -3 0 -5 Z"/>
    </g>
    <rect x="196" y="206" width="150" height="26" rx="3" fill="#000" opacity="0.25"/>`),

  /* ── 门牌 / 地图针 ─────────────────────────────────── */
  pin: () => wrap(`
    <circle cx="180" cy="110" r="58" fill="${C.blood}" opacity="0.16"/>
    <path d="M180 44 q40 0 40 40 q0 30 -40 76 q-40 -46 -40 -76 q0 -40 40 -40 Z" fill="${C.blood}" opacity="0.85"/>
    <circle cx="180" cy="84" r="16" fill="#151a20"/>
    <ellipse cx="180" cy="188" rx="46" ry="10" fill="#000" opacity="0.5" filter="url(#soft6)"/>`),
};

/** 深色装饰底图（无具体物件，用于“传闻/氛围”类线索） */
A.rumor = () => wrap(`
  <g stroke="${C.sepia}" stroke-width="1" opacity="0.25" fill="none">
    <path d="M20 200 q60 -60 120 -20 q60 40 120 -30 q40 -40 80 -10"/>
    <path d="M20 170 q70 -50 130 -10 q60 40 110 -40"/>
  </g>
  <g fill="${C.sepia}" opacity="0.5">
    <circle cx="80" cy="90" r="3"/><circle cx="150" cy="70" r="2.4"/><circle cx="240" cy="96" r="3.4"/>
    <circle cx="290" cy="140" r="2.2"/><circle cx="60" cy="150" r="2.6"/>
  </g>
  <path d="M126 120 h108 M126 138 h84" stroke="${C.sepia}" stroke-width="3" opacity="0.3"/>`);

A.photo = A.photoBurnt;
A.box = A.medBox;

/* ── 以下为《光明照相馆》三人本新增的道具 ───────────── */

/** 封蜡上的针孔 */
A.waxSeal = () => wrap(`
  <ellipse cx="180" cy="212" rx="70" ry="10" fill="#000" opacity="0.5" filter="url(#soft6)"/>
  <g>
    <path d="M150 200 L150 120 q0 -14 30 -14 q30 0 30 14 L210 200 Z" fill="#2f4034" opacity="0.85"/>
    <path d="M154 200 L154 122 q0 -10 12 -12 L154 190 Z" fill="#4d7360" opacity="0.45"/>
    <rect x="146" y="96" width="68" height="26" rx="5" fill="#5a1f1a"/>
    <path d="M146 108 q34 -12 68 0 q-6 12 -34 12 q-28 0 -34 -12 Z" fill="${C.blood}" opacity="0.85"/>
    <path d="M146 108 q34 -12 68 0" fill="none" stroke="#7d2a22" stroke-width="2"/>
    <circle cx="196" cy="106" r="3.4" fill="#120c08"/>
    <circle cx="196" cy="106" r="6.4" fill="none" stroke="${C.gold}" stroke-width="1" opacity="0.8" stroke-dasharray="2 2"/>
  </g>
  <g transform="translate(232 44)">
    <circle cx="46" cy="46" r="42" fill="none" stroke="${C.gold}" stroke-width="2" opacity="0.75"/>
    <path d="M46 14 L46 78 M14 46 L78 46" stroke="${C.gold}" stroke-width="1.4" opacity="0.5"/>
    <circle cx="46" cy="46" r="5" fill="#120c08" stroke="${C.gold}" stroke-width="1.4"/>
    <path d="M64 28 L86 6" stroke="${C.gold}" stroke-width="3.4"/>
    <text x="46" y="104" text-anchor="middle" font-size="11" fill="${C.gold}" opacity="0.85">蜡 封 上 的 针 孔</text>
  </g>`);

/** 暗房：红灯、三个药盘、一张正在显影的相纸 */
A.darkroom = () => wrap(`
  <rect width="${W}" height="${H}" fill="#2a0d0c" opacity="0.55"/>
  <ellipse cx="180" cy="30" rx="120" ry="70" fill="${C.blood}" opacity="0.28" filter="url(#soft6)"/>
  <g fill="#c0503c" opacity="0.75">
    <rect x="158" y="6" width="44" height="18" rx="4"/>
  </g>
  <path d="M158 24 L120 200 L240 200 L202 24 Z" fill="${C.blood}" opacity="0.14"/>
  <rect x="30" y="150" width="${W - 60}" height="70" rx="4" fill="#1a1c20"/>
  <rect x="30" y="150" width="${W - 60}" height="8" fill="#26292e"/>
  <g>
    <rect x="52" y="158" width="76" height="34" rx="4" fill="#3a3f45"/>
    <rect x="142" y="158" width="76" height="34" rx="4" fill="#3a3f45"/>
    <rect x="232" y="158" width="76" height="34" rx="4" fill="#3a3f45"/>
    <rect x="56" y="162" width="68" height="26" rx="3" fill="#5a6a72" opacity="0.55"/>
    <rect x="146" y="162" width="68" height="26" rx="3" fill="#6a6250" opacity="0.4"/>
    <rect x="236" y="162" width="68" height="26" rx="3" fill="#4a5560" opacity="0.4"/>
  </g>
  <g transform="rotate(-6 90 176)">
    <rect x="66" y="168" width="48" height="16" rx="2" fill="${C.paper}" opacity="0.72"/>
    <rect x="72" y="172" width="30" height="8" rx="2" fill="#3a3a3a" opacity="0.5"/>
  </g>
  <g stroke="${C.sepia}" stroke-width="3" fill="none" opacity="0.4">
    <path d="M264 150 q18 -34 30 -52"/>
  </g>
  <g fill="${C.paper}" opacity="0.5">
    <rect x="292" y="82" width="34" height="26" rx="2"/>
    <rect x="300" y="60" width="34" height="26" rx="2"/>
  </g>
  <path d="M0 0 h${W} v${H} h-${W} Z" fill="none"/>`);

/** 一卷底片（反转色调） */
A.negative = () => wrap(`
  <g transform="rotate(-7 180 120)">
    <rect x="34" y="78" width="${W - 68}" height="86" rx="4" fill="#1a1512" opacity="0.95"/>
    <rect x="34" y="78" width="${W - 68}" height="86" rx="4" fill="none" stroke="#3a2f26" stroke-width="1.6"/>
    <g fill="${C.paper}" opacity="0.5">
      ${Array.from({ length: 18 }, (_, i) => `<rect x="${44 + i * 15}" y="82" width="6" height="5" rx="1"/>`).join('')}
      ${Array.from({ length: 18 }, (_, i) => `<rect x="${44 + i * 15}" y="155" width="6" height="5" rx="1"/>`).join('')}
    </g>
    <g>
      <rect x="48" y="92" width="62" height="58" rx="2" fill="#cfd6dc" opacity="0.28"/>
      <rect x="118" y="92" width="62" height="58" rx="2" fill="#cfd6dc" opacity="0.42"/>
      <rect x="188" y="92" width="62" height="58" rx="2" fill="#cfd6dc" opacity="0.22"/>
      <rect x="258" y="92" width="62" height="58" rx="2" fill="#cfd6dc" opacity="0.14"/>
      <g fill="#0e0b09" opacity="0.8">
        <circle cx="79" cy="112" r="8"/><path d="M66 148 q13 -24 26 0 Z"/>
        <circle cx="149" cy="108" r="9"/><path d="M135 148 q14 -26 28 0 Z"/>
        <circle cx="219" cy="116" r="7"/><path d="M209 148 q10 -22 20 0 Z"/>
        <circle cx="289" cy="120" r="6"/><path d="M281 148 q8 -18 16 0 Z"/>
      </g>
      <g stroke="${C.gold}" stroke-width="1.6" opacity="0.5" fill="none">
        <path d="M48 96 v50 M110 96 v50 M118 96 v50 M180 96 v50 M188 96 v50 M250 96 v50 M258 96 v50 M320 96 v50"/>
      </g>
    </g>
  </g>
  <text x="180" y="212" text-anchor="middle" font-size="12" fill="${C.gold}" opacity="0.75" letter-spacing="3">B — 1 9 7 5</text>`);

/** 药水：三只深色玻璃瓶，中间那瓶缺了一半 */
A.chemicals = () => wrap(`
  <ellipse cx="180" cy="206" rx="120" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
  <g>
    <rect x="56" y="96" width="52" height="108" rx="6" fill="#3a2a1d" opacity="0.95"/>
    <rect x="62" y="104" width="40" height="70" rx="4" fill="#5a3f2a" opacity="0.55"/>
    <rect x="70" y="80" width="24" height="20" rx="4" fill="#2a1f16"/>
    <rect x="64" y="132" width="36" height="46" rx="3" fill="${C.paper}" opacity="0.82"/>
    <g fill="${C.ink}" opacity="0.6"><rect x="68" y="140" width="28" height="4" rx="2"/><rect x="68" y="150" width="22" height="3" rx="1.5"/></g>
  </g>
  <g>
    <rect x="154" y="76" width="58" height="128" rx="7" fill="#3a2a1d"/>
    <rect x="161" y="84" width="44" height="112" rx="5" fill="#4a3524"/>
    <rect x="161" y="134" width="44" height="62" rx="4" fill="#6a4a2c" opacity="0.9"/>
    <rect x="170" y="58" width="26" height="22" rx="4" fill="#2a1f16"/>
    <rect x="164" y="150" width="38" height="52" rx="3" fill="#d8cbb0" opacity="0.92"/>
    <g fill="#8e2f2f" opacity="0.9">
      <rect x="168" y="158" width="30" height="12" rx="2"/>
    </g>
    <g fill="${C.ink}" opacity="0.65">
      <rect x="168" y="176" width="26" height="4" rx="2"/><rect x="168" y="186" width="20" height="3" rx="1.5"/>
    </g>
    <path d="M164 150 h38" stroke="#000" stroke-opacity="0.3" stroke-width="2"/>
  </g>
  <g opacity="0.9">
    <rect x="242" y="104" width="48" height="100" rx="6" fill="#3a2a1d" opacity="0.8"/>
    <rect x="248" y="112" width="36" height="58" rx="4" fill="#26443a" opacity="0.6"/>
    <rect x="254" y="88" width="22" height="20" rx="4" fill="#2a1f16"/>
    <rect x="250" y="140" width="32" height="42" rx="3" fill="${C.paper}" opacity="0.7"/>
    <g fill="${C.ink}" opacity="0.5"><rect x="254" y="148" width="24" height="4" rx="2"/><rect x="254" y="158" width="18" height="3" rx="1.5"/></g>
  </g>`);

/** 双反相机 */
A.camera = () => wrap(`
  <ellipse cx="180" cy="208" rx="96" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
  <g>
    <rect x="112" y="52" width="136" height="60" rx="8" fill="#2b2b2f"/>
    <rect x="112" y="52" width="136" height="12" rx="6" fill="#3d3d43"/>
    <circle cx="180" cy="104" r="26" fill="#14161a" stroke="${C.steel}" stroke-width="3"/>
    <circle cx="180" cy="104" r="16" fill="#0a0c0f"/>
    <circle cx="180" cy="104" r="8" fill="${C.steel}" opacity="0.5"/>
    <circle cx="180" cy="104" r="24" fill="none" stroke="#5f6a77" stroke-width="1" opacity="0.7"/>
    <rect x="146" y="76" width="18" height="10" rx="2" fill="${C.steel2}"/>
    <rect x="196" y="76" width="18" height="10" rx="2" fill="${C.steel2}"/>
  </g>
  <rect x="112" y="112" width="136" height="82" rx="6" fill="#33261c"/>
  <g stroke="#4a3728" stroke-width="1.4" opacity="0.8">
    <path d="M112 126 h136 M112 142 h136 M112 158 h136 M112 174 h136"/>
  </g>
  <rect x="112" y="112" width="136" height="82" rx="6" fill="none" stroke="#241a12" stroke-width="2"/>
  <rect x="150" y="126" width="60" height="14" rx="3" fill="${C.steel2}"/>
  <circle cx="230" cy="176" r="7" fill="${C.gold}"/>
  <rect x="126" y="184" width="14" height="20" rx="4" fill="#241a12"/>
  <rect x="220" y="184" width="14" height="20" rx="4" fill="#241a12"/>
  <path d="M180 52 v-14" stroke="${C.steel2}" stroke-width="3"/>
  <circle cx="180" cy="34" r="6" fill="${C.steel}"/>
  <g fill="${C.ink}" opacity="0.55">
    <rect x="128" y="94" width="0" height="0"/>
  </g>`);

/** 老街：一排门脸、一块招牌、一盏路灯 */
A.street = () => wrap(`
  <rect width="${W}" height="${H}" fill="#141a1f"/>
  <g fill="#1d242c">
    <rect x="0" y="40" width="86" height="150"/>
    <rect x="92" y="24" width="72" height="166"/>
    <rect x="170" y="52" width="94" height="138"/>
    <rect x="270" y="34" width="90" height="156"/>
  </g>
  <g fill="${C.gold}" opacity="0.22">
    <rect x="14" y="96" width="26" height="30" rx="2"/>
    <rect x="104" y="82" width="22" height="26" rx="2"/>
    <rect x="188" y="104" width="26" height="30" rx="2"/>
    <rect x="292" y="88" width="24" height="28" rx="2"/>
  </g>
  <g fill="${C.gold}" opacity="0.5">
    <rect x="48" y="120" width="18" height="22" rx="2"/>
    <rect x="136" y="112" width="16" height="20" rx="2"/>
    <rect x="236" y="126" width="18" height="22" rx="2"/>
    <rect x="330" y="116" width="16" height="20" rx="2"/>
  </g>
  <rect x="92" y="176" width="72" height="14" fill="#3a2c1e"/>
  <rect x="100" y="184" width="56" height="12" rx="2" fill="${C.paper}" opacity="0.85"/>
  <g fill="${C.ink}" opacity="0.7">
    <rect x="106" y="188" width="44" height="4" rx="2"/>
  </g>
  <path d="M236 24 L236 0" stroke="${C.steel2}" stroke-width="3"/>
  <circle cx="236" cy="30" r="9" fill="${C.gold}" opacity="0.75"/>
  <path d="M236 39 L216 220 L256 220 Z" fill="${C.gold}" opacity="0.1"/>
  <rect x="0" y="188" width="${W}" height="52" fill="#1a1712"/>
  <g stroke="#2b2620" stroke-width="2" opacity="0.8">
    <path d="M0 202 H${W} M0 216 H${W} M0 230 H${W}"/>
  </g>
  <g fill="#0e0c0a" opacity="0.5">
    <ellipse cx="120" cy="212" rx="34" ry="7"/><ellipse cx="250" cy="226" rx="28" ry="6"/>
  </g>`);

/* ── 以下为《江顺号 · 夜航》四人本新增的道具 ───────── */

/** 铁撬棍 */
A.crowbar = () => wrap(`
  <ellipse cx="180" cy="204" rx="112" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
  <g transform="rotate(-22 180 120)">
    <rect x="46" y="112" width="206" height="17" rx="4" fill="#4a4742"/>
    <rect x="46" y="112" width="206" height="6" rx="3" fill="#6b6760" opacity="0.8"/>
    <path d="M252 112 q22 -4 26 -18 q2 -10 -8 -12 q-10 -2 -14 12 Z" fill="#58544e"/>
    <path d="M252 120 q20 4 24 16 q2 9 -7 11 q-10 2 -13 -10 Z" fill="#58544e"/>
    <rect x="40" y="108" width="26" height="25" rx="8" fill="#3a3630"/>
    <g stroke="#2b2823" stroke-width="1.6" opacity="0.8">
      <path d="M56 118 h18 M56 124 h18"/>
    </g>
    <rect x="96" y="112" width="44" height="17" fill="#3a3630"/>
    <g fill="${C.blood}" opacity="0.75">
      <ellipse cx="118" cy="121" rx="17" ry="5"/>
      <path d="M104 126 q14 6 28 0 q-4 8 -14 8 q-10 0 -14 -8 Z"/>
    </g>
  </g>
  <g fill="${C.blood}" opacity="0.4">
    <ellipse cx="248" cy="182" rx="7" ry="4"/><ellipse cx="268" cy="196" rx="5" ry="3"/>
  </g>`);

/** 后脑两处伤（圆形钝伤 + 条状挫伤） */
A.woundPair = () => wrap(`
  <g>
    <path d="M112 44 q68 -14 132 6 q22 8 20 34 q-2 26 -26 32 q-72 18 -134 -2 q-20 -6 -18 -30 q2 -30 26 -40 Z"
          fill="#c9a184" stroke="#8e6b54" stroke-width="2"/>
    <g stroke="#a9836a" stroke-width="1" opacity="0.45" fill="none">
      <path d="M108 78 q70 -16 138 2"/><path d="M110 104 q70 -10 136 0"/>
    </g>
    <g>
      <circle cx="150" cy="86" r="15" fill="${C.blood}" opacity="0.55"/>
      <circle cx="150" cy="86" r="15" fill="none" stroke="#5e1f1a" stroke-width="2"/>
      <circle cx="150" cy="86" r="9" fill="#6d241d" opacity="0.7"/>
    </g>
    <g>
      <path d="M196 82 q30 -2 46 4 q-16 8 -46 6 q-6 -5 0 -10 Z" fill="${C.blood}" opacity="0.5"/>
      <path d="M196 82 q30 -2 46 4" stroke="#5e1f1a" stroke-width="2" fill="none"/>
      <g stroke="#5e1f1a" stroke-width="1.2" opacity="0.6">
        <path d="M200 80 l0 12"/><path d="M210 79 l0 13"/><path d="M220 79 l0 13"/>
      </g>
    </g>
  </g>
  <g transform="translate(76 150)">
    <circle cx="34" cy="30" r="22" fill="none" stroke="${C.gold}" stroke-width="1.6" opacity="0.8"/>
    <text x="34" y="36" text-anchor="middle" font-size="15" fill="${C.gold}">圆</text>
    <path d="M62 30 h44" stroke="${C.gold}" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.6"/>
    <text x="146" y="36" text-anchor="middle" font-size="11.5" fill="${C.gold}" opacity="0.9">边缘整齐 · 出血多</text>
  </g>
  <text x="180" y="206" text-anchor="middle" font-size="11" fill="${C.gold}" opacity="0.75" letter-spacing="2">条状 · 中间深两边浅 · 出血少</text>`);

/** 铜手炉 */
A.handWarmer = () => wrap(`
  <ellipse cx="180" cy="202" rx="82" ry="12" fill="#000" opacity="0.5" filter="url(#soft6)"/>
  <g>
    <ellipse cx="180" cy="112" rx="62" ry="24" fill="#a5823f"/>
    <path d="M118 112 q0 56 62 56 q62 0 62 -56 Z" fill="#c9a05a"/>
    <ellipse cx="180" cy="112" rx="62" ry="24" fill="#d8b877"/>
    <ellipse cx="180" cy="110" rx="48" ry="17" fill="#8a6a30"/>
    <g stroke="#6d5222" stroke-width="1.4" opacity="0.85" fill="none">
      <path d="M150 106 q30 -8 60 0"/><path d="M150 114 q30 8 60 0"/>
      <circle cx="180" cy="110" r="6"/>
      <path d="M168 110 h-14 M192 110 h14"/>
    </g>
    <path d="M118 112 q0 56 62 56 q62 0 62 -56" fill="none" stroke="#8a6a30" stroke-width="2"/>
    <g fill="#a5823f">
      <path d="M180 84 q-16 -22 -30 -20 q-8 2 -4 12 q4 12 30 14 Z"/>
      <path d="M180 84 q16 -22 30 -20 q8 2 4 12 q-4 12 -30 14 Z"/>
    </g>
    <rect x="172" y="80" width="16" height="10" rx="4" fill="#8a6a30"/>
    <g fill="${C.blood}" opacity="0.6">
      <ellipse cx="146" cy="150" rx="12" ry="6"/>
      <path d="M136 152 q10 8 22 0 q-2 8 -11 8 q-9 0 -11 -8 Z"/>
    </g>
    <path d="M170 154 q10 -4 20 0" stroke="#5e1f1a" stroke-width="1.4" fill="none" opacity="0.6"/>
  </g>`);

/**
 * 把 SVG 字符串转成可直接放进 <img src> 的 data URI（客户端与服务器共用）。
 */
function toDataUri(name) {
  const fn = A[name] || A.rumor;
  const svg = fn();
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export { A, toDataUri, C as PALETTE };
