/**
 * Host 半边仿真测试：stub 宿主 webServer，真实走插件的 HTTP handler。
 * 覆盖审计修复：路由注册、/state 契约（serverReady/watcherDegraded）、
 * /diag client 错误上报、DSH_HOME 会话扫描（A7）。
 * 运行：node --test test/host-sim.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

// ---- 隔离环境：必须在动态 import 之前设置 DSH_HOME（store/scanner 模块级读 env）----
const TMP = mkdtempSync(path.join(os.tmpdir(), 'swb-host-sim-'));
process.env.DSH_HOME = TMP;

for (const name of ['alpha-skill', 'beta-skill']) {
  const dir = path.join(TMP, 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} 仿真测试技能。\n---\n\n# ${name}\n正文。\n`);
}
// 假会话：模拟 <DSH_HOME>/sessions/<group>/session-<id>/session.v4.jsonl.zstd
for (const [group, id] of [['grp-a', 'session-aaa1'], ['grp-a', 'session-aaa2'], ['grp-b', 'session-bbb1']]) {
  const d = path.join(TMP, 'sessions', group, id);
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, 'session.v4.jsonl.zstd'), 'fake-zstd');
}

const { apply, name: pluginName, inject } = await import('../index.js');
const { STATE_DIR, LOG_PATH } = await import('../lib/store.js');

const routes = [];
const cleanups = [];
const webServer = { register: def => { routes.push(def); return () => {}; } };
const ctx = {
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); },
  get(name) { return name === 'webServer' ? webServer : undefined; },
};

apply(ctx);

async function callRoute(method, subPath, bodyObj) {
  assert.ok(routes.length >= 1, 'prefix 路由已注册');
  const route = routes[0];
  const headers = {};
  if (method !== 'GET') headers['x-skills-workbench'] = '1';
  const req = Readable.from(bodyObj ? [Buffer.from(JSON.stringify(bodyObj))] : []);
  req.method = method;
  req.url = route.path + subPath;
  req.headers = headers;
  req.socket = { remoteAddress: '127.0.0.1' };
  const res = {
    statusCode: 0, headers: null, body: null, headersSent: false,
    writeHead(code, h) { this.statusCode = code; this.headers = h; this.headersSent = true; },
    end(b) { this.body = b; },
  };
  await route.handler(req, res);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
}

async function waitForScan() {
  for (let i = 0; i < 60; i++) {
    const r = await callRoute('GET', '/state');
    if (r.json?.ok && (r.json.value?.skills?.length ?? 0) > 0 && r.json.value?.scannedAt) return r;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

test('插件元数据：name / inject 声明', () => {
  assert.equal(pluginName, 'dsh-skills-workbench');
  assert.ok(Array.isArray(inject) && inject.includes('webServer'));
});

test('路由注册：prefix /skills-workbench/v1', () => {
  assert.equal(routes.length, 1);
  assert.equal(routes[0].kind, 'prefix');
  assert.equal(routes[0].path, '/skills-workbench/v1');
  assert.equal(typeof routes[0].handler, 'function');
});

test('/state 契约：技能、serverReady、watcherDegraded（A2/A9 字段）', async () => {
  const r = await waitForScan();
  assert.ok(r, '启动扫描在超时内完成');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  const names = r.json.value.skills.map(s => s.name);
  assert.ok(names.includes('alpha-skill') && names.includes('beta-skill'), '扫描到假技能');
  assert.equal(r.json.value.serverReady, true);
  assert.equal(r.json.value.watcherDegraded, false);
  assert.ok(Array.isArray(r.json.value.catalog?.domains) && r.json.value.catalog.domains.length > 0);
});

test('/diag：client 错误上报落到 debug.log（A1 配套）', async () => {
  const r = await callRoute('POST', '/diag', { stage: 'test-stage', detail: 'hello-diag' });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  const logText = readFileSync(LOG_PATH, 'utf8');
  assert.ok(logText.includes('client-diag [test-stage]'), 'debug.log 含 client-diag 行');
});

test('A7：SESSIONS_ROOT 尊重 DSH_HOME —— /sessions 能列出假会话', async () => {
  const r = await callRoute('GET', '/sessions');
  assert.equal(r.status, 200);
  const disk = r.json.value?.diskSessions ?? [];
  const ids = disk.map(item => item.id);
  assert.ok(ids.includes('session-aaa1'), 'session-aaa1 出现在磁盘扫描结果');
  assert.ok(ids.includes('session-bbb1'), 'session-bbb1 出现在磁盘扫描结果');
  assert.equal(disk.length, 3);
});

test('状态目录落在 DSH_HOME 下（隔离验证）', () => {
  assert.ok(STATE_DIR.startsWith(TMP), `STATE_DIR=${STATE_DIR} 应在 ${TMP} 下`);
  assert.ok(readFileSync(LOG_PATH, 'utf8').includes('applying: prefix route'), '日志含路由注册行');
});

test('dispose：清理不抛错', () => {
  for (const dispose of cleanups.splice(0)) dispose();
});
