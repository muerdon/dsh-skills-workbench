#!/usr/bin/env node
/**
 * 安装 / 卸载往返体检（install roundtrip inspector）
 *
 * 体检三件事（对应 2026-11-06 两次真实事故）：
 *   ① pnpm store 一致性 —— node_modules 的链接来源 store 与当前期望 store 是否同盘一致
 *      （不同 → 下次 install 必报 ERR_PNPM_UNEXPECTED_STORE）
 *   ② 写锁残留 —— package.json.lock 是否存在、持有进程是否还活着
 *      （持有进程已死 = 僵尸锁 → 所有后续安装/卸载操作会永久等待）
 *   ③ profile 状态自洽性 —— dependencies / bundles / node_modules 三者是否互相吻合
 *      （卸载只改了一半 = 半卸载；bundles 里引用了 node_modules 没有实体的包 = missing bundle）
 *
 * 用法：
 *   node test/install-roundtrip.mjs --inspect "D:\path\to\profiles\ds-bot"
 *   node test/install-roundtrip.mjs --inspect <profile> --expect-uninstalled
 *   node test/install-roundtrip.mjs --self-test        # 用临时目录跑一遍状态机自测
 *
 * 只读：脚本不改 profile、不动进程。
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = name => args.includes(name);

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' };
const results = [];
const record = (name, ok, detail, level = 'error') => results.push({ name, ok: Boolean(ok), detail: String(detail ?? ''), level });

/** pnpm 同盘规则：项目在 X 盘 → 期望 store 在 X:\.pnpm-store\v11（除非全局配置了 store-dir） */
function expectedStore(projectDir) {
  const root = path.parse(path.resolve(projectDir)).root; // 'D:\\'
  return path.join(root, '.pnpm-store', 'v11');
}

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}

function inspectProfile(profileDir, { expectUninstalled = false, expectIssues = false } = {}) {
  console.log(`\n── 体检：${profileDir} ──`);
  if (!existsSync(profileDir)) {
    record('profile 存在', false, `目录不存在：${profileDir}`);
    return;
  }
  const pkg = readJson(path.join(profileDir, 'package.json'));
  const pkgOk = pkg !== null;
  record('profile package.json 可解析', pkgOk, pkgOk ? `name=${pkg.name}` : '解析失败');
  if (!pkgOk) return;

  const deps = Object.keys(pkg.dependencies ?? {});
  const bundles = pkg.dsh?.profile?.bundles ?? [];
  const nodeModules = path.join(profileDir, 'node_modules');

  /* ① store 一致性 */
  const modulesYaml = path.join(nodeModules, '.modules.yaml');
  if (existsSync(modulesYaml)) {
    const yaml = readFileSync(modulesYaml, 'utf8');
    // YAML 里键名可能带引号（"storeDir": "D:\\.pnpm-store\\v11"）
    const m = yaml.match(/"?storeDir"?\s*:\s*"?([^"\n,]+)"?/);
    const storeDir = m ? m[1].trim() : '(未记录)';
    const expect = expectedStore(profileDir);
    // 归一化：YAML 里路径被写成双反斜杠转义，先解转义再统一斜杠
    const norm = s => s.replace(/\\\\/g, '\\').replace(/\\/g, '/').toLowerCase();
    const same = norm(storeDir) === norm(expect);
    record('pnpm store 与项目同盘一致', same,
      same ? `storeDir=${storeDir}` : `storeDir=${storeDir} ≠ 期望 ${expect} —— 下次 install 会报 ERR_PNPM_UNEXPECTED_STORE，先在 profile 目录跑 pnpm install`,
      expectIssues ? 'info' : 'error');
  } else {
    record('pnpm store 记录存在', false, 'node_modules/.modules.yaml 不存在（尚未安装过依赖或已被清空）', 'warn');
  }

  /* ② 写锁残留 */
  const locks = readdirSync(profileDir).filter(n => n.endsWith('.lock'));
  if (locks.length === 0) {
    record('无写锁残留', true, 'profile 下无 .lock 文件');
  } else {
    for (const lock of locks) {
      let holder = '';
      try { holder = readFileSync(path.join(profileDir, lock), 'utf8').trim(); } catch { /* ignore */ }
      record(`写锁 ${lock} 无残留`, false,
        `持有 PID=${holder || '(未知)'} —— 持有进程仍活着时卸载/安装会死等；先关闭宿主应用再重试`, 'warn');
    }
  }

  /* ③ 状态自洽性 */
  if (expectUninstalled) {
    record('卸载后 dependencies 为空', deps.length === 0, deps.length ? `仍有 ${deps.join(', ')}` : '空');
    const pluginInBundles = bundles.filter(b => b.includes('skills-workbench'));
    record('卸载后 bundles 无本插件', pluginInBundles.length === 0, pluginInBundles.join(', ') || '已移除');
    const entity = existsSync(path.join(nodeModules, 'dsh-skills-workbench'));
    record('卸载后 node_modules 无插件实体', !entity, entity ? '实体仍在' : '已移除');
  }

  // bundles 引用的包：无实体时分级判定
  //   —— 出现在 dependencies 里的用户包缺实体 = missing bundle（error，boot 会失败）
  //   —— 不在 dependencies 里的 = 多半由宿主应用内置提供（asar 自带），只能提示（info）
  const missingHard = [];
  const missingSoft = [];
  for (const bundle of bundles) {
    if (existsSync(path.join(nodeModules, bundle))) continue;
    (deps.includes(bundle) ? missingHard : missingSoft).push(bundle);
  }
  record('bundles 引用的用户包在 node_modules 有实体', missingHard.length === 0,
    missingHard.length ? `缺实体（missing bundle 会让 boot 失败）：${missingHard.join(', ')}`
      : (missingSoft.length ? `用户包齐备；另有 ${missingSoft.length} 个内置 bundle 由宿主提供（不在 profile 依赖里）：${missingSoft.join(', ')}` : '齐备'),
    missingHard.length === 0 ? (missingSoft.length ? 'warn' : 'error') : 'error');

  // dependencies 与 node_modules 实体互查
  const depsMissing = deps.filter(d => !existsSync(path.join(nodeModules, d)));
  record('dependencies 列出的包在 node_modules 有实体', depsMissing.length === 0,
    depsMissing.length ? `缺：${depsMissing.join(', ')}` : '齐备');

  // 反向：node_modules 有实体但不在 dependencies（半挂载，pnpm install 一次就会清掉）
  if (existsSync(nodeModules)) {
    const entities = readdirSync(nodeModules).filter(n => !n.startsWith('.') && !n.startsWith('@'));
    const halfMounted = entities.filter(e => !deps.includes(e));
    record('无半挂载包（node_modules 实体均在 dependencies）', halfMounted.length === 0,
      halfMounted.length ? `半挂载：${halfMounted.join(', ')}（下次 pnpm install 会被清理）` : '无',
      'warn');
  }
}

