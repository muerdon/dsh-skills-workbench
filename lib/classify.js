// 分类：手动覆盖 > 对照表静态映射 > 关键词启发式 > 未分类。
// 依据优先级可解释（每条结果带 source，UI 可显示分类来源）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_PATH = path.join(here, '..', 'data', 'reference.json');

let reference = { DOMAINS: [], CATEGORIES: [], SKILLS: [], SCORING: {}, EFF_DIMS: [], EFF_PARTS: {}, TRAE_META: {} };
try {
  reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
} catch (error) {
  // 数据缺失不致命：面板降级为「未分类 + 无评分」而不是整块崩掉
  console.error('[skills-workbench] reference.json 读取失败:', error?.message ?? error);
}

export const UNCAT_DOMAIN = { id: 'uncat', name: '未分类', icon: '❓' };
export const UNCAT_CATEGORY = { id: 'uncat', dom: 'uncat', name: '未分类技能', icon: '❓' };

export const DOMAINS = [...(reference.DOMAINS ?? []), UNCAT_DOMAIN];
export const CATEGORIES = [...(reference.CATEGORIES ?? []), UNCAT_CATEGORY];
export const SCORING = reference.SCORING ?? {};
export const EFF_DIMS = reference.EFF_DIMS ?? [];
export const EFF_PARTS = reference.EFF_PARTS ?? {};

const STATIC = new Map();
for (const skill of reference.SKILLS ?? []) {
  STATIC.set(skill.name, skill);
}

/** 关键词启发式：只在静态映射缺失时兜底，命中即给出可读理由。 */
// 关键词启发式：只在静态映射缺失时兜底。cat 必须是 CATEGORIES 里真实存在的 id
// （分类 id 由对照表定义，例：dev 域是 code-quality/code-nav/arch/…，不是笼统的 code）。
const HEURISTICS = [
  { dom: 'info', cat: 'search', words: ['search', 'serp', 'tavily', 'exa', 'brave', 'research', '检索', '调研', '搜索'] },
  { dom: 'info', cat: 'news', words: ['news', 'digest', 'daily', '资讯', '日报', '新闻'] },
  { dom: 'info', cat: 'rss-ops', words: ['rss', 'atom', 'feed', '订阅', 'opml'] },
  { dom: 'info', cat: 'platform', words: ['twitter', 'xurl', 'reddit', 'youtube', 'wechat', 'gzh', '小红书', '微博', '知乎', 'social', '公众号'] },
  { dom: 'info', cat: 'verify', words: ['fact-check', 'verify', 'audit-time', '核查', 'factcheck'] },
  { dom: 'crawl', cat: 'browser-auto', words: ['browser', 'playwright', 'puppeteer', 'chrome', 'devtools', 'selenium', '自动化', '浏览器'] },
  { dom: 'crawl', cat: 'web-extract', words: ['scrape', 'crawl', 'fetch', 'firecrawl', 'extract', 'scrapling', '抓取', '提取', '爬'] },
  { dom: 'crawl', cat: 'media-dl', words: ['download', 'yt-dlp', 'video-yoink', '下载', '磁力', 'torrent'] },
  { dom: 'dev', cat: 'code-quality', words: ['code', 'refactor', 'debug', 'lint', 'test', 'git', 'simplif', '代码', '重构', '调试', '测试', '审查'] },
  { dom: 'dev', cat: 'code-nav', words: ['codebase', 'nexus', 'navigation', '代码库', '导航'] },
  { dom: 'dev', cat: 'arch', words: ['architect', 'pattern', 'spec', '架构', '规范'] },
  { dom: 'dev', cat: 'deploy', words: ['deploy', 'vercel', 'cloud', 'docker', '部署', '上线'] },
  { dom: 'dev', cat: 'react', words: ['react', 'next.js', 'nextjs'] },
  { dom: 'dev', cat: 'reverse', words: ['reverse', 'decompil', 'apk', 'dmg', '逆向', '反编译', '脱壳'] },
  { dom: 'dev', cat: 'ai-ml', words: ['machine-learning', 'pytorch', 'model-training', '深度学习', '训练'] },
  { dom: 'design', cat: 'ui', words: ['design', 'ui', 'ux', 'css', 'layout', 'figma', 'tailwind', '设计', '配色', '排版'] },
  { dom: 'design', cat: 'diagram', words: ['diagram', 'chart', 'svg', 'excalidraw', 'drawio', 'mermaid', '图表', '可视化'] },
  { dom: 'design', cat: 'video', words: ['video', 'remotion', '视频', '剪辑'] },
  { dom: 'design', cat: 'motion', words: ['animation', 'motion', 'gsap', '动画', '动效'] },
  { dom: 'content', cat: 'writing', words: ['write', 'writing', 'copy', 'article', 'blog', '文案', '写作', '文章', '创作'] },
  { dom: 'content', cat: 'publish', words: ['publish', 'gzh-design', '公众号排版', '发布', '排版'] },
  { dom: 'content', cat: 'illustration', words: ['illustration', '插画', '配图', 'imagegen'] },
  { dom: 'domain', cat: 'office', words: ['docx', 'xlsx', 'pptx', 'excel', 'word', 'ppt', '文档', '表格', '幻灯'] },
  { dom: 'think', cat: 'thinking', words: ['analy', 'think', 'decision', 'review', 'audit', '分析', '决策', '复盘', '审计'] },
  { dom: 'think', cat: 'learning', words: ['learn', 'tutor', 'teach', 'study', 'course', '学习', '教程', '课程'] },
  { dom: 'think', cat: 'kb', words: ['zettel', 'note', 'knowledge', 'wiki', 'obsidian', '笔记', '知识库'] },
  { dom: 'think', cat: 'persona', words: ['persona', '人格', '角色扮演'] },
  { dom: 'think', cat: 'deep-read', words: ['deep-read', 'deepread', 'xray', '精读', '拆书'] },
  { dom: 'biz', cat: 'growth', words: ['business', 'growth', 'market', '商业', '增长'] },
  { dom: 'biz', cat: 'biz-diag', words: ['consult', 'mckinsey', '诊断', '咨询'] },
  { dom: 'domain', cat: 'finance', words: ['finance', 'stock', 'etf', '金融', '股票', '财报'] },
  { dom: 'domain', cat: 'academic', words: ['academic', 'paper', 'latex', '论文', '学术'] },
  { dom: 'agent', cat: 'skill-ops', words: ['skill', 'plugin', 'mcp', 'harness', '技能', '插件', '预设'] },
  { dom: 'agent', cat: 'agent-def', words: ['subagent', 'agent-evolver', '子 agent', '预设'] },
  { dom: 'agent', cat: 'memory', words: ['memory', '记忆', 'evolver'] },
];

