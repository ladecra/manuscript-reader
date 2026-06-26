import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReaderStore } from '../state/readerStore';
import { useLibraryStore } from '../state/libraryStore';
import { useSnapshotStore } from '../state/snapshotStore';
import { useUIStore } from '../state/uiStore';
import { computeEditorialSignals } from '../engine/editorialSignals';
import { resolveAnnotationChapters } from '../engine/annotations/chapterResolve';
import { getParsedManuscript } from '../engine/ingestion/parseCache';
import { estimateReadingPagePosition, chapterWordCounts, resumeChapterByProgress } from '../engine/reading/manuscriptPages';
import type { ManuscriptStatus, PublishingMetadata, Chapter, SnapshotMeta } from '../engine/types';
import { applyChapterEdits, type ChapterEdit } from '../engine/manuscript/chapterEdit';
import type { ExportManuscriptMeta } from '../engine/exports/manuscriptMarkdown';
import { ChapterTree } from '../components/library/ChapterTree';
import { AddChaptersModal } from '../components/reader/AddChaptersModal';
import { ReportView } from '../components/reports/ReportView';
import { ExportChoiceModal } from '../components/reports/ExportChoiceModal';
import { exportShareableReader, ShareReaderBuildError, type ShareSnapshotStamp } from '../engine/exports/shareableReader';
import { loadSnapshot, loadWorkPosition, loadNote, saveNote } from '../engine/storage';
import { hasMeaningfulEdits } from '../engine/manuscript/changeList';
import type { WorkMode } from '../engine/reader/positionIntent';
import { ShareReaderModal } from '../components/share/ShareReaderModal';
import { showToast } from '../components/ui/Toast';
import { PencilIcon, ChevronLeftIcon, DotsIcon, DownloadIcon, LayersIcon, PlusIcon, XIcon, UndoIcon } from '../components/ui/Icons';
import { CoverImage } from '../components/ui/CoverImage';
import { ManuscriptWorkspaceRail, type HubPane } from '../components/layout/ManuscriptWorkspaceRail';
import { FeedbackTab } from '../components/hub/FeedbackTab';

// The manuscript page: a book's antechamber. Shared `.instrument-*` list styling
// (hub rail, contents, publishing fields) is the evolving shell language; a
// collapsible reader-side rail can reuse it later (library → hub, tools → reader).

interface ManuscriptHubScreenProps {
  onRead: () => void;   // enter the immersive reader at the resume position
  onExit: () => void;   // back to the library
}

