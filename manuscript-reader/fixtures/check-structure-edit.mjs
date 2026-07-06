// ─── Structure-edit golden check (assertions) ────────────────────────────────
// Pins the author's correction surface (engine/manuscript/structureEdit.ts): the
// chapter⇄matter reclassification, rename, and merge ops the Structure stage runs,
// plus the title-page metadata fallback and the ImportSummary handles/previews the
// editor renders. Synthetic post-preprocess markdown modeled on the real fixture-6
// (Aeneid) defects — deterministic, committable, no binary.
// Run: npm run check-structure-edit
import {
  renameChapter, mergeChapterUp, reclassifyChapterAsMatter, reclassifyMatterAsChapter,
} from '../src/engine/manuscript/structureEdit.ts';
import { buildImportSummary } from '../src/engine/ingestion/importSummary.ts';
import { buildManuscriptStructure } from '../src/engine/ingestion/manuscriptStructure.ts';

let failures = 0;
const fail = (msg) => { console.log('   ❌', msg); failures++; };
const ok = (msg) => console.log('   ✅', msg);
const eq = (label, got, want) =>
  got === want ? ok(`${label} → ${JSON.stringify(got)}`) : fail(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const truthy = (label, v) => v ? ok(`${label}`) : fail(`${label}: got ${JSON.stringify(v)}`);

const BODY = 'The gate stuck fast at first light and the whole household knew the day had already turned against them, and the servants moved quietly through the cold stone halls speaking in low careful voices.';
const BIO = 'Rolfe Humphries was a poet and translator, born in Philadelphia in 1894, who taught Latin for many years and rendered Virgil and Ovid into supple modern English verse admired by generations of readers.';
const CASTLEAD = 'In the fighting between the Greeks and the Trojans the following characters play the most important parts, and the reader may wish to consult this list before beginning the narrative that follows.';
const CASTLIST = 'Aeneas, a Trojan prince.\n\nDido, queen of Carthage.\n\nTurnus, king of the Rutulians.';

// Fixture-6 shape: a title-page fence whose PROSE carries the copyright/ISBN/date
// (no separate copyright section), a bio mis-read as a chapter, and a cast lead-in
// split off from the cast matter section.
const md = [
  '<!-- title: The Aeneid -->',
  '',
  '<!-- matter:front role="title-page" title="" -->',
  'The Aeneid',
  '',
  'by Rolfe Humphries',
  '',
  'Copyright © 1951 by Rolfe Humphries',
  'ISBN 978-0-684-82761-3',
  'First printing, March 1951',
  '<!-- /matter -->',
  '',
  '# Book 1',
  '',
  BODY,
  '',
  '# His Life and Times',
  '',
  BIO,
  '',
  '# A List of the Important Characters in the Narrative Follows:',
  '',
  CASTLEAD,
  '',
  '<!-- matter:back role="cast" title="Cast of Characters" -->',
  CASTLIST,
  '<!-- /matter -->',
].join('\n');

// ── ImportSummary: metadata fallback + handles + previews ────────────────────
console.log('buildImportSummary (title-page metadata fallback + handles):');
const s = buildImportSummary(md);
eq('author from title page', s.author, 'Rolfe Humphries');
eq('copyright year from title-page prose', s.metadata.copyrightYear, '1951');
eq('isbn from title-page prose', s.metadata.isbn, '978-0-684-82761-3');
eq('publication date from title-page prose', s.metadata.publicationDate, 'March 1951');
eq('chapter count', s.chapters.length, 3);
eq('chapter 1 ordinal handle', s.chapters[0].chapterIndex, 1);
eq('chapter 2 ordinal handle', s.chapters[1].chapterIndex, 2);
eq('front region handle', s.front[0].region, 'front');
eq('back region handle', s.back[0].region, 'back');
truthy('chapter preview is non-empty', s.chapters[0].preview.length > 0);
truthy('bio chapter preview starts with the bio prose', s.chapters[1].preview.startsWith('Rolfe Humphries was a poet'));

// ── renameChapter ────────────────────────────────────────────────────────────
console.log('renameChapter:');
const renamed = buildImportSummary(renameChapter(md, 1, 'Book One'));
eq('chapter 1 renamed', renamed.chapters[0].title, 'Book One');
eq('other chapters untouched', renamed.chapters[1].title, 'His Life and Times');
eq('rename left matter intact', renamed.back.length, 1);
eq('rename out-of-range is a no-op', renameChapter(md, 9, 'X'), md);

// ── reclassifyChapterAsMatter (the "His Life and Times" → about-author fix) ───
console.log('reclassifyChapterAsMatter:');
const asMatter = reclassifyChapterAsMatter(md, 2, 'back', 'about-author');
const sm = buildImportSummary(asMatter);
eq('chapter removed from spine', sm.chapters.length, 2);
eq('remaining chapter 2 is the cast lead-in', sm.chapters[1].title, 'A List of the Important Characters in the Narrative Follows:');
const bio = sm.back.find(x => x.role === 'about-author');
truthy('about-author section created', !!bio);
eq('about-author title from chapter heading', bio?.title, 'His Life and Times');
truthy('about-author carries the bio prose', bio?.preview.includes('Rolfe Humphries was a poet'));
eq('pre-existing cast matter still present', !!sm.back.find(x => x.role === 'cast'), true);
truthy('title comment survives reclassify', /<!--\s*title:\s*The Aeneid\s*-->/.test(asMatter));

// ── reclassifyMatterAsChapter (inverse) ──────────────────────────────────────
console.log('reclassifyMatterAsChapter:');
const castIdx = s.back.findIndex(x => x.role === 'cast');
const asChapter = reclassifyMatterAsChapter(md, 'back', castIdx);
const sc = buildImportSummary(asChapter);
eq('cast is now a chapter (appended last)', sc.chapters[sc.chapters.length - 1].title, 'Cast of Characters');
eq('chapter count grew by one', sc.chapters.length, 4);
eq('cast removed from back matter', sc.back.find(x => x.role === 'cast'), undefined);
eq('reclassify missing index is a no-op', reclassifyMatterAsChapter(md, 'back', 9), md);

// ── duplicate title-page: promote the LONG one (index 1) without losing the short title page ──
console.log('duplicate title-page (fixture-6 foreword mis-filed):');
const dupMd = [
  '<!-- title: The Aeneid -->',
  '',
  '<!-- matter:front role="title-page" title="" -->',
  'The Aeneid',
  '',
  'by Rolfe Humphries',
  '<!-- /matter -->',
  '',
  '<!-- matter:front role="title-page" title="A Foreword by Rolfe Humphries" -->',
  'FOREWORD BODY '.repeat(200),
  '<!-- /matter -->',
  '',
  '# Book 1',
  '',
  BODY,
].join('\n');
const dupSummary = buildImportSummary(dupMd);
eq('two front title-page rows', dupSummary.front.length, 2);
const promotedForeword = reclassifyMatterAsChapter(dupMd, 'front', 1);
const afterPromote = buildImportSummary(promotedForeword);
eq('still one title-page fence after promoting the second', afterPromote.front.filter(x => x.role === 'title-page').length, 1);
eq('foreword became first chapter', afterPromote.chapters[0].title, 'A Foreword by Rolfe Humphries');
truthy('short title page body retained', afterPromote.front[0].preview.includes('The Aeneid'));

// ── cast merge: chapter → cast when cast already exists ──────────────────────
console.log('reclassifyChapterAsMatter cast merge:');
const castMerge = reclassifyChapterAsMatter(md, 3, 'back', 'cast');
const cm = buildImportSummary(castMerge);
eq('cast chapter removed', cm.chapters.length, 2);
const castSec = cm.back.find(x => x.role === 'cast');
truthy('single cast section', !!castSec);
truthy('cast includes lead-in prose', castSec?.preview.includes('Greeks and the Trojans'));
truthy('cast still includes list names', castSec?.preview.includes('Aeneas') || (castMerge.includes('Dido')));

// ── mergeChapterUp ───────────────────────────────────────────────────────────
console.log('mergeChapterUp:');
const merged = mergeChapterUp(md, 2); // fold "His Life and Times" prose into Book 1
const smg = buildImportSummary(merged);
eq('one fewer chapter after merge', smg.chapters.length, 2);
truthy('merged chapter 1 now contains both bodies', smg.chapters[0].words > s.chapters[0].words);
eq('merge into chapter 1 is a no-op (nothing above)', mergeChapterUp(md, 1), md);

// ── Fence contract: no op corrupts the structural model ──────────────────────
console.log('fence contract (no re-preprocess corruption):');
for (const [label, out] of [
  ['renameChapter', renameChapter(md, 1, 'Book One')],
  ['reclassifyChapterAsMatter', asMatter],
  ['reclassifyMatterAsChapter', asChapter],
  ['mergeChapterUp', merged],
]) {
  const st = buildManuscriptStructure(out);
  const fenceCount = (out.match(/<!--\s*matter:/g) || []).length;
  const closeCount = (out.match(/<!--\s*\/matter\s*-->/g) || []).length;
  (fenceCount === closeCount && st.frontMatter.length >= 1)
    ? ok(`${label}: fences balanced (${fenceCount}) & title page retained`)
    : fail(`${label}: fenceCount=${fenceCount} closeCount=${closeCount} front=${st.frontMatter.length}`);
}

console.log('');
if (failures > 0) { console.error(`${failures} assertion(s) FAILED`); process.exit(1); }
console.log('All structure-edit assertions passed.');
