// ─── Share-reader version-id parity check ───────────────────────────────────
// The self-contained shareable-reader HTML stamps each beta-reader's feedback with
// a manuscriptVersionId. That id is the content address the whole Layer A share
// contract leans on (validateFeedbackImport, snapshot binding). The export ships as
// an HTML string and can't import the engine at runtime, so it INLINES the app's
// manuscriptVersionId via its own `.toString()` source — one source of truth.
//
// This check guards that contract two ways:
//   A. The inlined source round-trips to a function that agrees with the app's
//      manuscriptVersionId byte-for-byte across a battery of inputs.
//   B. The built HTML actually contains that source — so if anyone ever reverts to
//      a hand-copied algorithm (the old drift hazard), this fails loudly.
//   Run with: npm run check-share-parity
import {
  manuscriptVersionId,
  manuscriptVersionIdSource,
} from '../src/engine/manuscript/manuscriptVersion.ts';
import { buildShareableHTML } from '../src/engine/exports/shareableReader.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

// Reconstruct the inlined function exactly as the browser would.
const src = manuscriptVersionIdSource();
const inlined = new Function(`return ${src};`)();

console.log('\nA. Inlined source agrees with the app function');
const battery = [
  '',
  'a',
  'Chapter One\n\nIt was a dark and stormy night.',
  '# 1\n\nThe quick brown fox.',
  'café — naïve — façade — Ω≈ł€',          // multi-byte / unicode
  '\n\n\r\n\t mixed whitespace \r ',
  'x'.repeat(50_000),                       // large body
  '🜲 emoji and 𝔣𝔯𝔞𝔨𝔱𝔲𝔯 surrogate pairs',
];
for (const s of battery) {
  const label = JSON.stringify(s.length > 32 ? s.slice(0, 29) + '…' : s);
  check(`same id for ${label}`, inlined(s) === manuscriptVersionId(s));
}

console.log('\nB. Built HTML inlines the engine source (no hand-copy)');
const md = '# 1\n\nThe quick brown fox jumps over the lazy dog.\n\n# 2\n\nThe end.';
const annotated = buildShareableHTML('Parity Test', md, true);
const plain = buildShareableHTML('Parity Test', md, false);

check('annotated reader contains the inlined manuscriptVersionId source',
  annotated.includes(src));
check('annotated reader assigns it to versionId',
  annotated.includes(`var versionId = ${src}`));
check('annotated reader stamps MS_VERSION from it',
  annotated.includes('var MS_VERSION = versionId(md)'));
// The plain (no-annotation) reader has no feedback payload, so it carries no
// version runtime — guard that we didn't accidentally start leaking one.
check('plain reader does not embed the version runtime',
  !plain.includes('var MS_VERSION = versionId(md)'));

// Sanity: the id the export would stamp for this manuscript equals the app's.
check('end-to-end: export id matches app id for the sample manuscript',
  inlined(md) === manuscriptVersionId(md));

console.log(`\n${failures === 0 ? '✓ all parity checks passed' : `✗ ${failures} parity check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
