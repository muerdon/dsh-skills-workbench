/**
 * 技能卸载功能 · 端到端实测
 * 覆盖：扫描发现 → 卸载（落地目录移走 + 回收站记录）→ 恢复 → 非法名防护 → 不存在技能 → 清理
 * 只使用临时测试技能 sw-uninstall-test，不触碰任何真实技能。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] ?? '9208';
const BASE = `http://127.0.0.1:${PORT}/skills-workbench/v1`;
const NAME = 'sw-uninstall-test';
const DIR = path.join(os.homedir(), '.agents', 'skills', NAME);
const STATE_DIR = path.join(os.homedir(), '.dsh', 'skills-workbench');
const TRASH_JSON = path.join(STATE_DIR, 'trash.json');

let failures = 0;
function check(label, ok, extra) {
  const suffix = extra === undefined || extra === '' ? '' : `   → ${extra}`;
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${label}${suffix}`);
  if (!ok) failures += 1;
}

async function api(pathname, method = 'GET', body) {
  const headers = { 'cache-control': 'no-cache' };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['x-skills-workbench'] = '1';
  }
  const res = await fetch(BASE + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const stateValue = async () => (await api('/state')).json.value ?? {};

(async () => {
  console.log('== 技能卸载功能实测 ==');
  console.log(`端口: ${PORT}`);
  console.log(`测试技能: ${NAME}`);
  console.log(`落地目录: ${DIR}`);
  console.log('');

  // 0) 清理历史残留
  await fsp.rm(DIR, { recursive: true, force: true });

  // 1) 创建测试技能
  await fsp.mkdir(DIR, { recursive: true });
  await fsp.writeFile(
    path.join(DIR, 'SKILL.md'),
    ['---', `name: ${NAME}`, 'description: 卸载功能验证用临时技能（测试结束自动删除）。', '---', '', `# ${NAME}`, '', '临时测试技能。'].join('\n'),
    'utf8',
  );
  check('创建测试技能（含 SKILL.md）', fs.existsSync(path.join(DIR, 'SKILL.md')));

  // 2) 扫描并确认被发现
  const scan = await api('/scan', 'POST', {});
  check('POST /scan 返回 ok', scan.json.ok === true, `status=${scan.status}`);
  let state = await stateValue();
  const totalBefore = (state.skills ?? []).length;
  const trashBefore = state.trashCount ?? 0;
  check('扫描发现测试技能', (state.skills ?? []).some(s => s.name === NAME), `技能总数=${totalBefore}`);

  // 3) 卸载
  const un = await api('/uninstall', 'POST', { name: NAME });
  check('POST /uninstall 返回 ok', un.json.ok === true, un.json.error?.message ?? `status=${un.status}`);

  state = await stateValue();
  check('卸载后扫描列表已移除', !(state.skills ?? []).some(s => s.name === NAME), `技能总数=${(state.skills ?? []).length}`);
  check('卸载后落地目录已移走', !fs.existsSync(DIR));
  check('技能总数回落 1', (state.skills ?? []).length === totalBefore - 1);

  const trashEntries = fs.existsSync(TRASH_JSON) ? JSON.parse(fs.readFileSync(TRASH_JSON, 'utf8')) : [];
  const record = Array.isArray(trashEntries) ? trashEntries.find(e => e.name === NAME) : undefined;
  check('回收站索引有该技能记录', record !== undefined);
  if (record) check('回收站实体目录存在（可恢复）', fs.existsSync(record.to), record.to);
  check('/state 的 trashCount 已计数', (state.trashCount ?? 0) >= 1, `trashCount=${state.trashCount}`);

  // 4) 恢复
  const restore = await api('/restore', 'POST', { name: NAME });
  check('POST /restore 返回 ok', restore.json.ok === true, restore.json.error?.message ?? `status=${restore.status}`);
  state = await stateValue();
  check('恢复后重新出现在列表', (state.skills ?? []).some(s => s.name === NAME));
  check('恢复后落地目录回来', fs.existsSync(path.join(DIR, 'SKILL.md')));
  // 回归点：恢复后索引必须清理，否则 trashCount 只增不减（2026-11-04 实测缺陷）
  check(
    '恢复后回收站计数回落（索引已清理）',
    (state.trashCount ?? 0) === trashBefore,
    `trashCount=${state.trashCount} 期望=${trashBefore}`,
  );

  // 5) 非法名防护（路径穿越）
  const bad = await api('/uninstall', 'POST', { name: '../../etc/passwd' });
  check(
    '拒绝路径穿越型技能名',
    bad.json.ok === false || bad.status === 400 || bad.status === 403,
    `status=${bad.status} msg=${bad.json.error?.message ?? ''}`,
  );

  // 6) 不存在的技能
  const missing = await api('/uninstall', 'POST', { name: 'sw-not-exist-xyz' });
  check('卸载不存在的技能返回失败而非崩溃', missing.json.ok === false, `status=${missing.status} msg=${missing.json.error?.message ?? ''}`);

  // 7) 清理（只移除本测试技能的条目，保留其他真实回收站记录）
  await fsp.rm(DIR, { recursive: true, force: true });
  let removedTrash = 0;
  let keptRecords = 0;
  if (fs.existsSync(TRASH_JSON)) {
    const entries = JSON.parse(fs.readFileSync(TRASH_JSON, 'utf8'));
    if (Array.isArray(entries)) {
      const kept = [];
      for (const entry of entries) {
        if (entry.name === NAME) {
          if (entry.to && fs.existsSync(entry.to)) {
            await fsp.rm(entry.to, { recursive: true, force: true });
            removedTrash += 1;
          }
        } else {
          kept.push(entry);
        }
      }
      keptRecords = kept.length;
      fs.writeFileSync(TRASH_JSON, JSON.stringify(kept), 'utf8');
    }
  }
  await api('/scan', 'POST', {});
  state = await stateValue();
  check('清理后测试技能已完全不存在', !(state.skills ?? []).some(s => s.name === NAME), `技能总数=${(state.skills ?? []).length}`);
  console.log(`\n清理：删除本测试技能回收站实体 ${removedTrash} 个；保留其他回收站记录 ${keptRecords} 条`);

  console.log(`\n== 结果：${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch(error => {
  console.error('脚本异常:', error);
  process.exitCode = 1;
});
