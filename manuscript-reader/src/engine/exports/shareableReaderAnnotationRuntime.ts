// Inlined beta-reader annotation UI/runtime for shareableReader HTML exports.
// Mirrors SelectionPopup, AnnMarginColumn (desktop), and mobile annotation panel.

import { ANNOTATION_LABELS, ANNOTATION_COLORS } from '../types';
import {
  ANNOTATION_MENU_GLYPHS,
  ANNOTATION_MENU_ITEMS,
  ANNOTATION_NOTE_TYPES,
} from '../annotations/annotationMenu';
import { manuscriptVersionIdSource } from '../manuscript/manuscriptVersion';

/** Plain JS block inserted into the exported reader (not executed in Node). */
export function buildShareableAnnotationRuntimeScript(): string {
  const menuJson = JSON.stringify(ANNOTATION_MENU_ITEMS);
  const glyphsJson = JSON.stringify(ANNOTATION_MENU_GLYPHS);
  const noteTypesJson = JSON.stringify([...ANNOTATION_NOTE_TYPES]);
  const colorsJson = JSON.stringify(ANNOTATION_COLORS);
  const labelsJson = JSON.stringify(ANNOTATION_LABELS);
  const versionIdSrc = manuscriptVersionIdSource();
  const nl = String.fromCharCode(10);

  return `
// ── Annotation tools (beta reader mode) ──────────────────────────────────────
{
  var SLUG = title.toLowerCase().replace(/[^a-z0-9]/g,'-').slice(0,30);
  var ANN_KEY  = 'shared_ann_' + SLUG;
  var NAME_KEY = 'shared_reader_name';
  var RID_KEY  = 'shared_reader_id';
  var START_KEY = 'shared_started_' + SLUG;
  var ANN_MENU = ${menuJson};
  var ANN_GLYPHS = ${glyphsJson};
  var ANN_NOTE_TYPES = ${noteTypesJson};
  var ANN_COLORS = ${colorsJson};
  var ANN_LABELS = ${labelsJson};
  var NOTE_TYPES = {};
  ANN_NOTE_TYPES.forEach(function(t){ NOTE_TYPES[t] = 1; });

  var anns = [];
  try { anns = JSON.parse(localStorage.getItem(ANN_KEY)||'[]'); } catch(e){}
  if(!Array.isArray(anns)) anns = [];
  var readerName = '';
  try { readerName = localStorage.getItem(NAME_KEY) || ''; } catch(e){}

  var readerId = '';
  try { readerId = localStorage.getItem(RID_KEY) || ''; } catch(e){}
  if(!readerId){ readerId = 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); try{ localStorage.setItem(RID_KEY, readerId); }catch(e){} }

  var startedAt = 0;
  try { startedAt = parseInt(localStorage.getItem(START_KEY)||'0',10) || 0; } catch(e){}
  if(!startedAt){ startedAt = Date.now(); try{ localStorage.setItem(START_KEY, String(startedAt)); }catch(e){} }

  function saveAnns(){ try{ localStorage.setItem(ANN_KEY, JSON.stringify(anns)); }catch(e){} }
  function saveName(){ try{ localStorage.setItem(NAME_KEY, readerName); }catch(e){} }
  function annId(){ return 'a'+Date.now()+Math.random().toString(36).slice(2,6); }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isDesktop(){ return window.matchMedia('(min-width: 1080px)').matches; }

  var versionId = ${versionIdSrc};
  var MS_VERSION = versionId(md);

  var css = [
    ':root{--line:var(--border);--gold:var(--brand);--gold-soft:#d2b576;--gold-line:rgba(189,161,98,.28);--ann-highlight:rgba(189,161,98,.13);--ann-note:rgba(142,145,146,.22);--ann-bookmark:rgba(99,102,241,.22);--ann-question:rgba(239,100,97,.22);--ann-continuity:rgba(52,211,153,.22);--ann-structural:rgba(251,146,60,.22);--ann-pacing:rgba(56,189,248,.22);--ann-voice:rgba(192,132,252,.22);--bar-glass:rgba(24,24,22,.72)}',
    ':root.light{--gold-soft:#c2a868;--gold-line:rgba(181,151,87,.4);--ann-highlight:rgba(181,151,87,.14);--bar-glass:rgba(249,243,236,.86)}',
    'mark[data-ann]{--mark-bg:var(--ann-highlight);background:var(--mark-bg);color:inherit;cursor:pointer;padding:1px 0;border-radius:1px}',
    'mark[data-ann].type-note{--mark-bg:var(--ann-note)}',
    'mark[data-ann].type-bookmark{--mark-bg:var(--ann-bookmark)}',
    'mark[data-ann].type-question{--mark-bg:var(--ann-question)}',
    'mark[data-ann].type-continuity{--mark-bg:var(--ann-continuity)}',
    'mark[data-ann].type-structural{--mark-bg:var(--ann-structural)}',
    'mark[data-ann].type-pacing{--mark-bg:var(--ann-pacing)}',
    'mark[data-ann].type-voice{--mark-bg:var(--ann-voice)}',
    'mark[data-ann]:hover{filter:brightness(1.12)}',
    '#selection-popup{position:fixed;z-index:200;background:#181818;border:1px solid rgba(255,255,255,.07);border-radius:10px;display:none;flex-direction:column;min-width:0;width:460px;box-shadow:0 20px 60px -8px rgba(0,0,0,.8),0 4px 16px rgba(0,0,0,.5)}',
    ':root.light #selection-popup{background:#FDFAF4;border-color:rgba(33,29,21,.1);box-shadow:0 8px 40px -8px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08)}',
    '#selection-popup.visible{display:flex}',
    '.popup-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;padding:14px}',
    '.ann-type-btn{display:flex;align-items:center;gap:10px;padding:8px 12px;background:none;border:none;border-radius:7px;font-family:"Hanken Grotesk",system-ui,sans-serif;font-weight:400;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.5);cursor:pointer;white-space:nowrap;text-align:left;transition:color .16s,background .16s}',
    ':root.light .ann-type-btn{color:var(--muted)}',
    '.ann-type-btn:hover{color:#fff;background:rgba(255,255,255,.06)}',
    '.ann-type-btn.active-type{color:#fff;background:rgba(255,255,255,.09)}',
    ':root.light .ann-type-btn:hover{color:var(--primary);background:rgba(33,29,21,.045)}',
    ':root.light .ann-type-btn.active-type{color:var(--primary);background:rgba(33,29,21,.07)}',
    '.ann-type-icon{display:inline-flex;flex-shrink:0;color:rgba(255,255,255,.5)}',
    ':root.light .ann-type-icon{color:var(--muted)}',
    '.ann-type-btn:hover .ann-type-icon,.ann-type-btn.active-type .ann-type-icon{color:inherit}',
    '.ann-type-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}',
    '.ann-type-name{min-width:0;overflow:hidden;text-overflow:ellipsis}',
    '#popup-note-row{display:none;flex-direction:column;gap:10px;padding:14px 16px;border-top:1px solid rgba(255,255,255,.05)}',
    ':root.light #popup-note-row{border-top-color:rgba(33,29,21,.07)}',
    '#popup-note-row.visible{display:flex}',
    '#popup-textarea{width:100%;background:none;border:none;border-bottom:1px solid rgba(255,255,255,.1);font-family:"EB Garamond",Georgia,serif;font-size:16px;color:rgba(255,255,255,.85);padding:4px 0;outline:none;resize:none;min-height:60px;line-height:1.6}',
    ':root.light #popup-textarea{border-bottom-color:rgba(33,29,21,.15);color:var(--primary)}',
    '#popup-textarea::placeholder{color:rgba(255,255,255,.22);font-style:italic}',
    ':root.light #popup-textarea::placeholder{color:var(--dim)}',
    '#popup-textarea:focus{border-bottom-color:var(--brand)}',
    '.popup-save-row{display:flex;justify-content:space-between;align-items:center}',
    '.btn-ghost{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);background:none;border:none;cursor:pointer;padding:4px}',
    '.btn-outline{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);background:none;border:1px solid rgba(255,255,255,.1);padding:5px 12px;cursor:pointer}',
    ':root.light .btn-outline{border-color:rgba(33,29,21,.15)}',
    '.btn-outline:hover{border-color:var(--muted);color:var(--primary)}',
    '#ann-edit-popup{position:fixed;z-index:201;background:#181818;border:1px solid rgba(255,255,255,.07);border-radius:2px;width:min(320px,90vw);padding:16px 18px;display:none;flex-direction:column;gap:12px;box-shadow:0 16px 48px -8px rgba(0,0,0,.7)}',
    ':root.light #ann-edit-popup{background:#FDFAF4;border-color:rgba(33,29,21,.1)}',
    '#ann-edit-popup.visible{display:flex}',
    '.ann-edit-label{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}',
    '#popup-textarea-edit{width:100%;min-height:64px;background:none;border:none;border-bottom:1px solid var(--border);color:var(--on-surface);font-family:"EB Garamond",Georgia,serif;font-size:15px;line-height:1.5;outline:none;resize:none;padding:0 0 8px}',
    '#popup-textarea-edit:focus{border-bottom-color:var(--brand)}',
    '.ann-edit-actions{display:flex;justify-content:space-between;align-items:center}',
    '.ann-edit-del{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);background:none;border:none;cursor:pointer;padding:4px}',
    '.ann-edit-del:hover{color:#c0392b}',
    '.ann-edit-save{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--primary);background:none;border:1px solid var(--primary);padding:5px 14px;cursor:pointer}',
    '#reader-body.ann-open{display:block}',
    '#ann-margin{display:none}',
    '@media(min-width:1080px){#screen-reader.beta-reader{padding-left:0;padding-right:0}#reader-body.ann-open{display:grid;grid-template-columns:minmax(0,1fr) var(--max-w) minmax(0,1fr);align-items:start}#reader-body.ann-open #content{grid-column:2;margin:0}#reader-body.ann-open #ann-margin{grid-column:3;display:flex;flex-direction:column;gap:12px;align-self:start;position:sticky;top:calc(var(--topbar-h) + 16px);max-height:calc(100dvh - var(--topbar-h) - 32px);width:100%;max-width:280px;padding-left:20px;opacity:1;pointer-events:auto;overflow-y:auto;scrollbar-width:thin}}',
    '.ann-margin-list{display:flex;flex-direction:column;gap:18px;padding-bottom:24px}',
    '.ann-margin-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px;padding-left:12px}',
    '.ann-margin-head-label{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}',
    '.ann-margin-index-btn{background:none;border:none;cursor:pointer;padding:0;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}',
    '.ann-margin-card{padding:12px 0 12px 12px;border-left:2px solid var(--line);cursor:pointer;transition:border-color .16s,opacity .16s}',
    '.ann-margin-card:hover{border-left-color:var(--gold-line)}',
    '.ann-margin-card.faded{opacity:.4}',
    '.ann-margin-card.emph{opacity:1;border-left-width:3px}',
    '.ann-margin-card.emph .ann-margin-tag{color:var(--gold-soft)}',
    '.ann-margin-tag{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:8px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);margin-bottom:7px}',
    '.ann-margin-chapter{color:var(--dim);font-weight:400}',
    '.ann-margin-quote{font-family:"EB Garamond",Georgia,serif;font-size:13px;font-style:italic;color:var(--dim);line-height:1.5;margin-bottom:5px}',
    '.ann-margin-note{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;color:var(--on-surface);line-height:1.6}',
    '.ann-margin-reader{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;color:var(--dim);font-style:italic;margin-top:4px}',
    '.ann-margin-empty{padding:24px 12px;font-family:"EB Garamond",Georgia,serif;font-size:15px;font-style:italic;color:var(--dim)}',
    '.ann-side{position:fixed;top:var(--topbar-h);right:0;width:min(340px,90vw);height:calc(100dvh - var(--topbar-h));background:var(--surface);border-left:1px solid var(--border);display:flex;flex-direction:column;z-index:110;transform:translateX(100%);transition:transform .32s var(--ease-expo)}',
    ':root.light .ann-side{background:#f9f3ec}',
    '.ann-side.open{transform:translateX(0)}',
    '.ann-side.topbar-hidden{top:0;height:100dvh}',
    '.ann-side-head{padding:20px 20px 0;border-bottom:1px solid var(--border);flex-shrink:0}',
    '.ann-side-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}',
    '.ann-side-title{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}',
    '.ann-side-x{background:none;border:none;cursor:pointer;color:var(--dim);padding:2px}',
    '.ann-name{width:100%;background:var(--surface-high);border:1px solid var(--border);font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;color:var(--on-surface);padding:8px 10px;outline:none;margin-bottom:14px}',
    ':root.light .ann-name{background:#fffaf4;border-color:rgba(33,29,21,.12)}',
    '.ann-name:focus{border-color:var(--brand)}',
    '.ann-name-margin{display:none;margin:0 0 4px 12px;max-width:calc(100% - 12px)}',
    '@media(min-width:1080px){.ann-name-margin{display:block}}',
    '.ann-list{flex:1;overflow-y:auto;padding:0}',
    '.ann-empty{padding:56px 24px;text-align:center;font-family:"EB Garamond",Georgia,serif;font-size:17px;font-style:italic;color:var(--dim);line-height:1.7}',
    '.ann-item{padding:14px 20px 14px 18px;border-bottom:1px solid var(--line);border-left:2px solid var(--line);cursor:pointer;transition:border-color .16s}',
    '.ann-item:hover{border-left-color:var(--gold-line)}',
    '.ann-item-header{display:flex;align-items:center;gap:8px;margin-bottom:7px}',
    '.ann-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;opacity:.75}',
    '.ann-type-label{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:8px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);flex:1}',
    '.ann-loc{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;color:var(--dim);opacity:.45}',
    '.ann-ix{background:none;border:none;cursor:pointer;color:var(--dim);opacity:0;padding:2px}',
    '.ann-item:hover .ann-ix{opacity:1}',
    '.ann-quote{font-family:"EB Garamond",Georgia,serif;font-size:13px;font-style:italic;color:var(--dim);line-height:1.5;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.ann-note-text{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;color:var(--on-surface);line-height:1.6}',
    '.ann-side-foot{padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0}',
    '.ann-export{width:100%;padding:11px;background:var(--surface-high);border:1px solid var(--line);font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--on-surface);cursor:pointer}',
    ':root.light .ann-export{background:#fffaf4;border-color:rgba(33,29,21,.12)}',
    '.ann-export:hover{border-color:var(--muted);color:var(--primary)}',
    '.ann-export:disabled{opacity:.4;cursor:default}',
    '.ann-foot-hint{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;color:var(--dim);text-align:center;margin-top:9px;line-height:1.5}',
    '.ann-badge{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--brand);margin-left:5px;vertical-align:middle;opacity:0;transition:opacity .3s}',
    '.ann-badge.vis{opacity:1}',
    '.ann-hint{position:fixed;top:calc(var(--topbar-h) + 8px);left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--border);font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;color:var(--dim);padding:7px 16px;z-index:79;white-space:nowrap;pointer-events:none;opacity:1;transition:opacity 1s}',
    '.ann-hint.fade{opacity:0}',
    '.ann-hint.prompt{z-index:120;white-space:normal;max-width:min(420px,92vw);text-align:center;line-height:1.45;border-color:var(--brand);color:var(--primary);padding:10px 18px}',
    '@media(max-width:560px){#selection-popup{left:10px!important;right:10px!important;top:10px!important;width:auto!important;max-height:calc(100dvh - 20px);overflow-y:auto}}'
  ].join(${JSON.stringify(nl)});
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var readerBody = document.getElementById('reader-body');
  if(!readerBody){ console.error('Shared reader: missing #reader-body — re-download the annotating reader file.'); }
  var marginEl = document.createElement('div');
  marginEl.id = 'ann-margin';
  marginEl.className = 'open';
  marginEl.setAttribute('aria-label','Annotations');
  marginEl.innerHTML = '<div class="ann-margin-head"><span class="ann-margin-head-label">Margin</span><button type="button" class="ann-margin-index-btn ann-export-inline" style="display:none">Export ›</button></div><input class="ann-name ann-name-margin" type="text" placeholder="Your name (for the author)" autocomplete="name"><div class="ann-margin-list"></div>';
  if(readerBody) readerBody.appendChild(marginEl);
  var marginListEl = marginEl.querySelector('.ann-margin-list');
  var marginExportBtn = marginEl.querySelector('.ann-export-inline');

  function glyphSvg(d){
    var paths = d.split('|').map(function(p){ return '<path d="'+p+'"/>'; }).join('');
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
  }
  function menuLabelForType(type){
    for(var i=0;i<ANN_MENU.length;i++){ if(ANN_MENU[i].type===type) return ANN_MENU[i].label; }
    return ANN_LABELS[type] || type;
  }

  var tgl = document.createElement('button');
  tgl.className = 'icon-btn';
  tgl.setAttribute('aria-label','Annotations');
  tgl.innerHTML = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"><path d="M3 3h12v10H9l-4 3V13H3z"/><line x1="6" y1="7" x2="12" y2="7"/><line x1="6" y1="10" x2="10" y2="10"/></svg>';
  var badge = document.createElement('span');
  badge.className = 'ann-badge';
  tgl.appendChild(badge);
  document.getElementById('topbar-right').insertBefore(tgl, document.getElementById('topbar-right').firstChild);

  var popup = document.createElement('div');
  popup.id = 'selection-popup';
  var gridHtml = '<div class="popup-grid">';
  ANN_MENU.forEach(function(item){
    gridHtml += '<button type="button" class="ann-type-btn" data-type="'+item.type+'"><span class="ann-type-icon">'+glyphSvg(ANN_GLYPHS[item.type])+'</span><span class="ann-type-dot" style="background:'+ANN_COLORS[item.type]+'"></span><span class="ann-type-name">'+item.label+'</span></button>';
  });
  gridHtml += '</div><div id="popup-note-row"><textarea id="popup-textarea" rows="3"></textarea><div class="popup-save-row"><button type="button" class="btn-ghost" id="popup-cancel">Cancel</button><button type="button" class="btn-outline" id="popup-save">Save</button></div></div>';
  popup.innerHTML = gridHtml;
  document.body.appendChild(popup);
  popup.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
  var noteRow = popup.querySelector('#popup-note-row');
  var noteTA  = popup.querySelector('#popup-textarea');

  var editPop = document.createElement('div');
  editPop.id = 'ann-edit-popup';
  editPop.innerHTML = '<div class="ann-edit-label">Edit note</div><textarea id="popup-textarea-edit" rows="3"></textarea><div class="ann-edit-actions"><button type="button" class="ann-edit-del">Delete</button><button type="button" class="ann-edit-save">Save</button></div>';
  document.body.appendChild(editPop);
  var editLabel = editPop.querySelector('.ann-edit-label');
  var editTA    = editPop.querySelector('#popup-textarea-edit');

  var side = document.createElement('aside');
  side.className = 'ann-side';
  side.innerHTML =
    '<div class="ann-side-head">' +
      '<div class="ann-side-title-row"><span class="ann-side-title">Your annotations</span>' +
        '<button type="button" class="ann-side-x" aria-label="Close"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>' +
      '</div>' +
      '<input class="ann-name" type="text" placeholder="Your name (so the author knows whose notes these are)" autocomplete="name">' +
    '</div>' +
    '<div class="ann-list"></div>' +
    '<div class="ann-side-foot"><button type="button" class="ann-export">Export feedback (.json)</button><div class="ann-foot-hint">Send this file back to the author to import your notes.</div></div>';
  document.body.appendChild(side);
  var sideList   = side.querySelector('.ann-list');
  var nameInput  = side.querySelector('.ann-name');
  var nameInputMargin = marginEl.querySelector('.ann-name-margin');
  var exportBtn  = side.querySelector('.ann-export');
  nameInput.value = readerName;
  if(nameInputMargin) nameInputMargin.value = readerName;
  function syncNameInputs(){
    nameInput.value = readerName;
    if(nameInputMargin) nameInputMargin.value = readerName;
  }
  function onNameInput(val){
    readerName = val.trim(); saveName();
    anns.forEach(function(a){ if(!a.readerName) a.readerName = readerName || null; });
    saveAnns();
    syncNameInputs();
  }

  var hint = document.createElement('div');
  hint.className = 'ann-hint';
  hint.textContent = 'Select any passage to annotate · export when you are done';
  document.body.appendChild(hint);
  var hintFaded = false;
  function fadeHint(){ if(hintFaded) return; hintFaded=true; hint.classList.add('fade'); hint.classList.remove('prompt'); setTimeout(function(){ hint.style.display='none'; },1100); }
  setTimeout(fadeHint, 12000);

  function promptForName(){
    if(nudgedName || (readerName && readerName.trim())) return;
    nudgedName = true;
    hintFaded = false;
    hint.style.display = 'block';
    hint.classList.add('prompt');
    hint.classList.remove('fade');
    hint.textContent = 'Add your name in the annotations panel so the author knows whose feedback this is.';
    openSide();
    setTimeout(function(){ if(nameInput) nameInput.focus(); }, 350);
    setTimeout(fadeHint, 14000);
  }

  var selectedId = null;
  var nudgedName = false;
  var editingId = null;
  var pendingRange = null, pendingType = null, pendingQuote = '';

  function quoteFromPending(){
    if(pendingQuote) return pendingQuote;
    if(!pendingRange) return '';
    try { return pendingRange.toString().trim(); } catch(e){ return ''; }
  }

  function updateBadge(){
    badge.classList.toggle('vis', anns.length>0);
    exportBtn.disabled = anns.length===0;
    if(marginExportBtn) marginExportBtn.style.display = anns.length && isDesktop() ? '' : 'none';
  }

  function chapterForRange(range){
    if(!range || !chapters.length) return {title:'',index:0,id:''};
    var rect = range.getBoundingClientRect();
    var y = rect.top + window.scrollY;
    var best = {title:'',index:0,id:''};
    for(var k=0;k<chapters.length;k++){
      var el = document.getElementById(chapters[k].id);
      if(el && el.offsetTop <= y + 100) best = {title:chapters[k].title, index:chapters[k].index, id:chapters[k].id};
    }
    return best;
  }

  function anchorBlockFor(chapterId){
    if(!chapterId) return null;
    var marker = document.getElementById(chapterId);
    var el = marker ? marker.nextElementSibling : null;
    while(el && !(el.classList && el.classList.contains('chapter-block'))) el = el.nextElementSibling;
    return el || null;
  }
  function offsetInRoot(root, range){
    var pre = document.createRange();
    pre.selectNodeContents(root);
    try { pre.setEnd(range.startContainer, range.startOffset); } catch(e){ return 0; }
    return pre.toString().length;
  }
  function buildAnchorFor(range, chapterId, quote){
    if(!range || !quote) return undefined;
    var scope = anchorBlockFor(chapterId);
    var root = scope || contentEl;
    var full = root.textContent || '';
    var start = offsetInRoot(root, range);
    var end = start + quote.length;
    var a = { quote: quote, prefix: full.slice(Math.max(0, start-40), start), suffix: full.slice(end, end+40), offset: start };
    if(scope) a.chapterId = chapterId;
    return a;
  }

  function wrapMark(container, text, id, type){
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    var node, search = text.slice(0,60);
    while((node=walker.nextNode())){
      var idx = node.nodeValue.indexOf(search);
      if(idx !== -1){
        var end = Math.min(idx+text.length, node.nodeValue.length);
        var mark = document.createElement('mark');
        mark.dataset.ann = id; mark.className = 'type-'+type;
        mark.textContent = node.nodeValue.slice(idx,end);
        var frag = document.createDocumentFragment();
        if(idx>0) frag.appendChild(document.createTextNode(node.nodeValue.slice(0,idx)));
        frag.appendChild(mark);
        if(end<node.nodeValue.length) frag.appendChild(document.createTextNode(node.nodeValue.slice(end)));
        node.parentNode.replaceChild(frag,node);
        attachMark(mark);
        return;
      }
    }
  }
  function attachMark(mark){
    mark.addEventListener('click', function(e){
      e.stopPropagation();
      selectedId = mark.dataset.ann;
      renderMargin();
      openEdit(mark.dataset.ann, mark);
    });
  }

  anns.forEach(function(ann){ if(ann.quote) wrapMark(contentEl, ann.quote, ann.id, ann.type); });
  updateBadge();

  document.addEventListener('mouseup', handleSel);
  document.addEventListener('touchend', handleSel);
  function handleSel(e){
    if(popup.contains(e.target) || editPop.contains(e.target) || side.contains(e.target) || marginEl.contains(e.target)) return;
    setTimeout(function(){
      var sel = window.getSelection();
      var txt = sel ? sel.toString().trim() : '';
      if(txt.length>3 && sel && sel.anchorNode && contentEl.contains(sel.anchorNode)){
        pendingRange = sel.getRangeAt(0).cloneRange();
        pendingQuote = txt;
        showPopup(pendingRange);
      } else if(!popup.contains(e.target)) { hidePopup(); }
    },10);
  }
  function showPopup(range){
    popup.classList.add('visible');
    noteRow.classList.remove('visible');
    noteTA.value = ''; pendingType = null;
    pendingQuote = quoteFromPending();
    popup.querySelectorAll('.ann-type-btn').forEach(function(b){ b.classList.remove('active-type'); });
    var r = range.getBoundingClientRect();
    var pw = popup.offsetWidth||460, ph = popup.offsetHeight||120;
    var left = r.left + r.width/2 - pw/2;
    var top  = r.top - ph - 10;
    left = Math.max(8, Math.min(left, window.innerWidth-pw-8));
    if(top < 60) top = r.bottom + 8;
    popup.style.left = left+'px'; popup.style.top = top+'px';
  }
  function hidePopup(){
    popup.classList.remove('visible');
    noteRow.classList.remove('visible');
    noteTA.value='';
    pendingRange=null;
    pendingQuote='';
    pendingType=null;
    popup.querySelectorAll('.ann-type-btn').forEach(function(b){ b.classList.remove('active-type'); });
  }

  popup.querySelectorAll('.ann-type-btn').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var type = btn.dataset.type;
      popup.querySelectorAll('.ann-type-btn').forEach(function(b){ b.classList.remove('active-type'); });
      if(NOTE_TYPES[type]){
        pendingType = type;
        btn.classList.add('active-type');
        noteRow.classList.add('visible');
        noteTA.placeholder = 'Add a ' + (ANN_LABELS[type] || type).toLowerCase() + '…';
        setTimeout(function(){ noteTA.focus(); },0);
      } else {
        commit(type, '');
      }
    });
  });
  popup.querySelector('#popup-cancel').addEventListener('click', function(e){ e.stopPropagation(); hidePopup(); });
  popup.querySelector('#popup-save').addEventListener('click', function(e){ e.stopPropagation(); if(pendingType) commit(pendingType, noteTA.value.trim()); });
  noteTA.addEventListener('keydown', function(e){
    if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){ e.preventDefault(); if(pendingType) commit(pendingType, noteTA.value.trim()); }
    if(e.key==='Escape') hidePopup();
  });

  function commit(type, note){
    if(!pendingRange){ hidePopup(); return; }
    var txt = quoteFromPending();
    if(txt.length < 4){ hidePopup(); return; }
    var range = pendingRange;
    var ch  = chapterForRange(range);
    var quote = txt.slice(0,400);
    var anchor = buildAnchorFor(range, ch.id, quote);
    var ann = {id:annId(), type:type, quote:quote, note:note,
               chapterTitle:ch.title, chapterIndex:ch.index, createdAt:Date.now(),
               readerName: readerName || null, readerId: readerId, anchor: anchor};
    anns.push(ann); saveAnns(); updateBadge(); fadeHint();
    try {
      var mark = document.createElement('mark');
      mark.dataset.ann = ann.id; mark.className = 'type-'+type;
      range.surroundContents(mark);
      attachMark(mark);
    } catch(err){ wrapMark(contentEl, quote.slice(0,60), ann.id, type); }
    if(window.getSelection) window.getSelection().removeAllRanges();
    hidePopup();
    selectedId = ann.id;
    renderAll();
    promptForName();
  }

  function openEdit(id, anchor){
    var ann = anns.find(function(a){ return a.id===id; });
    if(!ann) return;
    editingId = id;
    editLabel.textContent = 'Edit note';
    editTA.value = ann.note || '';
    editPop.classList.add('visible');
    var rect = anchor.getBoundingClientRect();
    var left = Math.max(8, Math.min(rect.left, window.innerWidth-320-8));
    var top  = rect.bottom + 8;
    if(top + 150 > window.innerHeight) top = Math.max(8, rect.top - 150);
    editPop.style.left = left+'px'; editPop.style.top = top+'px';
    setTimeout(function(){ editTA.focus(); },50);
  }
  function hideEdit(){ editPop.classList.remove('visible'); editingId = null; }
  editPop.querySelector('.ann-edit-save').addEventListener('click', function(){
    if(!editingId) return;
    var ann = anns.find(function(a){ return a.id===editingId; });
    if(ann){ ann.note = editTA.value.trim(); saveAnns(); renderAll(); }
    hideEdit();
  });
  editPop.querySelector('.ann-edit-del').addEventListener('click', function(){
    if(!editingId) return;
    removeAnn(editingId); hideEdit();
  });
  editTA.addEventListener('keydown', function(e){
    if(e.key==='Enter' && (e.metaKey||e.ctrlKey)) editPop.querySelector('.ann-edit-save').click();
    if(e.key==='Escape') hideEdit();
  });

  function removeAnn(id){
    anns = anns.filter(function(a){ return a.id!==id; });
    saveAnns();
    var mark = contentEl.querySelector('mark[data-ann="'+id+'"]');
    if(mark){
      var parent = mark.parentNode;
      while(mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark); parent.normalize();
    }
    if(selectedId===id) selectedId = null;
    updateBadge(); renderAll();
  }

  function openSide(){ side.classList.add('open'); tgl.classList.add('active-btn'); renderSide(); }
  function closeSide(){ side.classList.remove('open'); tgl.classList.remove('active-btn'); }
  tgl.addEventListener('click', function(){ side.classList.contains('open') ? closeSide() : openSide(); });
  side.querySelector('.ann-side-x').addEventListener('click', closeSide);
  nameInput.addEventListener('input', function(){ onNameInput(nameInput.value); });
  if(nameInputMargin) nameInputMargin.addEventListener('input', function(){ onNameInput(nameInputMargin.value); });

  function sortedAnns(){
    return anns.slice().sort(function(a,b){ return (a.chapterIndex-b.chapterIndex) || (a.createdAt-b.createdAt); });
  }

  function renderSide(){
    var list = sortedAnns();
    sideList.innerHTML = '';
    if(!list.length){
      var empty = document.createElement('div');
      empty.className = 'ann-empty';
      empty.textContent = 'Select any passage to annotate.';
      sideList.appendChild(empty);
      return;
    }
    list.forEach(function(ann){ sideList.appendChild(buildSideItem(ann)); });
  }

  function buildSideItem(ann){
    var item = document.createElement('div');
    item.className = 'ann-item';
    var loc = ann.chapterTitle ? 'Ch. '+String(ann.chapterIndex).padStart(2,'0') : '';
    item.innerHTML =
      '<div class="ann-item-header">' +
        '<span class="ann-dot" style="background:'+(ANN_COLORS[ann.type]||'var(--gold)')+'"></span>' +
        '<span class="ann-type-label">'+menuLabelForType(ann.type)+'</span>' +
        '<span class="ann-loc">'+loc+'</span>' +
        '<button type="button" class="ann-ix" aria-label="Remove"><svg viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.2"><line x1="1" y1="1" x2="12" y2="12"/><line x1="12" y1="1" x2="1" y2="12"/></svg></button>' +
      '</div>' +
      (ann.quote ? '<div class="ann-quote">"'+esc(ann.quote)+'"</div>' : '') +
      (ann.note ? '<div class="ann-note-text">'+esc(ann.note)+'</div>' : '');
    item.querySelector('.ann-ix').addEventListener('click', function(e){ e.stopPropagation(); removeAnn(ann.id); });
    item.addEventListener('click', function(){
      selectedId = ann.id;
      renderAll();
      var mark = contentEl.querySelector('mark[data-ann="'+ann.id+'"]');
      if(mark){ closeSide(); setTimeout(function(){ mark.scrollIntoView({behavior:'smooth',block:'center'}); },300); }
    });
    return item;
  }

  function renderMargin(){
    if(!marginListEl || !isDesktop()) return;
    marginListEl.innerHTML = '';
    var list = sortedAnns();
    if(!list.length){
      var empty = document.createElement('div');
      empty.className = 'ann-margin-empty';
      empty.textContent = 'Select any passage to annotate.';
      marginListEl.appendChild(empty);
      return;
    }
    list.forEach(function(ann){
      var card = document.createElement('div');
      var isSel = selectedId === ann.id;
      var faded = selectedId != null && !isSel;
      card.className = 'ann-margin-card' + (isSel ? ' emph' : '') + (faded ? ' faded' : '');
      card.style.borderLeftColor = isSel ? 'var(--gold)' : (ANN_COLORS[ann.type] + '88');
      card.innerHTML =
        '<div class="ann-margin-tag">'+menuLabelForType(ann.type)+
          (ann.chapterIndex ? '<span class="ann-margin-chapter"> · Ch.&nbsp;'+String(ann.chapterIndex).padStart(2,'0')+'</span>' : '') +
        '</div>' +
        (ann.quote ? '<div class="ann-margin-quote">"'+esc(ann.quote.length>100?ann.quote.slice(0,100)+'…':ann.quote)+'"</div>' : '') +
        (ann.note ? '<div class="ann-margin-note">'+esc(ann.note)+'</div>' : '') +
        (ann.readerName ? '<div class="ann-margin-reader">— '+esc(ann.readerName)+'</div>' : '');
      card.addEventListener('click', function(){
        selectedId = ann.id;
        renderAll();
        var mark = contentEl.querySelector('mark[data-ann="'+ann.id+'"]');
        if(mark) mark.scrollIntoView({behavior:'smooth',block:'center'});
      });
      marginListEl.appendChild(card);
    });
  }

  function renderAll(){ renderSide(); renderMargin(); }

  var resizeTimer;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){ renderAll(); updateBadge(); }, 120);
  });

  renderAll();

  var maxProgress = 0;
  function trackProgress(){ var docH=document.documentElement.scrollHeight-window.innerHeight; var p=docH>0?window.scrollY/docH:0; if(p>maxProgress) maxProgress=p; }
  window.addEventListener('scroll', trackProgress, {passive:true});
  trackProgress();

  function doExport(){
    if(!anns.length) return;
    anns.forEach(function(a){ if(!a.readerName) a.readerName = readerName || null; if(!a.readerId) a.readerId = readerId; });
    saveAnns();
    var prog = Math.min(1, Math.max(0, maxProgress));
    var payload = { readerId: readerId, readerName: readerName || null, manuscript: title,
                    manuscriptVersionId: MS_VERSION,
                    snapshotId: SHARE_SNAPSHOT_ID, snapshotLabel: SHARE_SNAPSHOT_LABEL,
                    startedAt: startedAt, completedAt: prog>=0.985 ? Date.now() : null,
                    exportedAt: Date.now(), progress: prog, annotations: anns };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = SLUG + '-feedback.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); document.body.removeChild(a); },1000);
  }
  exportBtn.addEventListener('click', doExport);
  if(marginExportBtn) marginExportBtn.addEventListener('click', doExport);

  document.addEventListener('mousedown', function(e){
    if(!popup.contains(e.target) && !contentEl.contains(e.target)) hidePopup();
    if(!editPop.contains(e.target) && e.target.tagName!=='MARK') hideEdit();
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape'){ hidePopup(); hideEdit(); closeSide(); }
  });
}
`;
}
