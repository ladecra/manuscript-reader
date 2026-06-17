// Deterministic manuscript-page estimates for hub copy (reflowable reader has no fixed pages).
export const MANUSCRIPT_WORDS_PER_PAGE = 250;

export function estimateManuscriptPageCount(wordCount: number): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 1;
  return Math.max(1, Math.ceil(wordCount / MANUSCRIPT_WORDS_PER_PAGE));
}

/** Map a 0–1 reading fraction to an estimated page index (1-based), capped at total. */
export function estimateReadingPagePosition(
  wordCount: number,
  progressFraction: number,
): { current: number; total: number } {
  const total = estimateManuscriptPageCount(wordCount);
  const frac = Math.min(1, Math.max(0, progressFraction));
  const current = frac <= 0 ? 1 : Math.min(total, Math.max(1, Math.round(frac * total)));
  return { current, total };
}
