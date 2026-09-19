/** 快速语法体检：所有 .js/.mjs 过一遍 parser，避免一个括号错误让整个前端静默失效。 */
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = ['server', 'public/js', 'tools'];
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (['.js', '.mjs'].includes(extname(name))) files.push(full);
  }
};
for (const r of roots) walk(r);

let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log('  ok   ' + f);
  } catch (err) {
    bad++;
    console.log('  FAIL ' + f);
    console.log(String(err.stderr || '').split('\n').slice(0, 6).join('\n'));
  }
}
console.log(bad ? `\n${bad} 个文件语法有问题` : `\n${files.length} 个文件全部通过`);
process.exit(bad ? 1 : 0);
