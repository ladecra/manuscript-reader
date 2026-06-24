// ─── Snapshot diff — the revision-impact keystone (Phase 8) ───────────────────
// Pure function over two immutable snapshots → a structured, score-free diff. The
// keystone the note flagged: revision packets, History mode, the revision-impact
// report, and the AI layer all consume this one computation.
//
// The load-bearing rule (resolution 1): each side's EditorialSignals is RECOMPUTED
// from its frozen inputs by the CURRENT engine — never read from a stored cache —
// so both sides are measured by one engine version and a Draft 2 ↔ Draft 4 diff
// reflects the manuscript, not an engine upgrade. No scores: only grounded deltas.

import type {
  Annotation, ChapterStat, Snapshot, SnapshotDiff, SnapshotChapterDiff,
  SnapshotRef, AnnotationLifecycle, EditorialSignals,
} from './types';
import { parseMarkdown } from './ingestion/parseMarkdown';
import { computeEditorialSignals } from './editorialSignals';
import { manuscriptVersionId } from './manuscript/manuscriptVersion';

const CONCERN_TYPES = new Set(['question', 'continuity', 'structural']);
const annStatus = (a: Annotation): 'open' | 'resolved' => (a.status === 'resolved' ? 'resolved' : 'open');
const normTitle = (t: string): string => t.trim().toLowerCase();
const rawEngagement = (c: ChapterStat): number => (c.counts.highlight ?? 0) + (c.counts.bookmark ?? 0);

interface Side {
  signals: EditorialSignals;
  /** Per-chapter content hash, keyed by 1-based chapter index — detects real prose change. */
  textHashByIndex: Map<number, string>;
  /** Report ChapterStat keyed by 1-based index, for count/engagement lookups. */
  statByIndex: Map<number, ChapterStat>;
  /** 1-based chapter index → title. */
  titleByIndex: Map<number, string>;
}

/** Recompute one snapshot's signals from its frozen inputs + index its chapters. */
function analyze(snap: Snapshot): Side {
  const { chapters, blocks } = parseMarkdown(snap.markdown);
  const signals = computeEditorialSignals({
    manuscriptId: snap.manuscriptId,
    annotations: snap.annotations,
    chapters,
    sessions: snap.sessions,
    combinedMarkdown: snap.markdown,
  });

  // Per-chapter text (concatenate this chapter's block text) → content hash.
  const textByIndex = new Map<number, string>();
  for (const b of blocks) {
    if (b.chapterIndex > 0) textByIndex.set(b.chapterIndex, (textByIndex.get(b.chapterIndex) ?? '') + '\n' + b.text);
  }
  const textHashByIndex = new Map<number, string>();
  for (const [idx, text] of textByIndex) textHashByIndex.set(idx, manuscriptVersionId(text));

  const statByIndex = new Map(signals.report.chapters.map(c => [c.index, c] as const));
  const titleByIndex = new Map(chapters.map(c => [c.index, c.title] as const));
  return { signals, textHashByIndex, statByIndex, titleByIndex };
}

function refOf(snap: Snapshot): SnapshotRef {
  return { id: snap.id, label: snap.label, versionId: snap.versionId,
    createdAt: snap.createdAt, wordCount: snap.wordCount, chapterCount: snap.chapterCount };
}

/** Align chapters by normalized title, disambiguating duplicate titles by order, so
 *  each physical chapter maps to at most one counterpart. Returns alignment keys. */
function alignmentKey(title: string, seen: Map<string, number>): string {
  const base = normTitle(title);
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return `${base}#${n}`;
}

