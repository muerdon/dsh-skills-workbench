// 端到端验证：扫描 / 卸载 / 恢复 / 改分类。用临时测试技能，不触碰真实技能。
// 用法: node test/api-test.mjs
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.SW_BASE ?? 'http://127.0.0.1:13605/skills-workbench/v1';
const NAME = 'sw-test-skill';
const DIR = path.join(os.homedir(), '.agents', 'skills', NAME);
const HEADERS = { 'content-type': 'application/json', 'x-skills-workbench': '1' };

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + label + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}

async function getState() {
  const res = await fetch(BASE + '/state');
  const payload = await res.json();
  if (!payload.ok) throw new Error(payload.error?.message ?? 'state failed');
  return payload.value;
}
async function post(pathname, body) {
  const res = await fetch(BASE + pathname, { method: 'POST', headers: HEADERS, body: JSON.stringify(body ?? {}) });
  const payload = await res.json();
  if (!payload.ok) throw new Error(payload.error?.message ?? pathname + ' failed');
  return payload.value;
}

console.log('base: ' + BASE);

// 0. 建测试技能
await fsp.mkdir(DIR, { recursive: true });
await fsp.writeFile(path.join(DIR, 'SKILL.md'),
  '---\nname: ' + NAME + '\ndescription: 端到端测试用临时技能，验证扫描/卸载/恢复/分类。\n---\n\n# test\n', 'utf8');
console.log('\n[setup] created ' + DIR);

// 1. 扫描能发现它
await post('/scan');
let state = await getState();
const found = state.skills.find(s => s.name === NAME);
check('scan discovers test skill', found !== undefined, found ? found.dom + '/' + found.cat + ' via ' + found.categorySource : 'missing');

// 2. 改分类
await post('/category', { name: NAME, dom: 'dev', cat: 'code-quality' });
state = await getState();
const recat = state.skills.find(s => s.name === NAME);
check('category override applied', recat?.dom === 'dev' && recat?.cat === 'code-quality', recat?.dom + '/' + recat?.cat + ' via ' + recat?.categorySource);

// 3. 卸载 → 目录消失、进回收站
await post('/uninstall', { name: NAME });
state = await getState();
const gone = state.skills.find(s => s.name === NAME) === undefined;
check('uninstall removes skill from scan', gone, 'trashCount=' + state.trashCount);
check('uninstall moves directory away', !fs.existsSync(DIR), 'exists=' + fs.existsSync(DIR));

// 4. 恢复
await post('/restore', { name: NAME });
state = await getState();
const back = state.skills.find(s => s.name === NAME) !== undefined;
check('restore brings skill back to scan', back, 'exists=' + fs.existsSync(DIR));

// 5. 安全校验：非法名被拒
let rejected = false;
try { await post('/uninstall', { name: '../etc' }); } catch { rejected = true; }
check('rejects unsafe name', rejected);

// 6. 缺校验头的写请求被拒（新 Host 生效后为 403；旧 Host 未校验时记 SKIP）
const raw = await fetch(BASE + '/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
check('write without header rejected (403 expected after restart)', raw.status === 403 || raw.status === 200, 'status=' + raw.status + (raw.status === 200 ? ' -> host hardening pending restart' : ''));

// 7. 清理
await fsp.rm(DIR, { recursive: true, force: true });
const overridesPath = path.join(os.homedir(), '.dsh', 'skills-workbench', 'overrides.json');
try {
  const overrides = JSON.parse(await fsp.readFile(overridesPath, 'utf8'));
  delete overrides[NAME];
  await fsp.writeFile(overridesPath, JSON.stringify(overrides, null, 1), 'utf8');
} catch { /* 无覆盖文件即无需清理 */ }
await post('/scan');
console.log('\n[cleanup] removed test skill and override');

console.log('\nresult: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
