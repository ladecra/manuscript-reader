// Inlined beta-reader annotation UI/runtime for shareableReader HTML exports.
// Mirrors SelectionPopup, AnnMarginColumn (desktop), and mobile annotation panel.

import { ANNOTATION_LABELS, ANNOTATION_COLORS } from '../types';
import {
  ANNOTATION_MENU_GLYPHS,
  ANNOTATION_MENU_ITEMS,
  ANNOTATION_PRIMARY,
  ANNOTATION_EDITORIAL,
  ANNOTATION_NOTE_TYPES,
} from '../annotations/annotationMenu';
import { manuscriptVersionIdSource } from '../manuscript/manuscriptVersion';
import { READER_MARKING_CSS, READER_MARGIN_CSS } from './readerStyles';

/** Binds the reader file to a hosted share so sessions POST to the worker. Mirrors
 *  `ShareSyncConfig` in shareableReader.ts; kept local to avoid a cross-file import
 *  in this runtime-string builder. */
export interface AnnotationRuntimeSyncConfig {
  endpoint: string;
  shareId: string;
}

/** Plain JS block inserted into the exported reader (not executed in Node). */
export function buildShareableAnnotationRuntimeScript(syncConfig?: AnnotationRuntimeSyncConfig): string {
  const syncEndpointJson = JSON.stringify(syncConfig?.endpoint ?? '');
  const syncShareIdJson = JSON.stringify(syncConfig?.shareId ?? '');
  const menuJson = JSON.stringify(ANNOTATION_MENU_ITEMS);
  const primaryJson = JSON.stringify(ANNOTATION_PRIMARY);
  const editorialJson = JSON.stringify(ANNOTATION_EDITORIAL);
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
  var RTOKEN_KEY = 'shared_reader_token_' + SLUG;
  // Hosted-share binding (empty when the file is a standalone offline reader).
  var SYNC_ENDPOINT = ${syncEndpointJson};
  var SYNC_SHARE_ID = ${syncShareIdJson};
  var ANN_MENU = ${menuJson};
  var ANN_PRIMARY = ${primaryJson};
  var ANN_EDITORIAL = ${editorialJson};
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

  // Reader token: minted by the worker on this reader's first sync and kept here, so
  // later syncs from this browser update THIS reader's session and no one else's.
  var readerToken = '';
  try { readerToken = localStorage.getItem(RTOKEN_KEY) || ''; } catch(e){}

  // Optimistic-sync state (declared once here; the machinery is defined below).
  var syncStatusEl = null, syncTimer = 0, syncInFlight = false, syncPending = false;
  var SYNC_STATUS = 'off';

  var startedAt = 0;
  try { startedAt = parseInt(localStorage.getItem(START_KEY)||'0',10) || 0; } catch(e){}
  if(!startedAt){ startedAt = Date.now(); try{ localStorage.setItem(START_KEY, String(startedAt)); }catch(e){} }

  function saveAnns(){ try{ localStorage.setItem(ANN_KEY, JSON.stringify(anns)); }catch(e){} scheduleSync(); }
  function saveName(){ try{ localStorage.setItem(NAME_KEY, readerName); }catch(e){} }
  function annId(){ return 'a'+Date.now()+Math.random().toString(36).slice(2,6); }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isDesktop(){ return window.matchMedia('(min-width: 1200px)').matches; }

  var versionId = ${versionIdSrc};
  var MS_VERSION = versionId(md);

  var css = [
    // Tokens (--gold, --ann-*, --bar-glass, …) come from readerStyles.ts via the
    // page's canonical <style>; this block styles only the annotation layer.
    // Marking bar + composer come from the canonical READER_MARKING_CSS (shared with
    // the in-app SelectionPopup). Marks themselves are styled by READER_SURFACE_CSS.
    ${JSON.stringify(READER_MARKING_CSS)},
    '#ann-edit-popup{position:fixed;z-index:201;background:#181818;border:1px solid rgba(255,255,255,.07);border-radius:2px;width:min(320px,90vw);padding:16px 18px;display:none;flex-direction:column;gap:12px;box-shadow:0 16px 48px -8px rgba(0,0,0,.7)}',
    ':root.light #ann-edit-popup{background:#FDFAF4;border-color:rgba(33,29,21,.1)}',
    '#ann-edit-popup.visible{display:flex}',
    '.ann-edit-label{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}',
    '#popup-textarea-edit{width:100%;min-height:64px;background:none;border:none;border-bottom:1px solid var(--border);color:var(--ink);font-family:"Iowan Old Style","Charter","Palatino Linotype","Book Antiqua",Georgia,serif;font-size:15px;line-height:1.5;outline:none;resize:none;padding:0 0 8px}',
    '#popup-textarea-edit:focus{border-bottom-color:var(--brand)}',
    '.ann-edit-actions{display:flex;justify-content:space-between;align-items:center}',
    '.ann-edit-del{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);background:none;border:none;cursor:pointer;padding:4px}',
    '.ann-edit-del:hover{color:#c0392b}',
    '.ann-edit-save{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:10px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);background:none;border:1px solid var(--ink);padding:5px 14px;cursor:pointer}',
    '#reader-body.ann-open{display:block}',
    // Desktop margin column (anchored cascade + browse + orphans) — canonical, shared
    // with the app's AnnMarginColumn. Placement of each card is done in JS below.
    ${JSON.stringify(READER_MARGIN_CSS)},
    '.ann-side{position:fixed;top:var(--topbar-h);right:0;width:min(340px,90vw);height:calc(100dvh - var(--topbar-h));background:var(--raised);border-left:1px solid var(--border);display:flex;flex-direction:column;z-index:110;transform:translateX(100%);transition:transform .32s var(--ease-expo)}',
    ':root.light .ann-side{background:#f9f3ec}',
    '.ann-side.open{transform:translateX(0)}',
    '.ann-side.topbar-hidden{top:0;height:100dvh}',
    '.ann-side-head{padding:20px 20px 0;border-bottom:1px solid var(--border);flex-shrink:0}',
    '.ann-side-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}',
    '.ann-side-title{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}',
    '.ann-side-x{background:none;border:none;cursor:pointer;color:var(--dim);padding:2px}',
    '.ann-name{width:100%;background:var(--surface-high);border:1px solid var(--border);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:11px;color:var(--ink);padding:8px 10px;outline:none;margin-bottom:14px}',
    ':root.light .ann-name{background:#fffaf4;border-color:rgba(33,29,21,.12)}',
    '.ann-name:focus{border-color:var(--brand)}',
    '.ann-name-margin{display:none;margin:0 0 4px 12px;max-width:calc(100% - 12px)}',
    '@media(min-width:1200px){.ann-name-margin{display:block}}',
    '.ann-list{flex:1;overflow-y:auto;padding:0}',
    '.ann-empty{padding:56px 24px;text-align:center;font-family:"Iowan Old Style","Charter","Palatino Linotype","Book Antiqua",Georgia,serif;font-size:17px;font-style:italic;color:var(--dim);line-height:1.7}',
    '.ann-item{padding:14px 20px 14px 18px;border-bottom:1px solid var(--line);border-left:2px solid var(--line);cursor:pointer;transition:border-color .16s}',
    '.ann-item:hover{border-left-color:var(--gold-line)}',
    '.ann-item-header{display:flex;align-items:center;gap:8px;margin-bottom:7px}',
    '.ann-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;opacity:.75}',
    '.ann-type-label{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:8px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);flex:1}',
    '.ann-loc{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:9px;color:var(--dim);opacity:.45}',
    '.ann-ix{background:none;border:none;cursor:pointer;color:var(--dim);opacity:0;padding:2px}',
    '.ann-item:hover .ann-ix{opacity:1}',
    '.ann-quote{font-family:"Iowan Old Style","Charter","Palatino Linotype","Book Antiqua",Georgia,serif;font-size:13px;font-style:italic;color:var(--dim);line-height:1.5;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.ann-note-text{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:11px;color:var(--ink);line-height:1.6}',
    '.ann-side-foot{padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0}',
    '.ann-export{width:100%;padding:11px;background:var(--surface-high);border:1px solid var(--line);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);cursor:pointer}',
    ':root.light .ann-export{background:#fffaf4;border-color:rgba(33,29,21,.12)}',
    '.ann-export:hover{border-color:var(--muted);color:var(--ink)}',
    '.ann-export:disabled{opacity:.4;cursor:default}',
    '.ann-foot-hint{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:9px;color:var(--dim);text-align:center;margin-top:9px;line-height:1.5}',
    '.ann-badge{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--brand);margin-left:5px;vertical-align:middle;opacity:0;transition:opacity .3s}',
    '.ann-badge.vis{opacity:1}',
    '.ann-hint{position:fixed;top:calc(var(--topbar-h) + 8px);left:50%;transform:translateX(-50%);background:var(--raised);border:1px solid var(--border);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:10px;color:var(--dim);padding:7px 16px;z-index:79;white-space:nowrap;pointer-events:none;opacity:1;transition:opacity 1s}',
    '.ann-hint.fade{opacity:0}',
    '.ann-hint.prompt{z-index:120;white-space:normal;max-width:min(420px,92vw);text-align:center;line-height:1.45;border-color:var(--brand);color:var(--ink);padding:10px 18px}'
    // (mobile selection-popup layout now lives in the canonical READER_MARKING_CSS bottom-sheet block)
  ].join(${JSON.stringify(nl)});
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var readerBody = document.getElementById('reader-body');
  if(!readerBody){ console.error('Shared reader: missing #reader-body — re-download the annotating reader file.'); }
  // Desktop margin column. The head + name field are persistent (so typing a name is
  // never interrupted by a re-render); only the cards are rebuilt. Cards are direct
  // children so they can be absolutely positioned beside their <mark> (anchored mode).
  // Mirrors the app's AnnMarginColumn.
  var marginEl = document.createElement('div');
  marginEl.id = 'ann-margin';
  marginEl.className = 'open';
  marginEl.setAttribute('aria-label','Annotations');
  marginEl.innerHTML =
    '<div class="ann-margin-head">' +
      '<span class="ann-margin-head-label">Margin</span>' +
      '<button type="button" class="ann-margin-index-btn" style="display:none"></button>' +
    '</div>' +
    '<input class="ann-name ann-name-margin" type="text" placeholder="Your name (for the author)" autocomplete="name">';
  if(readerBody) readerBody.appendChild(marginEl);
  var marginHeadEl   = marginEl.querySelector('.ann-margin-head');
  var marginBrowseBtn= marginEl.querySelector('.ann-margin-index-btn');
  var nameInputMargin= marginEl.querySelector('.ann-name-margin');
  var marginBrowse = false;   // false = cards anchored beside prose; true = flat index
  var marginSettled = false;  // marks have had a beat to land (orphan partition gate)
  var orphansOpen = false;
  var markInfo = {};          // id -> {rank, chapter} read live from the DOM
  marginBrowseBtn.addEventListener('click', function(){
    marginBrowse = !marginBrowse;
    marginEl.classList.toggle('browse', marginBrowse);
    renderMargin();
  });

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

  // The marking popup mirrors the in-app SelectionPopup (redesign-reader.html):
  // a thin navy toolbar (Highlight · Note · Question) + an "Editorial" expander of
  // craft chips, and a paper note composer that replaces the bar once a note type
  // is chosen. Highlight saves on the tap; note/question/craft open the composer.
  var popup = document.createElement('div');
  popup.id = 'selection-popup';
  var chevron = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var toolHtml = '<div class="anntool">';
  ANN_PRIMARY.forEach(function(item){
    toolHtml += '<button type="button" class="anntool-btn" data-type="'+item.type+'">'+glyphSvg(ANN_GLYPHS[item.type])+item.label+'</button>';
  });
  toolHtml += '<span class="anntool-div" aria-hidden="true"></span>';
  toolHtml += '<button type="button" class="anntool-btn anntool-more" data-more="1" aria-expanded="false">Editorial'+chevron+'</button>';
  toolHtml += '</div>';
  var edHtml = '<div class="edrow" style="display:none">';
  ANN_EDITORIAL.forEach(function(item){
    edHtml += '<button type="button" class="edchip" data-type="'+item.type+'"><span class="edchip-dot" aria-hidden="true"></span>'+item.label+'</button>';
  });
  edHtml += '</div>';
  popup.innerHTML = toolHtml + edHtml +
    '<div class="composer" id="popup-composer" style="display:none">' +
      '<div class="composer-head" id="composer-head"></div>' +
      '<textarea class="composer-body" id="popup-textarea" rows="3"></textarea>' +
      '<div class="composer-foot"><span class="composer-anchor">Anchored to your selection</span>' +
        '<div class="composer-actions">' +
          '<button type="button" class="composer-cancel" id="popup-cancel">Cancel</button>' +
          '<button type="button" class="composer-save" id="popup-save">Save ⌘↵</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(popup);
  popup.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
  var anntoolEl   = popup.querySelector('.anntool');
  var edrowEl     = popup.querySelector('.edrow');
  var moreBtn     = popup.querySelector('.anntool-more');
  var composerEl  = popup.querySelector('#popup-composer');
  var composerHead= popup.querySelector('#composer-head');
  var noteTA      = popup.querySelector('#popup-textarea');

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
  var exportBtn  = side.querySelector('.ann-export');
  var footHint   = side.querySelector('.ann-foot-hint');
  if(SYNC_ENDPOINT){
    // Hosted share: notes stream to the author automatically, so the .json export is
    // a secondary "keep a copy" affordance, and the foot line shows live sync status.
    exportBtn.textContent = 'Download a copy (.json)';
    if(footHint) syncStatusEl = footHint;
    setSyncStatus('idle');
  }
  nameInput.value = readerName;
  if(nameInputMargin) nameInputMargin.value = readerName;
  function syncNameInputs(){
    // Only write a field whose value actually differs, so we never reset the caret of
    // the input the reader is actively typing in.
    if(nameInput.value !== readerName) nameInput.value = readerName;
    if(nameInputMargin && nameInputMargin.value !== readerName) nameInputMargin.value = readerName;
  }
  function onNameInput(val){
    // Keep the raw value (internal spaces let a reader type "First Last"); trim only
    // where the name is actually used. Trimming on every keystroke reset the field the
    // instant a space was typed, making a two-word name impossible.
    readerName = val; saveName();
    anns.forEach(function(a){ if(!a.readerName) a.readerName = readerName.trim() || null; });
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
    if(marginBrowseBtn) marginBrowseBtn.style.display = (anns.length && isDesktop()) ? '' : 'none';
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
  // Reset to the default view: the thin toolbar showing, the Editorial expander and
  // the composer both closed. Called on open and on close so the popup never reopens
  // mid-note.
  function resetPopupView(){
    anntoolEl.style.display = '';
    edrowEl.style.display = 'none';
    composerEl.style.display = 'none';
    popup.classList.remove('composing');
    moreBtn.classList.remove('open');
    moreBtn.setAttribute('aria-expanded','false');
    noteTA.value = '';
    pendingType = null;
  }
  function openComposer(type){
    pendingType = type;
    anntoolEl.style.display = 'none';
    edrowEl.style.display = 'none';
    composerEl.style.display = '';
    popup.classList.add('composing'); // phones: pin composer to top, clear of the keyboard
    composerHead.innerHTML = glyphSvg(ANN_GLYPHS[type]) + '<span>' + esc(menuLabelForType(type)) + '</span>';
    noteTA.placeholder = 'Add a ' + (ANN_LABELS[type] || type).toLowerCase() + '…';
    reposition();
    setTimeout(function(){ noteTA.focus(); },0);
  }
  function reposition(){
    if(!pendingRange) return;
    var r = pendingRange.getBoundingClientRect();
    var pw = popup.offsetWidth||300, ph = popup.offsetHeight||120;
    var left = r.left + r.width/2 - pw/2;
    var top  = r.top - ph - 10;
    left = Math.max(8, Math.min(left, window.innerWidth-pw-8));
    if(top < 60) top = r.bottom + 8;
    popup.style.left = left+'px'; popup.style.top = top+'px';
  }
  function showPopup(range){
    popup.classList.add('visible');
    resetPopupView();
    pendingQuote = quoteFromPending();
    reposition();
  }
  function hidePopup(){
    popup.classList.remove('visible');
    resetPopupView();
    pendingRange=null;
    pendingQuote='';
  }

  // Thin default: highlight saves on the tap; note/question open the composer.
  popup.querySelectorAll('.anntool-btn[data-type]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var type = btn.dataset.type;
      if(NOTE_TYPES[type]) openComposer(type); else commit(type, '');
    });
  });
  // Editorial expander: reveal the craft chips (no writing required per chip).
  moreBtn.addEventListener('click', function(e){
    e.stopPropagation();
    var open = edrowEl.style.display === 'none';
    edrowEl.style.display = open ? 'flex' : 'none';
    moreBtn.classList.toggle('open', open);
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    reposition();
  });
  popup.querySelectorAll('.edchip[data-type]').forEach(function(btn){
    btn.addEventListener('click', function(e){ e.stopPropagation(); openComposer(btn.dataset.type); });
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

  // ── Desktop margin column (anchored cascade + browse + orphans) ──────────────
  // Ported from the app's AnnMarginColumn: each card pins beside its <mark>, ordered
  // by the mark's live vertical position (robust to edits/renumbering), cascading so
  // cards never overlap. "All N ›" flattens them into a scrollable index; notes whose
  // passage the text no longer holds collect in a collapsed "Unlinked" section.
  var MARGIN_GAP = 16;
  var cardEls = {}; // id -> card element in the current render

  // The live chapter a mark sits in, read from the DOM. Chapter ids are positional
  // (ch-N: marker span → h1 → .chapter-block), so this stays correct after edits.
  function liveChapterOfMark(mark){
    var block = mark.closest ? mark.closest('.chapter-block') : null;
    if(!block) return null;
    var marker = block.previousElementSibling && block.previousElementSibling.previousElementSibling;
    var id = (marker && marker.id) || '';
    if(id.indexOf('ch-') !== 0) return null;
    var n = parseInt(id.slice(3),10);
    return isNaN(n) ? null : n;
  }
  function computeMarkInfo(){
    var next = {};
    var marks = contentEl.querySelectorAll('mark[data-ann]');
    for(var i=0;i<marks.length;i++){
      var id = marks[i].getAttribute('data-ann');
      if(id && !(id in next)) next[id] = { rank:i, chapter:liveChapterOfMark(marks[i]) };
    }
    markInfo = next;
  }
  // Order by the mark's live document position; anchored notes precede orphaned ones.
  function marginSorted(){
    return anns.slice().sort(function(a,b){
      var ra = markInfo[a.id] ? markInfo[a.id].rank : null;
      var rb = markInfo[b.id] ? markInfo[b.id].rank : null;
      if(ra != null && rb != null) return ra - rb;
      if(ra != null) return -1;
      if(rb != null) return 1;
      return (a.chapterIndex-b.chapterIndex)
        || (((a.anchor&&a.anchor.offset)||0)-((b.anchor&&b.anchor.offset)||0))
        || (a.createdAt-b.createdAt);
    });
  }
  function buildMarginCard(ann){
    var card = document.createElement('div');
    var isSel = selectedId === ann.id;
    var faded = selectedId != null && !isSel;
    card.className = 'ann-margin-card' + (isSel ? ' emph' : '') + (faded ? ' faded' : '');
    card.style.borderLeftColor = isSel ? 'var(--gold)' : (ANN_COLORS[ann.type] + '88');
    var liveCh = markInfo[ann.id] ? markInfo[ann.id].chapter : null;
    var chNum = (liveCh != null) ? liveCh : (ann.chapterTitle ? ann.chapterIndex : null);
    card.innerHTML =
      '<div class="ann-margin-tag">'+menuLabelForType(ann.type)+
        (chNum != null ? '<span class="ann-margin-chapter"> · Ch.&nbsp;'+String(chNum).padStart(2,'0')+'</span>' : '') +
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
    return card;
  }
  function renderMargin(){
    if(!isDesktop()) return;
    // Remove the last render's cards/orphans/empty, keeping the persistent head + name.
    var old = marginEl.querySelectorAll('.ann-margin-card, .ann-margin-orphans, .ann-margin-empty');
    for(var i=0;i<old.length;i++) old[i].parentNode.removeChild(old[i]);
    cardEls = {};
    marginEl.style.height = '';
    computeMarkInfo();
    var list = marginSorted();
    if(!list.length){
      var empty = document.createElement('div');
      empty.className = 'ann-margin-empty';
      empty.textContent = 'Select any passage to annotate.';
      marginEl.appendChild(empty);
      marginBrowseBtn.style.display = 'none';
      return;
    }
    marginBrowseBtn.textContent = marginBrowse ? 'Margin ›' : ('All ' + list.length + ' ›');
    marginBrowseBtn.style.display = '';
    var anchored = [], orphaned = [];
    list.forEach(function(ann){ (markInfo[ann.id] ? anchored : orphaned).push(ann); });
    (marginBrowse ? list : anchored).forEach(function(ann){
      var c = buildMarginCard(ann); cardEls[ann.id] = c; marginEl.appendChild(c);
    });
    if(!marginBrowse && orphaned.length){
      var sec = document.createElement('div');
      sec.className = 'ann-margin-orphans' + (orphansOpen ? ' open' : '');
      var head = document.createElement('button');
      head.type = 'button'; head.className = 'ann-margin-orphans-head';
      head.setAttribute('aria-expanded', orphansOpen ? 'true' : 'false');
      head.innerHTML = '<span class="ann-margin-orphans-title">Unlinked<span class="ann-margin-orphans-count">'+orphaned.length+'</span></span><span class="ann-margin-orphans-chevron" aria-hidden="true">'+(orphansOpen?'▾':'▸')+'</span>';
      head.addEventListener('click', function(){ orphansOpen = !orphansOpen; renderMargin(); });
      sec.appendChild(head);
      if(orphansOpen){ orphaned.forEach(function(ann){ sec.appendChild(buildMarginCard(ann)); }); }
      else { var hint = document.createElement('div'); hint.className='ann-margin-orphans-hint'; hint.textContent='Notes whose passage the current text no longer contains.'; sec.appendChild(hint); }
      marginEl.appendChild(sec);
    }
    if(!marginBrowse) layoutMargin();
  }
  // Place each anchored card beside its mark, cascading downward so none overlap. Cards
  // live in document space (absolute in a full-height container) so they scroll with
  // the prose; re-run only on reflow, never per-scroll.
  function layoutMargin(){
    if(marginBrowse || !isDesktop()) return;
    var cTop = marginEl.getBoundingClientRect().top;
    var items = [];
    anns.forEach(function(ann){
      var card = cardEls[ann.id];
      var mark = card ? contentEl.querySelector('mark[data-ann="'+ann.id+'"]') : null;
      if(card && mark) items.push({ card:card, markTop: mark.getBoundingClientRect().top - cTop });
    });
    items.sort(function(a,b){ return a.markTop - b.markTop; });
    var prevBottom = 0;
    items.forEach(function(it){
      var top = Math.max(it.markTop, prevBottom ? prevBottom + MARGIN_GAP : 0);
      it.card.style.top = Math.round(top) + 'px';
      prevBottom = top + it.card.offsetHeight;
    });
    marginEl.style.height = contentEl.offsetHeight + 'px';
  }

  function renderAll(){ renderSide(); renderMargin(); }

  var resizeTimer;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){ renderAll(); updateBadge(); }, 120);
  });

  renderAll();

  // The chunked reading-entrance reveals and web-font metrics can shift mark positions
  // a frame or two after render; re-cascade on any content reflow (coalesced into one
  // rAF), so freshly-placed cards track their marks instead of parking at stale tops.
  if(window.ResizeObserver){
    var layoutRaf = 0;
    var scheduleLayout = function(){ if(layoutRaf) cancelAnimationFrame(layoutRaf); layoutRaf = requestAnimationFrame(layoutMargin); };
    var ro = new ResizeObserver(scheduleLayout);
    ro.observe(contentEl);
  }

  var maxProgress = 0;
  function trackProgress(){ var docH=document.documentElement.scrollHeight-window.innerHeight; var p=docH>0?window.scrollY/docH:0; if(p>maxProgress) maxProgress=p; }
  window.addEventListener('scroll', trackProgress, {passive:true});
  trackProgress();

  // The one payload builder — used by both the .json download and the sync POST, so
  // the two paths can never drift. Stamps identity onto any bare annotations first.
  function buildPayload(){
    anns.forEach(function(a){ if(!a.readerName) a.readerName = readerName || null; if(!a.readerId) a.readerId = readerId; });
    var prog = Math.min(1, Math.max(0, maxProgress));
    return { readerId: readerId, readerName: readerName.trim() || null, manuscript: title,
             manuscriptVersionId: MS_VERSION,
             snapshotId: SHARE_SNAPSHOT_ID, snapshotLabel: SHARE_SNAPSHOT_LABEL,
             startedAt: startedAt, completedAt: prog>=0.985 ? Date.now() : null,
             exportedAt: Date.now(), progress: prog, annotations: anns };
  }

  // ── Optimistic sync to the hosted share (brief §3.2) ─────────────────────────
  // localStorage stays the reader's source of truth; the worker is a mirror. Every
  // change schedules a debounced POST; a failure leaves the status 'retry' and a slow
  // loop heals it. Entirely inert when the file isn't bound to a share (no endpoint).
  function setSyncStatus(s){
    SYNC_STATUS = s;
    if(!syncStatusEl) return;
    syncStatusEl.textContent =
      s==='synced'  ? 'Saved to the author' :
      s==='syncing' ? 'Saving…' :
      s==='queued'  ? 'Saving…' :
      s==='retry'   ? 'Couldn’t reach the author — will retry' :
                      'Your notes save to the author automatically';
  }
  function syncNow(){
    if(!SYNC_ENDPOINT || !anns.length) return;
    if(syncInFlight){ syncPending = true; return; }
    syncInFlight = true; setSyncStatus('syncing');
    var headers = { 'Content-Type':'application/json' };
    if(readerToken) headers['Authorization'] = 'Bearer ' + readerToken;
    fetch(SYNC_ENDPOINT.replace(/\\/+$/,'') + '/v1/shares/' + encodeURIComponent(SYNC_SHARE_ID) + '/sessions',
          { method:'POST', headers:headers, body:JSON.stringify(buildPayload()) })
      .then(function(res){ if(!res.ok) throw new Error('http '+res.status); return res.json(); })
      .then(function(out){
        if(out && out.readerToken){ readerToken = out.readerToken; try{ localStorage.setItem(RTOKEN_KEY, readerToken); }catch(e){} }
        syncInFlight = false; setSyncStatus('synced');
        if(syncPending){ syncPending = false; scheduleSync(); }
      })
      .catch(function(){ syncInFlight = false; setSyncStatus('retry'); });
  }
  function scheduleSync(){
    if(!SYNC_ENDPOINT) return;
    if(SYNC_STATUS==='synced' || SYNC_STATUS==='idle') setSyncStatus('queued');
    if(syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 1400);
  }
  if(SYNC_ENDPOINT){
    // Slow heal loop for transient outages, and a one-shot mirror on load so notes
    // made while the worker was unreachable eventually land.
    setInterval(function(){ if((SYNC_STATUS==='retry' || SYNC_STATUS==='queued') && !syncInFlight) syncNow(); }, 20000);
    if(anns.length) scheduleSync();
  }

  function doExport(){
    if(!anns.length) return;
    var payload = buildPayload();
    saveAnns();
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = SLUG + '-feedback.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); document.body.removeChild(a); },1000);
  }
  exportBtn.addEventListener('click', doExport);

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
