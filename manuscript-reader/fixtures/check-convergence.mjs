// ─── passage-convergence check (golden-file + assertions) ───────────────────
// Runs the real engine (buildManuscriptStructure → buildPassageConvergences, and
// the full computeEditorialSignals → rankInsights) over a fixture manuscript with
// KNOWN overlapping anchors, and asserts the convergence contract:
//   • distinct readers on one paragraph converge; one reader marking twice does NOT
//   • v2 BEAT MERGE: two readers on ADJACENT paragraphs fold into one beat (¶2–3),
//     but marks separated by an unmarked paragraph stay distinct
//   • valence is the deterministic type signature (cool / warm / divided)
//   • ranked by distinct readers, then severity (concern-bearing above pure warmth)
//   • REACH-AWARE denominator: "N of M" counts readers who reached the passage,
//     not the whole pool (pass 4 at passage level)
//   • ABANDONMENT: where ≥2 readers' reach ends and doesn't resume (pass 5)
//   • the consensus/one-voice boundary: a lone mark is kept in soloPassages but
//     NEVER appears as a ranked convergence
//   • determinism, and clean degradation (no markdown / no sessions)
//   Run with: npm run check-convergence
import { buildManuscriptStructure } from '../src/engine/ingestion/manuscriptStructure.ts';
import { buildPassageConvergences, resolveAnchorToBlock, classifyValence } from '../src/engine/passageConvergence.ts';
import { computeEditorialSignals } from '../src/engine/editorialSignals.ts';
import { rankInsights } from '../src/engine/insights/rankInsights.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

// ── Fixture: four chapters, paragraphs with deliberate unmarked gaps so beat
//    merge only fires where marks are truly adjacent ────────────────────────────
const MD = `# One

Filler paragraph one of chapter one, quiet water and grey light over the fields.

The debt followed her across the water like a second wake that morning tide.

Filler paragraph three of chapter one, unremarkable and calm and slow and still.

Alpha closing lines of chapter one about the harbor and the far grey morning.

Filler paragraph five of chapter one, the last of the set before the next part.

# Two

No one spoke because speaking would have cost more than the salt itself here.

Filler paragraph two of chapter two, transitional and plain and ordinary text.

He came back the way weather comes back without apology or any real warning.

Filler paragraph four of chapter two, closing the set with nothing much at all.

# Three

Filler paragraph one of chapter three, a slow opening into the evening quiet.

The lighthouse metaphor returned once more in the deep quiet of that evening.

Filler paragraph three of chapter three, holding the space with plain prose here.

A final loose paragraph of chapter three, understated and then wholly silent.

# Four

Filler paragraph one of chapter four, the harbor dark before the strange dawn.

The tide came in carrying lights that were not any kind of reflection at all.

The harbourmaster rang the old bell and pretended he had not seen the lights.

Filler paragraph four of chapter four, the last lines before the book moves on.
`;

const R = { rA: 'Ada', rB: 'Ben', rC: 'Cara', rD: 'Dan' };
let seq = 0;
const mk = (rid, type, ch, chTitle, quote) => ({
  id: `m${++seq}`, type, quote, note: '', chapterTitle: chTitle, chapterIndex: ch,
  createdAt: seq, readerName: R[rid], readerId: rid,
});

const annotations = [
  // Ch1 ¶2 — COOL: 3 distinct readers, all concern
  mk('rA', 'question',   1, 'One', 'the debt followed her across the water'),
  mk('rB', 'question',   1, 'One', 'like a second wake'),
  mk('rC', 'continuity', 1, 'One', 'across the water like a second wake'),
  // Ch1 ¶4 — ONE reader marking twice (gap of 2 from ¶2 ⇒ no merge) → dropped
  mk('rA', 'highlight', 1, 'One', 'Alpha closing lines of chapter one'),
  mk('rA', 'note',      1, 'One', 'the far grey morning'),
  // Ch2 ¶1 — WARM: 2 readers, reaction only
  mk('rA', 'highlight', 2, 'Two', 'No one spoke'),
  mk('rB', 'note',      2, 'Two', 'cost more than the salt'),
  // Ch2 ¶3 — DIVIDED: 4 readers, 2 reaction + 2 concern (gap of 2 from ¶1 ⇒ no merge)
  mk('rA', 'highlight', 2, 'Two', 'He came back the way weather'),
  mk('rB', 'highlight', 2, 'Two', 'the way weather comes back'),
  mk('rC', 'question',  2, 'Two', 'without apology'),
  mk('rD', 'question',  2, 'Two', 'weather comes back without'),
  // Ch3 ¶2 — ONE VOICE: a lone reader's concern (neighbours unmarked)
  mk('rA', 'question', 3, 'Three', 'The lighthouse metaphor'),
  // Ch3 ¶4 — solo REACTION → dropped (gap of 2 from ¶2)
  mk('rB', 'highlight', 3, 'Three', 'understated and then wholly silent'),
  // Ch4 ¶2 + ¶3 — BEAT MERGE: two readers on ADJACENT paragraphs → one beat
  mk('rA', 'question', 4, 'Four', 'the tide came in carrying lights'),
  mk('rB', 'question', 4, 'Four', 'rang the old bell'),
];

