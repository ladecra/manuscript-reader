import { useState } from 'react';
import type { Manuscript } from '../engine/types';
import { loadAnnotations, getAnnotationStats } from '../engine/storage';
import { PlusIcon, StarIcon } from '../components/ui/Icons';

function timeAgo(ts: number | undefined): string {
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

function statusClass(status: string): string {
  return 'status--' + status.toLowerCase().replace(/[^a-z]+/g, '-');
}

interface LibraryScreenProps {
  library: Manuscript[];
  onOpen: (ms: Manuscript) => void;     // open the manuscript's page (its home)
  onRead: (ms: Manuscript) => void;     // enter the reader directly from the card
  onNew: () => void;
  onDelete: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  getReadingPosition: (id: string) => number;
}

export function LibraryScreen({ library, onOpen, onRead, onNew, onDelete, onCycleStatus, onToggleFavorite, getReadingPosition }: LibraryScreenProps) {
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const stored = library.map(ms => ({ id: ms.id, title: ms.metadata.title, wordCount: ms.metadata.wordCount, chapterCount: ms.metadata.chapterCount, lastOpened: ms.metadata.lastOpened, status: ms.metadata.status, uncached: ms.metadata.uncached }));
  const stats = getAnnotationStats(stored);
  const inProgress = library.filter(m => m.metadata.status === 'In Progress').length;
  const favCount = library.filter(m => m.metadata.favorite).length;
  const sorted = [...library]
    .filter(m => filter === 'all' || m.metadata.favorite)
    .sort((a, b) => (b.metadata.lastOpened ?? 0) - (a.metadata.lastOpened ?? 0));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '36px' }}>
        <div>
          <h1 className="library-title">Manuscripts</h1>
          <p className="library-sub">Your reading room.</p>
        </div>
        <button className="outline-btn" onClick={onNew} style={{ marginTop: '8px' }}>
          <PlusIcon size={12} /> New
        </button>
      </div>

      {library.length === 0 ? (
        <div className="library-empty" id="library-empty">
          <p>No manuscripts yet.<br />Load a DOCX or paste text to begin.</p>
          <button className="outline-btn" onClick={onNew} style={{ margin: '0 auto' }}>
            <PlusIcon size={12} /> Load manuscript
          </button>
        </div>
      ) : (
        <>
          <div className="library-stats">
            <div className="lib-stat"><span className="lib-stat-num">{library.length}</span><span className="lib-stat-label">Manuscripts</span></div>
            <div className="lib-stat"><span className="lib-stat-num">{inProgress}</span><span className="lib-stat-label">In Progress</span></div>
            <div className="lib-stat"><span className="lib-stat-num">{stats.total.toLocaleString()}</span><span className="lib-stat-label">Annotations</span></div>
          </div>

          {favCount > 0 && (
            <div className="library-filters">
              <button className={`lib-filter${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
              <button className={`lib-filter${filter === 'favorites' ? ' active' : ''}`} onClick={() => setFilter('favorites')}>
                Favorites <span className="lib-filter-count">{favCount}</span>
              </button>
            </div>
          )}

          {sorted.length === 0 ? (
            <div className="library-empty"><p>No favorites yet.<br />Star a manuscript to keep it close.</p></div>
          ) : (
            <div id="ms-list">
              {sorted.map(ms => (
                <ManuscriptRow
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
          )}
        </>
      )}
    </>
  );
}

function ManuscriptRow({ ms, onOpen, onRead, onDelete, onCycleStatus, onToggleFavorite, progress }: {
  ms: Manuscript; onOpen: () => void; onRead: () => void; onDelete: () => void; onCycleStatus: () => void; onToggleFavorite: () => void; progress: number;
}) {
  const { title, author, wordCount, chapterCount, status, lastOpened, uncached, favorite } = ms.metadata;
  const pct = Math.round(progress * 100);
  const canRead = !!ms.metadata.combinedMarkdown;
  const annList = loadAnnotations(ms.id);
  const annCount = annList.length;
  const readerCount = new Set(annList.map(a => a.readerId ?? a.readerName).filter(Boolean)).size;

  // The whole card is the affordance — clicking opens the manuscript's page
  // (its title page / workbench), from which the author presses Read.
  return (
    <div className="ms-row ms-row-clickable" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <div className="ms-row-top">
        <div style={{ minWidth: 0 }}>
          <div className="ms-title">{title}</div>
          {author && <div style={{ fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", fontSize: '11px', color: 'var(--dim)', marginTop: '3px', letterSpacing: '0.02em' }}>by {author}</div>}
        </div>
        <div className="ms-actions">
          <button className={`ms-star-btn${favorite ? ' active' : ''}`} aria-pressed={!!favorite}
            title={favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>
            <StarIcon filled={!!favorite} />
          </button>
          <button className="ms-read-btn" disabled={!canRead} onClick={(e) => { e.stopPropagation(); onRead(); }}
            title={canRead ? undefined : 'Re-import this file to read it'}>
            {pct > 1 ? 'Resume' : 'Read'}
          </button>
          <button className="ms-delete-btn" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove "${title}"?`)) onDelete(); }}>Remove</button>
        </div>
      </div>
      {uncached && (
        <div role="alert" style={{
          margin: '4px 0 10px',
          padding: '9px 12px',
          border: '1px solid var(--ann-question-solid)',
          borderLeft: '3px solid var(--ann-question-solid)',
          color: 'var(--ann-question-solid)',
          fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
          fontSize: '11px',
          lineHeight: 1.5,
          letterSpacing: '0.02em',
        }}>
          ⚠ Source text offloaded to free storage space. Reading and chapter editing are paused for this manuscript — re-import the file from <strong>Load</strong> to restore it.
        </div>
      )}
      <div className="ms-meta">
        {wordCount ? <span>{wordCount.toLocaleString()} words</span> : null}
        {wordCount ? <span className="dot" /> : null}
        <span>{chapterCount ?? 0} chapter{chapterCount !== 1 ? 's' : ''}</span>
        <span className="dot" />
        <button className={`ms-status ${statusClass(status ?? 'Draft')}`} onClick={(e) => { e.stopPropagation(); onCycleStatus(); }}>{status ?? 'Draft'}</button>
        <span className="dot" />
        <span>{pct > 0 ? `${pct}% read` : 'Unread'}</span>
        {annCount > 0 && <><span className="dot" /><span>{annCount} annotation{annCount !== 1 ? 's' : ''}</span></>}
        {readerCount > 0 && <><span className="dot" /><span>{readerCount} reader{readerCount !== 1 ? 's' : ''}</span></>}
        <span className="dot" />
        <span>{timeAgo(lastOpened)}</span>
      </div>
      <div className="ms-progress-bar"><div className="ms-progress-fill" style={{ width: `${pct}%` }} /></div>
      <div className="ms-divider" />
    </div>
  );
}
