import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Manuscript, ManuscriptStatus, ManuscriptStructure, MatterRole, PublishingMetadata } from '../engine/types';
import { useReaderStore } from '../state/readerStore';
import { useLibraryStore } from '../state/libraryStore';
import { useSnapshotStore } from '../state/snapshotStore';
import { buildManuscriptStructure } from '../engine/ingestion/manuscriptStructure';
import {
  extractFrontMatterCandidates,
  proposeFrontMatter,
  applyFrontMatterCandidates,
} from '../engine/ingestion/frontMatterExtract';
import { computePublishReadiness, summarizeReadiness } from '../engine/publishing/readiness';
import {
  listMatterSections, upsertMatterSection, removeMatterSection, moveMatterSection,
  isListMatter, type AuthoredMatter,
} from '../engine/manuscript/matterEdit';
import type { MatterRegion } from '../engine/types';
import { totalWords, estimatePages, type ExtentRequest } from '../engine/exports/manuscriptExtent';
import { sortLibraryManuscripts } from '../engine/library';
import { loadAnnotations, loadSnapshot } from '../engine/storage';
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
import { BookIcon, ChevronLeftIcon, ChevronRightIcon, LayersIcon, ListLayoutIcon } from '../components/ui/Icons';
import { heroTitleClass } from '../components/ui/heroTitle';

interface PublishingStudioScreenProps {
  onExit: () => void;
  onOpenManuscript: () => void;
}

function statusClass(status: string): string {
  return 'status--' + status.toLowerCase().replace(/[^a-z]+/g, '-');
}

