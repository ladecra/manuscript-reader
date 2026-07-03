// ─── DOCX signal / segmentation / bridge golden check (assertions) ───────────
// The committable regression guard for the layout-signal ingestion pass. The real
// .docx fixtures are gitignored (unpublished manuscripts), so this pins behavior
// against a SYNTHETIC OOXML document.xml built inline — deterministic, no binary,
// runnable anywhere. It exercises the whole pure chain:
//   parseDocxParagraphs → segmentDocx → buildImportReview → applySignalsToMarkdown
// mirroring the real title-page-pyramid / TOC / page-broken-chapter / matter shapes
// the scan harnesses (check-signals, check-segmentation) surface on real files.
// Run: npm run check-docx-signals
import { parseDocxParagraphs } from '../src/engine/ingestion/docxSignals.ts';
import { segmentDocx } from '../src/engine/ingestion/docxSegment.ts';
import { buildImportReview, applySignalsToMarkdown } from '../src/engine/ingestion/docxBridge.ts';

let failures = 0;
const fail = (msg) => { console.log('   ❌', msg); failures++; };
const ok = (msg) => console.log('   ✅', msg);
const eq = (label, got, want) =>
  got === want ? ok(`${label} → ${JSON.stringify(got)}`) : fail(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── Synthetic OOXML builder ──────────────────────────────────────────────────
// p({ style, jc, br, sz, b, caps }, text) → one <w:p>. Half-point sizes (24 = 12pt).
const rpr = (o) => {
  const parts = [];
  if (o.sz) parts.push(`<w:sz w:val="${o.sz}"/>`);
  if (o.b) parts.push('<w:b/>');
  if (o.caps) parts.push('<w:caps/>');
  return parts.length ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
};
const ppr = (o) => {
  const parts = [];
  if (o.style) parts.push(`<w:pStyle w:val="${o.style}"/>`);
  if (o.jc) parts.push(`<w:jc w:val="${o.jc}"/>`);
  if (o.br) parts.push('<w:pageBreakBefore/>');
  return parts.length ? `<w:pPr>${parts.join('')}</w:pPr>` : '';
};
const p = (o, text) => `<w:p>${ppr(o)}<w:r>${rpr(o)}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const blank = '<w:p/>';
const BODY = 'The gate stuck fast at first light and the whole household knew the day had already turned against them.';

const xml = `<?xml version="1.0"?><w:document><w:body>
${p({ jc: 'center', sz: 72 }, 'Frostglass')}
${blank}
${p({ jc: 'center', sz: 36, caps: true }, 'JANE DOE')}
${p({ jc: 'center', sz: 16 }, 'Copyright © 2025 Jane Doe')}
${p({ jc: 'center', sz: 16 }, 'All rights reserved.')}
${p({ jc: 'center', sz: 20 }, 'Contents')}
${p({ style: 'TOC1' }, 'The Beginning\t1')}
${p({ style: 'TOC1' }, 'The Middle\t20')}
${p({ br: true, jc: 'center', caps: true, b: true, sz: 22 }, 'CHAPTER 1')}
${p({ jc: 'center', caps: true, sz: 28 }, 'THE BEGINNING')}
${p({ sz: 24 }, BODY)}
${p({ sz: 24 }, BODY)}
${p({ br: true, jc: 'center', caps: true, b: true, sz: 22 }, 'CHAPTER 2')}
${p({ jc: 'center', caps: true, sz: 28 }, 'THE MIDDLE')}
${p({ sz: 24 }, BODY)}
${p({ br: true, jc: 'center', caps: true, sz: 22 }, 'ACKNOWLEDGEMENTS')}
${p({ sz: 24 }, 'With thanks to everyone who read the early drafts and said nothing kind but everything useful.')}
</w:body></w:document>`;

// ── parseDocxParagraphs ──────────────────────────────────────────────────────
console.log('parseDocxParagraphs:');
const paras = parseDocxParagraphs(xml);
const nonEmpty = paras.filter((x) => !x.empty);
eq('non-empty paragraph count', nonEmpty.length, 16);
const titleP = paras.find((x) => x.text === 'Frostglass');
eq('title alignment', titleP.alignment, 'center');
eq('title font size', titleP.fontSizeHalfPts, 72);
const ch1 = paras.find((x) => x.text === 'CHAPTER 1');
eq('chapter 1 pageBreakBefore', ch1.pageBreakBefore, true);
eq('chapter 1 allCaps', ch1.allCaps, true);
eq('chapter 1 bold', ch1.bold, true);
const authorP = paras.find((x) => x.text === 'JANE DOE');
eq('author allCaps', authorP.allCaps, true);

// ── segmentDocx ──────────────────────────────────────────────────────────────
console.log('segmentDocx:');
const seg = segmentDocx({ paragraphs: paras, bodyFontSizeHalfPts: 24 });
eq('detected title', seg.title?.text, 'Frostglass');
eq('detected author', seg.author?.text, 'JANE DOE');
const chapters = seg.headings.filter((h) => h.role === 'chapter');
const matter = seg.headings.filter((h) => h.role === 'matter');
eq('chapter count', chapters.length, 2);
eq('chapter 1 merged label+title', chapters[0].text, 'CHAPTER 1 THE BEGINNING');
eq('matter count', matter.length, 1);
eq('matter role', matter[0].matterRole, 'acknowledgements');
(seg.tocIndices.length >= 2)
  ? ok(`TOC dropped (${seg.tocIndices.length} ¶)`)
  : fail(`TOC not dropped: ${seg.tocIndices.length}`);
// The title page's centered/caps lines (title, author, publisher) must NOT become chapters.
(chapters.every((c) => c.index > authorP.index))
  ? ok('title-page lines not misread as chapters')
  : fail('a title-page line was misclassified as a chapter');

// ── buildImportReview ────────────────────────────────────────────────────────
console.log('buildImportReview:');
const review = buildImportReview(seg);
eq('review title', review.title?.text, 'Frostglass');
eq('review chapters', review.chapters.length, 2);
eq('review matter', review.matter.length, 1);
(review.title.evidence.length > 0 && typeof review.title.confidence === 'number')
  ? ok('proposals carry confidence + evidence')
  : fail('proposal missing confidence/evidence');

// ── applySignalsToMarkdown ───────────────────────────────────────────────────
console.log('applySignalsToMarkdown:');
// A minimal already-preprocessed markdown with a filename title + title-page fence.
const pre = [
  '<!-- title: frostglass draft final -->',
  '',
  '<!-- matter:front role="title-page" title="" -->',
  'Frostglass',
  '',
  'Jane Doe',
  '<!-- /matter -->',
  '',
  '# Chapter 1 — The Beginning',
  '',
  BODY,
].join('\n');
const bridged = applySignalsToMarkdown(pre, seg);
(/<!--\s*title:\s*Frostglass\s*-->/.test(bridged))
  ? ok('confident title replaces the filename title')
  : fail('title not replaced');
(/^by JANE DOE$/m.test(bridged))
  ? ok('author injected as a "by" line')
  : fail('author not injected');
// Idempotent + non-destructive: a fence that already has a "by" line is untouched.
const already = applySignalsToMarkdown(bridged, seg);
(already.match(/^by /gm)?.length === 1)
  ? ok('author injection is idempotent (no duplicate "by")')
  : fail(`duplicate "by" lines: ${already.match(/^by /gm)?.length}`);

console.log('');
if (failures > 0) { console.error(`${failures} assertion(s) FAILED`); process.exit(1); }
console.log('All docx-signal assertions passed.');
