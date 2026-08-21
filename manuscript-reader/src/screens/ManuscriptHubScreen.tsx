import { useEffect, useMemo, useRef, useState } from 'react';
import { useReaderStore } from '../state/readerStore';
import { useLibraryStore } from '../state/libraryStore';
import { resolveAnnotationChapters } from '../engine/annotations/chapterResolve';
import { buildImportSummary } from '../engine/ingestion/importSummary';
import { isReaderAnnotation } from '../engine/types';
import type { Annotation, ReaderProgress } from '../engine/types';
import { CoverImage } from '../components/ui/CoverImage';
import { ChevronLeftIcon, DotsIcon, BookIcon } from '../components/ui/Icons';
import { LibraryCardEditModal } from '../components/library/LibraryCardEditModal';
import { ChapterTree } from '../components/library/ChapterTree';
import { applyChapterEdits, chapterEditsDirty, type ChapterEdit } from '../engine/manuscript/chapterEdit';
import { getParsedManuscript } from '../engine/ingestion/parseCache';
import { showToast } from '../components/ui/Toast';
import { useManuscriptArtifactExports } from '../hooks/useManuscriptArtifactExports';
import type { ExtentRequest } from '../engine/exports/manuscriptExtent';
import { buildShareableHTML, stripMatterRegions } from '../engine/exports/shareableReader';
import { manuscriptVersionId } from '../engine/manuscript/manuscriptVersion';
import { getSyncClient, syncEndpoint, isSyncConfigured } from '../sync/config';
import { SyncError } from '../sync/client';
import type { ShareHandle } from '../engine/types';

// Manuscript record: one work — structure, exports, and optional share (secondary).

interface ManuscriptHubScreenProps {
  onRead: () => void;   // enter the immersive reader at the resume position
  onExit: () => void;   // back to the library
}

type ConsoleTab = 'overview' | 'structure' | 'export' | 'sharing';

const TABS: { id: ConsoleTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'structure', label: 'Structure' },
  { id: 'export', label: 'Export' },
  { id: 'sharing', label: 'Share' },
];

const CRUMB_LABEL: Record<ConsoleTab, string> = {
  overview: 'Overview', sharing: 'Share', structure: 'Structure', export: 'Export',
};

// The publishable-artifact catalog, disciplined to four formats. Print + Ebook
// are one-click; Agent submission carries an extent selector (SMF convention:
// 250 words/page); Markdown is the advanced/interoperability escape hatch.
type ExtentChoice = 'full' | 'chapters' | 'pages' | 'words';
const EXTENT_REQUEST: Record<ExtentChoice, ExtentRequest> = {
  full: { kind: 'full' },
  chapters: { kind: 'chapters', count: 3 },
  pages: { kind: 'pages', count: 50 },
  words: { kind: 'words', count: 10000 },
};
const EXTENT_LABELS: { id: ExtentChoice; label: string }[] = [
  { id: 'full', label: 'Complete' },
  { id: 'chapters', label: 'First 3 chapters' },
  { id: 'pages', label: 'First 50 pages' },
  { id: 'words', label: 'First 10,000 words' },
];

/** Reader identities from imported or synced sessions (share tab roster). */
function deriveReaders(annotations: Annotation[]): ReaderProgress[] {
  const names = new Map<string, string>();
  for (const a of annotations) {
    if (!isReaderAnnotation(a)) continue;
    const key = a.readerId ?? a.readerName ?? '';
    const name = a.readerName ?? a.readerId ?? '';
    if (key && !names.has(key)) names.set(key, name);
  }
  return [...names.values()].map(name => ({ name, progress: 0 }));
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '·';
}

