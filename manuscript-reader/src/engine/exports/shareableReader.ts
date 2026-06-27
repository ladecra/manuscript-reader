// ─── Shareable Reader HTML Export ─────────────────────────────────────────────
// Produces a fully self-contained .html file: a manuscript reader with an
// embedded markdown parser, reader runtime, theme toggle, chapter nav, and an
// optional annotation runtime (beta-reader mode) that exports feedback as JSON.
//
// The output has zero external dependencies beyond Google Fonts and requires no
// localStorage to render. Ported faithfully from the v0.9 prototype.

import { buildShareableAnnotationRuntimeScript } from './shareableReaderAnnotationRuntime';

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
function stripMatterRegions(md: string): string {
  return md.replace(/<!--\s*matter:(?:front|back)[^>]*-->[\s\S]*?<!--\s*\/matter\s*-->\s*/g, '').trim();
}

export function buildShareableHTML(
  title: string,
  markdown: string,
  withAnnotations = false,
  snapshot?: ShareSnapshotStamp,
): string {
  const mdJson = JSON.stringify(stripMatterRegions(markdown));
  const titleJson = JSON.stringify(title);
  const snapshotIdJson = JSON.stringify(snapshot?.snapshotId ?? '');
  const snapshotLabelJson = JSON.stringify(snapshot?.label?.trim() ?? '');
  const badgeText = snapshot?.label?.trim()
    ? `Shared reader · ${snapshot.label.trim()}`
    : 'Shared reader';
  const annotationScript = withAnnotations ? buildShareableAnnotationRuntimeScript() : '';
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
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;1,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
/* Palette mirrors the app reader (src/index.css): cooler slate-charcoal dark with
   a soft radial field, flat warm paper light, gold as the one accent (incl. the
   drop cap, in both themes). Var NAMES are kept for this file's existing rules;
   only the values track the app. Kept in step by eye — see check-share-parity for
   the version-id contract; this is the visual layer (Slice 2). */
:root{--page-field:radial-gradient(135% 95% at 50% -12%,#1c1c1a 0%,#181816 55%,#121211 100%);--bg:#181816;--surface:#1e1e1c;--surface-high:#252523;--paper:#161615;--primary:#ecebe6;--on-surface:#ecebe6;--muted:#a4a39c;--dim:#79786f;--border:#2b2b28;--brand:#bfa063;--drop-cap:var(--brand);--body-size:20px;--max-w:680px;--margin:clamp(22px,5vw,64px);--topbar-h:54px;--bar-glass:rgba(20,20,18,.82);--safe-bottom:env(safe-area-inset-bottom,0px);--ease-expo:cubic-bezier(0.16,1,0.3,1);--ease-std:cubic-bezier(0.4,0,0.2,1)}
/* Light theme: warm reader paper (html.light[data-mode="reader"] in the app), not studio hub. */
:root.light{--page-field:#fffaf4;--bg:#fffaf4;--surface:#faf8f6;--surface-high:#f6f0e9;--paper:#fffaf4;--primary:#252524;--on-surface:#252524;--muted:#5c5a54;--dim:#8f8c83;--border:#ebe2d8;--brand:#b59757}
:root.light #topbar{background:rgba(249,243,236,.86);border-bottom-color:#ebe2d8}
:root.light #topbar #topbar-title,:root.light #topbar #topbar-chapter{opacity:.6}
html{scroll-behavior:smooth}
body{background:var(--page-field);color:var(--on-surface);font-family:'EB Garamond',Georgia,serif;-webkit-font-smoothing:antialiased;min-height:100dvh;transition:background .35s,color .35s}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--border)}
#topbar{position:fixed;top:0;left:0;right:0;height:var(--topbar-h);background:var(--bar-glass);-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 var(--margin);z-index:100;transition:transform .4s var(--ease-expo),background .35s,border-color .35s}
#topbar.hidden{transform:translateY(-110%);pointer-events:none}
#topbar-title{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;font-weight:400;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw}
#topbar-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
.icon-btn{background:none;border:none;cursor:pointer;color:var(--dim);padding:6px;display:flex;align-items:center;justify-content:center;transition:color .2s;-webkit-tap-highlight-color:transparent}
.icon-btn:hover,.icon-btn:active,.icon-btn.active-btn{color:var(--primary)}
.icon-btn svg{width:17px;height:17px;display:block}
#topbar-chapter{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;color:var(--dim);letter-spacing:.08em;white-space:nowrap}
#progress-track{position:fixed;top:var(--topbar-h);left:0;right:0;height:1px;background:var(--border);opacity:.3;z-index:100}
#progress-track.topbar-hidden{top:0}
#progress-fill{height:100%;background:var(--primary);width:0%;transition:width .15s linear}
#chapter-nav{position:fixed;top:var(--topbar-h);left:0;width:min(280px,80vw);height:calc(100dvh - var(--topbar-h));background:var(--bg);border-right:1px solid var(--border);overflow-y:auto;z-index:90;padding:24px 0;transform:translateX(-100%);transition:transform .32s var(--ease-expo),background .35s;-webkit-backface-visibility:hidden}
#chapter-nav.open{transform:translateX(0)}
#chapter-nav.topbar-hidden{top:0;height:100dvh}
.nav-section-label{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);padding:0 24px 12px}
.chapter-link{display:block;width:100%;padding:10px 24px;background:none;border:none;text-align:left;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:12px;color:var(--muted);cursor:pointer;line-height:1.4;transition:color .15s,background .15s}
.chapter-link:hover,.chapter-link.active{color:var(--primary);background:var(--surface)}
.ch-num{display:block;font-size:10px;color:var(--border);margin-bottom:2px;letter-spacing:.1em}
#nav-overlay{display:none;position:fixed;inset:0;z-index:85;background:rgba(0,0,0,.5)}
#nav-overlay.visible{display:block}
#screen-reader{padding-top:calc(var(--topbar-h) + 44px);padding-bottom:calc(110px + var(--safe-bottom));padding-left:var(--margin);padding-right:var(--margin)}
#content{max-width:var(--max-w);margin:0 auto}
.chapter-marker{display:block;text-align:center;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;letter-spacing:.32em;text-transform:uppercase;color:var(--dim);margin-top:120px;margin-bottom:24px;opacity:.5;scroll-margin-top:calc(var(--topbar-h) + 24px)}
.chapter-marker:first-child{margin-top:0}
#content h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(36px,6vw,52px);font-weight:400;line-height:1.08;letter-spacing:.01em;color:var(--primary);text-align:center;margin-bottom:36px;scroll-margin-top:calc(var(--topbar-h) + 8px)}
#content h1::after{content:'';display:block;width:32px;height:1px;margin:28px auto 0;background:var(--brand);opacity:.4}
#content h2{font-family:'EB Garamond',Georgia,serif;font-size:clamp(19px,3.5vw,26px);font-weight:400;line-height:1.3;color:var(--primary);margin-top:52px;margin-bottom:8px}
#content .chapter-block>h2:first-child{text-align:center;font-style:italic;font-weight:400;font-size:clamp(15px,2.4vw,18px);color:var(--muted);letter-spacing:.02em;margin-top:-16px;margin-bottom:44px}
#content h3{font-family:'EB Garamond',Georgia,serif;font-size:19px;font-weight:500;color:var(--muted);margin-top:36px;margin-bottom:6px}
#content p,#content blockquote,#content ul,#content ol{opacity:0;transform:translateY(16px);transition:opacity .7s var(--ease-expo),transform .7s var(--ease-expo)}
#content p.visible,#content blockquote.visible,#content ul.visible,#content ol.visible{opacity:1;transform:translateY(0)}
#content p{font-size:var(--body-size);line-height:1.82;color:var(--on-surface);margin-bottom:1.4em}
.chapter-block>p:first-of-type::first-letter{font-size:4.2em;line-height:.78;float:left;margin-right:6px;margin-top:6px;color:var(--drop-cap);font-weight:400;font-family:'Cormorant Garamond',Georgia,serif}
#content em{font-style:italic}
#content strong{font-weight:500;color:var(--primary)}
#content blockquote{border-left:1px solid var(--border);margin:36px 0;padding:0 0 0 24px;font-style:italic;color:var(--muted);font-size:var(--body-size);line-height:1.78}
#content hr{border:none;text-align:center;margin:72px 0;color:var(--dim);letter-spacing:.8em;font-size:14px;opacity:.35!important;transform:none!important}
#content hr::before{content:'· · ·'}
#content ul,#content ol{margin:0 0 1.4em;padding-left:0;list-style:none}
#content li{font-size:var(--body-size);line-height:1.78;color:var(--on-surface);padding:3px 0 3px 26px;position:relative}
#content ul li::before{content:'—';position:absolute;left:0;color:var(--border)}
#content ol{counter-reset:ol-c}
#content ol li{counter-increment:ol-c}
#content ol li::before{content:counter(ol-c,decimal-leading-zero);position:absolute;left:0;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;color:var(--dim);top:9px}
#end-mark{text-align:center;margin-top:96px;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--border);opacity:.4}
#bottom-strip{position:fixed;bottom:calc(24px + var(--safe-bottom));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;background:rgba(16,16,16,.82);-webkit-backdrop-filter:blur(12px) saturate(120%);backdrop-filter:blur(12px) saturate(120%);border:1px solid rgba(255,255,255,.06);padding:8px 18px;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;color:var(--dim);letter-spacing:.05em;opacity:0;transition:opacity .5s;white-space:nowrap;pointer-events:none;z-index:80}
:root.light #bottom-strip{background:rgba(245,240,232,.88);border-color:rgba(33,29,21,.1)}
#bottom-strip.visible{opacity:1}
#bottom-strip .sep{width:1px;height:9px;background:rgba(255,255,255,.12)}
:root.light #bottom-strip .sep{background:rgba(33,29,21,.15)}
#pct-read{color:var(--primary)}
.icon-sun{display:none}.icon-moon{display:block}
:root.light .icon-sun{display:block}:root.light .icon-moon{display:none}
#shared-badge{position:fixed;bottom:calc(24px + var(--safe-bottom));right:var(--margin);font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--border);opacity:.4;z-index:79}
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
): void {
  const html = buildShareableHTML(title, markdown, withAnnotations, snapshot);
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
