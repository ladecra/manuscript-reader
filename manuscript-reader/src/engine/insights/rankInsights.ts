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
//   1. consensus    — several readers independently reacted to the same chapter
//   2. reaction     — a concentrated READER cluster (confusion/continuity first)
//   3. author-queue — the author's OWN flags, run-grouped, as revision pointers
//   4. prose        — a chapter whose length is a self-relative outlier
// Reader signal (consensus, reaction) outranks the author's own queue, which
// outranks text-only prose. Author marks and reader marks are different speech
// acts (Part 1): reader marks are reactions, author marks are revision intent, and
// they never share a tier or its copy. We never emit a standalone "hotspot"
// insight: a lone dense chapter is too easy to overstate; only clusters surface.

import type { EditorialSignals, ManuscriptInsight, AnnotationCluster, ChapterStat, PassageConvergence } from '../types';
import { DEVELOPMENTAL_TYPES, ANNOTATION_LABELS } from '../types';
import { chapterLengthInsightFlag } from '../prose/chapterLengthOutlier';

// Prose length insight threshold — deliberately MUCH stricter than the table's
// own ×-notation cut (ReportView/proseReportSection mark deviation at 1.4×/0.6×
// for information). An insight is a "look here" claim, so we only make it when a
// chapter is genuinely, unmistakably off: ≥2.1× the manuscript's mean chapter
// length, the classic two-chapters-merged tell. Short chapters surface at ≤0.25×
// — much stricter than the table's 0.6× — for likely false breaks (orphaned headings).

const MAX_CONVERGENCE = 3, MAX_ABANDON = 1, MAX_CONSENSUS = 2, MAX_CLUSTERS = 2, MAX_REACTION = 3, MAX_AUTHORQUEUE = 2, MAX_PROSE = 2, MAX_TOTAL = 5;

export function rankInsights(signals: EditorialSignals): ManuscriptInsight[] {
  return [
    ...convergenceInsights(signals), // distinct readers on the SAME passage (reader marks) — outranks chapter consensus
    ...abandonmentInsights(signals), // where the room thinned — reach ends and doesn't resume (pass 5)
    ...consensusInsights(signals),   // several readers agreed at CHAPTER level (coarse fallback)
    ...reactionInsights(signals),    // a concentrated reader cluster (reader marks)
    ...authorQueueInsights(signals), // the author's own revision flags (author marks)
    ...proseInsights(signals),       // a self-relative length outlier (text)
  ].slice(0, MAX_TOTAL);
}

// ── Abandonment: where reach ends and doesn't resume (the truest pacing signal) ─
function abandonmentInsights(signals: EditorialSignals): ManuscriptInsight[] {
  return signals.readerDropoff.slice(0, MAX_ABANDON).map(d => {
    const where = chapterName(d.chapterTitle, d.chapterIndex);
    return {
      id: `insight-abandon-${d.chapterIndex}`,
      tier: 'abandonment' as const,
      headline: `${d.readersStopped} of ${d.readersReached} readers stopped after ${where}`,
      detail: 'Where reach ends and does not resume — the strongest pacing signal there is: not what readers said, but where they stopped saying anything.',
      chapter: d.chapterIndex,
      chapterRange: [d.chapterIndex, d.chapterIndex] as [number, number],
      evidence: {
        kind: 'agreement' as const,
        label: `${d.readersStopped} stopped`,
        readers: [d.readersStopped, d.readersReached] as [number, number],
      },
    };
  });
}

// ── Convergence: distinct readers on the same PASSAGE (the resolution layer) ───
// Outranks chapter consensus — same agreement, resolved to the exact lines. Only
// the room (≥2 distinct readers) is here by construction; soloPassages are held
// out of the signal object's ranked array, so a lone voice can never appear here.
const VALENCE_COPY: Record<PassageConvergence['valence'], {
  headline: (n: number, total: number, where: string) => string;
  detail: string;
}> = {
  cool: {
    headline: (n, total, where) => `${n} of ${total} readers flagged the same passage ${where}`,
    detail: 'The room converged on one passage with questions or editorial flags — independent agreement on the exact lines is the strongest signal something needs attention.',
  },
  warm: {
    headline: (n, total, where) => `${n} of ${total} readers marked the same passage ${where}`,
    detail: 'The room leaned in on one passage. Attention of probably-positive but unasserted polarity — worth knowing what’s load-bearing before you revise around it.',
  },
  divided: {
    headline: (n, total, where) => `${n} of ${total} readers split on the same passage ${where}`,
    detail: 'Distinct readers reacted in opposite directions on one passage — a split is a decision the room is handing back to you, not noise to average away.',
  },
};

