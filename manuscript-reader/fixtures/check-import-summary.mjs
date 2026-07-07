// ─── Import review summary golden check (assertions) ─────────────────────────
// Pins the decision layer behind the import review card (engine/ingestion/
// importSummary.ts): the front/chapters/back outline + word counts + smell flags
// it derives, and the title/author corrections it writes back through the
// ingestion seams. Synthetic post-preprocess markdown — deterministic, committable.
// Run: npm run check-import-summary
import { buildImportSummary, applyImportEdits } from '../src/engine/ingestion/importSummary.ts';

let failures = 0;
const fail = (msg) => { console.log('   ❌', msg); failures++; };
const ok = (msg) => console.log('   ✅', msg);
const eq = (label, got, want) =>
  got === want ? ok(`${label} → ${JSON.stringify(got)}`) : fail(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const BODY = 'The gate stuck fast at first light and the whole household knew the day had already turned against them before the bell had finished ringing across the frostbitten yard, and the servants moved quietly through the cold stone halls, lighting no lamps and speaking in the low careful voices that people use only when they are genuinely afraid of what the coming morning will ask of them.';

// A well-formed manuscript: title comment, title-page with a "by" line, dedication,
// two real chapters, an acknowledgements back-matter section.
const md = [
  '<!-- title: My Draft -->',
  '',
  '<!-- matter:front role="title-page" title="" -->',
  'by Jane Doe',
  '',
  'My Draft',
  '<!-- /matter -->',
  '',
  '<!-- matter:front role="dedication" title="Dedication" -->',
  'For everyone who waited.',
  '<!-- /matter -->',
  '',
  '# Chapter 1 — The Beginning',
  '',
  BODY,
  '',
  '# Chapter 2 — The Middle',
  '',
  BODY,
  '',
  '<!-- matter:back role="acknowledgements" title="Acknowledgements" -->',
  'With thanks to the early readers.',
  '<!-- /matter -->',
].join('\n');

console.log('buildImportSummary (well-formed):');
const s = buildImportSummary(md);
eq('title', s.title, 'My Draft');
eq('author', s.author, 'Jane Doe');
eq('chapter count', s.chapters.length, 2);
eq('chapter title (label stripped)', s.chapters[0].title, 'The Beginning');
(s.chapters[0].words > 0) ? ok(`chapter words counted (${s.chapters[0].words})`) : fail('chapter words zero');
eq('front matter sections', s.front.length, 2); // title-page + dedication
eq('back matter sections', s.back.length, 1);
eq('back matter role', s.back[0].role, 'acknowledgements');
(s.flags.length === 0) ? ok('no false smell flags on a clean manuscript') : fail(`unexpected flags: ${s.flags.map(f => f.message).join(' | ')}`);
// Structure-editor handles + previews (what the Structure stage acts on / renders).
eq('chapter 1 ordinal handle', s.chapters[0].chapterIndex, 1);
eq('chapter 2 ordinal handle', s.chapters[1].chapterIndex, 2);
eq('front section region handle', s.front[0].region, 'front');
eq('back section region handle', s.back[0].region, 'back');
(s.chapters[0].preview.length > 0) ? ok('chapter preview populated') : fail('chapter preview empty');
(s.back[0].preview.startsWith('With thanks')) ? ok('matter preview shows section prose') : fail(`matter preview wrong: ${s.back[0].preview}`);

console.log('applyImportEdits (round-trip):');
const edited = applyImportEdits(md, { title: 'The Real Title', author: 'Mary Shelley' });
const s2 = buildImportSummary(edited);
eq('corrected title survives re-parse', s2.title, 'The Real Title');
eq('corrected author survives re-parse', s2.author, 'Mary Shelley');
// Empty edits never blank out a detected value.
const s3 = buildImportSummary(applyImportEdits(md, { title: '', author: '' }));
eq('empty edits keep detected title', s3.title, 'My Draft');
eq('empty edits keep detected author', s3.author, 'Jane Doe');

console.log('buildImportSummary (smell flags):');
// One giant chapter + no author → both flags fire.
const giantBody = Array.from({ length: 80 }, () => BODY).join('\n\n');
const giant = ['<!-- title: Big Book -->', '', '# Chapter 1', '', giantBody].join('\n');
const g = buildImportSummary(giant);
(g.flags.some(f => /one chapter|chapter breaks/i.test(f.message)))
  ? ok('one-giant-chapter flagged') : fail('one-giant-chapter not flagged');
(g.flags.some(f => /no author/i.test(f.message)))
  ? ok('missing author flagged') : fail('missing author not flagged');
// A sub-50-word chapter → mis-split info flag.
const tiny = ['<!-- title: Tiny -->', '', '<!-- matter:front role="title-page" title="" -->', 'by A B', '', 'Tiny', '<!-- /matter -->', '', '# Chapter 1 — Short', '', 'Only a handful of words here.', '', '# Chapter 2 — Long', '', BODY].join('\n');
const t = buildImportSummary(tiny);
(t.flags.some(f => /under 50 words/i.test(f.message)))
  ? ok('sub-50-word chapter flagged') : fail('sub-50-word chapter not flagged');

console.log('');
if (failures > 0) { console.error(`${failures} assertion(s) FAILED`); process.exit(1); }
console.log('All import-summary assertions passed.');