export function ManuscriptHubScreen({ onRead, onExit }: ManuscriptHubScreenProps) {
  const { manuscript, chapters, annotations: rawAnnotations, edits, sessions, openManuscript } = useReaderStore();
  const { library, updateManuscript, replaceMarkdown, appendChapters, getReadingPosition, updateProgress, cycleStatus } = useLibraryStore();
  const { setPendingChapterIndex, setPendingReaderIntent, setPendingAnnotationId, setPendingResumeFrac, hubPane: pane, setHubPane } = useUIStore();
  const { versions: versionsByMs, refresh: refreshVersions, saveVersion, relabel, remove: removeVersion } = useSnapshotStore();
  const [editStructure, setEditStructure] = useState(false);
  const [chapterEdits, setChapterEdits] = useState<ChapterEdit[]>([]);
  const [addChaptersOpen, setAddChaptersOpen] = useState(false);
  const [tocQuery, setTocQuery] = useState('');
  const [tocCompact, setTocCompact] = useState(false);
  const [openChapterMenu, setOpenChapterMenu] = useState<number | null>(null);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [shareReaderOpen, setShareReaderOpen] = useState(false);
  const [shareReaderInitialMode, setShareReaderInitialMode] = useState<'reading' | 'annotating'>('annotating');
  const [reportExportOpen, setReportExportOpen] = useState(false);

  // Working Notes scratchpad — loaded on demand per manuscript, debounce-saved.
  // Local-first (the storage layer doesn't push it to the cloud yet).
  const [note, setNote] = useState('');
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNoteRef = useRef<{ id: string; value: string } | null>(null);
  const manuscriptId = manuscript?.id;
  const flushNote = useCallback(() => {
    if (noteSaveTimer.current) { clearTimeout(noteSaveTimer.current); noteSaveTimer.current = null; }
    if (pendingNoteRef.current) { saveNote(pendingNoteRef.current.id, pendingNoteRef.current.value); pendingNoteRef.current = null; }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset/hydrate the note when the manuscript changes
    if (!manuscriptId) { setNote(''); return; }
    let cancelled = false;
    loadNote(manuscriptId).then(t => { if (!cancelled) setNote(t); });
    // Flush a pending edit before switching manuscripts (or unmount) so the last
    // few keystrokes before navigating away are never dropped.
    return () => { cancelled = true; flushNote(); };
  }, [manuscriptId, flushNote]);
  const onNoteChange = useCallback((value: string) => {
    setNote(value);
    if (!manuscriptId) return;
    pendingNoteRef.current = { id: manuscriptId, value };
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = setTimeout(() => {
      saveNote(manuscriptId, value);
      pendingNoteRef.current = null;
    }, 600);
  }, [manuscriptId]);

  const title = manuscript?.metadata.title ?? '';
  const combinedMarkdown = manuscript?.metadata.combinedMarkdown;
  const manuscriptAvailable = !!combinedMarkdown;

  // Re-home every annotation to its CURRENT chapter before it reaches Feedback,
  // EditorialSignals, the report, or any export. Positional chapter ids drift on
  // structural edits; the stored chapterIndex/chapterTitle are a stale cache, so
  // we refresh them in-memory (non-destructive) from each anchor. One boundary,
  // every downstream consumer corrected. See engine/annotations/chapterResolve.
  const annotations = useMemo(
    () => resolveAnnotationChapters(rawAnnotations, combinedMarkdown),
    [rawAnnotations, combinedMarkdown],
  );
  const pct = manuscript ? Math.round(getReadingPosition(manuscript.id) * 100) : 0;
  const progressFrac = manuscript ? getReadingPosition(manuscript.id) : 0;

  // Version snapshots (Phase 8) for this manuscript. The store mirrors the
  // synchronous snapshot index; refresh once on mount so a freshly hydrated /
  // cross-device-synced history shows up.
  const versions = manuscript ? versionsByMs[manuscript.id] ?? [] : [];
  useEffect(() => {
    if (manuscript) refreshVersions(manuscript.id);
  }, [manuscript, refreshVersions]);

  const handleSaveVersion = useCallback(() => {
    if (!manuscript) return;
    const meta = saveVersion(manuscript);
    if (meta) showToast(`Saved “${meta.label}”.`);
    else showToast('Source text unavailable — re-import to save a version.');
  }, [manuscript, saveVersion]);

  // Make a saved version the live draft again. Restore is itself reversible: we
  // freeze the current draft first, so nothing is ever silently replaced. Only
  // the text is restored — live annotations stay put and re-anchor against it.
  const handleRestoreVersion = useCallback(async (snapshotId: string) => {
    if (!manuscript) return;
    const snap = await loadSnapshot(manuscript.id, snapshotId);
    if (!snap?.markdown) { showToast('Could not load that version.'); return; }
    saveVersion(manuscript, `Before restore · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
    const updated = replaceMarkdown(manuscript.id, snap.markdown);
    if (!updated?.metadata.combinedMarkdown) { showToast('Could not restore that version.'); return; }
    openManuscript(updated, getParsedManuscript(updated.metadata.combinedMarkdown).chapters);
    showToast(`Restored “${snap.label ?? 'version'}”.`);
  }, [manuscript, saveVersion, replaceMarkdown, openManuscript]);
  const pageEstimate = useMemo(() => {
    const wc = manuscript?.metadata.wordCount ?? 0;
    return estimateReadingPagePosition(wc, progressFrac);
  }, [manuscript?.metadata.wordCount, progressFrac]);

  const filteredChapters = useMemo(() => {
    const q = tocQuery.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter(ch =>
      String(ch.index).includes(q) || (ch.title ?? '').toLowerCase().includes(q),
    );
  }, [chapters, tocQuery]);

  const signals = useMemo(
    () => manuscript
      ? computeEditorialSignals({ manuscriptId: manuscript.id, annotations, chapters, sessions, combinedMarkdown })
      : null,
    [manuscript, annotations, chapters, sessions, combinedMarkdown],
  );

  const wordsByChapter = useMemo(
    () => combinedMarkdown ? chapterWordCounts(combinedMarkdown) : new Map<number, number>(),
    [combinedMarkdown],
  );

  const resumeChapter = useMemo(
    () => resumeChapterByProgress(chapters, wordsByChapter, progressFrac) ?? null,
    [chapters, wordsByChapter, progressFrac],
  );

  // Enter the reader at a chapter, optionally in a posture (annotate / edit) — the
  // contents-row hover actions. Plain Read passes no intent (just lands there).
  const enterReader = useCallback((chapterIndex: number, intent?: 'annotate' | 'edit') => {
    setPendingChapterIndex(chapterIndex);
    setPendingReaderIntent(intent ?? null);
    onRead();
  }, [setPendingChapterIndex, setPendingReaderIntent, onRead]);

  // Report jumps land the author in the prose. Annotation-derived items (findings,
  // consensus, reaction insights) open Annotations mode — and, when we know the
  // specific annotation, scroll to that mark; prose/length items just land in
  // reading at the chapter's start.
  const jumpToChapter = useCallback(
    (index: number, opts?: { annotationId?: string; annotate?: boolean }) => {
      setPendingAnnotationId(opts?.annotationId ?? null);
      enterReader(index, opts?.annotate ? 'annotate' : undefined);
    },
    [enterReader, setPendingAnnotationId],
  );

  const startOver = useCallback(() => {
    if (manuscript) updateProgress(manuscript.id, 0);
    onRead();
  }, [manuscript, updateProgress, onRead]);

  // The author-supplied data exports render into front matter — assembled fresh so
  // it always reflects the latest saved metadata.
  const exportMeta = useCallback((): ExportManuscriptMeta => ({
    title: library.find(m => m.id === manuscript?.id)?.metadata.title ?? title,
    author: manuscript?.metadata.author,
    publishing: manuscript?.metadata.publishing,
  }), [library, manuscript, title]);

  // ── Exports (every artifact in one home; metadata flows into the manuscript ones). ──
  const handleExportReportDocx = useCallback(async () => {
    if (!manuscript || !annotations.length) { showToast('No annotations yet.'); return; }
    const sig = computeEditorialSignals({ manuscriptId: manuscript.id, annotations, chapters, sessions, combinedMarkdown: manuscript.metadata.combinedMarkdown });
    showToast('Building report…');
    try {
      const { exportRevisionDocx } = await import('../engine/exports/revisionDocx');
      await exportRevisionDocx(manuscript.metadata.title, manuscript.id, annotations, chapters, sig);
      showToast('Intelligence report exported.');
    } catch (e) { console.error('DOCX export error:', e); showToast('DOCX export failed — see console.'); }
  }, [manuscript, annotations, chapters, sessions]);

  const handleExportReportHtml = useCallback(() => {
    if (!manuscript || !annotations.length) { showToast('No annotations yet.'); return; }
    const sig = computeEditorialSignals({ manuscriptId: manuscript.id, annotations, chapters, sessions, combinedMarkdown: manuscript.metadata.combinedMarkdown });
    import('../engine/exports/reportHtml').then(({ exportReportHtml }) => {
      exportReportHtml(exportMeta().title, manuscript.id, annotations, chapters, sig);
      showToast('Intelligence report exported.');
    }).catch(e => { console.error('HTML export error:', e); showToast('Export failed — see console.'); });
  }, [manuscript, annotations, chapters, sessions, exportMeta]);

  const handleExportReportJson = useCallback(() => {
    if (!manuscript || !annotations.length) { showToast('No annotations yet.'); return; }
    const sig = computeEditorialSignals({ manuscriptId: manuscript.id, annotations, chapters, sessions, combinedMarkdown: manuscript.metadata.combinedMarkdown });
    import('../engine/exports/reportJson').then(({ exportReportJson }) => {
      exportReportJson(exportMeta().title, manuscript.id, sig);
      showToast('Report data exported.');
    }).catch(e => { console.error('JSON export error:', e); showToast('Export failed — see console.'); });
  }, [manuscript, annotations, chapters, sessions, exportMeta]);

  const handleExportManuscript = useCallback(async (format: 'epub' | 'docx' | 'md') => {
    if (!manuscript) return;
    const md = manuscript.metadata.combinedMarkdown;
    if (!md) { showToast('Manuscript not cached — re-import the file to export it.'); return; }
    try {
      if (format === 'md') {
        const { exportManuscriptMarkdown } = await import('../engine/exports/manuscriptMarkdown');
        exportManuscriptMarkdown(exportMeta(), manuscript.id, md);
      } else if (format === 'epub') {
        const { exportManuscriptEpub } = await import('../engine/exports/manuscriptEpub');
        exportManuscriptEpub(exportMeta(), manuscript.id, md);
      } else {
        showToast('Building manuscript…');
        const { exportManuscriptDocx } = await import('../engine/exports/manuscriptDocx');
        await exportManuscriptDocx(exportMeta(), manuscript.id, md);
      }
      showToast('Manuscript exported.');
    } catch (e) { console.error('Manuscript export error:', e); showToast('Export failed — see console.'); }
  }, [manuscript, exportMeta]);

  const handleExportRevisionLog = useCallback(() => {
    if (!manuscript || !edits.length) { showToast('No edits yet.'); return; }
    import('../engine/exports/revisionLog').then(({ exportRevisionLog }) => {
      exportRevisionLog(exportMeta().title, manuscript.id, edits);
      showToast('Revision log exported.');
    }).catch(e => { console.error('Revision log export error:', e); showToast('Export failed — see console.'); });
  }, [manuscript, edits, exportMeta]);

  // Share a frozen version with a beta reader (optional annotation tools).
  const handleShareReaderDownload = useCallback(async (snapshotId: string | null, withAnnotations: boolean) => {
    if (!manuscript) return;
    let markdown: string | undefined;
    let stamp: ShareSnapshotStamp | undefined;
    if (snapshotId) {
      const snap = await loadSnapshot(manuscript.id, snapshotId);
      if (!snap?.markdown) {
        showToast('Could not load that version — re-import the manuscript.');
        return;
      }
      markdown = snap.markdown;
      stamp = {
        snapshotId: snap.id,
        versionId: snap.versionId,
        label: snap.label,
        createdAt: snap.createdAt,
      };
    } else {
      markdown = manuscript.metadata.combinedMarkdown;
      if (!markdown) {
        showToast('Re-import this file to share it.');
        return;
      }
    }
    try {
      exportShareableReader(exportMeta().title, markdown, withAnnotations, stamp);
      showToast('Reader file downloaded.');
    } catch (e) {
      console.error('Share reader build failed:', e);
      showToast(e instanceof ShareReaderBuildError ? e.message : 'Could not generate file.');
    }
  }, [manuscript, exportMeta]);

  const openShareReader = useCallback((mode: 'reading' | 'annotating') => {
    setShareReaderInitialMode(mode);
    setShareReaderOpen(true);
  }, []);

  // Persist the Details form (publishing metadata + title-page fields), then re-open
  // so the page and any export see the fresh manuscript.
  const saveDetails = useCallback((patch: { title: string; author: string; status: ManuscriptStatus; publishing: PublishingMetadata }) => {
    if (!manuscript) return;
    updateManuscript(manuscript.id, patch);
    const refreshed = useLibraryStore.getState().library.find(m => m.id === manuscript.id);
    if (refreshed) openManuscript(refreshed, chapters);
    showToast('Saved.');
  }, [manuscript, chapters, updateManuscript, openManuscript]);

  // Persist chapter-structure edits (reorder / rename / remove) made on Overview.
  const saveChapters = useCallback(() => {
    if (!manuscript || !combinedMarkdown || chapterEdits.length === 0) { showToast('No chapter changes.'); return; }
    const newMd = applyChapterEdits(combinedMarkdown, chapterEdits);
    if (newMd && newMd !== combinedMarkdown) {
      const updated = replaceMarkdown(manuscript.id, newMd);
      if (updated) {
        openManuscript(updated, getParsedManuscript(updated.metadata.combinedMarkdown!).chapters);
        setChapterEdits([]);
        showToast('Chapters updated.');
        return;
      }
    }
    showToast('No chapter changes.');
  }, [manuscript, combinedMarkdown, chapterEdits, replaceMarkdown, openManuscript]);

  const handleAppendChapters = useCallback((chunk: string) => {
    if (!manuscript) return;
    const updated = appendChapters(manuscript.id, chunk);
    if (!updated) { showToast('Manuscript not cached — reload files first.'); setAddChaptersOpen(false); return; }
    const { chapters: newChapters } = getParsedManuscript(updated.metadata.combinedMarkdown!);
    const added = newChapters.length - chapters.length;
    openManuscript(updated, newChapters);
    setAddChaptersOpen(false);
    showToast(added > 0 ? `${added} chapter${added !== 1 ? 's' : ''} added — now ${newChapters.length} total` : 'Chapters appended.');
  }, [manuscript, chapters, appendChapters, openManuscript]);

  const toggleToolPane = useCallback((id: HubPane) => {
    setHubPane(pane === id ? 'contents' : id);
  }, [pane, setHubPane]);

  // Resume a mode's work where the author left off: prefer the saved work-position
  // bookmark; otherwise land at the chapter of the most recent annotation/edit.
  // (No bookmark on a fresh device — the chapter fallback still does the right thing.)
  const resumeWork = useCallback((mode: WorkMode, chapterIndex: number | null) => {
    if (!manuscript) return;
    const frac = loadWorkPosition(manuscript.id, mode);
    setPendingReaderIntent(mode === 'annotations' ? 'annotate' : 'changes');
    if (frac > 0.001) setPendingResumeFrac(frac);
    else if (chapterIndex != null) setPendingChapterIndex(chapterIndex);
    onRead();
  }, [manuscript, setPendingReaderIntent, setPendingResumeFrac, setPendingChapterIndex, onRead]);

  // The rail's two "pick up where you left off" rows — wayfinding, not a feed. The
  // chapter label is derived from the most recent annotation (chapters already
  // re-homed from anchors above) and the most recent meaningful edit.
  const wayfinding = useMemo(() => {
    const latestAnn = annotations.length
      ? annotations.reduce((a, b) => (b.createdAt ?? 0) > (a.createdAt ?? 0) ? b : a)
      : null;
    const latestEdit = hasMeaningfulEdits(edits) && edits.length
      ? edits.reduce((a, b) => (b.createdAt ?? 0) > (a.createdAt ?? 0) ? b : a)
      : null;
    // "Ch. 01 · Title" — number first (zero-padded), title when we have one.
    // Front matter (index 0) has no chapter number, so fall back to the title alone.
    const label = (chapterIndex: number, chapterTitle?: string): string | null => {
      const title = chapterTitle?.trim();
      const num = chapterIndex > 0 ? `Ch. ${String(chapterIndex).padStart(2, '0')}` : '';
      return num && title ? `${num} · ${title}` : (title || num || null);
    };
    return {
      annotations: {
        chapterLabel: latestAnn ? label(latestAnn.chapterIndex, latestAnn.chapterTitle) : null,
        onResume: () => resumeWork('annotations', latestAnn?.chapterIndex ?? null),
      },
      changes: {
        chapterLabel: latestEdit ? label(latestEdit.chapterIndex, latestEdit.chapterTitle) : null,
        onResume: () => resumeWork('changes', latestEdit?.chapterIndex ?? null),
      },
    };
  }, [annotations, edits, resumeWork]);

  if (!manuscript) return null;

  const { author, wordCount, chapterCount, status, uncached, publishing } = manuscript.metadata;
  const readerCount = new Set(annotations.map(a => a.readerId ?? a.readerName).filter(Boolean)).size;
  const savedLabel = manuscript.metadata.lastOpened
    ? `Auto-saved · ${new Date(manuscript.metadata.lastOpened).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : 'Auto-saved';

  return (
    <div className="hub hub--3col">
      <main className="hub-main">
        {uncached && (
          <div className="hub-warn" role="alert">
            ⚠ Source text offloaded to free storage space. Reading, editing, and export are paused —
            re-import the file from <strong>Load</strong> to restore it.
          </div>
        )}

        {pane === 'contents' ? (
          <div className="hub-panel">
            <div className="hub-page-top">
              <button type="button" className="hub-back" onClick={onExit}>
                <ChevronLeftIcon size={10} />
                Back to Library
              </button>
              <button type="button" className="hub-open-reader" onClick={onRead} disabled={!manuscriptAvailable}>
                Open in reader <span aria-hidden="true">→</span>
              </button>
            </div>
            <header className="hub-hero">
            <div className="hub-hero-cover-wrap">
              <div className="hub-hero-cover">
                <CoverImage manuscriptId={manuscript.id} title={title} editable />
              </div>
            </div>
            <div className="hub-hero-text">
              {publishing?.series && <div className="hub-hero-series">{publishing.series}</div>}
              <h1 className="hub-hero-title">{title}</h1>
              {author && <div className="hub-hero-byline">{author}</div>}
              {publishing?.genre?.trim() ? (
                <div className="hub-hero-genre">
                  <span>{publishing.genre.trim()}</span>
                  <button type="button" className="hub-hero-genre-edit" onClick={() => setHubPane('details')} aria-label="Edit genre and synopsis">
                    <PencilIcon size={14} />
                  </button>
                </div>
              ) : (
                <button type="button" className="hub-hero-genre-add" onClick={() => setHubPane('details')}>
                  Add genre &amp; synopsis
                </button>
              )}
              {publishing?.subtitle && <div className="hub-hero-subtitle">{publishing.subtitle}</div>}
              {publishing?.synopsis?.trim() && (
                <p className="hub-hero-synopsis">{publishing.synopsis.trim()}</p>
              )}
              <button
                type="button"
                className={`hub-hero-status ms-status ${hubStatusClass(status ?? 'Draft')}`}
                onClick={() => {
                  if (!manuscript) return;
                  cycleStatus(manuscript.id);
                  const refreshed = useLibraryStore.getState().library.find(m => m.id === manuscript.id);
                  if (refreshed) openManuscript(refreshed, chapters);
                }}
              >
                {status ?? 'Draft'}
              </button>
            </div>
            {/* Stats are a direct child of .hub-hero (not nested in the text
                column) so they can span the full hero width on mobile instead of
                bunching into the narrow column beside the cover. */}
            <div className="hub-hero-stats" aria-label="Manuscript summary">
              {wordCount != null && wordCount > 0 && (
                <div className="hub-stat">
                  <span className="hub-stat-value">{wordCount.toLocaleString()}</span>
                  <span className="hub-stat-label">Words</span>
                </div>
              )}
              <div className="hub-stat">
                <span className="hub-stat-value">{chapterCount ?? 0}</span>
                <span className="hub-stat-label">Chapters</span>
              </div>
              <div className="hub-stat">
                <span className="hub-stat-value">{annotations.length > 0 ? annotations.length : '—'}</span>
                <span className="hub-stat-label">Annotations</span>
              </div>
              <div className="hub-stat">
                <span className="hub-stat-value hub-stat-value--meta">{hubLastOpenedLabel(manuscript.metadata.lastOpened)}</span>
                <span className="hub-stat-label">Last opened</span>
              </div>
            </div>
          </header>

          <section className="hub-continue">
            <div className="hub-continue-main">
              <div className="hub-continue-eyebrow">
                {pct > 1 ? 'Continue reading' : 'Start reading'}
              </div>
              {resumeChapter && (
                <p className="hub-continue-place">
                  Chapter {resumeChapter.index}
                  {resumeChapter.title ? ` · ${resumeChapter.title}` : ''}
                </p>
              )}
              <div className="hub-continue-bar" aria-hidden="true">
                <div className="hub-continue-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="hub-continue-pct">
                {pct > 0 ? (
                  <>
                    {pct}% complete
                    {wordCount != null && wordCount > 0 && (
                      <> · Page {pageEstimate.current} of {pageEstimate.total}</>
                    )}
                  </>
                ) : (
                  'Not yet opened in the reader'
                )}
              </p>
            </div>
            <div className="hub-continue-aside">
              <button type="button" className="hub-continue-btn btn-fill" onClick={onRead} disabled={!manuscriptAvailable}>
                {pct > 1 ? 'Continue reading' : 'Start reading'}
              </button>
              {pct > 1 && (
                <button type="button" className="hub-continue-restart" onClick={startOver} disabled={!manuscriptAvailable}>
                  Start from the beginning
                </button>
              )}
            </div>
          </section>

          <section className="hub-toc-section hub-surface-card">
            <div className="hub-toc-head">
              <div className="instrument-group-label hub-section-label--bare">Contents</div>
              <div className="hub-toc-actions">
                <label className="hub-toc-search">
                  <span className="visually-hidden">Search chapters</span>
                  <input
                    type="search"
                    className="hub-toc-search-input"
                    placeholder="Search chapters"
                    value={tocQuery}
                    onChange={e => setTocQuery(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={`btn-ghost${tocCompact ? ' active' : ''}`}
                  onClick={() => setTocCompact(v => !v)}
                >
                  View
                </button>
                <button
                  type="button"
                  className={`btn-ghost${editStructure ? ' active' : ''}`}
                  onClick={() => setEditStructure(v => !v)}
                >
                  {editStructure ? 'Done' : 'Edit'}
                </button>
              </div>
            </div>

            {editStructure ? (
              <div className="hub-form">
                <ChapterTree key={combinedMarkdown} combinedMarkdown={combinedMarkdown} onChange={setChapterEdits} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
                  <button className="edit-save-btn" style={{ alignSelf: 'flex-start' }}
                    onClick={() => { saveChapters(); setEditStructure(false); }}>Save chapter changes</button>
                  <button className="btn-ghost" style={{ alignSelf: 'flex-start' }}
                    onClick={() => setAddChaptersOpen(true)}>+ Add chapters</button>
                </div>
              </div>
            ) : (
              <nav className={`instrument-nav${tocCompact ? ' instrument-nav--compact' : ''}`} aria-label="Table of contents">
                {filteredChapters.map(ch => (
                  <HubTocRow
                    key={ch.id}
                    ch={ch}
                    wordCount={wordsByChapter.get(ch.index)}
                    isActive={resumeChapter?.index === ch.index}
                    compact={tocCompact}
                    menuOpen={openChapterMenu === ch.index}
                    onToggleMenu={() => setOpenChapterMenu(id => (id === ch.index ? null : ch.index))}
                    onCloseMenu={() => setOpenChapterMenu(null)}
                    onRead={() => enterReader(ch.index)}
                    onAnnotate={() => enterReader(ch.index, 'annotate')}
                    onEdit={() => enterReader(ch.index, 'edit')}
                    onStartOver={startOver}
                  />
                ))}
                {filteredChapters.length === 0 && (
                  <p className="hub-toc-empty">No chapters match your search.</p>
                )}
              </nav>
            )}
          </section>
          </div>
        ) : (
          <div className="hub-panel hub-tool-pane">
            <button type="button" className="btn-ghost" style={{ marginBottom: '30px' }} onClick={() => setHubPane('contents')}>‹ Contents</button>

            {pane === 'details' && (
              <DetailsTab
                key={manuscript.id}
                title={title} author={author ?? ''} status={(status as ManuscriptStatus) ?? 'Draft'}
                publishing={publishing ?? {}}
                onSave={saveDetails}
              />
            )}

            {pane === 'feedback' && (
              <FeedbackTab
                annotations={annotations}
                readerCount={readerCount}
                manuscriptTitle={title}
                manuscriptAvailable={manuscriptAvailable}
                versions={versions}
                liveMarkdown={combinedMarkdown}
                onRead={onRead}
                onAnnotate={() => enterReader(resumeChapter?.index ?? chapters[0]?.index ?? 1, 'annotate')}
                onShareDownload={handleShareReaderDownload}
                onSaveVersion={handleSaveVersion}
              />
            )}

            {pane === 'versions' && (
              <VersionsTab
                versions={versions}
                manuscriptAvailable={manuscriptAvailable}
                onSaveVersion={handleSaveVersion}
                onRestore={handleRestoreVersion}
                onRelabel={(snapId, label) => manuscript && relabel(manuscript.id, snapId, label)}
                onDelete={snapId => manuscript && removeVersion(manuscript.id, snapId)}
              />
            )}

            {pane === 'report' && (
              <div className="hub-panel">
                <div className="hub-overview-head">
                  <h2 className="hub-panel-title">Manuscript Intelligence</h2>
                  <button
                    type="button"
                    className="btn-cta-gold"
                    disabled={annotations.length === 0}
                    title={annotations.length === 0 ? 'Prose analysis shows here now; add a note or import reader feedback to download the full report' : undefined}
                    onClick={() => setReportExportOpen(true)}
                  >
                    <DownloadIcon size={13} />
                    Download report
                  </button>
                </div>
                <p className="hub-panel-lead">Prose measured against its own average, and reader signals traced to specific actions — pointers worth a second look, never verdicts.</p>
                <div className="hub-report"><ReportView signals={signals} onJump={jumpToChapter} /></div>
                <ExportChoiceModal
                  open={reportExportOpen}
                  heading="Download editorial report"
                  subject={title}
                  primaryLabel="Download report"
                  formats={[
                    { key: 'docx', label: 'Word', desc: 'Best for sharing, comments, and print.' },
                    { key: 'html', label: 'Web page', desc: 'Self-contained HTML — opens in any browser.' },
                  ]}
                  onClose={() => setReportExportOpen(false)}
                  onExport={async (key) => {
                    if (key === 'docx') await handleExportReportDocx();
                    else handleExportReportHtml();
                  }}
                />
              </div>
            )}

            {pane === 'exports' && (
              <ExportsTab
                manuscriptAvailable={manuscriptAvailable}
                annCount={annotations.length}
                editCount={edits.length}
                hasPublishing={!!publishing && Object.values(publishing).some(Boolean)}
                onGoToDetails={() => setHubPane('details')}
                onExportManuscript={handleExportManuscript}
                onExportReportDocx={handleExportReportDocx}
                onExportReportHtml={handleExportReportHtml}
                onExportReportJson={handleExportReportJson}
                onExportRevisionLog={handleExportRevisionLog}
                onOpenShareReader={openShareReader}
              />
            )}
          </div>
        )}
      </main>

      <ManuscriptWorkspaceRail
        context="hub"
        pane={pane}
        annotationCount={annotations.length}
        versionCount={versions.length}
        savedLabel={savedLabel}
        wayfinding={wayfinding}
        note={{ value: note, onChange: onNoteChange }}
        className={mobileToolsOpen ? undefined : 'hub-tools--mobile-hidden'}
        onTogglePane={toggleToolPane}
        onRead={onRead}
        onOpenAnnotations={() => setHubPane('feedback')}
      />

      <div className="hub-mobile-bar">
        <button
          type="button"
          className={`hub-mobile-bar-btn${mobileToolsOpen ? ' hub-mobile-bar-btn--open' : ''}`}
          onClick={() => setMobileToolsOpen(o => !o)}
          aria-expanded={mobileToolsOpen}
        >
          <span className="hub-mobile-bar-label">Tools</span>
          <span className="hub-mobile-bar-chevron" aria-hidden="true">{mobileToolsOpen ? '↓' : '↑'}</span>
        </button>
      </div>
      <ShareReaderModal
        key={shareReaderOpen ? shareReaderInitialMode : 'closed'}
        open={shareReaderOpen}
        title={title}
        versions={versions}
        liveMarkdown={combinedMarkdown}
        manuscriptAvailable={manuscriptAvailable}
        initialMode={shareReaderInitialMode}
        onClose={() => setShareReaderOpen(false)}
        onSaveVersion={handleSaveVersion}
        onDownload={handleShareReaderDownload}
      />

      <AddChaptersModal
        open={addChaptersOpen}
        manuscriptTitle={title}
        onClose={() => setAddChaptersOpen(false)}
        onAppend={handleAppendChapters}
      />
    </div>
  );
}

function hubStatusClass(status: string): string {
  return 'status--' + status.toLowerCase().replace(/[^a-z]+/g, '-');
}

function hubLastOpenedLabel(ts: number | undefined): string {
  if (!ts) return '—';
  const opened = new Date(ts);
  const now = new Date();
  const sameDay = opened.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today, ${opened.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (opened.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${opened.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  return opened.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function HubTocRow({
  ch, wordCount, isActive, compact, menuOpen, onToggleMenu, onCloseMenu, onRead, onAnnotate, onEdit, onStartOver,
}: {
  ch: Chapter;
  wordCount: number | undefined;
  isActive: boolean;
  compact: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRead: () => void;
  onAnnotate: () => void;
  onEdit: () => void;
  onStartOver: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onCloseMenu();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseMenu();
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, onCloseMenu]);

  return (
    <div
      className={`instrument-item instrument-item--toc${isActive ? ' active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onRead}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRead(); } }}
    >
      <span className="instrument-item-label instrument-item-label--serif">
        <span className="instrument-item-num">{ch.index}</span>
        {ch.title}
      </span>
      {!compact && wordCount != null && (
        <span className="instrument-item-meta">{wordCount.toLocaleString()}</span>
      )}
      <div className="hub-toc-menu-wrap" ref={menuRef}>
        <button
          type="button"
          className="btn-icon"
          aria-label={`Chapter ${ch.index} actions`}
          aria-expanded={menuOpen}
          onClick={e => { e.stopPropagation(); onToggleMenu(); }}
        >
          <DotsIcon size={13} />
        </button>
        {menuOpen && (
          <div className="hub-toc-menu" role="menu">
            <button type="button" role="menuitem" onClick={e => { e.stopPropagation(); onCloseMenu(); onRead(); }}>Read</button>
            <button type="button" role="menuitem" onClick={e => { e.stopPropagation(); onCloseMenu(); onAnnotate(); }}>Annotate</button>
            <button type="button" role="menuitem" onClick={e => { e.stopPropagation(); onCloseMenu(); onEdit(); }}>Edit prose</button>
            <button type="button" role="menuitem" className="hub-toc-menu-muted" onClick={e => { e.stopPropagation(); onCloseMenu(); onStartOver(); }}>Start from beginning</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Details: title page + publishing metadata. Every field here flows into the
// manuscript's DOCX/Markdown exports (front matter, copyright page, dedication). ──

const STATUS_META: { s: ManuscriptStatus; icon: string }[] = [
  { s: 'Draft',        icon: '○' },
  { s: 'In Progress',  icon: '◑' },
  { s: 'Final Polish', icon: '✦' },
  { s: 'Complete',     icon: '✓' },
  { s: 'Archived',     icon: '⊡' },
];

function PubField({ label, id, value, onChange, placeholder = '', max, wide = false }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; max: number; wide?: boolean;
}) {
  return (
    <div className={`pub-field${wide ? ' pub-field--wide' : ''}`}>
      <label className="instrument-field-label" htmlFor={id}>{label}</label>
      <input id={id} className="pub-field-input" type="text" value={value}
        placeholder={placeholder} maxLength={max} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function PubTextarea({ label, id, value, onChange, placeholder = '', max, wide = false, counterNearLimit = false }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; max: number; wide?: boolean; counterNearLimit?: boolean;
}) {
  const showCounter = counterNearLimit && value.length >= max * 0.85;
  return (
    <div className={`pub-field${wide ? ' pub-field--wide' : ''}`}>
      <label className="instrument-field-label" htmlFor={id}>{label}</label>
      <textarea id={id} className="pub-field-input pub-field-textarea" value={value}
        placeholder={placeholder} maxLength={max} rows={4}
        onChange={e => onChange(e.target.value)} />
      {showCounter && (
        <span className="pub-field-counter" aria-live="polite">{value.length} / {max}</span>
      )}
    </div>
  );
}

function DetailsTab({
  title, author, status, publishing, onSave,
}: {
  title: string; author: string; status: ManuscriptStatus; publishing: PublishingMetadata;
  onSave: (patch: { title: string; author: string; status: ManuscriptStatus; publishing: PublishingMetadata }) => void;
}) {
  const [titleInput, setTitleInput] = useState(title);
  const [authorInput, setAuthorInput] = useState(author);
  const [selectedStatus, setSelectedStatus] = useState<ManuscriptStatus>(status);
  const [pub, setPub] = useState<PublishingMetadata>(publishing);

  const sf = (key: keyof PublishingMetadata) => (v: string) => setPub(p => ({ ...p, [key]: v }));
  const save = () => onSave({ title: titleInput.trim() || 'Untitled', author: authorInput.trim(), status: selectedStatus, publishing: pub });
  const reset = () => { setTitleInput(title); setAuthorInput(author); setSelectedStatus(status); setPub(publishing); };

  return (
    <div className="hub-panel hub-details-form">
      <div className="pub-form-header">
        <div>
          <h2 className="hub-panel-title">Publishing Details</h2>
          <p className="hub-panel-lead">Title page and publishing data — applied to every artifact you export.</p>
        </div>
        <button type="button" className="pub-save-btn" onClick={save}>Save changes</button>
      </div>

      <div className="instrument-group-label">Work identification</div>
      <div className="pub-form-grid">
        <PubField label="Title" id="hub-detail-title" value={titleInput} onChange={setTitleInput} max={200} />
        <PubField label="Subtitle" id="hub-pub-subtitle" value={pub.subtitle ?? ''} onChange={sf('subtitle')} max={200} placeholder="A subtitle, if any" />
        <PubField label="Series" id="hub-pub-series" value={pub.series ?? ''} onChange={sf('series')} max={200} placeholder="The Hollow Cycle, Book 1" />
        <PubField label="Author" id="hub-detail-author" value={authorInput} onChange={setAuthorInput} max={200} placeholder="Author (optional)" />
        <PubField label="Publisher" id="hub-pub-publisher" value={pub.publisher ?? ''} onChange={sf('publisher')} max={200} placeholder="Publishing house" />
        <PubField label="Imprint" id="hub-pub-imprint" value={pub.imprint ?? ''} onChange={sf('imprint')} max={200} placeholder="Imprint" />
      </div>

      <div className="instrument-group-label pub-section-label">Classification</div>
      <div className="pub-form-grid">
        <PubField label="Genre" id="hub-pub-genre" value={pub.genre ?? ''} onChange={sf('genre')} max={100} placeholder="Literary fiction, memoir, thriller…" />
        <PubField label="Language" id="hub-pub-language" value={pub.language ?? ''} onChange={sf('language')} max={50} placeholder="English" />
      </div>

      <div className="instrument-group-label pub-section-label">Synopsis</div>
      <div className="pub-form-grid">
        <PubTextarea label="Short synopsis" id="hub-pub-synopsis" value={pub.synopsis ?? ''} onChange={sf('synopsis')} max={1000}
          placeholder="A short description for your title page and exports (Pandoc: description)." wide counterNearLimit />
      </div>

      <div className="instrument-group-label pub-section-label">Publication</div>
      <div className="pub-form-grid">
        <PubField label="ISBN" id="hub-pub-isbn" value={pub.isbn ?? ''} onChange={sf('isbn')} max={20} placeholder="978-…" />
        <PubField label="Edition" id="hub-pub-edition" value={pub.edition ?? ''} onChange={sf('edition')} max={100} placeholder="First edition" />
        <PubField label="Publication date" id="hub-pub-publicationDate" value={pub.publicationDate ?? ''} onChange={sf('publicationDate')} max={100} placeholder="Spring 2027" />
      </div>

      <div className="instrument-group-label pub-section-label">Copyright</div>
      <div className="pub-form-grid">
        <PubField label="Copyright year" id="hub-pub-copyrightYear" value={pub.copyrightYear ?? ''} onChange={sf('copyrightYear')} max={10} placeholder={String(new Date().getFullYear())} />
        <PubField label="Copyright holder" id="hub-pub-copyrightHolder" value={pub.copyrightHolder ?? ''} onChange={sf('copyrightHolder')} max={200} placeholder="Author or estate name" />
        <PubField label="Rights" id="hub-pub-rights" value={pub.rights ?? ''} onChange={sf('rights')} max={200} placeholder="All rights reserved" wide />
        <PubTextarea label="Dedication" id="hub-pub-dedication" value={pub.dedication ?? ''} onChange={sf('dedication')} max={1000} placeholder="For…" wide counterNearLimit />
      </div>

      <div className="instrument-group-label pub-section-label">Status</div>
      <div className="pub-status-options">
        {STATUS_META.map(({ s, icon }) => (
          <button key={s} type="button" className={`status-opt${selectedStatus === s ? ' selected' : ''}`}
            onClick={() => setSelectedStatus(s)}>
            <span className="status-opt-icon" aria-hidden="true">{icon}</span>
            {s}
          </button>
        ))}
      </div>

      <div className="pub-form-actions">
        <button type="button" className="btn-outline pub-reset-btn" onClick={reset}>Reset</button>
      </div>
    </div>
  );
}

// ── Versions: the author's deliberate draft history (Phase 8). ──
/** Lists saved versions newest-first, with an inline-editable label, the capture
 *  reason, and a delete. "Save current as version" freezes the live draft. The
 *  before/after compare surface is the separate workspace app (Track B). */
function VersionsTab({ versions, manuscriptAvailable, onSaveVersion, onRestore, onRelabel, onDelete }: {
  versions: SnapshotMeta[];
  manuscriptAvailable: boolean;
  onSaveVersion: () => void;
  onRestore: (snapId: string) => void;
  onRelabel: (snapId: string, label: string) => void;
  onDelete: (snapId: string) => void;
}) {
  const ordered = [...versions].sort((a, b) => b.createdAt - a.createdAt); // newest first
  const ordinalById = new Map(
    [...versions].sort((a, b) => a.createdAt - b.createdAt).map((v, i) => [v.id, i + 1] as const),
  );
  return (
    <div className="hub-panel">
      <div className="hub-overview-head">
        <h2 className="hub-panel-title">Versions</h2>
        <button type="button" className="btn-cta-gold" onClick={onSaveVersion} disabled={!manuscriptAvailable}>
          <PlusIcon size={13} /> Save current as version
        </button>
      </div>
      <p className="hub-panel-lead">
        A saved version freezes the whole draft — its text, annotations, and reader sessions — so you
        can revise freely and still see what changed. Editing never overwrites a saved version.
      </p>

      {ordered.length === 0 ? (
        <div className="hub-empty">
          <p>No versions saved yet.</p>
          <p className="hub-empty-sub">Importing a manuscript captures a baseline automatically; save a new version at any milestone — before a beta round, after a revision pass.</p>
        </div>
      ) : (
        <ul className="hub-versions">
          {ordered.map(v => (
            <VersionRow
              key={v.id}
              version={v}
              ordinal={ordinalById.get(v.id) ?? 0}
              manuscriptAvailable={manuscriptAvailable}
              onRestore={() => onRestore(v.id)}
              onRelabel={label => onRelabel(v.id, label)}
              onDelete={() => onDelete(v.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function VersionRow({ version, ordinal, manuscriptAvailable, onRestore, onRelabel, onDelete }: {
  version: SnapshotMeta;
  ordinal: number;
  manuscriptAvailable: boolean;
  onRestore: () => void;
  onRelabel: (label: string) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(version.label ?? '');
  const commit = () => {
    const next = label.trim();
    if (next && next !== version.label) onRelabel(next);
    else setLabel(version.label ?? '');
  };
  const when = new Date(version.createdAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return (
    <li className="hub-version">
      <span className="hub-version-chip"><LayersIcon size={12} /> v{ordinal}</span>
      <div className="hub-version-body">
        <input
          className="hub-version-label"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setLabel(version.label ?? ''); }}
          aria-label={`Label for version ${ordinal}`}
        />
        <div className="hub-version-meta">
          {version.trigger === 'import' ? 'Imported baseline' : 'Saved version'} · {when} · {version.wordCount.toLocaleString()} words · {version.chapterCount} ch.
        </div>
      </div>
      <button
        type="button"
        className="hub-version-restore"
        disabled={!manuscriptAvailable}
        onClick={() => { if (confirm(`Restore “${version.label ?? `v${ordinal}`}” as the current draft? Your current draft is saved as a version first, so you can switch back.`)) onRestore(); }}
        title="Make this version the current draft"
      >
        <UndoIcon size={13} /> Restore
      </button>
      <button
        type="button"
        className="hub-version-del"
        onClick={() => { if (confirm(`Delete version “${version.label ?? `v${ordinal}`}”? This can't be undone.`)) onDelete(); }}
        aria-label={`Delete version ${ordinal}`}
      >
        <XIcon size={13} />
      </button>
    </li>
  );
}

// ── Exports: every publication-ready artifact in one home. ──
/** A single export option, presented inline: a format chip, plain-language
 *  description, and a download affordance — no intermediate modal. */
function ExportCard({
  chip, title, desc, onClick, disabled, disabledHint,
}: {
  chip: string; title: string; desc: string;
  onClick: () => void; disabled?: boolean; disabledHint?: string;
}) {
  return (
    <button
      type="button"
      className="hub-export-card"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
    >
      <span className="hub-export-card-chip">{chip}</span>
      <span className="hub-export-card-body">
        <span className="hub-export-card-title">{title}</span>
        <span className="hub-export-card-desc">{desc}</span>
      </span>
      <DownloadIcon size={15} className="hub-export-card-icon" />
    </button>
  );
}

function ExportsTab({
  manuscriptAvailable, annCount, editCount, hasPublishing, onGoToDetails,
  onExportManuscript, onExportReportDocx, onExportReportHtml, onExportReportJson, onExportRevisionLog,
  onOpenShareReader,
}: {
  manuscriptAvailable: boolean; annCount: number; editCount: number;
  hasPublishing: boolean; onGoToDetails: () => void;
  onExportManuscript: (format: 'epub' | 'docx' | 'md') => void | Promise<void>;
  onExportReportDocx: () => void | Promise<void>;
  onExportReportHtml: () => void;
  onExportReportJson: () => void;
  onExportRevisionLog: () => void;
  onOpenShareReader: (mode: 'reading' | 'annotating') => void;
}) {
  const noManuscript = !manuscriptAvailable;
  const noManuscriptHint = 'Re-import this manuscript to export it';

  return (
    <div className="hub-panel">
      <h2 className="hub-panel-title">Exports &amp; Sharing</h2>
      <p className="hub-panel-lead">Publication-ready files and clean reader copies — built from your latest draft and title-page details.</p>

      {!hasPublishing && (
        <button className="hub-detail-nudge" onClick={onGoToDetails}>
          Add publishing details (ISBN, imprint, copyright…) → they’ll appear on your exported title and copyright pages.
        </button>
      )}

      <section className="hub-export-section">
        <div className="hub-export-section-label">Manuscript</div>
        <div className="hub-export-cards">
          <ExportCard chip="EPUB" title="EPUB ebook" disabled={noManuscript} disabledHint={noManuscriptHint}
            desc="Reflowable ebook for Kindle, Apple Books, and Kobo, with title, copyright, and contents pages — the format retailers ingest."
            onClick={() => onExportManuscript('epub')} />
          <ExportCard chip="DOCX" title="Word document" disabled={noManuscript} disabledHint={noManuscriptHint}
            desc="Formatted .docx with title, copyright, and dedication pages — chapters, headings, and scene breaks preserved."
            onClick={() => onExportManuscript('docx')} />
          <ExportCard chip="MD" title="Markdown" disabled={noManuscript} disabledHint={noManuscriptHint}
            desc="Plain-text Markdown with a YAML metadata block — portable into Pandoc and most ebook toolchains."
            onClick={() => onExportManuscript('md')} />
          <ExportCard chip="LOG" title="Revision log"
            disabled={editCount === 0}
            disabledHint="Edit a chapter in the reader to start a revision log"
            desc={editCount > 0
              ? `Every edit you’ve made to this draft (${editCount} so far), as a reviewable change record.`
              : 'Every edit you make to this draft, as a reviewable change record.'}
            onClick={onExportRevisionLog} />
        </div>
      </section>

      <section className="hub-export-section">
        <div className="hub-export-section-label">Editorial report</div>
        <div className="hub-export-cards">
          <ExportCard chip="DOCX" title="Word document" disabled={annCount === 0}
            disabledHint="Annotate first to generate a report"
            desc="Best for sharing, adding comments, and print."
            onClick={onExportReportDocx} />
          <ExportCard chip="HTML" title="Web page" disabled={annCount === 0}
            disabledHint="Annotate first to generate a report"
            desc="Self-contained page — opens in any browser, easy to skim or print."
            onClick={onExportReportHtml} />
          <ExportCard chip="JSON" title="Raw data" disabled={annCount === 0}
            disabledHint="Annotate first to generate a report"
            desc="The same structured signals the app uses — for your own tools or downstream analysis."
            onClick={onExportReportJson} />
        </div>
      </section>

      <section className="hub-export-section">
        <div className="hub-export-section-label">Share with a reader</div>
        <div className="hub-export-cards">
          <ExportCard chip="READER" title="Reading-only copy" disabled={noManuscript} disabledHint={noManuscriptHint}
            desc="A clean reader file from a saved version — no annotation tools."
            onClick={() => onOpenShareReader('reading')} />
          <ExportCard chip="READER" title="Copy with annotation tools" disabled={noManuscript} disabledHint={noManuscriptHint}
            desc="A reader file with annotation tools from a saved version — your beta reader exports feedback you import back in."
            onClick={() => onOpenShareReader('annotating')} />
        </div>
      </section>
    </div>
  );
}
