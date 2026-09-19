import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { attachGame } from './game.js';
import { A } from './data/art.js';
import { listScenarios, DEFAULT_SCENARIO_ID } from './data/registry.js';
import { config, clientRuntimeConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = config.port;
const WANT_HTTPS = config.https;

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', true);

/**
 * 资源指纹：按文件 mtime 生成 ?v=xxx。
 * 只靠 Cache-Control 不够 —— 浏览器会用内存缓存直接顶掉普通刷新，
 * 改了样式却看不到效果。指纹一变 URL 就变，必然重新拉取。
 */
const ASSETS = [
  'public/css/style.css',
  'public/js/main.js', 'public/js/book.js', 'public/js/ui.js',
  'public/js/minigames.js', 'public/js/voice.js',
];
const assetVersion = (() => {
  let newest = 0;
  for (const rel of ASSETS) {
    try { newest = Math.max(newest, fs.statSync(path.join(ROOT, rel)).mtimeMs); } catch { /* 缺文件就算了 */ }
  }
  return Math.floor(newest).toString(36);
})();

/** 首页：把 ?v=dev 换成真实指纹 */
for (const route of ['/', '/index.html']) {
  app.get(route, (_req, res) => {
    try {
      const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8')
        .replace(/\?v=dev/g, `?v=${assetVersion}`);
      res.set('Cache-Control', 'no-cache').type('html').send(html);
    } catch (err) {
      res.status(500).send('index.html 读取失败：' + err.message);
    }
  });
}

app.use(express.static(path.join(ROOT, 'public'), {
  extensions: ['html'],
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (/\.(html|css|js|mjs)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

/** 线索插画：按名字即时生成 SVG（可离线、无外部素材） */
app.get('/api/art/:name', (req, res) => {
  const name = String(req.params.name || '').replace(/[^a-zA-Z]/g, '');
  const fn = A[name] || A.rumor;
  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.send(fn());
});

/** 首页要用的剧本清单（不含任何剧透） */
app.get('/api/scenarios', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({
    defaultId: DEFAULT_SCENARIO_ID,
    scenarios: listScenarios(),
    accessRequired: !!config.accessCode,
  });
});

/** 浏览器要用的 WebRTC 配置（STUN / TURN） */
app.get('/api/rtc-config', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(clientRuntimeConfig());
});

app.get('/api/health', (_req, res) => res.json({ ok: true, scenarios: [...listScenarios().keys()].length }));

/* ── 服务器实例（HTTP 或自签 HTTPS） ──────────────── */
let server;
let scheme = 'http';

if (WANT_HTTPS) {
  const dir = path.join(ROOT, '.certs');
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  try {
    if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
      const { generate } = await import('selfsigned');
      const lan = Object.values(os.networkInterfaces()).flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
      const extraIps = config.certIps.filter((ip) => !lan.includes(ip) && ip !== '127.0.0.1');
      if (extraIps.length) console.log('  证书额外包含：' + extraIps.join(', '));
      const altNames = [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        ...lan.map((ip) => ({ type: 7, ip })),
        ...extraIps.map((ip) => ({ type: 7, ip })),
      ];
      const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
        days: 3650, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames }],
      });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(keyFile, pems.private);
      fs.writeFileSync(certFile, pems.cert);
      console.log('  已生成自签证书 → .certs/');
    }
    server = https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app);
    scheme = 'https';
  } catch (err) {
    console.warn('  HTTPS 起不来（' + err.message + '），退回 HTTP。');
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

const io = new SocketServer(server, { maxHttpBufferSize: 1e6, pingTimeout: 20000 });
attachGame(io);

server.listen(PORT, config.host, () => {
  const nets = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('');
  console.log('  线上剧本杀已开服');
  for (const s of listScenarios()) console.log(`  · 《${s.title}》 ${s.castSize} 人本 · ${s.clueTotal} 张线索`);
  console.log('');
  if (config.publicUrl) console.log(`  访问地址 ${config.publicUrl}`);
  console.log(`  监听     ${config.host}:${PORT}  (${scheme})`);
  if (!config.publicUrl) {
    console.log(`  本机     ${scheme}://localhost:${PORT}`);
    for (const ip of nets) console.log(`  局域网   ${scheme}://${ip}:${PORT}`);
  }
  console.log('');
  console.log(`  通行码   ${config.accessCode ? '已开启（ACCESS_CODE）' : '未设置 —— 公网部署建议设置 ACCESS_CODE'}`);
  console.log(`  TURN     ${config.turnEnabled ? '已配置' : '未配置，只用公共 STUN —— 严格 NAT 的玩家可能连不上语音'}`);
  if (scheme === 'http' && !config.publicUrl && !config.trustProxy) {
    console.log('');
    console.log('  提示：浏览器只在 localhost 或 HTTPS 下允许开麦克风。');
    console.log('       公网部署请用 nginx 反代做 TLS（见 docs/部署指南.md）。');
  }
  console.log('');
});

/* ── 优雅退出：容器/服务重启时别把连接硬掐断 ────────── */
let closing = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    console.log(`
  收到 ${sig}，正在关闭……`);
    io.emit('toast', { text: '服务器正在重启，稍后刷新页面即可回到房间', kind: 'warn' });
    server.close(() => process.exit(0));
    // 兜底：10 秒内没关干净就强制退出
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