function convergenceInsights(signals: EditorialSignals): ManuscriptInsight[] {
  return signals.passageConvergences.slice(0, MAX_CONVERGENCE).map(c => {
    const copy = VALENCE_COPY[c.valence];
    const where = passageWhere(c.chapterTitle, c.chapterIndex, c.blockOrdinal, c.blockOrdinalEnd);
    return {
      id: `insight-convergence-${c.id}`,
      tier: 'convergence' as const,
      // Reach-aware denominator: N of the readers who actually reached this passage.
      headline: copy.headline(c.readerCount, c.readersReached, where),
      detail: copy.detail,
      chapter: c.chapterIndex,
      chapterRange: [c.chapterIndex, c.chapterIndex] as [number, number],
      evidence: {
        kind: 'convergence' as const,
        label: `${c.readerCount} readers`,
        valence: c.valence,
        annotationIds: c.annotationIds.slice(0, 1),
      },
    };
  });
}

// ── Consensus: chapters several readers reacted to independently ──────────────
function consensusInsights(signals: EditorialSignals): ManuscriptInsight[] {
  if (signals.readerCount < 2) return [];
  // A chapter already surfaced as a passage convergence is covered at finer
  // resolution — don't repeat it as coarse chapter agreement.
  const converged = new Set(signals.passageConvergences.map(c => c.chapterIndex));
  return signals.readerAgreement
    .filter(a => a.readersWhoAnnotated >= 2 && !converged.has(a.chapterIndex))
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

type Framing = 'reader' | 'author';

// ── Reaction: concentrated READER clusters + reader developmental density ─────
// Reader marks only. Empty by construction when no readers have annotated — a
// solo author's own marks never surface here; they flow to the author-queue tier.
function reactionInsights(signals: EditorialSignals): ManuscriptInsight[] {
  return clusterAndDevInsights(
    signals.report.clusters,
    signals.report.developmentalHotspots,
    'reader',
  ).slice(0, MAX_REACTION);
}

// ── Author queue: the author's OWN flags as navigational pointers ─────────────
// Same run-detector as the reader reaction tier, over author marks — so "3
// questions across Ch 3–5" is preserved — but framed as the author's revision
// queue ("you flagged"), never as reader confusion.
function authorQueueInsights(signals: EditorialSignals): ManuscriptInsight[] {
  const ar = signals.report.authorRevision;
  return clusterAndDevInsights(ar.clusters, ar.chapters, 'author')
    .slice(0, MAX_AUTHORQUEUE);
}

// Shared shape for reaction (reader) and author-queue (author): the pre-sorted
// clusters, plus one developmental-density pointer for the densest concern
// chapter a cluster didn't already cover (this is what surfaces pacing/voice
// work, which the cluster model doesn't track at all).
function clusterAndDevInsights(
  clustersIn: AnnotationCluster[],
  devChapters: ChapterStat[],
  framing: Framing,
): ManuscriptInsight[] {
  const ranked = [...clustersIn].sort((a, b) => signalRank(a.signal) - signalRank(b.signal));
  const clusters = dedupeByRange(ranked).slice(0, MAX_CLUSTERS);
  const out = clusters.map(c => clusterInsight(c, framing));

  const claimed = new Set<number>();
  for (const c of clusters) for (let i = c.chapterRange[0]; i <= c.chapterRange[1]; i++) claimed.add(i);

  const dev = devChapters
    .filter(c => !claimed.has(c.index) && devCountOf(c) >= 2)
    .sort((a, b) => devCountOf(b) - devCountOf(a))[0];
  if (dev) out.push(developmentalInsight(dev, framing));

  return out;
}

const devCountOf = (c: ChapterStat) => DEVELOPMENTAL_TYPES.reduce((s, t) => s + (c.counts[t] ?? 0), 0);

function developmentalInsight(c: ChapterStat, framing: Framing): ManuscriptInsight {
  const present = DEVELOPMENTAL_TYPES
    .map(t => ({ t, n: c.counts[t] ?? 0 }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const total = present.reduce((s, x) => s + x.n, 0);
  const lead = present[0]?.t;
  const where = chapterName(c.title, c.index);
  const mostly = lead ? `, mostly ${ANNOTATION_LABELS[lead].toLowerCase()}` : '';
  const author = framing === 'author';
  return {
    id: author ? `insight-authordev-${c.index}` : `insight-dev-${c.index}`,
    tier: author ? 'author-queue' : 'reaction',
    headline: author
      ? `${where} carries the most revision flags you’ve left`
      : `${where} carries the densest developmental flags`,
    detail: author
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

function clusterInsight(c: AnnotationCluster, framing: Framing): ManuscriptInsight {
  const [from, to] = c.chapterRange;
  const where = rangeLabel(from, to);
  const copy = CLUSTER_COPY[c.signal];
  const f = copy[framing];
  const author = framing === 'author';
  return {
    // Reader and author clusters share detectClusters' id namespace; prefix the
    // author ones so a mixed manuscript never collides on the same range.
    id: author ? `insight-author-${c.id}` : `insight-${c.id}`,
    tier: author ? 'author-queue' : 'reaction',
    headline: f.headline(c.count, where),
    detail: f.detail,
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

// Each signal carries a reader-framed variant (reaction tier) and an author-framed
// variant (author-queue tier) — the SAME counts, but reader marks read as reaction
// and author marks read as a revision queue. The two are never interchangeable.
const CLUSTER_COPY: Record<AnnotationCluster['signal'], {
  reader: { headline: (n: number, where: string) => string; detail: string };
  author: { headline: (n: number, where: string) => string; detail: string };
  label: (n: number) => string;
}> = {
  confusion: {
    reader: { headline: (n, where) => `${n} question${plural(n)} cluster ${where}`, detail: 'Possible confusion or an unanswered setup — worth a close read on your next pass.' },
    author: { headline: (n, where) => `${n} question${plural(n)} you flagged ${where}`, detail: 'Your own open questions — worth resolving on your next pass.' },
    label: n => `${n} question${plural(n)}`,
  },
  'continuity-break': {
    reader: { headline: (n, where) => `${n} continuity flag${plural(n)} ${where}`, detail: 'Worth a focused consistency pass across these chapters.' },
    author: { headline: (n, where) => `${n} continuity flag${plural(n)} you left ${where}`, detail: 'Your own continuity notes — worth a focused consistency pass across these chapters.' },
    label: n => `${n} continuity`,
  },
  'structural-issue': {
    reader: { headline: (n, where) => `${n} structural note${plural(n)} ${where}`, detail: 'Pacing, scene order, or chapter shape — worth a look while the run is fresh.' },
    author: { headline: (n, where) => `${n} structural note${plural(n)} you left ${where}`, detail: 'Your own structural notes — pacing, scene order, or chapter shape to revisit.' },
    label: n => `${n} structural`,
  },
  engagement: {
    reader: { headline: (n, where) => `A concentration of ${n} highlights and bookmarks ${where}`, detail: 'This is landing — useful to know what to protect in revision.' },
    author: { headline: (n, where) => `${n} passage${plural(n)} you marked to keep ${where}`, detail: 'Passages you marked to keep — useful to know what to protect in revision.' },
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

// "in Chapter 7 · ¶3" (or "· ¶3–5" for a merged beat) — the passage locator.
function passageWhere(title: string | undefined, index: number, ordinal: number, ordinalEnd?: number): string {
  const base = `in ${chapterName(title, index)}`;
  if (ordinal <= 0) return base;
  const span = ordinalEnd && ordinalEnd > ordinal ? `${ordinal}–${ordinalEnd}` : `${ordinal}`;
  return `${base} · ¶${span}`;
}

function rangeLabel(from: number, to: number): string {
  return from === to ? `in Chapter ${from}` : `across Chapters ${from}–${to}`;
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}
