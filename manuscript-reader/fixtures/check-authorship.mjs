// ─── check-authorship — the Part-1 signal-layer partition (golden + assertions) ─
// Author marks are REVISION INTENT; reader marks are REACTION. They are different
// speech acts and must never be conflated in the report engine. This harness pins
// that contract at the SIGNAL layer (not just the copy):
//   • a solo author's own marks NEVER appear in reader clusters / consensus /
//     agreement / developmental hotspots / engagement score
//   • the author's marks surface as a first-class `authorRevision` queue and an
//     'author-queue' insight tier — run-grouping preserved, framing corrected
//   • unresolvedConcerns === unresolvedReaderConcerns + openAuthorFlags (invariant)
//   • a mixed manuscript (author + readers) keeps the two streams separate — the
//     bug the old readerCount-keyed relabel could not fix
//   Run with: npm run check-authorship
import { computeEditorialSignals } from '../src/engine/editorialSignals.ts';
import { rankInsights } from '../src/engine/insights/rankInsights.ts';
import { computeReport } from '../src/engine/report.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

const chapter = (title, words) => `# ${title}\n\n${Array.from({ length: words }, () => 'word').join(' ')}.\n`;
const md = chapter('One', 120) + chapter('Two', 120) + chapter('Three', 120);
const chapters = [
  { id: 'ch-1', index: 1, title: 'One' },
  { id: 'ch-2', index: 2, title: 'Two' },
  { id: 'ch-3', index: 3, title: 'Three' },
];
const authorQ = (id, ci, t) => ({ id, type: 'question', quote: 'word', chapterTitle: t, chapterIndex: ci, note: '', readerName: null, createdAt: id.charCodeAt(1) });
const readerQ = (id, ci, t) => ({ id, type: 'question', quote: 'word', chapterTitle: t, chapterIndex: ci, note: '', readerName: 'Sam', readerId: 'r1', createdAt: id.charCodeAt(1) });

// ── Golden case: solo author, three question marks in one chapter ─────────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: solo author, 3 questions in Ch.2 (the brief’s golden case)');
{
  const anns = [authorQ('q1', 2, 'Two'), authorQ('q2', 2, 'Two'), authorQ('q3', 2, 'Two')];
  const sig = computeEditorialSignals({ manuscriptId: 'solo', annotations: anns, chapters, sessions: [], combinedMarkdown: md });
  const rep = sig.report;
  const insights = rankInsights(sig);

  check('no reader identities', rep.readers.length === 0);
  check('ZERO reader clusters (author marks are not reader reaction)', rep.clusters.length === 0);
  check('ZERO reader question clusters', rep.questionClusters.length === 0);
  check('ZERO reader developmental hotspots', rep.developmentalHotspots.length === 0);
  check('ZERO reader consensus', rep.consensus.length === 0);
  check('engagement score is 0 / "No data yet" with no reader marks', rep.score === 0 && rep.label === 'No data yet');

  check('authorRevision.totalFlags === 3', rep.authorRevision.totalFlags === 3);
  check('authorRevision counts the questions by type', rep.authorRevision.typeTotals.question === 3);
  check('authorRevision groups them into a run (grouping preserved)', rep.authorRevision.clusters.length === 1 && rep.authorRevision.clusters[0].count === 3);
  check('authorRevision.chapters points at Ch.2 with count 3', rep.authorRevision.chapters[0]?.index === 2 && rep.authorRevision.chapters[0]?.count === 3);

  const aq = insights.find(i => i.tier === 'author-queue');
  check('an author-queue insight surfaces (no reaction/consensus tier)', !!aq && !insights.some(i => i.tier === 'reaction' || i.tier === 'consensus'));
  check('its copy is author-framed ("you flagged")', !!aq && /you flagged/i.test(aq.headline));
  check('NO insight says "reader" or "possible confusion"', insights.every(i => !/reader/i.test(i.headline + (i.detail ?? '')) && !/possible confusion/i.test(i.detail ?? '')));

  check('unresolvedConcerns total === 3', sig.unresolvedConcerns === 3);
  check('unresolvedReaderConcerns === 0 (none are reader)', sig.unresolvedReaderConcerns === 0);
  check('openAuthorFlags === 3', sig.openAuthorFlags === 3);
  check('invariant: total === reader + author', sig.unresolvedConcerns === sig.unresolvedReaderConcerns + sig.openAuthorFlags);
}

