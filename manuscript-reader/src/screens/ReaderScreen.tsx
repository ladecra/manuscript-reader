import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { AnnotationType, TextAnchor, Chapter, ChangeEntry } from '../engine/types';
import { buildAnchor, locateAnchor, anchorFromQuote } from '../engine/annotations/anchor';
import { buildChangeList } from '../engine/manuscript/changeList';
import { resolveAnnotationChapters } from '../engine/annotations/chapterResolve';
import { applyBlockEdit, htmlToMarkdownBlocks, sameProse, serializeContentDomToMarkdown } from '../engine/manuscript/blockEdit';
import { matchMarkdownBlockPrefix } from '../engine/manuscript/editMarkdownShortcut';
import { applyMarkdownPromoteInBlock, lineTextBeforeCaretInChapterBlock } from '../lib/readerEditDom';
import { useReaderStore } from '../state/readerStore';
import { useUIStore } from '../state/uiStore';
import { useLibraryStore } from '../state/libraryStore';
import { parseMarkdown } from '../engine/ingestion/parseMarkdown';
import { chapterForOffset } from '../engine/manuscript/chapterForOffset';
import { ChapterNav } from '../components/reader/ChapterNav';
import { AnnotationSidebar } from '../components/reader/AnnotationSidebar';
import { SelectionPopup } from '../components/reader/SelectionPopup';
import { AddChaptersModal } from '../components/reader/AddChaptersModal';
import { ChapterEditor } from '../components/reader/ChapterEditor';
import { AnnMarginColumn } from '../components/reader/AnnMarginColumn';
import { ChangesMarginColumn } from '../components/reader/ChangesMarginColumn';
import { showToast } from '../components/ui/Toast';
import { usesTouchFriendlyEditing } from '../lib/touchEditing';

function wrapTextInMark(container: HTMLElement, text: string, id: string, type: AnnotationType) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const search = text.slice(0, 60);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const idx = node.nodeValue?.indexOf(search) ?? -1;
    if (idx !== -1) {
      const end = Math.min(idx + text.length, node.nodeValue!.length);
      const mark = document.createElement('mark');
      mark.dataset.ann = id; mark.className = 'type-' + type;
      mark.textContent = node.nodeValue!.slice(idx, end);
      const frag = document.createDocumentFragment();
      if (idx > 0) frag.appendChild(document.createTextNode(node.nodeValue!.slice(0, idx)));
      frag.appendChild(mark);
      if (end < node.nodeValue!.length) frag.appendChild(document.createTextNode(node.nodeValue!.slice(end)));
      node.parentNode?.replaceChild(frag, node);
      return mark;
    }
  }
  return null;
}

// Map a [start, end) offset within a container's rendered text to a DOM Range,
// walking text nodes and accumulating lengths. Returns null if out of range.
function textOffsetToRange(container: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0;
  let startSet = false;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.nodeValue!.length;
    if (!startSet && start < pos + len) { range.setStart(node, start - pos); startSet = true; }
    if (startSet && end <= pos + len) { range.setEnd(node, end - pos); return range; }
    pos += len;
  }
  return null;
}

// Re-locate an annotation by its durable anchor against the container's current
// rendered text, then wrap the resolved span in a <mark>. Falls back to the
// legacy text-node search when the resolved range crosses element boundaries
// (surroundContents throws). Returns the mark, or null if orphaned.
// The `.chapter-block` element holding a chapter's body, by its durable id (the
// parser emits `<span id="ch-N">`, then the heading, then `<div class="chapter-block">`).
// Returns null for forematter or a chapter that no longer exists.
function chapterBlockFor(container: HTMLElement, chapterId: string): HTMLElement | null {
  const marker = container.querySelector(`#${CSS.escape(chapterId)}`);
  let el = marker?.nextElementSibling ?? null;
  while (el && !el.classList.contains('chapter-block')) el = el.nextElementSibling;
  return (el as HTMLElement) ?? null;
}

function markInRoot(root: HTMLElement, anchor: TextAnchor, id: string, type: AnnotationType): HTMLElement | null {
  const full = root.textContent ?? '';
  const loc = locateAnchor(full, anchor);
  if (loc && loc.end > loc.start) {
    const range = textOffsetToRange(root, loc.start, loc.end);
    if (range) {
      try {
        const mark = document.createElement('mark');
        mark.dataset.ann = id; mark.className = 'type-' + type;
        if (loc.confidence !== 'exact') mark.dataset.anchorConf = loc.confidence;
        range.surroundContents(mark);
        return mark;
      } catch { /* range spans elements — fall through to legacy wrap */ }
    }
  }
  return wrapTextInMark(root, anchor.quote, id, type);
}

function markByAnchor(container: HTMLElement, anchor: TextAnchor, id: string, type: AnnotationType): HTMLElement | null {
  // Resolve within the anchored chapter first (precise, disambiguates duplicate
  // quotes). But a chapter can be split or renumbered by an edit — promoting body
  // text to a new `# ` heading moves the quoted passage into a *different* chapter
  // block while the annotation still points at the old chapterId. So when the
  // scoped search comes up empty, fall back to the whole manuscript rather than
  // orphaning the mark (which would pile every stale annotation at the column top).
  const scope = anchor.chapterId ? chapterBlockFor(container, anchor.chapterId) : null;
  if (scope) {
    const inScope = markInRoot(scope, anchor, id, type);
    if (inScope) return inScope;
  }
  return markInRoot(container, anchor, id, type);
}

// Character offset of a Range's start within a container's rendered text.
function offsetInContainer(container: HTMLElement, range: Range): number {
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

// Per-chapter snapshot of innerHTML at focus time, so a commit can tell a real
// edit from a focus-through and skip needless re-renders.
const editOriginalHtml = new WeakMap<HTMLElement, string>();

const EDITABLE_LEAF_SELECTOR = 'p, blockquote, h2, h3, h4, li';

// Walk text nodes from root to targetNode+offset, counting characters.
// Used to map a tap location into a chapter-relative char offset so ChapterEditor
// can restore cursor position in TipTap after mount.
function getTextOffset(root: Node, targetNode: Node, targetOffset: number): number {
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === targetNode) return count + targetOffset;
    count += node.textContent?.length ?? 0;
  }
  return count;
}

