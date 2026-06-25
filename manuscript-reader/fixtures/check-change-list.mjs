// ─── buildChangeList check (Phase 8, Changes mode) ──────────────────────────
// The Edit log is noisy: repeated edits to one passage + formatting-only churn.
// buildChangeList must chain repeated edits into ONE entry (net before→after) and
// drop changes whose RENDERED text didn't move. Verifies both.
//   Run with: npm run check-change-list
import { buildChangeList } from '../src/engine/manuscript/changeList.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

const edit = (id, chapterId, original, replacement, createdAt) =>
  ({ id, manuscriptId: 'm', chapterId, chapterIndex: 1, chapterTitle: 'One', anchor: { quote: original, prefix: '', suffix: '', offset: 0 }, originalText: original, replacementText: replacement, createdAt });

// Three sequential edits to the same passage A→B→C→D should collapse to one entry.
const chain = buildChangeList([
  edit('e1', 'ch-1', 'The walls are busy already.', 'The walls seem busy already.', 100),
  edit('e2', 'ch-1', 'The walls seem busy already.', 'The walls seem busy enough already.', 200),
  edit('e3', 'ch-1', 'The walls seem busy enough already.', 'The walls seem quite busy enough already.', 300),
]);
check('chain of 3 edits → 1 entry', chain.length === 1);
check('entry kind = revised', chain[0]?.kind === 'revised');
check('entry keeps FIRST previous', chain[0]?.previous === 'The walls are busy already.');
check('entry keeps LAST current', chain[0]?.current === 'The walls seem quite busy enough already.');
check('entry editCount = 3', chain[0]?.editCount === 3);
check('entry id = latest edit (e3)', chain[0]?.id === 'e3');
check('firstAt/lastAt span the chain', chain[0]?.firstAt === 100 && chain[0]?.lastAt === 300);

// Deletions and additions are kept and classified (not dropped).
const delAdd = buildChangeList([
  edit('d1', 'ch-0', 'PRO TEMPORE PUBLISHING front matter that was stripped.', '', 100), // deletion
  edit('a1', 'ch-2', '', 'A newly written paragraph.', 200),                              // addition
]);
check('deletion + addition both kept', delAdd.length === 2);
const del = delAdd.find(c => c.id === 'd1'); const add = delAdd.find(c => c.id === 'a1');
check('deletion: kind=deleted, current empty, previous = removed text', del?.kind === 'deleted' && del?.current === '' && del?.previous.startsWith('PRO TEMPORE'));
check('addition: kind=added, previous empty, current = new text', add?.kind === 'added' && add?.previous === '' && add?.current === 'A newly written paragraph.');

// Formatting-only edits (rendered text unchanged) are dropped.
const fmt = buildChangeList([
  edit('f1', 'ch-1', 'Philosopher of Change', '## Philosopher of Change', 100),       // heading level
  edit('f2', 'ch-2', 'a plain word', 'a **plain** word', 200),                         // bolding
  edit('f3', 'ch-2', 'Circa 535-475 BC', 'Circa 535\\-475 BC', 300),                   // escape churn
]);
check('formatting-only edits all dropped', fmt.length === 0);

// Distinct passages stay separate; mixed with noise.
const mixed = buildChangeList([
  edit('m1', 'ch-1', 'The road was long.', 'The road was very long.', 100),            // real
  edit('m2', 'ch-2', 'word', '*word*', 200),                                           // formatting (dropped)
  edit('m3', 'ch-3', 'She paused.', 'She hesitated.', 300),                            // real
]);
check('two distinct real changes survive, noise dropped', mixed.length === 2);
check('distinct entries are not chained', mixed[0].id === 'm1' && mixed[1].id === 'm3');

// Whole-chapter edit where only a phrase moved → narrowed to the changed region.
const CH = 'In the beginning the cartographer drew the coast with a steady hand and named every cove she could find before the tide returned.';
const CH2 = CH.replace('a steady hand', 'a trembling hand');
const narrow = buildChangeList([edit('n1', 'ch-1', CH, CH2, 100)]);
check('whole-chapter revision → 1 entry', narrow.length === 1);
check('narrowed: does NOT show the whole chapter', narrow[0].current.length < CH.length / 2);
check('narrowed: includes the changed words + context', narrow[0].current.includes('trembling hand') && narrow[0].previous.includes('steady hand'));
check('narrowed: ellipsis flags set (context trimmed both sides)', narrow[0].startEllipsis && narrow[0].endEllipsis);

// Two whole-chapter commits in one session, scenes far apart → separate margin cards.
const CH_A = `${CH} She walked the cliff path at dusk.`;
const CH_B = CH_A.replace('a steady hand', 'a trembling hand');
const CH_C = CH_B.replace('cliff path', 'narrow ridge');
const twoScenes = buildChangeList([
  edit('s1', 'ch-1', CH_A, CH_B, 100),
  edit('s2', 'ch-1', CH_B, CH_C, 200),
]);
check('two scene edits in one chapter → 2 entries', twoScenes.length === 2);
check('first scene: steady → trembling', twoScenes[0]?.current.includes('trembling hand'));
check('second scene: cliff → ridge', twoScenes[1]?.current.includes('narrow ridge'));

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
