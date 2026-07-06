// ─── Deterministic concern suggestions (the triage substrate) ──────────────────
// Proposes actions on AUTHOR marks for the author to ratify or dismiss. No
// models, no embeddings — transparent detectors with thresholds that keep the
// strip quiet, and a `basis` string that states exactly why:
//
//   1. Thread magnets: an EXISTING thread attracts new marks matching its
//      signals (title/entity/shared-term, matched against note AND quote) —
//      proposed as one-tap additions. This is the steady-state detector: once
//      an author has threads, most suggestions are additions, not new threads.
//   2. Shared mid-sentence proper nouns → new-thread suggestions.
//   3. Shared salient note terms → new-thread suggestions.
//   4. Bare word-flags (a one/two-word mark with no note — the author's
//      cheapest gesture, meaning "instance of a known issue") consolidate into
//      ONE watch-list suggestion, never one card per word. The flagged TYPE of
//      issue is the author's to name; the engine only offers to collect the
//      instances (per-mark manuscript-wide counts render inside the thread).
//
// Nothing is auto-filed: output is ConcernSuggestion[], and a signature the
// author has already answered (ratified or dismissed) is never re-asked.
// Reader annotations never enter — this layer is author intent only.

import type { Annotation, ConcernSuggestion, RevisionConcern, RevisionGraph } from '../types';
import { isAuthorAnnotation } from '../types';

const STOPWORDS = new Set([
  'a', 'about', 'above', 'add', 'after', 'again', 'all', 'also', 'an', 'and', 'any', 'arc', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'better', 'between', 'both', 'but', 'by', 'can', 'chapter', 'could',
  'did', 'do', 'does', 'down', 'each', 'earlier', 'either', 'else', 'elsewhere', 'few', 'for', 'from',
  'given', 'had', 'has', 'have', 'her', 'here', 'hers', 'him', 'his', 'how', 'if', 'in', 'into', 'is',
  'it', 'its', 'just', 'like', 'make', 'makes', 'many', 'maybe', 'more', 'most', 'much', 'need', 'needs',
  'no', 'not', 'now', 'of', 'off', 'on', 'one', 'only', 'or', 'other', 'our', 'out', 'over', 'own',
  'page', 'per', 'previously', 'reader', 'really', 'same', 'scene', 'she', 'should', 'similar', 'since',
  'so', 'some', 'still', 'such', 'sure', 'than', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'use', 'very',
  'was', 'we', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with',
  'without', 'word', 'work', 'would', 'you', 'your',
]);

const MIN_TERM_MEMBERS = 3;    // notes sharing a term before we ask
const MIN_ENTITY_MEMBERS = 2;  // notes naming the same entity before we ask
const MIN_BARE_FLAGS = 2;      // bare word-flags before the watch-list card appears
const MAX_ADDITIONS = 4;       // addition cards per pass (steady-state stays a strip)
const MAX_SUGGESTIONS = 8;     // the whole strip stays a strip, not a backlog
const MAX_SWEEP_WORDS = 2;     // "a word or two" — the bare-flag gesture

/** Salience fold: lowercase, possessive strip, light plural strip — so
 *  Elara's/Elara and detail/details group. */
