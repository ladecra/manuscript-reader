import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ChangeEntry, Chapter } from '../../engine/types';
import { rollupChangesByChapter, formatChapterRollupLine } from '../../engine/manuscript/chapterChangeRollup';
import { changeChapterDisplayTitle } from '../../engine/manuscript/resolveChangeChapter';
import { emphasisInPrevious } from '../../engine/manuscript/marginChangeEmphasis';

interface ChangesMarginColumnProps {
  entries: ChangeEntry[];
  chapters: Chapter[];
  open: boolean;
  selectedId: string | null;
  onJumpTo: (id: string) => void;
}

interface MarkInfo { rank: number; chapter: number | null; }

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

function MarginPassageBody({ e }: { e: ChangeEntry }) {
  const raw = e.kind === 'added' ? e.current : e.previous;
  const capped = raw.length > 220 ? raw.slice(0, 220) + '…' : raw;
  const bodyLabel = e.kind === 'deleted' ? 'Removed' : e.kind === 'added' ? 'Added' : 'Previously';
  return (
    <div className="changes-margin-prev">
      <span className="changes-margin-prev-label">{bodyLabel}</span>
      &ldquo;
      {e.kind === 'revised' ? (
        <>
          {e.startEllipsis && <span>…</span>}
          {emphasisInPrevious(e.previous, e.current).map((s, i) => (
            s.emphasis ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>
          ))}
          {e.endEllipsis && <span>…</span>}
        </>
      ) : e.kind === 'added' ? (
        <strong>{`${e.startEllipsis ? '…' : ''}${capped}${e.endEllipsis && raw.length <= 220 ? '…' : ''}`}</strong>
      ) : (
        <span>{`${e.startEllipsis ? '…' : ''}${capped}${e.endEllipsis && raw.length <= 220 ? '…' : ''}`}</span>
      )}
      &rdquo;
    </div>
  );
}

function ChangeCard({ e, selected, located, expanded, onJumpTo, toggleOne, chapterLabel }: {
  e: ChangeEntry;
  selected: boolean;
  located: boolean;
  expanded: boolean;
  onJumpTo: (id: string) => void;
  toggleOne: (id: string) => void;
  chapterLabel: string;
}) {
  const failed = e.kind !== 'deleted' && !located;
  return (
    <div
      className={`changes-margin-card kind-${e.kind}${selected ? ' emph' : ''}${expanded ? ' expanded' : ''}${failed ? ' orphan' : ''}`}>
      <button type="button" className="changes-margin-cardhead"
        onClick={() => { onJumpTo(e.id); toggleOne(e.id); }}>
        <span className="changes-margin-tag">
          <span className={`changes-margin-kind kind-${e.kind}`}>{e.kind}</span>
          {chapterLabel}
          <span className="changes-margin-when"> · {formatWhen(e.lastAt)}</span>
          {e.editCount > 1 && <span className="changes-margin-count">×{e.editCount}</span>}
        </span>
        <span className="changes-margin-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (e.previous || e.current) && <MarginPassageBody e={e} />}
    </div>
  );
}

export function ChangesMarginColumn({ entries, chapters, open, selectedId, onJumpTo }: ChangesMarginColumnProps) {
  const [markInfo, setMarkInfo] = useState<Record<string, MarkInfo>>({});
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    if (!open) return;
    const content = document.getElementById('content');
    if (!content) return;
    let raf = 0;
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
    raf = requestAnimationFrame(compute);
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    });
    ro.observe(content);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [open, entries]);

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

  const rollups = useMemo(() => rollupChangesByChapter(sorted, chapters, titleByIndex), [sorted, chapters, titleByIndex]);
  const showChapterSections = rollups.length > 1 || (rollups[0]?.entries.length ?? 0) > 2;

  const isExpanded = (id: string) => allExpanded || expandedIds.has(id);
  const toggleOne = (id: string) =>
    setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function chapterLabel(e: ChangeEntry): string {
    const live = markInfo[e.id]?.chapter;
    if (live != null && live > 0) return titleByIndex.get(live) || `Chapter ${live}`;
    return changeChapterDisplayTitle(e, chapters, titleByIndex);
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
      ) : showChapterSections ? (
        rollups.map(group => (
          <section key={group.chapterId || `idx-${group.chapterIndex}` || group.chapterTitle} className="changes-margin-chapter">
            <div className="changes-margin-chapter-head">
              <span className="changes-margin-chapter-title">{group.chapterTitle}</span>
              <span className="changes-margin-chapter-summary">{formatChapterRollupLine(group)}</span>
            </div>
            {group.entries.map(e => (
              <ChangeCard
                key={e.id}
                e={e}
                selected={selectedId === e.id}
                located={markInfo[e.id] != null}
                expanded={isExpanded(e.id)}
                onJumpTo={onJumpTo}
                toggleOne={toggleOne}
                chapterLabel={chapterLabel(e)}
              />
            ))}
          </section>
        ))
      ) : (
        sorted.map(e => (
          <ChangeCard
            key={e.id}
            e={e}
            selected={selectedId === e.id}
            located={markInfo[e.id] != null}
            expanded={isExpanded(e.id)}
            onJumpTo={onJumpTo}
            toggleOne={toggleOne}
            chapterLabel={chapterLabel(e)}
          />
        ))
      )}
    </div>
  );
}
