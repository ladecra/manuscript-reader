// ─── Publication-grade DOCX structural check (headless golden file) ───────────
// Builds a real .docx from the front/back-matter fixture through the SAME engine the
// app uses (preprocessMarkdown → buildManuscriptDocxDocument → Packer), unzips it,
// and asserts the typographic structure: 5.5×8.5 trim, multiple sections (per-chapter),
// running heads + page-number footers, a regenerated TOC field, justified body with
// widow control. Run with: npm run check-docx
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Packer } from 'docx';
import { preprocessMarkdown } from '../src/engine/ingestion/preprocessMarkdown.ts';
import { buildManuscriptDocxDocument } from '../src/engine/exports/manuscriptDocx.ts';

const here = dirname(fileURLToPath(import.meta.url));
const raw = await readFile(join(here, 'markdown-frontmatter.md'), 'utf8');
const md = preprocessMarkdown(raw.trim());

const meta = {
  title: 'The Lantern Keeper',
  author: 'Jane Marlowe',
  publishing: {
    subtitle: 'A Novel', copyrightYear: '2025', copyrightHolder: 'Jane Marlowe',
    isbn: '978-1-23456-789-0', edition: 'First edition', rights: 'All rights reserved',
    publicationDate: 'March 2025', publisher: 'Lamplight Press', language: 'English',
  },
};

const doc = buildManuscriptDocxDocument(meta, md);
const buf = await Packer.toBuffer(doc);
const dir = mkdtempSync(join(tmpdir(), 'docxcheck-'));
const path = join(dir, 'out.docx');
writeFileSync(path, buf);

const read = (entry) => execFileSync('unzip', ['-p', path, entry], { encoding: 'utf8', maxBuffer: 1 << 24 });
const list = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' });
const docXml = read('word/document.xml');

let failures = 0;
const check = (name, cond) => { console.log(`  ${cond ? '✓' : '✗'}  ${name}`); if (!cond) failures++; };

const sectPrCount = (docXml.match(/<w:sectPr\b/g) || []).length;
const headerFiles = (list.match(/word\/header\d+\.xml/g) || []).length;
const footerFiles = (list.match(/word\/footer\d+\.xml/g) || []).length;
const footerXml = (list.match(/word\/footer(\d+)\.xml/g) || []).map(f => read(f)).join('\n');
const headerXml = (list.match(/word\/header(\d+)\.xml/g) || []).map(f => read(f)).join('\n');

// 5.5 × 8.5 trim + binding gutter.
check('page size 7920×12240 (5.5×8.5)', /<w:pgSz[^>]*w:w="7920"[^>]*w:h="12240"/.test(docXml));
check('binding gutter set', /<w:pgMar[^>]*w:gutter="200"/.test(docXml));
// Per-chapter sectioning: front + 2 chapters + back = 4 sectPr (last is doc-level).
check(`multiple sections (got ${sectPrCount}, expect ≥4)`, sectPrCount >= 4);
check('titlePage (different first page) set', /<w:titlePg\b/.test(docXml));
check('even/odd headers enabled', /<w:evenAndOddHeaders\b/.test(read('word/settings.xml')));
// Running heads + page numbers.
check(`header parts emitted (${headerFiles})`, headerFiles >= 2);
check(`footer parts emitted (${footerFiles})`, footerFiles >= 1);
check('running head carries the title', /Lantern Keeper/.test(headerXml));
check('running head carries the author (verso)', /Jane Marlowe/.test(headerXml));
check('footer has a PAGE field (page numbers)', /\bPAGE\b/.test(footerXml));
// Regenerated TOC field.
check('TOC field present', /TOC\s+\\/.test(docXml) || /\bTOC\b/.test(docXml));
// Body typography.
check('justified body present', /w:val="both"/.test(docXml));
check('widow/orphan control on body', /<w:widowControl\b/.test(docXml));
// Front matter regenerated from metadata, TOC excised, chapters present.
check('copyright line regenerated (© 2025 Jane Marlowe)', /©\s*2025\s*Jane Marlowe/.test(docXml) || /© 2025 Jane Marlowe/.test(docXml.replace(/<[^>]+>/g, '')));
check('ISBN on copyright page', /ISBN 978-1-23456-789-0/.test(docXml.replace(/<[^>]+>/g, '')));
check('Contents heading present', /Contents/.test(docXml));
check('chapter titles present', /Chapter 1/.test(docXml.replace(/<[^>]+>/g, '')) && /Chapter 2/.test(docXml.replace(/<[^>]+>/g, '')));
check('captured foreword rendered', /winter night when the power failed/.test(docXml.replace(/<[^>]+>/g, '')));
check('captured acknowledgements (back matter) rendered', /lighthouse keepers of the northern coast/.test(docXml.replace(/<[^>]+>/g, '')));

// A manuscript with NO front/back matter (no dedication/copyright/etc.) must still
// build — the common real-world case, and the one that surfaced the matterText crash.
const bare = preprocessMarkdown('# Chapter One\n\nThe road was long and the night was cold and quiet.\n\n# Chapter Two\n\nMorning came grey and slow over the empty fields.');
let bareOk = true;
try { await Packer.toBuffer(buildManuscriptDocxDocument({ title: 'Bare', author: 'A. Writer' }, bare)); }
catch (e) { bareOk = false; console.log('   build error:', e?.message); }
check('builds with no front/back matter (no dedication)', bareOk);

console.log('');
console.log('────────────────────────────────────────────────────────');
if (failures) { console.error(`${failures} DOCX check(s) FAILED`); process.exit(1); }
console.log('ALL DOCX CHECKS PASSED');
