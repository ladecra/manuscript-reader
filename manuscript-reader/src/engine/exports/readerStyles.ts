// ─── Canonical reader stylesheet — single source for BOTH reading surfaces ────
//
// The in-app reader (src/index.css, §14/§19) and the exported shared/beta reader
// (shareableReader.ts) must render the manuscript identically — same paper, same
// prose metrics, same chapter opener, same marks. Historically each surface kept
// its own copy and the shared reader drifted a full redesign behind. This module
// is the fix: the reading-surface rules live here, once.
//
//   • READER_SURFACE_CSS — the reading rules (token-driven). Consumed by BOTH the
//     app (injected) and the exporter (inlined into the self-contained HTML). A
//     tweak here reaches both surfaces. Authored to match index.css verbatim so
//     adopting it app-side is a visual no-op.
//   • READER_TOKENS_CSS — the design tokens the rules reference. Only the STANDALONE
//     shared reader needs this (it has no index.css); the app already defines the
//     same tokens in index.css §1, so the app injects READER_SURFACE_CSS alone.
//
// Pure strings — no browser/Vite APIs — so the Node check-harnesses (check-share-
// parity et al.) that import the exporter via type-stripping resolve this fine.

/** Design tokens the reading surface references. Standalone shared reader only —
 *  the app defines the same names in index.css §1. Values mirror index.css exactly:
 *  cool slate chrome (dark) / cool near-white (light), ONE warm paper reading
 *  surface, ink-blue accent (the redesign's `--gold` is blue, not gold). */
export const READER_TOKENS_CSS = `
:root{
  color-scheme:dark;
  --page-field:radial-gradient(130% 90% at 50% -10%,#12161E 0%,#0F131A 58%,#0C0F14 100%);
  --page:#0F131A;--raised:#171C25;--bar-glass:rgba(15,19,26,.82);
  --ink:#EAEDF2;--ink-2:#9AA4B4;--ink-muted:#6C7686;--ink-faint:#3C4453;
  --line:#262D39;
  --gold:#6C93F0;--gold-soft:#8FB0F5;--gold-line:rgba(108,147,240,.30);--gold-tint:rgba(108,147,240,.16);--on-gold:#0B1220;
  --good:#45B37E;--good-soft:#16281F;--good-line:rgba(69,179,126,.32);--good-ink:#D6F2E2;
  --muted:var(--ink-2);--dim:var(--ink-muted);--border:var(--line);--surface-high:#1E2530;
  --brand:var(--gold);--drop-cap:var(--gold);
  --topbar-bg:#0C0F14;--reader-bg:#16181C;
  --accent-amber:#3E5EA6;--accent-amber-ink:#fff;--accent-amber-gradient:#3E5EA6;
  --ann-highlight:var(--gold-tint);--ann-highlight-solid:var(--gold);
  --ann-note:rgba(142,145,146,.22);--ann-note-solid:#8e9192;
  --ann-bookmark:rgba(99,102,241,.22);--ann-bookmark-solid:#6366f1;
  --ann-question:rgba(239,100,97,.22);--ann-question-solid:#ef6461;
  --ann-continuity:rgba(52,211,153,.22);--ann-continuity-solid:#34d399;
  --ann-structural:rgba(251,146,60,.22);--ann-structural-solid:#fb923c;
  --ann-pacing:rgba(56,189,248,.22);--ann-pacing-solid:#38bdf8;
  --ann-voice:rgba(192,132,252,.22);--ann-voice-solid:#c084fc;
  --font-display:"Iowan Old Style","Charter","Palatino Linotype","Book Antiqua",Georgia,serif;
  --font-body:"Iowan Old Style","Charter","Palatino Linotype","Book Antiqua",Georgia,serif;
  --font-ui:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --weight-display:600;
  --text-prose:20px;--body-size:var(--text-prose);
  --max-w:680px;--margin:clamp(22px,5vw,64px);--topbar-h:54px;--safe-bottom:env(safe-area-inset-bottom,0px);
  --radius-chip:8px;--radius:11px;--radius-sm:7px;
  --ease-expo:cubic-bezier(0.4,0,0.2,1);
  --transition:160ms ease;--transition-slow:220ms ease;--transition-theme:500ms ease;
  --z-popup:200;
}
:root.light{
  color-scheme:light;
  --page-field:none;--page:#F6F8FB;--raised:#FFFFFF;--bar-glass:rgba(246,248,251,.85);
  --ink:#191D26;--ink-2:#5A6474;--ink-muted:#8A93A2;--ink-faint:#B7BEC9;
  --line:#E4E8EE;
  --gold:#2B5CCC;--gold-soft:#244FB0;--gold-line:rgba(43,92,204,.32);--gold-tint:rgba(43,92,204,.13);--on-gold:#fff;
  --good:#1E8E5A;--good-soft:#E7F4EC;--good-line:rgba(30,142,90,.30);--good-ink:#0B3D26;
  --surface-high:#F1F4F8;--topbar-bg:#FBFCFE;--reader-bg:#FAF7F0;
  --accent-amber:#1E2A44;--accent-amber-gradient:#1E2A44;
  --ann-note:rgba(120,116,108,.14);--ann-bookmark:rgba(99,102,241,.14);--ann-question:rgba(239,100,97,.14);
  --ann-continuity:rgba(52,211,153,.15);--ann-structural:rgba(251,146,60,.15);--ann-pacing:rgba(56,189,248,.16);--ann-voice:rgba(192,132,252,.16);
}`;

