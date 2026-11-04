/**
 * 回收站数据链路检查：确认 /state 返回的 trash 数组能被面板直接渲染。
 * 流程：建技能 → 卸载 → 读 /state.trash → 恢复 → 读 /state.trash（应清空）→ 清理
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] ?? '9069';
const BASE = `http://127.0.0.1:${PORT}/skills-workbench/v1`;
const NAME = 'sw-trash-ui-check';
const DIR = path.join(os.homedir(), '.agents', 'skills', NAME);

let failures = 0;
const check = (label, ok, extra) => {
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${label}${extra ? '   → ' + extra : ''}`);
  if (!ok) failures += 1;
};

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
  return (await res.json().catch(() => ({})));
}

(async () => {
  await fsp.rm(DIR, { recursive: true, force: true });
  await fsp.mkdir(DIR, { recursive: true });
  await fsp.writeFile(path.join(DIR, 'SKILL.md'), `---\nname: ${NAME}\ndescription: trash ui check\n---\n`, 'utf8');

  await api('/scan', 'POST', {});
  await api('/uninstall', 'POST', { name: NAME });

  const afterUninstall = await api('/state');
  const trashList = afterUninstall.value?.trash;
  check('/state 返回 trash 数组', Array.isArray(trashList));
  const record = Array.isArray(trashList) ? trashList.find(item => item.name === NAME) : undefined;
  check('trash 数组含刚卸载的技能', record !== undefined, JSON.stringify(record ?? null));
  check('记录含展示所需字段 name/at/from',
    record !== undefined && typeof record.name === 'string' && 'at' in record && 'from' in record);
  check('记录未暴露内部落盘路径 to', record !== undefined && !('to' in record));

  await api('/restore', 'POST', { name: NAME });
  const afterRestore = await api('/state');
  const remaining = afterRestore.value?.trash ?? [];
  check('恢复后 trash 数组已清空该条目', !remaining.some(item => item.name === NAME), `trashCount=${afterRestore.value?.trashCount}`);
  check('恢复后技能回到列表', (afterRestore.value?.skills ?? []).some(s => s.name === NAME));

  // 清理
  await fsp.rm(DIR, { recursive: true, force: true });
  await api('/scan', 'POST', {});
  const final = await api('/state');
  check('清理完成，无残留', !(final.value?.skills ?? []).some(s => s.name === NAME), `技能总数=${final.value?.skills?.length}`);

  console.log(`\n== 结果：${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch(error => {
  console.error('脚本异常:', error);
  process.exitCode = 1;
});
