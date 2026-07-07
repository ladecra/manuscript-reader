// ─── Revision concerns check (golden-file + assertions) ──────────────────────
// Runs the real concern engine (suggestConcernGroups → ratify → termSweep →
// computeConcernAnalytics → buildRevisionContextMarkdown) over a synthetic
// batch modeled on the live dogfood annotations, and asserts the contracts the
// hub triage strip + REVISION_CONTEXT.md export depend on:
//   • shared-entity and shared-term clusters are proposed; reader marks never are
//   • bare word-flags consolidate into ONE watch-list card (never one per word);
//     selection artifacts ("m. You") are rejected
//   • ratified threads act as MAGNETS: new marks matching a thread's signals
//     (note or quote) are proposed as one-tap additions
//   • dismissed/ratified signatures are never re-asked (triage stays quiet)
//   • many-to-many membership; per-LINK resolution; validators reject bad graphs
//   • the context export is first-class with ZERO concerns
//   Run with: npm run check-revision
import {
  createConcern, deleteConcern, linkAnnotations, ratifySuggestion,
  recordSuggestionHandled, setLinkStatus, emptyRevisionGraph, validateRevisionGraph,
} from '../src/engine/concerns/revisionGraph.ts';
import { suggestConcernGroups, bareFlagTerm } from '../src/engine/concerns/suggestGroups.ts';
import { sweepTerm } from '../src/engine/concerns/termSweep.ts';
import { computeConcernAnalytics } from '../src/engine/concerns/concernAnalytics.ts';
import { buildRevisionContextMarkdown } from '../src/engine/exports/revisionContext.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

const DAY = 86_400_000;
const NOW = 1_800_000_000_000; // fixed clock — ages are exact

// ── Fixture manuscript: three chapters with known "without" densities ─────────
const md = [
  '# The Trial',
  'We had drawn our lots without speaking. The chamber was cold without the braziers lit, and I stood without moving. Not withoutward, though — that word must not count.',
  '# The Ring',
  'Heat flattened against my skin. I entered without hesitation.',
  '# The Verdict',
  'No one replied. We knew better than to answer.',
].join('\n\n');

// ── Fixture annotations, modeled on the live Ch. 01 batch ─────────────────────
const ann = (id, type, quote, note, chapterIndex, extra = {}) => ({
  id, type, quote, note, chapterTitle: '', chapterIndex, createdAt: NOW - 10 * DAY, readerName: null, ...extra,
});
const annotations = [
  // Three notes sharing salient terms (detail / specificity / describe → "detail" x3)
  ann('a1', 'note', 'six of us stood in a line', 'Add more visual detail. What detail of the hall expresses the mood? More material detail throughout.', 1),
  ann('a2', 'note', 'his shirt open to the sternum', 'Could expand, add specificity? More detail about his life and his detail-starved world.', 1),
  ann('a3', 'question', 'the chalk ring', 'Needs environmental detail — thermal detail, sensory detail of the ring.', 2),
  // Three notes naming Elara mid-sentence (one possessive)
  ann('a4', 'note', 'take the pulse', 'Is this what Elara’s fate would be without access?', 1),
  ann('a5', 'continuity', 'Harvest week. Three months.', 'Why is this ending in termination when Elara has been stable for years?', 2),
  ann('a6', 'question', 'stable thanks to solvent', 'Does the solvent timeline match what we said about Elara in the opening?', 3),
  // Bare word-flags → ONE watch-list gesture (never one card per word)
  ann('a7', 'bookmark', 'without', '', 1),
  ann('a9', 'voice', 'worse', '', 2),
  // Selection artifact (sentence-boundary fragment) — must never become a term
  ann('a10', 'bookmark', 'm. You', '', 1),
  // Bare full-sentence highlight → NOT a flag (a keeper line, not a word flag)
  ann('a8', 'highlight', 'No one replied. We knew better.', '', 3),
  // A READER's notes that would otherwise cluster — must never enter suggestions
  ann('r1', 'note', 'the gallery', 'More detail here would help.', 1, { readerName: 'Sam', readerId: 'sam-1' }),
  ann('r2', 'note', 'the ring', 'Elara is my favorite. Elara deserves more detail.', 2, { readerName: 'Sam', readerId: 'sam-1' }),
];