/** The reading surface itself — screen padding, prose, chapter opener, drop cap,
 *  blockquote/list/rule, annotation-mark base, progress, bottom strip, end mark.
 *  Verbatim from index.css §14/§19 (edit-mode/changes/tiptap rules omitted — the
 *  shared reader never edits). Token-driven; works in both themes. */
export const READER_SURFACE_CSS = `
#screen-reader{padding-top:calc(var(--topbar-h) + 56px);padding-bottom:calc(140px + var(--safe-bottom));padding-left:var(--margin);padding-right:var(--margin);background:var(--reader-bg);min-height:100dvh}
#content{max-width:var(--max-w);margin:0 auto}
#content .ms-matter{display:none}

/* Chapter opener — a small tracked number, a quiet serif title, a short neutral rule */
.chapter-marker{display:block;text-align:center;font-family:var(--font-ui);font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin-top:96px;margin-bottom:12px;scroll-margin-top:calc(var(--topbar-h) + 24px);opacity:.85}
.chapter-marker:first-child{margin-top:0}
#content h1{font-family:var(--font-display);font-size:clamp(24px,3.4vw,28px);font-weight:600;line-height:1.12;letter-spacing:-.01em;color:var(--ink);text-align:center;margin-bottom:40px;scroll-margin-top:calc(var(--topbar-h) + 8px)}
#content h1::after{content:'';display:block;width:34px;height:1px;margin:18px auto 0;background:var(--dim);opacity:.5}
#content h2{font-family:var(--font-body);font-size:clamp(19px,3.5vw,26px);font-weight:400;line-height:1.3;color:var(--ink);margin-top:52px;margin-bottom:8px}
#content .chapter-block > h2:first-child{text-align:center;font-style:italic;font-weight:400;font-size:clamp(15px,2.4vw,18px);color:var(--muted);letter-spacing:.02em;margin-top:-16px;margin-bottom:44px}
#content h3{font-family:var(--font-body);font-size:19px;font-weight:500;color:var(--muted);margin-top:36px;margin-bottom:6px}
#content p,#content blockquote,#content ul,#content ol{opacity:0;transform:translateY(16px);transition:opacity .7s var(--ease-expo),transform .7s var(--ease-expo)}
#content p.visible,#content blockquote.visible,#content ul.visible,#content ol.visible{opacity:1;transform:translateY(0)}
#content p{font-size:var(--body-size);line-height:1.75;color:var(--ink);margin-bottom:0;letter-spacing:-.002em}
#content .chapter-block > p + p{text-indent:1.4em}
.chapter-block > p:first-of-type::first-letter{font-size:3.15em;line-height:.82;float:left;padding:6px 10px 0 0;margin:0;color:var(--drop-cap);font-weight:600;font-family:var(--font-display)}
#content em{font-style:italic}
#content strong{font-weight:500;color:var(--ink)}
#content blockquote{border-left:1px solid var(--border);margin:36px 0;padding:0 0 0 24px;font-style:italic;color:var(--muted);font-size:var(--body-size);line-height:1.78}
#content hr{border:none;text-align:center;margin:72px 0;color:var(--dim);letter-spacing:.8em;font-size:14px;opacity:.35 !important;transform:none !important}
#content hr::before{content:'· · ·'}
#content ul,#content ol{margin:0 0 1.4em;padding-left:0;list-style:none}
#content li{font-size:var(--body-size);line-height:1.78;color:var(--ink);padding:3px 0 3px 26px;position:relative}
#content ul li::before{content:'—';position:absolute;left:0;color:var(--border)}
#content ol{counter-reset:ol-c}
#content ol li{counter-increment:ol-c}
#content ol li::before{content:counter(ol-c,decimal-leading-zero);position:absolute;left:0;font-family:var(--font-ui);font-size:10px;color:var(--dim);top:9px}

/* Annotation marks — transparent in pure Reading; a faint blue wash + hairline
   underline once the annotation layer is open (#reader-body.ann-open). */
mark[data-ann]{background:transparent;color:inherit;cursor:pointer;padding:.06em 0;border-radius:2px;box-shadow:0 0 0 transparent inset;transition:background .35s ease,box-shadow .2s ease}
#reader-body.ann-open #content mark[data-ann]{background:var(--ann-highlight);box-shadow:0 1px 0 var(--brand) inset}
mark[data-ann]:hover{filter:brightness(1.06)}

#end-mark{text-align:center;margin-top:96px;font-family:var(--font-ui);font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--border);opacity:.4}

#progress-track{position:fixed;top:var(--topbar-h);left:0;right:0;height:1px;background:transparent;z-index:100;transition:top .32s var(--ease-expo)}
#progress-track.topbar-hidden{top:0}
#progress-fill{height:100%;background:var(--brand);width:0%;opacity:.6;transition:width .2s linear}

#bottom-strip{position:fixed;bottom:calc(24px + var(--safe-bottom));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;background:rgba(16,16,16,.82);-webkit-backdrop-filter:blur(12px) saturate(120%);backdrop-filter:blur(12px) saturate(120%);border:1px solid rgba(255,255,255,.06);padding:8px 20px;font-family:var(--font-ui);font-size:10px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);opacity:0;transition:opacity var(--transition-slow);white-space:nowrap;pointer-events:none;z-index:101}
:root.light #bottom-strip{background:rgba(245,240,232,.88);border-color:rgba(33,29,21,.1)}
#bottom-strip.visible{opacity:1}
#bottom-strip .sep{width:1px;height:9px;background:rgba(255,255,255,.12);flex-shrink:0}
:root.light #bottom-strip .sep{background:rgba(33,29,21,.15)}
#pct-read{color:var(--brand)}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{transition:none !important;animation:none !important}
  #content p,#content blockquote,#content ul,#content ol{opacity:1;transform:none}
}`;

