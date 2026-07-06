// ─── Revision graph: pure graph operations + invariants ───────────────────────
// Every mutation returns a NEW graph (callers persist the result); nothing here
// touches storage or the DOM. Timestamps are injectable so harnesses are
// deterministic. Invariants enforced at the edge (validate + the op guards):
//   • links reference existing concerns and existing AUTHOR annotations
//   • no duplicate (concernId, annotationId) membership
//   • deleting a concern drops its links
// The graph never stores derived data — chapters, sweep extents, and ages are
// recomputed from annotations + markdown (see concernAnalytics/termSweep).

import type {
  Annotation, ConcernAnnotationLink, ConcernKind, ConcernStatus,
  ConcernSuggestion, RevisionConcern, RevisionGraph,
} from '../types';
import { isAuthorAnnotation } from '../types';

export function emptyRevisionGraph(): RevisionGraph {
  return { concerns: [], links: [], dismissedSuggestions: [], updatedAt: 0 };
}

/** Parse a persisted blob defensively (absent/legacy/corrupt ⇒ empty graph). */
export function normalizeRevisionGraph(raw: unknown): RevisionGraph {
  if (!raw || typeof raw !== 'object') return emptyRevisionGraph();
  const g = raw as Partial<RevisionGraph>;
  return {
    concerns: Array.isArray(g.concerns) ? g.concerns : [],
    links: Array.isArray(g.links) ? g.links : [],
    dismissedSuggestions: Array.isArray(g.dismissedSuggestions) ? g.dismissedSuggestions : [],
    updatedAt: typeof g.updatedAt === 'number' ? g.updatedAt : 0,
  };
}

