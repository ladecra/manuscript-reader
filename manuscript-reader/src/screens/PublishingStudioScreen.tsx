import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Manuscript, ManuscriptStatus, ManuscriptStructure, MatterRole, PublishingMetadata } from '../engine/types';
import { useReaderStore } from '../state/readerStore';
import { useLibraryStore } from '../state/libraryStore';
import { useSnapshotStore } from '../state/snapshotStore';
import { buildManuscriptStructure } from '../engine/ingestion/manuscriptStructure';
import { totalWords, estimatePages, type ExtentRequest } from '../engine/exports/manuscriptExtent';
import { sortLibraryManuscripts } from '../engine/library';
import { loadAnnotations, loadEdits, loadSessions, loadSnapshot } from '../engine/storage';
import { useManuscriptArtifactExports } from '../hooks/useManuscriptArtifactExports';
import { getParsedManuscript } from '../engine/ingestion/parseCache';
import { chapterWordCounts } from '../engine/reading/manuscriptPages';
import { ChapterAtlasList } from '../components/hub/ChapterAtlasList';
import { StudioFormatRail, type StudioFormatId } from '../components/studio/StudioFormatRail';
import { StudioShelfTile } from '../components/studio/StudioShelfTile';
import { StudioExportModal, STUDIO_EXPORT_LIVE_DRAFT } from '../components/studio/StudioExportModal';
import { CoverImage } from '../components/ui/CoverImage';
import { PublishingDetailsForm } from '../components/hub/PublishingDetailsForm';
import { SmfExportModal } from '../components/reports/SmfExportModal';
import { showToast } from '../components/ui/Toast';
import { BookIcon, ChevronLeftIcon, ChevronRightIcon, LayersIcon, ListLayoutIcon, PencilIcon } from '../components/ui/Icons';

interface PublishingStudioScreenProps {
  onExit: () => void;
  onOpenManuscript: () => void;
}

function statusClass(status: string): string {
  return 'status--' + status.toLowerCase().replace(/[^a-z]+/g, '-');
}

type PrepPane = 'details' | 'chapters' | 'matter';

const PREP_TOOLS: {
  id: PrepPane;
  label: string;
  sub: string;
  Icon: typeof BookIcon;
}[] = [
  { id: 'details', label: 'Publishing Details', sub: 'Genre, synopsis & copyright', Icon: BookIcon },
  { id: 'chapters', label: 'Verify chapter map', sub: 'What the engine detected in your draft', Icon: ListLayoutIcon },
  { id: 'matter', label: 'Front & back matter', sub: 'Dedication, epigraph, about the author', Icon: LayersIcon },
];

