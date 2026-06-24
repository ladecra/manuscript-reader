// ─── editRenderedNeedle check (Phase 8, Changes mode) ───────────────────────
// The pure source-markdown → rendered-text reduction used to re-locate an edited
// passage in the prose. Verifies the inline-markdown subset is stripped and
// whitespace normalized.
//   Run with: npm run check-edit-needle
import { editRenderedNeedle } from '../src/engine/manuscript/editRenderedText.ts';

let failures = 0;
function check(label, got, want) {
  const ok = got === want;
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}${ok ? '' : `\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`}`);
  if (!ok) failures++;
}

check('plain text unchanged', editRenderedNeedle('The walls are busy enough already.'), 'The walls are busy enough already.');
check('strips bold', editRenderedNeedle('The **walls** are busy.'), 'The walls are busy.');
check('strips italic (asterisk)', editRenderedNeedle('A *quiet* room.'), 'A quiet room.');
check('strips italic (underscore)', editRenderedNeedle('A _quiet_ room.'), 'A quiet room.');
check('strips bold-italic', editRenderedNeedle('A ***loud*** room.'), 'A loud room.');
check('strips inline code', editRenderedNeedle('Run `npm test` now.'), 'Run npm test now.');
check('link → text', editRenderedNeedle('See [the map](http://x) here.'), 'See the map here.');
check('image → alt', editRenderedNeedle('![a cove](cove.png) at dawn'), 'a cove at dawn');
check('collapses newlines + whitespace', editRenderedNeedle('The road\n\n  inland   was long.'), 'The road inland was long.');
check('mixed inline formatting', editRenderedNeedle('**Master Holt.** *Flat.* What is she `wearing`?'), 'Master Holt. Flat. What is she wearing?');
check('strips heading marker', editRenderedNeedle('## Philosopher of Change'), 'Philosopher of Change');
check('strips blockquote marker', editRenderedNeedle('> a quiet line'), 'a quiet line');
check('strips list bullet', editRenderedNeedle('- first item'), 'first item');
check('undoes backslash escapes', editRenderedNeedle('Circa 535\\-475 BC'), 'Circa 535-475 BC');
check('heading wrapped in italics (real artifact)', editRenderedNeedle('*## Philosopher of Change · Circa 535-475 BC*'), 'Philosopher of Change · Circa 535-475 BC');
check('empty → empty', editRenderedNeedle('   '), '');

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
