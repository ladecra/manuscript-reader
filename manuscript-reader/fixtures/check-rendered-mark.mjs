// ─── buildRenderedMarkAnchor check (Changes mode perf path) ─────────────────
//   Run with: npm run check-rendered-mark
import { buildRenderedMarkAnchor, renderedMarkQuote } from '../src/engine/manuscript/editRenderedMark.ts';
import { rollupChangesByChapter, formatChapterRollupLine } from '../src/engine/manuscript/chapterChangeRollup.ts';
import { buildChangeList } from '../src/engine/manuscript/changeList.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

const CHAPTER = 'In the beginning the cartographer drew the coast with a steady hand and named every cove.';
const CHAPTER2 = CHAPTER.replace('a steady hand', 'a trembling hand');

const quote = renderedMarkQuote(CHAPTER, CHAPTER2);
check('narrowed quote contains changed words', quote.includes('trembling hand'));

const anchor = buildRenderedMarkAnchor(CHAPTER2, CHAPTER, CHAPTER2, 'ch-1');
check('anchor built for revision', anchor != null && anchor.quote.length >= 4);
check('anchor chapterId set', anchor?.chapterId === 'ch-1');

const edit = (id, chapterId, original, replacement, createdAt, renderedMarkAnchor) =>
  ({ id, manuscriptId: 'm', chapterId, chapterIndex: 1, chapterTitle: 'One', anchor: { quote: original, prefix: '', suffix: '', offset: 0 }, originalText: original, replacementText: replacement, createdAt, renderedMarkAnchor });

const list = buildChangeList([
  edit('e1', 'ch-1', CHAPTER, CHAPTER2, 100, anchor ?? undefined),
], { chapterRenderedText: () => CHAPTER2 });
check('change list has renderedMarkAnchor', list[0]?.renderedMarkAnchor?.quote != null);
check('netWordDelta present', typeof list[0]?.netWordDelta === 'number');

const rollups = rollupChangesByChapter(list, [{ index: 1, title: 'One', id: 'ch-1' }], new Map([[1, 'One']]));
check('rollup line non-empty', formatChapterRollupLine(rollups[0]).length > 0);

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
