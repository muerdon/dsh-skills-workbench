// 离线冒烟：不依赖内核，直接跑扫描 + 分类，验证落地目录与分类映射可用。
// 用法: node test/smoke.mjs
import { resolveRoots, scanAll } from '../lib/scanner.js';
import { classify, catalogPayload } from '../lib/classify.js';
import { loadOverrides } from '../lib/store.js';

const roots = resolveRoots();
console.log('roots:');
for (const root of roots) {
  let exists = false;
  try { exists = (await import('node:fs')).existsSync(root.dir); } catch { exists = false; }
  console.log(`  ${root.id.padEnd(7)} ${root.label}  ${exists ? 'EXISTS' : 'MISSING'}`);
}

const overrides = await loadOverrides();
const skills = await scanAll(roots);
const classified = skills.map(skill => ({ skill, verdict: classify(skill, overrides) }));

const bySource = {};
const byDom = {};
for (const { verdict } of classified) {
  bySource[verdict.source] = (bySource[verdict.source] ?? 0) + 1;
  byDom[verdict.dom] = (byDom[verdict.dom] ?? 0) + 1;
}

console.log('\nskills found: ' + skills.length);
console.log('classification source: ' + JSON.stringify(bySource));
console.log('by domain: ' + JSON.stringify(byDom));

const sample = classified.slice(0, 6).map(({ skill, verdict }) =>
  `${skill.name.padEnd(28)} ${verdict.dom}/${verdict.cat}`.padEnd(52) +
  `${verdict.source}`.padEnd(12) + `size=${skill.size} desc=${(skill.description || '').slice(0, 40)}`);
console.log('\nsample:');
for (const line of sample) console.log('  ' + line);

const catalog = catalogPayload();
console.log('\ncatalog: domains=' + catalog.domains.length + ' categories=' + catalog.categories.length +
  ' scoringKeys=' + Object.keys(catalog.scoring).join(','));

const uncat = classified.filter(({ verdict }) => verdict.dom === 'uncat');
if (uncat.length > 0) {
  console.log('\nunclassified (' + uncat.length + '): ' + uncat.slice(0, 12).map(({ skill }) => skill.name).join(', '));
}
