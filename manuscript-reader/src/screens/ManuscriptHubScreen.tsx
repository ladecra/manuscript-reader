import { useCallback, useMemo, useState } from 'react';
import { useReaderStore } from '../state/readerStore';
import { useLibraryStore } from '../state/libraryStore';
import { useUIStore } from '../state/uiStore';
import { computeEditorialSignals } from '../engine/editorialSignals';
import { parseMarkdown } from '../engine/ingestion/parseMarkdown';
import { MANUSCRIPT_STATUSES, PUBLISHING_FIELDS, ANNOTATION_LABELS, ANNOTATION_COLORS } from '../engine/types';
import type { ManuscriptStatus, PublishingMetadata } from '../engine/types';
import { applyChapterEdits, type ChapterEdit } from '../engine/manuscript/chapterEdit';
import type { ExportManuscriptMeta } from '../engine/exports/manuscriptMarkdown';
import { ChapterTree } from '../components/library/ChapterTree';
import { ReportView } from '../components/reports/ReportView';
import { ExportChoiceModal } from '../components/reports/ExportChoiceModal';
import { ShareModal } from '../components/reader/ShareModal';
import { exportShareableReader, ShareReaderBuildError } from '../engine/exports/shareableReader';
import { showToast } from '../components/ui/Toast';

// The manuscript page: a title page + publishing workbench. Card-click lands here;
// the rail's Read button is "Play" (the immersive reader). Intelligence and
// artifacts live here, never over the reading view. Versions is an honest stub
// (lights up with Phase 8 draft snapshots).
type HubTab = 'overview' | 'details' | 'feedback' | 'report' | 'exports' | 'share' | 'versions';
const TABS: { id: HubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'report', label: 'Report' },
  { id: 'exports', label: 'Exports' },
  { id: 'share', label: 'Share' },
  { id: 'versions', label: 'Versions' },
];

function statusClass(status: string): string {
  return 'status--' + status.toLowerCase().replace(/[^a-z]+/g, '-');
}

interface ManuscriptHubScreenProps {
  onRead: () => void;   // enter the immersive reader ("Play")
  onExit: () => void;   // back to the library
}

