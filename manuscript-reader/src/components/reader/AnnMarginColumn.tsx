import { useLayoutEffect, useRef, useState } from 'react';
import type { Annotation } from '../../engine/types';
import { ANNOTATION_LABELS, ANNOTATION_COLORS } from '../../engine/types';

interface AnnMarginColumnProps {
  annotations: Annotation[];
  open: boolean;
  /** Browse mode: the column becomes a navigable index of every annotation
   *  (a scrollable list). Default (anchored) mode pins each card beside its text. */
  browse: boolean;
  selectedId: string | null;
  onJumpTo: (id: string) => void;
  onOpenBrowse: () => void;
  onCloseBrowse: () => void;
}

const GAP = 16; // minimum vertical gap between stacked cards when anchoring

// Fallback order when an annotation has no mark in the DOM (orphaned): by the
// stored chapter, then the anchor's offset hint, then creation time. The stored
// chapterIndex/offset go stale when an edit splits or renumbers a chapter, which
// is exactly why the real ordering below prefers live mark position.
function byDocumentOrder(a: Annotation, b: Annotation): number {
  return (a.chapterIndex - b.chapterIndex)
    || ((a.anchor?.offset ?? 0) - (b.anchor?.offset ?? 0))
    || (a.createdAt - b.createdAt);
}

// The live chapter a mark currently sits in, read from the DOM: chapter ids are
// positional (`ch-N`), so a delete/add/reorder renumbers them and the stored
// chapterIndex on an annotation goes stale. Walk mark → chapter-block → the
// preceding `.chapter-marker` span and parse its id. Null for forematter.
function liveChapterOfMark(mark: Element): number | null {
  const block = mark.closest('.chapter-block');
  if (!block) return null;
  const marker = block.previousElementSibling?.previousElementSibling;
  const id = marker?.id ?? '';
  if (!id.startsWith('ch-')) return null;
  const n = parseInt(id.slice(3), 10);
  return Number.isNaN(n) ? null : n;
}

interface MarkInfo { rank: number; chapter: number | null; }

export function AnnMarginColumn({ annotations, open, browse, selectedId, onJumpTo, onOpenBrowse, onCloseBrowse }: AnnMarginColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Live, DOM-derived order + chapter for each mark — robust to stale
  // chapterIndex/offset after edits. Recomputed whenever the marks change;
  // annotations with no mark (orphaned) sort last by byDocumentOrder.
  const [markInfo, setMarkInfo] = useState<Record<string, MarkInfo>>({});

  useLayoutEffect(() => {
    if (!open) return;
    const content = document.getElementById('content');
    if (!content) return;
    const compute = () => {
      const next: Record<string, MarkInfo> = {};
      content.querySelectorAll('mark[data-ann]').forEach((m, i) => {
        const id = (m as HTMLElement).dataset.ann;
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
  }, [open, annotations]);

  const sorted = [...annotations].sort((a, b) => {
    const ra = markInfo[a.id]?.rank, rb = markInfo[b.id]?.rank;
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;          // anchored annotations precede orphaned ones
    if (rb != null) return 1;
    return byDocumentOrder(a, b);
  });

  // Anchored layout: align each card to its <mark> in the prose, ordered by the
  // mark's ACTUAL vertical position (not creation time), cascading down so cards
  // never overlap and always read top-to-bottom in step with the text. Cards live
  // in document space (absolute in a full-height container) so they scroll with
  // the prose — only re-run on reflow (ResizeObserver) / resize, never per-scroll.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;

    if (browse) {
      cardRefs.current.forEach(c => { c.style.top = ''; });
      container.style.height = '';
      return;
    }

    const content = document.getElementById('content');
    if (!content) return;

    const layout = () => {
      const cTop = container.getBoundingClientRect().top;
      // Measure each card's mark, then order by document (vertical) position.
      const items = annotations
        .map(ann => {
          const card = cardRefs.current.get(ann.id);
          const mark = content.querySelector(`mark[data-ann="${CSS.escape(ann.id)}"]`) as HTMLElement | null;
          const markTop = mark ? mark.getBoundingClientRect().top - cTop : Number.POSITIVE_INFINITY;
          return { card, markTop };
        })
        .filter((x): x is { card: HTMLDivElement; markTop: number } => !!x.card)
        .sort((a, b) => a.markTop - b.markTop);

      let prevBottom = 0;
      for (const { card, markTop } of items) {
        const target = Number.isFinite(markTop) ? markTop : prevBottom + GAP;
        const top = Math.max(target, prevBottom ? prevBottom + GAP : 0);
        card.style.top = `${Math.round(top)}px`;
        prevBottom = top + card.offsetHeight;
      }
      // Match the prose height so the sticky header stays pinned the whole scroll.
      container.style.height = `${content.offsetHeight}px`;
    };

    layout();
    const ro = new ResizeObserver(() => layout());
    ro.observe(content);
    window.addEventListener('resize', layout);
    return () => { ro.disconnect(); window.removeEventListener('resize', layout); };
  }, [open, browse, annotations]);

  const cls = `${open ? 'open' : ''}${browse ? ' browse' : ''}`.trim();

  return (
    <div id="ann-margin" ref={containerRef} className={cls} aria-label="Annotations">
      <div className="ann-margin-head">
        {browse ? (
          <>
            <span className="ann-margin-head-label">All annotations</span>
            <button className="ann-margin-index-btn" onClick={onCloseBrowse} title="Back to margin">
              Margin ›
            </button>
          </>
        ) : (
          <>
            <span className="ann-margin-head-label">Margin</span>
            {sorted.length > 0 && (
              <button className="ann-margin-index-btn" onClick={onOpenBrowse} title="Browse all annotations">
                All {sorted.length} ›
              </button>
            )}
          </>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="ann-margin-empty">Select any passage to annotate.</div>
      ) : (
        sorted.map(ann => {
          const isSel = selectedId === ann.id;
          const faded = selectedId != null && !isSel;
          // Prefer the mark's live chapter (renumbers with edits); fall back to
          // the stored index only when the annotation is orphaned (no mark).
          const liveChapter = markInfo[ann.id]?.chapter;
          const chapterNum = liveChapter ?? (ann.chapterTitle ? ann.chapterIndex : null);
          return (
            <div
              key={ann.id}
              ref={el => { if (el) cardRefs.current.set(ann.id, el); else cardRefs.current.delete(ann.id); }}
              className={`ann-margin-card${isSel ? ' emph' : ''}${faded ? ' faded' : ''}`}
              onClick={() => onJumpTo(ann.id)}
              style={{ borderLeftColor: isSel ? 'var(--gold)' : ANNOTATION_COLORS[ann.type] + '88' }}
            >
              <div className="ann-margin-tag">
                {ANNOTATION_LABELS[ann.type]}
                {chapterNum != null && (
                  <span className="ann-margin-chapter"> · Ch.&nbsp;{String(chapterNum).padStart(2, '0')}</span>
                )}
              </div>
              {ann.quote && (
                <div className="ann-margin-quote">
                  &ldquo;{ann.quote.length > 100 ? ann.quote.slice(0, 100) + '…' : ann.quote}&rdquo;
                </div>
              )}
              {ann.note && <div className="ann-margin-note">{ann.note}</div>}
              {ann.readerName && <div className="ann-margin-reader">— {ann.readerName}</div>}
            </div>
          );
        })
      )}
    </div>
  );
}
