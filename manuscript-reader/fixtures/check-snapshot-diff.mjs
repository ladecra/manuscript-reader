// ─── Snapshot diff check (Phase 8 — the revision-impact keystone) ───────────
// Runs the REAL diffSnapshots over two hand-built snapshots with known changes —
// a modified chapter, an unchanged chapter, an added chapter, and an annotation
// lifecycle (resolved / removed / added) — and asserts the structured result.
// diffSnapshots recomputes each side's signals from frozen inputs (never a cache),
// so this also guards that the recompute-then-compare contract holds.
//   Run with: npm run check-snapshot-diff
import { createSnapshot } from '../src/engine/snapshots.ts';
import { diffSnapshots } from '../src/engine/snapshotDiff.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}
const eq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const MD_A = `# One

Alpha beta gamma delta. The river ran cold past the mill.

# Two

Epsilon zeta eta theta. The gallery watched from above.
`;
const MD_B = `# One

Alpha beta gamma delta epsilon. The river ran very cold indeed past the old mill.

# Two

Epsilon zeta eta theta. The gallery watched from above.

# Three

A freshly written third chapter, new prose entirely.
`;

const ann = (id, type, chapterIndex, chapterTitle, status) =>
  ({ id, type, chapterIndex, chapterTitle, status, readerId: 'rA', readerName: 'Ada', createdAt: chapterIndex });

const ANNS_A = [
  ann('a1', 'question', 1, 'One', 'open'),
  ann('a2', 'continuity', 2, 'Two', 'open'),
];
const ANNS_B = [
  ann('a1', 'question', 1, 'One', 'resolved'), // resolved between
  ann('a3', 'question', 3, 'Three', 'open'),   // added (a2 removed)
];

const A = createSnapshot({ manuscriptId: 'frost', markdown: MD_A, annotations: ANNS_A, sessions: [],
  wordCount: 18, chapterCount: 2, trigger: 'import', label: 'Draft 1', now: 1000, id: 'A' });
const B = createSnapshot({ manuscriptId: 'frost', markdown: MD_B, annotations: ANNS_B, sessions: [],
  wordCount: 28, chapterCount: 3, trigger: 'manual', label: 'Draft 2', parentId: 'A', now: 2000, id: 'B' });

console.log('DIFF: Draft 1 → Draft 2');
const d = diffSnapshots(A, B);
console.log(JSON.stringify(d, null, 2));

check('not identical (prose changed)', d.identical === false);
check('from/to refs carry labels', d.from.label === 'Draft 1' && d.to.label === 'Draft 2');
check('wordCountDelta = +10', d.wordCountDelta === 10);
check('chapterCountDelta = +1', d.chapterCountDelta === 1);
check('unresolvedConcernsDelta = -1 (2 open concerns → 1)', d.unresolvedConcernsDelta === -1);
check('completionRateDelta null (no readers)', d.completionRateDelta === null);

const byTitle = Object.fromEntries(d.chapters.map(c => [c.title, c]));
check('ch One: modified', byTitle['One']?.status === 'modified');
check('ch Two: unchanged', byTitle['Two']?.status === 'unchanged');
check('ch Three: added (toIndex 3, fromIndex null)', byTitle['Three']?.status === 'added' && byTitle['Three']?.toIndex === 3 && byTitle['Three']?.fromIndex === null);
check('ch Two annotationCountDelta = -1 (a2 gone)', byTitle['Two']?.annotationCountDelta === -1);
check('ch Three annotationCountDelta = +1 (a3 added)', byTitle['Three']?.annotationCountDelta === 1);
check('ch One annotationCountDelta = 0 (a1 stays, just resolved)', byTitle['One']?.annotationCountDelta === 0);
check('chapters ordered by toIndex', d.chapters.map(c => c.title).join() === 'One,Two,Three');

check('annotations.added = [a3]', eq(d.annotations.added, ['a3']));
check('annotations.removed = [a2]', eq(d.annotations.removed, ['a2']));
check('annotations.resolvedBetween = [a1]', eq(d.annotations.resolvedBetween, ['a1']));
check('annotations.reopenedBetween = []', d.annotations.reopenedBetween.length === 0);
check('annotations.persistentOpen = []', d.annotations.persistentOpen.length === 0);

console.log('\nDIFF: snapshot against itself (no-op)');
const self = diffSnapshots(A, A);
check('self-diff identical', self.identical === true);
check('self-diff zero scalar deltas', self.wordCountDelta === 0 && self.chapterCountDelta === 0 && self.unresolvedConcernsDelta === 0);
check('self-diff all chapters unchanged', self.chapters.every(c => c.status === 'unchanged'));
check('self-diff persistentOpen = both open anns', eq(self.annotations.persistentOpen, ['a1', 'a2']));
check('self-diff no added/removed', self.annotations.added.length === 0 && self.annotations.removed.length === 0);

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
