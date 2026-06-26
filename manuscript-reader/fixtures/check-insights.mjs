// ─── rankInsights check (golden-file + assertions) ──────────────────────────
// Runs the real engine (computeEditorialSignals → rankInsights) over the
// multi-reader session fixture and synthetic prose-only manuscripts, then asserts
// the ranking contract the panel + exports depend on:
//   • consensus outranks solo reaction noise (criterion 3)
//   • a prose-only manuscript still yields a prose insight when an outlier exists
//   • an evenly-paced, annotation-free manuscript yields NO insights (empty is OK)
//   • the strip is capped (≤5) and every insight carries structured evidence
//   Run with: npm run check-insights
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeEditorialSignals } from '../src/engine/editorialSignals.ts';
import { rankInsights } from '../src/engine/insights/rankInsights.ts';

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}
function show(insights) {
  for (const i of insights) console.log(`    [${i.tier}] ${i.headline}  ·  ${i.evidence.label}  → ch.${i.chapter}`);
  if (!insights.length) console.log('    (none)');
}

// Build a manuscript body of roughly `words` words under a chapter heading.
const chapter = (title, words) => `# ${title}\n\n${Array.from({ length: words }, () => 'word').join(' ')}.\n`;

// ── Case 1: multi-reader fixture — consensus must outrank reaction ────────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: three-readers (consensus vs reaction)');
{
  const fx = JSON.parse(await readFile(join(here, 'sessions', 'three-readers.json'), 'utf8'));
  const sig = computeEditorialSignals({
    manuscriptId: fx.manuscriptId, annotations: fx.annotations, chapters: fx.chapters, sessions: fx.sessions,
  });
  const insights = rankInsights(sig);
  show(insights);

  const firstReaction = insights.findIndex(i => i.tier === 'reaction');
  const firstConsensus = insights.findIndex(i => i.tier === 'consensus');
  check('produces at least one insight', insights.length > 0);
  check('top insight is consensus', insights[0]?.tier === 'consensus');
  check('a reaction (cluster) insight is present', firstReaction !== -1);
  check('every consensus insight ranks above every reaction insight',
    firstConsensus !== -1 && (firstReaction === -1 || firstConsensus < firstReaction));
  check('consensus evidence carries reader counts',
    insights[0]?.evidence.kind === 'agreement' && Array.isArray(insights[0]?.evidence.readers));
  check('reaction evidence carries a representative annotation id',
    firstReaction === -1 || (insights[firstReaction].evidence.annotationIds?.length ?? 0) >= 1);
  check('capped at ≤5', insights.length <= 5);
  check('every insight has a jump target', insights.every(i => typeof i.chapter === 'number'));
}

// ── Case 2: prose-only manuscript with a length outlier ──────────────────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: prose-only with a long outlier (no annotations)');
{
  const md = chapter('One', 40) + chapter('Two', 40) + chapter('Three', 220) + chapter('Four', 40);
  const sig = computeEditorialSignals({
    manuscriptId: 'prose-only', annotations: [], chapters: [], sessions: [], combinedMarkdown: md,
  });
  const insights = rankInsights(sig);
  show(insights);

  check('yields at least one insight from prose alone', insights.length > 0);
  check('all insights are prose-tier (no annotations/readers)', insights.every(i => i.tier === 'prose'));
  check('flags the long chapter (ch.3)', insights.some(i => i.chapter === 3));
  check('prose evidence carries a ratio', insights.every(i => typeof i.evidence.ratio === 'number'));
}

// ── Case 2b: prose-only manuscript with a short outlier (false chapter break) ─
console.log('\n' + '─'.repeat(60));
console.log('CASE: prose-only with a short outlier (no annotations)');
{
  const md = chapter('One', 100) + chapter('Chapter two', 10) + chapter('Three', 100) + chapter('Four', 100);
  const sig = computeEditorialSignals({
    manuscriptId: 'prose-short', annotations: [], chapters: [], sessions: [], combinedMarkdown: md,
  });
  const insights = rankInsights(sig);
  show(insights);

  check('yields a prose insight for the short chapter', insights.some(i => i.chapter === 2));
  check('short insight uses sub-1× ratio copy', insights.some(i => i.chapter === 2 && i.headline.includes('only 0.1×')));
}

// ── Case 4: pacing/voice density — surfaced where the cluster model is blind ──
console.log('\n' + '─'.repeat(60));
console.log('CASE: developmental density (pacing/voice, no clusters)');
{
  // Ch.2 is dense in pacing + voice notes. detectClusters only models question/
  // continuity/structural/engagement, so it produces NO cluster here — the
  // developmental-density signal is the only thing that can surface this chapter.
  const md = chapter('One', 120) + chapter('Two', 120) + chapter('Three', 120);
  const chapters = [
    { id: 'ch-1', index: 1, title: 'One' },
    { id: 'ch-2', index: 2, title: 'Two' },
    { id: 'ch-3', index: 3, title: 'Three' },
  ];
  const anns = [
    { id: 'p1', type: 'pacing', quote: 'word', chapterTitle: 'Two', chapterIndex: 2, note: '', readerName: null, createdAt: 1 },
    { id: 'p2', type: 'pacing', quote: 'word', chapterTitle: 'Two', chapterIndex: 2, note: '', readerName: null, createdAt: 2 },
    { id: 'v1', type: 'voice', quote: 'word', chapterTitle: 'Two', chapterIndex: 2, note: '', readerName: null, createdAt: 3 },
  ];
  const sig = computeEditorialSignals({ manuscriptId: 'dev', annotations: anns, chapters, sessions: [], combinedMarkdown: md });
  const insights = rankInsights(sig);
  show(insights);
  check('no annotation clusters for pacing/voice (engine blind spot confirmed)', sig.report.clusters.length === 0);
  check('developmental-density insight surfaces ch.2', insights.some(i => i.id === 'insight-dev-2'));
  check('it is a reaction-tier insight', insights.find(i => i.id === 'insight-dev-2')?.tier === 'reaction');
}

// ── Case 3: evenly-paced, annotation-free — empty is correct ─────────────────
console.log('\n' + '─'.repeat(60));
console.log('CASE: evenly-paced, no annotations (empty list expected)');
{
  const md = chapter('One', 80) + chapter('Two', 80) + chapter('Three', 80) + chapter('Four', 80);
  const sig = computeEditorialSignals({
    manuscriptId: 'even', annotations: [], chapters: [], sessions: [], combinedMarkdown: md,
  });
  const insights = rankInsights(sig);
  show(insights);
  check('no insights when nothing is genuinely off', insights.length === 0);
}

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
