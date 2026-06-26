// ─── SMF export + extent resolver check (headless golden file) ────────────────
// Two parts: (1) unit-tests resolveExtent on a synthetic structure (chapter/page/word
// requests + boundary snapping + endLabel); (2) builds a real SMF .docx from the
// fixture and asserts the format (Letter, TNR, double-spaced, running header, title
// page word count, chapter headings, scene break). Run with: npm run check-smf
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Packer } from 'docx';
import { preprocessMarkdown } from '../src/engine/ingestion/preprocessMarkdown.ts';
import { resolveExtent, summarizeExtent, totalWords } from '../src/engine/exports/manuscriptExtent.ts';
import { buildManuscriptSmfDocument } from '../src/engine/exports/manuscriptSmfDocx.ts';

let failures = 0;
const check = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗'}  ${name}${extra ? ` — ${extra}` : ''}`); if (!cond) failures++; };

// ── Part 1: resolveExtent on a synthetic structure ──
// 5 chapters × (5 paragraphs × 200 words) = 1000 words each, 5000 total = 20 pages.
const para = (n, words) => ({ role: 'paragraph', text: Array(words).fill('word').join(' '), sourceStart: 0, sourceEnd: 0, chapterIndex: n });
const mkChapter = (index) => ({ index, id: `ch-${index}`, title: `Chapter ${index}`, sceneBreakCount: 0, blocks: Array.from({ length: 5 }, () => para(index, 200)) });
const structure = { title: 'T', frontMatter: [], backMatter: [], blocks: [], chapters: [1, 2, 3, 4, 5].map(mkChapter) };

check('totalWords = 5000', totalWords(structure) === 5000, `${totalWords(structure)}`);

const full = resolveExtent(structure, { kind: 'full' });
check('full → 5 chapters, not truncated', full.chapters.length === 5 && !full.truncated);

const ch2 = resolveExtent(structure, { kind: 'chapters', count: 2 });
check('chapters:2 → 2 chapters, truncated, 2000 words', ch2.chapters.length === 2 && ch2.truncated && ch2.words === 2000, ch2.endLabel);

const p4 = resolveExtent(structure, { kind: 'pages', count: 4 }); // target 1000 → end of Chapter 1
check('pages:4 → snaps to end of Chapter 1', p4.words === 1000 && /after Chapter 1/.test(p4.endLabel), `${p4.words}w · ${p4.endLabel}`);

const w1500 = resolveExtent(structure, { kind: 'words', count: 1500 }); // crosses at 1600, no near boundary
check('words:1500 → partway through Chapter 2 at a paragraph end', w1500.words === 1600 && w1500.chapters.length === 2 && w1500.chapters[1].partial, `${w1500.words}w · ${w1500.endLabel}`);

const over = resolveExtent(structure, { kind: 'pages', count: 100 }); // target 25000 > total
check('pages:100 (over) → full manuscript', !over.truncated && over.chapters.length === 5);

const w1500NoCut = w1500.chapters[1].blocks.length < structure.chapters[1].blocks.length;
check('words:1500 truncates the last chapter\'s blocks', w1500NoCut, `${w1500.chapters[1].blocks.length}/5 blocks`);

const sum = summarizeExtent(structure, { kind: 'pages', count: 8 }); // 2000 words → end of ch2
check('summarizeExtent reports totals', sum.totalWords === 5000 && sum.totalChapters === 5 && sum.pages >= 1, `${sum.pages}pp · ${sum.endLabel}`);

// ── Part 2: SMF .docx format from the real fixture ──
const here = dirname(fileURLToPath(import.meta.url));
const md = preprocessMarkdown((await readFile(join(here, 'markdown-frontmatter.md'), 'utf8')).trim());
const meta = { title: 'The Lantern Keeper', author: 'Jane Marlowe', publishing: {} };

const doc = buildManuscriptSmfDocument(meta, md, { kind: 'full' });
const buf = await Packer.toBuffer(doc);
const path = join(mkdtempSync(join(tmpdir(), 'smf-')), 'out.docx');
writeFileSync(path, buf);
const read = (e) => execFileSync('unzip', ['-p', path, e], { encoding: 'utf8', maxBuffer: 1 << 24 });
const list = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' });
const docXml = read('word/document.xml');
const plain = docXml.replace(/<[^>]+>/g, '');
const headerXml = (list.match(/word\/header\d+\.xml/g) || []).map(read).join('\n');

check('US Letter 12240×15840', /<w:pgSz[^>]*w:w="12240"[^>]*w:h="15840"/.test(docXml));
check('1" margins (1440)', /<w:pgMar[^>]*w:top="1440"[^>]*w:left="1440"/.test(docXml));
check('Times New Roman set', /Times New Roman/.test(docXml));
check('double-spaced (line=480)', /<w:spacing[^>]*w:line="480"/.test(docXml));
check('0.5" first-line indent (720)', /<w:ind[^>]*w:firstLine="720"/.test(docXml));
check('NOT justified (no both)', !/w:val="both"/.test(docXml));
check('title page word count (about 1,000 words)', /about 1,000 words/.test(plain), 'rounded to nearest 1,000');
check('title page "by" line', /<w:t[^>]*>by<\/w:t>/.test(docXml));
check('running header: surname / TITLE / page', /Marlowe \/ THE LANTERN KEEPER \//.test(headerXml) && /\bPAGE\b/.test(headerXml));
check('chapter headings present', /Chapter 1/.test(plain) && /Chapter 2/.test(plain));
check('scene break "#" rendered', /(^|\s)#(\s|$)/.test(plain) || />#</.test(docXml));
check('front/back matter omitted (no foreword/acknowledgements)', !/winter night when the power failed/.test(plain) && !/lighthouse keepers of the northern/.test(plain));

// A partial SMF (first chapter) renders only chapter 1.
const partial = buildManuscriptSmfDocument(meta, md, { kind: 'chapters', count: 1 });
const pbuf = await Packer.toBuffer(partial);
const ppath = join(mkdtempSync(join(tmpdir(), 'smf2-')), 'out.docx');
writeFileSync(ppath, pbuf);
const pplain = execFileSync('unzip', ['-p', ppath, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 1 << 24 }).replace(/<[^>]+>/g, '');
check('chapters:1 export excludes Chapter 2 body', !/Morning brought gulls/.test(pplain) && /Chapter 1/.test(pplain));

console.log('');
console.log('────────────────────────────────────────────────────────');
if (failures) { console.error(`${failures} SMF check(s) FAILED`); process.exit(1); }
console.log('ALL SMF CHECKS PASSED');
