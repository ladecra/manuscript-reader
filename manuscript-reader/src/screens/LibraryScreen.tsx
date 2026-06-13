import { useState } from 'react';
import type { Manuscript } from '../engine/types';
import { MANUSCRIPT_STATUSES } from '../engine/types';
import { loadAnnotations, getAnnotationStats } from '../engine/storage';
import { PlusIcon } from '../components/ui/Icons';
import { ChapterTree } from '../components/library/ChapterTree';
import { applyChapterEdits, type ChapterEdit } from '../engine/manuscript/chapterEdit';

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
  onOpen: (ms: Manuscript) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: { title?: string; status?: string }) => void;
  onCycleStatus: (id: string) => void;
  onReplaceMarkdown: (id: string, newMarkdown: string) => void;
  getReadingPosition: (id: string) => number;
}

export function LibraryScreen({ library, onOpen, onNew, onDelete, onUpdate, onCycleStatus, onReplaceMarkdown, getReadingPosition }: LibraryScreenProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const stored = library.map(ms => ({ id: ms.id, title: ms.metadata.title, wordCount: ms.metadata.wordCount, chapterCount: ms.metadata.chapterCount, lastOpened: ms.metadata.lastOpened, status: ms.metadata.status, uncached: ms.metadata.uncached }));
  const stats = getAnnotationStats(stored);
  const inProgress = library.filter(m => m.metadata.status === 'In Progress').length;
  const sorted = [...library].sort((a, b) => (b.metadata.lastOpened ?? 0) - (a.metadata.lastOpened ?? 0));

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
            <div className="lib-stat"><span className="lib-stat-num">{stats.readers.size}</span><span className="lib-stat-label">Readers</span></div>
          </div>

          <div id="ms-list">
            {sorted.map(ms => (
              <ManuscriptRow
                key={ms.id}
                ms={ms}
                expanded={expandedId === ms.id}
                onToggleExpand={() => setExpandedId(p => p === ms.id ? null : ms.id)}
                onOpen={() => onOpen(ms)}
                onDelete={() => onDelete(ms.id)}
                onUpdate={(patch) => onUpdate(ms.id, patch)}
                onCycleStatus={() => onCycleStatus(ms.id)}
                onReplaceMarkdown={(md) => onReplaceMarkdown(ms.id, md)}
                progress={getReadingPosition(ms.id)}
              />
            ))}
          </div>
        </>
      )}
      <div className="library-footer">VELLIBRIS</div>
    </>
  );
}

function ManuscriptRow({ ms, expanded, onToggleExpand, onOpen, onDelete, onUpdate, onCycleStatus, onReplaceMarkdown, progress }: {
  ms: Manuscript; expanded: boolean; onToggleExpand: () => void; onOpen: () => void;
  onDelete: () => void; onUpdate: (patch: { title?: string; status?: string }) => void;
  onCycleStatus: () => void; onReplaceMarkdown: (md: string) => void; progress: number;
}) {
  const { title, wordCount, chapterCount, status, lastOpened, uncached, combinedMarkdown } = ms.metadata;
  const [titleInput, setTitleInput] = useState(title);
  const [selectedStatus, setSelectedStatus] = useState(status ?? 'Draft');
  const [chapterEdits, setChapterEdits] = useState<ChapterEdit[]>([]);
  const pct = Math.round(progress * 100);
  const annList = loadAnnotations(ms.id);
  const annCount = annList.length;
  const readerCount = new Set(annList.map(a => a.readerName).filter(Boolean)).size;

  const handleSave = () => {
    onUpdate({ title: titleInput, status: selectedStatus });
    // Apply chapter reorder/rename/delete if the tree produced a different result.
    if (combinedMarkdown && chapterEdits.length > 0) {
      const newMd = applyChapterEdits(combinedMarkdown, chapterEdits);
      if (newMd && newMd !== combinedMarkdown) {
        onReplaceMarkdown(newMd);
      }
    }
    onToggleExpand();
  };

  return (
    <div className="ms-row">
      <div className="ms-row-top">
        <div className="ms-title" onClick={onOpen}>{title}</div>
        <div className="ms-actions">
          <button className="ms-edit-btn" onClick={onToggleExpand}>{expanded ? 'Close' : 'Edit'}</button>
          <button className="ms-delete-btn" onClick={() => { if (window.confirm(`Remove "${title}"?`)) onDelete(); }}>Remove</button>
        </div>
      </div>
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
        {uncached && <><span className="dot" /><span style={{ color: 'var(--ann-question-solid)', fontSize: '10px', fontFamily: "'Geist', sans-serif", letterSpacing: '0.06em' }}>Reload needed</span></>}
      </div>
      <div className="ms-progress-bar"><div className="ms-progress-fill" style={{ width: `${pct}%` }} /></div>
      {expanded && (
        <div className="ms-edit-form open">
          <div>
            <label className="edit-field-label">Title</label>
            <input className="edit-input" type="text" value={titleInput} onChange={e => setTitleInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
          </div>
          <div>
            <label className="edit-field-label">Status</label>
            <div className="status-options">
              {MANUSCRIPT_STATUSES.map(s => (
                <button key={s} className={`status-opt${selectedStatus === s ? ' selected' : ''}`} onClick={() => setSelectedStatus(s)}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="edit-field-label">Chapters · drag to reorder, rename, or remove</label>
            <ChapterTree combinedMarkdown={combinedMarkdown} onChange={setChapterEdits} />
          </div>
          <button className="edit-save-btn" onClick={handleSave}>Save changes</button>
        </div>
      )}
      <div className="ms-divider" />
    </div>
  );
}
