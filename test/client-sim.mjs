/**
 * Client 半边仿真测试：stub 宿主（__ModuleLoader__ / React / ctx / fetch），
 * 真实加载 client.js 并执行 apply，断言 slot 注册与审计修复的行为。
 * 覆盖：A1（分阶段兜错+上报）、A4/A5（props 透传）、B1（ctx.layout）、A10/A11（静态）。
 * 运行：node --test test/client-sim.mjs
 */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CLIENT_SRC = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const INDEX_SRC = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

// ---- React stub：只提供 createElement。组件函数不会被真正渲染，hooks 不会执行。----
const h = (type, props, ...children) => ({ type, props: props ?? {}, children: children.length === 1 ? children[0] : children });
const React = { createElement: h };
// React 的 createElement 只返回「元素描述」，组件函数由渲染器调用。
// 这里对**无 hooks 的纯组件**做一步手动渲染，用于断言最终 DOM 属性。
const renderEl = el => (typeof el.type === 'function' ? renderEl(el.type(el.props)) : el);
const reqStub = name => {
  if (name === 'react') return React;
  throw new Error('client-sim 未提供的模块: ' + name);
};

// ---- 捕获 __ModuleLoader__.load 注册 ----
let loaded = null;
const window = { __ModuleLoader__: { load(mod) { loaded = mod; } } };
new Function('window', 'require', CLIENT_SRC)(window, reqStub);

const plugin = loaded.factory(reqStub);

// ---- fetch stub：捕获 /diag 上报（A1）----
const diagCalls = [];
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('/diag')) {
    diagCalls.push({ url: String(url), body: JSON.parse(opts.body ?? '{}') });
    return { ok: true, status: 200, json: async () => ({ ok: true, value: {} }) };
  }
  return { ok: false, status: 404, text: async () => 'not found', json: async () => ({ ok: false, error: { message: 'no route' } }) };
};

const allCleanups = [];

function makeCtx(overrides = {}) {
  const slots = [];
  let panelOpened = null;
  const cleanups = [];
  allCleanups.push(cleanups);
  const sessionsStub = {
    list: { getSnapshot: () => ({ current: 'session-abc12345' }), subscribe: undefined },
  };
  const ctx = {
    effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); },
    get(name) { return name === 'sessions' ? sessionsStub : undefined; },
    layout: { selectPanel(id) { panelOpened = id; } },
    slots: {
      inject(_slotName, fn) { fn(); },
      register(def, render) { slots.push({ def, render }); },
    },
    _slots: slots,
    _panelOpened: () => panelOpened,
    ...overrides,
  };
  return ctx;
}

// 每个用例后清掉 effect 里的定时器 —— 否则 node --test 的 event loop 永不空闲、
// 进程挂住不退（这本身也是仿真测试必须覆盖的真实行为：宿主卸载时 effect cleanup 要跑）。
afterEach(() => {
  while (allCleanups.length > 0) {
    const list = allCleanups.pop();
    for (const cleanup of list.splice(0)) { try { cleanup(); } catch { /* ignore */ } }
  }
});

test('client 向 __ModuleLoader__ 注册，factory 返回 inject + apply', () => {
  assert.ok(loaded, 'load 被调用');
  assert.ok(Array.isArray(plugin.inject) && plugin.inject.includes('slots'));
  assert.equal(typeof plugin.apply, 'function');
});

test('apply 正常宿主：注册 main + sidebar.panellist 两个 slot', () => {
  const ctx = makeCtx();
  plugin.apply(ctx);
  const defs = ctx._slots.map(s => s.def);
  const main = defs.find(d => d.name === 'main');
  const side = defs.find(d => d.name === 'sidebar.panellist');
  assert.ok(main, 'main slot 已注册');
  assert.equal(main.key, 'skills-workbench');
  assert.equal(main.id, 'skills-workbench-panel');
  assert.ok(side, 'sidebar.panellist slot 已注册');
  assert.equal(side.id, 'skills-workbench');
});

