import { useMemo, useState, useRef, useEffect } from 'react';
import type { Manuscript, PublishingMetadata } from '../engine/types';
import { LibraryCardEditModal } from '../components/library/LibraryCardEditModal';
import { loadAnnotations, listSnapshots } from '../engine/storage';
import { sortLibraryManuscripts, type LibrarySortKey } from '../engine/library';
import { PlusIcon, StarIcon, DotsIcon, ListLayoutIcon, GridLayoutIcon } from '../components/ui/Icons';
import { CoverImage } from '../components/ui/CoverImage';
import type { LibraryNavFilter } from '../components/layout/AppShell';

function formatImported(ts: number | undefined): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type LibraryViewMode = 'list' | 'grid';

interface LibraryScreenProps {
  library: Manuscript[];
  libraryFilter: LibraryNavFilter;
  onLibraryFilter?: (filter: LibraryNavFilter) => void;
  onOpenRecord: (ms: Manuscript) => void;
  onRead: (ms: Manuscript) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onUpdateManuscript: (id: string, patch: { title?: string; publishing?: PublishingMetadata }) => void;
  onCycleStatus: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  getReadingPosition: (id: string) => number;
}

export function LibraryScreen({
  library, libraryFilter, onLibraryFilter, onOpenRecord, onRead, onNew, onDelete, onUpdateManuscript, onToggleFavorite,
  getReadingPosition,
}: LibraryScreenProps) {
  const [sortKey, setSortKey] = useState<LibrarySortKey>('lastOpened');
  const [viewMode, setViewMode] = useState<LibraryViewMode>('list');
  const [query, setQuery] = useState('');

  const favCount = library.filter(m => m.metadata.favorite).length;

  const continueMs = useMemo(() => {
    if (library.length === 0) return null;
    return [...library].sort((a, b) => (b.metadata.lastOpened ?? 0) - (a.metadata.lastOpened ?? 0))[0] ?? null;
  }, [library]);

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

  return (
    <>
      <div className="library-header">
        <div className="library-heading">
          <h1 className="library-title">Manuscripts</h1>
          {library.length > 0 && (
            <p className="library-stats-line">
              <span className="tnum">{library.length}</span> manuscript{library.length !== 1 ? 's' : ''}
              {favCount > 0 && (
                <>
                  {' · '}<span className="tnum">{favCount}</span> favorite{favCount !== 1 ? 's' : ''}
                </>
              )}
            </p>
          )}
        </div>
        <div className="library-actions">
          {library.length > 0 && (
            <label className="library-search">
              <span className="visually-hidden">Search manuscripts</span>
              <svg className="library-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
              </svg>
              <input
                type="search"
                className="library-search-input"
                placeholder="Search manuscripts…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
          )}
          <button type="button" className="library-new-btn" onClick={onNew}>
            <PlusIcon size={14} /> New manuscript
          </button>
        </div>
      </div>

      {library.length > 0 && (
        <div className="library-controls-row">
          <span className="library-col-head">Manuscript</span>
          <div className="library-sortbox">
            <label className="library-sort">
              <span className="visually-hidden">Sort manuscripts</span>
              <select
                className="library-sort-select"
                value={sortKey}
                onChange={e => setSortKey(e.target.value as LibrarySortKey)}
              >
                <option value="lastOpened">Sort: Recent</option>
                <option value="title">Sort: Title</option>
                <option value="wordCount">Sort: Longest</option>
              </select>
            </label>
            <div className="library-view-toggle" role="group" aria-label="Library view">
              <button
                type="button"
                className={`library-view-btn${viewMode === 'list' ? ' active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List view"
                aria-pressed={viewMode === 'list'}
              >
                <ListLayoutIcon size={14} />
              </button>
              <button
                type="button"
                className={`library-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <GridLayoutIcon size={14} />
              </button>
            </div>
          </div>
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
          {continueMs && (
            <button
              type="button"
              className="library-continue"
              onClick={() => onRead(continueMs)}
            >
              <span className="library-continue-kicker">Continue</span>
              <span className="library-continue-title">{continueMs.metadata.title}</span>
              <span className="library-continue-meta">
                {continueMs.metadata.chapterCount ? (
                  <><span className="tnum">{continueMs.metadata.chapterCount}</span> chapters · </>
                ) : null}
                {continueMs.metadata.wordCount ? (
                  <><span className="tnum">{continueMs.metadata.wordCount.toLocaleString()}</span> words · </>
                ) : null}
                <span className="tnum">{Math.round(getReadingPosition(continueMs.id) * 100)}%</span> read
              </span>
              <span className="library-continue-bar" aria-hidden="true">
                <i style={{ width: `${Math.round(getReadingPosition(continueMs.id) * 100)}%` }} />
              </span>
            </button>
          )}

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
            <div id="ms-list" className="lib-list" role="list">
              {sorted.map(ms => (
                <LibraryListRow
                  key={ms.id}
                  ms={ms}
                  onRead={() => onRead(ms)}
                  onOpenRecord={() => onOpenRecord(ms)}
                  onDelete={() => onDelete(ms.id)}
                  onToggleFavorite={() => onToggleFavorite(ms.id)}
                />
              ))}
            </div>
          ) : (
            <div className="lib-grid" id="ms-list">
              {sorted.map(ms => (
                <LibraryGridCard
                  key={ms.id}
                  ms={ms}
                  onRead={() => onRead(ms)}
                  onOpenRecord={() => onOpenRecord(ms)}
                  onDelete={() => onDelete(ms.id)}
                  onUpdate={(patch) => onUpdateManuscript(ms.id, patch)}
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

function LibraryListRow({ ms, onRead, onOpenRecord, onDelete, onToggleFavorite }: {
  ms: Manuscript; onRead: () => void; onOpenRecord: () => void; onDelete: () => void; onToggleFavorite: () => void;
}) {
  const { title, author, wordCount, chapterCount, importedAt, uncached, favorite, publishing } = ms.metadata;
  const genre = publishing?.genre;
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

  const metaParts = [author, genre, formatImported(importedAt) && `Imported ${formatImported(importedAt)}`].filter(Boolean);

  return (
    <article
      className="lib-row"
      onClick={onRead}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRead(); } }}
      role="button"
      tabIndex={0}
    >
      <div className="lib-row-cover" aria-hidden="true">
        <CoverImage manuscriptId={ms.id} title={title} />
      </div>

      <div className="lib-row-main">
        <h2 className="lib-row-title">{title}</h2>
        <p className="lib-row-meta">
          {metaParts.map((part, i) => (
            <span key={i}>{i > 0 && <span className="lib-dot" aria-hidden="true">·</span>}{part}</span>
          ))}
        </p>
        {uncached && (
          <span className="lib-row-warn" role="alert" onClick={e => e.stopPropagation()}>
            Source text offloaded — re-import to restore reading &amp; export.
          </span>
        )}
      </div>

      <div className="lib-row-num">
        <span className="lib-num-v tnum">{wordCount ? wordCount.toLocaleString() : '—'}</span>
        <span className="lib-num-k">words</span>
      </div>
      <div className="lib-row-num">
        <span className="lib-num-v tnum">{chapterCount || '—'}</span>
        <span className="lib-num-k">chapters</span>
      </div>

      <div className="lib-row-end" onClick={e => e.stopPropagation()}>
        <span className="lib-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
        </span>
        <div className="lib-row-menu-wrap" ref={menuRef}>
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
                className="lib-row-menu-item"
                onClick={() => { setMenuOpen(false); onOpenRecord(); }}
              >
                Details
              </button>
              <button
                type="button"
                role="menuitem"
                className="lib-row-menu-item"
                onClick={() => { setMenuOpen(false); onToggleFavorite(); }}
              >
                <StarIcon filled={!!favorite} /> {favorite ? 'Remove from favorites' : 'Add to favorites'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="lib-row-menu-item lib-row-menu-item--danger"
                onClick={() => { setMenuOpen(false); if (window.confirm(`Remove "${title}"?`)) onDelete(); }}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function LibraryGridCard({ ms, onRead, onOpenRecord, onDelete, onUpdate, onToggleFavorite }: {
  ms: Manuscript;
  onRead: () => void;
  onOpenRecord: () => void;
  onDelete: () => void;
  onUpdate: (patch: { title?: string; publishing?: PublishingMetadata }) => void;
  onToggleFavorite: () => void;
}) {
  const { title, wordCount, chapterCount, publishing, favorite } = ms.metadata;
  const genre = publishing?.genre;
  // The library projection doesn't always hydrate annotations onto the object;
  // fall back to the annotation cache (same source as the aggregate stat).
  const annCount = ms.annotations?.length || loadAnnotations(ms.id).length;
  const versionCount = listSnapshots(ms.id).length;
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
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
        className="lib-card-open lib-card-open--cover"
        onClick={onRead}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRead(); } }}
      >
        <span className="lib-card-cover-wrap">
          <CoverImage manuscriptId={ms.id} title={title} />
          {versionCount > 0 && (
            <span className="lib-card-version" title={`${versionCount} saved version${versionCount !== 1 ? 's' : ''}`}>v{versionCount}</span>
          )}
        </span>
      </button>

      <div className="lib-card-title-row">
        <button type="button" className="lib-card-title" onClick={onRead}>{title}</button>
        <div className="lib-card-menu-wrap" ref={menuRef} onClick={e => e.stopPropagation()}>
          <button
            type="button"
            className="lib-card-menu-btn lib-card-menu-btn--vertical"
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
                className="lib-row-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenRecord();
                }}
              >
                Details
              </button>
              <button
                type="button"
                role="menuitem"
                className="lib-row-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
              >
                Edit
              </button>
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
      </div>

      <button
        type="button"
        className="lib-card-open lib-card-open--tail"
        onClick={onRead}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRead(); } }}
      >
        <span className="lib-card-genre">{genre || ' '}</span>
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

      {editOpen && (
        <LibraryCardEditModal
          key={ms.id}
          manuscriptId={ms.id}
          title={title}
          genre={genre ?? ''}
          onClose={() => setEditOpen(false)}
          onSave={({ title: nextTitle, genre: nextGenre }) => {
            onUpdate({
              title: nextTitle,
              publishing: { ...publishing, genre: nextGenre || undefined },
            });
          }}
        />
      )}
    </article>
  );
}
