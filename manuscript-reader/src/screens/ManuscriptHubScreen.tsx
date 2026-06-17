import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReaderStore } from '../state/readerStore';
import { useLibraryStore } from '../state/libraryStore';
import { useUIStore } from '../state/uiStore';
import { computeEditorialSignals } from '../engine/editorialSignals';
import { parseMarkdown } from '../engine/ingestion/parseMarkdown';
import { estimateReadingPagePosition, chapterWordCounts, resumeChapterByProgress } from '../engine/reading/manuscriptPages';
import { MANUSCRIPT_STATUSES, PUBLISHING_FIELDS, ANNOTATION_LABELS, ANNOTATION_COLORS } from '../engine/types';
import type { ManuscriptStatus, PublishingMetadata, Chapter } from '../engine/types';
import { applyChapterEdits, type ChapterEdit } from '../engine/manuscript/chapterEdit';
import type { ExportManuscriptMeta } from '../engine/exports/manuscriptMarkdown';
import { ChapterTree } from '../components/library/ChapterTree';
import { AddChaptersModal } from '../components/reader/AddChaptersModal';
import { ReportView } from '../components/reports/ReportView';
import { ExportChoiceModal } from '../components/reports/ExportChoiceModal';
import { ShareModal } from '../components/reader/ShareModal';
import { exportShareableReader, ShareReaderBuildError } from '../engine/exports/shareableReader';
import { showToast } from '../components/ui/Toast';
import { PencilIcon, BookIcon, ChevronLeftIcon, DotsIcon } from '../components/ui/Icons';
import { coverSvgDataUrl } from '../engine/cover';
import { ManuscriptWorkspaceRail, type HubPane } from '../components/layout/ManuscriptWorkspaceRail';

// The manuscript page: a book's antechamber. Shared `.instrument-*` list styling
// (hub rail, contents, publishing fields) is the evolving shell language; a
// collapsible reader-side rail can reuse it later (library → hub, tools → reader).

interface ManuscriptHubScreenProps {
  onRead: () => void;   // enter the immersive reader at the resume position
  onExit: () => void;   // back to the library
  workspaceRailOpen: boolean;
}