export function ManuscriptHubScreen({ onRead, onExit }: ManuscriptHubScreenProps) {
  const { manuscript, chapters, annotations, edits, sessions, openManuscript } = useReaderStore();
  const { library, updateManuscript, replaceMarkdown, getReadingPosition, updateProgress } = useLibraryStore();
  const { setPendingChapterIndex } = useUIStore();
  const [tab, setTab] = useState<HubTab>('overview');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [chapterEdits, setChapterEdits] = useState<ChapterEdit[]>([]);

  const title = manuscript?.metadata.title ?? '';
  const combinedMarkdown = manuscript?.metadata.combinedMarkdown;
  const manuscriptAvailable = !!combinedMarkdown;
  const pct = manuscript ? Math.round(getReadingPosition(manuscript.id) * 100) : 0;

  const signals = useMemo(
    () => manuscript && annotations.length > 0
      ? computeEditorialSignals({ manuscriptId: manuscript.id, annotations, chapters, sessions, combinedMarkdown })
      : null,
    [manuscript, annotations, chapters, sessions, combinedMarkdown],
  );

  // Send the author into the prose at a chosen chapter (chapter list / Report chips).
  const jumpToChapter = useCallback((index: number) => {
    setPendingChapterIndex(index);
    onRead();
  }, [setPendingChapterIndex, onRead]);

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

  if (!manuscript) return null;

  const { author, wordCount, chapterCount, status, uncached, publishing } = manuscript.metadata;
  const readerCount = new Set(annotations.map(a => a.readerId ?? a.readerName).filter(Boolean)).size;

  return (
    <div className="hub">
      {/* ── Left rail ── */}
      <aside className="hub-rail">
        <button className="hub-rail-back" onClick={onExit}>‹ Library</button>
        <div className="hub-rail-head">
          <div className="hub-rail-headtext">
            <div className="hub-rail-wordmark">Manuscript</div>
            <div className="hub-rail-title">{title}</div>
            <div className="hub-rail-sub">
              {wordCount ? `${wordCount.toLocaleString()} words` : '—'} · {chapterCount ?? 0} ch
            </div>
          </div>
          <button className="hub-rail-read" onClick={onRead}>{pct > 1 ? `Resume · ${pct}%` : 'Read'} →</button>
        </div>

        <nav className="hub-rail-nav">
          {TABS.map(t => (
            <button key={t.id} className={`hub-rail-item${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main panel ── */}
      <main className="hub-main">
        {uncached && (
          <div className="hub-warn" role="alert">
            ⚠ Source text offloaded to free storage space. Reading, editing, and export are paused —
            re-import the file from <strong>Load</strong> to restore it.
          </div>
        )}

        {tab === 'overview' && (
          <div className="hub-panel">
            {/* Hero — the title page. Reflects the publishing metadata live. */}
            <div className="hub-hero">
              <div className="hub-hero-text">
                {publishing?.series && <div className="hub-hero-series">{publishing.series}</div>}
                <h1 className="hub-hero-title">{title}</h1>
                {publishing?.subtitle && <div className="hub-hero-subtitle">{publishing.subtitle}</div>}
                {author && <div className="hub-hero-byline">by {author}</div>}
                <div className="hub-hero-meta">
                  <span className={`ms-status ${statusClass(status ?? 'Draft')}`}>{status ?? 'Draft'}</span>
                  <span>{wordCount ? wordCount.toLocaleString() : '—'} words</span>
                  <span>{chapterCount ?? 0} chapters</span>
                  <span>{pct > 0 ? `${pct}% read` : 'Unread'}</span>
                </div>
              </div>
              <div className="hub-hero-actions">
                <button className="hub-play" onClick={onRead}>{pct > 1 ? `Resume reading · ${pct}%` : 'Read'}</button>
                {pct > 1 && <button className="hub-play-secondary" onClick={startOver}>Start from beginning</button>}
              </div>
            </div>

            <div className="hub-stats">
              <div className="lib-stat"><span className="lib-stat-num">{annotations.length}</span><span className="lib-stat-label">Annotations</span></div>
              <div className="lib-stat"><span className="lib-stat-num">{readerCount}</span><span className="lib-stat-label">Readers</span></div>
              <div className="lib-stat"><span className="lib-stat-num">{edits.length}</span><span className="lib-stat-label">Edits</span></div>
            </div>

            <div className="hub-section-label">Chapters · drag to reorder, rename, or remove</div>
            <div className="hub-form">
              <ChapterTree key={combinedMarkdown} combinedMarkdown={combinedMarkdown} onChange={setChapterEdits} />
              <button className="edit-save-btn" style={{ marginTop: '20px', alignSelf: 'flex-start' }} onClick={saveChapters}>Save chapter changes</button>
            </div>
          </div>
        )}

        {tab === 'details' && (
          <DetailsTab
            key={manuscript.id}
            title={title} author={author ?? ''} status={(status as ManuscriptStatus) ?? 'Draft'}
            publishing={publishing ?? {}}
            onSave={saveDetails}
          />
        )}

        {tab === 'feedback' && <FeedbackTab annotations={annotations} readerCount={readerCount} onRead={onRead} />}

        {tab === 'report' && (
          <div className="hub-panel">
            <h2 className="hub-panel-title">Manuscript Intelligence</h2>
            <p className="hub-panel-lead">Where readers slowed, agreed, and reacted — every figure traces to a reader action.</p>
            <div className="hub-report"><ReportView signals={signals} onJump={jumpToChapter} /></div>
          </div>
        )}

        {tab === 'exports' && (
          <ExportsTab
            subject={title}
            manuscriptAvailable={manuscriptAvailable}
            annCount={annotations.length}
            editCount={edits.length}
            hasPublishing={!!publishing && Object.values(publishing).some(Boolean)}
            onGoToDetails={() => setTab('details')}
            onExportManuscript={handleExportManuscript}
            onExportReportDocx={handleExportReportDocx}
            onExportReportHtml={handleExportReportHtml}
            onExportRevisionLog={handleExportRevisionLog}
          />
        )}

        {tab === 'share' && (
          <div className="hub-panel">
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
          </div>
        )}

        {tab === 'versions' && (
          <div className="hub-panel">
            <h2 className="hub-panel-title">Versions</h2>
            <div className="hub-empty">
              <p>Revision Impact &amp; Stability live here.</p>
              <p className="hub-empty-sub">
                Once you snapshot a draft, this shows what changed between versions —
                which reader questions you resolved, and which you introduced. Coming with draft snapshots.
              </p>
            </div>
          </div>
        )}
      </main>
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

      <div className="hub-section-label">Title page</div>
      <div className="hub-form">
        <div className="hub-field"><label className="edit-field-label">Title</label>
          <input className="edit-input" type="text" value={titleInput} onChange={e => setTitleInput(e.target.value)} /></div>
        <div className="hub-field"><label className="edit-field-label">Author</label>
          <input className="edit-input" type="text" value={authorInput} placeholder="Author (optional)" onChange={e => setAuthorInput(e.target.value)} /></div>
        <div className="hub-field"><label className="edit-field-label">Status</label>
          <div className="status-options">
            {MANUSCRIPT_STATUSES.map(s => (
              <button key={s} className={`status-opt${selectedStatus === s ? ' selected' : ''}`} onClick={() => setSelectedStatus(s)}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="hub-section-label" style={{ marginTop: '40px' }}>Publishing</div>
      <div className="hub-form hub-form-grid">
        {PUBLISHING_FIELDS.map(f => (
          <div key={f.key} className={`hub-field${f.long ? ' hub-field-wide' : ''}`}>
            <label className="edit-field-label">{f.label}</label>
            {f.long ? (
              <textarea className="edit-input hub-textarea" value={pub[f.key] ?? ''} placeholder={f.placeholder}
                onChange={e => setField(f.key, e.target.value)} rows={2} />
            ) : (
              <input className="edit-input" type="text" value={pub[f.key] ?? ''} placeholder={f.placeholder}
                onChange={e => setField(f.key, e.target.value)} />
            )}
          </div>
        ))}
      </div>

      <button className="edit-save-btn" style={{ marginTop: '28px' }} onClick={save}>Save changes</button>
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
