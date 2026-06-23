// ─── Editorial Signals — the canonical report-engine output (Phase 6) ─────────
// Produces the single structured EditorialSignals object that the in-app panel,
// the exports, and the future AI layer all consume. It does NOT re-derive
// findings: it composes the two pure engines we already have —
//   • computeReport         (annotation-derived: hotspots, clusters, engagement)
//   • mergeReaderSessions   (session-derived: completion, reach, agreement)
// — into one shape, so there is exactly one computation and no divergence.
//
// Degrades cleanly: with no reader sessions (author annotating alone) it falls
// back to the annotation-only findings; multi-reader signal fills in as sessions
// arrive. revisionImpact stays null until version snapshots exist (Phase 8).

import type {
  Annotation, Chapter, ChapterStat, EditorialSignals, ChapterAgreementSignal, ReaderSession,
} from './types';
import { computeReport } from './report';
import { mergeReaderSessions } from './sessions';
import { buildManuscriptStructure } from './ingestion/manuscriptStructure';
import { computeProseAnalysis } from './prose/proseAnalysis';

/** Annotation types that represent an editorial *concern* (vs. engagement). */
const CONCERN_TYPES = new Set(['question', 'continuity', 'structural']);
/** A chapter-to-chapter fall in normalized engagement this large counts as a drop. */
const ENGAGEMENT_DROP = 0.34;

export interface EditorialSignalsInput {
  manuscriptId: string;
  annotations: Annotation[];
  chapters: Chapter[];
  sessions: ReaderSession[];
  combinedMarkdown?: string;
}

export function computeEditorialSignals(input: EditorialSignalsInput): EditorialSignals {
  const { manuscriptId, annotations, chapters, sessions, combinedMarkdown } = input;

  const report = computeReport(annotations, chapters, combinedMarkdown);
  const merge = mergeReaderSessions(sessions, annotations, chapters);

  // Prose-derived signal — analyses the text itself, so it's present even with
  // zero annotations. Null only when the source markdown isn't available.
  const prose = combinedMarkdown
    ? computeProseAnalysis(buildManuscriptStructure(combinedMarkdown))
    : null;
  const hasReaders = merge.readerCount > 0;

  // Reach lookup (readers who got to each chapter), for abandonment-aware silence.
  const reachByChapter = new Map<number, number>();
  for (const c of merge.chapters) reachByChapter.set(c.chapterIndex, c.readersWhoReached);

  // Silence that matters = chapters readers *reached* but stayed quiet in. Without
  // session reach data, fall back to the annotation/density-based silent list.
  const silentChapters: ChapterStat[] = hasReaders
    ? report.silent.filter(c => (reachByChapter.get(c.index) ?? 0) >= 1)
    : report.silent;

  // Clusters split by signal into the two named buckets the shape exposes.
  const questionClusters = report.clusters.filter(c => c.signal === 'confusion');
  const continuityBreaks = report.clusters.filter(c => c.signal === 'continuity-break');

  // Per-chapter cross-reader agreement (only meaningful with ≥1 reader session).
  const titleByIndex = new Map(report.chapters.map(c => [c.index, c.title] as const));
  const readerAgreement: ChapterAgreementSignal[] = hasReaders
    ? merge.chapters
        .filter(c => c.readersWhoAnnotated >= 1)
        .map(c => ({
          chapterIndex: c.chapterIndex,
          chapterTitle: titleByIndex.get(c.chapterIndex) ?? '',
          annotationCount: c.annotationCount,
          readersWhoAnnotated: c.readersWhoAnnotated,
          readersWhoReached: c.readersWhoReached,
          agreement: agreementRatio(c.readersWhoAnnotated, c.readersWhoReached, merge.readerCount),
        }))
        .sort((a, b) => b.readersWhoAnnotated - a.readersWhoAnnotated || b.agreement - a.agreement)
    : [];

  const unresolvedConcerns = annotations.filter(
    a => CONCERN_TYPES.has(a.type) && a.status !== 'resolved',
  ).length;

  // Engagement curve = normalized highlight+bookmark volume per chapter, in order.
  const ordered = [...report.chapters].sort((a, b) => a.index - b.index);
  const rawEngagement = ordered.map(c => (c.counts.highlight ?? 0) + (c.counts.bookmark ?? 0));
  const peak = Math.max(0, ...rawEngagement);
  const engagementCurve = rawEngagement.map(v => (peak > 0 ? v / peak : 0));
  const engagementDrops: number[] = [];
  for (let i = 1; i < engagementCurve.length; i++) {
    if (engagementCurve[i - 1] - engagementCurve[i] >= ENGAGEMENT_DROP) {
      engagementDrops.push(ordered[i].index);
    }
  }

  return {
    manuscriptId,
    generatedAt: Date.now(),
    report,
    readerCount: merge.readerCount,
    completionRate: merge.completionRate,
    versionsRead: merge.versionsRead,
    hotspots: report.hotspots,
    silentChapters,
    questionClusters,
    continuityBreaks,
    readerAgreement,
    unresolvedConcerns,
    engagementCurve,
    engagementDrops,
    prose,
    revisionImpact: null,
  };
}

/** Of the readers who reached a chapter, the fraction that reacted to it. Falls
 *  back to the whole reader pool when reach is unknown (no word-count data). */
function agreementRatio(annotated: number, reached: number, readerCount: number): number {
  const denom = reached > 0 ? reached : readerCount;
  return denom > 0 ? Math.min(1, annotated / denom) : 0;
}
