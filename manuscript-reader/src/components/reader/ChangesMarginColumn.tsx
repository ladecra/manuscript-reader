import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ChangeEntry, Chapter } from '../../engine/types';

interface ChangesMarginColumnProps {
  entries: ChangeEntry[];
  chapters: Chapter[];
  open: boolean;
  selectedId: string | null;
  onJumpTo: (id: string) => void;
}

interface MarkInfo { rank: number; chapter: number | null; }

// The live chapter a change-mark sits in, read from the DOM (chapter ids are
// positional, so a stored chapterIndex drifts after structural edits). Mirrors
// AnnMarginColumn.liveChapterOfMark. Null for front matter / unlocated.
function liveChapterOfMark(mark: Element): number | null {
  const block = mark.closest('.chapter-block');
  if (!block) return null;
  const marker = block.previousElementSibling?.previousElementSibling;
  const id = marker?.id ?? '';
  if (!id.startsWith('ch-')) return null;
  const n = parseInt(id.slice(3), 10);
  return Number.isNaN(n) ? null : n;
}

function byFallback(a: ChangeEntry, b: ChangeEntry): number {
  return (a.chapterIndex - b.chapterIndex) || (a.firstAt - b.firstAt);
}
function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ChangesMarginColumn({ entries, chapters, open, selectedId, onJumpTo }: ChangesMarginColumnProps) {
  const [markInfo, setMarkInfo] = useState<Record<string, MarkInfo>>({});
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    if (!open) return;
    const content = document.getElementById('content');
    if (!content) return;
    const compute = () => {
      const next: Record<string, MarkInfo> = {};
      content.querySelectorAll('mark[data-edit]').forEach((m, i) => {
        const id = (m as HTMLElement).dataset.edit;
        if (id && !(id in next)) next[id] = { rank: i, chapter: liveChapterOfMark(m) };
      });
      setMarkInfo(prev => {
        const keys = Object.keys(next);
        if (keys.length === Object.keys(prev).length
          && keys.every(k => prev[k] && prev[k].rank === next[k].rank && prev[k].chapter === next[k].chapter)) return prev;
        return next;
      });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(content);
    return () => ro.disconnect();
  }, [open, entries]);

  // Selecting a passage (via its prose mark) expands its card once — but doesn't
  // pin it open, so the header chevron can still collapse it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot: expand the newly selected card
    if (selectedId) setExpandedIds(prev => prev.has(selectedId) ? prev : new Set(prev).add(selectedId));
  }, [selectedId]);

  const titleByIndex = useMemo(() => new Map(chapters.map(c => [c.index, c.title] as const)), [chapters]);

  const sorted = useMemo(() => [...entries].sort((a, b) => {
    const ra = markInfo[a.id]?.rank, rb = markInfo[b.id]?.rank;
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return byFallback(a, b);
  }), [entries, markInfo]);

  const isExpanded = (id: string) => allExpanded || expandedIds.has(id);
  const toggleOne = (id: string) =>
    setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function chapterLabel(e: ChangeEntry): string {
    const live = markInfo[e.id]?.chapter;
    const idx = live ?? e.chapterIndex;
    if (idx == null || idx <= 0) return 'Front matter';
    return titleByIndex.get(idx) || `Chapter ${idx}`;
  }

  return (
    <div id="changes-margin" className={open ? 'open' : ''} aria-label="Changes">
      <div className="changes-margin-head">
        <span className="changes-margin-head-label">Changes</span>
        {sorted.length > 0 && (
          <button type="button" className="changes-margin-toggle"
            onClick={() => { setAllExpanded(v => !v); setExpandedIds(new Set()); }}>
            {allExpanded ? 'Collapse all' : `Expand all ${sorted.length}`}
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="changes-margin-empty">No substantive changes yet. Revisions, additions, and cuts you make in Manuscript mode appear here — formatting and cleanup are left out.</div>
      ) : (
        sorted.map(e => {
          const selected = selectedId === e.id;
          const located = markInfo[e.id] != null;
          const expanded = isExpanded(e.id);
          const failed = e.kind !== 'deleted' && !located; // deletions are expected-unlocated
          const raw = e.kind === 'added' ? e.current : e.previous;
          const capped = raw.length > 220 ? raw.slice(0, 220) + '…' : raw;
          const body = `${e.startEllipsis ? '…' : ''}${capped}${e.endEllipsis && raw.length <= 220 ? '…' : ''}`;
          const bodyLabel = e.kind === 'deleted' ? 'Removed' : e.kind === 'added' ? 'Added' : 'Previously';
          return (
            <div key={e.id}
              className={`changes-margin-card kind-${e.kind}${selected ? ' emph' : ''}${expanded ? ' expanded' : ''}${failed ? ' orphan' : ''}`}>
              <button type="button" className="changes-margin-cardhead"
                onClick={() => { onJumpTo(e.id); toggleOne(e.id); }}>
                <span className="changes-margin-tag">
                  <span className={`changes-margin-kind kind-${e.kind}`}>{e.kind}</span>
                  {chapterLabel(e)}
                  <span className="changes-margin-when"> · {formatWhen(e.lastAt)}</span>
                  {e.editCount > 1 && <span className="changes-margin-count">×{e.editCount}</span>}
                </span>
                <span className="changes-margin-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
              </button>
              {expanded && body && (
                <div className="changes-margin-prev">
                  <span className="changes-margin-prev-label">{bodyLabel}</span>
                  &ldquo;{body}&rdquo;
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