/** The marking moment — the navy selection toolbar (thin default: Highlight · Note
 *  · Question, then an "Editorial" expander of craft chips) and the note composer.
 *  Verbatim from index.css §11; shared by the in-app SelectionPopup and the shared
 *  reader's vanilla popup so the marking UI can't drift. */
export const READER_MARKING_CSS = `
#selection-popup{position:fixed;z-index:var(--z-popup);display:none;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;width:max-content;max-width:min(340px,calc(100vw - 20px))}
#selection-popup.visible{display:flex}
/* Phones: the toolbar is a full-width bottom sheet (thumb-reachable, never clipped),
   with a grip and stacked icon+label cells. The composer, once a note type is chosen,
   pins to the TOP instead (class .composing) so the on-screen keyboard can't cover it. */
@media (max-width:640px){
  #selection-popup{left:0 !important;right:0 !important;top:auto !important;bottom:0 !important;width:100% !important;max-width:100%;align-items:stretch;gap:0}
  #selection-popup:not(.composing)::before{content:'';display:block;width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,.28);margin:0 auto;position:absolute;top:8px;left:0;right:0}
  .anntool{width:100%;justify-content:space-around;gap:2px;border-radius:16px 16px 0 0;padding:22px 8px calc(14px + var(--safe-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.2)}
  .anntool-btn{flex:1;flex-direction:column;gap:5px;font-size:11px;padding:8px 4px;border-radius:10px}
  .anntool-btn svg{width:20px;height:20px}
  .anntool-div{display:none}
  .anntool-more{flex:1;flex-direction:column}
  .edrow{width:100%;max-width:100%;justify-content:center;background:var(--accent-amber);margin:0;padding:0 14px calc(14px + var(--safe-bottom));gap:8px}
  .composer{width:100%;max-width:100%;border-radius:16px 16px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.2)}
  #selection-popup.composing{top:8px !important;bottom:auto !important;left:10px !important;right:10px !important;width:auto !important}
  #selection-popup.composing .composer{border-radius:12px}
}
.anntool{display:inline-flex;align-items:center;gap:2px;background:var(--accent-amber);border-radius:10px;padding:5px;box-shadow:0 8px 30px rgba(20,28,46,.28),0 2px 6px rgba(20,28,46,.2)}
.anntool-btn{display:flex;align-items:center;gap:6px;background:transparent;border:0;border-radius:6px;color:#fff;font-family:var(--font-ui);font-size:12.5px;font-weight:500;padding:6px 10px;cursor:pointer;white-space:nowrap;transition:background var(--transition);-webkit-tap-highlight-color:transparent}
.anntool-btn:hover{background:rgba(255,255,255,.14)}
.anntool-btn svg{opacity:.9}
.anntool-div{width:1px;height:18px;background:rgba(255,255,255,.18);margin:0 2px}
.anntool-more{color:#C9D4EA}
.anntool-more svg{transition:transform var(--transition)}
.anntool-more.open svg{transform:rotate(180deg)}
.edrow{display:flex;flex-wrap:wrap;gap:6px;max-width:300px}
.edchip{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-ui);font-size:12px;font-weight:500;color:var(--ink);background:var(--reader-bg);border:1px solid var(--border);border-radius:20px;padding:5px 11px;cursor:pointer;transition:border-color var(--transition),background var(--transition);-webkit-tap-highlight-color:transparent}
.edchip:hover{border-color:var(--brand)}
.edchip-dot{width:6px;height:6px;border-radius:50%;background:var(--brand)}
.composer{width:300px;max-width:min(300px,calc(100vw - 20px));background:var(--reader-bg);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 30px rgba(20,28,46,.22),0 2px 6px rgba(20,28,46,.12);overflow:hidden}
.composer-head{display:flex;align-items:center;gap:7px;padding:9px 12px;border-bottom:1px solid var(--border);font-family:var(--font-ui);font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--brand)}
.composer-body{width:100%;display:block;background:none;border:none;outline:none;resize:none;padding:11px 12px;min-height:64px;font-family:var(--font-ui);font-size:12.5px;line-height:1.5;color:var(--ink)}
.composer-body::placeholder{color:var(--dim)}
.composer-foot{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-top:1px solid var(--border)}
.composer-anchor{font-family:var(--font-ui);font-size:11px;color:var(--dim)}
.composer-actions{display:flex;align-items:center;gap:6px}
.composer-cancel{background:none;border:0;cursor:pointer;font-family:var(--font-ui);font-size:11px;color:var(--muted);padding:6px 8px}
.composer-cancel:hover{color:var(--ink)}
.composer-save{background:var(--accent-amber);color:#fff;border:0;border-radius:6px;font-family:var(--font-ui);font-size:12px;font-weight:600;padding:6px 13px;cursor:pointer}
.composer-save:hover{background:var(--accent-amber-gradient);filter:brightness(1.08)}`;

