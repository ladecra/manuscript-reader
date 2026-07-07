// ─── EPUB export check (golden-file + structural assertions) ────────────────
// Builds a representative manuscript through the real EPUB engine, writes the
// .epub, and asserts the invariants epubcheck can't see in a glance (mimetype
// first & stored-as-text, spine→manifest→file integrity, nav resolves). CI then
// runs the real epubcheck on the written file for full validation.
//   Run with: npm run check-epub  [outPath]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildEpub, buildEpubFiles } from '../src/engine/exports/manuscriptEpub.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] ? resolve(process.argv[2]) : join(here, '..', 'sample.epub');

const meta = {
  title: 'Frostwood',
  author: 'Laura Crandall',
  publishing: {
    subtitle: 'A Novel', genre: 'Literary Suspense',
    synopsis: 'A secluded valley hides the remnants of an abandoned experiment.',
    publisher: 'Vellibris Press', imprint: 'Hollow Books', isbn: '978-1-23456-789-0',
    edition: 'First edition', series: 'The Hollow Cycle, Book 1', language: 'English',
    copyrightYear: '2026', copyrightHolder: 'Laura Crandall', rights: 'All rights reserved',
    dedication: 'For those who stayed.',
  },
};

// Exercises headings, emphasis, scene break, blockquote, lists, and a label-prefixed
// chapter title (verifies stripChapterLabel) plus a unicode/ampersand in prose.
const md = `# Chapter 1 — Into the Valley

The road was *long* and grey under a **bruised** sky. She had not expected the
trees to feel like ***witnesses*** — Tom & Eliza least of all.

"Who's there?" she called. No one answered.

---

Later, the frost came.

# Chapter 2: The Old Map

The map showed a house that should not exist.

> A quoted epigraph, spanning
> two source lines.

What she packed:

- a lantern
- the journal
- one match

And so it began.

<!-- matter:front role="epigraph" title="" -->
Add an epigraph for the frostwood.
<!-- /matter -->

<!-- matter:front role="introduction" title="Introduction" -->
Add an introduction to the valley.
<!-- /matter -->`;

let failures = 0;
const check = (label, cond) => { console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`); if (!cond) failures++; };

const fixedDate = new Date('2026-06-17T12:00:00Z');
const files = buildEpubFiles(meta, 'ms-frost', md, fixedDate);
const names = files.map(f => f.name);
const dec = new TextDecoder();
const fileByName = Object.fromEntries(files.map(f => [f.name, dec.decode(f.data)]));

console.log('\nEPUB entries:\n  ' + names.join('\n  ') + '\n');

check('mimetype is the first entry', names[0] === 'mimetype');
check('mimetype value correct', dec.decode(files[0].data) === 'application/epub+zip');
check('has container.xml', names.includes('META-INF/container.xml'));
check('has content.opf', names.includes('OEBPS/content.opf'));
check('has nav + ncx', names.includes('OEBPS/nav.xhtml') && names.includes('OEBPS/toc.ncx'));

const opf = fileByName['OEBPS/content.opf'];
check('OPF identifier is ISBN urn', opf.includes('urn:isbn:9781234567890'));
check('OPF carries dcterms:modified', /dcterms:modified/.test(opf));
check('chapter label stripped ("Into the Valley")', fileByName['OEBPS/chap-001.xhtml'].includes('<h1>Into the Valley</h1>'));
check('ampersand escaped in prose', fileByName['OEBPS/chap-001.xhtml'].includes('Tom &amp; Eliza'));
check('matter fences not leaked into XHTML', !Object.values(fileByName).some(x => x.includes('/matter')));
check('captured epigraph prose present', Object.values(fileByName).some(x => x.includes('Add an epigraph for the frostwood')));
check('captured introduction prose present', Object.values(fileByName).some(x => x.includes('Add an introduction to the valley')));

// spine → manifest → file integrity
const manifest = Object.fromEntries([...opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/g)].map(m => [m[1], m[2]]));
const spine = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map(m => m[1]);
const spineOk = spine.every(id => manifest[id] && names.includes('OEBPS/' + manifest[id]));
check(`spine (${spine.length}) resolves to manifest files`, spineOk);

const nav = fileByName['OEBPS/nav.xhtml'];
const navHrefs = [...nav.matchAll(/<a href="([^"]+)"/g)].map(m => m[1]);
check(`nav links (${navHrefs.length}) resolve`, navHrefs.every(h => names.includes('OEBPS/' + h)));

const bytes = buildEpub(meta, 'ms-frost', md, fixedDate);
writeFileSync(outPath, bytes);
console.log(`\nWrote ${bytes.length} bytes → ${outPath}`);

if (failures) { console.error(`\n${failures} structural check(s) failed.`); process.exit(1); }
console.log('\nAll structural checks passed.');
