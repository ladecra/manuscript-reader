// ─── Shareable Reader HTML Export ─────────────────────────────────────────────
// Produces a fully self-contained .html file: a manuscript reader with an
// embedded markdown parser, reader runtime, theme toggle, chapter nav, and an
// optional annotation runtime (beta-reader mode) that exports feedback as JSON.
//
// The output has zero external dependencies beyond Google Fonts and requires no
// localStorage to render. Ported faithfully from the v0.9 prototype.

import { ANNOTATION_COLORS } from '../types';

export class ShareReaderBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareReaderBuildError';
  }
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

/** Annotation runtime injected when building in beta-reader mode. */
function buildAnnotationScript(): string {
  const nl = String.fromCharCode(10);
  // NB: this is a plain string (not a nested template literal) so the inner
  // backticks and ${...} are emitted verbatim into the exported file.
  return `
// ── Annotation tools (beta reader mode) ──────────────────────────────────────
{
  var SLUG = title.toLowerCase().replace(/[^a-z0-9]/g,'-').slice(0,30);
  var ANN_KEY  = 'shared_ann_' + SLUG;
  var NAME_KEY = 'shared_reader_name';
  var RID_KEY  = 'shared_reader_id';        // stable per-browser reader identity
  var START_KEY = 'shared_started_' + SLUG; // session start, per manuscript
  var ANN_TYPES  = ['highlight','note','bookmark','question','continuity','structural','pacing','voice'];
  var ANN_LABELS = {highlight:'Highlight',note:'Note',bookmark:'Bookmark',question:'Question',continuity:'Continuity',structural:'Structural',pacing:'Pacing',voice:'Voice / Tone'};
  var ANN_COLORS = ${JSON.stringify(ANNOTATION_COLORS)};
  var NOTE_TYPES = {note:1,question:1,continuity:1,structural:1,pacing:1,voice:1};

  var anns = [];
  try { anns = JSON.parse(localStorage.getItem(ANN_KEY)||'[]'); } catch(e){}
  var readerName = '';
  try { readerName = localStorage.getItem(NAME_KEY) || ''; } catch(e){}

  // Stable reader identity — generated once on first open and reused thereafter,
  // so the author can tell two beta readers apart even if both leave the name
  // field blank or type the same name. This is the key agreement analysis joins on.
  var readerId = '';
  try { readerId = localStorage.getItem(RID_KEY) || ''; } catch(e){}
  if(!readerId){ readerId = 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); try{ localStorage.setItem(RID_KEY, readerId); }catch(e){} }

  // Session start, captured the first time this manuscript is opened.
  var startedAt = 0;
  try { startedAt = parseInt(localStorage.getItem(START_KEY)||'0',10) || 0; } catch(e){}
  if(!startedAt){ startedAt = Date.now(); try{ localStorage.setItem(START_KEY, String(startedAt)); }catch(e){} }

  function saveAnns(){ try{ localStorage.setItem(ANN_KEY, JSON.stringify(anns)); }catch(e){} }
  function saveName(){ try{ localStorage.setItem(NAME_KEY, readerName); }catch(e){} }
  function annId(){ return 'a'+Date.now()+Math.random().toString(36).slice(2,6); }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Content version id of the manuscript this reader is reading. MUST stay
  // byte-for-byte identical to engine/manuscript/manuscriptVersion.ts so the id
  // stamped here matches what the app computes for the same source text — that's
  // what lets us later tell whether two readers reacted to the same draft.
  function versionId(str){
    var h1=0xdeadbeef, h2=0x41c6ce57;
    for(var i=0;i<str.length;i++){ var ch=str.charCodeAt(i); h1=Math.imul(h1^ch,2654435761); h2=Math.imul(h2^ch,1597334677); }
    h1=Math.imul(h1^(h1>>>16),2246822507); h1^=Math.imul(h2^(h2>>>13),3266489909);
    h2=Math.imul(h2^(h2>>>16),2246822507); h2^=Math.imul(h1^(h1>>>13),3266489909);
    var n=4294967296*(2097151&h2)+(h1>>>0);
    return 'v'+n.toString(36);
  }
  var MS_VERSION = versionId(md);

  var css = [
    'mark[data-ann]{background:rgba(217,172,60,.25);color:inherit;cursor:pointer;padding:1px 0}',
    'mark[data-ann].type-note{background:rgba(142,145,146,.22)}',
    'mark[data-ann].type-bookmark{background:rgba(99,102,241,.22)}',
    'mark[data-ann].type-question{background:rgba(239,100,97,.22)}',
    'mark[data-ann].type-continuity{background:rgba(52,211,153,.22)}',
    'mark[data-ann].type-structural{background:rgba(251,146,60,.22)}',
    'mark[data-ann].type-pacing{background:rgba(56,189,248,.22)}',
    'mark[data-ann].type-voice{background:rgba(192,132,252,.22)}',
    '.sp-popup{position:fixed;z-index:200;background:var(--surface);border:1px solid var(--border);display:none;flex-direction:column;min-width:230px;box-shadow:0 8px 32px rgba(0,0,0,.4)}',
    '.sp-popup.vis{display:flex}',
    '.sp-row{display:flex;border-bottom:1px solid var(--border)}',
    '.sp-row:last-child{border-bottom:none}',
    '.sp-btn{flex:1;display:flex;align-items:center;gap:7px;padding:10px 12px;background:none;border:none;border-right:1px solid var(--border);font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);cursor:pointer;white-space:nowrap;transition:color .15s,background .15s}',
    '.sp-btn:last-child{border-right:none}',
    '.sp-btn:hover{color:var(--primary);background:var(--surface-high)}',
    '.sp-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}',
    '.sp-note{padding:10px 12px;display:none;flex-direction:column;gap:8px}',
    '.sp-note.vis{display:flex}',
    '.sp-ta{width:100%;background:none;border:none;border-bottom:1px solid var(--border);font-family:"EB Garamond",Georgia,serif;font-size:15px;color:var(--primary);padding:4px 0;outline:none;resize:none;min-height:58px;line-height:1.5}',
    '.sp-ta:focus{border-bottom-color:var(--primary)}',
    '.sp-ta::placeholder{color:var(--dim);font-style:italic}',
    '.sp-save-row{display:flex;justify-content:space-between;align-items:center;gap:8px}',
    '.sp-cancel{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);background:none;border:none;cursor:pointer;padding:4px}',
    '.sp-cancel:hover{color:var(--muted)}',
    '.sp-do{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--primary);background:none;border:1px solid var(--primary);padding:5px 12px;cursor:pointer;transition:background .2s,color .2s}',
    '.sp-do:hover{background:var(--primary);color:var(--bg)}',
    '.sp-edit{position:fixed;z-index:201;background:var(--surface);border:1px solid var(--border);width:min(320px,90vw);padding:14px 16px;display:none;flex-direction:column;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,.4)}',
    '.sp-edit.vis{display:flex}',
    '.sp-edit-label{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}',
    '.sp-edit-actions{display:flex;justify-content:space-between;align-items:center}',
    '.sp-del{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--border);background:none;border:none;cursor:pointer;padding:4px}',
    '.sp-del:hover{color:#c0392b}',
    '.ann-side{position:fixed;top:var(--topbar-h);right:0;width:min(340px,92vw);height:calc(100dvh - var(--topbar-h));background:var(--bg);border-left:1px solid var(--border);display:flex;flex-direction:column;z-index:90;transform:translateX(100%);transition:transform .32s var(--ease-expo),background .35s,border-color .35s}',
    '.ann-side.open{transform:translateX(0)}',
    '.ann-side.topbar-hidden{top:0;height:100dvh}',
    '.ann-side-head{padding:16px 20px 0;border-bottom:1px solid var(--border);flex-shrink:0}',
    '.ann-side-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}',
    '.ann-side-title{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}',
    '.ann-side-x{background:none;border:none;cursor:pointer;color:var(--dim);padding:2px;display:flex;align-items:center}',
    '.ann-side-x:hover{color:var(--primary)}.ann-side-x svg{width:14px;height:14px}',
    '.ann-name{width:100%;background:none;border:1px solid var(--border);font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;letter-spacing:.04em;color:var(--on-surface);padding:7px 9px;outline:none;margin-bottom:12px;transition:border-color .2s}',
    '.ann-name:focus{border-color:var(--primary)}',
    '.ann-name::placeholder{color:var(--dim)}',
    '.ann-tabs{display:flex;margin:0 -20px;overflow-x:auto;scrollbar-width:none}',
    '.ann-tabs::-webkit-scrollbar{display:none}',
    '.ann-tab{flex-shrink:0;padding:10px 14px;background:none;border:none;border-bottom:2px solid transparent;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);cursor:pointer;transition:color .15s,border-color .15s}',
    '.ann-tab.active{color:var(--primary);border-bottom-color:var(--primary)}',
    '.ann-tab:hover{color:var(--muted)}',
    '.ann-list{flex:1;overflow-y:auto;scrollbar-width:thin}',
    '.ann-empty{padding:44px 20px;text-align:center;font-family:"EB Garamond",Georgia,serif;font-size:16px;color:var(--dim);line-height:1.6}',
    '.ann-item{padding:14px 20px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s}',
    '.ann-item:hover{background:var(--surface)}',
    '.ann-ihead{display:flex;align-items:center;gap:8px;margin-bottom:7px}',
    '.ann-idot{width:7px;height:7px;border-radius:50%;flex-shrink:0}',
    '.ann-ilabel{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);flex:1}',
    '.ann-iloc{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;color:var(--border);letter-spacing:.06em}',
    '.ann-ix{background:none;border:none;cursor:pointer;color:var(--border);padding:2px;display:flex;align-items:center}',
    '.ann-ix:hover{color:var(--dim)}.ann-ix svg{width:13px;height:13px}',
    '.ann-quote{font-family:"EB Garamond",Georgia,serif;font-size:14px;font-style:italic;color:var(--muted);line-height:1.5;margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.ann-note-text{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;color:var(--on-surface);line-height:1.55}',
    '.ann-side-foot{padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0}',
    '.ann-export{width:100%;padding:11px;background:none;border:1px solid var(--primary);font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--primary);cursor:pointer;transition:background .2s,color .2s}',
    '.ann-export:hover{background:var(--primary);color:var(--bg)}',
    '.ann-export:disabled{opacity:.4;cursor:default}',
    '.ann-foot-hint{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:9px;letter-spacing:.04em;color:var(--dim);text-align:center;margin-top:9px;opacity:.85;line-height:1.5}',
    '.ann-badge{display:inline-block;width:6px;height:6px;border-radius:50%;background:#d9ac3c;margin-left:5px;vertical-align:middle;opacity:0;transition:opacity .3s}',
    '.ann-badge.vis{opacity:1}',
    '.ann-hint{position:fixed;top:calc(var(--topbar-h) + 8px);left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--border);font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.05em;color:var(--dim);padding:7px 16px;z-index:79;white-space:nowrap;pointer-events:none;opacity:1;transition:opacity 1s}',
    '.ann-hint.fade{opacity:0}'
  ].join(${JSON.stringify(nl)});
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var tgl = document.createElement('button');
  tgl.className = 'icon-btn';
  tgl.setAttribute('aria-label','Annotations');
  tgl.innerHTML = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"><path d="M3 3h12v10H9l-4 3V13H3z"/><line x1="6" y1="7" x2="12" y2="7"/><line x1="6" y1="10" x2="10" y2="10"/></svg>';
  var badge = document.createElement('span');
  badge.className = 'ann-badge';
  tgl.appendChild(badge);
  var tbRight = document.getElementById('topbar-right');
  tbRight.insertBefore(tgl, tbRight.firstChild);

  var popup = document.createElement('div');
  popup.className = 'sp-popup';
  var rowsHtml = '';
  for (var ri=0; ri<2; ri++) {
    rowsHtml += '<div class="sp-row">';
    for (var ci=0; ci<3; ci++) {
      var tp = ANN_TYPES[ri*3+ci];
      rowsHtml += '<button class="sp-btn" data-type="'+tp+'"><span class="sp-dot" style="background:'+ANN_COLORS[tp]+'"></span>'+ANN_LABELS[tp]+'</button>';
    }
    rowsHtml += '</div>';
  }
  rowsHtml += '<div class="sp-note"><textarea class="sp-ta" placeholder="Add a note…" rows="3"></textarea><div class="sp-save-row"><button class="sp-cancel">Cancel</button><button class="sp-do">Save</button></div></div>';
  popup.innerHTML = rowsHtml;
  document.body.appendChild(popup);
  var noteRow = popup.querySelector('.sp-note');
  var noteTA  = popup.querySelector('.sp-ta');

  var editPop = document.createElement('div');
  editPop.className = 'sp-edit';
  editPop.innerHTML = '<span class="sp-edit-label">Note</span><textarea class="sp-ta" rows="3"></textarea><div class="sp-edit-actions"><button class="sp-del">Remove</button><button class="sp-do sp-edit-save">Save</button></div>';
  document.body.appendChild(editPop);
  var editLabel = editPop.querySelector('.sp-edit-label');
  var editTA    = editPop.querySelector('.sp-ta');

  var side = document.createElement('aside');
  side.className = 'ann-side';
  var tabsHtml = '<button class="ann-tab active" data-filter="all">All</button>';
  var PLURAL = {highlight:1,bookmark:1,note:1,question:1}; // others read fine unsuffixed
  ANN_TYPES.forEach(function(t){ tabsHtml += '<button class="ann-tab" data-filter="'+t+'">'+ANN_LABELS[t]+(PLURAL[t]?'s':'')+'</button>'; });
  side.innerHTML =
    '<div class="ann-side-head">' +
      '<div class="ann-side-title-row"><span class="ann-side-title">Your annotations</span>' +
        '<button class="ann-side-x" aria-label="Close"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg></button>' +
      '</div>' +
      '<input class="ann-name" type="text" placeholder="Your name (so the author knows whose notes these are)" autocomplete="name">' +
      '<div class="ann-tabs">' + tabsHtml + '</div>' +
    '</div>' +
    '<div class="ann-list"></div>' +
    '<div class="ann-side-foot"><button class="ann-export">Export feedback (.json)</button><div class="ann-foot-hint">Send this file back to the author to import your notes.</div></div>';
  document.body.appendChild(side);
  var sideList   = side.querySelector('.ann-list');
  var nameInput  = side.querySelector('.ann-name');
  var exportBtn  = side.querySelector('.ann-export');
  var sideTabsState = 'all';
  nameInput.value = readerName;

  var hint = document.createElement('div');
  hint.className = 'ann-hint';
  hint.textContent = 'Select any passage to annotate · open the panel to review & export';
  document.body.appendChild(hint);
  var hintFaded = false;
  function fadeHint(){ if(hintFaded) return; hintFaded=true; hint.classList.add('fade'); setTimeout(function(){ hint.style.display='none'; },1100); }
  setTimeout(fadeHint, 12000);

  function updateBadge(){ badge.classList.toggle('vis', anns.length>0); exportBtn.disabled = anns.length===0; }

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

  // ── Durable anchor capture ───────────────────────────────────────────────────
  // Mirrors the app's engine/annotations/anchor.ts (buildAnchor) and ReaderScreen
  // (chapterBlockFor/offsetInContainer) EXACTLY, in the same rendered-text domain:
  // the chapter-block's textContent. Because the shared reader renders the same
  // combinedMarkdown into the same ch-N / .chapter-block structure, an anchor
  // captured here re-resolves through the app's locateAnchor on import — so beta
  // marks land precisely (duplicate-proof, reorder-proof) instead of via a
  // fragile quote-only first-match. 40 = engine ANCHOR_CONTEXT.
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
    mark.addEventListener('click', function(e){ e.stopPropagation(); openEdit(mark.dataset.ann, mark); });
  }

  anns.forEach(function(ann){ if(ann.quote) wrapMark(contentEl, ann.quote, ann.id, ann.type); });
  updateBadge();

  var pendingRange = null, pendingType = null;
  document.addEventListener('mouseup', handleSel);
  document.addEventListener('touchend', handleSel);
  function handleSel(e){
    if(popup.contains(e.target) || editPop.contains(e.target) || side.contains(e.target)) return;
    setTimeout(function(){
      var sel = window.getSelection();
      var txt = sel ? sel.toString().trim() : '';
      if(txt.length>3 && contentEl.contains(sel.anchorNode)){
        pendingRange = sel.getRangeAt(0).cloneRange();
        showPopup(pendingRange);
      } else { hidePopup(); }
    },10);
  }
  function showPopup(range){
    var r = range.getBoundingClientRect();
    popup.classList.add('vis');
    noteRow.classList.remove('vis');
    noteTA.value = ''; pendingType = null;
    var pw = popup.offsetWidth||230, ph = popup.offsetHeight||90;
    var left = r.left + r.width/2 - pw/2;
    var top  = r.top - ph - 10;
    left = Math.max(8, Math.min(left, window.innerWidth-pw-8));
    if(top < 60) top = r.bottom + 8;
    popup.style.left = left+'px'; popup.style.top = top+'px';
  }
  function hidePopup(){ popup.classList.remove('vis'); noteRow.classList.remove('vis'); noteTA.value=''; pendingRange=null; pendingType=null; }

  popup.querySelectorAll('.sp-btn').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var type = btn.dataset.type;
      if(NOTE_TYPES[type]){
        pendingType = type;
        noteRow.classList.add('vis');
        setTimeout(function(){ noteTA.focus(); },0);
      } else {
        commit(type, '');
      }
    });
  });
  popup.querySelector('.sp-cancel').addEventListener('click', function(e){ e.stopPropagation(); hidePopup(); });
  popup.querySelector('.sp-do').addEventListener('click', function(e){ e.stopPropagation(); if(pendingType) commit(pendingType, noteTA.value.trim()); });
  noteTA.addEventListener('keydown', function(e){
    if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){ e.preventDefault(); if(pendingType) commit(pendingType, noteTA.value.trim()); }
    if(e.key==='Escape') hidePopup();
  });

  function commit(type, note){
    var sel = window.getSelection();
    var txt = sel ? sel.toString().trim() : '';
    var ch  = chapterForRange(pendingRange);
    var quote = txt.slice(0,400);
    // Build the anchor from the current rendered text BEFORE inserting the mark,
    // so the new <mark> doesn't perturb the offset math (matches the app).
    var anchor = buildAnchorFor(pendingRange, ch.id, quote);
    var ann = {id:annId(), type:type, quote:quote, note:note,
               chapterTitle:ch.title, chapterIndex:ch.index, createdAt:Date.now(),
               readerName: readerName || null, readerId: readerId, anchor: anchor};
    anns.push(ann); saveAnns(); updateBadge(); fadeHint();
    if(pendingRange && txt){
      try {
        var mark = document.createElement('mark');
        mark.dataset.ann = ann.id; mark.className = 'type-'+type;
        pendingRange.surroundContents(mark);
        attachMark(mark);
      } catch(err){ wrapMark(contentEl, txt.slice(0,60), ann.id, type); }
    }
    if(window.getSelection) window.getSelection().removeAllRanges();
    hidePopup();
    renderSide();
    if(!readerName && !nudgedName){ nudgedName = true; openSide(); setTimeout(function(){ nameInput.focus(); },360); }
  }

  var editingId = null;
  var nudgedName = false;
  function openEdit(id, anchor){
    var ann = anns.find(function(a){ return a.id===id; });
    if(!ann) return;
    editingId = id;
    editLabel.textContent = ANN_LABELS[ann.type] || ann.type;
    editTA.value = ann.note || '';
    editPop.classList.add('vis');
    var rect = anchor.getBoundingClientRect();
    var left = Math.max(8, Math.min(rect.left, window.innerWidth-320-8));
    var top  = rect.bottom + 8;
    if(top + 150 > window.innerHeight) top = Math.max(8, rect.top - 150);
    editPop.style.left = left+'px'; editPop.style.top = top+'px';
    setTimeout(function(){ editTA.focus(); },50);
  }
  function hideEdit(){ editPop.classList.remove('vis'); editingId = null; }
  editPop.querySelector('.sp-edit-save').addEventListener('click', function(){
    if(!editingId) return;
    var ann = anns.find(function(a){ return a.id===editingId; });
    if(ann){ ann.note = editTA.value.trim(); saveAnns(); renderSide(); }
    hideEdit();
  });
  editPop.querySelector('.sp-del').addEventListener('click', function(){
    if(!editingId) return;
    removeAnn(editingId); hideEdit();
  });
  editTA.addEventListener('keydown', function(e){
    if(e.key==='Enter' && (e.metaKey||e.ctrlKey)) editPop.querySelector('.sp-edit-save').click();
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
    updateBadge(); renderSide();
  }

  function openSide(){ side.classList.add('open'); tgl.classList.add('active-btn'); renderSide(); }
  function closeSide(){ side.classList.remove('open'); tgl.classList.remove('active-btn'); }
  tgl.addEventListener('click', function(){ side.classList.contains('open') ? closeSide() : openSide(); });
  side.querySelector('.ann-side-x').addEventListener('click', closeSide);
  side.querySelectorAll('.ann-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      side.querySelectorAll('.ann-tab').forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active'); sideTabsState = tab.dataset.filter; renderSide();
    });
  });
  nameInput.addEventListener('input', function(){
    readerName = nameInput.value.trim(); saveName();
    anns.forEach(function(a){ if(!a.readerName) a.readerName = readerName || null; });
    saveAnns();
  });

  function renderSide(){
    var filtered = sideTabsState==='all' ? anns.slice() : anns.filter(function(a){ return a.type===sideTabsState; });
    filtered.sort(function(a,b){ return (a.chapterIndex-b.chapterIndex) || (a.createdAt-b.createdAt); });
    sideList.innerHTML = '';
    if(!filtered.length){
      var empty = document.createElement('div');
      empty.className = 'ann-empty';
      empty.textContent = anns.length===0 ? 'Select any passage to annotate.' : 'No annotations of this type.';
      sideList.appendChild(empty);
      return;
    }
    filtered.forEach(function(ann){
      var item = document.createElement('div');
      item.className = 'ann-item';
      var loc = ann.chapterTitle ? 'Ch. '+String(ann.chapterIndex).padStart(2,'0') : '';
      item.innerHTML =
        '<div class="ann-ihead">' +
          '<span class="ann-idot" style="background:'+ANN_COLORS[ann.type]+'"></span>' +
          '<span class="ann-ilabel">'+ANN_LABELS[ann.type]+'</span>' +
          '<span class="ann-iloc">'+loc+'</span>' +
          '<button class="ann-ix" aria-label="Remove"><svg viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"><line x1="1" y1="1" x2="12" y2="12"/><line x1="12" y1="1" x2="1" y2="12"/></svg></button>' +
        '</div>' +
        (ann.quote ? '<div class="ann-quote">"'+esc(ann.quote)+'"</div>' : '') +
        (ann.note ? '<div class="ann-note-text">'+esc(ann.note)+'</div>' : '');
      item.querySelector('.ann-ix').addEventListener('click', function(e){ e.stopPropagation(); removeAnn(ann.id); });
      item.addEventListener('click', function(){
        var mark = contentEl.querySelector('mark[data-ann="'+ann.id+'"]');
        if(mark){ closeSide(); setTimeout(function(){ mark.scrollIntoView({behavior:'smooth',block:'center'}); },300); }
      });
      sideList.appendChild(item);
    });
  }
  renderSide();

  // Track how far the reader got — the *furthest* point reached, not the current
  // scroll, so reviewing earlier passages before exporting doesn't undercount.
  var maxProgress = 0;
  function trackProgress(){ var docH=document.documentElement.scrollHeight-window.innerHeight; var p=docH>0?window.scrollY/docH:0; if(p>maxProgress) maxProgress=p; }
  window.addEventListener('scroll', trackProgress, {passive:true});
  trackProgress();

  exportBtn.addEventListener('click', function(){
    if(!anns.length) return;
    anns.forEach(function(a){ if(!a.readerName) a.readerName = readerName || null; if(!a.readerId) a.readerId = readerId; });
    saveAnns();
    var prog = Math.min(1, Math.max(0, maxProgress));
    var payload = { readerId: readerId, readerName: readerName || null, manuscript: title,
                    manuscriptVersionId: MS_VERSION,
                    startedAt: startedAt, completedAt: prog>=0.985 ? Date.now() : null,
                    exportedAt: Date.now(), progress: prog, annotations: anns };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = SLUG + '-feedback.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); document.body.removeChild(a); },1000);
  });

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

/**
 * Build a self-contained shareable reader HTML document.
 * @param withAnnotations  When true, embeds the beta-reader annotation runtime.
 */
export function buildShareableHTML(title: string, markdown: string, withAnnotations = false): string {
  const mdJson = JSON.stringify(markdown);
  const titleJson = JSON.stringify(title);
  const annotationScript = withAnnotations ? buildAnnotationScript() : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${escHtml(title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap');

@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;1,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#16150f;--surface:#1e1c16;--surface-high:#2a2720;--paper:#16150f;--primary:#f7f4ec;--on-surface:#e6e1d4;--muted:#b6b1a3;--dim:#8a857a;--border:#3a362d;--brand:#c9a14a;--drop-cap:#f7f4ec;--max-w:680px;--margin:clamp(22px,5vw,64px);--topbar-h:52px;--safe-bottom:env(safe-area-inset-bottom,0px);--ease-expo:cubic-bezier(0.16,1,0.3,1);--ease-std:cubic-bezier(0.4,0,0.2,1)}
:root.light{--bg:#faf9f6;--surface:#ffffff;--surface-high:#f1eee8;--paper:#fbfaf7;--primary:#1b1a17;--on-surface:#2c2a26;--muted:#6b6760;--dim:#a09b90;--border:#e8e4db;--brand:#1b1a17;--drop-cap:#1b1a17}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--on-surface);font-family:'EB Garamond',Georgia,serif;-webkit-font-smoothing:antialiased;min-height:100dvh;transition:background .35s,color .35s}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--border)}
#topbar{position:fixed;top:0;left:0;right:0;height:var(--topbar-h);background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 var(--margin);z-index:100;transition:transform .4s var(--ease-expo),background .35s,border-color .35s}
#topbar.hidden{transform:translateY(-110%);pointer-events:none}
#topbar-title{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw}
#topbar-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
.icon-btn{background:none;border:none;cursor:pointer;color:var(--dim);padding:6px;display:flex;align-items:center;justify-content:center;transition:color .2s;-webkit-tap-highlight-color:transparent}
.icon-btn:hover,.icon-btn:active,.icon-btn.active-btn{color:var(--primary)}
.icon-btn svg{width:17px;height:17px;display:block}
#topbar-chapter{font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;color:var(--border);letter-spacing:.06em;white-space:nowrap}
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
.chapter-marker{display:block;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin-top:88px;margin-bottom:14px;scroll-margin-top:calc(var(--topbar-h) + 24px)}
.chapter-marker:first-child{margin-top:0}
#content h1{font-family:'EB Garamond',Georgia,serif;font-size:clamp(26px,5vw,42px);font-weight:400;line-height:1.18;letter-spacing:-.01em;color:var(--primary);margin-bottom:36px;scroll-margin-top:calc(var(--topbar-h) + 8px)}
#content h2{font-family:'EB Garamond',Georgia,serif;font-size:clamp(19px,3.5vw,26px);font-weight:400;line-height:1.3;color:var(--primary);margin-top:52px;margin-bottom:8px}
#content h3{font-family:'EB Garamond',Georgia,serif;font-size:19px;font-weight:500;color:var(--muted);margin-top:36px;margin-bottom:6px}
#content p,#content blockquote,#content ul,#content ol{opacity:0;transform:translateY(16px);transition:opacity .7s var(--ease-expo),transform .7s var(--ease-expo)}
#content p.visible,#content blockquote.visible,#content ul.visible,#content ol.visible{opacity:1;transform:translateY(0)}
#content p{font-size:19px;line-height:1.78;color:var(--on-surface);margin-bottom:1.4em}
.chapter-block>p:first-of-type::first-letter{font-size:3.8em;line-height:.8;float:left;margin-right:5px;margin-top:5px;color:var(--drop-cap);font-weight:400}
#content em{font-style:italic}
#content strong{font-weight:500;color:var(--primary)}
#content blockquote{border-left:1px solid var(--border);margin:36px 0;padding:0 0 0 24px;font-style:italic;color:var(--muted);font-size:19px;line-height:1.78}
#content hr{border:none;text-align:center;margin:60px 0;color:var(--border);letter-spacing:.6em;font-size:18px;opacity:1!important;transform:none!important}
#content hr::before{content:'· · ·'}
#content ul,#content ol{margin:0 0 1.4em;padding-left:0;list-style:none}
#content li{font-size:19px;line-height:1.78;color:var(--on-surface);padding:3px 0 3px 26px;position:relative}
#content ul li::before{content:'—';position:absolute;left:0;color:var(--border)}
#content ol{counter-reset:ol-c}
#content ol li{counter-increment:ol-c}
#content ol li::before{content:counter(ol-c,decimal-leading-zero);position:absolute;left:0;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;color:var(--dim);top:9px}
#end-mark{text-align:center;margin-top:96px;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--border);opacity:.4}
#bottom-strip{position:fixed;bottom:calc(24px + var(--safe-bottom));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;background:var(--surface);border:1px solid var(--border);padding:8px 18px;font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:11px;color:var(--dim);letter-spacing:.05em;opacity:0;transition:opacity .5s;white-space:nowrap;pointer-events:none;z-index:80}
#bottom-strip.visible{opacity:1}
#bottom-strip .sep{width:1px;height:9px;background:var(--border)}
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
<div id="screen-reader"><div id="content"></div><div id="end-mark">End of manuscript</div></div>
<div id="bottom-strip"><span id="pct-read">0%</span><span class="sep"></span><span id="time-left">—</span><span class="sep"></span><span id="clock-time">—</span></div>
<div id="shared-badge">Shared reader</div>
<script>
(function(){
'use strict';
const THEME_KEY='ms_theme';
const md=${mdJson};
const title=${titleJson};

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
export function exportShareableReader(title: string, markdown: string, withAnnotations: boolean): void {
  const html = buildShareableHTML(title, markdown, withAnnotations);
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