function fold(token: string): string {
  const t = token.toLowerCase().replace(/['’]s?$/, '');
  return t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t;
}

const titleCase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Salient terms of a note: word tokens, stopword-stripped, length ≥ 4, folded. */
function salientTerms(note: string): Set<string> {
  const out = new Set<string>();
  for (const m of note.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
    const folded = fold(m[0]);
    if (folded.length >= 4 && !STOPWORDS.has(folded)) out.add(folded);
  }
  return out;
}

/** Capitalized tokens that are NOT sentence-initial — cheap proper-noun signal.
 *  Returns folded-lowercase entity keys (possessives folded: Elara's → elara). */
function midSentenceEntities(note: string): Set<string> {
  const out = new Set<string>();
  for (const m of note.matchAll(/[A-Z][a-z'’-]{2,}/g)) {
    // Sentence-initial if nothing but whitespace/quotes since start or since .!?:;— or newline.
    const before = note.slice(0, m.index).replace(/["'“”‘’)\]]+$/, '').trimEnd();
    const sentenceInitial = before === '' || /[.!?:;—\n-]$/.test(before);
    if (sentenceInitial) continue;
    const k = m[0].toLowerCase().replace(/['’]s?$/, '');
    if (k.length >= 3 && !STOPWORDS.has(k)) out.add(k);
  }
  return out;
}

/** Normalize a bare-flag quote into a watchable term ("without", "sigils").
 *  Rejects selection artifacts: internal sentence punctuation ("m. You"),
 *  quotes longer than the gesture, non-letter content. */
export function bareFlagTerm(quote: string): string | null {
  const term = quote.trim().replace(/^["'“”‘’.,;:!?()[\]]+|["'“”‘’.,;:!?()[\]]+$/g, '');
  if (!term || /[.!?;:]/.test(term)) return null;
  const words = term.split(/\s+/);
  if (words.length > MAX_SWEEP_WORDS) return null;
  if (!/[A-Za-z]/.test(term)) return null;
  return term;
}

/** Whole-word, case-insensitive containment (entity/term match in prose). */
function containsWord(text: string, word: string): boolean {
  if (!word) return false;
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${esc}($|[^A-Za-z0-9])`, 'i').test(text);
}

/** The signals an existing thread attracts new marks by: entity keys and
 *  salient terms drawn from its TITLE and from what its members share. */
function concernSignals(
  concern: RevisionConcern,
  memberNotes: string[],
): { entities: Set<string>; terms: Set<string> } {
  const entities = new Set<string>();
  const terms = new Set<string>();
  // Title words: capitalized ⇒ entity; any non-stopword token ≥3 ⇒ term.
  for (const m of concern.title.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
    const k = m[0].toLowerCase().replace(/['’]s?$/, '');
    if (k.length < 3 || STOPWORDS.has(k)) continue;
    if (/^[A-Z]/.test(m[0])) entities.add(k);
    terms.add(fold(m[0]));
  }
  // Member signals: only what ≥2 members share (or the sole member's, when one).
  const need = memberNotes.length >= 2 ? 2 : 1;
  const entityCounts = new Map<string, number>();
  const termCounts = new Map<string, number>();
  for (const note of memberNotes) {
    for (const e of midSentenceEntities(note)) entityCounts.set(e, (entityCounts.get(e) ?? 0) + 1);
    for (const t of salientTerms(note)) termCounts.set(t, (termCounts.get(t) ?? 0) + 1);
  }
  for (const [e, n] of entityCounts) if (n >= need) entities.add(e);
  for (const [t, n] of termCounts) if (n >= need) terms.add(t);
  return { entities, terms };
}

/**
 * Compute the current suggestion strip. Pure and idempotent: same annotations +
 * graph in, same suggestions out. The graph filters out questions the author
 * already answered (dismissedSuggestions), concerns that already exist, and
 * groupings whose members already live together in one concern.
 */
export function suggestConcernGroups(annotations: Annotation[], graph: RevisionGraph): ConcernSuggestion[] {
  const author = annotations.filter(isAuthorAnnotation);
  const answered = new Set(graph.dismissedSuggestions);
  const existingTitles = new Set(graph.concerns.map(c => c.title.toLowerCase()));
  const linkedByAnn = new Map<string, Set<string>>();
  const membersByConcern = new Map<string, Set<string>>();
  for (const l of graph.links) {
    (linkedByAnn.get(l.annotationId) ?? linkedByAnn.set(l.annotationId, new Set()).get(l.annotationId)!).add(l.concernId);
    (membersByConcern.get(l.concernId) ?? membersByConcern.set(l.concernId, new Set()).get(l.concernId)!).add(l.annotationId);
  }
  /** A grouping is settled in practice when one existing concern already holds
   *  a MAJORITY of the proposed members — the stragglers are the addition
   *  detector's job, so proposing a near-duplicate NEW thread is pure noise. */
  const alreadyGrouped = (ids: string[]) =>
    [...membersByConcern.values()].some(set => ids.filter(id => set.has(id)).length > ids.length / 2);

  const out: ConcernSuggestion[] = [];
  const emittedMemberSets: Set<string>[] = [];
  const emit = (s: ConcernSuggestion) => {
    if (answered.has(s.signature)) return;
    if (!s.addToConcernId && existingTitles.has(s.suggestedTitle.toLowerCase())) return;
    if (!s.addToConcernId && s.annotationIds.length && alreadyGrouped(s.annotationIds)) return;
    // Skip near-duplicate new-thread groups: subset of an emitted member set.
    if (!s.addToConcernId && emittedMemberSets.some(prev => s.annotationIds.every(id => prev.has(id)))) return;
    out.push(s);
    if (!s.addToConcernId) emittedMemberSets.push(new Set(s.annotationIds));
  };

  const annById = new Map(author.map(a => [a.id, a]));

  // ── Detector 1: thread magnets — additions to existing ACTIVE threads ────────
  // One card per (concern, mark) pair: declining one mark never silences a
  // future, different match, and ratifying an entity thread earlier never
  // blocks its growth (the new-thread signature stays settled; additions
  // flow through here instead).
  let additions = 0;
  for (const concern of graph.concerns) {
    if (concern.status !== 'active') continue;
    const memberIds = membersByConcern.get(concern.id) ?? new Set<string>();
    const memberNotes = [...memberIds]
      .map(id => annById.get(id)?.note ?? '')
      .filter(n => n.trim().length > 0);
    const signals = concernSignals(concern, memberNotes);
    if (!signals.entities.size && !signals.terms.size) continue;
    for (const a of author) {
      if (additions >= MAX_ADDITIONS) break;
      if (memberIds.has(a.id)) continue;
      const signature = `add:${concern.id}:${a.id}`;
      if (answered.has(signature)) continue;
      // Entities match intent OR prose (a passage about the character counts);
      // terms match the note only (quoted prose reusing a common word is not intent).
      const proseAndNote = `${a.note ?? ''} ${a.quote ?? ''}`;
      const matchedEntity = [...signals.entities].find(e => containsWord(proseAndNote, e));
      const matchedTerm = matchedEntity ? undefined : [...salientTerms(a.note ?? '')].find(t => signals.terms.has(t));
      if (!matchedEntity && !matchedTerm) continue;
      additions++;
      emit({
        signature,
        kind: concern.kind,
        suggestedTitle: concern.title,
        basis: matchedEntity
          ? `a new mark mentions ${titleCase(matchedEntity)} — add it to this thread?`
          : `a new note shares “${matchedTerm}” — add it to this thread?`,
        annotationIds: [a.id],
        addToConcernId: concern.id,
      });
    }
  }

  // ── Detector 2 (highest precision for NEW threads): shared entities ──────────
  const byEntity = new Map<string, string[]>();
  for (const a of author) {
    if (!a.note?.trim()) continue;
    for (const e of midSentenceEntities(a.note)) {
      (byEntity.get(e) ?? byEntity.set(e, []).get(e)!).push(a.id);
    }
  }
  const entitySuggestions = [...byEntity.entries()]
    .filter(([, ids]) => ids.length >= MIN_ENTITY_MEMBERS)
    .sort((x, y) => (y[1].length - x[1].length) || x[0].localeCompare(y[0]));
  for (const [entity, ids] of entitySuggestions) {
    emit({
      signature: `entity:${entity}`,
      kind: 'group',
      suggestedTitle: titleCase(entity),
      basis: `${ids.length} notes mention ${titleCase(entity)}`,
      annotationIds: [...new Set(ids)],
    });
  }

  // ── Detector 3: shared salient note terms ────────────────────────────────────
  const byTerm = new Map<string, Set<string>>();
  for (const a of author) {
    if (!a.note?.trim()) continue;
    for (const t of salientTerms(a.note)) {
      (byTerm.get(t) ?? byTerm.set(t, new Set()).get(t)!).add(a.id);
    }
  }
  // Terms with identical member sets merge into one suggestion ("detail · setting").
  const bySetKey = new Map<string, { terms: string[]; ids: string[] }>();
  for (const [term, idSet] of byTerm) {
    if (idSet.size < MIN_TERM_MEMBERS) continue;
    const ids = [...idSet].sort();
    const key = ids.join(',');
    const entry = bySetKey.get(key) ?? { terms: [], ids };
    entry.terms.push(term);
    bySetKey.set(key, entry);
  }
  const termSuggestions = [...bySetKey.values()]
    .sort((x, y) => (y.ids.length - x.ids.length) || x.terms[0].localeCompare(y.terms[0]));
  for (const { terms, ids } of termSuggestions) {
    const sorted = [...terms].sort();
    const shown = sorted.slice(0, 3);
    emit({
      signature: `terms:${sorted.join('+')}`,
      kind: 'group',
      suggestedTitle: shown.map(titleCase).join(' · '),
      basis: `${ids.length} notes share ${shown.map(t => `“${t}”`).join(', ')}`,
      annotationIds: ids,
    });
  }

  // ── Detector 4: bare word-flags → ONE consolidated watch-list card ───────────
  // The flagged word is an INSTANCE of an issue only the author can name
  // (an overused adverb, a fragment habit) — so the engine never proposes
  // tracking any single word. It offers, once, to collect the instances;
  // occurrence counts render per mark inside the thread.
  const bareFlags: { term: string; id: string }[] = [];
  for (const a of author) {
    if (a.note?.trim()) continue;
    if (linkedByAnn.has(a.id)) continue; // already filed somewhere
    const term = bareFlagTerm(a.quote);
    if (term) bareFlags.push({ term, id: a.id });
  }
  if (bareFlags.length >= MIN_BARE_FLAGS) {
    const terms = [...new Set(bareFlags.map(f => f.term.toLowerCase()))].sort();
    const shown = bareFlags.slice(0, 4).map(f => `“${f.term}”`).join(', ');
    emit({
      signature: `bareflags:${terms.join('+')}`,
      kind: 'group',
      suggestedTitle: 'Watch list',
      basis: `${bareFlags.length} words flagged with no note (${shown}${bareFlags.length > 4 ? ', …' : ''}) — collect them in one thread?`,
      annotationIds: bareFlags.map(f => f.id),
    });
  }

  return out.slice(0, MAX_SUGGESTIONS);
}
