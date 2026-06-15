import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { AnnotationType, TextAnchor } from '../engine/types';
import { buildAnchor, locateAnchor, anchorFromQuote } from '../engine/annotations/anchor';
import { applyBlockEdit, htmlToMarkdownInline, sameProse } from '../engine/manuscript/blockEdit';
import { useReaderStore } from '../state/readerStore';
import { useUIStore } from '../state/uiStore';
import { useLibraryStore } from '../state/libraryStore';
import { computeReport } from '../engine/report';
import { parseMarkdown } from '../engine/ingestion/parseMarkdown';
import { chapterForOffset } from '../engine/manuscript/chapterForOffset';
import { ChapterNav } from '../components/reader/ChapterNav';
import { AnnotationSidebar } from '../components/reader/AnnotationSidebar';
import { SelectionPopup } from '../components/reader/SelectionPopup';
import { ReportPanel } from '../components/reports/ReportPanel';
import { AddChaptersModal } from '../components/reader/AddChaptersModal';
import { showToast } from '../components/ui/Toast';
import { exportRevisionPacket } from '../engine/exports/revisionPacket';
import { exportReportJson } from '../engine/exports/reportJson';

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
function markByAnchor(container: HTMLElement, anchor: TextAnchor, id: string, type: AnnotationType): HTMLElement | null {
  const full = container.textContent ?? '';
  const loc = locateAnchor(full, anchor);
  if (loc && loc.end > loc.start) {
    const range = textOffsetToRange(container, loc.start, loc.end);
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
  return wrapTextInMark(container, anchor.quote, id, type);
}

// Character offset of a Range's start within a container's rendered text.
function offsetInContainer(container: HTMLElement, range: Range): number {
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

// Per-paragraph snapshot of innerHTML at focus time, so a commit can tell a
// real edit from a focus-through and skip needless re-renders.
const editOriginalHtml = new WeakMap<HTMLElement, string>();

// Toggle the light-touch edit affordance: prose paragraphs (the only blocks
// that carry a source span) become contentEditable; everything else stays
// read-only. The reading layout is unchanged — only the cursor/affordance.
function setupEditable(container: HTMLElement, on: boolean) {
  container.classList.toggle('edit-mode', on);
  container.querySelectorAll('p[data-md-start]').forEach(p => {
    if (on) p.setAttribute('contenteditable', 'true');
    else p.removeAttribute('contenteditable');
  });
}

interface ReaderScreenProps {
  onChapterLabelChange: (label: string) => void;
}

export function ReaderScreen({ onChapterLabelChange }: ReaderScreenProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entranceObs = useRef<IntersectionObserver | null>(null);

  const { manuscript, chapters, annotations, edits, addAnnotation, updateAnnotation, deleteAnnotation, importAnnotations, openManuscript, recordEdit } = useReaderStore();
  const { navOpen, annSidebarOpen, reportPanelOpen, editMode, closeNav, closeAnnSidebar, closeReportPanel, toggleAnnSidebar, closeAllPanels } = useUIStore();
  const { library, updateProgress, getReadingPosition, appendChapters, replaceMarkdown } = useLibraryStore();

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
  const pendingEditScroll = useRef<number | null>(null); // set before an edit re-render to restore exact scroll (no resume/flash)
  const cancelEditRef = useRef(false);
  const commitRef = useRef<(p: HTMLElement) => void>(() => {});
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  // Clock
  useEffect(() => {
    const tick = () => setClockTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick(); const id = setInterval(tick, 30000); return () => clearInterval(id);
  }, []);

  // Render content + entrance observer + restore position
  useEffect(() => {
    if (!manuscript?.metadata.combinedMarkdown || !contentRef.current) return;
    const c = contentRef.current;
    const { html } = parseMarkdown(manuscript.metadata.combinedMarkdown);
    c.innerHTML = html;
    totalWords.current = manuscript.metadata.combinedMarkdown.trim().split(/\s+/).filter(Boolean).length;

    // An edit re-render: keep the reading posture — no fade-in, no resume toast,
    // restore the exact scroll, re-apply edit affordance and re-anchor marks.
    const editScroll = pendingEditScroll.current;
    if (editScroll != null) {
      pendingEditScroll.current = null;
      c.querySelectorAll('p, blockquote, ul, ol').forEach(el => el.classList.add('visible'));
      setupEditable(c, editModeRef.current);
      reapplyHighlights();
      window.scrollTo(0, editScroll);
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

  // Re-apply highlights
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

  // Commit one paragraph: serialize its edited HTML back to markdown, splice it
  // into the source at the block's recorded span, persist, and re-render. A
  // paragraph that was only focused-through (innerHTML unchanged) is left alone.
  const commitBlockEdit = useCallback((p: HTMLElement) => {
    const origHtml = editOriginalHtml.get(p);
    editOriginalHtml.delete(p);
    const cancelled = cancelEditRef.current; cancelEditRef.current = false;
    const startAttr = p.dataset.mdStart, endAttr = p.dataset.mdEnd;
    const md = manuscript?.metadata.combinedMarkdown;
    if (startAttr == null || endAttr == null || !md || !manuscript) return;
    if (!cancelled && origHtml !== undefined && p.innerHTML === origHtml) return; // untouched

    const norm = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const start = +startAttr, end = +endAttr;
    const original = norm.slice(start, end);
    const newSource = htmlToMarkdownInline(p.innerHTML);

    if (cancelled || !newSource || sameProse(newSource, original)) {
      rerenderInPlace(); // nothing to save — restore clean rendered HTML
      return;
    }
    const res = applyBlockEdit(norm, start, end, newSource);
    if (!res) { rerenderInPlace(); return; }
    const updated = replaceMarkdown(manuscript.id, res.markdown);
    if (updated) {
      // Record the author's decision as a durable Edit (distinct from a reader
      // annotation) before re-rendering — recordEdit persists synchronously, so
      // the openManuscript reload below picks it up. Attribute the chapter from
      // the edited paragraph's position; anchor in the source-markdown domain.
      const owner = chapterForOffset(
        chapters.map(ch => ({ chapter: ch, offset: document.getElementById(ch.id)?.offsetTop ?? Infinity })),
        (p.getBoundingClientRect().top + window.scrollY) + 100,
      );
      recordEdit({
        chapterId: owner?.id ?? '',
        chapterIndex: owner?.index ?? 0,
        chapterTitle: owner?.title ?? '',
        anchor: buildAnchor(norm, start, original),
        originalText: original,
        replacementText: newSource,
      });
      pendingEditScroll.current = window.scrollY;
      const { chapters: newChapters } = parseMarkdown(updated.metadata.combinedMarkdown!);
      openManuscript(updated, newChapters); // → render effect restores scroll, re-anchors
      showToast('Edit saved.');
    } else {
      rerenderInPlace();
      showToast('Could not save — manuscript not cached.');
    }
  }, [manuscript, chapters, replaceMarkdown, openManuscript, rerenderInPlace, recordEdit]);
  useEffect(() => { commitRef.current = commitBlockEdit; }, [commitBlockEdit]);

  // Apply/remove the editable affordance when the toggle flips. Leaving edit
  // mode commits any block still focused.
  useEffect(() => {
    const c = contentRef.current; if (!c) return;
    if (!editMode) {
      const active = document.activeElement as HTMLElement | null;
      if (active && c.contains(active)) active.blur(); // fires focusout → commit
    }
    setupEditable(c, editMode);
  }, [editMode]);

  // Delegated commit-on-blur + Enter/Escape, attached once.
  useEffect(() => {
    const c = contentRef.current; if (!c) return;
    const onFocusIn = (e: FocusEvent) => {
      const p = (e.target as HTMLElement)?.closest?.('p[data-md-start]') as HTMLElement | null;
      if (p && editModeRef.current) editOriginalHtml.set(p, p.innerHTML);
    };
    const onFocusOut = (e: FocusEvent) => {
      const p = (e.target as HTMLElement)?.closest?.('p[data-md-start]') as HTMLElement | null;
      if (p && editModeRef.current) commitRef.current(p);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editModeRef.current) return;
      const p = (e.target as HTMLElement)?.closest?.('p[data-md-start]') as HTMLElement | null;
      if (!p) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEditRef.current = true; p.blur(); }
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
    if (range) {
      const rect = range.getBoundingClientRect();
      const y = rect.top + window.scrollY;
      const owner = chapterForOffset(
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
    const quote = text.slice(0, 400);
    let anchor: TextAnchor | undefined;
    if (range && quote && contentRef.current) {
      const start = offsetInContainer(contentRef.current, range);
      anchor = buildAnchor(contentRef.current.textContent ?? '', start, quote);
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

  const reportMarkdown = manuscript?.metadata.combinedMarkdown;
  const report = React.useMemo(
    () => annotations.length > 0 ? computeReport(annotations, chapters, reportMarkdown) : null,
    [annotations, chapters, reportMarkdown],
  );

  // ── Export handlers ──
  const handleExportDocx = useCallback(async () => {
    if (!manuscript) return;
    if (!annotations.length) { showToast('No annotations yet.'); return; }
    const rep = computeReport(annotations, chapters, manuscript.metadata.combinedMarkdown);
    showToast('Building report…');
    try {
      const { exportRevisionDocx } = await import('../engine/exports/revisionDocx');
      await exportRevisionDocx(manuscript.metadata.title, manuscript.id, annotations, chapters, rep);
      showToast('Intelligence report exported.');
    } catch (e) {
      console.error('DOCX export error:', e);
      showToast('DOCX export failed — see console.');
    }
  }, [manuscript, annotations, chapters]);

  const handleExportHtml = useCallback(() => {
    if (!manuscript) return;
    if (!annotations.length) { showToast('No annotations yet.'); return; }
    const title = library.find(m => m.id === manuscript.id)?.metadata.title ?? manuscript.metadata.title;
    const rep = computeReport(annotations, chapters, manuscript.metadata.combinedMarkdown);
    import('../engine/exports/reportHtml').then(({ exportReportHtml }) => {
      exportReportHtml(title, manuscript.id, annotations, chapters, rep);
      showToast('Intelligence report exported.');
    }).catch(e => { console.error('HTML export error:', e); showToast('Export failed — see console.'); });
  }, [manuscript, library, annotations, chapters]);

  const handleExportRevisionLog = useCallback(() => {
    if (!manuscript) return;
    if (!edits.length) { showToast('No edits yet.'); return; }
    const title = library.find(m => m.id === manuscript.id)?.metadata.title ?? manuscript.metadata.title;
    import('../engine/exports/revisionLog').then(({ exportRevisionLog }) => {
      exportRevisionLog(title, manuscript.id, edits);
      showToast('Revision log exported.');
    }).catch(e => { console.error('Revision log export error:', e); showToast('Export failed — see console.'); });
  }, [manuscript, library, edits]);

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
        onExport={() => exportRevisionPacket(manuscript.metadata.title, manuscript.id, annotations, chapters)}
        onImport={(anns, reader) => { const n = importAnnotations(anns, reader); showToast(`${n} annotation${n !== 1 ? 's' : ''} imported.`); }}
      />
      <ReportPanel
        open={reportPanelOpen} report={report} onClose={closeReportPanel}
        onExport={() => exportReportJson(manuscript.metadata.title, manuscript.id, report!)}
        onExportDocx={handleExportDocx}
        onExportHtml={handleExportHtml}
        onExportRevisionLog={handleExportRevisionLog}
        editCount={edits.length}
        onJumpToChapter={idx => { const ch = chapters.find(c => c.index === idx); if (ch) jumpToChapter(ch.id); }}
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
