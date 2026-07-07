// ─── Concern analytics (deterministic rollups) ─────────────────────────────────
// Facts about each concern, recomputed from graph + annotations + markdown at
// read/export time — never stored (EditorialSignals rule). Chapters come from
// the annotations' CURRENT positions (resolveAnnotationChapters) when markdown
// is available, so a reordered manuscript reports the right chapters; ages take
// an injectable `now` so harnesses are exact. No keyword rollups by design —
// counts, spread, ages, and sweep extents tell the author more.

import type { Annotation, ConcernAnalytics, RevisionGraph } from '../types';
import { resolveAnnotationChapters } from '../annotations/chapterResolve';
import { sweepTerm } from './termSweep';

const DAY_MS = 86_400_000;
const daysSince = (t: number, now: number) => Math.max(0, Math.floor((now - t) / DAY_MS));

export function computeConcernAnalytics(
  graph: RevisionGraph,
  annotations: Annotation[],
  combinedMarkdown?: string,
  now: number = Date.now(),
): ConcernAnalytics[] {
  const resolved = resolveAnnotationChapters(annotations, combinedMarkdown);
  const byId = new Map(resolved.map(a => [a.id, a]));

  return graph.concerns.map(concern => {
    const links = graph.links.filter(l => l.concernId === concern.id);
    const chapterSet = new Set<number>();
    let openCount = 0;
    let resolvedCount = 0;
    let oldestOpenAt: number | null = null;
    for (const l of links) {
      const ann = byId.get(l.annotationId);
      if (ann && ann.chapterIndex > 0) chapterSet.add(ann.chapterIndex);
      if (l.status === 'resolved') {
        resolvedCount++;
      } else {
        openCount++;
        // Age of the THOUGHT, not the filing: the annotation was captured before
        // it was linked, and "oldest unresolved" should reflect how long it has
        // been waiting, not how recently the author organized it.
        const openedAt = ann?.createdAt ?? l.createdAt;
        if (oldestOpenAt === null || openedAt < oldestOpenAt) oldestOpenAt = openedAt;
      }
    }
    return {
      concernId: concern.id,
      linkedCount: links.length,
      openCount,
      resolvedCount,
      chaptersAffected: [...chapterSet].sort((a, b) => a - b),
      ageDays: daysSince(concern.createdAt, now),
      oldestOpenDays: oldestOpenAt === null ? null : daysSince(oldestOpenAt, now),
      sweep: concern.kind === 'sweep' && concern.term && combinedMarkdown
        ? sweepTerm(combinedMarkdown, concern.term)
        : undefined,
    };
  });
}
