// ─── Prose-analysis check (golden-file + assertions) ────────────────────────
// Runs a hand-authored fixture with KNOWN prose properties through the real
// engine (buildManuscriptStructure → computeProseAnalysis) and asserts the
// computed numbers. Unlike check-fixtures (inspection by eye), Tier-1 prose
// metrics are deterministic numbers with a verifiable right answer, so we
// assert them — the first precisely-regression-testable engine output.
//   Run with: npm run check-prose
//
// Runs under tsx (not plain node) because it imports value-exporting engine
// modules transitively — see check-sessions.mjs for the same reason.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildManuscriptStructure } from '../src/engine/ingestion/manuscriptStructure.ts';
import { computeProseAnalysis } from '../src/engine/prose/proseAnalysis.ts';

const here = dirname(fileURLToPath(import.meta.url));
const approx = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

const md = await readFile(join(here, 'prose', 'known-prose.md'), 'utf8');
const analysis = computeProseAnalysis(buildManuscriptStructure(md));

console.log('\n' + '─'.repeat(60));
console.log('FIXTURE: prose/known-prose.md');
for (const c of analysis.chapters) {
  console.log(
    `  ch.${c.index} "${c.title}": ${c.words}w · ${c.paragraphs}¶ (mean ${c.meanParagraphWords}) · ` +
    `${c.scenes} scene(s) · dialogue ${(c.dialogueRatio * 100).toFixed(0)}% · ` +
    `${c.sentences} sentences (mean ${c.meanSentenceWords}, var ${c.sentenceLengthVariance})`,
  );
}
const b = analysis.baselines;
console.log(
  `  baselines: ${b.chapterCount} chapters · ${b.totalWords}w · mean ch ${b.meanChapterWords} · ` +
  `mean sentence ${b.meanSentenceWords} · dialogue ${(b.dialogueRatio * 100).toFixed(0)}%`,
);

const ch1 = analysis.chapters.find(c => c.index === 1);
const ch2 = analysis.chapters.find(c => c.index === 2);

console.log('  assertions:');
// Chapter One: 3 paragraphs (24w) + 1 scene break. Dialogue = the 7-word opener.
check('ch.1 words = 24', ch1?.words === 24);
check('ch.1 paragraphs = 3', ch1?.paragraphs === 3);
check('ch.1 mean paragraph words = 8', approx(ch1?.meanParagraphWords, 8));
check('ch.1 scenes = 2 (one scene break)', ch1?.scenes === 2);
check('ch.1 dialogue ratio ≈ 7/24', approx(ch1?.dialogueRatio, 7 / 24));
check('ch.1 sentences = 6', ch1?.sentences === 6);
check('ch.1 mean sentence words = 4', approx(ch1?.meanSentenceWords, 4));

// Chapter Two: 2 paragraphs (9w), no scene break. Dialogue = the 3-word line.
check('ch.2 words = 9', ch2?.words === 9);
check('ch.2 scenes = 1 (no scene break)', ch2?.scenes === 1);
check('ch.2 dialogue ratio ≈ 3/9', approx(ch2?.dialogueRatio, 3 / 9));
check('ch.2 sentences = 4', ch2?.sentences === 4);

// Baselines aggregate across both chapters.
check('baseline chapterCount = 2', b.chapterCount === 2);
check('baseline totalWords = 33', b.totalWords === 33);
check('baseline mean chapter words ≈ 16.5', approx(b.meanChapterWords, 16.5));
check('baseline mean sentence words ≈ 3.3', approx(b.meanSentenceWords, 33 / 10));
check('baseline dialogue ratio ≈ 10/33', approx(b.dialogueRatio, 10 / 33));

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