function heuristic(skill) {
  const hay = `${skill.name} ${skill.description ?? ''}`.toLowerCase();
  for (const rule of HEURISTICS) {
    // 防御：规则里的 cat 必须真实存在，否则这条规则不参与判定（避免产出悬空分类）
    if (!CATEGORIES.some(item => item.id === rule.cat)) continue;
    for (const word of rule.words) {
      if (hay.includes(word.toLowerCase())) {
        return { dom: rule.dom, cat: rule.cat, source: 'heuristic', reason: `命中关键词「${word}」` };
      }
    }
  }
  return null;
}

/**
 * 给一个技能条目定分类与评分。
 * @param {{name:string, description?:string}} skill
 * @param {Record<string,{dom?:string,cat?:string}>} overrides
 */
export function classify(skill, overrides) {
  const override = overrides?.[skill.name];
  if (override !== undefined && (override.dom !== undefined || override.cat !== undefined)) {
    const dom = override.dom ?? 'uncat';
    const cat = override.cat ?? 'uncat';
    const ref = STATIC.get(skill.name);
    return {
      dom, cat, source: 'override', reason: '手动指定',
      rep: ref?.rep ?? '', eff: ref?.eff ?? null, effg: ref?.effg ?? '', self: ref?.self ?? 0,
      triggers: ref?.triggers ?? '',
    };
  }
  const ref = STATIC.get(skill.name);
  if (ref !== undefined && ref.dom !== undefined && ref.cat !== undefined) {
    return {
      dom: ref.dom, cat: ref.cat, source: 'reference', reason: '对照表收录',
      rep: ref.rep ?? '', eff: ref.eff ?? null, effg: ref.effg ?? '', self: ref.self ?? 0,
      triggers: ref.triggers ?? '',
    };
  }
  const guess = heuristic(skill);
  if (guess !== null) {
    return { ...guess, rep: '', eff: null, effg: '', self: 0, triggers: '' };
  }
  return { dom: 'uncat', cat: 'uncat', source: 'uncat', reason: '未收录，待归类', rep: '', eff: null, effg: '', self: 0, triggers: '' };
}

export function catalogPayload() {
  return { domains: DOMAINS, categories: CATEGORIES, scoring: SCORING, effDims: EFF_DIMS, effParts: EFF_PARTS };
}