// ── CASE 1: suggestions from the dogfood batch ────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: suggestion strip over the dogfood batch');
let graph = emptyRevisionGraph();
let suggestions = suggestConcernGroups(annotations, graph);
for (const s of suggestions) console.log(`    [${s.addToConcernId ? 'add' : s.kind}] ${s.suggestedTitle} — ${s.basis} (${s.signature})`);

const entitySug = suggestions.find(s => s.signature === 'entity:elara');
const termSug = suggestions.find(s => s.signature.startsWith('terms:') && s.signature.includes('detail'));
const watchSug = suggestions.find(s => s.signature.startsWith('bareflags:'));
check('entity cluster proposed (Elara, incl. possessive fold)', !!entitySug && entitySug.annotationIds.length === 3);
check('entity members are exactly the author Elara notes', !!entitySug && ['a4', 'a5', 'a6'].every(id => entitySug.annotationIds.includes(id)));
check('term cluster proposed (detail ×3 author notes)', !!termSug && termSug.annotationIds.length === 3);
check('bare flags consolidate into ONE watch-list card', !!watchSug && suggestions.filter(s => s.signature.startsWith('bareflags:')).length === 1);
check('watch list holds both flags, no per-word cards', !!watchSug && watchSug.annotationIds.length === 2
  && ['a7', 'a9'].every(id => watchSug.annotationIds.includes(id)));
check('selection artifact “m. You” rejected as a term', bareFlagTerm('m. You') === null && !watchSug.annotationIds.includes('a10'));
check('full-sentence bare highlight is NOT a flag', !watchSug.annotationIds.includes('a8'));
check('reader marks never appear in any suggestion', suggestions.every(s => !s.annotationIds.some(id => id.startsWith('r'))));
check('every suggestion states its basis', suggestions.every(s => s.basis.length > 0));
check('no per-word sweep suggestions exist', suggestions.every(s => !s.term));

// ── CASE 2: triage stays quiet — dismissed and ratified never re-ask ──────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: settled questions stay settled');
graph = recordSuggestionHandled(graph, termSug.signature, NOW);
const { graph: g2, concern: elara } = ratifySuggestion(graph, entitySug, 'ms-1', annotations, 'Elara’s Arc', NOW - 5 * DAY);
graph = g2;
suggestions = suggestConcernGroups(annotations, graph);
check('dismissed term cluster not re-proposed', !suggestions.some(s => s.signature === termSug.signature));
check('ratified entity cluster not re-proposed as a NEW thread', !suggestions.some(s => s.signature === 'entity:elara'));
check('watch list still offered (unanswered)', suggestions.some(s => s.signature.startsWith('bareflags:')));

// ── CASE 3: thread magnets — new marks flow into existing threads ─────────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: ratified thread attracts new matching marks');
const a11 = ann('a11', 'note', 'she paused at the threshold', 'Elara deserves a clearer motivation in this scene.', 2);
a11.createdAt = NOW - 1 * DAY;
const a12 = ann('a12', 'highlight', 'Elara stepped into the light and the room went quiet around her', '', 1);
a12.createdAt = NOW - 1 * DAY;
const annotations2 = [...annotations, a11, a12];
suggestions = suggestConcernGroups(annotations2, graph);
for (const s of suggestions) console.log(`    [${s.addToConcernId ? 'add' : s.kind}] ${s.suggestedTitle} — ${s.basis}`);
const addNote = suggestions.find(s => s.addToConcernId === elara.id && s.annotationIds.includes('a11'));
const addQuote = suggestions.find(s => s.addToConcernId === elara.id && s.annotationIds.includes('a12'));
check('new NOTE mentioning the entity → addition card', !!addNote);
check('new no-note PASSAGE naming the entity → addition card (quote matches too)', !!addQuote);
check('addition cards target the existing thread by title', !!addNote && addNote.suggestedTitle === 'Elara’s Arc');
check('no near-duplicate NEW-thread card beside the addition cards',
  !suggestions.some(s => !s.addToConcernId && s.annotationIds.filter(id => ['a4', 'a5', 'a6'].includes(id)).length >= 2));

