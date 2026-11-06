#!/usr/bin/env node
/**
 * 一键跑本轮全部验证：语法 + client/host 仿真 + smoke。
 * 用法: node test/run-audit-verify.mjs
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE = process.execPath;
let fail = 0;
const run = (label, args) => {
  try {
    const out = execFileSync(NODE, args, { encoding: 'utf8', cwd: ROOT, timeout: 120000 });
    console.log('PASS', label);
    return out;
  } catch (error) {
    fail = 1;
    console.error('FAIL', label, '\n', (error.stdout ?? '') + (error.stderr ?? ''));
    return '';
  }
};

run('syntax client.js', ['--check', 'client.js']);
run('syntax index.js', ['--check', 'index.js']);

for (const t of ['test/client-sim.mjs', 'test/host-sim.mjs']) {
  const out = run(`sim ${t}`, ['--test', t]);
  const m = out.match(/pass (\d+)[\s\S]*?fail (\d+)/);
  if (m) console.log(`     ${m[1]} pass / ${m[2]} fail`);
}

const smoke = run('smoke scan', ['test/smoke.mjs']);
const line = smoke.split('\n').find(l => l.includes('skills found'));
if (line) console.log('    ', line.trim());
rmSync(path.join(ROOT, 'test', '.read-marker'), { force: true });
process.exit(fail);