/** The desktop margin column (≥1200px): note cards pinned beside their mark in the
 *  right gutter, cascading so they never overlap; a browse toggle flattens them into
 *  a scrollable index; orphaned notes (mark no longer in the text) collect in a
 *  collapsed section. Verbatim from index.css §10; shared by the app's AnnMarginColumn
 *  and the shared reader's vanilla margin. Card placement itself is done in JS. */
export const READER_MARGIN_CSS = `
#ann-margin{display:none}
@media (min-width:1200px){
  #reader-body.ann-open{display:grid;grid-template-columns:minmax(0,1fr) var(--max-w) minmax(0,1fr);align-items:start}
  #reader-body.ann-open #content{grid-column:2;margin:0}
  #reader-body.ann-open #ann-margin{grid-column:3;display:block;width:100%;max-width:300px;padding-left:40px;opacity:0;pointer-events:none;transition:opacity .55s ease}
  #reader-body.ann-open #ann-margin.open{opacity:1;pointer-events:auto}
  #reader-body.ann-open #ann-margin:not(.browse){position:relative;align-self:start}
  #reader-body.ann-open #ann-margin:not(.browse) .ann-margin-card{position:absolute;left:40px;right:0}
  #reader-body.ann-open #ann-margin:not(.browse) .ann-margin-head{position:sticky;top:calc(var(--topbar-h) + 24px);z-index:2;padding-top:8px;padding-bottom:10px;background:var(--bar-glass);backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%)}
  #reader-body.ann-open #ann-margin.browse{display:flex;flex-direction:column;gap:22px;align-self:start;position:sticky;top:calc(var(--topbar-h) + 24px);max-height:calc(100vh - var(--topbar-h) - 56px);overflow-y:auto;scrollbar-width:none}
  #reader-body.ann-open #ann-margin.browse .ann-margin-card{position:static}
  #reader-body.ann-open #ann-margin:not(.browse) .ann-margin-orphans{position:absolute;bottom:0;left:40px;right:0;border-top:1px solid var(--border);padding-top:10px}
  #reader-body.ann-open #ann-margin:not(.browse) .ann-margin-orphans .ann-margin-card{position:static;left:auto;right:auto}
}
.ann-margin-orphans-head{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;background:none;border:none;cursor:pointer;text-align:left;padding:6px 0}
.ann-margin-orphans-title{display:flex;align-items:center;gap:7px;font-family:var(--font-ui);font-size:9px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.ann-margin-orphans-count{padding:1px 6px;border-radius:9px;background:var(--border);color:var(--dim);font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:0;font-size:9px}
.ann-margin-orphans-head:hover .ann-margin-orphans-title{color:var(--ink)}
.ann-margin-orphans-chevron{color:var(--dim);font-size:9px;flex-shrink:0}
.ann-margin-orphans-hint{font-family:var(--font-ui);font-size:10px;line-height:1.5;color:var(--dim);font-style:italic;padding-bottom:4px}
.ann-margin-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px;padding-left:12px}
.ann-margin-head-label{font-family:var(--font-ui);font-size:9px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.ann-margin-index-btn{background:none;border:none;cursor:pointer;padding:0;font-family:var(--font-ui);font-size:9px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);transition:color var(--transition)}
.ann-margin-index-btn:hover{color:var(--gold-soft)}
.ann-margin-card{padding:12px 0 12px 12px;border-left:2px solid var(--line);cursor:pointer;transition:border-color .2s ease,opacity .3s ease}
.ann-margin-card:hover{border-left-color:var(--gold-line)}
.ann-margin-card.faded{opacity:.4}
.ann-margin-card.emph{opacity:1;border-left-width:3px}
.ann-margin-card.emph .ann-margin-tag{color:var(--gold-soft)}
.ann-margin-tag{font-family:var(--font-ui);font-size:8px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);margin-bottom:7px}
.ann-margin-chapter{color:var(--dim);font-weight:400}
.ann-margin-quote{font-family:var(--font-body);font-style:italic;font-size:13px;line-height:1.5;color:var(--dim);margin-bottom:5px}
.ann-margin-note{font-family:var(--font-ui);font-size:11px;line-height:1.6;color:var(--ink-2)}
.ann-margin-reader{margin-top:7px;font-family:var(--font-ui);font-size:10px;color:var(--dim);font-style:italic}
.ann-margin-empty{font-family:var(--font-ui);font-size:11px;color:var(--dim);font-style:italic;padding-left:12px}`;

