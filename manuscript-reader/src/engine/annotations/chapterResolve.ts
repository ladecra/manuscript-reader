// ─── Annotation chapter reconciliation ────────────────────────────────────────
// Chapter ids/indices are POSITIONAL (`ch-N`, parser increments per `# `), so any
// structural edit — delete, add, reorder, or promoting body text to a heading —
// renumbers them. The chapterIndex/chapterTitle stored on an annotation are a
// denormalized snapshot of position at creation time; they go stale the moment
// the manuscript is restructured, mislabelling and misgrouping the annotation in
// the margin, reports, and exports.
//
// The durable identity is the anchor (quote + context), not the stored index.
// This pure pass re-derives each annotation's CURRENT chapter from its anchor
// against the live text and returns in-memory copies with the cache refreshed.
// It is deliberately non-destructive: it never mutates or persists the original
// annotation, so a bad (fuzzy) match is reinterpreted — never baked in — and
// every consumer downstream (Feedback, EditorialSignals, report, exports) can
// keep reading chapterIndex/chapterTitle as before, now freshly correct.
//
// Browser-independent by construction (operates on markdown + plain text), so it
// satisfies the engine-purity test: it runs without a DOM.

import type { Annotation } from '../types';
import { getParsedManuscript } from '../ingestion/parseCache';
import { locateAnchor, anchorFromQuote, type AnchorConfidence } from './anchor';

const CONFIDENCE_RANK: Record<AnchorConfidence, number> = { exact: 3, context: 2, fuzzy: 1 };

/** Plain text per chapter index (1-based; 0 = forematter, excluded), assembled
 *  from the parser's structural blocks — the same text the anchor resolves against. */
function chapterTexts(combinedMarkdown: string): { texts: Map<number, string>; titles: Map<number, string> } {
  const { blocks, chapters } = getParsedManuscript(combinedMarkdown);
  const texts = new Map<number, string>();
  for (const b of blocks) {
    if (b.chapterIndex <= 0) continue; // skip forematter
    const prev = texts.get(b.chapterIndex);
    texts.set(b.chapterIndex, prev ? `${prev}\n${b.text}` : b.text);
  }
  const titles = new Map<number, string>();
  for (const c of chapters) titles.set(c.index, c.title);
  return { texts, titles };
}

/**
 * Return copies of `annotations` with chapterIndex / chapterTitle (and the
 * anchor's chapterId) re-derived from the current `combinedMarkdown`. Annotations
 * that can't be located (orphaned) keep their stored values untouched. When
 * nothing changed, the original array is returned by reference (cheap memo).
 */
export function resolveAnnotationChapters(annotations: Annotation[], combinedMarkdown: string | undefined): Annotation[] {
  if (!combinedMarkdown || annotations.length === 0) return annotations;
  const { texts, titles } = chapterTexts(combinedMarkdown);

  let changed = false;
  const out = annotations.map(ann => {
    const anchor = ann.anchor ?? anchorFromQuote(ann.quote);
    if (!anchor.quote) return ann;

    // Find the chapter whose text best resolves this anchor (highest confidence,
    // earliest chapter on a tie). Mirrors the reader's own locateAnchor semantics.
    let bestIdx = -1;
    let bestRank = 0;
    for (const [idx, text] of texts) {
      const loc = locateAnchor(text, anchor);
      if (!loc) continue;
      const rank = CONFIDENCE_RANK[loc.confidence];
      if (rank > bestRank || (rank === bestRank && bestIdx !== -1 && idx < bestIdx)) {
        bestRank = rank; bestIdx = idx;
      }
    }
    if (bestIdx === -1) return ann; // orphaned — leave the stored snapshot alone

    const title = titles.get(bestIdx) ?? ann.chapterTitle;
    const chapterId = `ch-${bestIdx}`;
    if (ann.chapterIndex === bestIdx && ann.chapterTitle === title
      && (!ann.anchor || ann.anchor.chapterId === chapterId)) return ann;

    changed = true;
    return {
      ...ann,
      chapterIndex: bestIdx,
      chapterTitle: title,
      anchor: ann.anchor ? { ...ann.anchor, chapterId } : ann.anchor,
    };
  });

  return changed ? out : annotations;
}