export function ManuscriptHubScreen({ onRead, onExit }: ManuscriptHubScreenProps) {
  const { manuscript, chapters, annotations: rawAnnotations, sessions, importSession, openManuscript } = useReaderStore();
  const { deleteManuscript, saveShare, updateManuscript, replaceMarkdown } = useLibraryStore();
  const [tab, setTab] = useState<ConsoleTab>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [smfExtent, setSmfExtent] = useState<ExtentChoice>('full');
  const [share, setShare] = useState<ShareHandle | null>(manuscript?.metadata.share ?? null);
  const [shareBusy, setShareBusy] = useState(false);
  const [pullBusy, setPullBusy] = useState(false);
  const [chapterEdits, setChapterEdits] = useState<ChapterEdit[] | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { exportManuscript, exportSmf } = useManuscriptArtifactExports();

  const combinedMarkdown = manuscript?.metadata.combinedMarkdown;
  const annotations = useMemo(
    () => resolveAnnotationChapters(rawAnnotations, combinedMarkdown),
    [rawAnnotations, combinedMarkdown],
  );
  const importSummary = useMemo(
    () => (combinedMarkdown ? buildImportSummary(combinedMarkdown) : null),
    [combinedMarkdown],
  );

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  if (!manuscript) return null;

  const m = manuscript.metadata;
  const title = m.title;
  const genre = m.publishing?.genre?.trim();
  const available = !!combinedMarkdown;
  const structureDirty = !!(combinedMarkdown && chapterEdits && chapterEditsDirty(combinedMarkdown, chapterEdits));

  function persistStructure() {
    if (!combinedMarkdown || !chapterEdits) return;
    if (!chapterEditsDirty(combinedMarkdown, chapterEdits)) return;
    const next = applyChapterEdits(combinedMarkdown, chapterEdits);
    if (!next) { showToast('Keep at least one chapter.'); return; }
    const updated = replaceMarkdown(manuscript.id, next);
    if (!updated) return;
    const parsed = getParsedManuscript(next);
    openManuscript(updated, parsed.chapters);
    showToast('Structure saved.');
  }

  const readers: ReaderProgress[] = sessions.length
    ? sessions.map((s): ReaderProgress => ({
        name: s.readerName,
        progress: Math.max(0, Math.min(1, s.progress || 0)),
        state: s.completedAt ? 'finished' : 'reading',
      }))
    : (m.readers ?? deriveReaders(annotations));
  const shareLive = !!share && share.state !== 'revoked';
  const shared = share ? shareLive : (m.shared ?? readers.length > 0);

  const setAside = importSummary ? importSummary.front.length + importSummary.back.length : 0;
  const chapterCount = m.chapterCount || chapters.length;
  const totalWords = m.wordCount || importSummary?.totalWords || 0;
  const readPct = m.progress != null ? Math.round(m.progress * 100) : null;
  const personalMarkCount = annotations.filter(a => !isReaderAnnotation(a)).length;
  const importedLabel = m.importedAt
    ? new Date(m.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const readerUrl = share?.readerUrl ?? '';
  const linkDisplay = readerUrl.replace(/^https?:\/\//, '');

  const copyLink = () => {
    if (!readerUrl) return;
    navigator.clipboard?.writeText(readerUrl).then(
      () => showToast('Link copied.'),
      () => showToast('Could not copy the link.'),
    );
  };

  // ── Share lifecycle (sync worker, brief §3.2) ────────────────────────────────
  // Create publishes an immutable snapshot: mint the share, build the self-contained
  // reader bound to it, host it, then persist the author's handle locally.
  const createShareLink = async () => {
    if (!combinedMarkdown || shareBusy) return;
    if (!isSyncConfigured()) { showToast('Sharing isn’t set up yet — no sync worker connected.'); return; }
    setShareBusy(true);
    try {
      const client = getSyncClient();
      const versionId = manuscriptVersionId(stripMatterRegions(combinedMarkdown));
      const settings = { askName: true, privateNotes: false };
      const created = await client.createShare({ title, versionId, markdown: combinedMarkdown, settings });
      const html = buildShareableHTML(title, combinedMarkdown, true, undefined, { endpoint: syncEndpoint(), shareId: created.shareId });
      await client.putReaderHtml(created.shareId, created.authorToken, html);
      const handle: ShareHandle = {
        shareId: created.shareId, authorToken: created.authorToken, readerUrl: created.readerUrl,
        state: 'live', versionId, createdAt: Date.now(), askName: settings.askName, privateNotes: settings.privateNotes,
      };
      saveShare(manuscript.id, handle);
      setShare(handle);
      showToast('Share link created.');
    } catch (e) {
      showToast(e instanceof SyncError ? e.message : 'Could not create the share link.');
    } finally {
      setShareBusy(false);
    }
  };

  const setShareState = async (next: 'live' | 'frozen' | 'revoked') => {
    if (!share || shareBusy) return;
    setShareBusy(true);
    try {
      const client = getSyncClient();
      if (next === 'revoked') await client.deleteShare(share.shareId, share.authorToken);
      else await client.patchShare(share.shareId, share.authorToken, { state: next });
      const handle: ShareHandle = { ...share, state: next };
      saveShare(manuscript.id, next === 'revoked' ? null : handle);
      setShare(next === 'revoked' ? null : handle);
      showToast(next === 'revoked' ? 'Link revoked.' : next === 'frozen' ? 'Feedback paused.' : 'Link reopened.');
    } catch (e) {
      showToast(e instanceof SyncError ? e.message : 'Could not update the share.');
    } finally {
      setShareBusy(false);
    }
  };

  const toggleShareSetting = async (key: 'askName' | 'privateNotes') => {
    if (!share || shareBusy) return;
    const nextSettings = { askName: share.askName, privateNotes: share.privateNotes, [key]: !share[key] };
    setShareBusy(true);
    try {
      await getSyncClient().patchShare(share.shareId, share.authorToken, { settings: nextSettings });
      const handle: ShareHandle = { ...share, askName: nextSettings.askName, privateNotes: nextSettings.privateNotes };
      saveShare(manuscript.id, handle);
      setShare(handle);
    } catch (e) {
      showToast(e instanceof SyncError ? e.message : 'Could not change the setting.');
    } finally {
      setShareBusy(false);
    }
  };

  // HP3: pull every reader's session from the worker and fold it into the manuscript
  // through the SAME merge path as JSON import (`importSession` dedupes by id and
  // replaces a reader's session by deterministic id) — a pure transport swap. Every
  // reader read the one hosted frozen version, so no per-file version reconciliation.
  const pullFeedback = async () => {
    if (!share || pullBusy) return;
    setPullBusy(true);
    try {
      const { sessions: pulled } = await getSyncClient().listSessions(share.shareId, share.authorToken);
      let imported = 0;
      for (const payload of pulled) {
        if (!Array.isArray(payload.annotations)) continue;
        imported += importSession(payload).imported;
      }
      showToast(
        pulled.length === 0
          ? 'No responses yet.'
          : imported === 0
            ? `Up to date — ${pulled.length} reader${pulled.length !== 1 ? 's' : ''}, nothing new.`
            : `${imported} new annotation${imported !== 1 ? 's' : ''} from ${pulled.length} reader${pulled.length !== 1 ? 's' : ''}.`,
      );
    } catch (e) {
      showToast(e instanceof SyncError ? e.message : 'Could not fetch responses.');
    } finally {
      setPullBusy(false);
    }
  };

  return (
    <>
    <div className="console">
      <div className="console-wrap">
        <nav className="console-crumbs" aria-label="Breadcrumb">
          <button type="button" className="console-crumb console-crumb--home" onClick={onExit}>
            <span className="console-crumb-mark"><BookIcon size={11} /></span>
            Library
          </button>
          <span className="console-crumb-sep" aria-hidden="true">›</span>
          <button type="button" className="console-crumb console-crumb--ms" onClick={() => setTab('overview')} title={title}>
            {title}
          </button>
          <span className="console-crumb-sep" aria-hidden="true">›</span>
          <span className="console-crumb console-crumb--here" aria-current="page">{CRUMB_LABEL[tab]}</span>
        </nav>

        <header className="console-head">
          <div className="console-cover">
            <CoverImage manuscriptId={manuscript.id} title={title} />
          </div>
          <div className="console-id">
            <button
              type="button"
              className="console-title console-title--edit"
              onClick={() => setEditOpen(true)}
              title="Edit manuscript"
            >
              {title}
            </button>
            <div className="console-byline">
              {m.author}{m.author && genre ? ' · ' : ''}{genre}
            </div>
            <div className="console-byline console-byline--meta">
              <span className="tnum">{totalWords.toLocaleString()}</span> words
              <span className="console-sep"> · </span>
              <span className="tnum">{chapterCount}</span> chapter{chapterCount === 1 ? '' : 's'}
              {readPct != null && (
                <>
                  <span className="console-sep"> · </span>
                  <span className="tnum">{readPct}%</span> read
                </>
              )}
            </div>
          </div>
          <div className="console-cta">
            <button type="button" className="console-open" onClick={onRead} disabled={!available}>
              Continue reading
            </button>
            <div className="console-kebab-wrap" ref={menuRef}>
              <button
                type="button"
                className="console-kebab"
                aria-label="Manuscript actions"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(o => !o)}
              >
                <DotsIcon size={16} />
              </button>
              {menuOpen && (
                <div className="console-menu" role="menu">
                  <button type="button" role="menuitem" className="console-menu-item" onClick={() => { setMenuOpen(false); onRead(); }} disabled={!available}>Continue reading</button>
                  <button type="button" role="menuitem" className="console-menu-item" onClick={() => { setMenuOpen(false); setEditOpen(true); }}>Edit manuscript</button>
                  <button
                    type="button"
                    role="menuitem"
                    className="console-menu-item console-menu-item--danger"
                    onClick={() => {
                      setMenuOpen(false);
                      if (window.confirm(`Remove "${title}"? This can't be undone.`)) { deleteManuscript(manuscript.id); onExit(); }
                    }}
                  >
                    Delete manuscript
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <nav className="console-tabs" role="tablist" aria-label="Manuscript sections">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`console-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="console-body">
            {importSummary && (
              <div className="console-integrity">
                <span className="console-ck" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l4 4L19 7" /></svg>
                </span>
                <span className="console-integrity-text">
                  <b>Import verified.</b>{' '}
                  <span className="tnum">{chapterCount}</span> chapters
                  <span className="console-sep"> · </span>
                  <span className="tnum">{setAside}</span> set aside
                  <span className="console-sep"> · </span>nothing discarded
                </span>
                {importedLabel && (
                  <span className="console-integrity-meta tnum">{importedLabel} · {totalWords.toLocaleString()} words</span>
                )}
              </div>
            )}

            <div className="console-panels">
              <section className="console-panel">
                <div className="panel-head">
                  <span className="panel-name">Your marks</span>
                </div>
                <div className="st-line"><span>Notes and highlights</span><b className="tnum">{personalMarkCount}</b></div>
                <button type="button" className="panel-link" onClick={onRead} disabled={!available}>
                  Continue in reader <ChevronLeftIcon size={11} />
                </button>
              </section>

              <section className="console-panel">
                <div className="panel-head">
                  <span className="panel-name">Structure</span>
                  <button type="button" className="panel-link" onClick={() => setTab('structure')}>Review <ChevronLeftIcon size={11} /></button>
                </div>
                <div className="st-line"><span>Chapters</span><b className="tnum">{chapterCount}</b></div>
                <div className="st-line"><span>Set aside at import</span><b className="tnum">{setAside} section{setAside === 1 ? '' : 's'}</b></div>
                <div className="st-line"><span>Total words</span><b className="tnum">{totalWords.toLocaleString()}</b></div>
                <p className="panel-foot">Set-aside sections (title page, dedication, TOC…) are kept, never discarded — promote any to a chapter in Review.</p>
              </section>

              <section className="console-panel">
                <div className="panel-head">
                  <span className="panel-name">Share</span>
                  {shared && <button type="button" className="panel-link" onClick={() => setTab('sharing')}>Manage <ChevronLeftIcon size={11} /></button>}
                </div>
                {shared ? (
                  <p className="panel-foot" style={{ marginTop: 0 }}>A read-only link is active for this work. Manage it on the Share tab.</p>
                ) : (
                  <div className="panel-empty">
                    <p>Optional — send a read-only link when you want someone else to read.</p>
                    <button type="button" className="panel-link" onClick={() => setTab('sharing')}>Share settings <ChevronLeftIcon size={11} /></button>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ── SHARING ── */}
        {tab === 'sharing' && (
          <div className="console-body">
            {share ? (
              <div className="console-panel console-panel--wide">
                <div className="panel-head">
                  <span className="panel-name">Share link</span>
                  {share.state === 'frozen'
                    ? <span className="console-live console-live--paused"><span className="console-pip" /> Feedback paused</span>
                    : <span className="console-live"><span className="console-pip" /> Live</span>}
                </div>
                <div className="console-linkrow">
                  <div className="console-linkbox">
                    <span className="tnum">{linkDisplay}</span>
                  </div>
                  <button type="button" className="console-open" onClick={copyLink}>Copy</button>
                </div>
                <p className="console-link-note">This is your <b>one link</b> — send it to every beta reader. Each person who opens it gets their own private identity, and their notes come back to you here, separately. You never make a link per reader.</p>
                <div className="console-share-opts">
                  <button type="button" className="console-oval" onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent('Read my manuscript: ' + title)}&body=${encodeURIComponent(readerUrl)}`; }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 7l8 5 8-5M4 6h16v12H4z" /></svg> Email
                  </button>
                  <button type="button" className="console-oval" onClick={() => { if (navigator.share) navigator.share({ title, url: readerUrl }).catch(() => {}); else copyLink(); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></svg> Share
                  </button>
                </div>

                <div className="console-settings">
                  <div className="console-setting">
                    <div><div className="console-setting-t">Readers are asked their name</div><div className="console-setting-d">So their feedback is attributed in your report</div></div>
                    <button type="button" className={`console-sw${share.askName ? '' : ' console-sw--off'}`} aria-label={`Ask readers their name: ${share.askName ? 'on' : 'off'}`} onClick={() => toggleShareSetting('askName')} disabled={shareBusy} />
                  </div>
                  <div className="console-setting">
                    <div><div className="console-setting-t">Readers see only their own notes</div><div className="console-setting-d">Each reader's marks stay private to them</div></div>
                    <button type="button" className={`console-sw${share.privateNotes ? '' : ' console-sw--off'}`} aria-label={`Readers see only their own notes: ${share.privateNotes ? 'on' : 'off'}`} onClick={() => toggleShareSetting('privateNotes')} disabled={shareBusy} />
                  </div>
                </div>

                <div className="panel-head panel-head--sub">
                  <span className="panel-name">Readers · <span className="tnum">{readers.length}</span> joined</span>
                  <button type="button" className="panel-link" onClick={pullFeedback} disabled={pullBusy}>
                    {pullBusy ? 'Checking…' : 'Check for responses'}
                  </button>
                </div>
                <div className="roster roster--full">
                  {readers.map((r, i) => (
                    <div className="reader" key={i}>
                      <span className="reader-av">{initials(r.name)}</span>
                      <div className="reader-main">
                        <span className="reader-name">{r.name}{r.state && <span className="reader-jn"> · {r.state}</span>}</span>
                        <span className="prog"><i style={{ width: `${Math.round(r.progress * 100)}%` }} /></span>
                      </div>
                      <span className="reader-pct tnum">{Math.round(r.progress * 100)}%</span>
                    </div>
                  ))}
                </div>

                <div className="console-revoke">
                  <span className="panel-foot">
                    {share.state === 'frozen'
                      ? 'Feedback is paused — readers can still open the link and read, but new notes aren’t accepted. Reopen to collect more. Feedback already received is kept.'
                      : 'Pause to stop collecting new feedback while the link stays readable. Revoke to turn the link off entirely. Feedback already received is always kept.'}
                  </span>
                  <div className="console-revoke-actions">
                    {share.state === 'frozen'
                      ? <button type="button" className="console-oval" onClick={() => setShareState('live')} disabled={shareBusy}>Reopen for feedback</button>
                      : <button type="button" className="console-oval" onClick={() => setShareState('frozen')} disabled={shareBusy}>Pause feedback</button>}
                    <button type="button" className="console-danger" onClick={() => { if (window.confirm('Revoke this link? Readers will lose access. Feedback already received is kept.')) setShareState('revoked'); }} disabled={shareBusy}>Revoke link</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="console-create">
                <h3>Share it with a link</h3>
                <p>You’ll get <b>one link</b> to send to all your beta readers — it works on any device, no account for you or them. Each reader gets their own private identity, and every note and question flows straight back into your report here.</p>
                <button type="button" className="console-open console-open--lg" onClick={createShareLink} disabled={shareBusy || !available || !isSyncConfigured()}>
                  {shareBusy ? 'Creating…' : 'Create share link'}
                </button>
                {!isSyncConfigured() && (
                  <p className="panel-foot">Sharing needs the sync worker configured (set <span className="tnum">VITE_SYNC_ENDPOINT</span>). Until then, use the Export tab to download a reader file.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STRUCTURE ── */}
        {tab === 'structure' && (
          <div className="console-body">
            <div className="console-panel console-panel--wide">
              <div className="panel-head">
                <span className="panel-name">Chapters · {chapterCount}</span>
                {available && (
                  <button
                    type="button"
                    className="panel-link"
                    disabled={!structureDirty}
                    onClick={persistStructure}
                  >
                    Save structure
                  </button>
                )}
              </div>
              {available ? (
                <ChapterTree combinedMarkdown={combinedMarkdown} onChange={setChapterEdits} />
              ) : (
                <p className="panel-foot">No chapters parsed. Re-import to restore the source text.</p>
              )}
              {importSummary && (importSummary.front.length > 0 || importSummary.back.length > 0) && (
                <>
                  <div className="panel-head panel-head--sub"><span className="panel-name">Set aside · {setAside}</span></div>
                  <div className="console-aside">
                    {[...importSummary.front, ...importSummary.back].map((s, i) => (
                      <div className="console-aside-row" key={i}>{s.title || s.role}</div>
                    ))}
                  </div>
                </>
              )}
              <p className="panel-foot">Rename, reorder, or mark chapters to remove, then Save structure. Promoting set-aside sections to chapters still happens at import review.</p>
            </div>
          </div>
        )}

        {/* ── EXPORT ── */}
        {tab === 'export' && (
          <div className="console-body">
            <div className="console-panel console-panel--wide">
              <div className="panel-head"><span className="panel-name">Publishable formats</span></div>
              {!available && (
                <p className="panel-foot" style={{ marginTop: 0 }}>
                  The source text isn’t cached on this device — re-import the file to export it.
                </p>
              )}

              <div className="export-list">
                <div className="export-row">
                  <div className="export-row-main">
                    <span className="export-row-name">Print edition</span>
                    <span className="export-row-desc">Publication-quality Word file · 5.5 × 8.5 KDP interior</span>
                  </div>
                  <button type="button" className="export-dl" disabled={!available} onClick={() => exportManuscript('docx')}>Download DOCX</button>
                </div>

                <div className="export-row">
                  <div className="export-row-main">
                    <span className="export-row-name">Ebook edition</span>
                    <span className="export-row-desc">EPUB 3 · Kindle, Apple Books, Kobo</span>
                  </div>
                  <button type="button" className="export-dl" disabled={!available} onClick={() => exportManuscript('epub')}>Download EPUB</button>
                </div>

                <div className="export-row export-row--config">
                  <div className="export-row-main">
                    <span className="export-row-name">Agent submission</span>
                    <span className="export-row-desc">Standard manuscript format · double-spaced, 250 words/page</span>
                    <div className="export-extent" role="group" aria-label="Submission extent">
                      {EXTENT_LABELS.map(e => (
                        <button
                          key={e.id}
                          type="button"
                          className={`export-extent-opt${smfExtent === e.id ? ' selected' : ''}`}
                          aria-pressed={smfExtent === e.id}
                          onClick={() => setSmfExtent(e.id)}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="button" className="export-dl" disabled={!available} onClick={() => exportSmf(EXTENT_REQUEST[smfExtent])}>Download SMF</button>
                </div>
              </div>

              <div className="panel-head panel-head--sub"><span className="panel-name">Advanced</span></div>
              <div className="export-list">
                <div className="export-row">
                  <div className="export-row-main">
                    <span className="export-row-name">Markdown</span>
                    <span className="export-row-desc">Plain source · Pandoc &amp; other toolchains</span>
                  </div>
                  <button type="button" className="export-dl export-dl--ghost" disabled={!available} onClick={() => exportManuscript('md')}>Download .md</button>
                </div>
              </div>

              <p className="panel-foot">Every export is built from the current saved text on this device. Formats respect your set-aside sections — front &amp; back matter are placed, never dropped.</p>
            </div>
          </div>
        )}
      </div>
    </div>
    {editOpen && (
      <LibraryCardEditModal
        manuscriptId={manuscript.id}
        title={title}
        genre={m.publishing?.genre ?? ''}
        combinedMarkdown={combinedMarkdown}
        onClose={() => setEditOpen(false)}
        onSave={({ title: nextTitle, genre: nextGenre, markdown }) => {
          updateManuscript(manuscript.id, {
            title: nextTitle,
            publishing: { ...m.publishing, genre: nextGenre || undefined },
          });
          if (markdown) replaceMarkdown(manuscript.id, markdown);
          const updated = useLibraryStore.getState().library.find(x => x.id === manuscript.id);
          if (updated) {
            const md = updated.metadata.combinedMarkdown;
            openManuscript(updated, md ? getParsedManuscript(md).chapters : chapters);
          }
        }}
      />
    )}
    </>
  );
}
