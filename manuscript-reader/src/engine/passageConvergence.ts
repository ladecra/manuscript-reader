// ─── Passage convergence — the report's passage-level pass ────────────────────
//
// The net-new resolution the report brief asks for: turn a pile of annotations
// into PASSAGES where DISTINCT readers landed on the same lines — not merely the
// same chapter (which `readerAgreement` already gives). Pure and deterministic:
// a function of the marks the engine already stores. Same marks in → same
// convergences out. No model, no text inference.
//
// Method (five-pass spec; passes 1–3 are the net-new core here):
//   1. Convergence — bucket marks to the structural block (paragraph) they fall in,
//      across DISTINCT reader identities. Two readers on one block = signal; one
//      reader marking twice = not. Proximity unit = the structural block, because
//      `TextAnchor.offset` is "a hint, not a guarantee" and anchors re-locate by
//      quote — so we resolve each mark to its block by quote-match, and degrade to
//      chapter (contributing nothing to this passage layer) when it won't resolve.
//   2. Valence — the deterministic TYPE signature of the convergence (warm/cool/
//      divided), NOT an asserted emotion. A bare highlight is attention of
//      unasserted polarity; copy says "leaned in", never "loved".
//   3. Consensus vs one voice — ≥2 distinct readers is the rankable "room"; a lone
//      reaction is kept and shown (soloPassages) but never ranked, never counted
//      as agreement.
// Passes 4 (reach-aware silence) and 5 (attention/abandonment) stay at their
// existing chapter granularity in EditorialSignals — not the resolution gap.

import type {
  Annotation, AnnotationType, ManuscriptStructure, StructuralBlock, PassageConvergence, ConvergenceValence, ReaderSession,
} from './types';
import { DEVELOPMENTAL_TYPES, isReaderAnnotation } from './types';

/** Prose blocks a reader can mark within (headings/scene-breaks excluded). */
const TEXT_ROLES = new Set<StructuralBlock['role']>(['paragraph', 'blockquote', 'list', 'subheading']);
/** Concern-class annotation types (the editorial-flag vocabulary). */
const CONCERN_TYPES = new Set<AnnotationType>(DEVELOPMENTAL_TYPES);
/** Reaction-class types. Bookmarks are private navigation — excluded entirely. */
const REACTION_TYPES = new Set<AnnotationType>(['highlight', 'note']);
/** A convergence is the room at ≥2 distinct readers (the definition of agreement). */
const ROOM_MIN_READERS = 2;
/** v2 beat merge: fold consecutive marked paragraphs into ONE beat. A gap of 1
 *  means "truly adjacent" — a scene-break block carries no paragraph ordinal, so
 *  paragraphs either side of a break are adjacent here. We never bridge an
 *  unmarked paragraph (that risks swallowing a whole scene). Span caps the beat. */
const MERGE_MAX_GAP = 1;
const MERGE_MAX_SPAN = 2; // start→last ordinal distance ≤2 ⇒ at most 3 paragraphs
/** Progress tolerance when deciding a reader reached a passage (word-fraction). */
const REACH_EPS = 0.02;
/** Divided: the minority class is ≥30% of the marks AND carried by ≥2 readers —
 *  below that it's the dominant valence with noise, not a genuine split. */
const DIVIDED_MIN_SHARE = 0.3;
const DIVIDED_MIN_MINORITY_READERS = 2;

/** Stable beta-reader identity (mirrors report.ts) — keys agreement on the durable
 *  readerId, falling back to the name; null for the author's own marks so they
 *  never inflate the room. */
function readerIdentity(a: Annotation): string | null {
  if (a.readerId) return 'id:' + a.readerId;
  if (a.readerName) return 'name:' + a.readerName;
  return null;
}

const norm = (s: string | undefined | null): string => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Resolve one annotation to the structural block (paragraph) it falls in, by
 * quote-match within its chapter. Returns null when the quote resolves to no
 * single block (edited away, or it spans a paragraph break) — the caller then
 * degrades it to the chapter, out of this passage layer. Pure.
 */
export function resolveAnchorToBlock(ann: Annotation, chapterBlocks: StructuralBlock[]): StructuralBlock | null {
  const q = norm(ann.quote);
  if (!q) return null;
  const candidates = chapterBlocks.filter(b => TEXT_ROLES.has(b.role) && norm(b.text).includes(q));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Ambiguous: the same sentence appears in more than one block of the chapter.
  // Disambiguate with the anchor's surrounding context (prefix/suffix), then fall
  // back to the earliest block so the result is still deterministic.
  const prefix = norm(ann.anchor?.prefix ?? '');
  const suffix = norm(ann.anchor?.suffix ?? '');
  if (prefix || suffix) {
    const ctxMatch = candidates.find(b => {
      const t = norm(b.text);
      return (prefix && t.includes(prefix + ' ' + q)) || (suffix && t.includes(q + ' ' + suffix));
    });
    if (ctxMatch) return ctxMatch;
  }
  return [...candidates].sort((a, b) => a.sourceStart - b.sourceStart)[0];
}

