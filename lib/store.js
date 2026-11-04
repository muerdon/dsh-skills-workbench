// 状态目录、覆盖表、回收站与调试日志。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
export const STATE_DIR = path.join(DSH_HOME, 'skills-workbench');
export const LOG_PATH = path.join(STATE_DIR, 'debug.log');
export const OVERRIDES_PATH = path.join(STATE_DIR, 'overrides.json');
export const TRASH_DIR = path.join(STATE_DIR, 'trash');
export const TRASH_INDEX = path.join(STATE_DIR, 'trash.json');

const LOG_LIMIT = 256 * 1024;

function ensureDirSync() {
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch { /* 权限问题由调用方兜底 */ }
}

/** 黑匣子日志：每次 RPC 到达/返回都留痕（R29 调试法）。失败静默，不影响主流程。 */
export function log(line) {
  try {
    ensureDirSync();
    const stamp = new Date().toISOString();
    const text = `[${stamp}] ${line}\n`;
    try {
      const st = fs.statSync(LOG_PATH);
      if (st.size > LOG_LIMIT) fs.writeFileSync(LOG_PATH, text, 'utf8');
      else fs.appendFileSync(LOG_PATH, text, 'utf8');
    } catch {
      fs.writeFileSync(LOG_PATH, text, 'utf8');
    }
  } catch { /* 日志不是功能 */ }
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 1), 'utf8');
  await fsp.rename(tmp, file);
}

export async function loadOverrides() {
  const value = await readJson(OVERRIDES_PATH, {});
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function saveOverrides(overrides) {
  await writeJsonAtomic(OVERRIDES_PATH, overrides);
}

export async function loadTrashIndex() {
  const value = await readJson(TRASH_INDEX, []);
  return Array.isArray(value) ? value : [];
}

export async function appendTrash(record) {
  const list = await loadTrashIndex();
  list.push(record);
  await writeJsonAtomic(TRASH_INDEX, list.slice(-200));
}

/**
 * 从回收站索引移除一条记录（按 name + to 精确匹配）。
 * 恢复成功后必须调用：否则索引只增不减 → trashCount 虚高、
 * 同名技能再次卸载时索引里堆积多条陈旧记录（2026-11-04 实测缺陷）。
 */
export async function removeTrashRecord(name, to) {
  const list = await loadTrashIndex();
  const next = list.filter(item => !(item.name === name && (to === undefined || item.to === to)));
  await writeJsonAtomic(TRASH_INDEX, next);
  return next;
}