const genId = () => `rc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function touch(graph: RevisionGraph, now: number): RevisionGraph {
  return { ...graph, updatedAt: now };
}

export interface CreateConcernInput {
  manuscriptId: string;
  title: string;
  kind: ConcernKind;
  summary?: string;
  term?: string;             // required when kind === 'sweep'
  annotationIds?: string[];  // initial members (author marks only; others skipped)
}

/** Create a concern (optionally with initial members) — the ratify path and the
 *  by-hand path are the same operation. Returns the new graph and the concern. */
export function createConcern(
  graph: RevisionGraph,
  input: CreateConcernInput,
  annotations: Annotation[],
  now: number = Date.now(),
): { graph: RevisionGraph; concern: RevisionConcern } {
  const concern: RevisionConcern = {
    id: genId(),
    manuscriptId: input.manuscriptId,
    title: input.title.trim() || 'Untitled concern',
    summary: input.summary?.trim() || undefined,
    kind: input.kind,
    term: input.kind === 'sweep' ? (input.term ?? '').trim() || undefined : undefined,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  let next: RevisionGraph = { ...graph, concerns: [...graph.concerns, concern] };
  if (input.annotationIds?.length) {
    next = linkAnnotations(next, concern.id, input.annotationIds, annotations, now).graph;
  }
  return { graph: touch(next, now), concern };
}

export function updateConcern(
  graph: RevisionGraph,
  concernId: string,
  patch: Partial<Pick<RevisionConcern, 'title' | 'summary' | 'term' | 'status'>>,
  now: number = Date.now(),
): RevisionGraph {
  const concerns = graph.concerns.map(c => {
    if (c.id !== concernId) return c;
    const status: ConcernStatus = patch.status ?? c.status;
    return {
      ...c,
      ...patch,
      status,
      updatedAt: now,
      // Stamp resolution time on the flip to 'resolved'; clear it on reopen.
      resolvedAt: status === 'resolved' ? (c.status === 'resolved' ? c.resolvedAt : now) : undefined,
    };
  });
  return touch({ ...graph, concerns }, now);
}

/** Remove a concern and every link that references it. */
export function deleteConcern(graph: RevisionGraph, concernId: string, now: number = Date.now()): RevisionGraph {
  return touch({
    ...graph,
    concerns: graph.concerns.filter(c => c.id !== concernId),
    links: graph.links.filter(l => l.concernId !== concernId),
  }, now);
}

/** Link author annotations to a concern. Non-author ids, unknown ids, and
 *  already-linked ids are skipped silently (idempotent). */
export function linkAnnotations(
  graph: RevisionGraph,
  concernId: string,
  annotationIds: string[],
  annotations: Annotation[],
  now: number = Date.now(),
): { graph: RevisionGraph; added: ConcernAnnotationLink[] } {
  if (!graph.concerns.some(c => c.id === concernId)) return { graph, added: [] };
  const authorIds = new Set(annotations.filter(isAuthorAnnotation).map(a => a.id));
  const existing = new Set(graph.links.filter(l => l.concernId === concernId).map(l => l.annotationId));
  const added: ConcernAnnotationLink[] = [];
  for (const id of annotationIds) {
    if (!authorIds.has(id) || existing.has(id)) continue;
    existing.add(id);
    added.push({ id: genId(), concernId, annotationId: id, createdAt: now });
  }
  if (!added.length) return { graph, added };
  return { graph: touch({ ...graph, links: [...graph.links, ...added] }, now), added };
}

export function unlinkAnnotation(graph: RevisionGraph, concernId: string, annotationId: string, now: number = Date.now()): RevisionGraph {
  const links = graph.links.filter(l => !(l.concernId === concernId && l.annotationId === annotationId));
  if (links.length === graph.links.length) return graph;
  return touch({ ...graph, links }, now);
}

/** Per-concern resolution: flips ONE membership, never Annotation.status. */
export function setLinkStatus(
  graph: RevisionGraph,
  concernId: string,
  annotationId: string,
  status: 'open' | 'resolved',
  now: number = Date.now(),
): RevisionGraph {
  const links = graph.links.map(l =>
    l.concernId === concernId && l.annotationId === annotationId
      ? { ...l, status, resolvedAt: status === 'resolved' ? (l.status === 'resolved' ? l.resolvedAt : now) : undefined }
      : l,
  );
  return touch({ ...graph, links }, now);
}

/** Record a suggestion as answered (ratified or dismissed) so triage never
 *  re-asks. Keyed on the basis signature, not membership. */
export function recordSuggestionHandled(graph: RevisionGraph, signature: string, now: number = Date.now()): RevisionGraph {
  if (graph.dismissedSuggestions.includes(signature)) return graph;
  return touch({ ...graph, dismissedSuggestions: [...graph.dismissedSuggestions, signature] }, now);
}

/** Ratify a suggestion and settle its signature in one step. New-thread
 *  suggestions create the concern with its members (`title` lets the author
 *  rename before accepting); addition suggestions (`addToConcernId`) link the
 *  marks into the existing thread instead. */
export function ratifySuggestion(
  graph: RevisionGraph,
  suggestion: ConcernSuggestion,
  manuscriptId: string,
  annotations: Annotation[],
  title?: string,
  now: number = Date.now(),
): { graph: RevisionGraph; concern: RevisionConcern | null } {
  if (suggestion.addToConcernId) {
    const target = graph.concerns.find(c => c.id === suggestion.addToConcernId) ?? null;
    const linked = linkAnnotations(graph, suggestion.addToConcernId, suggestion.annotationIds, annotations, now);
    return { graph: recordSuggestionHandled(linked.graph, suggestion.signature, now), concern: target };
  }
  const created = createConcern(graph, {
    manuscriptId,
    title: title ?? suggestion.suggestedTitle,
    kind: suggestion.kind,
    term: suggestion.term,
    annotationIds: suggestion.annotationIds,
  }, annotations, now);
  return { graph: recordSuggestionHandled(created.graph, suggestion.signature, now), concern: created.concern };
}

/** Structural invariants, as human-readable problems (empty array = valid).
 *  Used by the harness and by import paths before accepting a foreign graph. */
export function validateRevisionGraph(graph: RevisionGraph, annotations: Annotation[]): string[] {
  const problems: string[] = [];
  const concernIds = new Set<string>();
  for (const c of graph.concerns) {
    if (concernIds.has(c.id)) problems.push(`duplicate concern id ${c.id}`);
    concernIds.add(c.id);
    if (c.kind === 'sweep' && !c.term) problems.push(`sweep concern ${c.id} has no term`);
  }
  const byId = new Map(annotations.map(a => [a.id, a]));
  const seen = new Set<string>();
  for (const l of graph.links) {
    const pair = `${l.concernId}|${l.annotationId}`;
    if (seen.has(pair)) problems.push(`duplicate link ${pair}`);
    seen.add(pair);
    if (!concernIds.has(l.concernId)) problems.push(`link ${l.id} references missing concern ${l.concernId}`);
    const ann = byId.get(l.annotationId);
    if (!ann) problems.push(`link ${l.id} references missing annotation ${l.annotationId}`);
    else if (!isAuthorAnnotation(ann)) problems.push(`link ${l.id} references a READER annotation ${l.annotationId} (author-only in v1)`);
  }
  return problems;
}