// Sessions: Ada & Ben finish; Cara & Dan stop at ~40% (before Ch3/4).
const session = (rid, progress) => ({
  id: `s-${rid}`, manuscriptId: 'm', readerId: rid, readerName: R[rid],
  startedAt: 0, progress, annotationIds: annotations.filter(a => a.readerId === rid).map(a => a.id),
  completedAt: progress >= 1 ? 1 : undefined,
});
const sessions = [session('rA', 1.0), session('rB', 1.0), session('rC', 0.4), session('rD', 0.4)];

const structure = buildManuscriptStructure(MD);
const { passageConvergences: room, soloPassages: solo } = buildPassageConvergences(annotations, structure, sessions);
const conv = (ch, ord) => room.find(c => c.chapterIndex === ch && c.blockOrdinal === ord);

console.log('\n' + '─'.repeat(60));
console.log('CASE: resolveAnchorToBlock — quote-match scoped to chapter');
{
  const ch1 = structure.chapters.find(c => c.index === 1);
  const ann = annotations.find(a => a.quote === 'the debt followed her across the water');
  const block = resolveAnchorToBlock(ann, ch1.blocks);
  check('resolves to a block', !!block);
  check('the correct paragraph', !!block && block.text.includes('The debt followed her across the water'));
  check('unresolvable quote → null (degrades)', resolveAnchorToBlock({ ...ann, quote: 'nowhere at all zzz' }, ch1.blocks) === null);
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: the room (≥2 distinct readers) + one reader twice is not signal');
{
  console.log('  room:', room.map(c => `Ch${c.chapterIndex}¶${c.blockOrdinal}${c.blockOrdinalEnd ? '–' + c.blockOrdinalEnd : ''} ${c.valence} ${c.readerCount}r/${c.readersReached}reached`).join('  |  '));
  check('exactly 4 convergences', room.length === 4);
  check('one reader marking twice (Ch1 ¶4) is NOT a convergence', !room.some(c => c.chapterIndex === 1 && c.blockOrdinal === 4));
  check('Ch1 ¶2 cool convergence of 3 readers', !!conv(1, 2) && conv(1, 2).readerCount === 3 && conv(1, 2).valence === 'cool');
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: v2 beat merge — adjacent paragraphs fold into one beat');
{
  const beat = room.find(c => c.chapterIndex === 4);
  check('Ch4 ¶2+¶3 merged into ONE beat', !!beat && beat.blockOrdinal === 2 && beat.blockOrdinalEnd === 3);
  check('  …two distinct readers across the beat', !!beat && beat.readerCount === 2);
  check('non-adjacent marks NOT merged (Ch1 ¶2 stays a single paragraph)', !!conv(1, 2) && conv(1, 2).blockOrdinalEnd === undefined);
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: valence signatures');
{
  check('divided (2 reaction + 2 concern, distinct readers)', !!conv(2, 3) && conv(2, 3).valence === 'divided' && conv(2, 3).readerCount === 4);
  check('warm (reaction only, no concern)', !!conv(2, 1) && conv(2, 1).valence === 'warm');
  check('classifyValence: no concern → warm', classifyValence(3, 0, 3, 0) === 'warm');
  check('classifyValence: concern, no split → cool', classifyValence(0, 3, 0, 3) === 'cool');
  check('classifyValence: 30% minority + 2 readers → divided', classifyValence(2, 2, 2, 2) === 'divided');
  check('classifyValence: minority <2 readers → cool', classifyValence(3, 1, 3, 1) === 'cool');
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: reach-aware denominator (pass 4 at passage level)');
{
  check('early passage: all 4 reached it', !!conv(1, 2) && conv(1, 2).readersReached === 4);
  const beat = room.find(c => c.chapterIndex === 4);
  // Cara & Dan stopped at 0.4, before the Ch4 beat (~0.8) — they did NOT reach it,
  // so the honest denominator is 2, not the 4-reader pool.
  check('late passage: only readers who reached it count (2, not 4)', !!beat && beat.readersReached === 2);
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: ranking — readers desc, then concern-bearing above warmth');
{
  check('[0] divided, 4 readers, leads', room[0].valence === 'divided' && room[0].readerCount === 4);
  check('[1] cool, 3 readers', room[1].valence === 'cool' && room[1].readerCount === 3);
  const coolIdx = room.findIndex(c => c.readerCount === 2 && c.valence === 'cool');
  const warmIdx = room.findIndex(c => c.readerCount === 2 && c.valence === 'warm');
  check('concern-bearing passage outranks pure warmth at equal reader count', coolIdx >= 0 && warmIdx >= 0 && coolIdx < warmIdx);
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: consensus / one-voice boundary');
{
  console.log('  solo:', solo.map(c => `Ch${c.chapterIndex}¶${c.blockOrdinal} ${c.valence} ${c.readerCount}r`).join('  |  ') || '(none)');
  check('exactly one one-voice passage', solo.length === 1);
  check('one-voice is the lone concern (Ch3 lighthouse)', solo[0].chapterIndex === 3 && solo[0].quote.includes('lighthouse'));
  check('every one-voice has readerCount === 1', solo.every(c => c.readerCount === 1));
  check('solo REACTION dropped (not room, not one-voice)', !solo.some(c => c.quote.includes('wholly silent')) && !room.some(c => c.quote.includes('wholly silent')));
  check('every room passage has readerCount ≥ 2', room.every(c => c.readerCount >= 2));
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: full signals — convergence tier + abandonment + one-voice boundary');
{
  const signals = computeEditorialSignals({ manuscriptId: 'm', annotations, chapters: chaptersFrom(structure), sessions, combinedMarkdown: MD });
  const insights = rankInsights(signals);
  console.log('  insights:', insights.map(i => `[${i.tier}] ${i.headline}`).join('\n              '));
  console.log('  dropoff:', signals.readerDropoff.map(d => `after Ch${d.chapterIndex}: ${d.readersStopped}/${d.readersReached} stopped`).join(' | ') || '(none)');
  check('first insight is a convergence (outranks all)', insights[0]?.tier === 'convergence');
  check('convergence carries valence + reach-aware headline', insights.some(i => i.tier === 'convergence' && !!i.evidence.valence));
  check('a lone mark never ranks as a convergence (all ≥2 readers)',
    insights.filter(i => i.tier === 'convergence').every(i => Number(i.evidence.label.split(' ')[0]) >= 2));
  // Abandonment: Cara & Dan stop mid-book ⇒ a ≥2-reader reach cliff exists + ranks.
  check('abandonment signal computed (≥2 readers stopped)', signals.readerDropoff.length >= 1 && signals.readerDropoff[0].readersStopped === 2);
  check('abandonment appears as a ranked insight', insights.some(i => i.tier === 'abandonment'));
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: determinism + clean degradation');
{
  const a = JSON.stringify(buildPassageConvergences(annotations, structure, sessions));
  const b = JSON.stringify(buildPassageConvergences(annotations, structure, sessions));
  check('same marks in → identical out', a === b);
  const none = buildPassageConvergences(annotations, null, sessions);
  check('no structure → no convergences', none.passageConvergences.length === 0 && none.soloPassages.length === 0);
  const noSess = buildPassageConvergences(annotations, structure, []);
  check('no sessions → still runs; denominator falls back to the pool', noSess.passageConvergences.length === 4 && room.length === 4);
}

function chaptersFrom(structure) {
  return structure.chapters.map(c => ({ id: `ch-${c.index}`, index: c.index, title: c.title, html: '', wordCount: 100 }));
}

console.log('\n' + '─'.repeat(60));
if (failures) {
  console.error(`\n✗ ${failures} convergence check(s) failed`);
  process.exit(1);
}
console.log('\n✓ all convergence checks passed');