// Ratify one addition; dismiss the other — each settles only its own pair.
graph = ratifySuggestion(graph, addNote, 'ms-1', annotations2, undefined, NOW - 1 * DAY).graph;
graph = recordSuggestionHandled(graph, addQuote.signature, NOW);
check('ratified addition is linked into the thread', graph.links.some(l => l.concernId === elara.id && l.annotationId === 'a11'));
suggestions = suggestConcernGroups(annotations2, graph);
check('neither addition re-asks after ratify/dismiss', !suggestions.some(s => s.addToConcernId === elara.id));

// A hand-created thread attracts by TITLE signals alone.
const hand = createConcern(graph, { manuscriptId: 'ms-1', title: 'Solvent timeline', kind: 'group' }, annotations2, NOW - 2 * DAY);
graph = hand.graph;
suggestions = suggestConcernGroups(annotations2, graph);
const handAdd = suggestions.filter(s => s.addToConcernId === hand.concern.id);
check('hand-created thread attracts marks via title terms (“solvent”)', handAdd.some(s => s.annotationIds.includes('a6')));
graph = deleteConcern(graph, hand.concern.id, NOW);

// ── CASE 4: graph ops — many-to-many, per-link resolution, validation ─────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: graph invariants');
check('ratified concern exists with 4 links (3 + 1 addition)', graph.links.filter(l => l.concernId === elara.id).length === 4);

// Second concern sharing a4 — many-to-many membership.
const created = createConcern(graph, {
  manuscriptId: 'ms-1', title: 'World Detail', kind: 'group', annotationIds: ['a1', 'a2', 'a3', 'a4'],
}, annotations2, NOW - 3 * DAY);
graph = created.graph;
const world = created.concern;
check('one annotation lives in two concerns (a4)', graph.links.filter(l => l.annotationId === 'a4').length === 2);

// Reader annotations are silently skipped by linkAnnotations.
graph = linkAnnotations(graph, world.id, ['r1', 'a1'], annotations2, NOW).graph;
check('reader link skipped, duplicate link skipped', graph.links.filter(l => l.concernId === world.id).length === 4);

// Per-LINK resolution: resolving a4 for World Detail leaves it open for Elara.
graph = setLinkStatus(graph, world.id, 'a4', 'resolved', NOW - 1 * DAY);
const a4world = graph.links.find(l => l.concernId === world.id && l.annotationId === 'a4');
const a4elara = graph.links.find(l => l.concernId === elara.id && l.annotationId === 'a4');
check('a4 resolved for World Detail (with resolvedAt)', a4world?.status === 'resolved' && typeof a4world?.resolvedAt === 'number');
check('a4 still open for Elara’s Arc', a4elara?.status !== 'resolved');

check('valid graph has no problems', validateRevisionGraph(graph, annotations2).length === 0);
const badGraph = {
  ...graph,
  links: [...graph.links,
    { id: 'x1', concernId: world.id, annotationId: 'r1', createdAt: NOW },        // reader link
    { id: 'x2', concernId: 'missing', annotationId: 'a1', createdAt: NOW },        // orphan concern
    { id: 'x3', concernId: world.id, annotationId: 'a1', createdAt: NOW },         // duplicate
  ],
};
const problems = validateRevisionGraph(badGraph, annotations2);
check('validator rejects reader link', problems.some(p => p.includes('READER')));
check('validator rejects orphan concern reference', problems.some(p => p.includes('missing concern')));
check('validator rejects duplicate link', problems.some(p => p.includes('duplicate link')));

const afterDelete = deleteConcern(graph, world.id, NOW);
check('deleting a concern drops its links', afterDelete.links.every(l => l.concernId !== world.id));