// The chapter-relative character offset at a viewport point. Coordinate-based
// (caretRangeFromPoint / caretPositionFromPoint) so it works even where tapping
// non-editable text places no selection (e.g. iOS Safari); falls back to the live
// selection. Returns undefined if the point resolves outside the block.
function charOffsetAtPoint(block: HTMLElement, x: number, y: number): number | undefined {
  let container: Node | null = null;
  let offset = 0;
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) { container = r.startContainer; offset = r.startOffset; }
  } else if (typeof doc.caretPositionFromPoint === 'function') {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) { container = p.offsetNode; offset = p.offset; }
  }
  if (!container || !block.contains(container)) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (block.contains(r.startContainer)) { container = r.startContainer; offset = r.startOffset; }
    }
  }
  if (!container || !block.contains(container)) return undefined;
  return getTextOffset(block, container, offset);
}

function stabilizeCaretInLeaf(leaf: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const r = sel.getRangeAt(0);
  if (!leaf.contains(r.commonAncestorContainer)) return;
  if (!r.collapsed) {
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

function stripAnnotationMarks(container: HTMLElement) {
  container.querySelectorAll('mark[data-ann]').forEach(mark => {
    const parent = mark.parentNode!;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    (parent as Element).normalize?.();
  });
}

// ── Changes mode: mark edited passages in the prose (Phase 8) ──
// Parallel to the annotation marks, but keyed on the Edit log. An edit anchors in
// the source-markdown domain; we locate the RENDERED text of its replacement (via
// editRenderedNeedle) within the edit's chapter and wrap it. Annotation marks and
// change marks never coexist in the DOM — the reader swaps one set for the other
// on mode change — so there's no overlap/nesting conflict between them.
function stripChangeMarks(container: HTMLElement) {
  container.querySelectorAll('mark[data-edit]').forEach(mark => {
    const parent = mark.parentNode!;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    (parent as Element).normalize?.();
  });
}

function markChangeInRoot(root: HTMLElement, anchor: TextAnchor, id: string): HTMLElement | null {
  const full = root.textContent ?? '';
  const loc = locateAnchor(full, anchor);
  if (loc && loc.end > loc.start) {
    const range = textOffsetToRange(root, loc.start, loc.end);
    if (range) {
      try {
        const mark = document.createElement('mark');
        mark.dataset.edit = id; mark.className = 'change-mark';
        range.surroundContents(mark);
        return mark;
      } catch { /* range spans elements — leave unmarked (still listed in the margin) */ }
    }
  }
  return null;
}

function markChangeByAnchor(container: HTMLElement, entry: ChangeEntry): HTMLElement | null {
  const needle = entry.current; // already rendered text (see buildChangeList)
  if (!needle) return null;
  const scope = entry.chapterId ? chapterBlockFor(container, entry.chapterId) : null;
  const roots = scope ? [scope, container] : [container];
  // Try the full passage first, then a leading slice — a long replacement may not
  // survive verbatim (further edits since), but its opening usually does.
  for (const probe of [needle, needle.slice(0, 80), needle.slice(0, 40)]) {
    if (probe.length < 8) break;
    const anchor: TextAnchor = { ...anchorFromQuote(probe), chapterId: entry.chapterId };
    for (const root of roots) {
      const mark = markChangeInRoot(root, anchor, entry.id);
      if (mark) return mark;
    }
  }
  return null; // unlocatable — still listed in the margin
}

// Desktop: whole `.chapter-block` is contentEditable (structural edits). Touch:
// each prose block leaf is editable; chapter commit is deferred (see focus handlers).
function setupEditable(container: HTMLElement, on: boolean) {
  const touch = on && usesTouchFriendlyEditing();
  container.classList.toggle('edit-mode', on);
  container.classList.toggle('edit-mode-touch', touch);
  container.querySelectorAll<HTMLElement>('.chapter-block').forEach(block => {
    block.querySelectorAll<HTMLElement>(EDITABLE_LEAF_SELECTOR).forEach(el => {
      el.removeAttribute('contenteditable');
      el.removeAttribute('autocorrect');
      el.removeAttribute('autocapitalize');
      el.removeAttribute('spellcheck');
    });
    if (!on) {
      block.removeAttribute('contenteditable');
      return;
    }
    if (touch) {
      block.removeAttribute('contenteditable');
      block.querySelectorAll<HTMLElement>(EDITABLE_LEAF_SELECTOR).forEach(el => {
        el.setAttribute('contenteditable', 'true');
        // iOS often “replaces” when autocorrect fights a multi-block contentEditable tree.
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'sentences');
        el.setAttribute('spellcheck', 'true');
      });
    } else {
      block.setAttribute('contenteditable', 'true');
    }
  });
}

interface ReaderScreenProps {
  onChapterLabelChange: (label: string) => void;
}

export function ReaderScreen({ onChapterLabelChange }: ReaderScreenProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entranceObs = useRef<IntersectionObserver | null>(null);

  const { manuscript, chapters, annotations: rawAnnotations, edits, addAnnotation, updateAnnotation, deleteAnnotation, importSession, openManuscript, recordEdit, pushEditTransition, setEditReturnScroll } = useReaderStore();
  // Re-home annotations to their live chapter (positional ids drift on edits), so
  // the mobile sidebar's labels/sort and the reader's mark-scoping all read the
  // current chapter — not a creation-time snapshot. Identity is stable until an
  // edit actually moves an annotation, so the highlight/sync effects below only
  // re-run when that genuinely happens. The margin column additionally derives
  // each chapter live from the DOM. See engine/annotations/chapterResolve.
  const annotations = useMemo(
    () => resolveAnnotationChapters(rawAnnotations, manuscript?.metadata.combinedMarkdown),
    [rawAnnotations, manuscript?.metadata.combinedMarkdown],
  );
  const { navOpen, annSidebarOpen, annSidebarCollapsed, editMode, changesOpen, closeNav, closeAnnSidebar, collapseAnnSidebar, toggleAnnSidebar, closeAllPanels } = useUIStore();
  const { updateProgress, getReadingPosition, appendChapters, replaceMarkdown } = useLibraryStore();

  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [scrollPct, setScrollPct] = useState(0);
  const [minsLeft, setMinsLeft] = useState(0);
  const [clockTime, setClockTime] = useState('');
  const [selection, setSelection] = useState<{ visible: boolean; position: { left: number; top: number }; range: Range | null; text: string }>({ visible: false, position: { left: 0, top: 0 }, range: null, text: '' });
  const [editingAnn, setEditingAnn] = useState<{ id: string; note: string } | null>(null);
  const [addChaptersOpen, setAddChaptersOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<{ id: string; title: string; initialHtml: string; tapY?: number; charOffset?: number } | null>(null);
  // Desktop: the margin column's "browse" state — turns the anchored gutter into
  // a navigable index of every annotation. Collapses back to anchored on demand.
  const [annBrowse, setAnnBrowse] = useState(false);
  // The selected annotation — its card gets gold emphasis, its mark a gold underline.
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  // The selected edit (Changes mode) — its card + change-mark get gold emphasis.
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const totalWords = useRef(0);
  const editModeRef = useRef(false);
  const annSidebarOpenRef = useRef(false);
  const changesOpenRef = useRef(false);
  const cancelEditRef = useRef(false);
  const commitRef = useRef<(p: HTMLElement) => void>(() => {});
  const activeEditBlockRef = useRef<HTMLElement | null>(null);
  const pendingFullDomCommitRef = useRef(false);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => { annSidebarOpenRef.current = annSidebarOpen; }, [annSidebarOpen]);
  useEffect(() => { changesOpenRef.current = changesOpen; }, [changesOpen]);

  // Clock
  useEffect(() => {
    const tick = () => setClockTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick(); const id = setInterval(tick, 30000); return () => clearInterval(id);
  }, []);

  // Seed the topbar chapter label before the first scroll fires (we open at the
  // top, so the first chapter is active); scroll updates it from there.
  useEffect(() => {
    if (chapters.length > 0) onChapterLabelChange(`Chapter ${chapters[0].index}`);
  }, [chapters, onChapterLabelChange]);

  // Re-apply highlights (declared before the effects that call it, to avoid a
  // use-before-declaration in the render/edit re-render paths).
  const reapplyHighlights = useCallback(() => {
    const c = contentRef.current; if (!c) return;
    stripAnnotationMarks(c);
    annotations.forEach(ann => {
      if (!ann.quote) return;
      const mark = markByAnchor(c, ann.anchor ?? anchorFromQuote(ann.quote), ann.id, ann.type);
      if (mark) mark.addEventListener('click', e => {
        if (editModeRef.current) return; // in edit mode a click just places the caret
        e.stopPropagation(); setEditingAnn({ id: ann.id, note: ann.note });
      });
    });
  }, [annotations]);

  // Coalesced, noise-filtered change list (chains repeated edits to one passage,
  // drops formatting-only churn). Drives both the prose marks and the margin.
  const changeEntries = useMemo(() => buildChangeList(edits), [edits]);

  // Changes mode: wrap each changed passage in a change-mark, clickable to select
  // its margin card. Re-locates from the live rendered text (chapter-scoped).
  const reapplyChangeMarks = useCallback(() => {
    const c = contentRef.current; if (!c) return;
    stripChangeMarks(c);
    changeEntries.forEach(entry => {
      const mark = markChangeByAnchor(c, entry);
      if (mark) mark.addEventListener('click', e => { e.stopPropagation(); setSelectedEditId(entry.id); });
    });
  }, [changeEntries]);

  // The single post-render mark applier — mode-aware so a content re-render shows
  // the marks for the CURRENT posture (change-marks in Changes, annotation marks
  // otherwise, none while editing). Reads modes from refs so toggling a mode
  // doesn't re-run the content-render effects that depend on this callback.
  const syncAnnotationDOM = useCallback(() => {
    const c = contentRef.current;
    if (editModeRef.current) {
      if (c) { stripAnnotationMarks(c); stripChangeMarks(c); }
    } else if (changesOpenRef.current) {
      reapplyChangeMarks();
    } else {
      reapplyHighlights();
    }
  }, [reapplyHighlights, reapplyChangeMarks]);

  // Mode owns the marks: Changes shows change-marks (annotation marks stripped),
  // every other non-editing posture shows annotation marks (change-marks stripped).
  // One set in the DOM at a time, so they never overlap or nest.
  useEffect(() => {
    if (editMode) return; // the editing surface manages its own DOM
    const c = contentRef.current; if (!c) return;
    if (changesOpen) { stripAnnotationMarks(c); reapplyChangeMarks(); }
    else { stripChangeMarks(c); reapplyHighlights(); }
  }, [changesOpen, editMode, reapplyChangeMarks, reapplyHighlights]);

  // Render content + entrance observer + restore position
  useEffect(() => {
    if (!manuscript?.metadata.combinedMarkdown || !contentRef.current) return;
    const c = contentRef.current;
    const { html } = parseMarkdown(manuscript.metadata.combinedMarkdown);
    c.innerHTML = html;
    totalWords.current = manuscript.metadata.combinedMarkdown.trim().split(/\s+/).filter(Boolean).length;

    // An edit re-render: keep the reading posture — no fade-in, no resume toast,
    // restore the exact scroll, re-apply edit-mode class and re-anchor marks.
    const editScroll = useReaderStore.getState().editReturnScroll;
    if (editScroll != null) {
      setEditReturnScroll(null);
      c.querySelectorAll('p, blockquote, ul, ol').forEach(el => el.classList.add('visible'));
      c.classList.toggle('edit-mode', editModeRef.current);
      syncAnnotationDOM();
      window.scrollTo(0, editScroll);
      return;
    }

    // A jump sent from the hub (a Report chip): land at that chapter instead of
    // fading in + resuming the last position. Consume it so it fires only once.
    const pendingIdx = useUIStore.getState().pendingChapterIndex;
    if (pendingIdx != null) {
      useUIStore.getState().setPendingChapterIndex(null);
      c.querySelectorAll('p, blockquote, ul, ol').forEach(el => el.classList.add('visible'));
      if (editModeRef.current) c.classList.add('edit-mode');
      syncAnnotationDOM();
      const target = chapters.find(ch => ch.index === pendingIdx);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = target ? document.getElementById(target.id) : null;
        if (el) el.scrollIntoView({ block: 'start' });
        else window.scrollTo(0, 0);
      }));
      // The hub may have asked us to land in a particular posture (edit / annotate
      // the chapter), not just read it. Apply it once; the editMode/sidebar effects
      // pick up the store change and toggle the affordance.
      const intent = useUIStore.getState().pendingReaderIntent;
      if (intent) {
        useUIStore.getState().setPendingReaderIntent(null);
        if (intent === 'edit') useUIStore.getState().enterEditMode();
        else useUIStore.getState().openAnnSidebar();
      }
      return;
    }

    if (entranceObs.current) entranceObs.current.disconnect();
    entranceObs.current = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); entranceObs.current?.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    c.querySelectorAll('p, blockquote, ul, ol').forEach(el => entranceObs.current?.observe(el));
    if (editModeRef.current) c.classList.add('edit-mode');

    window.scrollTo(0, 0);
    if (manuscript.id) {
      const frac = getReadingPosition(manuscript.id);
      if (frac > 0.01) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const docH = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo(0, docH * frac);
          showToast(`Resumed at ${Math.round(frac * 100)}%`);
        }));
      }
    }
    return () => entranceObs.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-render content only when the manuscript changes
  }, [manuscript?.id, manuscript?.metadata.combinedMarkdown]);

  useEffect(() => { syncAnnotationDOM(); }, [annotations, editMode, syncAnnotationDOM]);

  // ── Edit mode ──────────────────────────────────────────────────────────────
  // Re-render the current source in place (no persist): used to discard stray
  // contentEditable markup and re-anchor marks while holding scroll & posture.
  const rerenderInPlace = useCallback(() => {
    const c = contentRef.current; const md = manuscript?.metadata.combinedMarkdown;
    if (!c || !md) return;
    const sy = window.scrollY;
    c.innerHTML = parseMarkdown(md).html;
    c.querySelectorAll('p, blockquote, ul, ol').forEach(el => el.classList.add('visible'));
    c.classList.toggle('edit-mode', editModeRef.current);
    syncAnnotationDOM();
    window.scrollTo(0, sy);
  }, [manuscript, syncAnnotationDOM]);

  // Commit one chapter: serialize its whole edited body back to markdown, splice
  // it into the source between this chapter's heading and the next, persist, and
  // re-render. Serializing the entire body (not one paragraph) is what lets the
  // structural edits work — split/merge/add/delete are just a different block
  // sequence. A body only focused-through (innerHTML unchanged) is left alone.
  const commitChapterEdit = useCallback((block: HTMLElement) => {
    const c = contentRef.current;
    const md = manuscript?.metadata.combinedMarkdown;
    if (!md || !manuscript) return;

    if (pendingFullDomCommitRef.current && c) {
      pendingFullDomCommitRef.current = false;
      editOriginalHtml.delete(block);
      const norm = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const newMd = serializeContentDomToMarkdown(c);
      if (!cancelEditRef.current && sameProse(newMd, norm)) return;
      if (cancelEditRef.current) { cancelEditRef.current = false; if (!editModeRef.current) rerenderInPlace(); return; }
      const updated = replaceMarkdown(manuscript.id, newMd);
      if (updated) {
        setEditReturnScroll(window.scrollY);
        openManuscript(updated, parseMarkdown(newMd).chapters);
        showToast('Edit saved.');
      } else if (!editModeRef.current) rerenderInPlace();
      return;
    }

    const origHtml = editOriginalHtml.get(block);
    editOriginalHtml.delete(block);
    if (activeEditBlockRef.current === block) activeEditBlockRef.current = null;
    const cancelled = cancelEditRef.current; cancelEditRef.current = false;
    if (!cancelled && origHtml !== undefined && block.innerHTML === origHtml) return; // untouched

    // The body spans from the end of this chapter's `# ` heading to the start of
    // the next chapter's heading (or end of source). The heading is the H1 that
    // immediately precedes the block; the next heading is the next H1 in order.
    let heading = block.previousElementSibling;
    while (heading && heading.tagName !== 'H1') heading = heading.previousElementSibling;
    const headingEnd = heading ? Number((heading as HTMLElement).dataset.mdEnd) : NaN;
    if (!heading || Number.isNaN(headingEnd)) {
      if (!editModeRef.current) rerenderInPlace();
      return;
    }

    let nextH1 = block.nextElementSibling;
    while (nextH1 && nextH1.tagName !== 'H1') nextH1 = nextH1.nextElementSibling;

    const norm = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const bodyStart = headingEnd;
    const bodyEnd = nextH1 ? Number((nextH1 as HTMLElement).dataset.mdStart) : norm.length;
    const original = norm.slice(bodyStart, bodyEnd);
    const newBody = htmlToMarkdownBlocks(block.innerHTML);

    if (cancelled || !newBody || sameProse(newBody, original)) {
      if (!editModeRef.current) rerenderInPlace();
      return;
    }
    // Re-pad with surrounding blank lines so the body stays a well-formed block
    // run; the reparse normalizes any extra blank lines.
    const res = applyBlockEdit(norm, bodyStart, bodyEnd, `\n\n${newBody}\n\n`);
    if (!res) {
      if (!editModeRef.current) rerenderInPlace();
      return;
    }
    const updated = replaceMarkdown(manuscript.id, res.markdown);
    if (updated) {
      // Record the author's decision as a durable Edit (distinct from a reader
      // annotation) before re-rendering — recordEdit persists synchronously, so
      // the openManuscript reload below picks it up. Structural edits don't map
      // to a single paragraph, so the record is the whole chapter body's
      // before/after, attributed to the chapter from its heading id.
      const owner = chapters.find(ch => ch.id === (heading as HTMLElement).id);
      // Anchor on the trimmed body at its true offset (bodyStart points at the
      // leading blank line), so the quote aligns with the source for re-location.
      const quote = original.trim();
      const quoteStart = bodyStart + (original.length - original.trimStart().length);
      const edit = recordEdit({
        chapterId: owner?.id ?? '',
        chapterIndex: owner?.index ?? 0,
        chapterTitle: owner?.title ?? '',
        anchor: buildAnchor(norm, quoteStart, quote),
        originalText: quote,
        replacementText: newBody,
      });
      setEditReturnScroll(window.scrollY);
      const { chapters: newChapters } = parseMarkdown(updated.metadata.combinedMarkdown!);
      openManuscript(updated, newChapters); // → render effect restores scroll, re-anchors
      // Make the edit reversible: snapshot full before/after + the record it made.
      if (edit) pushEditTransition(norm, res.markdown, edit);
      showToast('Edit saved.');
    } else {
      if (!editModeRef.current) rerenderInPlace();
      showToast('Could not save — manuscript not cached.');
    }
  }, [manuscript, chapters, replaceMarkdown, openManuscript, rerenderInPlace, recordEdit, pushEditTransition, setEditReturnScroll]);
  useEffect(() => { commitRef.current = commitChapterEdit; }, [commitChapterEdit]);

  // TipTap save: take markdown the editor serialized, find the chapter body span
  // in the source, splice in the new body, persist, and re-render in place.
  const handleTipTapSave = useCallback((bodyMarkdown: string) => {
    const c = contentRef.current;
    const md = manuscript?.metadata.combinedMarkdown;
    if (!c || !md || !manuscript || !editingChapter) { setEditingChapter(null); return; }

    const marker = c.querySelector(`#${CSS.escape(editingChapter.id)}`);
    let h1el: HTMLElement | null = null;
    let sib: Element | null = marker?.nextElementSibling ?? null;
    while (sib) {
      if (sib.tagName === 'H1') { h1el = sib as HTMLElement; break; }
      sib = sib.nextElementSibling;
    }
    if (!h1el) { setEditingChapter(null); return; }

    const headingEnd = Number(h1el.dataset.mdEnd);
    if (Number.isNaN(headingEnd)) { setEditingChapter(null); return; }

    let nextH1: Element | null = h1el.nextElementSibling;
    while (nextH1 && nextH1.tagName !== 'H1') nextH1 = nextH1.nextElementSibling;

    const norm = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const bodyStart = headingEnd;
    const bodyEnd = nextH1 ? Number((nextH1 as HTMLElement).dataset.mdStart) : norm.length;
    const original = norm.slice(bodyStart, bodyEnd);

    if (sameProse(bodyMarkdown, original)) { setEditingChapter(null); return; }

    const res = applyBlockEdit(norm, bodyStart, bodyEnd, `\n\n${bodyMarkdown}\n\n`);
    if (!res) { setEditingChapter(null); return; }

    const updated = replaceMarkdown(manuscript.id, res.markdown);
    if (updated) {
      setEditReturnScroll(window.scrollY);
      openManuscript(updated, parseMarkdown(res.markdown).chapters);
      setEditingChapter(null);
      showToast('Chapter saved.');
    } else {
      setEditingChapter(null);
      showToast('Could not save — manuscript not cached.');
    }
  }, [manuscript, editingChapter, replaceMarkdown, openManuscript, setEditReturnScroll]);

  // Apply/remove the edit-mode visual class when the toggle flips.
  // Desktop: inline contentEditable editing on the real prose (whisper-quiet, no reformat).
  // Mobile/touch: TipTap owns the surface (iOS Safari composition bugs make raw contentEditable unreliable there).
  useEffect(() => {
    const c = contentRef.current; if (!c) return;
    if (!editMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear editor when leaving edit mode
      setEditingChapter(null);
      const active = document.activeElement as HTMLElement | null;
      if (active && c.contains(active)) active.blur();
      setupEditable(c, false);
    } else {
      c.querySelectorAll('p, blockquote, ul, ol').forEach(el => el.classList.add('visible'));
      entranceObs.current?.disconnect();
      if (!usesTouchFriendlyEditing()) setupEditable(c, true);
    }
    c.classList.toggle('edit-mode', editMode);
    if (editMode) { stripAnnotationMarks(c); stripChangeMarks(c); }
    else syncAnnotationDOM(); // restore marks for whatever posture we return to
  }, [editMode, syncAnnotationDOM]);

  // Switching reader mode (Manuscript / Annotations) dismisses the floating
  // annotate command menu — it belongs to a live selection in Reading.
  useEffect(() => {
    if (editMode || annSidebarOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- collapse the popup on mode change
      setSelection(s => (s.visible ? { ...s, visible: false, range: null } : s));
    }
    // Leaving Annotations mode collapses the browse index and clears selection.
    if (!annSidebarOpen) {
      if (annBrowse) setAnnBrowse(false);
      if (selectedAnnId) setSelectedAnnId(null);
    }
  }, [editMode, annSidebarOpen, annBrowse, selectedAnnId]);

  // On touch: clicking a chapter body opens the TipTap editor for it.
  // On desktop: the chapter-block is contentEditable so a click just places the caret — no popup needed.
  useEffect(() => {
    const c = contentRef.current; if (!c) return;
    function onContentClick(e: MouseEvent) {
      if (!editModeRef.current) return;
      if (!usesTouchFriendlyEditing()) return; // desktop: caret already placed by browser
      const block = (e.target as HTMLElement)?.closest?.('.chapter-block') as HTMLElement | null;
      if (!block) return;
      // Walk back from the block to find the chapter span (id="ch-N")
      let prev: Element | null = block.previousElementSibling;
      while (prev) {
        if (prev.id && prev.id.startsWith('ch-')) break;
        prev = prev.previousElementSibling;
      }
      if (!prev) return;
      const ch = chapters.find(ch => ch.id === prev!.id);
      if (!ch) return;
      const html = block.innerHTML.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
      // Capture where the tap landed as a block-relative character offset (so TipTap
      // can restore the cursor) plus the tap's viewport Y (so the editor opens with
      // that same line under the finger — not jumped to the chapter top).
      const charOffset = charOffsetAtPoint(block, e.clientX, e.clientY);
      setEditingChapter({ id: ch.id, title: ch.title, initialHtml: html, tapY: e.clientY, charOffset });
    }
    c.addEventListener('click', onContentClick as EventListener);
    return () => c.removeEventListener('click', onContentClick as EventListener);
  }, [chapters]);

  // Commit-on-blur (desktop), deferred commit (touch), Enter/Escape.
  useEffect(() => {
    const c = contentRef.current; if (!c) return;
    const onFocusIn = (e: FocusEvent) => {
      if (!editModeRef.current) return;
      const block = (e.target as HTMLElement)?.closest?.('.chapter-block') as HTMLElement | null;
      if (!block) return;
      const prev = activeEditBlockRef.current;
      if (prev && prev !== block) commitRef.current(prev);
      activeEditBlockRef.current = block;
      if (!editOriginalHtml.has(block)) editOriginalHtml.set(block, block.innerHTML);
      if (usesTouchFriendlyEditing()) {
        const leaf = (e.target as HTMLElement)?.closest?.(EDITABLE_LEAF_SELECTOR) as HTMLElement | null;
        if (leaf && block.contains(leaf)) {
          leaf.normalize();
          requestAnimationFrame(() => stabilizeCaretInLeaf(leaf));
        }
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      // Touch browsers fire spurious blur while the keyboard is open; never commit here.
      if (usesTouchFriendlyEditing()) return;
      const block = (e.target as HTMLElement)?.closest?.('.chapter-block') as HTMLElement | null;
      if (!block) return;
      const to = (e as FocusEvent & { relatedTarget: EventTarget | null }).relatedTarget as Node | null;
      if (to && block.contains(to)) return;
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active && block.contains(active)) return;
        if (activeEditBlockRef.current === block) activeEditBlockRef.current = null;
        commitRef.current(block);
      }, 0);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editModeRef.current) return;
      const block = (e.target as HTMLElement)?.closest?.('.chapter-block') as HTMLElement | null;
      if (!block) return;

      if (e.key === ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const hit = lineTextBeforeCaretInChapterBlock(block);
        if (hit) {
          const promote = matchMarkdownBlockPrefix(hit.line);
          if (promote) {
            e.preventDefault();
            const kind = applyMarkdownPromoteInBlock(block, hit.leaf, promote);
            if (kind === 'chapter-split') {
              pendingFullDomCommitRef.current = true;
              editOriginalHtml.delete(block);
              const container = contentRef.current;
              if (container) setupEditable(container, true);
              const newBlock = block.nextElementSibling?.nextElementSibling;
              if (newBlock?.classList.contains('chapter-block')) {
                activeEditBlockRef.current = newBlock as HTMLElement;
                if (!editOriginalHtml.has(newBlock as HTMLElement)) {
                  editOriginalHtml.set(newBlock as HTMLElement, (newBlock as HTMLElement).innerHTML);
                }
              }
            }
            return;
          }
        }
      }

      // Enter splits a paragraph (default contentEditable behavior); Escape
      // abandons the chapter's edits and restores the rendered source.
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEditRef.current = true;
        const active = document.activeElement as HTMLElement | null;
        if (active && block.contains(active)) active.blur();
        else block.blur();
      }
    };
    c.addEventListener('focusin', onFocusIn as EventListener);
    c.addEventListener('focusout', onFocusOut as EventListener);
    c.addEventListener('keydown', onKeyDown as EventListener);
    return () => {
      c.removeEventListener('focusin', onFocusIn as EventListener);
      c.removeEventListener('focusout', onFocusOut as EventListener);
      c.removeEventListener('keydown', onKeyDown as EventListener);
      // Flush any in-flight edit on unmount so leaving the reader never drops it.
      const pending = activeEditBlockRef.current;
      if (pending && !usesTouchFriendlyEditing()) { activeEditBlockRef.current = null; commitRef.current(pending); }
    };
  }, []);

  // Scroll
  useEffect(() => {
    function onScroll() {
      const sy = window.scrollY;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docH > 0 ? sy / docH : 0;
      const fill = document.getElementById('progress-fill');
      if (fill) fill.style.width = `${(pct * 100).toFixed(2)}%`;

      setScrollPct(Math.round(pct * 100));
      setMinsLeft(Math.ceil((1 - pct) * totalWords.current / 238));

      const activeChapter = chapterForOffset(
        chapters.map(ch => ({
          chapter: ch,
          offset: document.getElementById(ch.id)?.getBoundingClientRect().top ?? Infinity,
        })),
        80,
      );
      if (activeChapter && activeChapter.index !== activeChapterIdx) {
        setActiveChapterIdx(activeChapter.index);
        const label = `Chapter ${activeChapter.index}`;
        onChapterLabelChange(label);
        document.querySelectorAll('.chapter-link').forEach(btn =>
          btn.classList.toggle('active', (btn as HTMLElement).dataset.id === activeChapter!.id));
      }

      if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
      scrollSaveTimer.current = setTimeout(() => {
        if (manuscript?.id) updateProgress(manuscript.id, pct);
      }, 1500);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateProgress is a stable store action
  }, [chapters, activeChapterIdx, manuscript?.id, onChapterLabelChange]);

  // Selection
  useEffect(() => {
    function onSelectionEnd(e: MouseEvent | TouchEvent) {
      if (!contentRef.current) return;
      if (editModeRef.current) return; // no annotate popup while editing prose
      if (!annSidebarOpenRef.current) return; // annotations popup only active in Annotations mode
      const popup = document.getElementById('selection-popup');
      if (popup?.contains(e.target as Node)) return;
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';
        if (text.length > 3 && sel?.anchorNode && contentRef.current?.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0).cloneRange();
          const rect = range.getBoundingClientRect();
          const pw = 280;
          let left = rect.left + rect.width / 2 - pw / 2;
          let top = rect.top - 130;
          left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
          if (top < 60) top = rect.bottom + 8;
          setSelection({ visible: true, position: { left, top }, range, text });
        } else if (!popup?.contains(e.target as Node)) {
          setSelection(s => ({ ...s, visible: false, range: null }));
        }
      }, 10);
    }
    document.addEventListener('mouseup', onSelectionEnd as EventListener);
    document.addEventListener('touchend', onSelectionEnd as EventListener);
    return () => {
      document.removeEventListener('mouseup', onSelectionEnd as EventListener);
      document.removeEventListener('touchend', onSelectionEnd as EventListener);
    };
  }, []);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { closeAllPanels(); setSelection(s => ({ ...s, visible: false })); setEditingAnn(null); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') { e.preventDefault(); toggleAnnSidebar(); }
      if (e.altKey && e.key === 'ArrowRight') {
        const next = chapters.find(c => c.index === activeChapterIdx + 1);
        if (next) document.getElementById(next.id)?.scrollIntoView({ behavior: 'smooth' });
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        const prev = chapters.find(c => c.index === activeChapterIdx - 1);
        if (prev) document.getElementById(prev.id)?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapters, activeChapterIdx, toggleAnnSidebar, closeAllPanels]);

  const handleSaveAnnotation = useCallback((type: AnnotationType, note: string) => {
    const { range, text } = selection;
    let chapterTitle = '', chapterIndex = 0;
    let owner: Chapter | null = null;
    if (range) {
      const rect = range.getBoundingClientRect();
      const y = rect.top + window.scrollY;
      owner = chapterForOffset(
        chapters.map(ch => ({
          chapter: ch,
          offset: document.getElementById(ch.id)?.offsetTop ?? Infinity,
        })),
        y + 100,
      );
      if (owner) { chapterTitle = owner.title; chapterIndex = owner.index; }
    }
    // Build a durable anchor from the current rendered text before inserting the
    // mark (so existing marks/this selection don't perturb the offset math).
    // Capture in the owning chapter's text domain when known, and stamp the
    // durable chapterId — so re-location is scoped to that chapter (reorder-proof,
    // duplicate-proof). Falls back to whole-manuscript when the chapter is unknown.
    const quote = text.slice(0, 400);
    let anchor: TextAnchor | undefined;
    if (range && quote && contentRef.current) {
      const scope = owner ? chapterBlockFor(contentRef.current, owner.id) : null;
      const root = scope ?? contentRef.current;
      const start = offsetInContainer(root, range);
      anchor = buildAnchor(root.textContent ?? '', start, quote);
      if (scope && owner) anchor.chapterId = owner.id;
    }
    const ann = addAnnotation({ type, quote, note, chapterTitle, chapterIndex, anchor });
    if (range && text && contentRef.current) {
      try {
        const mark = document.createElement('mark');
        mark.dataset.ann = ann.id; mark.className = 'type-' + type;
        range.surroundContents(mark);
        mark.addEventListener('click', e => { e.stopPropagation(); setEditingAnn({ id: ann.id, note: ann.note }); });
      } catch {
        const mark = wrapTextInMark(contentRef.current, text.slice(0, 60), ann.id, type);
        if (mark) mark.addEventListener('click', e => { e.stopPropagation(); setEditingAnn({ id: ann.id, note: ann.note }); });
      }
    }
    window.getSelection()?.removeAllRanges();
    setSelection(s => ({ ...s, visible: false, range: null }));
    showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} saved.`);
  }, [selection, chapters, addAnnotation]);

  const jumpToChapter = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const jumpToAnnotation = useCallback((id: string) => {
    const mark = contentRef.current?.querySelector(`mark[data-ann="${id}"]`);
    if (!mark) return;
    setSelectedAnnId(id); // emphasize the card
    // On desktop the cards live in the right margin and don't cover the prose,
    // so stay in Annotations and just scroll. On the narrow/mobile overlay
    // sidebar (which covers the text), close it first so the jump is visible.
    const marginColumn = window.matchMedia('(min-width: 1200px)').matches;
    if (marginColumn) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      closeAnnSidebar();
      setTimeout(() => mark.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, [closeAnnSidebar]);

  const removeMark = useCallback((id: string) => {
    const mark = contentRef.current?.querySelector(`mark[data-ann="${id}"]`);
    if (mark) { const p = mark.parentNode!; while (mark.firstChild) p.insertBefore(mark.firstChild, mark); p.removeChild(mark); (p as Element).normalize?.(); }
  }, []);

  // Changes mode: select an edit and scroll its change-mark into view (if located).
  const jumpToEdit = useCallback((id: string) => {
    setSelectedEditId(id);
    const mark = contentRef.current?.querySelector(`mark[data-edit="${CSS.escape(id)}"]`);
    mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Keep the selected edit's change-mark visually emphasized (gold), in step with
  // the selected card. Declarative over the imperatively-managed marks.
  useEffect(() => {
    const c = contentRef.current; if (!c) return;
    c.querySelectorAll('mark[data-edit].sel').forEach(m => m.classList.remove('sel'));
    if (selectedEditId) c.querySelector(`mark[data-edit="${CSS.escape(selectedEditId)}"]`)?.classList.add('sel');
  }, [selectedEditId, changesOpen]);

  const handleAppendChapters = useCallback((chunk: string) => {
    if (!manuscript) return;
    const updated = appendChapters(manuscript.id, chunk);
    if (!updated) { showToast('Manuscript not cached — reload files first.'); setAddChaptersOpen(false); return; }
    const { chapters: newChapters } = parseMarkdown(updated.metadata.combinedMarkdown!);
    const added = newChapters.length - chapters.length;
    openManuscript(updated, newChapters);
    setAddChaptersOpen(false);
    showToast(added > 0 ? `${added} chapter${added !== 1 ? 's' : ''} added — now ${newChapters.length} total` : 'Chapters added.');
  }, [manuscript, chapters, appendChapters, openManuscript]);

  const minsDisplay = minsLeft > 60 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m left` : minsLeft > 1 ? `${minsLeft} min left` : 'Almost done';

  if (!manuscript) return null;

  return (
    <div id="screen-reader" className="active">
      <ChapterNav open={navOpen} chapters={chapters} activeChapterIndex={activeChapterIdx} onClose={closeNav} onJump={jumpToChapter} onAddChapters={() => setAddChaptersOpen(true)} />
      {/* Narrow / touch only — desktop (≥1200px) uses the margin column instead. */}
      <AnnotationSidebar
        open={annSidebarOpen && !annSidebarCollapsed} annotations={annotations} onClose={collapseAnnSidebar}
        onDelete={id => { deleteAnnotation(id); removeMark(id); showToast('Annotation removed.'); }}
        onJumpTo={jumpToAnnotation}
        onImport={(payload) => {
          const { imported, session } = importSession(payload);
          const who = session?.readerName ? ` from ${session.readerName}` : '';
          const far = session ? (session.completedAt ? ' · finished' : ` · read ${Math.round(session.progress * 100)}%`) : '';
          showToast(`${imported} annotation${imported !== 1 ? 's' : ''} imported${who}${far}.`);
        }}
      />
      {/* The annotate command menu is a Reading-mode affordance only — never over
          Manuscript (editing) or Annotations (review) modes. */}
      <SelectionPopup visible={selection.visible && annSidebarOpen && !editMode} position={selection.position} onSave={handleSaveAnnotation} onClose={() => setSelection(s => ({ ...s, visible: false, range: null }))} />
      <AddChaptersModal
        open={addChaptersOpen}
        manuscriptTitle={manuscript.metadata.title}
        onClose={() => setAddChaptersOpen(false)}
        onAppend={handleAppendChapters}
      />
      {editingAnn && (
        <AnnotationEditPopup annId={editingAnn.id} note={editingAnn.note}
          onSave={note => { updateAnnotation(editingAnn.id, note); setEditingAnn(null); showToast('Note updated.'); }}
          onDelete={() => { const id = editingAnn.id; deleteAnnotation(id); removeMark(id); setEditingAnn(null); showToast('Annotation removed.'); }}
          onClose={() => setEditingAnn(null)}
        />
      )}
      {/* reader-body: on desktop in Annotations or Changes mode this becomes a flex
          row (prose left, margin column right). On mobile it's transparent. */}
      <div id="reader-body" className={`${(annSidebarOpen || changesOpen) && !usesTouchFriendlyEditing() ? 'ann-open' : ''}${changesOpen ? ' changes-open' : ''}`.trim()}>
        {/* On touch the TipTap editor replaces #content for the active chapter.
            On desktop #content stays visible — it IS the inline editing surface. */}
        <div id="content" ref={contentRef} style={editingChapter && usesTouchFriendlyEditing() ? { display: 'none' } : undefined} />
        {editingChapter && usesTouchFriendlyEditing() && (
          <ChapterEditor
            chapterTitle={editingChapter.title}
            initialHtml={editingChapter.initialHtml}
            onSave={handleTipTapSave}
            onCancel={() => { setEditingChapter(null); }}
            tapY={editingChapter.tapY}
            charOffset={editingChapter.charOffset}
          />
        )}
        {changesOpen ? (
          <ChangesMarginColumn
            entries={changeEntries}
            chapters={chapters}
            open={changesOpen}
            selectedId={selectedEditId}
            onJumpTo={jumpToEdit}
          />
        ) : (
          <AnnMarginColumn
            annotations={annotations}
            open={annSidebarOpen}
            browse={annBrowse}
            selectedId={selectedAnnId}
            onJumpTo={jumpToAnnotation}
            onOpenBrowse={() => setAnnBrowse(true)}
            onCloseBrowse={() => setAnnBrowse(false)}
          />
        )}
      </div>
      <div id="end-mark">End of manuscript</div>
      <div id="bottom-strip" className={scrollPct > 5 && !editMode && !editingChapter ? 'visible' : ''}>
        <span id="pct-read">{scrollPct}% read</span>
        <span className="sep" />
        <span id="time-left">{minsDisplay}</span>
        <span className="sep" />
        <span id="clock-time">{clockTime}</span>
      </div>
    </div>
  );
}