/* ── 自测模式：用临时目录构造三种状态，验证体检逻辑本身有效 ── */
function selfTest() {
  console.log('\n── 自测：临时目录构造三种 profile 状态 ──');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'swb-roundtrip-'));
  const profile = path.join(tmp, 'profile');
  const nm = path.join(profile, 'node_modules');
  mkdirSync(path.join(nm, 'dsh-skills-workbench'), { recursive: true });
  writeFileSync(path.join(nm, '.modules.yaml'), 'storeDir: "C:\\\\Users\\\\x\\\\AppData\\\\Local\\\\pnpm\\\\store\\\\v11"\n');
  writeFileSync(path.join(profile, 'package.json'), JSON.stringify({
    name: 'x', private: true, dsh: { profile: { bundles: ['dsh-skills-workbench'] } }, dependencies: { 'dsh-skills-workbench': '^1.1.1' },
  }, null, 2));
  inspectProfile(profile, { expectIssues: true });
  const storeIssue = results.some(r => r.name.includes('store'));
  const halfIssue = results.some(r => r.name.includes('半挂载'));
  record('自测：跨盘 store 被检出', storeIssue, storeIssue ? '已检出' : '未检出——体检逻辑失效');
  record('自测：半挂载被检出', halfIssue, halfIssue ? '已检出' : '未检出——体检逻辑失效');
}

/* ── 主流程 ── */
if (has('--self-test')) {
  selfTest();
} else {
  const profile = opt('--inspect');
  if (!profile) {
    console.error('用法：node test/install-roundtrip.mjs --inspect <profile 目录> [--expect-uninstalled]\n       node test/install-roundtrip.mjs --self-test');
    process.exit(2);
  }
  inspectProfile(profile, { expectUninstalled: has('--expect-uninstalled') });
}

console.log('\n' + '─'.repeat(60));
let bad = 0;
for (const r of results) {
  if (!r.ok && r.level === 'error') bad++;
  const mark = r.ok ? `${C.green}✓${C.reset}` : (r.level === 'warn' ? `${C.yellow}!${C.reset}` : `${C.red}✗${C.reset}`);
  console.log(` ${mark} ${r.name}`);
  if (r.detail) console.log(`    ${C.dim}${r.detail}${C.reset}`);
}
console.log('─'.repeat(60));
console.log(bad === 0 ? ` ${C.green}体检通过（warn 项请人工确认）${C.reset}` : ` ${C.red}${bad} 项需处理${C.reset}`);
console.log('');
process.exit(bad === 0 ? 0 : 1);
