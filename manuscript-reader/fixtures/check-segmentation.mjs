// ─── DOCX segmentation inspection harness ────────────────────────────────────
// Runs the evidence-scoring segmenter (docxSegment.ts) over the layout signals of
// every .docx in fixtures/ and prints what it PROPOSES: title, author, and the
// ordered divisions / chapters / matter headings with confidence + the evidence
// that produced each call. This is the proof-on-the-corpus gate that must look
// right before the proposals are bridged into real ingestion (augment-first).
//
//   npm run check-segmentation
//
// No golden assertions yet — a scanning tool. Read it next to check-extraction:
// this shows what the layout layer recovers that the text pipeline misses.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractDocxSignals } from '../src/engine/ingestion/docxSignals.ts';
import { segmentDocx } from '../src/engine/ingestion/docxSegment.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pct = (c) => `${Math.round(c * 100)}%`;

const files = (await readdir(here))
  .filter(f => /\.docx$/i.test(f) && !f.startsWith('~$'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

for (const f of files) {
  const bytes = await readFile(join(here, f));
  const signals = await extractDocxSignals(bytes);
  const seg = segmentDocx(signals);

  console.log('\n════════════════════════════════════════════════════════');
  console.log('FILE:      ', f);
  console.log(`TITLE:      ${seg.title ? `"${seg.title.text}" (${pct(seg.title.confidence)})  [${seg.title.evidence.join(', ')}]` : '(none)'}`);
  console.log(`AUTHOR:     ${seg.author ? `"${seg.author.text}" (${pct(seg.author.confidence)})  [${seg.author.evidence.join(', ')}]` : '(none)'}`);
  const divisions = seg.headings.filter(h => h.role === 'division');
  const chapters = seg.headings.filter(h => h.role === 'chapter');
  const matter = seg.headings.filter(h => h.role === 'matter');
  console.log(`STRUCTURE:  ${divisions.length} division(s) · ${chapters.length} chapter(s) · ${matter.length} matter · ${seg.tocIndices.length} TOC ¶ dropped`);
  for (const h of seg.headings) {
    const tag = h.role === 'division' ? 'PART' : h.role === 'matter' ? `matter:${h.matterRole}` : 'ch';
    console.log(`   [${String(h.index).padStart(3)}] ${tag.padEnd(14)} ${pct(h.confidence).padStart(4)}  "${h.text.length > 44 ? h.text.slice(0, 44) + '…' : h.text}"  [${h.evidence.join(', ')}]`);
  }
}
console.log('');
