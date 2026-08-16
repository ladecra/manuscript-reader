// ─── Fixture check (golden-file by inspection) ──────────────────────────────
// Runs every .docx/.md/.txt in fixtures/ through the SAME pipeline the app uses
// (mammoth convertToMarkdown → preprocessMarkdown → parseMarkdown) and prints
// the detected title, chapter count, and chapter titles. No assertions — read
// the output by eye. Run with: npm run check-fixtures
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import * as mammoth from 'mammoth';
import { MAMMOTH_STYLE_MAP } from '../src/engine/ingestion/preprocessMarkdown.ts';
import { parseMarkdown, countWords } from '../src/engine/ingestion/parseMarkdown.ts';
import { ingestPlainText, ingestDocxFromMarkdown } from '../src/engine/ingestion/fileReader.ts';
import { buildManuscriptStructure } from '../src/engine/ingestion/manuscriptStructure.ts';
import { extractFrontMatterCandidates } from '../src/engine/ingestion/frontMatterExtract.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Compact "role:count role:count" tally of a block list, in a stable order. */
const ROLE_ORDER = ['chapter-heading', 'subheading', 'paragraph', 'blockquote', 'scene-break', 'list', 'code'];
function roleTally(blocks) {
  const counts = {};
  for (const b of blocks) counts[b.role] = (counts[b.role] ?? 0) + 1;
  return ROLE_ORDER.filter(r => counts[r]).map(r => `${r}:${counts[r]}`).join('  ') || '(none)';
}

// Calls the real engine entry (fileReader.ingestDocxFromMarkdown) so the harness
// runs the SAME signal-rescue + title-fallback path the app does — only the
// mammoth conversion is done here (Node buffer) rather than in the browser. The
// original bytes are handed on so the DOCX layout signals are mined for real.
async function docxToMarkdown(path) {
  const buffer = await readFile(path);
  const result = await mammoth.convertToMarkdown({ buffer }, { styleMap: MAMMOTH_STYLE_MAP });
  return ingestDocxFromMarkdown(result.value, buffer, { filename: basename(path) });
}

// Calls the real engine entry (fileReader.ingestPlainText) rather than a hand
// copy, so the harness can't drift from the app's actual .md/.txt/paste path.
async function plainToMarkdown(path) {
  const raw = await readFile(path, 'utf8');
  const title = basename(path).replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ').trim();
  return ingestPlainText(raw, { title });
}

const files = (await readdir(here))
  .filter(f => /\.(docx|md|txt)$/i.test(f) && !f.startsWith('~$')) // skip Word ~$ lock files
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

let assertFailures = 0;
for (const f of files) {
  const path = join(here, f);
  const md = extname(f).toLowerCase() === '.docx'
    ? await docxToMarkdown(path)
    : await plainToMarkdown(path);

  const titleComment = md.match(/<!--\s*title:\s*(.+?)\s*-->/i);
  const h1 = md.match(/^# (.+)$/m);
  const title = titleComment ? titleComment[1].trim() : h1 ? h1[1].trim() : '(none)';
  const { chapters } = parseMarkdown(md);

  console.log('\n────────────────────────────────────────────────────────');
  console.log('FILE:   ', f);
  console.log('TITLE:  ', title);
  console.log('WORDS:  ', countWords(md));
  console.log('CHAPTERS:', chapters.length);
  for (const c of chapters) console.log(`   [${String(c.index).padStart(2, '0')}] ${c.title}`);

  // ── Structural model (Stage 0) ──
  const structure = buildManuscriptStructure(md);
  const sceneBreaks = structure.chapters.reduce((n, c) => n + c.sceneBreakCount, 0);
  const matterTally = (secs) => secs.map(s => `${s.role}${s.title ? `("${s.title}")` : ''}:${s.blocks.length}b`).join('  ') || '(none)';
  console.log('STRUCTURE:');
  console.log('   front matter:', structure.frontMatter.length, 'sections', `[${matterTally(structure.frontMatter)}]`);
  console.log('   body chapters:      ', structure.chapters.length, `· scene breaks: ${sceneBreaks}`);
  console.log('   back matter: ', structure.backMatter.length, 'sections', `[${matterTally(structure.backMatter)}]`);
  console.log('   block roles (all):  ', roleTally(structure.blocks));
  const withBreaks = structure.chapters.filter(c => c.sceneBreakCount > 0);
  if (withBreaks.length) {
    console.log('   scene breaks by chapter:');
    for (const c of withBreaks) console.log(`      [${String(c.index).padStart(2, '0')}] ${c.sceneBreakCount} · ${c.title}`);
  }
  // ── Metadata extraction (candidates — non-authoritative) ──
  const cand = extractFrontMatterCandidates(structure);
  if (Object.keys(cand).length) {
    console.log('   extracted candidates:', JSON.stringify(cand));
  }

  // ── Assertions for the synthetic front/back-matter fixture ──
  if (f === 'markdown-frontmatter.md') {
    const fail = [];
    const frontRoles = structure.frontMatter.map(s => s.role);
    const backRoles = structure.backMatter.map(s => s.role);
    if (title !== 'The Lantern Keeper') fail.push(`title=${title}`);
    if (chapters.length !== 2) fail.push(`chapters=${chapters.length} (TOC not excised?)`);
    if (sceneBreaks !== 1) fail.push(`sceneBreaks=${sceneBreaks}`);
    for (const r of ['copyright', 'dedication', 'epigraph', 'foreword']) if (!frontRoles.includes(r)) fail.push(`front missing ${r}`);
    for (const r of ['acknowledgements', 'about-author']) if (!backRoles.includes(r)) fail.push(`back missing ${r}`);
    if (cand.isbn !== '978-1-23456-789-0') fail.push(`isbn=${cand.isbn}`);
    if (cand.copyrightYear !== '2025') fail.push(`copyrightYear=${cand.copyrightYear}`);
    if (!/Jane Marlowe/.test(cand.author ?? '')) fail.push(`author=${cand.author}`);
    if (!/Eleanor/.test(cand.dedication ?? '')) fail.push(`dedication=${cand.dedication}`);
    if (fail.length) { console.log('   ❌ ASSERTIONS FAILED:', fail.join(' · ')); assertFailures += fail.length; }
    else console.log('   ✅ front/back-matter capture + extraction assertions passed');
  }
}
console.log('');
if (assertFailures > 0) { console.error(`\n${assertFailures} assertion(s) FAILED`); process.exit(1); }
