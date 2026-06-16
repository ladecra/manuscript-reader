import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { AnnotationType, TextAnchor, Chapter } from '../engine/types';
import { buildAnchor, locateAnchor, anchorFromQuote } from '../engine/annotations/anchor';
import { applyBlockEdit, htmlToMarkdownBlocks, sameProse } from '../engine/manuscript/blockEdit';
import { useReaderStore } from '../state/readerStore';
import { useUIStore } from '../state/uiStore';
import { useLibraryStore } from '../state/libraryStore';
import { parseMarkdown } from '../engine/ingestion/parseMarkdown';
import { chapterForOffset } from '../engine/manuscript/chapterForOffset';
import { ChapterNav } from '../components/reader/ChapterNav';
import { AnnotationSidebar } from '../components/reader/AnnotationSidebar';
import { SelectionPopup } from '../components/reader/SelectionPopup';
import { AddChaptersModal } from '../components/reader/AddChaptersModal';
import { showToast } from '../components/ui/Toast';

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

function markByAnchor(container: HTMLElement, anchor: TextAnchor, id: string, type: AnnotationType): HTMLElement | null {
  // Scope resolution to the anchored chapter when the anchor carries one (and it
  // still exists); otherwise resolve against the whole manuscript (legacy anchors).
  const scope = anchor.chapterId ? chapterBlockFor(container, anchor.chapterId) : null;
  const root = scope ?? container;
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

// Toggle the prose-edit affordance: each chapter body (.chapter-block) becomes
// contentEditable, so edits within a chapter — including splitting a paragraph
// with Enter, merging, adding, or deleting blocks — round-trip through the block
// serializer. The chapter's own `# ` heading lives outside the block and stays
// read-only, so chapter structure can't be corrupted from the reading view. The
// reading layout is unchanged — only the cursor/affordance.
function setupEditable(container: HTMLElement, on: boolean) {
  container.classList.toggle('edit-mode', on);
  container.querySelectorAll<HTMLElement>('.chapter-block').forEach(block => {
    if (on) block.setAttribute('contenteditable', 'true');
    else block.removeAttribute('contenteditable');
  });
}

interface ReaderScreenProps {
  onChapterLabelChange: (label: string) => void;
}

export function ReaderScreen({ onChapterLabelChange }: ReaderScreenProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entranceObs = useRef<IntersectionObserver | null>(null);

  const { manuscript, chapters, annotations, addAnnotation, updateAnnotation, deleteAnnotation, importSession, openManuscript, recordEdit, pushEditTransition, setEditReturnScroll } = useReaderStore();
  const { navOpen, annSidebarOpen, editMode, closeNav, closeAnnSidebar, toggleAnnSidebar, closeAllPanels } = useUIStore();
  const { updateProgress, getReadingPosition, appendChapters, replaceMarkdown } = useLibraryStore();

  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [scrollPct, setScrollPct] = useState(0);
  const [minsLeft, setMinsLeft] = useState(0);
  const [clockTime, setClockTime] = useState('');
  const [selection, setSelection] = useState<{ visible: boolean; position: { left: number; top: number }; range: Range | null; text: string }>({ visible: false, position: { left: 0, top: 0 }, range: null, text: '' });
  const [editingAnn, setEditingAnn] = useState<{ id: string; note: string } | null>(null);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [addChaptersOpen, setAddChaptersOpen] = useState(false);
  const totalWords = useRef(0);
  const lastScrollY = useRef(0);
  const topbarVisible = useRef(true);
  const editModeRef = useRef(false);
  const cancelEditRef = useRef(false);
  const commitRef = useRef<(p: HTMLElement) => void>(() => {});
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  // Clock
  useEffect(() => {
    const tick = () => setClockTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick(); const id = setInterval(tick, 30000); return () => clearInterval(id);
  }, []);

  // Re-apply highlights (declared before the effects that call it, to avoid a
  // use-before-declaration in the render/edit re-render paths).
  const reapplyHighlights = useCallback(() => {
    const c = contentRef.current; if (!c) return;
    c.querySelectorAll('mark[data-ann]').forEach(mark => {
      const parent = mark.parentNode!;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark); (parent as Element).normalize?.();
    });
    annotations.forEach(ann => {
      if (!ann.quote) return;
      const mark = markByAnchor(c, ann.anchor ?? anchorFromQuote(ann.quote), ann.id, ann.type);
      if (mark) mark.addEventListener('click', e => {
        if (editModeRef.current) return; // in edit mode a click just places the caret
        e.stopPropagation(); setEditingAnn({ id: ann.id, note: ann.note });
      });
    });
  }, [annotations]);

  // Render content + entrance observer + restore position
  useEffect(() => {
    if (!manuscript?.metadata.combinedMarkdown || !contentRef.current) return;
    const c = contentRef.current;
    const { html } = parseMarkdown(manuscript.metadata.combinedMarkdown);
    c.innerHTML = html;
    totalWords.current = manuscript.metadata.combinedMarkdown.trim().split(/\s+/).filter(Boolean).length;

    // An edit re-render: keep the reading posture — no fade-in, no resume toast,
    // restore the exact scroll, re-apply edit affordance and re-anchor marks.
    const editScroll = useReaderStore.getState().editReturnScroll;
    if (editScroll != null) {
      setEditReturnScroll(null);
      c.querySelectorAll('p, blockquote, ul, ol').forEach(el => el.classList.add('visible'));
      setupEditable(c, editModeRef.current);
      reapplyHighlights();
      window.scrollTo(0, editScroll);
      return;
    }

    // A jump sent from the hub (a Report chip): land at that chapter instead of
    // fading in + resuming the last position. Consume it so it fires only once.
    const pendingIdx = useUIStore.getState().pendingChapterIndex;
    if (pendingIdx != null) {
      useUIStore.getState().setPendingChapterIndex(null);
      c.querySelectorAll('p, blockquote, ul, ol').forEach(el => el.classList.add('visible'));
      if (editModeRef.current) setupEditable(c, true);
      reapplyHighlights();
      const target = chapters.find(ch => ch.index === pendingIdx);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = target ? document.getElementById(target.id) : null;
        if (el) el.scrollIntoView({ block: 'start' });
        else window.scrollTo(0, 0);
      }));
      return;
    }

    if (entranceObs.current) entranceObs.current.disconnect();
    entranceObs.current = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); entranceObs.current?.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    c.querySelectorAll('p, blockquote, ul, ol').forEach(el => entranceObs.current?.observe(el));
    if (editModeRef.current) setupEditable(c, true);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- reapply marks only when annotations change
  useEffect(() => { reapplyHighlights(); }, [annotations]);

  // ── Edit mode ──────────────────────────────────────────────────────────────
  // Re-render the current source in place (no persist): used to discard stray
  // contentEditable markup and re-anchor marks while holding scroll & posture.
  const rerenderInPlace = useCallback(() => {
    const c = contentRef.current; const md = manuscript?.metadata.combinedMarkdown;
    if (!c || !md) return;
    const sy = window.scrollY;
    c.innerHTML = parseMarkdown(md).html;
    c.querySelectorAll('p, blockquote, ul, ol').forEach(el => el.classList.add('visible'));
    setupEditable(c, editModeRef.current);
    reapplyHighlights();
    window.scrollTo(0, sy);
  }, [manuscript, reapplyHighlights]);

  // Commit one chapter: serialize its whole edited body back to markdown, splice
  // it into the source between this chapter's heading and the next, persist, and
  // re-render. Serializing the entire body (not one paragraph) is what lets the
  // structural edits work — split/merge/add/delete are just a different block
  // sequence. A body only focused-through (innerHTML unchanged) is left alone.
  const commitChapterEdit = useCallback((block: HTMLElement) => {
    const origHtml = editOriginalHtml.get(block);
    editOriginalHtml.delete(block);
    const cancelled = cancelEditRef.current; cancelEditRef.current = false;
    const md = manuscript?.metadata.combinedMarkdown;
    if (!md || !manuscript) return;
    if (!cancelled && origHtml !== undefined && block.innerHTML === origHtml) return; // untouched

    // The body spans from the end of this chapter's `# ` heading to the start of
    // the next chapter's heading (or end of source). The heading is the H1 that
    // immediately precedes the block; the next heading is the next H1 in order.
    let heading = block.previousElementSibling;
    while (heading && heading.tagName !== 'H1') heading = heading.previousElementSibling;
    const headingEnd = heading ? Number((heading as HTMLElement).dataset.mdEnd) : NaN;
    if (!heading || Number.isNaN(headingEnd)) { rerenderInPlace(); return; }

    let nextH1 = block.nextElementSibling;
    while (nextH1 && nextH1.tagName !== 'H1') nextH1 = nextH1.nextElementSibling;

    const norm = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const bodyStart = headingEnd;
    const bodyEnd = nextH1 ? Number((nextH1 as HTMLElement).dataset.mdStart) : norm.length;
    const original = norm.slice(bodyStart, bodyEnd);
    const newBody = htmlToMarkdownBlocks(block.innerHTML);

    if (cancelled || !newBody || sameProse(newBody, original)) {
      rerenderInPlace(); // nothing to save — restore clean rendered HTML
      return;
    }
    // Re-pad with surrounding blank lines so the body stays a well-formed block
    // run; the reparse normalizes any extra blank lines.
    const res = applyBlockEdit(norm, bodyStart, bodyEnd, `\n\n${newBody}\n\n`);
    if (!res) { rerenderInPlace(); return; }
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
      rerenderInPlace();
      showToast('Could not save — manuscript not cached.');
    }
  }, [manuscript, chapters, replaceMarkdown, openManuscript, rerenderInPlace, recordEdit, pushEditTransition, setEditReturnScroll]);
  useEffect(() => { commitRef.current = commitChapterEdit; }, [commitChapterEdit]);

  // Apply/remove the editable affordance when the toggle flips. Leaving edit
  // mode commits any block still focused.
  useEffect(() => {
    const c = contentRef.current; if (!c) return;
    if (!editMode) {
      const active = document.activeElement as HTMLElement | null;
      if (active && c.contains(active)) active.blur(); // fires focusout → commit
    } else {
      // Prefer <p> over <div> when Enter splits a paragraph (cleaner serialize).
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* unsupported */ }
    }
    setupEditable(c, editMode);
  }, [editMode]);

  // Delegated commit-on-blur + Enter/Escape, attached once.
  useEffect(() => {
    const c = contentRef.current; if (!c) return;
    const onFocusIn = (e: FocusEvent) => {
      const block = (e.target as HTMLElement)?.closest?.('.chapter-block') as HTMLElement | null;
      if (block && editModeRef.current) editOriginalHtml.set(block, block.innerHTML);
    };
    const onFocusOut = (e: FocusEvent) => {
      const block = (e.target as HTMLElement)?.closest?.('.chapter-block') as HTMLElement | null;
      // Ignore focus moves that stay inside the same editable chapter body.
      const to = (e as FocusEvent & { relatedTarget: EventTarget | null }).relatedTarget as Node | null;
      if (block && to && block.contains(to)) return;
      if (block && editModeRef.current) commitRef.current(block);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editModeRef.current) return;
      const block = (e.target as HTMLElement)?.closest?.('.chapter-block') as HTMLElement | null;
      if (!block) return;
      // Enter splits a paragraph (default contentEditable behavior); Escape
      // abandons the chapter's edits and restores the rendered source.
      if (e.key === 'Escape') { e.preventDefault(); cancelEditRef.current = true; block.blur(); }
    };
    c.addEventListener('focusin', onFocusIn as EventListener);
    c.addEventListener('focusout', onFocusOut as EventListener);
    c.addEventListener('keydown', onKeyDown as EventListener);
    return () => {
      c.removeEventListener('focusin', onFocusIn as EventListener);
      c.removeEventListener('focusout', onFocusOut as EventListener);
      c.removeEventListener('keydown', onKeyDown as EventListener);
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

      const goingDown = sy > lastScrollY.current;
      if (sy > 60) {
        if (goingDown && topbarVisible.current) { topbarVisible.current = false; setTopbarHidden(true); }
        else if (!goingDown && !topbarVisible.current) { topbarVisible.current = true; setTopbarHidden(false); }
      } else if (sy < 10) { topbarVisible.current = true; setTopbarHidden(false); }
      lastScrollY.current = sy;

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
        const label = `Ch. ${String(activeChapter.index).padStart(2, '0')}`;
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

  // Apply topbar hidden to real DOM element
  useEffect(() => {
    const tb = document.getElementById('topbar');
    if (tb) tb.classList.toggle('hidden', topbarHidden);
    const pt = document.getElementById('progress-track');
    if (pt) pt.classList.toggle('topbar-hidden', topbarHidden);
  }, [topbarHidden]);

  // Selection
  useEffect(() => {
    function onSelectionEnd(e: MouseEvent | TouchEvent) {
      if (!contentRef.current) return;
      if (editModeRef.current) return; // no annotate popup while editing prose
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
    if (mark) { closeAnnSidebar(); setTimeout(() => mark.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); }
  }, [closeAnnSidebar]);

  const removeMark = useCallback((id: string) => {
    const mark = contentRef.current?.querySelector(`mark[data-ann="${id}"]`);
    if (mark) { const p = mark.parentNode!; while (mark.firstChild) p.insertBefore(mark.firstChild, mark); p.removeChild(mark); (p as Element).normalize?.(); }
  }, []);

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
      <AnnotationSidebar
        open={annSidebarOpen} annotations={annotations} onClose={closeAnnSidebar}
        onDelete={id => { deleteAnnotation(id); removeMark(id); showToast('Annotation removed.'); }}
        onJumpTo={jumpToAnnotation}
        onImport={(payload) => {
          const { imported, session } = importSession(payload);
          const who = session?.readerName ? ` from ${session.readerName}` : '';
          const far = session ? (session.completedAt ? ' · finished' : ` · read ${Math.round(session.progress * 100)}%`) : '';
          showToast(`${imported} annotation${imported !== 1 ? 's' : ''} imported${who}${far}.`);
        }}
      />
      <SelectionPopup visible={selection.visible} position={selection.position} onSave={handleSaveAnnotation} onClose={() => setSelection(s => ({ ...s, visible: false, range: null }))} />
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
      <div id="content" ref={contentRef} />
      <div id="end-mark">End of manuscript</div>
      <div id="bottom-strip" className={scrollPct > 5 ? 'visible' : ''}>
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
        <div style={{ fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '8px' }}>Edit note</div>
        <textarea ref={ref} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(text.trim()); } if (e.key === 'Escape') onClose(); }}
          style={{ width: '100%', minHeight: '64px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--primary)', fontFamily: "'EB Garamond', Georgia, serif", fontSize: '15px', lineHeight: '1.5', outline: 'none', resize: 'none', padding: '0 0 8px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--border)' }} onClick={onDelete}>Delete</button>
          <button style={{ background: 'none', border: '1px solid var(--primary)', fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", fontSize: '10px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--primary)', padding: '5px 14px', cursor: 'pointer' }} onClick={() => onSave(text.trim())}>Save</button>
        </div>
      </div>
    </>
  );
}
