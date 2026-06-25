// ─── Rendered-text anchors for Changes mode (Phase 8) ─────────────────────────
// Edits are recorded in source markdown; the reader displays rendered prose.
// Re-scanning the DOM for every change on each mode switch is too slow. At commit
// time (or when building the change list with chapter text), we capture a durable
// TextAnchor in the RENDERED domain — the same model annotations use — so marks
// re-apply with one locate + wrap per passage.

import { buildAnchor, locateAnchor, anchorFromQuote } from '../annotations/anchor';
import type { TextAnchor } from '../types';
import { editRenderedNeedle } from './editRenderedText';
import { narrowRenderedPair } from './renderedChangeRegion';

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Plain rendered quote to mark in the chapter (narrowed for revisions, full for add/delete). */
export function renderedMarkQuote(originalMd: string, replacementMd: string): string {
  const previousFull = editRenderedNeedle(originalMd);
  const currentFull = editRenderedNeedle(replacementMd);
  if (currentFull === '') return '';
  if (previousFull === '' || previousFull === currentFull) return currentFull;
  return narrowRenderedPair(previousFull, currentFull).current;
}

/** Build a rendered-text anchor for the post-edit passage within `chapterRenderedText`. */
export function buildRenderedMarkAnchor(
  chapterRenderedText: string,
  originalMd: string,
  replacementMd: string,
  chapterId: string,
): TextAnchor | null {
  const quote = renderedMarkQuote(originalMd, replacementMd);
  if (quote.length < 4) return null;
  const loc = locateAnchor(chapterRenderedText, { ...anchorFromQuote(quote), chapterId });
  if (!loc || loc.end <= loc.start) return null;
  return { ...buildAnchor(chapterRenderedText, loc.start, quote), chapterId };
}

/** Net word delta between rendered before/after snapshots of a coalesced chain. */
export function renderedWordDelta(originalMd: string, replacementMd: string): number {
  return wordCount(editRenderedNeedle(replacementMd)) - wordCount(editRenderedNeedle(originalMd));
}
