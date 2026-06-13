import { useState, useRef, useEffect } from 'react';
import { parseMarkdown } from '../../engine/ingestion/parseMarkdown';
import type { ChapterEdit } from '../../engine/manuscript/chapterEdit';

interface ChapterTreeRow {
  index: number;
  title: string;
  deleted: boolean;
}

interface ChapterTreeProps {
  combinedMarkdown: string | undefined;
  /** Called whenever the working edit set changes (order, titles, deletions). */
  onChange: (edits: ChapterEdit[]) => void;
}

export function ChapterTree({ combinedMarkdown, onChange }: ChapterTreeProps) {
  const [rows, setRows] = useState<ChapterTreeRow[]>([]);
  const dragIndex = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dropSide, setDropSide] = useState<'above' | 'below'>('above');

  useEffect(() => {
    if (!combinedMarkdown) { setRows([]); return; }
    const { chapters } = parseMarkdown(combinedMarkdown);
    setRows(chapters.map(c => ({ index: c.index, title: c.title, deleted: false })));
  }, [combinedMarkdown]);

  // Propagate edits upward whenever rows change.
  useEffect(() => {
    onChange(rows.map(r => ({ index: r.index, newTitle: r.title, deleted: r.deleted })));
  }, [rows]);

  if (!combinedMarkdown) {
    return (
      <div style={{ fontFamily: "'Geist', sans-serif", fontSize: '11px', color: 'var(--border)', padding: '8px 0' }}>
        Reload manuscript to manage chapters.
      </div>
    );
  }

  const handleDrop = (targetPos: number) => {
    const src = dragIndex.current;
    if (src === null || src === targetPos) { setDragOverIdx(null); return; }
    setRows(prev => {
      const next = [...prev];
      const [moved] = next.splice(src, 1);
      let insertAt = targetPos;
      if (src < targetPos) insertAt = dropSide === 'above' ? targetPos - 1 : targetPos;
      else insertAt = dropSide === 'above' ? targetPos : targetPos + 1;
      insertAt = Math.max(0, Math.min(next.length, insertAt));
      next.splice(insertAt, 0, moved);
      return next;
    });
    dragIndex.current = null;
    setDragOverIdx(null);
  };

  return (
    <div className="ch-tree">
      {rows.map((row, pos) => (
        <div
          key={row.index}
          className={`ch-tree-row${dragIndex.current === pos ? ' dragging' : ''}` +
            (dragOverIdx === pos ? (dropSide === 'above' ? ' drag-over-above' : ' drag-over-below') : '')}
          draggable
          onDragStart={(e) => { dragIndex.current = pos; e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => { dragIndex.current = null; setDragOverIdx(null); }}
          onDragOver={(e) => {
            e.preventDefault();
            if (dragIndex.current === null || dragIndex.current === pos) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            setDropSide(e.clientY < mid ? 'above' : 'below');
            setDragOverIdx(pos);
          }}
          onDragLeave={() => { if (dragOverIdx === pos) setDragOverIdx(null); }}
          onDrop={(e) => { e.preventDefault(); handleDrop(pos); }}
          style={row.deleted ? { opacity: 0.4 } : undefined}
        >
          <span className="ch-tree-drag" title="Drag to reorder">
            <svg viewBox="0 0 10 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square">
              <line x1="2" y1="3" x2="8" y2="3" />
              <line x1="2" y1="7" x2="8" y2="7" />
              <line x1="2" y1="11" x2="8" y2="11" />
            </svg>
          </span>
          <span className="ch-tree-num">{String(pos + 1).padStart(2, '0')}</span>
          <input
            className="ch-tree-title"
            type="text"
            value={row.title}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setRows(prev => prev.map((r, i) => i === pos ? { ...r, title: e.target.value } : r))}
          />
          <button
            className={`ch-tree-del${row.deleted ? ' marked-delete' : ''}`}
            title={row.deleted ? 'Undo remove' : 'Remove chapter'}
            onClick={() => setRows(prev => prev.map((r, i) => i === pos ? { ...r, deleted: !r.deleted } : r))}
          >
            {row.deleted ? '↩' : '×'}
          </button>
        </div>
      ))}
    </div>
  );
}
