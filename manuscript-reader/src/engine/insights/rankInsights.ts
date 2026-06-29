// ─── rankInsights — the ranked, evidence-linked "look here first" layer ───────
// Pure projection over EditorialSignals. The single source of truth for both the
// in-app Insights block and the exports' lead/takeaways, so on-screen and
// download never diverge. No new thresholds: it reuses the orderings the
// substrate already computed (clusters pre-sorted by severity then volume,
// agreement pre-sorted by independent-reader count) and the prose length-outlier
// thresholds the panel/exports already share.
//
// Voice: librarian pointers backed by numbers — "worth checking", never "this is
// too long". Counts are vs THIS manuscript's own average; reaction findings trace
// to reader actions (the author is one reader among any betas).
//
// Ranking is by tier, most-actionable first:
//   1. consensus — several readers independently reacted to the same chapter
//   2. reaction  — a concentrated annotation cluster (confusion/continuity first)
//   3. prose     — a chapter whose length is a self-relative outlier
// Consensus above reaction is what lets agreement outrank solo hotspot noise. We
// never emit a standalone "hotspot" insight: a lone dense chapter is too easy to
// overstate for a solo author; only concentrated clusters surface.

import type { EditorialSignals, ManuscriptInsight, AnnotationCluster, ChapterStat } from '../types';
import { DEVELOPMENTAL_TYPES, ANNOTATION_LABELS } from '../types';
import { chapterLengthInsightFlag } from '../prose/chapterLengthOutlier';

// Prose length insight threshold — deliberately MUCH stricter than the table's
// own ×-notation cut (ReportView/proseReportSection mark deviation at 1.4×/0.6×
// for information). An insight is a "look here" claim, so we only make it when a
// chapter is genuinely, unmistakably off: ≥2.1× the manuscript's mean chapter
// length, the classic two-chapters-merged tell. Short chapters surface at ≤0.25×
// — much stricter than the table's 0.6× — for likely false breaks (orphaned headings).

const MAX_CONSENSUS = 2, MAX_CLUSTERS = 2, MAX_REACTION = 3, MAX_PROSE = 2, MAX_TOTAL = 5;

export function rankInsights(signals: EditorialSignals): ManuscriptInsight[] {
  return [
    ...consensusInsights(signals),
    ...reactionInsights(signals),
    ...proseInsights(signals),
  ].slice(0, MAX_TOTAL);
}

/** With no beta readers, the annotation clusters are the AUTHOR's own marks — a
 *  revision queue, not reader reaction. The framing (not the data) changes:
 *  "you flagged" / "your own notes", never "possible reader confusion". */
const isSolo = (signals: EditorialSignals): boolean => signals.readerCount === 0;

// ── Consensus: chapters several readers reacted to independently ──────────────
function consensusInsights(signals: EditorialSignals): ManuscriptInsight[] {
  if (signals.readerCount < 2) return [];
  return signals.readerAgreement
    .filter(a => a.readersWhoAnnotated >= 2)
    .slice(0, MAX_CONSENSUS)
    .map(a => {
      const reached = a.readersWhoReached > 0 ? a.readersWhoReached : signals.readerCount;
      const where = chapterName(a.chapterTitle, a.chapterIndex);
      return {
        id: `insight-consensus-${a.chapterIndex}`,
        tier: 'consensus' as const,
        headline: `${a.readersWhoAnnotated} of ${reached} readers reacted to ${where}`,
        detail: 'Independent agreement is the strongest signal something needs attention — not just one reader’s taste.',
        chapter: a.chapterIndex,
        chapterRange: [a.chapterIndex, a.chapterIndex] as [number, number],
        evidence: {
          kind: 'agreement' as const,
          label: `${a.readersWhoAnnotated}/${reached} readers`,
          readers: [a.readersWhoAnnotated, reached] as [number, number],
        },
      };
    });
}

// ── Reaction: concentrated annotation clusters + developmental density ────────
function reactionInsights(signals: EditorialSignals): ManuscriptInsight[] {
  const solo = isSolo(signals);
  // Clusters (confusion/continuity/structural/engagement runs) are pre-sorted by
  // severity then volume — preserve that, just nudge positive engagement to the
  // back of the revision-pointing signals.
  const ranked = [...signals.report.clusters].sort(
    (a, b) => signalRank(a.signal) - signalRank(b.signal),
  );
  const clusters = dedupeByRange(ranked).slice(0, MAX_CLUSTERS);
  const out = clusters.map(c => clusterInsight(c, solo));

  // Chapters already spoken for by a cluster — don't double-flag the same chapter.
  const claimed = new Set<number>();
  for (const c of clusters) for (let i = c.chapterRange[0]; i <= c.chapterRange[1]; i++) claimed.add(i);

  // One developmental-density pointer for the densest editorial-concern chapter a
  // cluster didn't already cover. This is what surfaces pacing/voice work, which
  // the cluster model doesn't track at all.
  const dev = signals.report.developmentalHotspots.find(c => !claimed.has(c.index));
  if (dev) out.push(developmentalInsight(dev, solo));

  return out.slice(0, MAX_REACTION);
}

