// ─── Extraction inspection harness ───────────────────────────────────────────
// Prints, for every real manuscript in fixtures/, exactly what ingestion would
// SURFACE to the author before they enter the reader: the detected title, the
// metadata we're confident in, and a scannable outline of front matter · chapters
// · back matter with word counts. This is the text-mode preview of the future
// import "review" card — run it against your own iCloud files (drop them in
// fixtures/, they're gitignored) to see detection quality on real, messy input.
//
//   npm run check-extraction
//
// No golden assertions — it's a scanning tool. It DOES flag obvious smells
// (article-only title, one giant chapter, no title, unclassified matter) so the
// eye is drawn to what's wrong.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import * as mammoth from 'mammoth';
import { preprocessMarkdown, hasHeading, MAMMOTH_STYLE_MAP } from '../src/engine/ingestion/preprocessMarkdown.ts';
import { countWords } from '../src/engine/ingestion/parseMarkdown.ts';
import { buildManuscriptStructure } from '../src/engine/ingestion/manuscriptStructure.ts';
import { extractFrontMatterCandidates } from '../src/engine/ingestion/frontMatterExtract.ts';
import { extractDocxSignals } from '../src/engine/ingestion/docxSignals.ts';
import { segmentDocx } from '../src/engine/ingestion/docxSegment.ts';
import { applySignalsToMarkdown } from '../src/engine/ingestion/docxBridge.ts';

const here = dirname(fileURLToPath(import.meta.url));

// Mirror fileReader.readDocx / plainToMarkdown exactly (incl. the signal bridge).
async function toMarkdown(path) {
  const isDocx = extname(path).toLowerCase() === '.docx';
  let text;
  if (isDocx) {
    const buffer = await readFile(path);
    const { value } = await mammoth.convertToMarkdown({ buffer }, { styleMap: MAMMOTH_STYLE_MAP });
    text = preprocessMarkdown(value.trim());
    try {
      const seg = segmentDocx(await extractDocxSignals(buffer));
      text = applySignalsToMarkdown(text, seg);
    } catch { /* signals are an enhancement, not a requirement */ }
  } else {
    text = preprocessMarkdown((await readFile(path, 'utf8')).trim());
  }
  const title = basename(path).replace(/\.(docx|md|txt)$/i, '').replace(/[-_]/g, ' ').trim();
  if (!hasHeading(text)) text = `# ${title}\n\n${text}`;
  else if (!/<!--\s*title:/i.test(text)) text = `<!-- title: ${title} -->\n\n${text}`;
  return text;
}

const sectionWords = (sec) => sec.blocks.reduce((n, b) => n + countWords(b.text), 0);
const w = (n) => `${n.toLocaleString()}w`;
const ARTICLE_ONLY = /^(?:(?:the|a|an|of|and|or|to|in|on|with|for|from)\b\s*)+$/i;

const files = (await readdir(here))
  .filter(f => /\.(docx|md|txt)$/i.test(f) && !f.startsWith('~$'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

for (const f of files) {
  const md = await toMarkdown(join(here, f));
  const s = buildManuscriptStructure(md);
  const cand = extractFrontMatterCandidates(s);
  const bodyWords = s.chapters.reduce((n, c) => n + sectionWords(c), 0);

  console.log('\n════════════════════════════════════════════════════════');
  console.log('FILE:      ', f);
  console.log('TITLE:     ', s.title || '(none)', cand.author ? `— ${cand.author}` : '');
  const meta = Object.entries(cand).filter(([k]) => k !== 'author').map(([k, v]) => `${k}=${String(v).slice(0, 40)}`);
  console.log('METADATA:  ', meta.length ? meta.join('  ·  ') : '(none detected)');

  console.log(`FRONT MATTER (${s.frontMatter.length}):`);
  for (const sec of s.frontMatter) console.log(`   · ${sec.role}${sec.title ? ` "${sec.title}"` : ''} — ${w(sectionWords(sec))}`);
  console.log(`CHAPTERS (${s.chapters.length}, ${w(bodyWords)} body):`);
  for (const c of s.chapters) console.log(`   [${String(c.index).padStart(2, '0')}] ${c.title} — ${w(sectionWords(c))}${c.sceneBreakCount ? ` · ${c.sceneBreakCount} scene breaks` : ''}`);
  console.log(`BACK MATTER (${s.backMatter.length}):`);
  for (const sec of s.backMatter) console.log(`   · ${sec.role}${sec.title ? ` "${sec.title}"` : ''} — ${w(sectionWords(sec))}`);

  // ── Smell flags (what a reviewer's eye should catch) ──
  const flags = [];
  if (!s.title) flags.push('no title detected');
  else if (ARTICLE_ONLY.test(s.title)) flags.push(`title is article-only ("${s.title}") — almost certainly truncated`);
  if (s.chapters.length === 1 && bodyWords > 4000) flags.push(`one ${w(bodyWords)} chapter — structure likely not detected`);
  if (s.chapters.length === 0) flags.push('no chapters');
  if (!cand.author) flags.push('no author detected');
  const avg = s.chapters.length ? bodyWords / s.chapters.length : 0;
  const tiny = s.chapters.filter(c => sectionWords(c) < 50);
  if (tiny.length) flags.push(`${tiny.length} chapter(s) under 50w — possible mis-splits`);
  if (flags.length) console.log('⚠  FLAGS:   ', flags.join('  ·  '));
}
console.log('');