function AnnotationEditPopup({ annId, note, onSave, onDelete, onClose }: { annId: string; note: string; onSave: (n: string) => void; onDelete: () => void; onClose: () => void; }) {
  const [text, setText] = React.useState(note);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [pos, setPos] = React.useState({ left: 20, top: 80 });

  React.useEffect(() => { setTimeout(() => ref.current?.focus(), 50); }, []);
  React.useEffect(() => {
    const mark = document.querySelector(`mark[data-ann="${annId}"]`);
    if (mark) {
      const r = mark.getBoundingClientRect();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- position popup after measuring the mark
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 340)), top: r.bottom + 8 > window.innerHeight - 160 ? Math.max(8, r.top - 160) : r.bottom + 8 });
    }
  }, [annId]);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onMouseDown={onClose} />
      <div id="ann-edit-popup" className="visible" style={{ left: pos.left, top: pos.top }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Hanken Grotesk', system-ui, sans-serif", fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '8px' }}>Edit note</div>
        <textarea ref={ref} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(text.trim()); } if (e.key === 'Escape') onClose(); }}
          style={{ width: '100%', minHeight: '64px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--ink)', fontFamily: "'EB Garamond', Georgia, serif", fontSize: '15px', lineHeight: '1.5', outline: 'none', resize: 'none', padding: '0 0 8px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Hanken Grotesk', system-ui, sans-serif", fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--border)' }} onClick={onDelete}>Delete</button>
          <button style={{ background: 'none', border: '1px solid var(--ink)', fontFamily: "'Hanken Grotesk', system-ui, sans-serif", fontSize: '10px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink)', padding: '5px 14px', cursor: 'pointer' }} onClick={() => onSave(text.trim())}>Save</button>
        </div>
      </div>
    </>
  );
}
