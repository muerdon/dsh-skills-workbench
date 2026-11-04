// 落地目录扫描：SKILL.md frontmatter 解析 + 多根目录聚合。
// 只用 node 内置模块，不依赖内核内部实现（R29-A 解耦）。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const SKILL_FILE = 'SKILL.md';

/** 解析用户家目录下的约定路径；DSH_HOME 可被环境覆盖。 */
export function resolveRoots() {
  const home = os.homedir();
  const dshHome = process.env.DSH_HOME || path.join(home, '.dsh');
  return [
    { id: 'agents', dir: path.join(home, '.agents', 'skills'), label: '~/.agents/skills', watch: true, primary: true },
    { id: 'dsh', dir: path.join(dshHome, 'skills'), label: '~/.dsh/skills', watch: true, primary: true },
    { id: 'trae', dir: path.join(home, '.trae-cn', 'skills'), label: '~/.trae-cn/skills', watch: true, primary: false },
  ];
}

/** 极简 frontmatter 读取：只取顶层标量键，支持 `>` / `|` 块标量的单层折叠。 */
export function parseFrontmatter(text) {
  const out = {};
  // 不少 SKILL.md 带 UTF-8 BOM（U+FEFF），不剥掉会导致 startsWith('---') 直接失败、
  // 整段 frontmatter 静默丢失（实测 agent-browser / agent-evolver 命中）。
  const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  if (!src.startsWith('---')) return out;
  const end = src.indexOf('\n---', 3);
  if (end === -1) return out;
  const head = src.slice(3, end).split(/\r?\n/);
  let currentKey = null;
  let blockMode = null;
  for (const raw of head) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') continue;
    if (/^\s/.test(line)) {
      // 块标量续行 / 嵌套值：只把块标量拼回字符串
      if (currentKey !== null && blockMode !== null) {
        out[currentKey] = out[currentKey] === '' ? line.trim() : out[currentKey] + ' ' + line.trim();
      }
      continue;
    }
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (m === null) { currentKey = null; blockMode = null; continue; }
    const key = m[1];
    let value = m[2].trim();
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      out[key] = '';
      currentKey = key;
      blockMode = value;
      continue;
    }
    currentKey = key;
    blockMode = null;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function statSafe(p) {
  try { return await fsp.stat(p); } catch { return undefined; }
}

/** 扫描一个根目录，返回技能条目（不含分类）。 */
export async function scanRoot(root) {
  const entries = [];
  let dirEntries;
  try {
    dirEntries = await fsp.readdir(root.dir, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const dirent of dirEntries) {
    if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue;
    const name = dirent.name;
    if (name.startsWith('.') || name.startsWith('_')) continue;
    const dir = path.join(root.dir, name);
    const skillPath = path.join(dir, SKILL_FILE);
    const info = await statSafe(skillPath);
    if (info === undefined) continue;
    let head = '';
    try {
      const fd = await fsp.open(skillPath, 'r');
      try {
        const buf = Buffer.alloc(Math.min(info.size, 16384));
        await fd.read(buf, 0, buf.length, 0);
        head = buf.toString('utf8');
      } finally {
        await fd.close();
      }
    } catch { /* 读不到就只报文件信息 */ }
    const fm = parseFrontmatter(head);
    let childCount = 0;
    try {
      const kids = await fsp.readdir(dir, { withFileTypes: true });
      childCount = kids.filter(k => k.isDirectory()).length;
    } catch { /* ignore */ }
    entries.push({
      name,
      dir,
      rootId: root.id,
      rootLabel: root.label,
      primary: root.primary,
      skillPath,
      title: typeof fm.name === 'string' && fm.name.trim() !== '' ? fm.name.trim() : name,
      description: typeof fm.description === 'string' ? fm.description.trim() : '',
      size: info.size,
      mtime: info.mtimeMs,
      folders: childCount,
    });
  }
  return entries;
}

/** 聚合所有根目录；同名技能按 roots 顺序取第一个为主，其余记为副本。 */
export async function scanAll(roots) {
  const byName = new Map();
  for (const root of roots) {
    const found = await scanRoot(root);
    for (const skill of found) {
      const existing = byName.get(skill.name);
      if (existing === undefined) {
        byName.set(skill.name, { ...skill, copies: [{ rootId: skill.rootId, rootLabel: skill.rootLabel, dir: skill.dir }] });
      } else {
        existing.copies.push({ rootId: skill.rootId, rootLabel: skill.rootLabel, dir: skill.dir });
      }
    }
  }
  return [...byName.values()];
}

export function dirExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}
