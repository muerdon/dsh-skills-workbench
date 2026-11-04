/**
 * 技能工作台 · Host 半边。
 * 职责：扫描 skill 落地目录、监听变化（主动感知）、提供 HTTP 路由给面板、
 *       执行卸载/恢复/改分类。只依赖公开契约：ctx.get('webServer') 与 node 内置模块。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { scanAll, resolveRoots, dirExists } from './lib/scanner.js';
import { classify, catalogPayload, DOMAINS, CATEGORIES } from './lib/classify.js';
import {
  log, loadOverrides, saveOverrides, appendTrash, loadTrashIndex, removeTrashRecord,
  TRASH_DIR, LOG_PATH, STATE_DIR,
} from './lib/store.js';

export const name = 'dsh-skills-workbench';

// 依赖声明：内核会等这些服务就绪后才调用 apply。
// 缺 webServer 时 apply 可能早于它激活 → 路由一条都不注册 → 面板能渲染但数据全空
// （2026-11-03 重启后实测复现，日志记 "webServer 不可用"）。
// workspaceRegistry 是 /sessions 兜底的数据源（Workspace.sessionIds），同样按硬依赖声明，
// 否则 ctx.get 可能拿到 undefined，client 第三层兜底会静默失效。
export const inject = ['webServer', 'workspaceRegistry', 'agents', 'sessionPersistence'];

const ROUTE_PREFIX = '/skills-workbench/v1';
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
// 写操作要求自定义请求头：跨站表单提交无法携带自定义头而不触发预检，挡掉一类 CSRF。
const CLIENT_HEADER = 'x-skills-workbench';

/** 只服务本机回环，避免同机其他进程之外的来源触达卸载接口。 */
function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? '';
  return address === '' || address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// apply 时注入的 Host 服务引用。client 侧拿不到"当前会话"时，
// 由这里从 workspaceRegistry 给出最近会话 id（Workspace.sessionIds）。
let hostServices = {};

const state = {
  revision: 0,
  scannedAt: null,
  skills: [],
  roots: [],
  scanning: false,
  lastError: null,
  trashCount: 0,
  trash: [],
};

let scanTimer = null;
let scanPromise = null;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1_000_000) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return value !== null && typeof value === 'object' ? value : {};
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

function publicSkill(skill) {
  return {
    name: skill.name,
    title: skill.title,
    description: skill.description,
    dom: skill.dom,
    cat: skill.cat,
    categorySource: skill.categorySource,
    categoryReason: skill.categoryReason,
    rep: skill.rep,
    eff: skill.eff,
    effg: skill.effg,
    self: skill.self,
    triggers: skill.triggers,
    size: skill.size,
    mtime: skill.mtime,
    folders: skill.folders,
    rootId: skill.rootId,
    rootLabel: skill.rootLabel,
    dir: skill.dir,
    copies: skill.copies,
  };
}

async function rescan(reason) {
  if (scanPromise !== null) return scanPromise;
  scanPromise = (async () => {
    state.scanning = true;
    const startedAt = Date.now();
    try {
      const roots = resolveRoots();
      const overrides = await loadOverrides();
      const found = await scanAll(roots);
      const skills = found.map(skill => {
        const verdict = classify(skill, overrides);
        return {
          ...skill,
          dom: verdict.dom,
          cat: verdict.cat,
          categorySource: verdict.source,
          categoryReason: verdict.reason,
          rep: verdict.rep,
          eff: verdict.eff,
          effg: verdict.effg,
          self: verdict.self,
          triggers: verdict.triggers,
        };
      });
      skills.sort((a, b) => (a.dom === b.dom ? a.cat.localeCompare(b.cat) : a.dom.localeCompare(b.dom)) || a.name.localeCompare(b.name));
      state.skills = skills;
      state.roots = roots.map(root => ({ ...root, exists: dirExists(root.dir) }));
      state.scannedAt = new Date().toISOString();
      state.revision += 1;
      state.lastError = null;
      const trash = await loadTrashIndex();
      state.trashCount = trash.length;
      // 面板需要展示"已卸载可恢复"的清单，只暴露展示所需字段（不含内部落盘路径）
      state.trash = trash.map(item => ({
        name: item.name,
        at: item.at ?? null,
        from: item.from ?? null,
      }));
      log(`scan(${reason ?? 'manual'}) -> ${skills.length} skills, ${Date.now() - startedAt}ms, rev=${state.revision}`);
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      log(`scan failed: ${state.lastError}`);
      throw error;
    } finally {
      state.scanning = false;
      scanPromise = null;
    }
    return state;
  })();
  return scanPromise;
}