test('A4：sidebar 渲染透传宿主 owner props（size / active）', () => {
  const ctx = makeCtx();
  plugin.apply(ctx);
  const side = ctx._slots.find(s => s.def.name === 'sidebar.panellist');
  const desc = side.render({ size: 16, active: true });
  // ① owner props 真的透传进了组件
  assert.equal(desc.props.size, 16, '宿主 size 透传到 SidebarEntry');
  assert.equal(desc.props.active, true, '宿主 active 透传到 SidebarEntry');
  // ② 最终渲染结果也正确（SidebarEntry 是无 hooks 的纯组件，可安全渲染）
  const active = renderEl(desc);
  assert.equal(active.type, 'button');
  assert.equal(active.props['data-active'], '1', '宿主给 active:true → 高亮');
  assert.equal(active.props.style.width, 16, '宿主给 size:16 → 用 16，不再恒为 30');
  assert.equal(typeof desc.props.open, 'function', 'open 回调仍在');
  const idle = renderEl(side.render({}));
  assert.equal(idle.props['data-active'], '0');
  assert.equal(idle.props.style.width, 30, '无 owner props 时回退默认 30');
});

test('A5：main 渲染透传宿主 owner props（不吞参、不抛错）', () => {
  const ctx = makeCtx();
  plugin.apply(ctx);
  const main = ctx._slots.find(s => s.def.name === 'main');
  const el = main.render({ anyOwnerProp: 1 });
  assert.ok(el, 'main render 返回元素');
  assert.ok(el.props.ctx, 'Panel 拿到 ctx');
});

test('B1：open() 走 ctx.layout.selectPanel（宿主文档口径）', () => {
  const ctx = makeCtx();
  plugin.apply(ctx);
  const side = ctx._slots.find(s => s.def.name === 'sidebar.panellist');
  const active = side.render({ size: 16, active: false });
  active.props.open();
  assert.equal(ctx._panelOpened(), 'skills-workbench');
});

test('A1：apply 内部阶段抛错不冒泡，失败上报到 /diag', async () => {
  diagCalls.length = 0;
  const ctx = makeCtx({ effect() { throw new Error('boom-in-effect'); } });
  assert.doesNotThrow(() => plugin.apply(ctx), 'apply 不应向宿主抛异常');
  // styles 阶段失败 → reportDiag('styles')；register 阶段仍应完成
  await new Promise(resolve => setTimeout(resolve, 20));
  const hit = diagCalls.find(call => call.body.stage === 'styles');
  assert.ok(hit, 'diag 上报包含 styles 阶段');
  assert.ok(hit.body.detail.includes('boom-in-effect'), '上报含错误信息');
  assert.ok(hit.url.includes('/diag'), '上报目标是 /diag');
});

test('A1 配套：/diag 上报携带宿主校验头（否则会被 403 拦截）', () => {
  // 静态断言：reportDiag 的 fetch 必须带 x-skills-workbench 头
  assert.ok(/\/diag'[\s\S]{0,300}x-skills-workbench/.test(CLIENT_SRC), 'client.js 的 /diag 请求带校验头');
});

test('A10/A11 静态断言：post 判 res.ok；waitForSession 有失效令牌', () => {
  assert.ok(/if \(!res\.ok\)/.test(CLIENT_SRC), 'post() 检查 res.ok');
  assert.ok(/sessionWaitToken/.test(CLIENT_SRC), 'waitForSession 存在取消令牌');
});

test('A6：label 不再硬编码中文（双语 fallback）', () => {
  assert.ok(!/label: \(\) => '技能工作台'/.test(CLIENT_SRC), 'label 不再是纯中文硬编码');
});

test('启动链路：package.json 不再声明 immediately（启动卡死最大嫌疑）', () => {
  assert.equal(PKG.dsh?.client?.immediately, undefined);
  // 1.1.1 起 client.js 的模块 id 在发布构建时重写为包名；版本只需 >= 1.1.0
  assert.ok(PKG.version !== '1.0.0' && /^\d+\.\d+\.\d+$/.test(PKG.version), `version=${PKG.version}`);
});

test('发布版 client id 必须与包名一致（boot 按「包名」建 loader entry）', () => {
  // 源码包名是 @local/dsh-skills-workbench，源码 client.js 的 id 与之一致；
  // 发布构建会把两者同时落到 dsh-skills-workbench。这里验证源码侧的一致性。
  assert.ok(CLIENT_SRC.includes("id: '@local/dsh-skills-workbench'"), '源码 id 与源码包名一致');
});

test('A7 静态断言：Host 的 SESSIONS_ROOT 尊重 DSH_HOME', () => {
  assert.ok(/process\.env\.DSH_HOME/.test(INDEX_SRC), 'index.js 读取 DSH_HOME');
});