// ── Mixed case: author marks + a beta reader session — streams stay separate ──
console.log('\n' + '─'.repeat(60));
console.log('CASE: mixed — author flags in Ch.3 + a reader cluster in Ch.2');
{
  // Reader Sam clusters 3 questions in Ch.2; the author flags 2 of their own in Ch.3.
  const anns = [
    readerQ('r1a', 2, 'Two'), readerQ('r2b', 2, 'Two'), readerQ('r3c', 2, 'Two'),
    authorQ('a1', 3, 'Three'), authorQ('a2', 3, 'Three'),
  ];
  const sessions = [{ id: 's1', manuscriptId: 'mixed', readerId: 'r1', readerName: 'Sam', startedAt: 1, progress: 1, completedAt: 9, annotationIds: ['r1a', 'r2b', 'r3c'] }];
  const sig = computeEditorialSignals({ manuscriptId: 'mixed', annotations: anns, chapters, sessions, combinedMarkdown: md });
  const rep = sig.report;
  const insights = rankInsights(sig);

  check('reader cluster is Ch.2 ONLY (author Ch.3 flags excluded)',
    rep.clusters.length === 1 && rep.clusters[0].chapterRange[0] === 2 && rep.clusters[0].chapterRange[1] === 2 && rep.clusters[0].count === 3);
  check('reader question clusters do not include Ch.3', rep.questionClusters.every(c => c.index !== 3));
  check('authorRevision is Ch.3 ONLY (reader Ch.2 marks excluded)',
    rep.authorRevision.totalFlags === 2 && rep.authorRevision.chapters.length === 1 && rep.authorRevision.chapters[0].index === 3);

  const reaction = insights.find(i => i.tier === 'reaction');
  const authorQueue = insights.find(i => i.tier === 'author-queue');
  check('a reaction insight (reader) surfaces Ch.2, reader-framed', !!reaction && reaction.chapter === 2 && /cluster/i.test(reaction.headline));
  check('an author-queue insight surfaces Ch.3, author-framed', !!authorQueue && authorQueue.chapter === 3 && /you (flagged|left|marked)/i.test(authorQueue.headline));
  check('reaction outranks author-queue', insights.findIndex(i => i.tier === 'reaction') < insights.findIndex(i => i.tier === 'author-queue'));

  check('unresolvedConcerns === 5 total', sig.unresolvedConcerns === 5);
  check('unresolvedReaderConcerns === 3 (Sam’s only)', sig.unresolvedReaderConcerns === 3);
  check('openAuthorFlags === 2 (author’s only)', sig.openAuthorFlags === 2);
  check('invariant holds in the mixed case', sig.unresolvedConcerns === sig.unresolvedReaderConcerns + sig.openAuthorFlags);
}

// ── Descriptive stats stay all-marks (author breakdown never vanishes) ────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: descriptive stats (typeTotals / table) remain all-marks');
{
  const anns = [authorQ('q1', 1, 'One'), readerQ('r1a', 2, 'Two')];
  const rep = computeReport(anns, chapters, md);
  check('typeTotals counts BOTH author and reader marks', rep.typeTotals.question === 2);
  check('the per-chapter table carries all marks', rep.chapters.find(c => c.index === 1)?.counts.question === 1 && rep.chapters.find(c => c.index === 2)?.counts.question === 1);
  check('but reader clusters see reader marks only', rep.clusters.length === 0 && rep.authorRevision.totalFlags === 1);
}

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