function scheduleRescan(reason) {
  if (scanTimer !== null) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanTimer = null;
    void rescan(reason).catch(() => { /* 已记日志 */ });
  }, 800);
}

function startWatching(roots, register) {
  for (const root of roots) {
    if (!dirExists(root.dir)) continue;
    try {
      const watcher = fs.watch(root.dir, { recursive: true }, (_event, filename) => {
        const name = typeof filename === 'string' ? filename : '';
        // 回收站与编辑器临时文件不算改动，避免自激重扫
        if (name.includes('.tmp') || name.includes('~') || name.startsWith('.git')) return;
        scheduleRescan('watch:' + root.id);
      });
      watcher.on('error', error => log(`watch error ${root.dir}: ${error?.message ?? error}`));
      register(() => { try { watcher.close(); } catch { /* ignore */ } });
      log(`watching ${root.dir}`);
    } catch (error) {
      log(`watch unavailable ${root.dir}: ${error?.message ?? error}`);
    }
  }
}

async function moveToTrash(skill) {
  await fsp.mkdir(TRASH_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(TRASH_DIR, `${skill.name}__${stamp}`);
  try {
    await fsp.rename(skill.dir, target);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    await fsp.cp(skill.dir, target, { recursive: true });
    await fsp.rm(skill.dir, { recursive: true, force: true });
  }
  await appendTrash({ name: skill.name, from: skill.dir, to: target, at: new Date().toISOString() });
  return target;
}

function findSkill(name) {
  return state.skills.find(skill => skill.name === name);
}

// 会话详情缓存：id -> { value, at }。5 分钟内复用，避免每次轮询都读事件日志。
const sessionDetailCache = new Map();
const DETAIL_TTL_MS = 5 * 60 * 1000;

/** 从会话事件里取首条 user/message 的文本，作为人类可辨认的标题。 */
function firstUserText(events) {
  for (const event of events ?? []) {
    if (event?.type !== 'user/message') continue;
    const message = event.data;
    // 实测结构（session.v4）：data.content = [{ type:'text', text:'…' }]；
    // 兼容早期可能存在的 data.blocks 命名。
    const blocks = message?.content ?? message?.blocks ?? [];
    if (!Array.isArray(blocks)) continue;
    const text = blocks
      .filter(block => block?.type === 'text' && typeof block.text === 'string')
      .map(block => block.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text !== '') return text.slice(0, 60);
  }
  return null;
}

/**
 * 会话详情：SessionHeader 只有 id/createdAt/cwd，没有 title。
 * 标题只能从首条用户消息推导 —— 选择器若只显示短 id，用户无法辨认（实测反馈）。
 * 事件数取实际读到的条数（stat 返回的快照里没有 eventCount 字段，实测恒为 null）。
 */
async function describeSession(id) {
  const cached = sessionDetailCache.get(id);
  if (cached !== undefined && Date.now() - cached.at < DETAIL_TTL_MS) return cached.value;

  const value = { id, title: null, createdAt: null, eventCount: null, cwd: null, readable: false };
  const persistence = hostServices.sessionPersistence;
  if (persistence !== undefined) {
    try {
      const snapshot = await persistence.stat(id);
      if (snapshot !== undefined && snapshot !== null) {
        value.createdAt = snapshot.header?.createdAt ?? null;
        value.cwd = snapshot.header?.cwd ?? null;
        if (typeof snapshot.eventCount === 'number') value.eventCount = snapshot.eventCount;
      }
    } catch { /* header 拿不到就留空，下面还有事件标题 */ }
    try {
      const handle = await persistence.open(id, 'read');
      try {
        const result = await handle.read(0, 24);
        const events = Array.isArray(result?.events) ? result.events : [];
        value.title = firstUserText(events);
        value.readable = true;
        if (value.eventCount === null) {
          // 读满 24 条说明可能还有更多，用 >= 语义由 client 显示成 "24+"
          value.eventCount = events.length;
          value.truncated = events.length >= 24;
        }
      } finally {
        try { await handle.close(); } catch { /* ignore */ }
      }
    } catch { /* 读不到事件就只给 header 信息 */ }
  }
  sessionDetailCache.set(id, { value, at: Date.now() });
  return value;
}

/** 会话落盘根目录：`~/.dsh/sessions/<编码后的cwd>/session-<id>/session.v4.jsonl.zstd`。 */
const SESSIONS_ROOT = path.join(os.homedir(), '.dsh', 'sessions');

/**
 * 直接扫描会话目录 —— 这是"事实来源"：会话在磁盘上就存在，
 * 不管它是否被 attach 到 Workspace、是否是当前活跃 agent。
 * 此前只信 workspaceRegistry / agents 两个登记表，导致未登记的旧会话
 * （如 session-63a1c476）完全不出现在选择器里（实测缺陷）。
 * 目录 mtime 近似代表"最近打开/写入"，用于排序。全部为本地目录读，成本极低。
 */
async function listSessionDirs() {
  const out = [];
  let groups = [];
  try { groups = await fsp.readdir(SESSIONS_ROOT, { withFileTypes: true }); } catch { return out; }
  for (const group of groups) {
    if (!group.isDirectory()) continue;
    const groupPath = path.join(SESSIONS_ROOT, group.name);
    let entries = [];
    try { entries = await fsp.readdir(groupPath, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('session-')) continue;
      const logFile = path.join(groupPath, entry.name, 'session.v4.jsonl.zstd');
      let mtime = 0;
      try { mtime = (await fsp.stat(logFile)).mtimeMs; } catch { continue; }
      out.push({ id: entry.name, group: group.name, mtime });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

/** 用有限并发补齐会话详情，避免 50+ 个会话串行读造成首屏卡顿。 */
async function describeMany(ids, concurrency = 8) {
  const details = {};
  for (let index = 0; index < ids.length; index += concurrency) {
    const batch = ids.slice(index, index + concurrency);
    const results = await Promise.all(batch.map(id => describeSession(id)));
    batch.forEach((id, offset) => { details[id] = results[offset]; });
  }
  return details;
}

async function handle(req, res, pathname) {
  const route = pathname.slice(ROUTE_PREFIX.length).replace(/\/+$/, '') || '/';
  const method = (req.method ?? 'GET').toUpperCase();

  if (route === '/ping') return json(res, 200, { ok: true, value: { revision: state.revision } });

  // 诊断上报：client 把自己的真实内部结构（服务键、快照键、current 值）写进 debug.log。
  // 用途：避免"猜 API → 改一版 → 让用户试"的循环（sessions.list 是否存在就是靠这个确定的）。
  if (route === '/diagnose' && method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    log('DIAG ' + JSON.stringify(body).slice(0, 4000));
    return json(res, 200, { ok: true, value: { logged: true } });
  }

  // 会话 id 来源（client 侧 sessions.list 在非会话视图下不可用时的兜底）。
  // 两个数据源：① Workspace.sessionIds（持久登记）② agents 的活跃会话（未登记时的保险）。
  if (route === '/sessions' && method === 'GET') {
    const registry = hostServices.workspaceRegistry;
    const agents = hostServices.agents;
    let workspaces = [];
    let liveSessions = [];
    let reason = null;
    if (registry !== undefined) {
      try {
        workspaces = registry.list().map(workspace => ({
          id: workspace.id,
          title: workspace.title,
          path: workspace.path,
          updatedAt: workspace.updatedAt,
          sessionIds: [...(workspace.sessionIds ?? [])],
        }));
      } catch (error) {
        reason = String(error?.message ?? error);
      }
    } else {
      reason = 'workspaceRegistry unavailable';
    }
    if (agents !== undefined) {
      try {
        const list = (agents.roots?.() ?? agents.list?.() ?? []);
        liveSessions = list.map(agent => agent?.id ?? agent?.sessionId).filter(id => typeof id === 'string' && id !== '');
      } catch { /* 活跃会话是附加保险，失败不影响主路径 */ }
    }
    const withSessions = workspaces.filter(item => item.sessionIds.length > 0);
    withSessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    const fromWorkspace = withSessions.length > 0 ? withSessions[0].sessionIds[0] : null;
    const recent = fromWorkspace ?? liveSessions[0] ?? null;

    // 会话详情：SessionHeader 没有 title，只能从首条 user/message 推出来。
    // 候选 = 磁盘上真实存在的所有会话（事实来源）× 登记表（活跃 / 工作区）的并集。
    // 磁盘扫描是主来源：未 attach 到工作区、也非活跃 agent 的旧会话（如 63a1c476）
    // 只有扫目录才能发现（实测缺陷）。
    const diskSessions = await listSessionDirs();
    const candidateIds = [...new Set([
      ...diskSessions.map(item => item.id),
      ...liveSessions,
      ...workspaces.flatMap(workspace => workspace.sessionIds),
    ])];
    const details = await describeMany(candidateIds);

    return json(res, 200, {
      ok: true,
      value: {
        workspaces,
        liveSessions,
        diskSessions,
        recent,
        details,
        recentSource: fromWorkspace !== null ? 'workspace' : (liveSessions.length > 0 ? 'agents' : 'none'),
        reason,
      },
    });
  }

  if (route === '/state' && method === 'GET') {
    // 首次扫描进行中时等它落地（最多 2.5s），避免面板首帧拿到空清单。
    // 扫描实测 100–1600ms；超时则照常返回当前快照，client 会用快轮询补上。
    if (scanPromise !== null) {
      await Promise.race([
        scanPromise.catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, 2500)),
      ]);
    }
    return json(res, 200, {
      ok: true,
      value: {
        revision: state.revision,
        scannedAt: state.scannedAt,
        scanning: state.scanning,
        lastError: state.lastError,
        roots: state.roots,
        skills: state.skills.map(publicSkill),
        catalog: catalogPayload(),
        trashCount: state.trashCount,
        trash: state.trash,
        stateDir: STATE_DIR,
      },
    });
  }

  if (route === '/scan' && method === 'POST') {
    await readBody(req).catch(() => ({}));
    await rescan('manual');
    return json(res, 200, {
      ok: true,
      value: { revision: state.revision, scannedAt: state.scannedAt, count: state.skills.length },
    });
  }

  if (route === '/uninstall' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name ?? '');
    if (!SAFE_NAME.test(name)) throw new Error('非法技能名');
    const skill = findSkill(name);
    if (skill === undefined) throw new Error(`未找到技能：${name}`);
    const target = await moveToTrash(skill);
    log(`uninstall ${name} -> ${target}`);
    await rescan('uninstall');
    return json(res, 200, { ok: true, value: { name, target, revision: state.revision } });
  }

  if (route === '/restore' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name ?? '');
    if (!SAFE_NAME.test(name)) throw new Error('非法技能名');
    const list = await loadTrashIndex();
    const record = [...list].reverse().find(item => item.name === name && dirExists(item.to));
    if (record === undefined) throw new Error(`回收区没有 ${name} 的可恢复副本`);
    if (dirExists(record.from)) throw new Error(`目标位置已存在同名技能：${record.from}`);
    await fsp.mkdir(path.dirname(record.from), { recursive: true });
    try {
      await fsp.rename(record.to, record.from);
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error;
      await fsp.cp(record.to, record.from, { recursive: true });
      await fsp.rm(record.to, { recursive: true, force: true });
    }
    log(`restore ${name} -> ${record.from}`);
    // 恢复成功必须从索引移除该记录，否则 trashCount 虚高、索引只增不减
    await removeTrashRecord(record.name, record.to);
    await rescan('restore');
    return json(res, 200, { ok: true, value: { name, dir: record.from, revision: state.revision } });
  }

  if (route === '/category' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name ?? '');
    if (!SAFE_NAME.test(name)) throw new Error('非法技能名');
    const dom = String(body.dom ?? '');
    const cat = String(body.cat ?? '');
    if (!DOMAINS.some(item => item.id === dom)) throw new Error(`未知领域：${dom}`);
    if (!CATEGORIES.some(item => item.id === cat)) throw new Error(`未知分类：${cat}`);
    const overrides = await loadOverrides();
    overrides[name] = { dom, cat, at: new Date().toISOString() };
    await saveOverrides(overrides);
    log(`category ${name} -> ${dom}/${cat}`);
    await rescan('category');
    return json(res, 200, { ok: true, value: { name, dom, cat, revision: state.revision } });
  }

  if (route === '/log' && method === 'GET') {
    let tail = '';
    try {
      const text = await fsp.readFile(LOG_PATH, 'utf8');
      tail = text.slice(-8000);
    } catch { tail = ''; }
    return json(res, 200, { ok: true, value: { tail } });
  }

  return json(res, 404, { ok: false, error: { message: `未知路由：${method} ${pathname}` } });
}