/** Publishing Studio — one book on stage, the shelf peripheral, formats as instruments. */
export function PublishingStudioScreen({ onExit, onOpenManuscript }: PublishingStudioScreenProps) {
  const library = useLibraryStore(s => s.library);
  const openManuscript = useReaderStore(s => s.openManuscript);
  const openId = useReaderStore(s => s.manuscript?.id);
  const versionsByMs = useSnapshotStore(s => s.versions);
  const refreshVersions = useSnapshotStore(s => s.refresh);
  const saveVersion = useSnapshotStore(s => s.saveVersion);
  const updateManuscript = useLibraryStore(s => s.updateManuscript);

  const { exportManuscript, exportSmf } = useManuscriptArtifactExports();
  const [exportGateOpen, setExportGateOpen] = useState(false);
  const [smfOpen, setSmfOpen] = useState(false);
  const [smfMarkdown, setSmfMarkdown] = useState('');
  const [query, setQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<StudioFormatId>('docx');
  // Hub-style prep pane: null = stage + shelf; otherwise full center-column tool view.
  const [prepPane, setPrepPane] = useState<PrepPane | null>(null);

  const sorted = useMemo(() => sortLibraryManuscripts(library, 'lastOpened'), [library]);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => openId ?? sortLibraryManuscripts(library, 'lastOpened')[0]?.id,
  );
  const selected = useMemo(
    () => library.find(m => m.id === selectedId) ?? sorted[0],
    [library, selectedId, sorted],
  );
  const resolvedId = selected?.id;

  useEffect(() => {
    if (!selected || selected.id === openId) return;
    const md = selected.metadata.combinedMarkdown;
    if (!md) return;
    const { chapters } = getParsedManuscript(md);
    openManuscript(selected, chapters);
  }, [selected, openId, openManuscript]);

  useEffect(() => {
    if (resolvedId) refreshVersions(resolvedId);
  }, [resolvedId, refreshVersions]);

  useEffect(() => {
    document.querySelector<HTMLElement>('.app-shell-body')?.scrollTo(0, 0);
  }, [prepPane]);

  const combinedMarkdown = selected?.metadata.combinedMarkdown ?? '';
  const canExport = !!combinedMarkdown;
  const noExportHint = 'Re-import this manuscript to export it';

  // The structural model — built once from the live draft and shared by the stats
  // row and the Verify Chapter Map pane (the parse is cached, so this is cheap).
  const structure = useMemo(
    () => (combinedMarkdown ? buildManuscriptStructure(combinedMarkdown) : null),
    [combinedMarkdown],
  );

  const stats = useMemo(() => {
    if (structure) {
      const words = totalWords(structure);
      return { words, pages: estimatePages(words), chapters: structure.chapters.length };
    }
    if (!selected) return null;
    const words = selected.metadata.wordCount ?? 0;
    return { words, pages: estimatePages(words), chapters: selected.metadata.chapterCount ?? 0 };
  }, [structure, selected]);

  const annCount = selected ? loadAnnotations(selected.id).length : 0;
  const versions = (resolvedId && versionsByMs[resolvedId]) || [];

  // "Tools used" — pure storage reads, no new persistence. Each chip lights only
  // when the author actually used that surface, so the row reads as a record of
  // how this book moved through the app.
  const toolsUsed = useMemo(() => {
    if (!selected) return null;
    const readerIds = new Set(loadSessions(selected.id).map(s => s.readerId).filter(Boolean));
    return {
      reader: (selected.metadata.progress ?? 0) > 0,
      editor: loadEdits(selected.id).length > 0,
      annotations: annCount > 0,
      readers: readerIds.size,
    };
  }, [selected, annCount]);

  const handleSaveDetails = useCallback(
    (patch: { title: string; author: string; status: ManuscriptStatus; publishing: PublishingMetadata }) => {
      if (!selected) return;
      updateManuscript(selected.id, patch);
      if (selected.id === openId) {
        const refreshed = useLibraryStore.getState().library.find(mm => mm.id === selected.id);
        const md = refreshed?.metadata.combinedMarkdown;
        if (refreshed && md) openManuscript(refreshed, getParsedManuscript(md).chapters);
      }
      showToast('Saved.');
    },
    [selected, openId, updateManuscript, openManuscript],
  );

  const handleSaveVersion = useCallback(() => {
    if (!selected || selected.id !== openId) return;
    const meta = saveVersion(selected);
    if (meta) { refreshVersions(selected.id); showToast('Version saved.'); }
    else showToast('Nothing new to save.');
  }, [selected, openId, saveVersion, refreshVersions]);

  const resolveExportMarkdown = useCallback(async (exportSource: string): Promise<string | null> => {
    if (!selected) return null;
    if (exportSource === STUDIO_EXPORT_LIVE_DRAFT) {
      return combinedMarkdown || null;
    }
    const snap = await loadSnapshot(selected.id, exportSource);
    if (!snap?.markdown) {
      showToast('Could not load that version — pick another or use your current draft.');
      return null;
    }
    return snap.markdown;
  }, [selected, combinedMarkdown]);

  const runExport = useCallback(async (format: StudioFormatId, markdown: string) => {
    if (format === 'smf') {
      setSmfMarkdown(markdown);
      setSmfOpen(true);
      return;
    }
    await exportManuscript(format, markdown);
  }, [exportManuscript]);

  const handleExportGateConfirm = useCallback(async (exportSource: string) => {
    const md = await resolveExportMarkdown(exportSource);
    if (!md) return;
    await runExport(selectedFormat, md);
  }, [resolveExportMarkdown, runExport, selectedFormat]);

  const handleSmf = useCallback(async (request: ExtentRequest) => {
    await exportSmf(request, smfMarkdown || combinedMarkdown);
  }, [exportSmf, smfMarkdown, combinedMarkdown]);

  const handlePrimaryExport = useCallback(() => {
    if (!canExport) return;
    setExportGateOpen(true);
  }, [canExport]);

  function selectManuscript(ms: Manuscript) {
    if (!ms.metadata.combinedMarkdown) {
      showToast('Source text offloaded — re-import from Load to publish this one.');
    }
    setPrepPane(null);
    setSelectedId(ms.id);
  }

  if (library.length === 0 || !selected) {
    return (
      <div className="hub hub--3col hub--studio" id="screen-publishing">
        <main className="hub-main">
          <div className="studio-empty">
            <h1 className="studio-page-title">Publishing Studio</h1>
            <p className="studio-empty-lead">Add a manuscript to produce print-ready or agent-ready files.</p>
            <button type="button" className="hub-detail-nudge" onClick={onExit}>Go to your library →</button>
          </div>
        </main>
      </div>
    );
  }

  const m = selected.metadata;
  const publishing = m.publishing ?? {};
  const q = query.trim().toLowerCase();
  const shelfItems = sorted.filter(ms =>
    !q || ms.metadata.title.toLowerCase().includes(q) || (ms.metadata.author ?? '').toLowerCase().includes(q),
  );

  const metaFields = [
    { label: 'Author', value: m.author },
    { label: 'Copyright', value: [publishing.copyrightYear, publishing.copyrightHolder].filter(Boolean).join(' · ') || undefined },
    { label: 'ISBN', value: publishing.isbn },
    { label: 'Publisher', value: publishing.publisher },
  ];
  const filledCount = metaFields.filter(f => f.value).length;
  const metadataComplete = filledCount >= metaFields.length;

  /** Editorial line only — not an engine readiness check (see comment on tagline in JSX). */
  const showStageTagline = canExport && !m.uncached;

  const footerLine = metadataComplete
    ? 'Title-page details on file'
    : 'Some title-page fields are still empty';

  return (
    <div className="hub hub--3col hub--studio" id="screen-publishing">
      <main className="hub-main">
        {prepPane ? (
          <div className="hub-panel hub-tool-pane studio-prep-pane">
            <button
              type="button"
              className="btn-ghost"
              style={{ marginBottom: '30px' }}
              onClick={() => setPrepPane(null)}
            >
              ‹ Publishing studio
            </button>

            {prepPane === 'details' && (
              <PublishingDetailsForm
                key={selected.id}
                title={m.title}
                author={m.author ?? ''}
                status={(m.status as ManuscriptStatus) ?? 'Draft'}
                publishing={publishing}
                onSave={handleSaveDetails}
              />
            )}

            {prepPane === 'chapters' && (
              <ChapterMapPane structure={structure} combinedMarkdown={combinedMarkdown} />
            )}

            {prepPane === 'matter' && (
              <div className="hub-panel studio-matter-stub">
                <h2 className="hub-panel-title">Front &amp; back matter</h2>
                <p className="hub-panel-lead">
                  Add a dedication, epigraph, acknowledgements, or an about-the-author page —
                  authored sections that frame the body and flow into every export.
                </p>
                <p className="studio-matter-soon">Coming soon</p>
              </div>
            )}
          </div>
        ) : (
          <>
        <div className="hub-page-top">
          <button type="button" className="hub-back" onClick={onExit}>
            <ChevronLeftIcon size={10} />
            Library
          </button>
          <button type="button" className="hub-open-reader" onClick={onOpenManuscript}>
            Manuscript page <span aria-hidden="true">→</span>
          </button>
        </div>

        <header className="studio-page-head">
          <h1 className="studio-page-title">Publishing Studio</h1>
          <p className="studio-page-lead">
            {library.length} manuscript{library.length !== 1 ? 's' : ''} · select one to publish
          </p>
        </header>

        {m.uncached && (
          <div className="hub-warn studio-warn" role="alert">
            Source text offloaded — re-import from <strong>Load</strong> to export this manuscript.
          </div>
        )}

        <div key={selected.id} className="studio-stage-card">
          <header className="hub-hero studio-hero">
            <div className="hub-hero-cover-wrap studio-hero-cover-wrap">
              <div className="hub-hero-cover">
                <CoverImage manuscriptId={selected.id} title={m.title} editable />
              </div>
            </div>
            <div className="hub-hero-text">
              {publishing.series && <div className="hub-hero-series">{publishing.series}</div>}
              <h2 className="hub-hero-title">{m.title}</h2>
              {m.author && <div className="hub-hero-byline">{m.author}</div>}
              {publishing.genre?.trim() ? (
                <div className="hub-hero-genre">
                  <span>{publishing.genre.trim()}</span>
                  <button
                    type="button"
                    className="hub-hero-genre-edit"
                    onClick={() => setPrepPane('details')}
                    aria-label="Edit genre and synopsis"
                  >
                    <PencilIcon size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="hub-hero-genre-add"
                  onClick={() => setPrepPane('details')}
                >
                  Add genre &amp; synopsis
                </button>
              )}
              {publishing.subtitle && <div className="hub-hero-subtitle">{publishing.subtitle}</div>}
              {publishing.synopsis?.trim() && <p className="hub-hero-synopsis">{publishing.synopsis.trim()}</p>}
              <span className={`hub-hero-status ms-status ${statusClass(m.status ?? 'Draft')}`}>{m.status ?? 'Draft'}</span>
              {showStageTagline && (
                <p className="studio-stage-tagline">
                  Ready for print and submission formats.
                </p>
              )}
              {toolsUsed && (
                <div className="studio-tools-used" aria-label="Tools used on this manuscript">
                  <span className="studio-tools-label">Tools used</span>
                  <div className="studio-tools-chips">
                    <span className="studio-tool-chip studio-tool-chip--library is-on">Library</span>
                    <span className={`studio-tool-chip studio-tool-chip--reader${toolsUsed.reader ? ' is-on' : ''}`}>Reader</span>
                    <span className={`studio-tool-chip studio-tool-chip--editor${toolsUsed.editor ? ' is-on' : ''}`}>Manuscript Editor</span>
                    <span className={`studio-tool-chip studio-tool-chip--annotations${toolsUsed.annotations ? ' is-on' : ''}`}>Annotations</span>
                    {toolsUsed.readers > 0 && (
                      <span className="studio-tool-chip studio-tool-chip--readers is-on">
                        {toolsUsed.readers} Reader{toolsUsed.readers !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="hub-hero-stats studio-hero-stats" aria-label="Manuscript summary">
                {stats && stats.words > 0 && (
                  <div className="hub-stat">
                    <span className="hub-stat-value">{stats.words.toLocaleString()}</span>
                    <span className="hub-stat-label">Words</span>
                  </div>
                )}
                {stats && (
                  <div className="hub-stat">
                    <span className="hub-stat-value">~{stats.pages}</span>
                    <span className="hub-stat-label">Pages</span>
                  </div>
                )}
                {stats && (
                  <div className="hub-stat">
                    <span className="hub-stat-value">{stats.chapters}</span>
                    <span className="hub-stat-label">Chapters</span>
                  </div>
                )}
                {annCount > 0 && (
                  <div className="hub-stat">
                    <span className="hub-stat-value">{annCount}</span>
                    <span className="hub-stat-label">Annotations</span>
                  </div>
                )}
              </div>
            </div>
          </header>

          <nav className="studio-prep-nav" aria-label="Before you export">
            <div className="instrument-group-label studio-prep-label">Before you export</div>
            <div className="instrument-nav">
              {PREP_TOOLS.map(({ id, label, sub, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="instrument-item instrument-item--tool"
                  onClick={() => setPrepPane(id)}
                >
                  <span className="instrument-item-icon"><Icon size={15} /></span>
                  <span className="instrument-item-stack">
                    <span className="instrument-item-label">{label}</span>
                    <span className="instrument-item-sub">{sub}</span>
                  </span>
                  <span className="instrument-item-chevron"><ChevronRightIcon size={10} /></span>
                </button>
              ))}
            </div>
          </nav>
        </div>

        {shelfItems.length > 0 && (
          <section className="studio-shelf" aria-label="Manuscripts on your shelf">
            <div className="studio-shelf-head">
              <div className="instrument-group-label studio-shelf-label">On your shelf</div>
              <label className="studio-shelf-search">
                <span className="visually-hidden">Find on shelf</span>
                <input
                  type="search"
                  className="studio-shelf-search-input"
                  placeholder="Find on shelf…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </label>
            </div>
            <div className="studio-shelf-grid" role="list">
              {shelfItems.map(ms => (
                <StudioShelfTile
                  key={ms.id}
                  manuscriptId={ms.id}
                  title={ms.metadata.title}
                  selected={ms.id === selected.id}
                  onSelect={() => selectManuscript(ms)}
                />
              ))}
            </div>
          </section>
        )}
        {shelfItems.length === 0 && q && (
          <p className="studio-shelf-empty">No manuscripts match “{query.trim()}”.</p>
        )}
          </>
        )}
      </main>

      <StudioFormatRail
        selectedFormat={selectedFormat}
        onSelectFormat={setSelectedFormat}
        canExport={canExport}
        disabledHint={noExportHint}
        footerLine={footerLine}
        footerAction={!metadataComplete ? { label: 'Edit details', onClick: () => setPrepPane('details') } : undefined}
        onPrimary={handlePrimaryExport}
      />

      <StudioExportModal
        key={exportGateOpen ? `gate-${selected.id}-${selectedFormat}` : 'gate-closed'}
        open={exportGateOpen}
        format={selectedFormat}
        title={m.title}
        versions={versions}
        liveMarkdown={combinedMarkdown}
        manuscriptAvailable={canExport}
        onClose={() => setExportGateOpen(false)}
        onSaveVersion={handleSaveVersion}
        onConfirm={handleExportGateConfirm}
      />

      <SmfExportModal
        open={smfOpen}
        subject={m.title}
        combinedMarkdown={smfMarkdown || combinedMarkdown}
        onClose={() => setSmfOpen(false)}
        onExport={handleSmf}
      />
    </div>
  );
}

const MATTER_LABELS: Record<MatterRole, string> = {
  'half-title': 'Half title', 'title-page': 'Title page', 'copyright': 'Copyright',
  'dedication': 'Dedication', 'epigraph': 'Epigraph', 'foreword': 'Foreword',
  'preface': 'Preface', 'introduction': 'Introduction', 'acknowledgements': 'Acknowledgements',
  'author-note': "Author's note", 'afterword': 'Afterword', 'about-author': 'About the author',
  'also-by': 'Also by', 'colophon': 'Colophon', 'appendix': 'Appendix', 'glossary': 'Glossary',
  'notes': 'Notes', 'other': 'Section',
};

// ── Verify Chapter Map: a read-only view of what the ingestion engine detected —
// front/back matter and the chapter sequence. Chapters are often *reconstructed*
// by heuristic (headingless promotion), so this lets the author confirm the
// boundaries and titles before exporting. Renders straight from the structural
// model; it makes no decisions of its own. ──
function ChapterMapPane({
  structure,
  combinedMarkdown,
}: {
  structure: ManuscriptStructure | null;
  combinedMarkdown: string;
}) {
  const wordsByIndex = useMemo(
    () => (combinedMarkdown ? chapterWordCounts(combinedMarkdown) : new Map<number, number>()),
    [combinedMarkdown],
  );

  if (!structure || structure.chapters.length === 0) {
    return (
      <div className="hub-panel">
        <h2 className="hub-panel-title">Chapter map</h2>
        <p className="hub-panel-lead">No chapters detected — re-import this manuscript to map its structure.</p>
      </div>
    );
  }
  const { frontMatter, chapters, backMatter } = structure;
  const atlasRows = chapters.map(c => ({
    key: c.id,
    index: c.index,
    title: c.title,
    sceneBreakCount: c.sceneBreakCount,
  }));

  return (
    <div className="hub-panel studio-chaptermap">
      <h2 className="hub-panel-title">Chapter map</h2>
      <p className="hub-panel-lead">
        What the engine detected in your draft. Chapter breaks are often reconstructed from
        visual cues — confirm the sequence and titles read correctly before you export.
        Counts are per chapter; flags appear at ≤0.25× or ≥2.1× your average chapter length.
      </p>

      {frontMatter.length > 0 && (
        <>
          <div className="instrument-group-label pub-section-label">Front matter</div>
          <ul className="studio-matter-list">
            {frontMatter.map((s, i) => (
              <li key={`fm-${i}`} className="studio-matter-row">
                <span className="studio-matter-role">{MATTER_LABELS[s.role]}</span>
                {s.title && <span className="studio-matter-title">{s.title}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="instrument-group-label pub-section-label">
        {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
      </div>
      <ChapterAtlasList rows={atlasRows} wordsByIndex={wordsByIndex} />

      {backMatter.length > 0 && (
        <>
          <div className="instrument-group-label pub-section-label">Back matter</div>
          <ul className="studio-matter-list">
            {backMatter.map((s, i) => (
              <li key={`bm-${i}`} className="studio-matter-row">
                <span className="studio-matter-role">{MATTER_LABELS[s.role]}</span>
                {s.title && <span className="studio-matter-title">{s.title}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
