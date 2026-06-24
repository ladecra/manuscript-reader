import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReaderStore } from '../state/readerStore';
import { useLibraryStore } from '../state/libraryStore';
import { useUIStore } from '../state/uiStore';
import { computeEditorialSignals } from '../engine/editorialSignals';
import { resolveAnnotationChapters } from '../engine/annotations/chapterResolve';
import { parseMarkdown } from '../engine/ingestion/parseMarkdown';
import { estimateReadingPagePosition, chapterWordCounts, resumeChapterByProgress } from '../engine/reading/manuscriptPages';
import { ANNOTATION_LABELS, ANNOTATION_COLORS } from '../engine/types';
import type { ManuscriptStatus, PublishingMetadata, Chapter } from '../engine/types';
import { applyChapterEdits, type ChapterEdit } from '../engine/manuscript/chapterEdit';
import type { ExportManuscriptMeta } from '../engine/exports/manuscriptMarkdown';
import { ChapterTree } from '../components/library/ChapterTree';
import { AddChaptersModal } from '../components/reader/AddChaptersModal';
import { ReportView } from '../components/reports/ReportView';
import { exportShareableReader, ShareReaderBuildError } from '../engine/exports/shareableReader';
import { showToast } from '../components/ui/Toast';
import { PencilIcon, ChevronLeftIcon, DotsIcon, DownloadIcon } from '../components/ui/Icons';
import { CoverImage } from '../components/ui/CoverImage';
import { ManuscriptWorkspaceRail, type HubPane } from '../components/layout/ManuscriptWorkspaceRail';

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
  const { setPendingChapterIndex, setPendingReaderIntent, hubPane: pane, setHubPane } = useUIStore();
  const [editStructure, setEditStructure] = useState(false);
  const [chapterEdits, setChapterEdits] = useState<ChapterEdit[]>([]);
  const [addChaptersOpen, setAddChaptersOpen] = useState(false);
  const [tocQuery, setTocQuery] = useState('');
  const [tocCompact, setTocCompact] = useState(false);
  const [openChapterMenu, setOpenChapterMenu] = useState<number | null>(null);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

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
    () => manuscript && annotations.length > 0
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

  // Report chips send the author into the prose at a chapter (read posture).
  const jumpToChapter = useCallback((index: number) => enterReader(index), [enterReader]);

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

  // Share a read-only reader file with a beta reader (optionally seeded with the
  // author's own annotations). The other half of the feedback loop.
  const handleShareReader = useCallback((withAnnotations: boolean) => {
    const md = manuscript?.metadata.combinedMarkdown;
    if (!md) { showToast('Re-import this file to share it.'); return; }
    try {
      exportShareableReader(exportMeta().title, md, withAnnotations);
      showToast('Reader file downloaded.');
    } catch (e) {
      console.error('Share reader build failed:', e);
      showToast(e instanceof ShareReaderBuildError ? e.message : 'Could not generate file.');
    }
  }, [manuscript, exportMeta]);

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
        openManuscript(updated, parseMarkdown(updated.metadata.combinedMarkdown!).chapters);
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
    const { chapters: newChapters } = parseMarkdown(updated.metadata.combinedMarkdown!);
    const added = newChapters.length - chapters.length;
    openManuscript(updated, newChapters);
    setAddChaptersOpen(false);
    showToast(added > 0 ? `${added} chapter${added !== 1 ? 's' : ''} added — now ${newChapters.length} total` : 'Chapters appended.');
  }, [manuscript, chapters, appendChapters, openManuscript]);

  const toggleToolPane = useCallback((id: HubPane) => {
    setHubPane(pane === id ? 'contents' : id);
  }, [pane, setHubPane]);

  // The rail's "Recent annotations" section — the latest few, newest first.
  const recentAnnotations = useMemo(
    () => [...annotations].slice(-4).reverse().map(a => ({
      id: a.id, type: a.type, quote: a.quote ?? '', chapterTitle: a.chapterTitle ?? '',
    })),
    [annotations],
  );

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

            {pane === 'feedback' && <FeedbackTab annotations={annotations} readerCount={readerCount} onRead={onRead} />}

            {pane === 'report' && (
              <>
                <h2 className="hub-panel-title">Manuscript Intelligence</h2>
                <p className="hub-panel-lead">Where readers slowed, agreed, and reacted — every figure traces to a reader action.</p>
                <div className="hub-report"><ReportView signals={signals} onJump={jumpToChapter} /></div>
              </>
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
                onShareReader={handleShareReader}
              />
            )}
          </div>
        )}
      </main>

      <ManuscriptWorkspaceRail
        context="hub"
        pane={pane}
        annotationCount={annotations.length}
        savedLabel={savedLabel}
        recentAnnotations={recentAnnotations}
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
      <span className="pub-field-counter">{value.length} / {max}</span>
    </div>
  );
}

