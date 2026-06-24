import { useMemo, useState, useRef, useEffect } from 'react';
import type { Manuscript } from '../engine/types';
import { getAnnotationStats, loadAnnotations, listSnapshots } from '../engine/storage';
import { manuscriptListSynopsis, sortLibraryManuscripts, type LibrarySortKey } from '../engine/library';
import { PlusIcon, StarIcon, DotsIcon, ListLayoutIcon, GridLayoutIcon } from '../components/ui/Icons';
import { CoverImage } from '../components/ui/CoverImage';
import type { LibraryNavFilter } from '../components/layout/AppShell';

function libraryTimeAgo(ts: number | undefined): string {
  if (!ts) return '—';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 2) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusClass(status: string): string {
  return 'status--' + status.toLowerCase().replace(/[^a-z]+/g, '-');
}

type LibraryViewMode = 'list' | 'grid';

interface LibraryScreenProps {
  library: Manuscript[];
  libraryFilter: LibraryNavFilter;
  onLibraryFilter?: (filter: LibraryNavFilter) => void;
  onOpen: (ms: Manuscript) => void;
  onRead: (ms: Manuscript) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  getReadingPosition: (id: string) => number;
}

export function LibraryScreen({
  library, libraryFilter, onLibraryFilter, onOpen, onRead, onNew, onDelete, onCycleStatus, onToggleFavorite, getReadingPosition,
}: LibraryScreenProps) {
  const [sortKey, setSortKey] = useState<LibrarySortKey>('lastOpened');
  const [viewMode, setViewMode] = useState<LibraryViewMode>('grid');
  const [query, setQuery] = useState('');

  const stored = library.map(ms => ({
    id: ms.id, title: ms.metadata.title, wordCount: ms.metadata.wordCount,
    chapterCount: ms.metadata.chapterCount, lastOpened: ms.metadata.lastOpened,
    status: ms.metadata.status, uncached: ms.metadata.uncached,
  }));
  const annStats = getAnnotationStats(stored);
  const inProgress = library.filter(m => m.metadata.status === 'In Progress').length;
  const favCount = library.filter(m => m.metadata.favorite).length;

  const filtered = useMemo(() => library.filter(m => {
    if (libraryFilter === 'favorites' && !m.metadata.favorite) return false;
    if (libraryFilter === 'recent' && !m.metadata.lastOpened) return false;
    const q = query.trim().toLowerCase();
    if (q && !m.metadata.title.toLowerCase().includes(q)
      && !(m.metadata.author ?? '').toLowerCase().includes(q)) return false;
    return true;
  }), [library, libraryFilter, query]);

  const sorted = useMemo(
    () => sortLibraryManuscripts(filtered, sortKey),
    [filtered, sortKey],
  );

  const aggregateLine = library.length === 0
    ? 'Your reading room.'
    : `${library.length} manuscript${library.length !== 1 ? 's' : ''} · ${inProgress} in progress · ${annStats.total.toLocaleString()} annotation${annStats.total !== 1 ? 's' : ''}`;

  return (
    <>
      <div className="library-header">
        <h1 className="library-title">Manuscripts</h1>
        <div className="library-controls">
          {library.length > 0 && (
            <>
              <label className="library-sort">
                <span className="visually-hidden">Sort manuscripts</span>
                <select
                  className="library-sort-select"
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as LibrarySortKey)}
                >
                  <option value="lastOpened">Last opened</option>
                  <option value="title">Title</option>
                  <option value="wordCount">Word count</option>
                </select>
              </label>
              <div className="library-view-toggle" role="group" aria-label="Library view">
                <button
                  type="button"
                  className={`library-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                  aria-pressed={viewMode === 'grid'}
                >
                  <GridLayoutIcon size={14} />
                </button>
                <button
                  type="button"
                  className={`library-view-btn${viewMode === 'list' ? ' active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List view"
                  aria-pressed={viewMode === 'list'}
                >
                  <ListLayoutIcon size={14} />
                </button>
              </div>
            </>
          )}
          <button type="button" className="library-new-btn" onClick={onNew}>
            <PlusIcon size={12} /> New Manuscript
          </button>
        </div>
      </div>

      {library.length > 0 && (
        <div className="library-subbar">
          <p className="library-stats-line">{aggregateLine}</p>
          <label className="library-search">
            <span className="visually-hidden">Search manuscripts</span>
            <input
              type="search"
              className="library-search-input"
              placeholder="Search manuscripts…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
        </div>
      )}

      {library.length === 0 ? (
        <div className="library-empty" id="library-empty">
          <p>No manuscripts yet.<br />Load a DOCX or paste text to begin.</p>
          <button type="button" className="btn-outline" onClick={onNew}>
            <PlusIcon size={12} /> Load manuscript
          </button>
        </div>
      ) : (
        <>
          {onLibraryFilter && favCount > 0 && (
            <div className="library-filters library-filters--shell-mobile">
              <button type="button" className={`tab${libraryFilter === 'all' ? ' active' : ''}`} style={{ padding: '10px 16px 10px 0', opacity: libraryFilter === 'all' ? 1 : 0.55 }} onClick={() => onLibraryFilter('all')}>All</button>
              <button type="button" className={`tab${libraryFilter === 'favorites' ? ' active' : ''}`} style={{ padding: '10px 16px 10px 0', opacity: libraryFilter === 'favorites' ? 1 : 0.55 }} onClick={() => onLibraryFilter('favorites')}>
                Favorites <span className="lib-filter-count">{favCount}</span>
              </button>
            </div>
          )}

          {sorted.length === 0 ? (
            <div className="library-empty">
              <p>
                {libraryFilter === 'favorites' && <>No favorites yet.<br />Star a manuscript to keep it close.</>}
                {libraryFilter === 'recent' && <>Nothing recent yet.<br />Open a manuscript to see it here.</>}
                {libraryFilter === 'all' && <>No manuscripts match this view.</>}
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <div id="ms-list" className="lib-list">
              {sorted.map(ms => (
                <LibraryListRow
                  key={ms.id}
                  ms={ms}
                  onOpen={() => onOpen(ms)}
                  onRead={() => onRead(ms)}
                  onDelete={() => onDelete(ms.id)}
                  onCycleStatus={() => onCycleStatus(ms.id)}
                  onToggleFavorite={() => onToggleFavorite(ms.id)}
                  progress={getReadingPosition(ms.id)}
                />
              ))}
            </div>
          ) : (
            <div className="lib-grid" id="ms-list">
              {sorted.map(ms => (
                <LibraryGridCard
                  key={ms.id}
                  ms={ms}
                  onOpen={() => onOpen(ms)}
                  onDelete={() => onDelete(ms.id)}
                  onToggleFavorite={() => onToggleFavorite(ms.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function LibraryListRow({ ms, onOpen, onRead, onDelete, onCycleStatus, onToggleFavorite, progress }: {
  ms: Manuscript; onOpen: () => void; onRead: () => void; onDelete: () => void;
  onCycleStatus: () => void; onToggleFavorite: () => void; progress: number;
}) {
  const { title, author, wordCount, status, lastOpened, uncached, favorite, publishing } = ms.metadata;
  const canRead = !!ms.metadata.combinedMarkdown;
  const synopsis = manuscriptListSynopsis(publishing);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <article
      className="lib-row"
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      role="button"
      tabIndex={0}
    >
      <div className="lib-row-cover-wrap" aria-hidden="true">
        <CoverImage manuscriptId={ms.id} title={title} />
      </div>

      <div className="lib-row-body">
        <div className="lib-row-eyebrow">
          <button
            type="button"
            className={`lib-row-status ms-status ${statusClass(status ?? 'Draft')}`}
            onClick={e => { e.stopPropagation(); onCycleStatus(); }}
          >
            {status ?? 'Draft'}
          </button>
          <span className="lib-row-edited">Last edited {libraryTimeAgo(lastOpened)}</span>
        </div>

        <h2 className="lib-row-title">{title}</h2>
        {author && <p className="lib-row-author">by {author}</p>}
        {synopsis ? <p className="lib-row-synopsis">{synopsis}</p> : null}
        {uncached && (
          <div className="lib-row-warn" role="alert" onClick={e => e.stopPropagation()}>
            Source text offloaded — re-import from <strong>Load</strong> to restore reading and export.
          </div>
        )}

        <div className="lib-row-measures" aria-label="Manuscript stats">
          <div className="lib-measure">
            <span className="lib-measure-label">Word count</span>
            <span className="lib-measure-val">{wordCount ? wordCount.toLocaleString() : '—'}</span>
          </div>
          {canRead && (
            <div className="lib-measure lib-measure--progress">
              <span className="lib-measure-label">Progress</span>
              <div className="lib-measure-track">
                <div className="lib-measure-fill" style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="lib-row-actions" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            className="lib-row-continue"
            disabled={!canRead}
            onClick={() => onRead()}
            title={canRead ? (progress > 0.01 ? 'Continue in reader' : 'Start reading') : 'Re-import to read'}
          >
            {progress > 0.01 ? 'Continue reading' : 'Start reading'} <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`lib-row-star${favorite ? ' active' : ''}`}
        aria-pressed={!!favorite}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
      >
        <StarIcon filled={!!favorite} />
      </button>

      <div className="lib-row-menu-wrap" ref={menuRef} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className="lib-row-menu-btn"
          aria-label="Manuscript actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(o => !o)}
        >
          <DotsIcon size={14} />
        </button>
        {menuOpen && (
          <div className="lib-row-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="lib-row-menu-item lib-row-menu-item--danger"
              onClick={() => {
                setMenuOpen(false);
                if (window.confirm(`Remove "${title}"?`)) onDelete();
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function LibraryGridCard({ ms, onOpen, onDelete, onToggleFavorite }: {
  ms: Manuscript; onOpen: () => void; onDelete: () => void; onToggleFavorite: () => void;
}) {
  const { title, wordCount, chapterCount, publishing, favorite } = ms.metadata;
  const genre = publishing?.genre;
  // The library projection doesn't always hydrate annotations onto the object;
  // fall back to the annotation cache (same source as the aggregate stat).
  const annCount = ms.annotations?.length || loadAnnotations(ms.id).length;
  const versionCount = listSnapshots(ms.id).length;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <article className="lib-card">
      <button
        type="button"
        className="lib-card-open"
        onClick={onOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      >
        <span className="lib-card-cover-wrap">
          <CoverImage manuscriptId={ms.id} title={title} />
          {versionCount > 0 && (
            <span className="lib-card-version" title={`${versionCount} saved version${versionCount !== 1 ? 's' : ''}`}>v{versionCount}</span>
          )}
        </span>
        <span className="lib-card-title">{title}</span>
        <span className="lib-card-genre">{genre || ' '}</span>
        <span className="lib-card-meta">
          <span className="lib-card-meta-cell">
            <span className="lib-card-meta-num">{wordCount ? wordCount.toLocaleString() : '—'}</span>
            <span className="lib-card-meta-label">Words</span>
          </span>
          <span className="lib-card-meta-cell">
            <span className="lib-card-meta-num">{chapterCount || '—'}</span>
            <span className="lib-card-meta-label">Chapters</span>
          </span>
          <span className="lib-card-meta-cell">
            <span className="lib-card-meta-num">{annCount || '—'}</span>
            <span className="lib-card-meta-label">Annotations</span>
          </span>
        </span>
      </button>

      <button
        type="button"
        className={`lib-card-star${favorite ? ' active' : ''}`}
        aria-pressed={!!favorite}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
      >
        <StarIcon filled={!!favorite} />
      </button>

      <div className="lib-card-menu-wrap" ref={menuRef} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className="lib-card-menu-btn"
          aria-label="Manuscript actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(o => !o)}
        >
          <DotsIcon size={14} />
        </button>
        {menuOpen && (
          <div className="lib-card-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="lib-row-menu-item lib-row-menu-item--danger"
              onClick={() => {
                setMenuOpen(false);
                if (window.confirm(`Remove "${title}"?`)) onDelete();
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