export function apply(ctx) {
  // 有 inject 声明后 webServer 必定就绪；保留兜底只为异常时留可查日志。
  const webServer = ctx.get('webServer');
  if (webServer === undefined) {
    log('webServer 不可用：技能工作台面板缺少数据通道');
    return;
  }
  log(`applying: prefix route ${ROUTE_PREFIX}`);

  // 会话 id 兜底来源；拿不到就保持 undefined，/sessions 会返回 reason 说明原因。
  hostServices = {
    workspaceRegistry: ctx.get('workspaceRegistry'),
    agents: ctx.get('agents'),
    sessionPersistence: ctx.get('sessionPersistence'),
  };
  log(`host services: workspaceRegistry=${hostServices.workspaceRegistry === undefined ? 'unavailable' : 'ok'}`
    + ` agents=${hostServices.agents === undefined ? 'unavailable' : 'ok'}`
    + ` sessionPersistence=${hostServices.sessionPersistence === undefined ? 'unavailable' : 'ok'}`);

  const disposers = [];
  const register = dispose => disposers.push(dispose);

  const disposeRoute = webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      const url = new URL(req.url ?? ROUTE_PREFIX, 'http://127.0.0.1');
      const pathname = url.pathname;
      try {
        if (!isLoopback(req)) {
          json(res, 403, { ok: false, error: { message: '仅允许本机访问' } });
          return;
        }
        const method = (req.method ?? 'GET').toUpperCase();
        if (method !== 'GET' && req.headers[CLIENT_HEADER] !== '1') {
          json(res, 403, { ok: false, error: { message: '缺少客户端校验头' } });
          return;
        }
        await handle(req, res, pathname);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`error ${req.method} ${pathname}: ${message}`);
        if (!res.headersSent) json(res, 400, { ok: false, error: { message } });
        else try { res.end(); } catch { /* ignore */ }
      }
    },
  });
  register(disposeRoute);

  const roots = resolveRoots();
  startWatching(roots, register);
  void rescan('startup').catch(() => { /* 已记日志 */ });

  ctx.effect(() => () => {
    if (scanTimer !== null) { clearTimeout(scanTimer); scanTimer = null; }
    for (const dispose of disposers.splice(0)) {
      try { dispose(); } catch { /* ignore */ }
    }
    log('disposed');
  }, 'skills-workbench: routes and watchers');
}
