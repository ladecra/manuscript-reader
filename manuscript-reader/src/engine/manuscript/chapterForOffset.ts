// ─── Manuscript: chapter attribution ─────────────────────────────────────────
// Pure decision logic for "which chapter does this vertical position belong to."
// The component measures the DOM (document offsetTop, viewport-relative rect,
// etc.) and chooses the cutoff; this function just applies the rule, so it can
// be unit-tested without a browser.

import type { Chapter } from '../types';

/** A chapter paired with its measured vertical position, in px. The caller
 *  decides the coordinate space and provides positions in document order. */
export interface ChapterPosition {
  chapter: Chapter;
  offset: number;
}

/**
 * Returns the last chapter whose measured offset is at or before `cutoff` — i.e.
 * the chapter the cutoff line currently falls within — or null if none qualify.
 * Chapters with an unknown position should be passed with `offset: Infinity`.
 */
export function chapterForOffset(positions: ChapterPosition[], cutoff: number): Chapter | null {
  let found: Chapter | null = null;
  for (const { chapter, offset } of positions) {
    if (offset <= cutoff) found = chapter;
  }
  return found;
}
