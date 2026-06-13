import type { Annotation, AnnotationType, Chapter, ChapterStat, Report } from './types';
import { ANNOTATION_TYPES } from './types';
import { computeChapterWords } from './ingestion/parseMarkdown';

function emptyCounts(): Record<AnnotationType, number> {
  return Object.fromEntries(ANNOTATION_TYPES.map(t => [t, 0])) as Record<AnnotationType, number>;
}

/**
 * Compute the full manuscript intelligence report.
 *
 * @param annotations  All annotations for the manuscript.
 * @param chapters     The chapter list (index, title, id).
 * @param combinedMarkdown  Optional raw markdown — enables per-chapter word
 *   counts and density analysis. Without it, density-based findings degrade
 *   gracefully (count-based ordering only).
 */
export function computeReport(annotations: Annotation[], chapters: Chapter[], combinedMarkdown?: string): Report {
  const typeTotals = emptyCounts();
  for (const ann of annotations) {
    if (typeTotals[ann.type] !== undefined) typeTotals[ann.type]++;
  }

  const chapterWords = combinedMarkdown ? computeChapterWords(combinedMarkdown) : new Map<number, number>();

  // Build per-chapter stats keyed by chapter index.
  const chapterMap = new Map<number, ChapterStat>();
  for (const ch of chapters) {
    chapterMap.set(ch.index, {
      title: ch.title, index: ch.index, count: 0, counts: emptyCounts(),
      words: chapterWords.get(ch.index) ?? 0, density: 0,
    });
  }
  for (const ann of annotations) {
    const key = ann.chapterIndex || 0;
    if (!chapterMap.has(key)) {
      chapterMap.set(key, {
        title: ann.chapterTitle, index: key, count: 0, counts: emptyCounts(),
        words: chapterWords.get(key) ?? 0, density: 0,
      });
    }
    const stat = chapterMap.get(key)!;
    stat.count++;
    if (stat.counts[ann.type] !== undefined) (stat.counts[ann.type] as number)++;
  }

  // Density = annotations per 1,000 words.
  for (const stat of chapterMap.values()) {
    stat.density = stat.words > 0 ? (stat.count / stat.words) * 1000 : 0;
  }

  const allStats = [...chapterMap.values()].sort((a, b) => a.index - b.index);
  const totalAnns = annotations.length;
  const totalWords = allStats.reduce((s, c) => s + c.words, 0)
    || (combinedMarkdown ? combinedMarkdown.trim().split(/\s+/).filter(Boolean).length : 0)
    || 1;

  const withWords = allStats.filter(c => c.words > 0);
  const avgDensity = withWords.length ? withWords.reduce((s, c) => s + c.density, 0) / withWords.length : 0;
  const covered = allStats.filter(c => c.count > 0).length;
  const coverage = allStats.length ? covered / allStats.length : 0;

  // Findings. When word data is present, use density thresholds (matches v0.9);
  // otherwise fall back to raw counts so the report still surfaces signal.
  const hasWordData = withWords.length > 0;
  const hotspots = hasWordData
    ? allStats.filter(c => c.count >= 2 && c.density >= avgDensity * 1.35).sort((a, b) => b.density - a.density)
    : allStats.filter(c => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
  const silent = hasWordData
    ? allStats.filter(c => c.words > 0 && (c.count === 0 || (avgDensity > 0 && c.density <= avgDensity * 0.4))).sort((a, b) => a.density - b.density)
    : allStats.filter(c => c.index > 0 && c.count === 0);
  const questionClusters = allStats.filter(c => (c.counts.question ?? 0) >= 2).sort((a, b) => (b.counts.question ?? 0) - (a.counts.question ?? 0));
  const continuityFlags = allStats.filter(c => (c.counts.continuity ?? 0) >= 1).sort((a, b) => (b.counts.continuity ?? 0) - (a.counts.continuity ?? 0));

  const readers = [...new Set(annotations.map(a => a.readerName).filter(Boolean))] as string[];

  // Engagement score (0–100): coverage 45 · volume 35 · balance 20.
  const volumeTarget = (allStats.length || 1) * 4;
  const volumeScore = Math.min(1, totalAnns / volumeTarget);
  const concern = totalAnns ? ((typeTotals.question + typeTotals.continuity + typeTotals.structural) / totalAnns) : 0;
  let score = Math.round(45 * coverage + 35 * volumeScore + 20 * (1 - concern));
  score = Math.max(0, Math.min(100, score));

  let label: string, blurb: string;
  if (totalAnns === 0) { score = 0; label = 'No data yet'; blurb = 'Annotate as you read and the report fills in.'; }
  else if (score >= 80) { label = 'Excellent'; blurb = 'Strong, even engagement across the manuscript.'; }
  else if (score >= 65) { label = 'Good'; blurb = 'Solid engagement, with a few standout chapters below.'; }
  else if (score >= 45) { label = 'Mixed'; blurb = 'Engagement is uneven — note the quiet chapters below.'; }
  else { label = 'Sparse'; blurb = 'Light coverage so far; more reading will sharpen this.'; }

  return {
    id: 'report-' + Date.now(),
    generatedAt: Date.now(),
    totalAnns,
    totalWords,
    typeTotals,
    chapters: allStats,
    hotspots,
    silent,
    questionClusters,
    continuityFlags,
    readers,
    avgDensity,
    coverage,
    score,
    label,
    blurb,
  };
}
