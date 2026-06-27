// ── Chapter length vs this manuscript's mean — shared thresholds ─────────────
// Insight / at-a-glance flags use strict cuts (rankInsights, chapter maps).
// The intelligence report prose *table* uses looser marks (proseReportSection).

/** ≥ this × mean → likely merged chapters (insight + chapter atlas). */
export const PROSE_INSIGHT_CHAPTER_LONG = 2.1;
/** ≤ this × mean → likely false break (insight + chapter atlas). */
export const PROSE_INSIGHT_CHAPTER_SHORT = 0.25;

export type ChapterLengthInsightFlag = 'short' | 'long';

export function chapterLengthRatio(words: number, meanChapterWords: number): number {
  return meanChapterWords > 0 ? words / meanChapterWords : 1;
}

export function meanChapterWordCount(wordCounts: Iterable<number>): number {
  const vals = [...wordCounts].filter(w => w > 0);
  if (!vals.length) return 0;
  return vals.reduce((s, w) => s + w, 0) / vals.length;
}

export function chapterLengthInsightFlag(ratio: number): ChapterLengthInsightFlag | null {
  if (ratio <= PROSE_INSIGHT_CHAPTER_SHORT) return 'short';
  if (ratio >= PROSE_INSIGHT_CHAPTER_LONG) return 'long';
  return null;
}

export function formatChapterLengthRatio(ratio: number): string {
  return `${ratio.toFixed(1)}×`;
}

/** Split a list into two columns (first column fills first). */
export function splitTwoColumns<T>(items: T[]): [T[], T[]] {
  if (items.length <= 1) return [items, []];
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}