// ── CASE 5: term sweep — exact counts, word boundaries, chapter spread ─────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: manuscript-wide sweep of “without”');
const sweep = sweepTerm(md, 'without');
for (const ch of sweep.chapters) console.log(`    ch. ${ch.chapterIndex} (${ch.chapterTitle}) ×${ch.count}`);
check('total is exact (4 — “withoutward” excluded)', sweep.total === 4);
check('per-chapter densities: ch.1 ×3, ch.2 ×1', sweep.chapters.length === 2
  && sweep.chapters[0].chapterIndex === 1 && sweep.chapters[0].count === 3
  && sweep.chapters[1].chapterIndex === 2 && sweep.chapters[1].count === 1);
check('snippets carry context', sweep.chapters[0].snippets[0].includes('without'));
check('empty term sweeps to nothing', sweepTerm(md, '  ').total === 0);

// ── CASE 6: analytics — ages from injected clock, chapters derived ────────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: concern analytics (fixed clock)');
const ratified = ratifySuggestion(graph, { signature: 'sweep:without', kind: 'sweep', suggestedTitle: '“without”', basis: '', term: 'without', annotationIds: ['a7'] }, 'ms-1', annotations2, undefined, NOW - 2 * DAY);
graph = ratified.graph;
const analytics = computeConcernAnalytics(graph, annotations2, md, NOW);
const elaraStats = analytics.find(a => a.concernId === elara.id);
const sweepStats = analytics.find(a => a.concernId === ratified.concern.id);
for (const a of analytics) console.log(`    ${a.concernId}: ${a.linkedCount} linked, ${a.openCount} open, chs [${a.chaptersAffected.join(',')}], age ${a.ageDays}d`);
check('elara concern age is 5 days', elaraStats?.ageDays === 5);
check('oldest open link age is 10 days', elaraStats?.oldestOpenDays === 10);
check('chapters affected derived and sorted', elaraStats && elaraStats.chaptersAffected.length >= 1 && [...elaraStats.chaptersAffected].every((v, i, arr) => i === 0 || arr[i - 1] < v));
check('sweep concern carries computed extent (4 hits)', sweepStats?.sweep?.total === 4);

// ── CASE 7: REVISION_CONTEXT.md — first-class with zero concerns ──────────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: revision context export');
const zero = buildRevisionContextMarkdown({
  title: 'The Trial', annotations: annotations2, edits: [], combinedMarkdown: md, now: NOW,
});
check('zero-concern doc still has Author marks section', zero.includes('## Author marks'));
check('zero-concern doc has NO concerns section', !zero.includes('## Revision concerns'));
check('reader feedback summarized (Sam, 2 marks)', zero.includes('**Sam**') && zero.includes('2 marks'));
check('reader notes are summarized, not transcribed as author marks', !zero.includes('Elara is my favorite'));
check('deterministic with injected clock', zero === buildRevisionContextMarkdown({ title: 'The Trial', annotations: annotations2, edits: [], combinedMarkdown: md, now: NOW }));

const edits = [{
  id: 'e1', manuscriptId: 'ms-1', chapterId: 'ch-1', chapterIndex: 1, chapterTitle: 'The Trial',
  anchor: { quote: 'brochures', prefix: '', suffix: '', offset: 0 },
  originalText: 'brochures', replacementText: 'textbooks', createdAt: NOW - DAY,
}];
const full = buildRevisionContextMarkdown({
  title: 'The Trial', author: 'L. Crandall', annotations: annotations2, edits, graph, combinedMarkdown: md, now: NOW,
});
check('concerns render with title and facts', full.includes('### Elara’s Arc') && full.includes('open'));
check('sweep concern renders density line', full.includes('Manuscript-wide watch on **“without”**') && full.includes('ch. 1 ×3'));
check('edit renders before/after', full.includes('Before: brochures') && full.includes('After: textbooks'));
check('authorship preamble present (AI-facing semantics)', full.includes('no machine interpretation'));

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