function diffChapters(a: Side, b: Side): SnapshotChapterDiff[] {
  // Map each side's chapter indices to alignment keys.
  const keyToA = new Map<string, number>();
  const seenA = new Map<string, number>();
  for (const [idx, title] of [...a.titleByIndex].sort((x, y) => x[0] - y[0])) keyToA.set(alignmentKey(title, seenA), idx);

  const keyToB = new Map<string, number>();
  const seenB = new Map<string, number>();
  for (const [idx, title] of [...b.titleByIndex].sort((x, y) => x[0] - y[0])) keyToB.set(alignmentKey(title, seenB), idx);

  const annCount = (side: Side, idx: number): number => side.statByIndex.get(idx)?.count ?? 0;
  const words = (side: Side, idx: number): number => side.statByIndex.get(idx)?.words ?? 0;
  const engage = (side: Side, idx: number): number => { const s = side.statByIndex.get(idx); return s ? rawEngagement(s) : 0; };

  const out: SnapshotChapterDiff[] = [];
  const allKeys = new Set<string>([...keyToA.keys(), ...keyToB.keys()]);
  for (const key of allKeys) {
    const ai = keyToA.get(key);
    const bi = keyToB.get(key);
    const title = (bi != null ? b.titleByIndex.get(bi) : ai != null ? a.titleByIndex.get(ai) : '') ?? '';

    if (ai == null && bi != null) {
      out.push({ status: 'added', title, fromIndex: null, toIndex: bi,
        wordCountDelta: words(b, bi), annotationCountDelta: annCount(b, bi), engagementDelta: engage(b, bi) });
    } else if (ai != null && bi == null) {
      out.push({ status: 'removed', title, fromIndex: ai, toIndex: null,
        wordCountDelta: -words(a, ai), annotationCountDelta: -annCount(a, ai), engagementDelta: -engage(a, ai) });
    } else if (ai != null && bi != null) {
      const changed = a.textHashByIndex.get(ai) !== b.textHashByIndex.get(bi);
      out.push({ status: changed ? 'modified' : 'unchanged', title, fromIndex: ai, toIndex: bi,
        wordCountDelta: words(b, bi) - words(a, ai),
        annotationCountDelta: annCount(b, bi) - annCount(a, ai),
        engagementDelta: engage(b, bi) - engage(a, ai) });
    }
  }
  // Stable order: by toIndex (added/modified/unchanged), removed chapters by fromIndex at the end.
  return out.sort((x, y) =>
    (x.toIndex ?? Infinity) - (y.toIndex ?? Infinity) || (x.fromIndex ?? Infinity) - (y.fromIndex ?? Infinity));
}

function diffAnnotations(from: Annotation[], to: Annotation[]): AnnotationLifecycle {
  const aById = new Map(from.map(a => [a.id, a] as const));
  const bById = new Map(to.map(a => [a.id, a] as const));
  const life: AnnotationLifecycle = { added: [], removed: [], resolvedBetween: [], reopenedBetween: [], persistentOpen: [] };

  for (const id of bById.keys()) if (!aById.has(id)) life.added.push(id);
  for (const [id, a] of aById) {
    const b = bById.get(id);
    if (!b) { life.removed.push(id); continue; }
    const sa = annStatus(a), sb = annStatus(b);
    if (sa === 'open' && sb === 'resolved') life.resolvedBetween.push(id);
    else if (sa === 'resolved' && sb === 'open') life.reopenedBetween.push(id);
    else if (sa === 'open' && sb === 'open') life.persistentOpen.push(id);
  }
  return life;
}

const unresolvedConcerns = (anns: Annotation[]): number =>
  anns.filter(a => CONCERN_TYPES.has(a.type) && annStatus(a) === 'open').length;

/** Diff two snapshots. `from` is the baseline (earlier draft), `to` the later one;
 *  all deltas are `to − from`. Order is respected, not inferred from timestamps. */
export function diffSnapshots(from: Snapshot, to: Snapshot): SnapshotDiff {
  const a = analyze(from);
  const b = analyze(to);

  const aHasReaders = a.signals.readerCount > 0;
  const bHasReaders = b.signals.readerCount > 0;

  return {
    from: refOf(from),
    to: refOf(to),
    identical: from.versionId === to.versionId,
    wordCountDelta: to.wordCount - from.wordCount,
    chapterCountDelta: to.chapterCount - from.chapterCount,
    unresolvedConcernsDelta: unresolvedConcerns(to.annotations) - unresolvedConcerns(from.annotations),
    completionRateDelta: aHasReaders && bHasReaders ? b.signals.completionRate - a.signals.completionRate : null,
    chapters: diffChapters(a, b),
    annotations: diffAnnotations(from.annotations, to.annotations),
  };
}