/** The Aa display control (text-size stepper) in the top bar. Verbatim from
 *  index.css §reader-chrome; shared by the app and the shared reader. Adjusting size
 *  sets --body-size on the root (15–26px), which the prose rules already consume. */
export const READER_AA_CSS = `
.reader-aa{position:relative;display:inline-flex}
.reader-aa-btn{font-family:var(--font-display);font-weight:600;font-size:15px;letter-spacing:0;line-height:1}
.reader-aa-scrim{position:fixed;inset:0;z-index:90}
.reader-aa-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:100;min-width:168px;padding:12px 14px;background:var(--surface-high);border:1px solid var(--border);border-radius:var(--radius-chip);box-shadow:0 10px 30px rgba(0,0,0,.28)}
.reader-aa-label{display:block;font-family:var(--font-ui);font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:10px}
.reader-aa-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.reader-aa-step{display:grid;place-items:center;width:34px;height:30px;background:none;border:1px solid var(--border);border-radius:var(--radius-chip);color:var(--muted);cursor:pointer;transition:color var(--transition),border-color var(--transition)}
.reader-aa-step:hover{color:var(--ink);border-color:var(--muted)}
.reader-aa-val{font-family:var(--font-ui);font-size:13px;font-weight:600;color:var(--ink);min-width:22px;text-align:center;font-variant-numeric:tabular-nums}`;