export interface PassageConvergenceResult {
  passageConvergences: PassageConvergence[]; // the room (≥2 distinct readers), ranked
  soloPassages: PassageConvergence[];        // one voice (1 reader, concern) — shown, never ranked
}

const EMPTY: PassageConvergenceResult = { passageConvergences: [], soloPassages: [] };

/** A beat: one or more consecutive marked paragraphs, folded by the v2 merge. */
interface Beat {
  chapterIndex: number;
  chapterTitle: string;
  startOrdinal: number;
  endOrdinal: number;
  firstSourceStart: number; // stable id + earliest position in the beat
  startFraction: number;    // word-position of the beat's start (for reach)
  anns: Annotation[];
}

/**
 * Build passage convergences from reader annotations against the structural model.
 * Returns empty when there's no structure to resolve against (no source markdown)
 * — the report degrades to chapter-level agreement then. `sessions` (reader
 * progress) make the "N of M" denominators reach-aware; without them the pass
 * still runs and falls back to the total reader pool.
 */
export function buildPassageConvergences(
  annotations: Annotation[],
  structure: ManuscriptStructure | null,
  sessions: ReaderSession[] = [],
): PassageConvergenceResult {
  if (!structure) return EMPTY;

  // Word-position of every block start, as a fraction of the whole manuscript —
  // the coordinate reader `progress` lives in, so we can ask "did this reader
  // reach this passage?". Computed over the full document-order substrate.
  const startFractionBySource = blockStartFractions(structure);

  // Chapter index → its text-bearing blocks (with a 1-based paragraph ordinal).
  const blocksByChapter = new Map<number, StructuralBlock[]>();
  const ordinalByKey = new Map<string, number>();
  for (const ch of structure.chapters) {
    const textBlocks = ch.blocks.filter(b => TEXT_ROLES.has(b.role));
    blocksByChapter.set(ch.index, textBlocks);
    textBlocks.forEach((b, i) => ordinalByKey.set(`${ch.index}:${b.sourceStart}`, i + 1));
  }

  // Reader marks only (the author is one reader; their marks are revision intent,
  // never the room), bookmarks excluded (private nav).
  const marks = annotations.filter(a => isReaderAnnotation(a) && a.type !== 'bookmark');

  // Resolve each mark to a paragraph. Marks that don't resolve are dropped from
  // this layer (they remain in chapter-level agreement).
  interface Resolved { ann: Annotation; block: StructuralBlock; ordinal: number; }
  const byChapter = new Map<number, Resolved[]>();
  for (const ann of marks) {
    const chBlocks = blocksByChapter.get(ann.chapterIndex);
    if (!chBlocks || chBlocks.length === 0) continue;
    const block = resolveAnchorToBlock(ann, chBlocks);
    if (!block) continue;
    const ordinal = ordinalByKey.get(`${ann.chapterIndex}:${block.sourceStart}`) ?? 0;
    (byChapter.get(ann.chapterIndex) ?? byChapter.set(ann.chapterIndex, []).get(ann.chapterIndex)!)
      .push({ ann, block, ordinal });
  }

  // v2 beat merge: within each chapter, fold consecutive marked paragraphs into
  // beats (adjacent only, capped span) so a reaction spread across a beat reads as
  // one convergence, not several. First group by block, then greedily merge.
  const beats: Beat[] = [];
  for (const [chapterIndex, resolved] of byChapter) {
    const byBlock = new Map<number, Resolved[]>();
    for (const r of resolved) (byBlock.get(r.ordinal) ?? byBlock.set(r.ordinal, []).get(r.ordinal)!).push(r);
    const ordinals = [...byBlock.keys()].sort((a, b) => a - b);

    let cur: Beat | null = null;
    for (const ord of ordinals) {
      const rs = byBlock.get(ord)!;
      const first = rs.reduce((m, r) => (r.block.sourceStart < m.block.sourceStart ? r : m), rs[0]);
      if (cur && ord - cur.endOrdinal <= MERGE_MAX_GAP && ord - cur.startOrdinal <= MERGE_MAX_SPAN) {
        cur.endOrdinal = ord;
        cur.anns.push(...rs.map(r => r.ann));
      } else {
        if (cur) beats.push(cur);
        cur = {
          chapterIndex, chapterTitle: rs[0].ann.chapterTitle,
          startOrdinal: ord, endOrdinal: ord,
          firstSourceStart: first.block.sourceStart,
          startFraction: startFractionBySource.get(first.block.sourceStart) ?? 0,
          anns: rs.map(r => r.ann),
        };
      }
    }
    if (cur) beats.push(cur);
  }

  // Reach: which readers got to each passage (session progress ≥ its position).
  const sessionProgress = new Map<string, number>();
  for (const s of sessions) if (s.readerId) sessionProgress.set('id:' + s.readerId, s.progress);
  const hasProgress = sessionProgress.size > 0;
  const poolSize = new Set(marks.map(readerIdentity).filter(Boolean)).size;

  const room: PassageConvergence[] = [];
  const solo: PassageConvergence[] = [];
  for (const beat of beats) {
    const conv = buildConvergence(beat, sessionProgress, hasProgress, poolSize);
    if (conv.readerCount >= ROOM_MIN_READERS) room.push(conv);
    else if (conv.concernMarks >= 1) solo.push(conv); // one thoughtful voice (reaction-only solo = taste, dropped)
  }

  // Rank the room: how much of it corroborates (distinct readers) first, then
  // severity (a concern-bearing passage outranks pure warmth), then how early it
  // lands. Deterministic total order (id breaks any remaining tie).
  room.sort((a, b) =>
    b.readerCount - a.readerCount ||
    Number(b.concernReaders > 0) - Number(a.concernReaders > 0) ||
    a.chapterIndex - b.chapterIndex ||
    a.blockOrdinal - b.blockOrdinal ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // One voice: most concern first, then earliest.
  solo.sort((a, b) =>
    b.concernMarks - a.concernMarks ||
    a.chapterIndex - b.chapterIndex ||
    a.blockOrdinal - b.blockOrdinal ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { passageConvergences: room, soloPassages: solo };
}

/** Word-position of each block's start as a fraction of the whole manuscript. */
function blockStartFractions(structure: ManuscriptStructure): Map<number, number> {
  const words = (t: string) => (t ? t.trim().split(/\s+/).filter(Boolean).length : 0);
  const total = structure.blocks.reduce((s, b) => s + words(b.text), 0) || 1;
  const map = new Map<number, number>();
  let acc = 0;
  for (const b of structure.blocks) {
    map.set(b.sourceStart, acc / total);
    acc += words(b.text);
  }
  return map;
}

function buildConvergence(
  beat: Beat, sessionProgress: Map<string, number>, hasProgress: boolean, poolSize: number,
): PassageConvergence {
  // Order marks for display by anchor offset (a hint), then creation time.
  const ordered = [...beat.anns].sort((a, b) => (a.anchor?.offset ?? 0) - (b.anchor?.offset ?? 0) || a.createdAt - b.createdAt);

  const identities = new Map<string, string>(); // identity → display name (first non-empty wins)
  const reactionIds = new Set<string>();
  const concernIds = new Set<string>();
  let reactionMarks = 0, concernMarks = 0;
  for (const a of ordered) {
    const id = readerIdentity(a);
    if (id && !identities.has(id)) identities.set(id, a.readerName || 'Reader');
    const isConcern = CONCERN_TYPES.has(a.type);
    const isReaction = REACTION_TYPES.has(a.type);
    if (isConcern) { concernMarks++; if (id) concernIds.add(id); }
    else if (isReaction) { reactionMarks++; if (id) reactionIds.add(id); }
  }

  const valence = classifyValence(reactionMarks, concernMarks, reactionIds.size, concernIds.size);
  // Representative sentence: prefer a concern mark on a cool/divided passage (the
  // thing to look at), else the earliest mark — either way an exact reader quote.
  const rep = valence === 'warm'
    ? ordered[0]
    : (ordered.find(a => CONCERN_TYPES.has(a.type)) ?? ordered[0]);

  // Reach-aware denominator: readers who converged here plus any reader whose
  // session progress reached the beat's start. Falls back to the whole mark pool
  // when there's no progress data (can't prove reach, so don't shrink it).
  let readersReached: number;
  if (hasProgress) {
    const reached = new Set(identities.keys());
    for (const [id, prog] of sessionProgress) if (prog >= beat.startFraction - REACH_EPS) reached.add(id);
    readersReached = Math.max(reached.size, identities.size);
  } else {
    readersReached = Math.max(poolSize, identities.size);
  }

  return {
    id: `conv-${beat.chapterIndex}:${beat.firstSourceStart}`,
    chapterIndex: beat.chapterIndex,
    chapterTitle: beat.chapterTitle,
    blockKey: String(beat.firstSourceStart),
    blockOrdinal: beat.startOrdinal,
    blockOrdinalEnd: beat.endOrdinal > beat.startOrdinal ? beat.endOrdinal : undefined,
    readersReached,
    quote: rep.quote,
    valence,
    readerCount: identities.size,
    readerNames: [...identities.values()],
    annotationIds: ordered.map(a => a.id),
    reactionMarks,
    concernMarks,
    reactionReaders: reactionIds.size,
    concernReaders: concernIds.size,
  };
}

/** The deterministic type signature (brief pass 2 + resolved decision 3). Warm
 *  requires NO concern present; cool = concern present but not a genuine split;
 *  divided = both classes, minority ≥30% of marks AND ≥2 readers. */
export function classifyValence(
  reactionMarks: number, concernMarks: number, reactionReaders: number, concernReaders: number,
): ConvergenceValence {
  const total = reactionMarks + concernMarks;
  if (total === 0) return 'warm';
  if (reactionMarks > 0 && concernMarks > 0) {
    const minorityShare = Math.min(reactionMarks, concernMarks) / total;
    const minorityReaders = Math.min(reactionReaders, concernReaders);
    if (minorityShare >= DIVIDED_MIN_SHARE && minorityReaders >= DIVIDED_MIN_MINORITY_READERS) return 'divided';
  }
  return concernMarks > 0 ? 'cool' : 'warm';
}
