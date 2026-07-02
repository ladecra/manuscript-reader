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

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

// A card's at-a-glance magnitude. The chapter is already in the section header, so
// the card leads with how big the change is instead of repeating the chapter name.
function describeMagnitude(e: ChangeEntry): string {
  if (e.kind === 'added') { const n = wordCount(e.current); return `+${n} word${n === 1 ? '' : 's'}`; }
  if (e.kind === 'deleted') { const n = wordCount(e.previous); return `${n} word${n === 1 ? '' : 's'}`; }
  const d = e.netWordDelta;
  if (d > 0) return `+${d} word${d === 1 ? '' : 's'}`;
  if (d < 0) return `−${Math.abs(d)} word${Math.abs(d) === 1 ? '' : 's'}`;
  return 'reworded';
}

// Section heading: "Chapter N · Title" for real chapters, the bare title for front
// matter, and just "Chapter N" when the title is only the ordinal (avoid doubling).
function chapterHeading(index: number, title: string): string {
  const t = title?.trim();
  if (index > 0) {
    if (t && !/^chapter\s+\d+$/i.test(t)) return `Chapter ${index} · ${t}`;
    return `Chapter ${index}`;
  }
  return t || 'Front matter';
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

function ChangeCard({ e, selected, located, expanded, onJumpTo, toggleOne, label }: {
  e: ChangeEntry;
  selected: boolean;
  located: boolean;
  expanded: boolean;
  onJumpTo: (id: string) => void;
  toggleOne: (id: string) => void;
  label: string;
}) {
  const failed = e.kind !== 'deleted' && !located;
  // The header is a pure expand/collapse toggle: first click on a collapsed card
  // reveals the passage in place, so the author reads before being scrolled away.
  // Jumping to the prose moves to a dedicated control — the "›" button — which is
  // only offered for located changes (an orphan has no passage to jump to, so its
  // trailing control stays the ▾/▸ expand indicator).
  return (
    <div
      className={`changes-margin-card kind-${e.kind}${selected ? ' emph' : ''}${expanded ? ' expanded' : ''}${failed ? ' orphan' : ''}`}>
      <div className="changes-margin-cardhead">
        <button type="button" className="changes-margin-cardhead-main"
          onClick={() => toggleOne(e.id)}
          aria-expanded={expanded}
          title={expanded ? 'Hide change' : 'Show change'}>
          <span className="changes-margin-tag">
            <span className={`changes-margin-kind kind-${e.kind}`}>{e.kind}</span>
            {label && <>{' · '}{label}</>}
            <span className="changes-margin-when"> · {formatWhen(e.lastAt)}</span>
            {e.editCount > 1 && <span className="changes-margin-count">×{e.editCount}</span>}
          </span>
        </button>
        {located ? (
          <button type="button" className="changes-margin-jump"
            onClick={() => onJumpTo(e.id)} title="Go to passage" aria-label="Go to passage">
            Review<span className="changes-margin-chevron" aria-hidden="true"> ›</span>
          </button>
        ) : (
          <span className="changes-margin-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        )}
      </div>
      {expanded && (e.previous || e.current) && <MarginPassageBody e={e} />}
    </div>
  );
}

export function ChangesMarginColumn({ entries, chapters, open, selectedId, onJumpTo }: ChangesMarginColumnProps) {
  const [markInfo, setMarkInfo] = useState<Record<string, MarkInfo>>({});
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [orphansOpen, setOrphansOpen] = useState(false);
  // Whether the change-marking pass has had time to land. Until it settles, every
  // non-deleted entry looks orphaned (markInfo is empty), so partitioning early
  // would dump the whole list into the collapsed tab and pop it back out a frame
  // later. Gate the partition on this so located entries never flash into hiding.
  const [settled, setSettled] = useState(false);

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
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(compute); };
    raf = requestAnimationFrame(compute);
    const ro = new ResizeObserver(schedule);
    ro.observe(content);
    // Change-marks are applied by a chunked, rAF-deferred pass and wrapping inline
    // text in a <mark> doesn't resize #content — so watch the subtree for mark
    // add/remove too, or markInfo never learns where a change actually landed.
    const mo = new MutationObserver(schedule);
    mo.observe(content, { childList: true, subtree: true });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); };
  }, [open, entries]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot: expand the newly selected card
    if (selectedId) setExpandedIds(prev => prev.has(selectedId) ? prev : new Set(prev).add(selectedId));
  }, [selectedId]);

  // Give the chunked mark pass a beat to land before we trust markInfo to tell
  // located from orphaned. Reset whenever the mode reopens or the entries change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gate the orphan partition until marks land
    setSettled(false);
    if (!open) return;
    const t = setTimeout(() => setSettled(true), 200);
    return () => clearTimeout(t);
  }, [open, entries]);

  const titleByIndex = useMemo(() => new Map(chapters.map(c => [c.index, c.title] as const)), [chapters]);

  const sorted = useMemo(() => [...entries].sort((a, b) => {
    const ra = markInfo[a.id]?.rank, rb = markInfo[b.id]?.rank;
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return byFallback(a, b);
  }), [entries, markInfo]);

  // An entry is orphaned when it should sit on a passage but no change-mark could
  // be located for it (deletions never carry a mark, so they're never orphaned).
  // These are stale rows — often front-matter revisions the current text no longer
  // matches — and because they resolve to chapterIndex 0 they'd otherwise sort to
  // the very top and bury the recent, located changes. Pull them out into their own
  // collapsed section at the bottom. Hold off until the mark pass has settled.
  const isOrphan = (e: ChangeEntry) => e.kind !== 'deleted' && markInfo[e.id] == null;
  const orphaned = useMemo(
    () => (settled ? sorted.filter(isOrphan) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isOrphan reads markInfo, already a dep via sorted's memo
    [sorted, settled, markInfo],
  );
  const locatable = useMemo(
    () => (settled ? sorted.filter(e => !isOrphan(e)) : sorted),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, settled, markInfo],
  );

  // Group by the LIVE chapter the mark actually sits in, not the entry's stored
  // chapterIndex. Legacy/mis-attributed rows carry chapterIndex 0, which resolves
  // to "Front matter" and drags a batch of real-chapter edits to the top under the
  // wrong heading — even while each card correctly shows its live chapter. Rewrite
  // the chapter fields from markInfo before rolling up so a located entry groups
  // under the chapter it's really in. (Purely a UI concern — the engine rollup
  // stays chapter-field driven and unaware of the DOM.)
  const rollupInput = useMemo(() => locatable.map(e => {
    const live = markInfo[e.id]?.chapter;
    if (live != null && live > 0) {
      const ch = chapters.find(c => c.index === live);
      if (ch) return { ...e, chapterId: ch.id, chapterIndex: ch.index, chapterTitle: ch.title };
    }
    return e;
  }), [locatable, markInfo, chapters]);

  const rollups = useMemo(() => rollupChangesByChapter(rollupInput, chapters, titleByIndex), [rollupInput, chapters, titleByIndex]);
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
              <span className="changes-margin-chapter-title">{chapterHeading(group.chapterIndex, group.chapterTitle)}</span>
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
                label={describeMagnitude(e)}
              />
            ))}
          </section>
        ))
      ) : (
        locatable.map(e => (
          <ChangeCard
            key={e.id}
            e={e}
            selected={selectedId === e.id}
            located={markInfo[e.id] != null}
            expanded={isExpanded(e.id)}
            onJumpTo={onJumpTo}
            toggleOne={toggleOne}
            label={chapterLabel(e)}
          />
        ))
      )}

      {orphaned.length > 0 && (
        <section className={`changes-margin-orphans${orphansOpen ? ' open' : ''}`}>
          <button type="button" className="changes-margin-orphans-head"
            onClick={() => setOrphansOpen(v => !v)}
            aria-expanded={orphansOpen}>
            <span className="changes-margin-orphans-title">
              Unlinked changes
              <span className="changes-margin-orphans-count">{orphaned.length}</span>
            </span>
            <span className="changes-margin-chevron" aria-hidden="true">{orphansOpen ? '▾' : '▸'}</span>
          </button>
          {!orphansOpen && (
            <div className="changes-margin-orphans-hint">Revisions that no longer match the current text.</div>
          )}
          {orphansOpen && orphaned.map(e => (
            <ChangeCard
              key={e.id}
              e={e}
              selected={selectedId === e.id}
              located={false}
              expanded={isExpanded(e.id)}
              onJumpTo={onJumpTo}
              toggleOne={toggleOne}
              label={chapterLabel(e)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
