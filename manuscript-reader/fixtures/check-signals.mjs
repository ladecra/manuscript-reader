// ─── DOCX layout-signal inspection harness ───────────────────────────────────
// The visibility tool for the layout-signal extraction pass (dev-plan §ingestion
// priority #1). Prints, for every .docx in fixtures/, the per-paragraph layout +
// style signals we recover from the ORIGINAL OOXML — before mammoth flattens them
// away. This is how we SEE what structural evidence a real manuscript actually
// carries (centered chapter heads? page breaks? a font hierarchy? or nothing?),
// so the evidence-classifier is designed against real data, not guesses.
//
//   npm run check-signals
//
// No golden assertions — a scanning tool, like check-extraction. Drop real files
// in fixtures/ (gitignored) to inspect detection substrate on messy input.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractDocxSignals } from '../src/engine/ingestion/docxSignals.ts';

const here = dirname(fileURLToPath(import.meta.url));

const files = (await readdir(here))
  .filter(f => /\.docx$/i.test(f) && !f.startsWith('~$'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const flag = (p, bodySz) => {
  const t = [];
  if (p.pageBreakBefore) t.push('¶break');
  if (p.alignment === 'center') t.push('center');
  else if (p.alignment && p.alignment !== 'left') t.push(p.alignment);
  if (p.styleName) t.push(`style:${p.styleName}`);
  if (p.allCaps) t.push('CAPS');
  if (p.bold) t.push('bold');
  if (p.italic) t.push('italic');
  if (p.fontSizeHalfPts && bodySz && p.fontSizeHalfPts !== bodySz) {
    t.push(`${p.fontSizeHalfPts / 2}pt${p.fontSizeHalfPts > bodySz ? '↑' : '↓'}`);
  }
  return t.join(' ');
};

for (const f of files) {
  const bytes = await readFile(join(here, f));
  const { paragraphs, bodyFontSizeHalfPts } = await extractDocxSignals(bytes);
  const nonEmpty = paragraphs.filter(p => !p.empty);

  console.log('\n════════════════════════════════════════════════════════');
  console.log('FILE:      ', f);
  console.log(`PARAGRAPHS: ${paragraphs.length} (${nonEmpty.length} non-empty)  ·  body font: ${bodyFontSizeHalfPts ? bodyFontSizeHalfPts / 2 + 'pt' : '(undeclared)'}`);
  // Show the first 30 non-empty paragraphs (enough to see title page + first
  // chapter boundaries), plus any later paragraph that carries a strong signal.
  const shown = new Set();
  const strong = (p) => p.pageBreakBefore || p.alignment === 'center' || p.styleName || (p.allCaps && p.text.length < 60);
  let printed = 0;
  for (const p of nonEmpty) {
    const isEarly = printed < 30;
    if (!isEarly && !strong(p)) continue;
    shown.add(p.index);
    const sig = flag(p, bodyFontSizeHalfPts);
    const preview = p.text.length > 54 ? p.text.slice(0, 54) + '…' : p.text;
    console.log(`  [${String(p.index).padStart(3)}] ${sig ? `{${sig}}` : ''.padEnd(2)}  ${JSON.stringify(preview)}`);
    printed++;
  }
}
console.log('');
