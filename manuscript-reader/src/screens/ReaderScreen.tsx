import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { AnnotationType } from '../engine/types';
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

interface ReaderScreenProps {
  onChapterLabelChange: (label: string) => void;
}

export function ReaderScreen({ onChapterLabelChange }: ReaderScreenProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entranceObs = useRef<IntersectionObserver | null>(null);

  const { manuscript, chapters, annotations, addAnnotation, updateAnnotation, deleteAnnotation, importAnnotations, openManuscript } = useReaderStore();
  const { navOpen, annSidebarOpen, reportPanelOpen, closeNav, closeAnnSidebar, closeReportPanel, toggleAnnSidebar, closeAllPanels } = useUIStore();
  const { updateProgress, getReadingPosition, appendChapters } = useLibraryStore();

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

  // Clock
  useEffect(() => {
    const tick = () => setClockTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick(); const id = setInterval(tick, 30000); return () => clearInterval(id);
  }, []);

  // Render content + entrance observer + restore position
  useEffect(() => {
    if (!manuscript?.metadata.combinedMarkdown || !contentRef.current) return;
    const { html } = parseMarkdown(manuscript.metadata.combinedMarkdown);
    contentRef.current.innerHTML = html;
    totalWords.current = manuscript.metadata.combinedMarkdown.trim().split(/\s+/).filter(Boolean).length;

    if (entranceObs.current) entranceObs.current.disconnect();
    entranceObs.current = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); entranceObs.current?.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    contentRef.current.querySelectorAll('p, blockquote, ul, ol').forEach(el => entranceObs.current?.observe(el));

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
      const mark = wrapTextInMark(c, ann.quote, ann.id, ann.type);
      if (mark) mark.addEventListener('click', e => { e.stopPropagation(); setEditingAnn({ id: ann.id, note: ann.note }); });
    });
  }, [annotations]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- reapply marks only when annotations change
  useEffect(() => { reapplyHighlights(); }, [annotations]);

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
    const ann = addAnnotation({ type, quote: text.slice(0, 400), note, chapterTitle, chapterIndex });
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
        <div style={{ fontFamily: "'Geist', sans-serif", fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '8px' }}>Edit note</div>
        <textarea ref={ref} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(text.trim()); } if (e.key === 'Escape') onClose(); }}
          style={{ width: '100%', minHeight: '64px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--primary)', fontFamily: "'EB Garamond', Georgia, serif", fontSize: '15px', lineHeight: '1.5', outline: 'none', resize: 'none', padding: '0 0 8px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Geist', sans-serif", fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--border)' }} onClick={onDelete}>Delete</button>
          <button style={{ background: 'none', border: '1px solid var(--primary)', fontFamily: "'Geist', sans-serif", fontSize: '10px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--primary)', padding: '5px 14px', cursor: 'pointer' }} onClick={() => onSave(text.trim())}>Save</button>
        </div>
      </div>
    </>
  );
}