const FORMAT_LABEL: Record<StudioFormatId, string> = {
  docx: 'DOCX', epub: 'EPUB', smf: 'submission', md: 'Markdown',
};

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
  const replaceMarkdown = useLibraryStore(s => s.replaceMarkdown);

  const { exportManuscript, exportSmf } = useManuscriptArtifactExports();
  const [exportGateOpen, setExportGateOpen] = useState(false);
  const [smfOpen, setSmfOpen] = useState(false);
  const [smfMarkdown, setSmfMarkdown] = useState('');
  const [query, setQuery] = useState('');
  // Per-manuscript dismissal of the detected-details review prompt.
  const [reviewDismissedFor, setReviewDismissedFor] = useState<string | null>(null);
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

  // Detected publishing metadata — proposals for the author to review. Empty unless
  // the front matter yielded a value the author hasn't already filled in.
  const candidates = useMemo(
    () => (structure ? extractFrontMatterCandidates(structure) : {}),
    [structure],
  );
  const proposals = useMemo(
    () => (selected
      ? proposeFrontMatter(
          { author: selected.metadata.author, publishing: selected.metadata.publishing ?? {} },
          candidates,
        )
      : []),
    [selected, candidates],
  );

  // Pre-export readiness — required elements (title/author/copyright) vs.
  // recommended (ISBN/synopsis/dedication/about-author). Pure engine decision.
  const readiness = useMemo(
    () => (selected
      ? computePublishReadiness({
          title: selected.metadata.title,
          author: selected.metadata.author,
          publishing: selected.metadata.publishing ?? {},
          structure,
        }, selectedFormat)
      : []),
    [selected, structure, selectedFormat],
  );
  const readinessSummary = summarizeReadiness(readiness);

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

  const handleApplyDetected = useCallback(() => {
    if (!selected) return;
    const merged = applyFrontMatterCandidates(
      { author: selected.metadata.author, publishing: selected.metadata.publishing ?? {} },
      candidates,
    );
    updateManuscript(selected.id, { author: merged.author, publishing: merged.publishing });
    if (selected.id === openId) {
      const refreshed = useLibraryStore.getState().library.find(mm => mm.id === selected.id);
      const md = refreshed?.metadata.combinedMarkdown;
      if (refreshed && md) openManuscript(refreshed, getParsedManuscript(md).chapters);
    }
    showToast('Applied detected details.');
  }, [selected, candidates, openId, updateManuscript, openManuscript]);

  // Authored matter writes into the combined markdown (the store of record) as the
  // same comment fences ingestion produces, then re-parses via replaceMarkdown
  // (which does NOT re-run preprocessMarkdown). Re-open the manuscript if it's the
  // active one so the reader reflects the change.
  const handleSaveMatter = useCallback((newMarkdown: string) => {
    if (!selected) return;
    const refreshed = replaceMarkdown(selected.id, newMarkdown);
    if (refreshed && selected.id === openId) {
      const md = refreshed.metadata.combinedMarkdown;
      if (md) openManuscript(refreshed, getParsedManuscript(md).chapters);
    }
    showToast('Matter updated.');
  }, [selected, openId, replaceMarkdown, openManuscript]);

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

  // Version/status context for the hero — at-a-glance "where is this draft."
  const lastVersion = versions[0];
  const versionLine = lastVersion
    ? `${versions.length} version${versions.length !== 1 ? 's' : ''} · last saved ${new Date(lastVersion.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'No version saved yet';

  // The hero's single forward action: send the author to the next unfinished prep
  // step (required first), or straight to export when nothing's outstanding.
  const nextStep = readiness.find(i => !i.met && i.required) ?? readiness.find(i => !i.met);
  const primaryStep = nextStep ? { action: nextStep.action, cta: nextStep.hint } : null;

  const footerLine = readinessSummary.requiredMet
    ? (readinessSummary.missingOptional > 0 ? 'Ready to export · some optional details open' : 'Ready to export')
    : `${readinessSummary.missingRequired} required detail${readinessSummary.missingRequired !== 1 ? 's' : ''} still missing`;

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
              <MatterEditorPane
                key={selected.id}
                combinedMarkdown={combinedMarkdown}
                canEdit={canExport}
                onSave={handleSaveMatter}
              />
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
              <h2 className={heroTitleClass(m.title)}>{m.title}</h2>
              {m.author && <div className="hub-hero-byline">{m.author}</div>}
              <div className="studio-state-line">
                <span className={`hub-hero-status ms-status ${statusClass(m.status ?? 'Draft')}`}>{m.status ?? 'Draft'}</span>
                {!m.uncached && <span className="studio-version-line">{versionLine}</span>}
              </div>
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
              <div className="studio-hero-cta">
                <button
                  type="button"
                  className="studio-hero-cta-btn btn-fill"
                  onClick={primaryStep ? () => setPrepPane(primaryStep.action) : handlePrimaryExport}
                  disabled={!canExport}
                >
                  {primaryStep ? primaryStep.cta : `Export ${FORMAT_LABEL[selectedFormat]} →`}
                </button>
                <span className="studio-hero-cta-note">{footerLine}</span>
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

          <div className="studio-readiness" aria-label="Publish readiness">
            <div className="instrument-group-label studio-prep-label">Ready to export</div>
            <ul className="studio-readiness-list">
              {readiness.map(item => (
                <li key={item.id} className={`studio-readiness-item${item.met ? ' is-met' : ''}`}>
                  <span className="studio-readiness-mark" aria-hidden="true">{item.met ? '✓' : '○'}</span>
                  <span className="studio-readiness-label">{item.label}</span>
                  {!item.required && <span className="studio-readiness-opt">optional</span>}
                  {!item.met && (
                    <button
                      type="button"
                      className="studio-readiness-fix"
                      onClick={() => setPrepPane(item.action)}
                    >
                      {item.hint}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {proposals.length > 0 && reviewDismissedFor !== selected.id && (
          <section className="studio-detected" aria-label="Detected publishing details">
            <div className="studio-detected-head">
              <div className="studio-detected-intro">
                <div className="instrument-group-label">Detected in your manuscript</div>
                <p className="studio-detected-lead">
                  Found in your front matter. Applying fills only the title-page fields you’ve
                  left empty — it never overwrites what you’ve entered.
                </p>
              </div>
              <div className="studio-detected-actions">
                <button type="button" className="btn-ghost" onClick={() => setReviewDismissedFor(selected.id)}>
                  Dismiss
                </button>
                <button type="button" className="pub-save-btn" onClick={handleApplyDetected}>
                  Use these details
                </button>
              </div>
            </div>
            <ul className="studio-detected-list">
              {proposals.map(p => (
                <li key={p.field} className="studio-detected-row">
                  <span className="studio-detected-field">{p.label}</span>
                  <span className="studio-detected-value">{p.value}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

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
        footerAction={!readinessSummary.requiredMet ? { label: 'Edit details', onClick: () => setPrepPane('details') } : undefined}
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
  'half-title': 'Half title', 'title-page': 'Title page', 'frontispiece': 'Frontispiece',
  'copyright': 'Copyright', 'dedication': 'Dedication', 'epigraph': 'Epigraph',
  'foreword': 'Foreword', 'preface': 'Preface', 'introduction': 'Introduction',
  'cast': 'Cast of characters', 'list-of-illustrations': 'List of illustrations',
  'acknowledgements': 'Acknowledgements', 'author-note': "Author's note", 'afterword': 'Afterword',
  'about-author': 'About the author', 'also-by': 'Also by', 'colophon': 'Colophon',
  'appendix': 'Appendix', 'glossary': 'Glossary', 'bibliography': 'Bibliography',
  'index': 'Index', 'notes': 'Notes', 'reading-group-guide': 'Reading group guide',
  'excerpt': 'Excerpt', 'other': 'Section',
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

// ── Front & back matter editor: add / edit / remove the authored prose sections a
// draft doesn't already carry (epigraph, acknowledgements, about-the-author…).
// Each writes into the combined markdown as the same comment fence ingestion
// produces, so it flows into every export. Title-page / copyright / dedication are
// managed in Publishing Details (they have dedicated fields) and aren't edited here. ──
const AUTHORABLE: { role: MatterRole; region: MatterRegion; label: string; max: number }[] = [
  { role: 'epigraph', region: 'front', label: 'Epigraph', max: 1000 },
  { role: 'foreword', region: 'front', label: 'Foreword', max: 12000 },
  { role: 'preface', region: 'front', label: 'Preface', max: 12000 },
  { role: 'introduction', region: 'front', label: 'Introduction', max: 12000 },
  { role: 'acknowledgements', region: 'back', label: 'Acknowledgements', max: 4000 },
  { role: 'author-note', region: 'back', label: "Author's note", max: 6000 },
  { role: 'afterword', region: 'back', label: 'Afterword', max: 12000 },
  { role: 'about-author', region: 'back', label: 'About the author', max: 2500 },
  { role: 'also-by', region: 'back', label: 'Also by', max: 2000 },
];
const authorableSpec = (role: MatterRole) => AUTHORABLE.find(a => a.role === role) ?? null;

function MatterEditorPane({
  combinedMarkdown, canEdit, onSave,
}: {
  combinedMarkdown: string;
  canEdit: boolean;
  onSave: (newMarkdown: string) => void;
}) {
  const [editing, setEditing] = useState<MatterRole | null>(null);
  const [draft, setDraft] = useState('');

  // Sections in PUBLISHED order (markdown order), front then back, limited to the
  // roles this editor authors (title/copyright/dedication live in Details).
  const ordered = useMemo(() => {
    const { front, back } = listMatterSections(combinedMarkdown);
    const keep = (s: AuthoredMatter) => !!authorableSpec(s.role);
    return { front: front.filter(keep), back: back.filter(keep) };
  }, [combinedMarkdown]);
  const present = useMemo(() => {
    const byRole = new Map<MatterRole, AuthoredMatter>();
    for (const s of [...ordered.front, ...ordered.back]) byRole.set(s.role, s);
    return byRole;
  }, [ordered]);

  const spec = authorableSpec(editing as MatterRole);

  const begin = (role: MatterRole) => {
    setEditing(role);
    const body = present.get(role)?.body ?? '';
    // List matter is stored blank-line-separated; show one item per line for editing.
    setDraft(isListMatter(role) ? body.replace(/\n{2,}/g, '\n') : body);
  };
  const cancel = () => { setEditing(null); setDraft(''); };
  const save = () => {
    if (!spec) return;
    const body = draft.trim();
    if (!body) { cancel(); return; }
    onSave(upsertMatterSection(combinedMarkdown, { region: spec.region, role: spec.role, title: spec.label, body }));
    cancel();
  };
  const remove = (role: MatterRole) => {
    const a = authorableSpec(role);
    if (!a) return;
    onSave(removeMatterSection(combinedMarkdown, a.region, a.role));
    if (editing === role) cancel();
  };
  const move = (region: MatterRegion, role: MatterRole, dir: -1 | 1) => {
    onSave(moveMatterSection(combinedMarkdown, region, role, dir));
  };

  if (!canEdit) {
    return (
      <div className="hub-panel">
        <h2 className="hub-panel-title">Front &amp; back matter</h2>
        <p className="hub-panel-lead">Re-import this manuscript to add front &amp; back matter.</p>
      </div>
    );
  }

  if (spec) {
    const overLimit = draft.length > spec.max;
    const listHint = isListMatter(spec.role) ? ' One entry per line; titles render centered and italic.' : ' Separate paragraphs with a blank line.';
    return (
      <div className="hub-panel studio-matter-editor">
        <button type="button" className="btn-ghost studio-matter-back" onClick={cancel}>‹ All sections</button>
        <h2 className="hub-panel-title">{present.has(spec.role) ? 'Edit' : 'Add'} {spec.label.toLowerCase()}</h2>
        <div className="studio-matter-form">
          <textarea
            className="pub-field-input pub-field-textarea studio-matter-textarea"
            value={draft}
            rows={isListMatter(spec.role) ? 8 : 12}
            placeholder={`Write your ${spec.label.toLowerCase()}…${listHint}`}
            onChange={e => setDraft(e.target.value)}
            autoFocus
          />
          <div className="studio-matter-form-foot">
            <span className={`pub-field-counter${overLimit ? ' is-over' : ''}`}>{draft.length} / {spec.max}</span>
            <div className="studio-matter-form-actions">
              <button type="button" className="btn-ghost" onClick={cancel}>Cancel</button>
              <button type="button" className="pub-save-btn" disabled={overLimit} onClick={save}>Save section</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderGroup = (region: MatterRegion, label: string, items: AuthoredMatter[]) => (
    items.length > 0 && (
      <>
        <div className="instrument-group-label pub-section-label">{label}</div>
        <ul className="studio-matter-list">
          {items.map((s, i) => {
            const a = authorableSpec(s.role)!;
            return (
              <li key={s.role} className="studio-matter-row studio-matter-row--editable">
                <span className="studio-matter-reorder">
                  <button type="button" className="studio-matter-move" disabled={i === 0} aria-label={`Move ${a.label} up`} onClick={() => move(region, s.role, -1)}>↑</button>
                  <button type="button" className="studio-matter-move" disabled={i === items.length - 1} aria-label={`Move ${a.label} down`} onClick={() => move(region, s.role, 1)}>↓</button>
                </span>
                <span className="studio-matter-role">{a.label}</span>
                <span className="studio-matter-preview">{s.body.replace(/\n+/g, ' · ').slice(0, 80)}</span>
                <span className="studio-matter-row-actions">
                  <button type="button" className="btn-ghost" onClick={() => begin(s.role)}>Edit</button>
                  <button type="button" className="btn-ghost studio-matter-remove" onClick={() => remove(s.role)}>Remove</button>
                </span>
              </li>
            );
          })}
        </ul>
      </>
    )
  );

  const addable = AUTHORABLE.filter(a => !present.has(a.role));

  return (
    <div className="hub-panel studio-matter-editor">
      <h2 className="hub-panel-title">Front &amp; back matter</h2>
      <p className="hub-panel-lead">
        Authored sections that frame the body, shown here in the order they’ll appear in
        your exports — reorder with the arrows. Title page, copyright, and dedication are set
        in <strong>Publishing Details</strong>.
      </p>

      {renderGroup('front', 'Front matter', ordered.front)}
      {renderGroup('back', 'Back matter', ordered.back)}

      {addable.length > 0 && (
        <>
          <div className="instrument-group-label pub-section-label">Add a section</div>
          <div className="studio-matter-add">
            {addable.map(a => (
              <button key={a.role} type="button" className="studio-matter-add-btn" onClick={() => begin(a.role)}>
                + {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
