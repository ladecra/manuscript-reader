import type { Annotation, AnnotationCluster, AnnotationType, Chapter, ChapterStat, Report } from './types';
import { ANNOTATION_TYPES } from './types';
import { computeChapterWords } from './ingestion/parseMarkdown';

function emptyCounts(): Record<AnnotationType, number> {
  return Object.fromEntries(ANNOTATION_TYPES.map(t => [t, 0])) as Record<AnnotationType, number>;
}

/** Stable beta-reader identity for agreement analysis. Prefers the durable
 *  `readerId` (Phase 5); falls back to the display name for legacy imports that
 *  predate it. Returns null for the author's own annotations (no reader
 *  attribution) so they never inflate reader counts. Keying on this — not the
 *  free-text name — is what stops two distinct anonymous readers collapsing into
 *  one bucket, or one reader splitting across name variants. */
function readerIdentity(a: Annotation): string | null {
  if (a.readerId) return 'id:' + a.readerId;
  if (a.readerName) return 'name:' + a.readerName;
  return null;
}

// ── Editorial signal definitions ──────────────────────────────────────────────
// Each signal maps one or more annotation types to an interpretation. A cluster
// is a run of consecutive chapters that together carry enough of those types to
// be worth a revision pass. Thresholds are deliberately conservative so the
// report only ever surfaces real concentrations, not noise.
interface SignalDef {
  signal: AnnotationCluster['signal'];
  types: AnnotationType[];
  min: number;   // minimum annotations across the run to emit a cluster
  med: number;   // count at/above which severity is 'medium'
  high: number;  // count at/above which severity is 'high'
}
const SIGNAL_DEFS: SignalDef[] = [
  { signal: 'confusion',        types: ['question'],              min: 2, med: 3, high: 5 },
  { signal: 'continuity-break', types: ['continuity'],           min: 1, med: 2, high: 3 },
  { signal: 'structural-issue', types: ['structural'],           min: 1, med: 2, high: 3 },
  { signal: 'engagement',       types: ['highlight', 'bookmark'], min: 4, med: 6, high: 10 },
];

/**
 * Detect editorial signal clusters: maximal runs of consecutive chapters that
 * each carry the signal's annotation type(s), grouped into one finding per run.
 * Pure — no browser, fully deterministic given the annotation list.
 */
function detectClusters(annotations: Annotation[], allStats: ChapterStat[]): AnnotationCluster[] {
  const clusters: AnnotationCluster[] = [];
  const ordered = [...allStats].sort((a, b) => a.index - b.index);

  for (const def of SIGNAL_DEFS) {
    const inSignal = (c: ChapterStat) => def.types.reduce((s, t) => s + (c.counts[t] ?? 0), 0);

    let run: ChapterStat[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const total = run.reduce((s, c) => s + inSignal(c), 0);
      if (total >= def.min) {
        const lo = run[0].index, hi = run[run.length - 1].index;
        const ids = annotations
          .filter(a => def.types.includes(a.type) && a.chapterIndex >= lo && a.chapterIndex <= hi)
          .sort((a, b) => a.chapterIndex - b.chapterIndex || a.createdAt - b.createdAt)
          .map(a => a.id);
        // Primary type = the most frequent of the signal's types across the run.
        const primary = def.types
          .map(t => ({ t, n: run.reduce((s, c) => s + (c.counts[t] ?? 0), 0) }))
          .sort((a, b) => b.n - a.n)[0].t;
        clusters.push({
          id: `cluster-${def.signal}-${lo}-${hi}`,
          type: primary,
          chapterRange: [lo, hi],
          annotations: ids,
          signal: def.signal,
          severity: total >= def.high ? 'high' : total >= def.med ? 'medium' : 'low',
          count: total,
        });
      }
      run = [];
    };

    let prevIndex: number | null = null;
    for (const c of ordered) {
      if (inSignal(c) > 0) {
        if (prevIndex !== null && c.index !== prevIndex + 1) flush();
        run.push(c);
        prevIndex = c.index;
      }
    }
    flush();
  }

  // Most actionable first: severity, then volume.
  const sevRank = { high: 3, medium: 2, low: 1 } as const;
  return clusters.sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || b.count - a.count);
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
  const chapterReaders = new Map<number, Set<string>>(); // index → distinct reader identities
  const identityName = new Map<string, string>();        // identity → display name (for the readers list)
  for (const ch of chapters) {
    chapterMap.set(ch.index, {
      title: ch.title, index: ch.index, count: 0, counts: emptyCounts(),
      words: chapterWords.get(ch.index) ?? 0, density: 0, readerCount: 0,
    });
  }
  for (const ann of annotations) {
    const key = ann.chapterIndex || 0;
    if (!chapterMap.has(key)) {
      chapterMap.set(key, {
        title: ann.chapterTitle, index: key, count: 0, counts: emptyCounts(),
        words: chapterWords.get(key) ?? 0, density: 0, readerCount: 0,
      });
    }
    const stat = chapterMap.get(key)!;
    stat.count++;
    if (stat.counts[ann.type] !== undefined) (stat.counts[ann.type] as number)++;
    const identity = readerIdentity(ann);
    if (identity) {
      const set = chapterReaders.get(key) ?? new Set<string>();
      set.add(identity);
      chapterReaders.set(key, set);
      // Remember a display name for this identity (prefer a real name over a
      // blank/placeholder, so the readers list reads well even for late-named readers).
      const existing = identityName.get(identity);
      if (!existing || (existing === 'Reader' && ann.readerName)) {
        identityName.set(identity, ann.readerName || 'Reader');
      }
    }
  }

  // Density = annotations per 1,000 words; readerCount = distinct named readers.
  for (const stat of chapterMap.values()) {
    stat.density = stat.words > 0 ? (stat.count / stat.words) * 1000 : 0;
    stat.readerCount = chapterReaders.get(stat.index)?.size ?? 0;
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

  // One entry per distinct reader identity (not per name string), so the count
  // is correct even when readers share a name or leave it blank.
  const readers = [...identityName.values()];

  // Editorial signal clusters (confusion / continuity / structural / engagement runs).
  const clusters = detectClusters(annotations, allStats);

  // Reader consensus: only meaningful with 2+ beta readers. Surface the chapters
  // the most readers independently reacted to — the strongest revision signal.
  const consensus = readers.length >= 2
    ? allStats.filter(c => c.readerCount >= 2).sort((a, b) => b.readerCount - a.readerCount || b.count - a.count)
    : [];

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
    clusters,
    consensus,
    annotationClusters: clusters,
  };
}