function developmentalInsight(c: ChapterStat, solo: boolean): ManuscriptInsight {
  const present = DEVELOPMENTAL_TYPES
    .map(t => ({ t, n: c.counts[t] ?? 0 }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const total = present.reduce((s, x) => s + x.n, 0);
  const lead = present[0]?.t;
  const where = chapterName(c.title, c.index);
  const mostly = lead ? `, mostly ${ANNOTATION_LABELS[lead].toLowerCase()}` : '';
  return {
    id: `insight-dev-${c.index}`,
    tier: 'reaction',
    headline: solo
      ? `${where} carries the most revision flags you’ve left`
      : `${where} carries the densest developmental flags`,
    detail: solo
      ? `${total} of your own editorial note${plural(total)}${mostly} — where you’ve concentrated revision attention.`
      : `${total} editorial note${plural(total)}${mostly} — concentrated revision attention, distinct from where readers simply leaned in.`,
    chapter: c.index,
    chapterRange: [c.index, c.index],
    evidence: {
      kind: 'cluster',
      label: `${total} flag${plural(total)}`,
      count: total,
    },
  };
}

function clusterInsight(c: AnnotationCluster, solo: boolean): ManuscriptInsight {
  const [from, to] = c.chapterRange;
  const where = rangeLabel(from, to);
  const copy = CLUSTER_COPY[c.signal];
  return {
    id: `insight-${c.id}`,
    tier: 'reaction',
    headline: copy.headline(c.count, where, solo),
    detail: solo ? copy.soloDetail : copy.detail,
    chapter: from,
    chapterRange: [from, to],
    evidence: {
      kind: 'cluster',
      label: copy.label(c.count),
      count: c.count,
      annotationIds: c.annotations.slice(0, 1),
    },
  };
}

// Each signal carries reader-framed copy and an author-framed (`solo`) variant —
// the same counts, never described as reader reaction when the author is alone.
const CLUSTER_COPY: Record<AnnotationCluster['signal'], {
  headline: (n: number, where: string, solo: boolean) => string;
  detail: string;
  soloDetail: string;
  label: (n: number) => string;
}> = {
  confusion: {
    headline: (n, where, solo) =>
      solo ? `${n} question${plural(n)} you flagged ${where}` : `${n} question${plural(n)} cluster ${where}`,
    detail: 'Possible confusion or an unanswered setup — worth a close read on your next pass.',
    soloDetail: 'Your own open questions — worth resolving on your next pass.',
    label: n => `${n} question${plural(n)}`,
  },
  'continuity-break': {
    headline: (n, where, solo) =>
      solo ? `${n} continuity flag${plural(n)} you left ${where}` : `${n} continuity flag${plural(n)} ${where}`,
    detail: 'Worth a focused consistency pass across these chapters.',
    soloDetail: 'Your own continuity notes — worth a focused consistency pass across these chapters.',
    label: n => `${n} continuity`,
  },
  'structural-issue': {
    headline: (n, where, solo) =>
      solo ? `${n} structural note${plural(n)} you left ${where}` : `${n} structural note${plural(n)} ${where}`,
    detail: 'Pacing, scene order, or chapter shape — worth a look while the run is fresh.',
    soloDetail: 'Your own structural notes — pacing, scene order, or chapter shape to revisit.',
    label: n => `${n} structural`,
  },
  engagement: {
    headline: (n, where) => `A concentration of ${n} highlights and bookmarks ${where}`,
    detail: 'This is landing — useful to know what to protect in revision.',
    soloDetail: 'Passages you marked to keep — useful to know what to protect in revision.',
    label: n => `${n} marks`,
  },
};

// confusion/continuity/structural are revision pointers; engagement is positive
// signal, so it sorts last within reaction.
function signalRank(signal: AnnotationCluster['signal']): number {
  switch (signal) {
    case 'confusion': return 0;
    case 'continuity-break': return 1;
    case 'structural-issue': return 2;
    case 'engagement': return 3;
  }
}

// Don't surface two clusters over the same chapter range (e.g. confusion +
// engagement in the same run) — keep the higher-ranked one.
function dedupeByRange(clusters: AnnotationCluster[]): AnnotationCluster[] {
  const seen = new Set<string>();
  const out: AnnotationCluster[] = [];
  for (const c of clusters) {
    const key = `${c.chapterRange[0]}-${c.chapterRange[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ── Prose: chapters whose length is a self-relative outlier ───────────────────
function proseInsights(signals: EditorialSignals): ManuscriptInsight[] {
  const prose = signals.prose;
  if (!prose) return [];
  const mean = prose.baselines.meanChapterWords;
  if (mean <= 0) return [];

  const rated = prose.chapters
    .filter(c => c.words > 0)
    .map(c => ({ c, ratio: c.words / mean }))
    .filter(
      ({ ratio }) => chapterLengthInsightFlag(ratio) !== null,
    );

  // Most extreme vs the manuscript mean first (0.1× and 3× both beat 2.1×).
  rated.sort((a, b) => proseLengthExtremity(b.ratio) - proseLengthExtremity(a.ratio));

  return rated.slice(0, MAX_PROSE).map(({ c, ratio }) => {
    const where = chapterName(c.title, c.index);
    const flag = chapterLengthInsightFlag(ratio);
    const short = flag === 'short';
    return {
      id: `insight-prose-${c.index}`,
      tier: 'prose' as const,
      headline: short
        ? `${where} is only ${ratio.toFixed(1)}× your average chapter length`
        : `${where} runs ${ratio.toFixed(1)}× your average chapter length`,
      detail: short
        ? 'A chapter this short is often a false break — a heading or in-text reference split off from the real chapter.'
        : 'A chapter this long sometimes hides two chapters that merged — worth checking the chapter break.',
      chapter: c.index,
      chapterRange: [c.index, c.index] as [number, number],
      evidence: {
        kind: 'prose-length' as const,
        label: `${ratio.toFixed(1)}× avg`,
        ratio,
      },
    };
  });
}

function proseLengthExtremity(ratio: number): number {
  return ratio >= 1 ? ratio : 1 / ratio;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function chapterName(title: string | undefined, index: number): string {
  const t = title?.trim();
  return t ? t.slice(0, 40) : `Chapter ${index}`;
}

function rangeLabel(from: number, to: number): string {
  return from === to ? `in Chapter ${from}` : `across Chapters ${from}–${to}`;
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}
