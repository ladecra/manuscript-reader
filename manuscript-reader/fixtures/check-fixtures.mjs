// ─── Fixture check (golden-file by inspection) ──────────────────────────────
// Runs every .docx/.md/.txt in fixtures/ through the SAME pipeline the app uses
// (mammoth convertToMarkdown → preprocessMarkdown → parseMarkdown) and prints
// the detected title, chapter count, and chapter titles. No assertions — read
// the output by eye. Run with: npm run check-fixtures
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import * as mammoth from 'mammoth';
import {
  preprocessMarkdown,
  hasHeading,
  MAMMOTH_STYLE_MAP,
} from '../src/engine/ingestion/preprocessMarkdown.ts';
import { parseMarkdown, countWords } from '../src/engine/ingestion/parseMarkdown.ts';

const here = dirname(fileURLToPath(import.meta.url));

// Mirror fileReader.readDocx exactly.
async function docxToMarkdown(path) {
  const buffer = await readFile(path);
  const result = await mammoth.convertToMarkdown({ buffer }, { styleMap: MAMMOTH_STYLE_MAP });
  let text = preprocessMarkdown(result.value.trim());
  const title = basename(path).replace(/\.docx$/i, '').replace(/[-_]/g, ' ').trim();
  if (!hasHeading(text)) {
    text = `# ${title}\n\n${text}`;
  } else if (!/<!--\s*title:/i.test(text)) {
    text = `<!-- title: ${title} -->\n\n${text}`;
  }
  return text;
}

async function plainToMarkdown(path) {
  const raw = await readFile(path, 'utf8');
  let text = preprocessMarkdown(raw.trim());
  if (!hasHeading(text)) {
    const title = basename(path).replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ');
    text = `# ${title}\n\n${text}`;
  }
  return text;
}

const files = (await readdir(here))
  .filter(f => /\.(docx|md|txt)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

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
}
console.log('');