function PubTextarea({ label, id, value, onChange, placeholder = '', max, wide = false }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; max: number; wide?: boolean;
}) {
  return (
    <div className={`pub-field${wide ? ' pub-field--wide' : ''}`}>
      <label className="instrument-field-label" htmlFor={id}>{label}</label>
      <textarea id={id} className="pub-field-input pub-field-textarea" value={value}
        placeholder={placeholder} maxLength={max} rows={4}
        onChange={e => onChange(e.target.value)} />
      <span className="pub-field-counter">{value.length} / {max}</span>
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
          placeholder="A short description for your title page and exports (Pandoc: description)." wide />
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
        <PubTextarea label="Dedication" id="hub-pub-dedication" value={pub.dedication ?? ''} onChange={sf('dedication')} max={1000} placeholder="For…" wide />
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

// ── Feedback: a read-only roll-up of reader annotations. Annotating stays in the reader. ──
function FeedbackTab({ annotations, readerCount, onRead }: {
  annotations: { id: string; type: string; quote: string; note: string; chapterTitle: string; readerName?: string | null }[];
  readerCount: number; onRead: () => void;
}) {
  return (
    <div className="hub-panel">
      <div className="hub-overview-head">
        <h2 className="hub-panel-title">Feedback</h2>
        <button className="btn-outline" style={{ fontSize: '12px' }} onClick={onRead}>Annotate in reader →</button>
      </div>
      <div className="hub-stats">
        <div className="lib-stat"><span className="lib-stat-num">{annotations.length}</span><span className="lib-stat-label">Annotations</span></div>
        <div className="lib-stat"><span className="lib-stat-num">{readerCount}</span><span className="lib-stat-label">Readers</span></div>
      </div>

      {annotations.length === 0 ? (
        <div className="hub-empty">
          <p>No annotations yet.</p>
          <p className="hub-empty-sub">Open the reader to annotate, or import a beta reader's feedback file from the reader's annotations panel.</p>
        </div>
      ) : (
        <div className="hub-ann-list">
          {annotations.map(a => (
            <div key={a.id} className="hub-ann">
              <span className="hub-ann-dot" style={{ background: ANNOTATION_COLORS[a.type as keyof typeof ANNOTATION_COLORS] ?? 'var(--dim)' }} />
              <div className="hub-ann-body">
                <div className="hub-ann-meta">
                  {ANNOTATION_LABELS[a.type as keyof typeof ANNOTATION_LABELS] ?? a.type}
                  {a.chapterTitle ? ` · ${a.chapterTitle}` : ''}
                  {a.readerName ? ` · ${a.readerName}` : ''}
                </div>
                {a.quote && <div className="hub-ann-quote">“{a.quote.slice(0, 160)}”</div>}
                {a.note && <div className="hub-ann-note">{a.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
  onShareReader,
}: {
  manuscriptAvailable: boolean; annCount: number; editCount: number;
  hasPublishing: boolean; onGoToDetails: () => void;
  onExportManuscript: (format: 'epub' | 'docx' | 'md') => void | Promise<void>;
  onExportReportDocx: () => void | Promise<void>;
  onExportReportHtml: () => void;
  onExportReportJson: () => void;
  onExportRevisionLog: () => void;
  onShareReader: (withAnnotations: boolean) => void;
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
            desc="A clean, read-only reader file — no annotation tools. Send it to anyone."
            onClick={() => onShareReader(false)} />
          <ExportCard chip="READER" title="Copy with annotation tools" disabled={noManuscript} disabledHint={noManuscriptHint}
            desc="A reader file with full annotation tools — your beta reader marks it up and exports feedback you import back in."
            onClick={() => onShareReader(true)} />
        </div>
      </section>
    </div>
  );
}
