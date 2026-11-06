/**
 * 仿真宿主实例：用真实 HTTP 服务器 + 插件真实 handler 跑起来，
 * 让端到端测试（uninstall-e2e / trash-ui-check / api-test）能连真实端口跑。
 * 用法: node test/serve-sim.mjs [port]
 * 隔离: DSH_HOME 指向临时目录，状态与日志都不污染真实安装。
 */
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.argv[2] ?? 9208);
// SWB_TEST_HOME：让测试进程与实例共用同一个隔离 DSH_HOME（pwsh 一条龙时设置）。
const TMP = process.env.SWB_TEST_HOME || mkdtempSync(path.join(os.tmpdir(), 'swb-serve-sim-'));
process.env.DSH_HOME = TMP;

const { apply } = await import('../index.js');

const routes = [];
const cleanups = [];
const webServer = { register: def => { routes.push(def); return () => {}; } };
const ctx = {
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); },
  get(name) { return name === 'webServer' ? webServer : undefined; },
};

apply(ctx);
const route = routes[0];
if (!route) { console.error('未注册路由'); process.exit(1); }

const server = http.createServer(async (req, res) => {
  if (!String(req.url ?? '').startsWith(route.path)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { message: 'not found' } }));
    return;
  }
  try {
    await route.handler(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { message: String(error) } }));
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`仿真实例已启动: http://127.0.0.1:${PORT}${route.path}  (DSH_HOME=${TMP})`);
});

const shutdown = () => {
  try { for (const dispose of cleanups.splice(0)) dispose(); } catch { /* ignore */ }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
