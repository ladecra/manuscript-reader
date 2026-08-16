// ─── Shareable Reader HTML Export ─────────────────────────────────────────────
// Produces a fully self-contained .html file: a manuscript reader with an
// embedded markdown parser, reader runtime, theme toggle, chapter nav, and an
// optional annotation runtime (beta-reader mode) that exports feedback as JSON.
//
// The output has zero external dependencies beyond Google Fonts and requires no
// localStorage to render. Ported faithfully from the v0.9 prototype.

import { buildShareableAnnotationRuntimeScript } from './shareableReaderAnnotationRuntime';
import { READER_TOKENS_CSS, READER_SURFACE_CSS, READER_AA_CSS } from './readerStyles';

export class ShareReaderBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareReaderBuildError';
  }
}

/** Frozen version stamped into a shared reader file (Phase 8 share flow). */
export interface ShareSnapshotStamp {
  snapshotId: string;
  versionId: string;
  label?: string;
  createdAt: number;
}

/** Binds a shared reader file to a hosted share so the reader's session syncs to the
 *  worker (brief §3.2) instead of only downloading as JSON. When absent, the reader
 *  is fully offline/self-contained and feedback returns via the .json export. */
export interface ShareSyncConfig {
  /** Worker origin, no trailing slash (e.g. https://vellibris-sync.x.workers.dev). */
  endpoint: string;
  /** The share this file is bound to. */
  shareId: string;
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Validate that the generated HTML has a parseable embedded script block.
 * Mirrors v0.9's safeguard so we never ship a broken reader file.
 */
export function validateShareableReaderHTML(html: string): void {
  const scriptOpen = '<scr' + 'ipt>';
  const scriptClose = '</scr' + 'ipt>';
  const open = html.indexOf(scriptOpen);
  const close = html.indexOf(scriptClose, open);
  if (open < 0 || close < 0) {
    throw new ShareReaderBuildError('Reader file is missing its script block.');
  }
  const script = html.slice(open + scriptOpen.length, close);
  try {
    new Function(script);
  } catch {
    throw new ShareReaderBuildError('Reader file script is invalid — not downloaded.');
  }
}

/**
 * Build a self-contained shareable reader HTML document.
 * @param withAnnotations  When true, embeds the beta-reader annotation runtime.
 */
/** Drop retained front/back-matter regions (copyright, dedication, acknowledgements…)
 *  from the embedded markdown. Beta reading is body-only: matter prose would otherwise
 *  render as stray paragraphs, and it has no bearing on the passages readers annotate. */
export function stripMatterRegions(md: string): string {
  return md.replace(/<!--\s*matter:(?:front|back)[^>]*-->[\s\S]*?<!--\s*\/matter\s*-->\s*/g, '').trim();
}

export function buildShareableHTML(
  title: string,
  markdown: string,
  withAnnotations = false,
  snapshot?: ShareSnapshotStamp,
  syncConfig?: ShareSyncConfig,
): string {
  const mdJson = JSON.stringify(stripMatterRegions(markdown));
  const titleJson = JSON.stringify(title);
  const snapshotIdJson = JSON.stringify(snapshot?.snapshotId ?? '');
  const snapshotLabelJson = JSON.stringify(snapshot?.label?.trim() ?? '');
  const badgeText = snapshot?.label?.trim()
    ? `Shared reader · ${snapshot.label.trim()}`
    : 'Shared reader';
  const annotationScript = withAnnotations ? buildShareableAnnotationRuntimeScript(syncConfig) : '';
  const screenReaderMarkup = withAnnotations
    ? '<div id="screen-reader" class="beta-reader"><div id="reader-body" class="ann-open"><div id="content"></div></div><div id="end-mark">End of manuscript</div></div>'
    : '<div id="screen-reader"><div id="content"></div><div id="end-mark">End of manuscript</div></div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${escHtml(title)}</title>
<style>
/* Reader tokens + the reading surface itself are single-sourced from
   src/engine/exports/readerStyles.ts, so this shared/beta reader and the in-app
   reader can never drift again. Only this file's STANDALONE chrome — top bar,
   chapter drawer, theme toggle, shared badge — lives here (the app has its own).
   No webfonts: system stacks, so the reader renders instantly, works offline, and
   leaks no font-CDN callout revealing the reader's IP / which manuscript they opened. */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
${READER_TOKENS_CSS}
html{scroll-behavior:smooth}
body{background-color:var(--page);background-image:var(--page-field);background-attachment:fixed;color:var(--ink);font-family:var(--font-body);-webkit-font-smoothing:antialiased;min-height:100dvh;transition:background-color var(--transition-theme),color var(--transition-theme)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:var(--page)}::-webkit-scrollbar-thumb{background:var(--border)}
#topbar{position:fixed;top:0;left:0;right:0;height:var(--topbar-h);background:var(--bar-glass);-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 var(--margin);z-index:100;transition:transform .4s var(--ease-expo),background .35s,border-color .35s}
#topbar.hidden{transform:translateY(-110%);pointer-events:none}
#topbar-title{font-family:var(--font-ui);font-size:10px;font-weight:400;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw}
:root.light #topbar #topbar-title,:root.light #topbar #topbar-chapter{opacity:.6}
#topbar-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
.icon-btn{background:none;border:none;cursor:pointer;color:var(--dim);padding:6px;display:flex;align-items:center;justify-content:center;transition:color .2s;-webkit-tap-highlight-color:transparent}
.icon-btn:hover,.icon-btn:active,.icon-btn.active-btn{color:var(--ink)}
.icon-btn svg{width:17px;height:17px;display:block}
#topbar-chapter{font-family:var(--font-ui);font-size:10px;color:var(--dim);letter-spacing:.08em;white-space:nowrap}
#chapter-nav{position:fixed;top:var(--topbar-h);left:0;width:min(280px,80vw);height:calc(100dvh - var(--topbar-h));background:var(--page);border-right:1px solid var(--border);overflow-y:auto;z-index:90;padding:24px 0;transform:translateX(-100%);transition:transform .32s var(--ease-expo),background .35s;-webkit-backface-visibility:hidden}
#chapter-nav.open{transform:translateX(0)}
#chapter-nav.topbar-hidden{top:0;height:100dvh}
.nav-section-label{font-family:var(--font-ui);font-size:10px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);padding:0 24px 12px}
.chapter-link{display:block;width:100%;padding:10px 24px;background:none;border:none;text-align:left;font-family:var(--font-ui);font-size:12px;color:var(--muted);cursor:pointer;line-height:1.4;transition:color .15s,background .15s}
.chapter-link:hover,.chapter-link.active{color:var(--ink);background:var(--surface-high)}
.ch-num{display:block;font-size:10px;color:var(--border);margin-bottom:2px;letter-spacing:.1em}
#nav-overlay{display:none;position:fixed;inset:0;z-index:85;background:rgba(0,0,0,.5)}
#nav-overlay.visible{display:block}
.icon-sun{display:none}.icon-moon{display:block}
:root.light .icon-sun{display:block}:root.light .icon-moon{display:none}
#shared-badge{position:fixed;bottom:calc(24px + var(--safe-bottom));right:var(--margin);font-family:var(--font-ui);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--border);opacity:.4;z-index:79}
${READER_SURFACE_CSS}
${READER_AA_CSS}
</style>
</head>
<body>
<header id="topbar">
  <div style="display:flex;align-items:center;gap:9px;min-width:0">
    <button class="icon-btn" id="nav-toggle">
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square">
        <line x1="2" y1="4" x2="16" y2="4"/><line x1="2" y1="9" x2="16" y2="9"/><line x1="2" y1="14" x2="16" y2="14"/>
      </svg>
    </button>
    <svg viewBox="0 0 20 20" fill="none" stroke="var(--brand)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0">
      <path d="M16.5 3.2C11 4 7.2 7.4 5.1 12.2c-.5 1.2-.9 2.6-1.1 4.1"/>
      <path d="M16.5 3.2c.6 3.4-.2 6.4-2 8.6-1.6 2-4 3-6.6 2.9"/>
      <path d="M4 16.8l2.4-2.4"/>
    </svg>
    <span id="topbar-title"></span>
  </div>
  <div id="topbar-right">
    <span id="topbar-chapter"></span>
    <div class="reader-aa">
      <button class="icon-btn reader-aa-btn" id="aa-btn" aria-label="Text size" aria-haspopup="true" aria-expanded="false">Aa</button>
    </div>
    <button class="icon-btn" id="theme-toggle">
      <svg class="icon-moon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M15 10.5A6 6 0 1 1 7.5 3a4.5 4.5 0 0 0 7.5 7.5z"/></svg>
      <svg class="icon-sun" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="9" cy="9" r="3.5"/><line x1="9" y1="1" x2="9" y2="3"/><line x1="9" y1="15" x2="9" y2="17"/><line x1="1" y1="9" x2="3" y2="9"/><line x1="15" y1="9" x2="17" y2="9"/><line x1="3.2" y1="3.2" x2="4.6" y2="4.6"/><line x1="13.4" y1="13.4" x2="14.8" y2="14.8"/><line x1="14.8" y1="3.2" x2="13.4" y2="4.6"/><line x1="4.6" y1="13.4" x2="3.2" y2="14.8"/></svg>
    </button>
  </div>
</header>
<div id="progress-track"><div id="progress-fill"></div></div>
<div id="nav-overlay"></div>
<nav id="chapter-nav"><div class="nav-section-label">Chapters</div><div id="chapter-links"></div></nav>
${screenReaderMarkup}
<div id="bottom-strip"><span id="pct-read">0%</span><span class="sep"></span><span id="time-left">—</span><span class="sep"></span><span id="clock-time">—</span></div>
<div id="shared-badge">${escHtml(badgeText)}</div>
<script>
(function(){
'use strict';
const THEME_KEY='ms_theme';
const md=${mdJson};
const title=${titleJson};
const SHARE_SNAPSHOT_ID=${snapshotIdJson};
const SHARE_SNAPSHOT_LABEL=${snapshotLabelJson};

function applyTheme(l){document.documentElement.classList.toggle('light',l);try{localStorage.setItem(THEME_KEY,l?'light':'dark')}catch{}}
applyTheme(localStorage.getItem(THEME_KEY)!=='dark');
document.getElementById('theme-toggle').addEventListener('click',()=>applyTheme(!document.documentElement.classList.contains('light')));

// ── Text size (Aa) — mirrors the app's reader Aa control: adjusts --body-size
// (15–26px), persisted per browser so the reader's chosen size sticks. Addresses
// the "size is fixed / too large" gap.
const FONT_KEY='ms_font_size',FONT_MIN=15,FONT_MAX=26,FONT_DEFAULT=20;
let fontSize=FONT_DEFAULT;
try{const s=parseInt(localStorage.getItem(FONT_KEY)||'',10);if(s>=FONT_MIN&&s<=FONT_MAX)fontSize=s;}catch{}
function applyFontSize(){document.documentElement.style.setProperty('--body-size',fontSize+'px');const v=document.getElementById('aa-val');if(v)v.textContent=String(fontSize);}
function setFontSize(n){fontSize=Math.max(FONT_MIN,Math.min(FONT_MAX,n));try{localStorage.setItem(FONT_KEY,String(fontSize))}catch{}applyFontSize();}
applyFontSize();
(function(){
  const aaWrap=document.querySelector('.reader-aa'),aaBtn=document.getElementById('aa-btn');
  let menu=null,scrim=null;
  function close(){if(menu){menu.remove();menu=null;}if(scrim){scrim.remove();scrim=null;}aaBtn.setAttribute('aria-expanded','false');aaBtn.classList.remove('active-btn');}
  function open(){
    scrim=document.createElement('div');scrim.className='reader-aa-scrim';scrim.addEventListener('mousedown',close);document.body.appendChild(scrim);
    menu=document.createElement('div');menu.className='reader-aa-menu';menu.setAttribute('role','menu');
    menu.innerHTML='<span class="reader-aa-label">Text size</span><div class="reader-aa-row">'+
      '<button type="button" class="reader-aa-step" id="aa-down" aria-label="Smaller text">A<span style="font-size:.7em">−</span></button>'+
      '<span class="reader-aa-val" id="aa-val">'+fontSize+'</span>'+
      '<button type="button" class="reader-aa-step" id="aa-up" aria-label="Larger text">A<span style="font-size:.8em">+</span></button></div>';
    aaWrap.appendChild(menu);
    menu.querySelector('#aa-down').addEventListener('click',()=>setFontSize(fontSize-1));
    menu.querySelector('#aa-up').addEventListener('click',()=>setFontSize(fontSize+1));
    aaBtn.setAttribute('aria-expanded','true');aaBtn.classList.add('active-btn');
  }
  aaBtn.addEventListener('click',()=>{menu?close():open();});
})();

function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function parseMarkdown(md){
  md=md.replace(/\\r\\n/g,'\\n').replace(/\\r/g,'\\n');
  const lines=md.split('\\n');let html='',i=0,chIdx=0,inBlock=false;const chs=[];
  function inline(s){s=escHtml(s);s=s.replace(/\\*\\*\\*(.*?)\\*\\*\\*/g,'<strong><em>$1</em></strong>');s=s.replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>');s=s.replace(/__(.*?)__/g,'<strong>$1</strong>');s=s.replace(/\\*(.*?)\\*/g,'<em>$1</em>');s=s.replace(/_((?!_).*?)_/g,'<em>$1</em>');s=s.replace(/\`([^\`]+)\`/g,'<code>$1</code>');return s}
  while(i<lines.length){const line=lines[i];
    if(/^<!--[\\s\\S]*?-->\\s*$/.test(line.trim())){i++;continue}
    if(/^# /.test(line)){if(inBlock)html+='</div>';chIdx++;const t=line.replace(/^# /,'').trim();const id='ch-'+chIdx;chs.push({index:chIdx,title:t,id});html+=\`<span class="chapter-marker" id="\${id}">Chapter \${String(chIdx).padStart(2,'0')}</span><h1>\${inline(t)}</h1><div class="chapter-block">\`;inBlock=true;i++;continue}
    if(/^## /.test(line)){html+=\`<h2>\${inline(line.replace(/^## /,'').trim())}</h2>\`;i++;continue}
    if(/^### /.test(line)){html+=\`<h3>\${inline(line.replace(/^### /,'').trim())}</h3>\`;i++;continue}
    if(/^(-{3,}|\\*{3,}|_{3,})$/.test(line.trim())){html+='<hr>';i++;continue}
    if(/^> /.test(line)){let bq='';while(i<lines.length&&/^> /.test(lines[i])){bq+=inline(lines[i].replace(/^> /,''))+' ';i++}html+=\`<blockquote>\${bq.trim()}</blockquote>\`;continue}
    if(/^[-*+] /.test(line)){html+='<ul>';while(i<lines.length&&/^[-*+] /.test(lines[i])){html+=\`<li>\${inline(lines[i].replace(/^[-*+] /,''))}</li>\`;i++}html+='</ul>';continue}
    if(/^\\d+\\. /.test(line)){html+='<ol>';while(i<lines.length&&/^\\d+\\. /.test(lines[i])){html+=\`<li>\${inline(lines[i].replace(/^\\d+\\. /,''))}</li>\`;i++}html+='</ol>';continue}
    if(line.trim()===''){i++;continue}
    let para='';while(i<lines.length&&lines[i].trim()!==''&&!/^#{1,3} /.test(lines[i])&&!/^[-*+] /.test(lines[i])&&!/^\\d+\\. /.test(lines[i])&&!/^> /.test(lines[i])&&!/^(-{3,}|\\*{3,}|_{3,})$/.test(lines[i].trim())){para+=lines[i]+' ';i++}
    if(para.trim())html+=\`<p>\${inline(para.trim())}</p>\`
  }
  if(inBlock)html+='</div>';return{html,chapters:chs}
}

const {html,chapters}=parseMarkdown(md);
const contentEl=document.getElementById('content');
contentEl.innerHTML=html;
document.getElementById('topbar-title').textContent=title;
document.title=title;

const totalWords=md.trim().split(/\\s+/).filter(Boolean).length;

const chapterLinksEl=document.getElementById('chapter-links');
const chapterNav=document.getElementById('chapter-nav');
const navOverlay=document.getElementById('nav-overlay');
const navToggle=document.getElementById('nav-toggle');
const topbar=document.getElementById('topbar');
const progressFill=document.getElementById('progress-fill');
const progressTrack=document.getElementById('progress-track');
const topbarChap=document.getElementById('topbar-chapter');
const bottomStrip=document.getElementById('bottom-strip');
const pctReadEl=document.getElementById('pct-read');
const timeLeftEl=document.getElementById('time-left');
const clockTimeEl=document.getElementById('clock-time');

chapters.forEach(ch=>{
  const btn=document.createElement('button');btn.className='chapter-link';btn.dataset.id=ch.id;
  btn.innerHTML=\`<span class="ch-num">Chapter \${String(ch.index).padStart(2,'0')}</span>\${escHtml(ch.title)}\`;
  btn.addEventListener('click',()=>{chapterNav.classList.remove('open');navOverlay.classList.remove('visible');setTimeout(()=>document.getElementById(ch.id)?.scrollIntoView({behavior:'smooth',block:'start'}),200)});
  chapterLinksEl.appendChild(btn);
});
navToggle.addEventListener('click',()=>{chapterNav.classList.toggle('open');navOverlay.classList.toggle('visible')});
navOverlay.addEventListener('click',()=>{chapterNav.classList.remove('open');navOverlay.classList.remove('visible')});

const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target)}})},{threshold:0.08,rootMargin:'0px 0px -40px 0px'});
contentEl.querySelectorAll('p,blockquote,ul,ol').forEach(el=>obs.observe(el));

let lastY=0,topbarVisible=true,activeChapter=0;
const HIDE=60;
function updateScroll(){
  const sy=window.scrollY,docH=document.documentElement.scrollHeight-window.innerHeight,pct=docH>0?sy/docH:0;
  progressFill.style.width=(pct*100).toFixed(2)+'%';
  const down=sy>lastY;
  if(sy>HIDE){if(down&&topbarVisible){topbarVisible=false;topbar.classList.add('hidden');progressTrack.classList.add('topbar-hidden')}else if(!down&&!topbarVisible){topbarVisible=true;topbar.classList.remove('hidden');progressTrack.classList.remove('topbar-hidden')}}else if(sy<10){topbarVisible=true;topbar.classList.remove('hidden');progressTrack.classList.remove('topbar-hidden')}
  lastY=sy;
  bottomStrip.classList.toggle('visible',sy>120);
  pctReadEl.textContent=Math.round(pct*100)+'% read';
  const ml=Math.ceil((1-pct)*totalWords/238);
  timeLeftEl.textContent=ml>60?\`\${Math.floor(ml/60)}h \${ml%60}m left\`:ml>1?\`\${ml} min left\`:'Almost done';
  if(chapters.length){let cur=null;for(const ch of chapters){const el=document.getElementById(ch.id);if(el&&el.getBoundingClientRect().top<=80)cur=ch}if(cur&&cur.index!==activeChapter){activeChapter=cur.index;topbarChap.textContent=\`Ch. \${String(activeChapter).padStart(2,'0')}\`;document.querySelectorAll('.chapter-link').forEach(b=>b.classList.toggle('active',b.dataset.id===cur.id))}}
}
window.addEventListener('scroll',updateScroll,{passive:true});
function updateClock(){clockTimeEl.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
updateClock();setInterval(updateClock,30000);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){chapterNav.classList.remove('open');navOverlay.classList.remove('visible')}});
${annotationScript}
})();
</${''}script>
</body>
</html>`;
}

/**
 * Build, validate, and download a shareable reader HTML file.
 * @throws ShareReaderBuildError if the generated file is malformed.
 */
export function exportShareableReader(
  title: string,
  markdown: string,
  withAnnotations: boolean,
  snapshot?: ShareSnapshotStamp,
  syncConfig?: ShareSyncConfig,
): void {
  const html = buildShareableHTML(title, markdown, withAnnotations, snapshot, syncConfig);
  validateShareableReaderHTML(html);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  a.download = `${slug}-reader.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
