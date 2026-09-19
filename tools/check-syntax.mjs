/**
 * 快速体检：
 *  1) 换行符：项目在 Windows 上开发、部署到 Linux。shell 脚本带上 \r 到了服务器会直接报
 *     「env: 'bash\r': No such file or directory」——所以这个必须拦住。
 *  2) 所有 .js/.mjs 过一遍 parser，避免一个括号错误让整个前端静默失效。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

// 连 shell 脚本和仓库根目录的配置一起查，别漏掉真正要紧的 deploy/*.sh
const ROOTS = ['server', 'public/js', 'deploy', 'tools', 'docs'];
const ROOT_FILES = [
  'README.md', 'package.json', 'Dockerfile', 'docker-compose.yml',
  '.env.example', '.gitignore', '.gitattributes', '.dockerignore',
];

const files = [];
const walk = (dir) => {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
};
for (const r of ROOTS) walk(r);
for (const f of ROOT_FILES) {
  try { if (statSync(f).isFile()) files.push(f); } catch { /* 没有就算了 */ }
}

const isScript = (f) => /\.(sh|js|mjs|cjs)$/i.test(f);
const isText = (f) => !/\.(png|jpe?g|gif|ico|pem|woff2?)$/i.test(f);

let bad = 0;

/* ── 1. 换行符 ─────────────────────────────────────── */
const crlf = [];
for (const f of files) {
  if (!isText(f)) continue;
  try {
    if (readFileSync(f).includes('\r\n')) crlf.push(f);
  } catch { /* 跳过读不了的 */ }
}
if (crlf.length === 0) {
  console.log('  ok   换行符全部是 LF');
} else {
  for (const f of crlf) {
    const fatal = isScript(f);   // 脚本带 CRLF 是硬错误，文档类只提醒
    console.log(`  ${fatal ? 'FAIL' : 'warn'} ${f} 带 CRLF 换行${fatal ? '（Linux 上会报 command not found）' : ''}`);
    if (fatal) bad++;
  }
}

/* ── 2. JS 语法 ────────────────────────────────────── */
const jsFiles = files.filter((f) => ['.js', '.mjs', '.cjs'].includes(extname(f)));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log('  ok   ' + f);
  } catch (err) {
    bad++;
    console.log('  FAIL ' + f);
    console.log(String(err.stderr || '').split('\n').slice(0, 6).join('\n'));
  }
}

console.log('');
console.log(bad
  ? `${bad} 个文件有问题`
  : `${files.length} 个文件全部通过（换行符 + 语法）`);
process.exit(bad ? 1 : 0);