export function ManuscriptHubScreen({ onRead, onExit, workspaceRailOpen }: ManuscriptHubScreenProps) {
  const { manuscript, chapters, annotations, edits, sessions, openManuscript } = useReaderStore();
  const { library, updateManuscript, replaceMarkdown, appendChapters, getReadingPosition, updateProgress, cycleStatus } = useLibraryStore();
  const { setPendingChapterIndex, setPendingReaderIntent, hubPane: pane, setHubPane } = useUIStore();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [editStructure, setEditStructure] = useState(false);
  const [chapterEdits, setChapterEdits] = useState<ChapterEdit[]>([]);
  const [addChaptersOpen, setAddChaptersOpen] = useState(false);
  const [tocQuery, setTocQuery] = useState('');
  const [tocCompact, setTocCompact] = useState(false);
  const [openChapterMenu, setOpenChapterMenu] = useState<number | null>(null);

  const title = manuscript?.metadata.title ?? '';
  const combinedMarkdown = manuscript?.metadata.combinedMarkdown;
  const manuscriptAvailable = !!combinedMarkdown;
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

  const handleExportManuscript = useCallback(async (format: 'docx' | 'md') => {
    if (!manuscript) return;
    const md = manuscript.metadata.combinedMarkdown;
    if (!md) { showToast('Manuscript not cached — re-import the file to export it.'); return; }
    try {
      if (format === 'md') {
        const { exportManuscriptMarkdown } = await import('../engine/exports/manuscriptMarkdown');
        exportManuscriptMarkdown(exportMeta(), manuscript.id, md);
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

  const coverUrl = useMemo(
    () => coverSvgDataUrl({ title, author: manuscript?.metadata.author, series: manuscript?.metadata.publishing?.series }),
    [title, manuscript?.metadata.author, manuscript?.metadata.publishing?.series],
  );

  const toggleToolPane = useCallback((id: HubPane) => {
    setHubPane(pane === id ? 'contents' : id);
  }, [pane, setHubPane]);

  if (!manuscript) return null;

  const { author, wordCount, chapterCount, status, uncached, publishing } = manuscript.metadata;
  const readerCount = new Set(annotations.map(a => a.readerId ?? a.readerName).filter(Boolean)).size;
  const savedLabel = manuscript.metadata.lastOpened
    ? `Auto-saved · ${new Date(manuscript.metadata.lastOpened).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : 'Auto-saved';

  return (
    <div className={`hub${workspaceRailOpen ? ' hub--rail-open' : ''}`}>
      <main className="hub-main">
        {uncached && (
          <div className="hub-warn" role="alert">
            ⚠ Source text offloaded to free storage space. Reading, editing, and export are paused —
            re-import the file from <strong>Load</strong> to restore it.
          </div>
        )}

        {pane === 'contents' ? (
          <div className="hub-panel">
            <button type="button" className="hub-breadcrumb" onClick={onExit}>
              <ChevronLeftIcon size={10} />
              Back to library
            </button>
            <header className="hub-hero">
            <div className="hub-hero-cover" aria-hidden="true">
              <img src={coverUrl} alt="" />
            </div>
            <div className="hub-hero-text">
              {publishing?.series && <div className="hub-hero-series">{publishing.series}</div>}
              <h1 className="hub-hero-title">{title}</h1>
              {publishing?.genre?.trim() && (
                <div className="hub-hero-genre">
                  <span>{publishing.genre.trim()}</span>
                  <button type="button" className="hub-hero-genre-edit" onClick={() => setHubPane('details')} aria-label="Edit genre and synopsis">
                    <PencilIcon size={14} />
                  </button>
                </div>
              )}
              {publishing?.subtitle && <div className="hub-hero-subtitle">{publishing.subtitle}</div>}
              {author && <div className="hub-hero-byline">by {author}</div>}
              {publishing?.synopsis?.trim() && (
                <p className="hub-hero-synopsis">{publishing.synopsis.trim()}</p>
              )}
              <div className="ms-meta hub-hero-meta">
                {wordCount != null && wordCount > 0 ? <span>{wordCount.toLocaleString()} words</span> : null}
                {wordCount != null && wordCount > 0 ? <span className="dot" /> : null}
                <span>{chapterCount ?? 0} chapter{(chapterCount ?? 0) !== 1 ? 's' : ''}</span>
                <span className="dot" />
                <button
                  type="button"
                  className={`ms-status ${hubStatusClass(status ?? 'Draft')}`}
                  onClick={() => {
                    if (!manuscript) return;
                    cycleStatus(manuscript.id);
                    const refreshed = useLibraryStore.getState().library.find(m => m.id === manuscript.id);
                    if (refreshed) openManuscript(refreshed, chapters);
                  }}
                >
                  {status ?? 'Draft'}
                </button>
                <span className="dot" />
                <span>{pct > 0 ? `${pct}% read` : 'Unread'}</span>
                {annotations.length > 0 && (
                  <>
                    <span className="dot" />
                    <span>{annotations.length} annotation{annotations.length !== 1 ? 's' : ''}</span>
                  </>
                )}
                {readerCount > 0 && (
                  <>
                    <span className="dot" />
                    <span>{readerCount} reader{readerCount !== 1 ? 's' : ''}</span>
                  </>
                )}
                <span className="dot" />
                <span>{hubTimeAgo(manuscript.metadata.lastOpened)}</span>
              </div>
            </div>
          </header>

          <section className="hub-continue">
            <div className="hub-continue-grid">
              <div className="hub-continue-copy">
                <div className="hub-continue-eyebrow">
                  <span className="hub-continue-icon" aria-hidden="true"><BookIcon size={14} /></span>
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
                        <> · ~ page {pageEstimate.current} of {pageEstimate.total}</>
                      )}
                    </>
                  ) : (
                    'Not yet opened in the reader'
                  )}
                </p>
              </div>
              <div className="hub-continue-aside">
                <button type="button" className="hub-continue-btn btn-accent" onClick={onRead} disabled={!manuscriptAvailable}>
                  {pct > 1 ? 'Continue reading' : 'Start reading'}
                </button>
                <button type="button" className="hub-continue-open" onClick={onRead} disabled={!manuscriptAvailable}>
                  Open in reader →
                </button>
              </div>
            </div>
          </section>

          <section className="hub-toc-section">
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
                  className={`hub-toc-action${tocCompact ? ' active' : ''}`}
                  onClick={() => setTocCompact(v => !v)}
                >
                  View
                </button>
                <button
                  type="button"
                  className={`hub-toc-action${editStructure ? ' active' : ''}`}
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
                  <button className="hub-toc-action" style={{ alignSelf: 'flex-start' }}
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
            <button type="button" className="hub-back" onClick={() => setHubPane('contents')}>‹ Contents</button>

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
                subject={title}
                manuscriptAvailable={manuscriptAvailable}
                annCount={annotations.length}
                editCount={edits.length}
                hasPublishing={!!publishing && Object.values(publishing).some(Boolean)}
                onGoToDetails={() => setHubPane('details')}
                onExportManuscript={handleExportManuscript}
                onExportReportDocx={handleExportReportDocx}
                onExportReportHtml={handleExportReportHtml}
                onExportRevisionLog={handleExportRevisionLog}
              />
            )}

            {pane === 'share' && (
              <>
                <h2 className="hub-panel-title">Share</h2>
                <p className="hub-panel-lead">Send a clean, read-only reader to a beta reader — they annotate, you import their feedback back in.</p>
                <div className="rp-export-group">
                  <div className="rp-export-group-label">Reader file</div>
                  <button className="rp-export-hero" onClick={() => setShareModalOpen(true)} disabled={!manuscriptAvailable}
                    title={manuscriptAvailable ? undefined : 'Re-import this manuscript to share it'}>
                    Create a reader file
                  </button>
                </div>
                <ShareModal
                  open={shareModalOpen}
                  title={title}
                  wordCount={wordCount}
                  chapterCount={chapterCount}
                  onClose={() => setShareModalOpen(false)}
                  onDownload={(withAnnotations) => { handleShareReader(withAnnotations); setShareModalOpen(false); }}
                />
              </>
            )}

            {pane === 'versions' && (
              <>
                <h2 className="hub-panel-title">Versions</h2>
                <div className="hub-empty">
                  <p>Revision Impact &amp; Stability live here.</p>
                  <p className="hub-empty-sub">
                    Once you snapshot a draft, this shows what changed between versions —
                    which reader questions you resolved, and which you introduced. Coming with draft snapshots.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {workspaceRailOpen && (
        <ManuscriptWorkspaceRail
          context="hub"
          pane={pane}
          annotationCount={annotations.length}
          savedLabel={savedLabel}
          readerSubtext={pct > 1 ? 'Resume where you left off' : 'Open in the reader'}
          onTogglePane={toggleToolPane}
          onRead={onRead}
        />
      )}
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

function hubTimeAgo(ts: number | undefined): string {
  if (!ts) return '—';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 2) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
          className="hub-toc-menu-btn"
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

  const setField = (key: keyof PublishingMetadata, value: string) =>
    setPub(p => ({ ...p, [key]: value }));

  const save = () => onSave(
    { title: titleInput.trim() || 'Untitled', author: authorInput.trim(), status: selectedStatus, publishing: pub },
  );

  return (
    <div className="hub-panel">
      <h2 className="hub-panel-title">Details</h2>
      <p className="hub-panel-lead">The title page and publishing data — applied to every artifact you export.</p>

      <div className="instrument-group-label">Title page</div>
      <div className="instrument-nav">
        <div className="instrument-field">
          <label className="instrument-field-label" htmlFor="hub-detail-title">Title</label>
          <input id="hub-detail-title" className="instrument-field-input" type="text" value={titleInput} onChange={e => setTitleInput(e.target.value)} />
        </div>
        <div className="instrument-field">
          <label className="instrument-field-label" htmlFor="hub-detail-author">Author</label>
          <input id="hub-detail-author" className="instrument-field-input" type="text" value={authorInput} placeholder="Author (optional)" onChange={e => setAuthorInput(e.target.value)} />
        </div>
        <div className="instrument-field">
          <span className="instrument-field-label">Status</span>
          <div className="status-options">
            {MANUSCRIPT_STATUSES.map(s => (
              <button key={s} type="button" className={`status-opt${selectedStatus === s ? ' selected' : ''}`} onClick={() => setSelectedStatus(s)}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="instrument-group-label" style={{ marginTop: '36px' }}>Publishing</div>
      <div className="instrument-nav">
        {PUBLISHING_FIELDS.map(f => (
          <div key={f.key} className={`instrument-field${f.long ? ' instrument-field--wide' : ''}`}>
            <label className="instrument-field-label" htmlFor={`hub-pub-${f.key}`}>{f.label}</label>
            {f.long ? (
              <textarea id={`hub-pub-${f.key}`} className="instrument-field-input" value={pub[f.key] ?? ''} placeholder={f.placeholder}
                onChange={e => setField(f.key, e.target.value)} rows={3} />
            ) : (
              <input id={`hub-pub-${f.key}`} className="instrument-field-input" type="text" value={pub[f.key] ?? ''} placeholder={f.placeholder}
                onChange={e => setField(f.key, e.target.value)} />
            )}
          </div>
        ))}
      </div>

      <button type="button" className="edit-save-btn" style={{ marginTop: '28px' }} onClick={save}>Save changes</button>
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
        <button className="hub-read-cta" onClick={onRead}>Annotate in reader →</button>
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
function ExportsTab({
  subject, manuscriptAvailable, annCount, editCount, hasPublishing, onGoToDetails,
  onExportManuscript, onExportReportDocx, onExportReportHtml, onExportRevisionLog,
}: {
  subject: string;
  manuscriptAvailable: boolean; annCount: number; editCount: number;
  hasPublishing: boolean; onGoToDetails: () => void;
  onExportManuscript: (format: 'docx' | 'md') => void | Promise<void>;
  onExportReportDocx: () => void | Promise<void>;
  onExportReportHtml: () => void;
  onExportRevisionLog: () => void;
}) {
  const [manuscriptOpen, setManuscriptOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="hub-panel">
      <h2 className="hub-panel-title">Exports</h2>
      <p className="hub-panel-lead">Publication-ready artifacts, built from your latest draft and title-page details.</p>

      {!hasPublishing && (
        <button className="hub-detail-nudge" onClick={onGoToDetails}>
          Add publishing details (ISBN, imprint, copyright…) → they’ll appear on your exported title and copyright pages.
        </button>
      )}

      <div className="rp-export-group">
        <div className="rp-export-group-label">Your manuscript</div>
        <button className="rp-export-hero" onClick={() => setManuscriptOpen(true)} disabled={!manuscriptAvailable}
          title={manuscriptAvailable ? undefined : 'Re-import this manuscript to export it'}>
          Download your manuscript
        </button>
        {editCount > 0 && (
          <button className="rp-export-btn ann-export-secondary" onClick={onExportRevisionLog} style={{ marginTop: '8px' }}>
            Revision log ({editCount} edit{editCount !== 1 ? 's' : ''})
          </button>
        )}
      </div>

      <div className="rp-export-group">
        <div className="rp-export-group-label">Your insights</div>
        <button className="rp-export-btn ann-export-secondary" onClick={() => setReportOpen(true)} disabled={annCount === 0}
          title={annCount === 0 ? 'Annotate first to generate a report' : undefined}>
          Intelligence report
        </button>
      </div>

      <ExportChoiceModal
        open={manuscriptOpen}
        heading="Download your manuscript"
        subject={subject}
        primaryLabel="Download manuscript"
        formats={[
          { key: 'docx', label: 'Word (.docx)', desc: 'A formatted Word document with a title page, copyright page, and dedication built from your Details — chapters, headings, and scene breaks preserved.' },
          { key: 'md', label: 'Markdown (.md)', desc: 'Plain-text Markdown with a YAML front-matter block carrying your publishing metadata. Portable into Pandoc and most ebook toolchains.' },
        ]}
        onClose={() => setManuscriptOpen(false)}
        onExport={(format) => onExportManuscript(format as 'docx' | 'md')}
      />

      <ExportChoiceModal
        open={reportOpen}
        heading="Export intelligence report"
        subject={subject}
        primaryLabel="Download report"
        formats={[
          { key: 'docx', label: 'Word (.docx)', desc: 'A formatted Word document — best for sharing, adding comments, and print.' },
          { key: 'html', label: 'Web page (.html)', desc: 'A self-contained web page — opens in any browser, easy to skim or print.' },
        ]}
        onClose={() => setReportOpen(false)}
        onExport={(format) => (format === 'docx' ? onExportReportDocx() : onExportReportHtml())}
      />
    </div>
  );
}
