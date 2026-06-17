// Deterministic manuscript-page estimates for hub copy (reflowable reader has no fixed pages).
import { buildManuscriptStructure } from '../ingestion/manuscriptStructure';
import { countWords } from '../ingestion/parseMarkdown';

export const MANUSCRIPT_WORDS_PER_PAGE = 250;

export function estimateManuscriptPageCount(wordCount: number): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 1;
  return Math.max(1, Math.ceil(wordCount / MANUSCRIPT_WORDS_PER_PAGE));
}

/** Per-chapter word counts derived from the structural model. Returns an empty map on parse failure. */
export function chapterWordCounts(combinedMarkdown: string): Map<number, number> {
  const map = new Map<number, number>();
  try {
    for (const sec of buildManuscriptStructure(combinedMarkdown).chapters) {
      map.set(sec.index, countWords(sec.blocks.map(b => b.text).join('\n')));
    }
  } catch (e) { console.error('buildManuscriptStructure failed:', e); }
  return map;
}

/**
 * Map a 0–1 progress fraction to the chapter the reader is currently in,
 * using cumulative word offsets as chapter boundaries.
 */
export function resumeChapterByProgress<T extends { index: number }>(
  chapters: T[],
  wordCounts: Map<number, number>,
  progress: number,
): T | undefined {
  if (!chapters.length) return undefined;
  const total = chapters.reduce((s, ch) => s + (wordCounts.get(ch.index) ?? 0), 0);
  if (total === 0 || progress <= 0) return chapters[0];
  const target = progress * total;
  let acc = 0;
  for (const ch of chapters) {
    acc += wordCounts.get(ch.index) ?? 0;
    if (acc >= target) return ch;
  }
  return chapters[chapters.length - 1];
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
