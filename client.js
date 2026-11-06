window.__ModuleLoader__.load({
  id: 'dsh-skills-workbench',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const POLL_MS = 12000;
    const API = '/skills-workbench/v1';
    // 会话 id 的来源标记，用于面板诊断：走了哪一层兜底。
    const SOURCE_LABEL = {
      current: '当前会话',
      'host-live': '活跃会话',
      remembered: '最近会话',
      'host-workspace': '工作区登记',
      none: '无',
    };

    /* ────────────────────────── 样式：液态玻璃 + 暖色体系 ────────────────────────── */
    const css = `
.sw-root{
  --sw-ink:#392D24; --sw-ink2:#6B5D50; --sw-ink3:#98897B;
  --sw-amber:#A67C52; --sw-amber2:#8E6840; --sw-mint:#5E8F8B; --sw-coral:#C4786A; --sw-gold:#B8963E;
  --sw-line:rgba(120,96,72,.15); --sw-line2:rgba(120,96,72,.26);
  position:relative; height:100%; min-height:100%; overflow:auto; color:var(--sw-ink);
  background:
    radial-gradient(880px 520px at 92% -12%, rgba(184,150,62,.18), transparent 62%),
    radial-gradient(720px 460px at -6% 14%, rgba(94,143,139,.15), transparent 60%),
    radial-gradient(640px 420px at 50% 108%, rgba(196,120,106,.12), transparent 62%),
    linear-gradient(168deg,#F7F0E6 0%,#EFE5D6 52%,#EDE1D0 100%);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;
  -webkit-font-smoothing:antialiased;
}
.sw-root *{box-sizing:border-box}
.sw-inner{max-width:1180px;margin:0 auto;padding:24px 22px 72px;position:relative;z-index:1}
.sw-glass{
  background:linear-gradient(158deg,rgba(255,253,249,.76),rgba(250,244,235,.5));
  backdrop-filter:blur(22px) saturate(168%); -webkit-backdrop-filter:blur(22px) saturate(168%);
  border:1px solid rgba(255,255,255,.68);
  box-shadow:0 12px 34px rgba(61,48,39,.10), inset 0 1px 0 rgba(255,255,255,.82);
  border-radius:16px;
}
/* ── hero ── */
.sw-hero{padding:20px 22px;display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;position:relative;overflow:hidden}
.sw-hero::after{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.95),transparent)}
.sw-hero-main{flex:1;min-width:240px}
.sw-eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;
  color:var(--sw-amber2);background:rgba(232,213,192,.72);border:1px solid rgba(166,124,82,.22);padding:3px 11px;border-radius:20px}
.sw-title{font-size:25px;font-weight:800;letter-spacing:-.4px;margin:11px 0 5px;line-height:1.24}
.sw-title em{font-style:normal;background:linear-gradient(120deg,var(--sw-amber) 0%,var(--sw-coral) 52%,var(--sw-mint) 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.sw-sub{font-size:13px;color:var(--sw-ink2);line-height:1.62;max-width:660px}
.sw-sync{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:13px;font-size:12px;color:var(--sw-ink2)}
.sw-dot{width:7px;height:7px;border-radius:50%;background:var(--sw-mint);box-shadow:0 0 0 3px rgba(94,143,139,.18)}
.sw-dot[data-busy="1"]{background:var(--sw-gold);box-shadow:0 0 0 3px rgba(184,150,62,.2);animation:sw-pulse 1.1s ease-in-out infinite}
@keyframes sw-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.sw-sync .sep{width:1px;height:12px;background:var(--sw-line2)}
.sw-hero-side{display:flex;flex-direction:column;gap:8px;align-items:flex-end}
/* ── 按钮 ── */
.sw-btn{font:inherit;font-size:12.5px;font-weight:600;border-radius:10px;padding:8px 14px;cursor:pointer;
  border:1px solid var(--sw-line2);background:rgba(255,253,249,.72);color:var(--sw-ink);transition:transform .16s ease,box-shadow .16s ease,background .16s ease,color .16s ease}
.sw-btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(61,48,39,.12)}
.sw-btn:active{transform:translateY(0)}
.sw-btn:disabled{opacity:.45;cursor:default;transform:none;box-shadow:none}
.sw-btn-primary{background:linear-gradient(140deg,var(--sw-amber) 0%,var(--sw-amber2) 100%);border-color:transparent;color:#FFF9F2;
  box-shadow:0 6px 18px rgba(166,124,82,.3)}
.sw-btn-primary:hover{box-shadow:0 9px 22px rgba(166,124,82,.36)}
.sw-btn-ghost{background:transparent;border-color:var(--sw-line2);color:var(--sw-ink2)}
/* ── 统计卡 ── */
.sw-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:14px}
.sw-stat{padding:14px 15px;border-radius:14px;position:relative;overflow:hidden}
.sw-stat .n{font-size:24px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.sw-stat .l{font-size:11.5px;color:var(--sw-ink3);margin-top:6px;font-weight:600;letter-spacing:.2px}
.sw-stat .bar{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px}
.sw-stat[data-k="total"] .n{color:var(--sw-amber)} .sw-stat[data-k="total"] .bar{background:var(--sw-amber)}
.sw-stat[data-k="classified"] .n{color:var(--sw-mint)} .sw-stat[data-k="classified"] .bar{background:var(--sw-mint)}
.sw-stat[data-k="uncat"] .n{color:var(--sw-coral)} .sw-stat[data-k="uncat"] .bar{background:var(--sw-coral)}
.sw-stat[data-k="trash"] .n{color:var(--sw-gold)} .sw-stat[data-k="trash"] .bar{background:var(--sw-gold)}
/* ── 工具栏 ── */
.sw-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px;margin-top:14px;border-radius:15px}
.sw-search{flex:1;min-width:220px;position:relative}
.sw-search input{width:100%;padding:10px 14px 10px 36px;border-radius:11px;border:1px solid var(--sw-line2);
  background:rgba(255,253,249,.8);font:inherit;font-size:13px;color:var(--sw-ink);outline:none;transition:border-color .16s ease,box-shadow .16s ease}
.sw-search input::placeholder{color:var(--sw-ink3)}
.sw-search input:focus{border-color:var(--sw-amber);box-shadow:0 0 0 3px rgba(166,124,82,.16)}
.sw-search .ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:13px;opacity:.5;pointer-events:none}
.sw-seg{display:flex;gap:4px;padding:3px;border-radius:11px;background:rgba(233,222,208,.6);border:1px solid var(--sw-line)}
.sw-seg button{font:inherit;font-size:11.5px;font-weight:600;padding:6px 10px;border-radius:8px;border:0;background:transparent;color:var(--sw-ink2);cursor:pointer}
.sw-seg button[data-on="1"]{background:rgba(255,253,249,.95);color:var(--sw-amber2);box-shadow:0 2px 6px rgba(61,48,39,.1)}
/* ── 胶囊标签 ── */
.sw-caption{font-size:11.5px;font-weight:700;color:var(--sw-ink3);letter-spacing:.6px;text-transform:uppercase;margin:20px 0 8px}
.sw-chips{display:flex;gap:7px;flex-wrap:wrap}
.sw-chip{font:inherit;font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:22px;cursor:pointer;
  border:1px solid var(--sw-line2);background:rgba(255,253,249,.66);color:var(--sw-ink2);transition:all .16s ease;position:relative}
.sw-chip:hover{border-color:var(--sw-amber);color:var(--sw-amber2)}
.sw-chip[data-on="1"]{background:linear-gradient(140deg,var(--sw-amber),var(--sw-amber2));border-color:transparent;color:#FFF9F2;
  box-shadow:0 4px 12px rgba(166,124,82,.28)}
.sw-chip[data-on="1"][data-kind="cat"]{background:linear-gradient(140deg,var(--sw-mint),#4A7875);box-shadow:0 4px 12px rgba(94,143,139,.3)}
.sw-chip .c{opacity:.66;font-size:11px;margin-left:5px;font-variant-numeric:tabular-nums}
.sw-chip[data-zero="1"]:not([data-on="1"]){opacity:.45}
/* ── 列表 ── */
.sw-group{margin-top:18px}
.sw-group-head{display:flex;align-items:baseline;gap:9px;padding:0 2px 9px;border-bottom:1.5px solid rgba(166,124,82,.22);margin-bottom:9px}
.sw-group-head h3{font-size:14.5px;font-weight:800;margin:0;letter-spacing:-.1px}
.sw-group-head .n{font-size:11px;font-weight:700;color:var(--sw-amber2);background:rgba(232,213,192,.8);padding:1px 8px;border-radius:10px}
.sw-group-head .d{margin-left:auto;font-size:11px;color:var(--sw-ink3);font-weight:600}
.sw-rows{display:flex;flex-direction:column;gap:7px}
.sw-row{border-radius:13px;padding:11px 13px;display:grid;align-items:center;gap:12px;
  grid-template-columns:minmax(150px,1fr) minmax(200px,1.9fr) minmax(110px,.8fr) 74px 86px 128px;
  transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease;cursor:pointer}
.sw-row:hover{transform:translateX(3px);box-shadow:0 10px 26px rgba(61,48,39,.13);border-color:rgba(94,143,139,.45)}
.sw-row:focus-visible{outline:2px solid var(--sw-mint);outline-offset:2px}
.sw-row[data-open="1"]{border-color:var(--sw-mint);background:rgba(250,254,253,.96);box-shadow:0 8px 22px rgba(61,48,39,.1)}
.sw-name{font-family:"SF Mono","Cascadia Code","Fira Code",monospace;font-size:12.5px;font-weight:700;color:var(--sw-amber2);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:5px}
.sw-name .self{font-family:inherit;font-size:9.5px;font-weight:700;color:var(--sw-gold);background:rgba(240,227,186,.9);
  border-radius:4px;padding:1px 4px;flex:none}
.sw-desc{font-size:12px;color:var(--sw-ink2);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sw-trig{font-size:11px;color:var(--sw-ink3);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sw-size{font-size:11.5px;color:var(--sw-ink2);font-variant-numeric:tabular-nums;text-align:right}
.sw-size i{display:block;height:3px;border-radius:3px;background:rgba(166,124,82,.2);margin-top:4px;position:relative;overflow:hidden}
.sw-size i b{position:absolute;left:0;top:0;bottom:0;background:var(--sw-amber);border-radius:3px}
.sw-scores{display:flex;gap:5px;align-items:center;justify-content:flex-end}
.sw-sc{font-size:11px;font-weight:700;padding:2px 6px;border-radius:7px;border:1px solid transparent;font-variant-numeric:tabular-nums}
.sw-sc[data-t="eff"][data-g="优"]{color:#2F6B54;background:rgba(111,168,140,.2);border-color:rgba(47,107,84,.24)}
.sw-sc[data-t="eff"][data-g="良"]{color:#7A6320;background:rgba(214,186,96,.22);border-color:rgba(122,99,32,.22)}
.sw-sc[data-t="eff"][data-g="中"]{color:#9A5B2A;background:rgba(226,168,110,.22);border-color:rgba(154,91,42,.22)}
.sw-sc[data-t="eff"][data-g="基础"]{color:#8E4A3E;background:rgba(212,150,136,.22);border-color:rgba(142,74,62,.2)}
.sw-sc[data-t="rep"]{color:#3E6178;background:rgba(126,166,190,.2);border-color:rgba(62,97,120,.22)}
.sw-na{color:var(--sw-ink3);font-size:11px}
.sw-actions{display:flex;gap:6px;justify-content:flex-end}
.sw-act{font:inherit;font-size:11.5px;font-weight:700;padding:6px 10px;border-radius:9px;cursor:pointer;border:1px solid transparent;white-space:nowrap;transition:all .16s ease}
.sw-act[data-a="launch"]{background:linear-gradient(140deg,var(--sw-amber),var(--sw-amber2));color:#FFF9F2;box-shadow:0 4px 12px rgba(166,124,82,.26)}
.sw-act[data-a="launch"]:hover{box-shadow:0 7px 18px rgba(166,124,82,.34)}
.sw-act[data-a="remove"]{background:transparent;border-color:rgba(196,120,106,.5);color:var(--sw-coral)}
.sw-act[data-a="remove"]:hover{background:rgba(196,120,106,.14)}
.sw-act[data-a="confirm"]{background:var(--sw-coral);color:#FFF6F3;box-shadow:0 4px 12px rgba(196,120,106,.3)}
.sw-act:disabled{opacity:.45;cursor:default;box-shadow:none}
/* 展开详情 */
.sw-detail{grid-column:1/-1;margin-top:9px;padding:12px 13px;border-radius:11px;background:rgba(255,253,249,.62);
  border:1px dashed rgba(120,96,72,.24);font-size:12px;color:var(--sw-ink2);line-height:1.66}
.sw-detail .k{color:var(--sw-ink3);font-weight:700;margin-right:6px}
.sw-detail code{font-family:"SF Mono","Cascadia Code",monospace;font-size:11px;background:rgba(232,213,192,.55);
  padding:1px 5px;border-radius:4px;color:var(--sw-amber2);word-break:break-all}
.sw-detail .row{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-top:6px}
.sw-detail select{font:inherit;font-size:11.5px;padding:4px 7px;border-radius:7px;border:1px solid var(--sw-line2);
  background:rgba(255,253,249,.9);color:var(--sw-ink)}
/* 服务状态横幅（服务未就绪 / 监听降级） */
.sw-banner{margin-top:12px;padding:9px 13px;border-radius:11px;font-size:12px;font-weight:600;line-height:1.5;
  border:1px solid rgba(196,120,106,.42);background:rgba(212,150,136,.14);color:var(--sw-ink)}
.sw-banner[data-t="warn"]{border-color:rgba(214,186,96,.46);background:rgba(230,206,120,.14)}
/* 详情卡内的「整段字段」与评分维度 */
.sw-d-full{margin-top:9px}
.sw-d-full:first-child{margin-top:0}
.sw-d-full .k{display:block;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--sw-ink3);
  font-weight:700;margin:0 0 3px}
.sw-detail .sw-d-full .k{display:block;margin-right:0}
.sw-d-full .v{font-size:12px;line-height:1.7;color:var(--sw-ink2);white-space:pre-wrap;word-break:break-word}
.sw-dims{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px}
.sw-dchip{font-size:10.5px;padding:2px 7px;border-radius:6px;background:rgba(232,213,192,.5);
  color:var(--sw-ink2);font-weight:700}
.sw-ddim{font-size:10.5px;padding:2px 7px;border-radius:6px;border:1px solid var(--sw-line2);
  color:var(--sw-ink3);font-variant-numeric:tabular-nums}
/* 评分口径（底部） */
.sw-scoring{margin-top:26px;border-radius:15px;overflow:hidden}
/* 回收站：结构与评分口径一致（复用 sw-scoring-head / sw-caret），数据区自成一格 */
.sw-trash{margin-top:20px;border-radius:15px;overflow:hidden}
.sw-trash[data-open="0"] .sw-caret{transform:rotate(-90deg)}
.sw-trash-body{padding:0 14px 14px;display:grid;gap:6px;border-top:1px solid var(--sw-line2);padding-top:12px}
.sw-trash[data-open="0"] .sw-trash-body{display:none}
.sw-trash-item{display:flex;align-items:center;gap:12px;padding:9px 11px;border-radius:10px;
  border:1px solid var(--sw-line2);background:rgba(255,253,249,.72)}
.sw-trash-item .main{flex:1;min-width:0}
.sw-trash-item .name{font-size:12.5px;font-weight:600;color:var(--sw-ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sw-trash-item .meta{font-size:10.5px;color:var(--sw-ink3);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sw-act.sw-act-restore{color:var(--sw-mint);border-color:rgba(94,143,139,.34);background:rgba(245,252,250,.9)}
.sw-act.sw-act-restore:hover{border-color:var(--sw-mint);background:rgba(240,250,247,.98)}
.sw-trash-empty{padding:14px 12px;font-size:12px;color:var(--sw-ink3);line-height:1.7;
  text-align:center;border:1px dashed var(--sw-line2);border-radius:10px}
.sw-scoring-head{display:flex;align-items:center;gap:10px;padding:14px 16px;cursor:pointer;user-select:none}
.sw-scoring-head h3{margin:0;font-size:14px;font-weight:800}
.sw-scoring-head .hint{margin-left:auto;font-size:11.5px;color:var(--sw-ink3);display:flex;align-items:center;gap:6px}
.sw-caret{display:inline-block;transition:transform .2s ease;font-size:10px;color:var(--sw-amber)}
.sw-scoring[data-open="0"] .sw-caret{transform:rotate(-90deg)}
.sw-scoring-body{padding:0 16px 18px;display:grid;gap:14px}
.sw-scoring[data-open="0"] .sw-scoring-body{display:none}
.sw-intro{font-size:12.5px;line-height:1.72;color:var(--sw-ink2);margin:0}
.sw-intro strong,.sw-note strong{color:var(--sw-ink);font-weight:700}
.sw-intro code,.sw-note code{font-family:"SF Mono",monospace;font-size:11px;background:rgba(232,213,192,.6);padding:1px 5px;border-radius:4px;color:var(--sw-amber2)}
.sw-table{width:100%;border-collapse:separate;border-spacing:0 3px;font-size:12px}
.sw-table th{text-align:left;font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--sw-ink3);padding:5px 9px;font-weight:700}
.sw-table td{padding:7px 9px;background:rgba(255,253,249,.6);vertical-align:top;color:var(--sw-ink2);line-height:1.55}
.sw-table tr td:first-child{border-radius:8px 0 0 8px;color:var(--sw-ink);font-weight:700;white-space:nowrap}
.sw-table tr td:last-child{border-radius:0 8px 8px 0}
.sw-table td code{font-family:"SF Mono",monospace;font-size:10.5px;background:rgba(232,213,192,.55);padding:1px 4px;border-radius:4px;color:var(--sw-amber2)}
.sw-notes{display:grid;gap:7px;margin:0;padding:0;list-style:none}
.sw-note{font-size:11.5px;line-height:1.7;color:var(--sw-ink2);padding-left:12px;position:relative}
.sw-note::before{content:"";position:absolute;left:0;top:8px;width:4px;height:4px;border-radius:50%;background:var(--sw-amber)}
/* 空态 / 页脚 / toast */
.sw-empty{padding:44px 20px;text-align:center;color:var(--sw-ink3);font-size:13px;border-radius:14px}
.sw-empty .big{font-size:26px;display:block;margin-bottom:8px;opacity:.5}
.sw-foot{margin-top:22px;font-size:11px;color:var(--sw-ink3);text-align:center;line-height:1.8}
.sw-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:60;padding:9px 16px;border-radius:11px;
  font-size:12.5px;font-weight:600;color:#FFF9F2;background:linear-gradient(140deg,rgba(94,143,139,.96),rgba(74,120,117,.96));
  box-shadow:0 12px 28px rgba(61,48,39,.28);backdrop-filter:blur(10px);animation:sw-rise .22s ease-out}
.sw-toast[data-t="err"]{background:linear-gradient(140deg,rgba(196,120,106,.97),rgba(158,86,74,.97))}
@keyframes sw-rise{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
/* 会话选择器（来源不可靠时让用户点选，避免写错会话） */
.sw-picker{position:fixed;right:24px;bottom:24px;z-index:70;width:min(390px,calc(100vw - 48px));
  padding:14px 16px;border-radius:16px}
.sw-picker-head{display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:13px;font-weight:800;color:var(--sw-ink)}
.sw-picker-close{border:0;background:transparent;cursor:pointer;font-size:13px;line-height:1;
  color:var(--sw-ink3);padding:3px 6px;border-radius:6px}
.sw-picker-close:hover{background:rgba(120,96,72,.1);color:var(--sw-ink)}
.sw-picker-sub{font-size:11.5px;color:var(--sw-ink3);margin:7px 0 10px;line-height:1.6}
.sw-picker-list{display:grid;gap:6px;max-height:280px;overflow:auto}
.sw-picker-item{display:flex;align-items:center;gap:10px;
  font:inherit;padding:8px 11px;border-radius:9px;border:1px solid var(--sw-line2);
  background:rgba(255,253,249,.82);cursor:pointer;text-align:left;color:var(--sw-ink);transition:all .14s ease}
.sw-picker-item:hover{border-color:var(--sw-amber);background:rgba(255,253,249,.99);transform:translateX(2px)}
/* 空会话（只有 header、无用户消息）淡化显示，避免和有内容的会话抢注意力 */
.sw-picker-item[data-empty="1"]{opacity:.6}
.sw-picker-item[data-empty="1"] .sw-picker-title{font-weight:500}
/* 活跃/打开中的会话置顶高亮 */
.sw-picker-item.sw-picker-live{border-color:var(--sw-mint);background:rgba(245,252,250,.92)}
.sw-picker-item.sw-picker-live .sw-picker-title::before{content:'●';color:var(--sw-mint);margin-right:5px;font-size:9px;vertical-align:middle}
.sw-picker-main{flex:1;min-width:0;display:grid;gap:2px}
.sw-picker-title{font-size:12.5px;font-weight:600;color:var(--sw-ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sw-picker-meta{font-size:10.5px;color:var(--sw-ink3);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sw-picker-id{font-family:"SF Mono","Cascadia Code",monospace;font-size:10px;font-weight:600;
  color:var(--sw-ink3);flex:none}
/* 侧栏入口 */
.sw-nav{display:flex;align-items:center;justify-content:center;border:0;border-radius:9px;
  background:transparent;cursor:pointer;padding:0;color:var(--dsw-alias-label-secondary,inherit);transition:background .16s ease,color .16s ease}
.sw-nav:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.sw-nav[data-active="1"]{background:rgba(166,124,82,.16);color:var(--sw-amber2,#8E6840)}
.sw-nav svg{width:17px;height:17px;display:block}
@media (max-width:900px){
  .sw-row{grid-template-columns:1fr auto;gap:8px}
  .sw-desc,.sw-trig,.sw-size{grid-column:1/-1}
  .sw-scores{justify-content:flex-start}
  .sw-actions{justify-content:flex-start;grid-column:1/-1}
  .sw-inner{padding:16px 13px 60px}
  .sw-title{font-size:21px}
}
@media (prefers-reduced-motion:reduce){.sw-root *{animation:none!important;transition:none!important}}
`;

    /* 样式注入放在 apply 内（factory 保持无副作用），返回清理函数。 */
    function installStyles() {
      const existing = document.querySelector('style[data-plugin-css="dsh-skills-workbench"]');
      if (existing !== null) return () => {};
      const style = document.createElement('style');
      style.dataset.plugin = 'dsh-skills-workbench';
      style.dataset.pluginCss = 'dsh-skills-workbench';
      style.textContent = css;
      document.head.appendChild(style);
      return () => { try { style.remove(); } catch { /* ignore */ } };
    }

    /* ────────────────────────── 文案 ────────────────────────── */
    function zhLocale() {
      const lang = (typeof navigator !== 'undefined' && navigator.language) || 'zh-CN';
      return lang.toLowerCase().startsWith('zh');
    }
    function copy() {
      return zhLocale() ? {
        eyebrow: 'SKILL LAUNCHER',
        title: '技能<em>工作台</em>',
        sub: '点「唤起」把技能直接放进当前会话输入框——不必手打斜杠命令；点「卸载」移入回收区，可随时恢复。',
        syncing: '自动同步', scanning: '扫描中…', lastScan: '最后扫描',
        rescan: '一键扫描', rescanning: '扫描中…',
        total: '技能总数', classified: '已分类', uncat: '未分类', trash: '回收站',
        search: '搜索技能名、功能、触发词…',
        srcAll: '全部来源', domainLabel: '领域', catLabel: '分类',
        all: '全部', launch: '唤起', uninstall: '卸载', confirm: '确认卸载',
        detail: '详情', path: '路径', size: '大小', triggers: '触发词',
        recat: '调整分类', domain: '领域', category: '分类',
        empty: '没有匹配的技能', emptyHint: '试试清空搜索或换一个分类',
        scoring: '评分口径', expand: '展开 / 折叠',
        noScore: '—', restored: '已恢复', uninstalled: '已移入回收区', launched: '已放入输入框',
        noSession: '未找到可用的会话：请先打开一个会话，再唤起技能',
        busy: '输入框正忙，稍后再试',
        copyPath: '点击复制路径', copied: '已复制路径',
        stateDir: '状态目录', roots: '落地目录', log: '日志',
        restore: '恢复', categorySource: { reference: '对照表', override: '手动', heuristic: '关键词推断', uncat: '未归类' },
      } : {
        eyebrow: 'SKILL LAUNCHER',
        title: 'Skills <em>Workbench</em>',
        sub: 'Hit Launch to drop a skill into the current session composer — no slash typing. Uninstall moves it to a restorable trash.',
        syncing: 'Auto-sync', scanning: 'Scanning…', lastScan: 'Last scan',
        rescan: 'Scan now', rescanning: 'Scanning…',
        total: 'Skills', classified: 'Classified', uncat: 'Unclassified', trash: 'Trash',
        search: 'Search name, description, triggers…',
        srcAll: 'All sources', domainLabel: 'Domain', catLabel: 'Category',
        all: 'All', launch: 'Launch', uninstall: 'Uninstall', confirm: 'Confirm',
        detail: 'Details', path: 'Path', size: 'Size', triggers: 'Triggers',
        recat: 'Re-classify', domain: 'Domain', category: 'Category',
        empty: 'No skills match', emptyHint: 'Clear the search or pick another category',
        scoring: 'Scoring policy', expand: 'expand / collapse',
        noScore: '—', restored: 'Restored', uninstalled: 'Moved to trash', launched: 'Added to composer',
        noSession: 'No session available: open a session first',
        busy: 'Composer is busy, try again',
        copyPath: 'Click to copy path', copied: 'Path copied',
        stateDir: 'State dir', roots: 'Skill roots', log: 'Log',
        restore: 'Restore', categorySource: { reference: 'table', override: 'manual', heuristic: 'keyword', uncat: 'unclassified' },
      };
    }

    /* ────────────────────────── 数据层 ────────────────────────── */
    const store = { value: null, error: null, loading: false, listeners: new Set() };
    // useSyncExternalStore 用 Object.is 比较快照：每次通知后必须交出**新引用**。
    // 此前 getSnapshot 直接返回同一个可变 store 对象，React 判定"无变化"→ 跳过重渲染，
    // 症状是数据早已取到但界面停在首帧，只有点「一键扫描」（setScanning 触发普通 state
    // 更新）才顺带把数据画出来（2026-11-03 重启后实测复现）。
    let snapshot = { value: null, error: null, loading: false };
    function notify() {
      snapshot = { value: store.value, error: store.error, loading: store.loading };
      for (const fn of [...store.listeners]) fn();
    }
    function subscribe(fn) { store.listeners.add(fn); return () => store.listeners.delete(fn); }

    async function fetchState() {
      store.loading = true; notify();
      try {
        const res = await fetch(API + '/state', { headers: { 'cache-control': 'no-cache' } });
        const payload = await res.json();
        if (!payload.ok) throw new Error(payload.error?.message ?? 'state failed');
        store.value = payload.value;
        store.error = null;
      } catch (error) {
        store.error = error instanceof Error ? error.message : String(error);
      } finally {
        store.loading = false; notify();
      }
    }

    async function post(path, body) {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-skills-workbench': '1' },
        body: JSON.stringify(body ?? {}),
      });
      // 审计 A10：HTTP 4xx/5xx 时不判 res.ok 会把错误报成 JSON 解析失败，掩盖真实原因。
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${path}${text ? '：' + text.slice(0, 160) : ''}`);
      }
      const payload = await res.json();
      if (!payload.ok) throw new Error(payload.error?.message ?? 'request failed');
      return payload.value;
    }

    function useStore() {
      return React.useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
    }

    /* ────────────────────────── 唤起：注入输入框 ────────────────────────── */
    // 最近一次活跃会话。面板挂在 main 区时 sessions.list.current 为空（会话不在前台），
    // 靠这里记住上一个非空 current，才能实现"对最近一次打开的会话唤起"。
    let rememberedSessionId;

    function currentSessionId(sessions) {
      try { return sessions?.list?.getSnapshot?.()?.current; } catch { return undefined; }
    }

    /** 等前台会话落位（openSession / selectPanel 之后 current 需要一两个渲染周期才更新）。
     * 审计 A11：轮询必须有失效机制——新一轮等待发起后，旧的 setTimeout 链自动停轮询，
     * 避免组件卸载后还在操作已失效的状态。 */
    let sessionWaitToken = 0;
    function waitForSession(sessions, timeoutMs) {
      const token = ++sessionWaitToken;
      return new Promise(resolve => {
        const deadline = Date.now() + timeoutMs;
        const tick = () => {
          if (token !== sessionWaitToken) return resolve(undefined);
          const id = currentSessionId(sessions);
          if (id) return resolve(id);
          if (Date.now() > deadline) return resolve(undefined);
          setTimeout(tick, 80);
        };
        tick();
      });
    }

    /**
     * 会话 id 优先级（从准到宽）：
     *   ① current        当前会话（client 视图内）
     *   ② remembered     用户**最后在会话视图里打开过**的会话 —— 这才是"最近一次打开"
     *   ③ host-live      Host 的活跃 agent（agents.roots()[0]，顺序不代表最近，只能兜底）
     *   ④ host-workspace Workspace.sessionIds 登记（可能是几周前的旧会话）
     * 实测教训：②必须早于③。用户打开旧会话后唤起，曾因③抢先而跳进另一个活跃会话。
     */
    async function resolveSession(ctx) {
      const sessions = ctx.get('sessions');
      const current = currentSessionId(sessions);
      if (current !== undefined && current !== null) return { id: current, source: 'current' };
      if (rememberedSessionId !== undefined) return { id: rememberedSessionId, source: 'remembered' };

      let live = [];
      let recent = null;
      let reason = null;
      try {
        const res = await fetch(API + '/sessions', { headers: { 'cache-control': 'no-cache' } });
        const payload = await res.json();
        if (payload?.ok === true) {
          live = Array.isArray(payload.value?.liveSessions) ? payload.value.liveSessions : [];
          recent = payload.value?.recent ?? null;
          reason = payload.value?.reason ?? null;
        } else {
          reason = payload?.error?.message ?? 'sessions 接口异常';
        }
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
      }

      if (live.length > 0) return { id: live[0], source: 'host-live' };
      if (recent !== null && recent !== undefined) return { id: recent, source: 'host-workspace' };
      return { id: null, source: 'none', reason: reason ?? '未找到任何会话' };
    }

    /**
     * 把 client 的真实内部结构上报给 Host 日志（debug.log 的 DIAG 行）。
     * 目的：`sessions.list.current` 这类未在契约中声明的属性，只能靠实测确认；
     * 与其改一版让用户试一次，不如让界面自己把结构吐出来。
     */
    async function reportDiagnostics(ctx) {
      const sessions = ctx.get('sessions');
      const conversation = ctx.get('conversation');
      const uiWorkspace = ctx.get('uiWorkspace');
      const list = sessions?.list;
      let snapshot = null;
      let snapshotError = null;
      try { snapshot = list?.getSnapshot?.() ?? null; } catch (error) {
        snapshotError = error instanceof Error ? error.message : String(error);
      }
      const safeKeys = value => {
        try { return value === undefined || value === null ? [] : Object.keys(value).slice(0, 40); } catch { return []; }
      };
      const payload = {
        at: new Date().toISOString(),
        location: typeof location === 'object' ? location.href : null,
        hasSessions: sessions !== undefined,
        sessionsKeys: safeKeys(sessions),
        hasList: list !== undefined,
        listKeys: safeKeys(list),
        snapshotKeys: safeKeys(snapshot),
        snapshotError,
        current: snapshot?.current ?? null,
        remembered: rememberedSessionId ?? null,
        hasConversation: conversation !== undefined,
        conversationKeys: safeKeys(conversation),
        inputForType: typeof conversation?.input?.for,
        uiWorkspaceKeys: safeKeys(uiWorkspace),
      };
      try {
        await fetch(API + '/diagnose', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-skills-workbench': '1' },
          body: JSON.stringify(payload),
        });
      } catch { /* 诊断失败不影响功能 */ }
    }

    /** 会话时间戳（ms）→ `MM-DD HH:mm`，用于选择器辨认。 */
    function fmtSessionTime(ts) {
      if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return '';
      const d = new Date(ts);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    /**
     * 会话的可辨认标签。
     * 优先级：首条用户消息摘要 → 「工作区名 · 创建时间」→ 「会话 短id」。
     * 大量会话没有用户消息（空会话 / 子 agent 会话），若只显示短 id 用户无法辨认。
     */
    function sessionLabel(item) {
      const title = item.detail?.title;
      if (typeof title === 'string' && title !== '') return title;
      const parts = [];
      if (typeof item.workspace === 'string' && item.workspace !== '') parts.push(item.workspace);
      const time = fmtSessionTime(item.detail?.createdAt);
      if (time !== '') parts.push(time);
      if (parts.length > 0) return parts.join(' · ');
      return '会话 ' + String(item.id).slice(0, 8);
    }

    /** 会话目录名 → 可读标识。`--D-project--` → `DSH`（取最后一段）。 */
    function groupLabel(group) {
      if (typeof group !== 'string' || group === '') return null;
      const trimmed = group.replace(/^-+/, '').replace(/-+$/, '');
      const parts = trimmed.split('-').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : null;
    }

    /**
     * 收集可写入的会话候选。
     * 主来源是 **Host 扫描会话目录** 得到的 `diskSessions`（磁盘上存在即有效），
     * 登记表（活跃会话 / 工作区）只作补充 —— 未 attach 到工作区的旧会话
     * 只有扫目录才能发现（实测：session-63a1c476 因此一直不在列表里）。
     * 按目录 mtime 倒序 = 最近写入/打开的在最前。
     */
    async function collectCandidates(ctx) {
      const out = [];
      try {
        const res = await fetch(API + '/sessions', { headers: { 'cache-control': 'no-cache' } });
        const payload = await res.json();
        if (payload?.ok === true) {
          const value = payload.value ?? {};
          const details = value.details ?? {};
          // id → 所属工作区标题（用于无标题会话的兜底标识）
          const workspaceById = new Map();
          for (const workspace of value.workspaces ?? []) {
            for (const id of workspace.sessionIds ?? []) {
              if (!workspaceById.has(id)) workspaceById.set(id, workspace.title ?? null);
            }
          }
          const liveSet = new Set(value.liveSessions ?? []);
          const seen = new Set();
          const push = (id, kind, workspace, mtime, isLive) => {
            if (typeof id !== 'string' || id === '' || seen.has(id)) return;
            seen.add(id);
            out.push({
              id,
              kind,
              detail: details[id] ?? null,
              workspace: workspace ?? null,
              mtime: typeof mtime === 'number' ? mtime : 0,
              live: isLive === true || liveSet.has(id),
            });
          };
          // ① 磁盘真实会话（主来源）
          for (const item of value.diskSessions ?? []) {
            const workspace = workspaceById.get(item.id) ?? groupLabel(item.group);
            const isLive = liveSet.has(item.id);
            const kind = isLive ? '活跃会话' : (workspace !== null ? workspace : '会话');
            push(item.id, kind, workspace, item.mtime, isLive);
          }
          // ② 登记表兜底（磁盘没扫到但登记过的，理论上少见）
          for (const id of value.liveSessions ?? []) push(id, '活跃会话', workspaceById.get(id) ?? null, 0, true);
          for (const workspace of value.workspaces ?? []) {
            for (const id of workspace.sessionIds ?? []) push(id, workspace.title ?? '工作区', workspace.title ?? null, 0, false);
          }
        }
      } catch { /* 候选为空时由调用方提示 */ }

      // 排序：活跃/打开中的会话置顶（打开会话不写文件，mtime 反映不了"刚看过"），
      // 其余按 mtime 倒序（最近有写入/产出的在前）。
      const keyOf = item => (item.mtime > 0
        ? item.mtime
        : (typeof item.detail?.createdAt === 'number' ? item.detail.createdAt : -1));
      out.sort((a, b) => {
        const liveRank = (b.live === true ? 1 : 0) - (a.live === true ? 1 : 0);
        if (liveRank !== 0) return liveRank;
        return keyOf(b) - keyOf(a);
      });
      return out;
    }

    /** 把 /技能名 写进指定会话的输入框（切前台 → scope/retain → setDraft）。 */
    async function injectTo(ctx, sessionId, name) {
      const c = copy();
      const sessions = ctx.get('sessions');
      const conversation = ctx.get('conversation');
      const layout = ctx.get('layout');
      const uiWorkspace = ctx.get('uiWorkspace');

      // 目标会话不在前台时先切过去：conversation.input 只为前台会话提供输入框。
      if (currentSessionId(sessions) !== sessionId) {
        try { layout?.selectPanel?.('conversation'); } catch { /* ignore */ }
        try { uiWorkspace?.openSession?.(sessionId); } catch { /* ignore */ }
        const hasList = sessions?.list?.getSnapshot !== undefined;
        if (hasList) sessionId = (await waitForSession(sessions, 2500)) ?? sessionId;
      }

      // scope() 只借用「已保留」的上下文；刚切过来的会话可能尚未 retain，用 retain 兜底。
      let reference;
      let agentCtx = sessions?.scope?.(sessionId);
      if (agentCtx === undefined) {
        try {
          reference = sessions.retain(sessionId, { source: 'controllerOperation' });
          const binding = await reference.ready;
          agentCtx = binding.ctx;
        } catch (error) {
          return {
            ok: false,
            message: '会话尚未就绪：' + (error instanceof Error ? error.message : String(error)),
          };
        }
      }

      try {
        const input = conversation?.input?.for?.(agentCtx);
        if (input === undefined || input === null) return { ok: false, message: c.busy };
        const snapshot = input.state.getSnapshot();
        if (snapshot.phase !== undefined && snapshot.phase !== 'plain') return { ok: false, message: c.busy };
        const token = '/' + name;
        const draft = typeof snapshot.draft === 'string' ? snapshot.draft : '';
        const next = draft === '' ? token + ' ' : (/\s$/.test(draft) ? draft + token + ' ' : draft + ' ' + token + ' ');
        input.setDraft(next);
        try { layout?.selectPanel?.('conversation'); } catch { /* 面板切换失败不影响注入 */ }
        return { ok: true, message: c.launched + '：/' + name + '（' + String(sessionId).slice(0, 8) + '）' };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      } finally {
        try { reference?.release?.(); } catch { /* ignore */ }
      }
    }

    /**
     * 唤起入口。
     * 只有当会话来源可靠（current / remembered，即"用户确实在会话视图里打开过它"）时才直接写入；
     * 否则返回候选列表让用户点选 —— 因为 host-live 的数组顺序不代表"最近"，猜错会把技能
     * 写进别的会话（2026-11-03 实测：liveSessions=[5e149f2e, 63a1c476]，用户打开的是后者）。
     */
    async function launchSkill(ctx, name) {
      const c = copy();
      const resolved = await resolveSession(ctx);
      if (resolved.id === null || resolved.id === undefined) {
        return { ok: false, message: c.noSession + (resolved.reason ? '（' + resolved.reason + '）' : '') };
      }
      const reliable = resolved.source === 'current' || resolved.source === 'remembered';
      if (!reliable) {
        const candidates = await collectCandidates(ctx);
        if (candidates.length > 0) return { needsPicker: true, name, candidates };
      }
      return injectTo(ctx, resolved.id, name);
    }

    /* ────────────────────────── 小工具 ────────────────────────── */
    function humanSize(bytes) {
      if (!bytes) return '—';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }
    function mdInline(text) {
      const escaped = String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    function effGrade(score) {
      if (score === null || score === undefined || score === '') return null;
      return String(score);
    }

    function GearIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 3, y: 4, width: 8, height: 5, rx: 2, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('rect', { x: 13, y: 4, width: 8, height: 5, rx: 2, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('rect', { x: 3, y: 11, width: 8, height: 5, rx: 2, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', { d: 'M15.5 10.5 13 16h3l-1 5 5-6.5h-3z', fill: 'currentColor' }));
    }

    /* ────────────────────────── 行组件 ────────────────────────── */
    function SkillRow(props) {
      const { skill, c, maxSize, onLaunch, onUninstall, onRecat, open, onToggle, domains, categories, effDims, effParts } = props;
      const [confirming, setConfirming] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const eff = effGrade(skill.eff);
      const pct = Math.max(3, Math.round((skill.size || 0) / maxSize * 100));
      const catName = (categories.find(item => item.id === skill.cat) || {}).name ?? skill.cat;
      const domName = (domains.find(item => item.id === skill.dom) || {}).name ?? skill.dom;
      const dims = Array.isArray(effDims) ? effDims : [];
      const parts = effParts && effParts[skill.name] && Array.isArray(effParts[skill.name].p) ? effParts[skill.name].p : [];

      const run = async (fn) => {
        setBusy(true);
        try { await fn(); } finally { setBusy(false); }
      };

      return h('div', {
        className: 'sw-row sw-glass',
        'data-open': open ? '1' : '0',
        role: 'button',
        tabIndex: 0,
        'aria-expanded': open,
        title: open ? '收起详情' : '点击展开详情',
        onClick: () => onToggle(),
        onKeyDown: event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(); }
        },
      },
        h('div', { className: 'sw-name', title: skill.name },
          skill.name,
          skill.self ? h('span', { className: 'self' }, '自建') : null),
        h('div', { className: 'sw-desc', title: skill.description || '' },
          skill.description || h('span', { className: 'sw-na' }, '（无描述）')),
        h('div', { className: 'sw-trig' }, skill.triggers || h('span', { className: 'sw-na' }, '—')),
        h('div', { className: 'sw-size' }, humanSize(skill.size), h('i', null, h('b', { style: { width: pct + '%' } }))),
        h('div', { className: 'sw-scores' },
          eff !== null
            ? h('span', { className: 'sw-sc', 'data-t': 'eff', 'data-g': skill.effg || '中', title: '效率分（上下文经济性）' }, eff)
            : h('span', { className: 'sw-na' }, '—'),
          skill.rep
            ? h('span', { className: 'sw-sc', 'data-t': 'rep', title: '风评分（公开口碑）' }, skill.rep)
            : null),
        h('div', { className: 'sw-actions' },
          h('button', {
            type: 'button', className: 'sw-act', 'data-a': 'launch', disabled: busy,
            title: '把 /' + skill.name + ' 放进当前会话输入框',
            onClick: event => { event.stopPropagation(); void run(() => onLaunch(skill.name)); },
          }, c.launch),
          h('button', {
            type: 'button', className: 'sw-act', 'data-a': confirming ? 'confirm' : 'remove', disabled: busy,
            title: confirming ? '再次点击确认卸载（移入回收区）' : '移入回收区（可恢复）',
            onClick: event => {
              event.stopPropagation();
              if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 4000); return; }
              setConfirming(false);
              void run(() => onUninstall(skill.name));
            },
          }, confirming ? c.confirm : c.uninstall)),
        open ? h('div', { className: 'sw-detail', onClick: event => event.stopPropagation() },
          h('div', { className: 'sw-d-full' },
            h('div', { className: 'k' }, c.description ?? '描述'),
            h('div', { className: 'v' }, skill.description || '（无描述）')),
          h('div', { className: 'sw-d-full' },
            h('div', { className: 'k' }, c.triggers),
            h('div', { className: 'v' }, skill.triggers || '—')),
          h('div', { className: 'row' },
            h('span', null, h('span', { className: 'k' }, c.domain), domName),
            h('span', null, h('span', { className: 'k' }, c.category), catName),
            h('span', null, h('span', { className: 'k' }, '大小'), humanSize(skill.size)),
            h('span', null, h('span', { className: 'k' }, '修改时间'), new Date(skill.mtime).toLocaleString())),
          h('div', { className: 'row' },
            h('span', null, h('span', { className: 'k' }, c.path),
              h('code', { title: c.copyPath, style: { cursor: 'pointer' }, onClick: () => { navigator.clipboard?.writeText(skill.dir); } }, skill.dir))),
          h('div', { className: 'row' },
            skill.copies && skill.copies.length > 1
              ? h('span', null, h('span', { className: 'k' }, '副本'), skill.copies.map(item => item.rootLabel).join(' · '))
              : null,
            h('span', null, h('span', { className: 'k' }, c.categorySource[skill.categorySource] ?? skill.categorySource),
              skill.categoryReason ? h('span', { className: 'sw-na' }, ' · ' + skill.categoryReason) : null)),
          h('div', { className: 'sw-d-full' },
            h('div', { className: 'k' }, '评分'),
            h('div', { className: 'sw-dims' },
              h('span', { className: 'sw-dchip' }, '效率 ' + (skill.eff ?? '—') + (skill.effg ? '（' + skill.effg + '）' : '')),
              h('span', { className: 'sw-dchip' }, '风评 ' + (skill.rep || '—')),
              dims.length > 0 && parts.length === dims.length
                ? dims.map((dim, index) => h('span', { className: 'sw-ddim', key: dim }, dim + ' ' + parts[index]))
                : null)),
          h('div', { className: 'row', onClick: event => event.stopPropagation() },
            h('span', { className: 'k' }, c.recat),
            h('select', {
              value: skill.dom,
              onChange: event => void onRecat(skill.name, event.target.value, skill.cat),
              'aria-label': c.domain,
            }, domains.map(item => h('option', { key: item.id, value: item.id }, item.icon + ' ' + item.name))),
            h('select', {
              value: skill.cat,
              onChange: event => void onRecat(skill.name, skill.dom, event.target.value),
              'aria-label': c.category,
            }, categories.map(item => h('option', { key: item.id, value: item.id }, item.icon + ' ' + item.name))),
            h('span', { className: 'sw-na' }, domName + ' / ' + catName)))
        : null);
    }

    /* ────────────────────────── 回收站（已卸载可恢复） ────────────────────────── */
    function TrashSection(props) {
      const { trash, busy, onRestore } = props;
      const [open, setOpen] = React.useState(false);
      const items = Array.isArray(trash) ? trash : [];
      return h('section', { className: 'sw-trash sw-glass', 'data-open': open ? '1' : '0' },
        h('div', {
          className: 'sw-scoring-head', role: 'button', tabIndex: 0,
          'aria-expanded': open, onClick: () => setOpen(value => !value),
          onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(value => !value); } },
        },
          h('span', { className: 'sw-caret' }, '▼'),
          h('h3', null, '🗑 回收站'),
          h('span', { className: 'hint' }, items.length === 0 ? '空' : items.length + ' 个可恢复')),
        h('div', { className: 'sw-trash-body' },
          items.length === 0
            // 入口常驻：空态也给说明，否则用户找不到"恢复"在哪
            ? h('div', { className: 'sw-trash-empty' }, '暂无已卸载的技能。点技能行的「卸载」后会出现在这里，可随时恢复。')
            : items.map((item, index) => {
                const time = fmtSessionTime(Date.parse(item.at ?? ''));
                const meta = [time, item.from].filter(part => typeof part === 'string' && part !== '').join(' · ');
                return h('div', { className: 'sw-trash-item', key: (item.name ?? '') + ':' + index },
                  h('div', { className: 'main' },
                    h('div', { className: 'name' }, item.name ?? '（未知技能）'),
                    h('div', { className: 'meta' }, meta !== '' ? meta : '已移入回收区，点击右侧恢复')),
                  h('button', {
                    type: 'button',
                    className: 'sw-act sw-act-restore',
                    disabled: busy,
                    title: '恢复到 ' + (item.from ?? '原目录'),
                    onClick: () => onRestore(item.name),
                  }, '↩ 恢复'));
              })));
    }

    /* ────────────────────────── 评分口径（底部） ────────────────────────── */
    function ScoringSection(props) {
      const { scoring, c } = props;
      const [open, setOpen] = React.useState(false);
      const rep = Array.isArray(scoring?.rep) ? scoring.rep : [];
      const eff = Array.isArray(scoring?.eff) ? scoring.eff : [];
      const repNotes = Array.isArray(scoring?.repNotes) ? scoring.repNotes : [];
      const effNotes = Array.isArray(scoring?.effNotes) ? scoring.effNotes : [];
      if (!scoring?.intro && rep.length === 0 && eff.length === 0) return null;

      return h('section', { className: 'sw-scoring sw-glass', 'data-open': open ? '1' : '0' },
        h('div', {
          className: 'sw-scoring-head', role: 'button', tabIndex: 0,
          'aria-expanded': open, onClick: () => setOpen(v => !v),
          onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(v => !v); } },
        },
          h('span', { className: 'sw-caret' }, '▼'),
          h('h3', null, '📊 ' + c.scoring),
          h('span', { className: 'hint' }, c.expand)),
        h('div', { className: 'sw-scoring-body' },
          scoring?.intro
            ? h('p', { className: 'sw-intro', dangerouslySetInnerHTML: { __html: mdInline(scoring.intro) } })
            : null,
          rep.length > 0 ? h('div', null,
            h('table', { className: 'sw-table' },
              h('thead', null, h('tr', null, h('th', null, '风评分'), h('th', null, '判据'))),
              h('tbody', null, rep.map((row, index) =>
                h('tr', { key: 'rep' + index },
                  h('td', null, row.v),
                  h('td', { dangerouslySetInnerHTML: { __html: mdInline(row.rule) } })))))) : null,
          repNotes.length > 0 ? h('ul', { className: 'sw-notes' },
            repNotes.map((note, index) => h('li', { key: 'rn' + index, className: 'sw-note', dangerouslySetInnerHTML: { __html: mdInline(note) } }))) : null,
          eff.length > 0 ? h('div', null,
            h('table', { className: 'sw-table' },
              h('thead', null, h('tr', null, h('th', null, '效率维度'), h('th', null, '权重'), h('th', null, '判据'))),
              h('tbody', null, eff.map((row, index) =>
                h('tr', { key: 'eff' + index },
                  h('td', null, row.dim),
                  h('td', null, row.w),
                  h('td', { dangerouslySetInnerHTML: { __html: mdInline(row.rule) } })))))) : null,
          effNotes.length > 0 ? h('ul', { className: 'sw-notes' },
            effNotes.filter(note => note !== '---').map((note, index) =>
              h('li', { key: 'en' + index, className: 'sw-note', dangerouslySetInnerHTML: { __html: mdInline(note) } }))) : null));
    }

    /* ────────────────────────── 主面板 ────────────────────────── */
    function Panel(props) {
      const c = copy();
      const snap = useStore();
      const [query, setQuery] = React.useState('');
      const [domain, setDomain] = React.useState('all');
      const [category, setCategory] = React.useState('all');
      const [source, setSource] = React.useState('all');
      const [expanded, setExpanded] = React.useState(null);
      const [toast, setToast] = React.useState(null);
      const [scanning, setScanning] = React.useState(false);
      const [trashBusy, setTrashBusy] = React.useState(false);
      // 会话选择器：会话来源不可靠时，让用户点选要写入哪个会话（避免写错会话）
      const [picker, setPicker] = React.useState(null);
      // 唤起目标会话（诊断用）：{ id, source }；id 为空说明三层兜底都没拿到会话。
      const [targetSession, setTargetSession] = React.useState(null);

      React.useEffect(() => {
        // 自适应轮询：还没有数据 / Host 正在扫描时用 2s 快轮询，拿到清单后退回 12s。
        // 面板刚打开时 Host 的 startup 扫描可能仍在进行（实测 1.6s），固定 12s 会让
        // 首屏空窗过久，看起来像"必须手动点扫描"。
        let timer = null;
        let cancelled = false;
        // 打开面板时把 client 内部结构上报一次（写进 Host debug.log 的 DIAG 行）
        void reportDiagnostics(props.ctx);
        const tick = async () => {
          await fetchState();
          if (cancelled) return;
          const resolved = await resolveSession(props.ctx);
          if (!cancelled) {
            setTargetSession(prev => (prev !== null && prev.id === resolved.id && prev.source === resolved.source
              ? prev
              : resolved));
          }
          const idle = store.value !== null && store.value.scanning !== true;
          timer = setTimeout(tick, idle ? POLL_MS : 2000);
        };
        void tick();
        return () => { cancelled = true; if (timer !== null) clearTimeout(timer); };
      }, []);

      const showToast = React.useCallback((message, kind) => {
        setToast({ message, kind: kind ?? 'ok', at: Date.now() });
        setTimeout(() => setToast(current => (current && Date.now() - current.at >= 2400 ? null : current)), 2500);
      }, []);

      const state = snap.value;
      const skills = Array.isArray(state?.skills) ? state.skills : [];
      const domains = Array.isArray(state?.catalog?.domains) ? state.catalog.domains : [];
      const categories = Array.isArray(state?.catalog?.categories) ? state.catalog.categories : [];
      const scoring = state?.catalog?.scoring ?? {};
      const maxSize = skills.reduce((max, item) => Math.max(max, item.size || 0), 1);

      const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        return skills.filter(skill => {
          if (domain !== 'all' && skill.dom !== domain) return false;
          if (category !== 'all' && skill.cat !== category) return false;
          if (source !== 'all' && skill.rootId !== source) return false;
          if (q !== '') {
            const hay = [skill.name, skill.title, skill.description, skill.triggers, skill.cat, skill.dom, skill.rootLabel].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
      }, [skills, query, domain, category, source]);

      const groups = React.useMemo(() => {
        const order = category !== 'all'
          ? [category]
          : (domain === 'all' ? categories.map(item => item.id) : categories.filter(item => item.dom === domain).map(item => item.id));
        const out = [];
        for (const cid of order) {
          const rows = filtered.filter(skill => skill.cat === cid);
          if (rows.length === 0) continue;
          const meta = categories.find(item => item.id === cid) ?? { id: cid, name: cid, icon: '•', dom: '' };
          const domMeta = domains.find(item => item.id === meta.dom) ?? { name: '' };
          out.push({ id: cid, meta, domMeta, rows });
        }
        // 未在任何类里的（理论不发生）兜底
        const covered = new Set(out.map(group => group.id));
        const leftovers = filtered.filter(skill => !covered.has(skill.cat));
        if (leftovers.length > 0) out.push({ id: '__rest', meta: { id: '__rest', name: '其他', icon: '•', dom: '' }, domMeta: { name: '' }, rows: leftovers });
        return out;
      }, [filtered, category, domain, categories, domains]);

      const counts = React.useMemo(() => {
        const byDom = new Map();
        const byCat = new Map();
        for (const skill of skills) {
          byDom.set(skill.dom, (byDom.get(skill.dom) ?? 0) + 1);
          byCat.set(skill.cat, (byCat.get(skill.cat) ?? 0) + 1);
        }
        return { byDom, byCat };
      }, [skills]);

      const catPool = React.useMemo(() => {
        return domain === 'all' ? categories : categories.filter(item => item.dom === domain);
      }, [domain, categories]);

      const doLaunch = React.useCallback(async (name) => {
        const result = await launchSkill(props.ctx, name);
        if (result.needsPicker === true) {
          setPicker({ name: result.name, candidates: result.candidates });
          return;
        }
        showToast(result.message, result.ok ? 'ok' : 'err');
      }, [props.ctx, showToast]);

      // 用户点选会话后：写入 + 记住这个选择（下次同一会话可直接一键）
      const pickSession = React.useCallback(async (sessionId) => {
        const current = picker;
        setPicker(null);
        if (current === null) return;
        rememberedSessionId = sessionId;
        const result = await injectTo(props.ctx, sessionId, current.name);
        showToast(result.message, result.ok ? 'ok' : 'err');
      }, [picker, props.ctx, showToast]);

      const doUninstall = React.useCallback(async (name) => {
        try {
          await post('/uninstall', { name });
          showToast(c.uninstalled + '：' + name, 'ok');
          await fetchState();
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error), 'err');
        }
      }, [c, showToast]);

      // 回收站恢复：把技能从 trash 移回原落地目录，并刷新清单
      const doRestore = React.useCallback(async (name) => {
        setTrashBusy(true);
        try {
          await post('/restore', { name });
          showToast(c.restored + '：' + name, 'ok');
          await fetchState();
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error), 'err');
        } finally {
          setTrashBusy(false);
        }
      }, [c, showToast]);

      const doRecat = React.useCallback(async (name, dom, cat) => {
        try {
          await post('/category', { name, dom, cat });
          await fetchState();
          showToast('分类已更新', 'ok');
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error), 'err');
        }
      }, [showToast]);

      const doScan = React.useCallback(async () => {
        setScanning(true);
        try {
          await post('/scan');
          await fetchState();
          showToast('扫描完成', 'ok');
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error), 'err');
        } finally {
          setScanning(false);
        }
      }, [showToast]);

      const classified = skills.filter(skill => skill.dom !== 'uncat').length;
      const uncat = skills.length - classified;
      const lastScan = state?.scannedAt ? new Date(state.scannedAt).toLocaleTimeString() : '—';

      return h('div', { className: 'sw-root' },
        h('div', { className: 'sw-inner' },
          // 审计 A2 配套：Host 把服务状态暴露在 /state 里，这里给出用户能看懂的提示。
          state?.serverReady === false
            ? h('div', { className: 'sw-banner', 'data-t': 'err', role: 'alert' },
                'Host 数据通道未就绪：面板读不到数据。请重启桌面端；若重启后仍出现，查看 ~/.dsh/skills-workbench/debug.log')
            : null,
          state?.watcherDegraded === true
            ? h('div', { className: 'sw-banner', 'data-t': 'warn' },
                '技能目录监听不可用，已自动降级为 30 秒轮询同步（功能不受影响，同步稍慢）')
            : null,
          h('header', { className: 'sw-hero sw-glass' },
            h('div', { className: 'sw-hero-main' },
              h('span', { className: 'sw-eyebrow' }, c.eyebrow),
              h('h1', { className: 'sw-title', dangerouslySetInnerHTML: { __html: c.title } }),
              h('p', { className: 'sw-sub' }, c.sub),
              h('div', { className: 'sw-sync' },
                h('span', { className: 'sw-dot', 'data-busy': snap.loading || scanning ? '1' : '0' }),
                h('span', null, snap.loading || scanning ? c.scanning : c.syncing),
                h('span', { className: 'sep' }),
                h('span', null, c.lastScan + ' ' + lastScan),
                h('span', { className: 'sep' }),
                h('span', {
                  title: targetSession?.id
                    ? '唤起会写入这个会话的输入框（来源：' + (SOURCE_LABEL[targetSession.source] ?? targetSession.source) + '）'
                    : '三层兜底都没拿到会话：' + (targetSession?.reason ?? '请先在会话里停留一次'),
                  style: targetSession?.id ? undefined : { color: 'var(--sw-coral)' },
                }, '唤起目标 ' + (targetSession?.id
                  ? String(targetSession.id).slice(0, 8) + ' · ' + (SOURCE_LABEL[targetSession.source] ?? targetSession.source)
                  : '未识别')),
                snap.error !== null && snap.error !== undefined
                  ? h('span', { style: { color: 'var(--sw-coral)' }, title: snap.error }, '· 数据通道异常：' + snap.error)
                  : (state?.lastError ? h('span', { style: { color: 'var(--sw-coral)' } }, '· ' + state.lastError) : null))),
            h('div', { className: 'sw-hero-side' },
              h('button', {
                type: 'button', className: 'sw-btn sw-btn-primary', disabled: scanning,
                onClick: () => void doScan(),
              }, scanning ? c.rescanning : '⟳ ' + c.rescan))),

          h('div', { className: 'sw-stats' },
            h('div', { className: 'sw-stat sw-glass', 'data-k': 'total' }, h('span', { className: 'bar' }), h('div', { className: 'n' }, skills.length), h('div', { className: 'l' }, c.total)),
            h('div', { className: 'sw-stat sw-glass', 'data-k': 'classified' }, h('span', { className: 'bar' }), h('div', { className: 'n' }, classified), h('div', { className: 'l' }, c.classified)),
            h('div', { className: 'sw-stat sw-glass', 'data-k': 'uncat' }, h('span', { className: 'bar' }), h('div', { className: 'n' }, uncat), h('div', { className: 'l' }, c.uncat)),
            h('div', { className: 'sw-stat sw-glass', 'data-k': 'trash' }, h('span', { className: 'bar' }), h('div', { className: 'n' }, state?.trashCount ?? 0), h('div', { className: 'l' }, c.trash))),

          h('div', { className: 'sw-toolbar sw-glass' },
            h('div', { className: 'sw-search' },
              h('span', { className: 'ic' }, '🔍'),
              h('input', {
                type: 'text', value: query, placeholder: c.search, 'aria-label': c.search,
                onChange: event => setQuery(event.target.value),
              })),
            h('div', { className: 'sw-seg' },
              [['all', c.srcAll], ['agents', 'agents'], ['dsh', 'dsh'], ['trae', 'trae']].map(([id, label]) =>
                h('button', {
                  key: id, type: 'button', 'data-on': source === id ? '1' : '0',
                  onClick: () => setSource(id),
                }, label)))),

          h('div', { className: 'sw-caption' }, c.domainLabel),
          h('div', { className: 'sw-chips' },
            h('button', {
              type: 'button', className: 'sw-chip', 'data-on': domain === 'all' ? '1' : '0',
              onClick: () => { setDomain('all'); setCategory('all'); },
            }, c.all, h('span', { className: 'c' }, String(skills.length))),
            domains.map(item => {
              const total = counts.byDom.get(item.id) ?? 0;
              const hit = filtered.filter(skill => skill.dom === item.id).length;
              return h('button', {
                key: item.id, type: 'button', className: 'sw-chip',
                'data-on': domain === item.id ? '1' : '0',
                'data-zero': hit === 0 ? '1' : '0',
                onClick: () => { setDomain(domain === item.id ? 'all' : item.id); setCategory('all'); },
              }, item.icon + ' ' + item.name, h('span', { className: 'c' }, hit === total ? String(total) : hit + '/' + total));
            })),

          h('div', { className: 'sw-caption' }, c.catLabel),
          h('div', { className: 'sw-chips' },
            h('button', {
              type: 'button', className: 'sw-chip', 'data-kind': 'cat', 'data-on': category === 'all' ? '1' : '0',
              onClick: () => setCategory('all'),
            }, c.all),
            catPool.map(item => {
              const total = counts.byCat.get(item.id) ?? 0;
              const hit = filtered.filter(skill => skill.cat === item.id).length;
              return h('button', {
                key: item.id, type: 'button', className: 'sw-chip', 'data-kind': 'cat',
                'data-on': category === item.id ? '1' : '0',
                'data-zero': hit === 0 ? '1' : '0',
                onClick: () => setCategory(category === item.id ? 'all' : item.id),
              }, item.icon + ' ' + item.name, h('span', { className: 'c' }, hit === total ? String(total) : hit + '/' + total));
            })),

          filtered.length === 0
            ? h('div', { className: 'sw-empty sw-glass' },
                h('span', { className: 'big' }, state === null ? '🔌' : '🔍'),
                state === null ? '正在连接技能数据通道…' : c.empty,
                h('div', { style: { marginTop: 6, fontSize: 11.5 } },
                  state === null
                    ? '若长时间停在这里，说明 Host 路由未注册：查看 ~/.dsh/skills-workbench/debug.log'
                    : c.emptyHint))
            : groups.map(group => h('section', { key: group.id, className: 'sw-group' },
                h('div', { className: 'sw-group-head' },
                  h('h3', null, group.meta.icon + ' ' + group.meta.name),
                  h('span', { className: 'n' }, group.rows.length + ' 个'),
                  h('span', { className: 'd' }, (group.domMeta?.name ?? '') + (group.domMeta?.name ? ' / ' : '') + group.id)),
                h('div', { className: 'sw-rows' },
                  group.rows.map(skill => h(SkillRow, {
                    key: skill.name + '@' + skill.rootId,
                    skill, c, maxSize,
                    domains, categories,
                    effDims: state?.catalog?.effDims,
                    effParts: state?.catalog?.effParts,
                    open: expanded === skill.name,
                    onToggle: () => setExpanded(expanded === skill.name ? null : skill.name),
                    onLaunch: doLaunch,
                    onUninstall: doUninstall,
                    onRecat: doRecat,
                  }))))),

          h(TrashSection, { trash: state?.trash, busy: trashBusy, onRestore: doRestore }),

          h(ScoringSection, { scoring, c }),

          h('footer', { className: 'sw-foot' },
            h('div', null, c.roots + '：' + (state?.roots ?? []).map(root => root.label + (root.exists ? '' : '（缺失）')).join(' · ')),
            h('div', null, c.stateDir + '：' + (state?.stateDir ?? '—')),
            h('div', null, '点击任意技能行展开完整详情；唤起后自动切回会话面板。')),

          toast !== null ? h('div', { className: 'sw-toast', 'data-t': toast.kind, role: 'status' }, toast.message) : null,

          picker !== null ? h('div', { className: 'sw-picker sw-glass', role: 'dialog', 'aria-label': '选择要写入的会话' },
            h('div', { className: 'sw-picker-head' },
              h('span', null, '选择要写入的会话'),
              h('button', { type: 'button', className: 'sw-picker-close', 'aria-label': '关闭', onClick: () => setPicker(null) }, '✕')),
            h('div', { className: 'sw-picker-sub' },
              '唤起「' + picker.name + '」——无法确定你正在看哪个会话（会话列表未暴露），请点选目标：'),
            h('div', { className: 'sw-picker-list' },
              picker.candidates.map(item => {
                const title = sessionLabel(item);
                const count = item.detail?.eventCount;
                const isEmpty = typeof count === 'number' && count <= 1;
                const meta = [
                  fmtSessionTime(item.detail?.createdAt),
                  typeof count === 'number'
                    ? (isEmpty ? '空会话' : count + (item.detail?.truncated === true ? '+ ' : ' ') + '条事件')
                    : '',
                  item.kind,
                ].filter(part => part !== '' && part !== null && part !== undefined).join(' · ');
                return h('button', {
                  key: item.id,
                  type: 'button',
                  className: 'sw-picker-item' + (item.live === true ? ' sw-picker-live' : ''),
                  'data-empty': isEmpty ? '1' : '0',
                  title: item.id,
                  onClick: () => void pickSession(item.id),
                },
                  h('span', { className: 'sw-picker-main' },
                    h('span', { className: 'sw-picker-title' }, title),
                    h('span', { className: 'sw-picker-meta' }, meta)),
                  h('span', { className: 'sw-picker-id' }, String(item.id).slice(0, 8)));
              }))) : null));
    }

    /* ────────────────────────── 侧栏入口 ────────────────────────── */
    /* ownerProps 契约：{ size: number, active: boolean } —— 按宿主给定的尺寸与选中态渲染。 */
    function SidebarEntry(props) {
      const size = typeof props.size === 'number' ? props.size : 30;
      return h('button', {
        type: 'button',
        className: 'sw-nav',
        'data-active': props.active === true ? '1' : '0',
        style: { width: size, height: size },
        title: '技能工作台',
        'aria-label': '技能工作台',
        'aria-pressed': props.active === true,
        onClick: () => { try { props.open(); } catch { /* ignore */ } },
      }, h(GearIcon));
    }

    /* ────────────────────────── 注册 ────────────────────────── */
    const PANEL_KEY = 'skills-workbench';

    // 审计 A1：apply 里的任何异常都会冒泡到宿主 boot，可能让整个页面初始化中断
    //（另一设备实测：team view ready() 20 秒超时、client 零日志）。分阶段兜错，
    // 并把失败上报到 Host /diag —— WebView 的 console 用户拿不到，debug.log 才是排障通道。
    function reportDiag(stage, error) {
      const detail = error instanceof Error ? (error.stack || error.message) : String(error);
      try {
        void fetch(API + '/diag', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-skills-workbench': '1' },
          body: JSON.stringify({ stage, detail: String(detail).slice(0, 600) }),
        }).catch(() => { /* 上报失败就放弃，不再制造异常 */ });
      } catch { /* ignore */ }
      try { console.error('[skills-workbench]', stage, error); } catch { /* ignore */ }
    }

    return {
      inject: ['slots', 'sessions', 'conversation', 'layout'],
      apply(ctx) {
        const stage = (name, fn) => {
          try { fn(); } catch (error) { reportDiag(name, error); }
        };

        stage('styles', () => ctx.effect(installStyles, 'skills-workbench: styles'));

        // 记住"用户最后在会话视图里打开过的会话"：切到技能面板后 current 会变空，
        // 唤起时需要它。两条保障并存——订阅（即时）＋ 低频轮询（subscribe 不可用时兜底）。
        stage('remember-session', () => {
          const sessions = ctx.get('sessions');
          const list = sessions?.list;
          if (list?.getSnapshot === undefined) return;
          const remember = () => {
            const id = currentSessionId(sessions);
            if (id !== undefined && id !== null) rememberedSessionId = id;
          };
          remember();
          if (list.subscribe !== undefined) {
            ctx.effect(() => {
              const off = list.subscribe(remember);
              return () => { try { off?.(); } catch { /* ignore */ } };
            }, 'skills-workbench: remember active session');
          }
          // 纯内存读快照，成本可忽略；2s 一次保证切面板前能记录到。
          ctx.effect(() => {
            const timer = setInterval(remember, 2000);
            return () => clearInterval(timer);
          }, 'skills-workbench: poll active session');
        });

        const open = () => {
          try {
            // 审计 B1：宿主文档口径是 ctx.layout.selectPanel(id)；ctx.get('layout')
            // 保留为能力探测兜底（R29-A：探测能力，不赌 API 形态）。
            const layout = ctx.layout ?? ctx.get?.('layout');
            if (layout?.selectPanel) layout.selectPanel(PANEL_KEY);
          } catch (error) { reportDiag('open-panel', error); }
        };

        stage('register-slots', () => {
          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_KEY,
            id: 'skills-workbench-panel',
            order: 20,
          // 审计 A5：透传宿主 owner props，面板才能拿到宿主上下文。
          }, ownerProps => h(Panel, { ctx, ...ownerProps })));

          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_KEY,
            order: 60,
            // 审计 A6：label 由宿主以函数求值；硬编码中文在英文环境会原样显示。
            label: () => (typeof navigator !== 'undefined'
              && String(navigator.language || '').toLowerCase().startsWith('zh'))
              ? '技能工作台' : 'Skills Workbench',
          // 审计 A4：宿主调用 renderSlot('sidebar.panellist', { size, active }, { only: id })——
          // 吞掉这些 props 会让图标尺寸恒为默认 30、选中态永远不亮。
          }, ownerProps => h(SidebarEntry, { ...ownerProps, open })));
        });
      },
    };
  },
});
