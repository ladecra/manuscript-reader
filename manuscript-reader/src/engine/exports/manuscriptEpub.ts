// ─── Manuscript export · EPUB 3 ───────────────────────────────────────────────
// The publishable artifact. Reflowable EPUB3 (with an EPUB2 NCX fallback so older
// readers and KDP ingest it): author/publishing metadata → OPF + front matter,
// the source markdown → one clean XHTML document per chapter. Pure assembly +
// a dependency-free store-only ZIP; one DOM call lives in the browser entry.
//
// No cover yet — the generated-cover system is being rethought, and a placeholder
// is worse than none. When a real cover exists, add it as a manifest item with
// properties="cover-image" and a cover.xhtml at the front of the spine.

import { type ExportManuscriptMeta, cleanManuscriptMarkdown, exportSlug, copyrightLine } from './manuscriptMarkdown';
import { buildManuscriptStructure } from '../ingestion/manuscriptStructure';
import { LIST_MATTER_ROLES } from '../manuscript/matterEdit';
import type { ChapterSection, MatterSection, StructuralBlock } from '../types';
import { zipStore, utf8, type ZipEntry } from './zipStore';

// ── Escaping ──────────────────────────────────────────────────────────────────
function xesc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function attresc(s: string): string {
  return xesc(s).replace(/"/g, '&quot;');
}

// ── Inline + block markdown → XHTML (mirrors parseMarkdown's grammar, XHTML-safe) ─
function inlineXhtml(s: string): string {
  s = xesc(s);
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/(^|[^\w])_(.+?)_(?=[^\w]|$)/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => `<a href="${attresc(u)}">${t}</a>`);
  return s;
}

function renderStructuralBlocksXhtml(blocks: StructuralBlock[]): string {
  let html = '';
  for (const b of blocks) {
    switch (b.role) {
      case 'scene-break': html += '<hr/>'; break;
      case 'subheading':
        html += b.level === 3
          ? `<h3>${inlineXhtml(b.text)}</h3>`
          : `<h2>${inlineXhtml(b.text)}</h2>`;
        break;
      case 'blockquote': html += `<blockquote><p>${inlineXhtml(b.text)}</p></blockquote>`; break;
      case 'list':
        html += '<ul>';
        for (const li of b.text.split('\n').filter(Boolean)) html += `<li>${inlineXhtml(li)}</li>`;
        html += '</ul>';
        break;
      case 'paragraph':
      case 'code':
        if (b.text.trim()) html += `<p>${inlineXhtml(b.text)}</p>`;
        break;
      default: break;
    }
  }
  return html;
}

// Front-matter prose sections after dedication/epigraph, before chapters — kept in
// sync with manuscriptDocx.ts FRONT_PROSE_ORDER.
const FRONT_PROSE_ORDER = ['cast', 'list-of-illustrations', 'foreword', 'preface', 'introduction', 'author-note', 'other'];

function matterDisplayTitle(sec: MatterSection): string {
  return sec.title.trim() || sec.role.replace(/-/g, ' ');
}

function listMatterXhtml(sec: MatterSection): string {
  const title = matterDisplayTitle(sec);
  const items = sec.blocks
    .filter(b => (b.role === 'paragraph' || b.role === 'list') && b.text.trim())
    .flatMap(b => b.text.split('\n').filter(l => l.trim()))
    .map(line => `<p class="matter-list-item">${inlineXhtml(line)}</p>`)
    .join('\n');
  return `<h1>${inlineXhtml(title)}</h1>\n${items}`;
}

function proseMatterXhtml(sec: MatterSection, centered: boolean): string {
  const title = matterDisplayTitle(sec);
  const cls = centered ? ' class="epigraph"' : '';
  const head = title && !centered ? `<h1>${inlineXhtml(title)}</h1>\n` : '';
  const body = centered
    ? sec.blocks.filter(b => b.text.trim()).map(b => `<p${cls}>${inlineXhtml(b.text)}</p>`).join('\n')
    : renderStructuralBlocksXhtml(sec.blocks);
  return head + body;
}

/** Captured front/back matter from the structural model (comment fences stripped). */
function matterDocs(sections: MatterSection[], lang: string, region: 'front' | 'back', idStart: number): { docs: Doc[]; nextId: number } {
  const docs: Doc[] = [];
  let n = idStart;
  for (const sec of sections) {
    if (region === 'front') {
      if (['half-title', 'title-page', 'frontispiece', 'copyright', 'dedication'].includes(sec.role)) continue;
      if (sec.role === 'epigraph') {
        const body = proseMatterXhtml(sec, true);
        if (!body.trim()) continue;
        docs.push({
          id: `matter-${n}`, href: `matter-${String(n).padStart(3, '0')}.xhtml`,
          title: matterDisplayTitle(sec),
          xhtml: page(lang, matterDisplayTitle(sec), `<section epub:type="epigraph" class="epigraph-page">\n${body}\n</section>`, 'frontmatter'),
          inToc: false,
        });
        n++;
        continue;
      }
      if (LIST_MATTER_ROLES.has(sec.role)) {
        docs.push({
          id: `matter-${n}`, href: `matter-${String(n).padStart(3, '0')}.xhtml`,
          title: matterDisplayTitle(sec),
          xhtml: page(lang, matterDisplayTitle(sec), `<section class="matter-list">\n${listMatterXhtml(sec)}\n</section>`, 'frontmatter'),
          inToc: false,
        });
        n++;
        continue;
      }
      if (!FRONT_PROSE_ORDER.includes(sec.role)) continue;
    } else if (LIST_MATTER_ROLES.has(sec.role)) {
      docs.push({
        id: `matter-${n}`, href: `matter-${String(n).padStart(3, '0')}.xhtml`,
        title: matterDisplayTitle(sec),
        xhtml: page(lang, matterDisplayTitle(sec), `<section class="matter-list">\n${listMatterXhtml(sec)}\n</section>`, 'backmatter'),
        inToc: false,
      });
      n++;
      continue;
    }

    const epubType = region === 'back' && sec.role === 'acknowledgements' ? 'acknowledgments' : sec.role;
    const body = proseMatterXhtml(sec, false);
    if (!body.trim()) continue;
    docs.push({
      id: `matter-${n}`, href: `matter-${String(n).padStart(3, '0')}.xhtml`,
      title: matterDisplayTitle(sec),
      xhtml: page(lang, matterDisplayTitle(sec), `<section epub:type="${attresc(epubType)}" class="matter-prose">\n${body}\n</section>`, region === 'front' ? 'frontmatter' : 'backmatter'),
      inToc: region === 'front' && FRONT_PROSE_ORDER.includes(sec.role),
    });
    n++;
  }
  return { docs, nextId: n };
}

// ── BCP47 language ────────────────────────────────────────────────────────────
const LANG_MAP: Record<string, string> = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', dutch: 'nl', russian: 'ru', japanese: 'ja', chinese: 'zh',
};
function langCode(name: string | undefined): string {
  const v = (name ?? '').trim().toLowerCase();
  if (!v) return 'en';
  if (LANG_MAP[v]) return LANG_MAP[v];
  if (/^[a-z]{2,3}(-[a-z0-9]+)?$/.test(v)) return v; // already a code
  return 'en';
}

// ── XHTML document wrapper ────────────────────────────────────────────────────
function page(lang: string, title: string, bodyXhtml: string, bodyClass?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head><meta charset="utf-8"/><title>${xesc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${bodyXhtml}
</body>
</html>`;
}

// ── Front matter (only what the author supplied) ──────────────────────────────
interface Doc { id: string; href: string; title: string; xhtml: string; inToc: boolean }

function frontMatterDocs(meta: ExportManuscriptMeta, lang: string): Doc[] {
  const p = meta.publishing ?? {};
  const docs: Doc[] = [];

  // Title page — always (a book needs one).
  const tp: string[] = ['<section epub:type="titlepage" class="titlepage">'];
  tp.push(`<h1 class="tp-title">${inlineXhtml(meta.title)}</h1>`);
  if (p.subtitle?.trim()) tp.push(`<p class="tp-subtitle">${inlineXhtml(p.subtitle.trim())}</p>`);
  if (meta.author?.trim()) tp.push(`<p class="tp-author">${inlineXhtml(meta.author.trim())}</p>`);
  if (p.series?.trim()) tp.push(`<p class="tp-series">${inlineXhtml(p.series.trim())}</p>`);
  tp.push('</section>');
  docs.push({ id: 'titlepage', href: 'titlepage.xhtml', title: meta.title, xhtml: page(lang, meta.title, tp.join('\n'), 'frontmatter'), inToc: false });

  // Copyright page — only if there's something to say.
  const cp: string[] = [];
  const cr = copyrightLine(p);
  if (cr) cp.push(`<p>${xesc(cr)}</p>`);
  if (p.publisher?.trim()) cp.push(`<p>${inlineXhtml(p.publisher.trim())}${p.imprint?.trim() ? ` · ${inlineXhtml(p.imprint.trim())}` : ''}</p>`);
  else if (p.imprint?.trim()) cp.push(`<p>${inlineXhtml(p.imprint.trim())}</p>`);
  if (p.edition?.trim()) cp.push(`<p>${inlineXhtml(p.edition.trim())}</p>`);
  if (p.isbn?.trim()) cp.push(`<p>ISBN ${xesc(p.isbn.trim())}</p>`);
  if (p.rights?.trim()) cp.push(`<p>${inlineXhtml(p.rights.trim())}</p>`);
  if (cp.length) {
    docs.push({ id: 'copyright', href: 'copyright.xhtml', title: 'Copyright', xhtml: page(lang, 'Copyright', `<section epub:type="copyright-page" class="copyright">\n${cp.join('\n')}\n</section>`, 'frontmatter'), inToc: false });
  }

  // Dedication — its own page.
  if (p.dedication?.trim()) {
    docs.push({ id: 'dedication', href: 'dedication.xhtml', title: 'Dedication', xhtml: page(lang, 'Dedication', `<section epub:type="dedication" class="dedication"><p>${inlineXhtml(p.dedication.trim())}</p></section>`, 'frontmatter'), inToc: false });
  }

  return docs;
}

// ── Package document (OPF) ────────────────────────────────────────────────────
function contentOpf(meta: ExportManuscriptMeta, lang: string, uid: string, docs: Doc[], modified: string): string {
  const p = meta.publishing ?? {};
  const m: string[] = [];
  m.push(`<dc:identifier id="bookid">${xesc(uid)}</dc:identifier>`);
  m.push(`<dc:title>${xesc(meta.title)}</dc:title>`);
  m.push(`<dc:language>${lang}</dc:language>`);
  if (meta.author?.trim()) m.push(`<dc:creator>${xesc(meta.author.trim())}</dc:creator>`);
  if (p.publisher?.trim()) m.push(`<dc:publisher>${xesc(p.publisher.trim())}</dc:publisher>`);
  if (p.synopsis?.trim()) m.push(`<dc:description>${xesc(p.synopsis.trim())}</dc:description>`);
  if (p.rights?.trim()) m.push(`<dc:rights>${xesc(p.rights.trim())}</dc:rights>`);
  // dc:date intentionally omitted: it's the *publication* date in W3C-DTF form,
  // which we don't reliably have (copyright year ≠ pub date; publicationDate is
  // free text like "Spring 2027"). It's optional in EPUB3; the copyright year
  // still appears on the copyright page. dcterms:modified (required) is below.
  m.push(`<meta property="dcterms:modified">${modified}</meta>`);

  const manifest: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
  ];
  for (const d of docs) manifest.push(`<item id="${d.id}" href="${d.href}" media-type="application/xhtml+xml"/>`);

  const spine: string[] = docs.map(d => `<itemref idref="${d.id}"/>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${m.join('\n    ')}
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spine.join('\n    ')}
  </spine>
</package>`;
}

// ── Navigation (EPUB3 nav + EPUB2 ncx) ────────────────────────────────────────
function navXhtml(lang: string, tocDocs: Doc[]): string {
  const items = tocDocs.map(d => `<li><a href="${d.href}">${xesc(d.title)}</a></li>`).join('\n      ');
  const body = `<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>
      ${items}
  </ol>
</nav>`;
  return page(lang, 'Contents', body, 'frontmatter');
}

function tocNcx(meta: ExportManuscriptMeta, uid: string, tocDocs: Doc[]): string {
  const points = tocDocs.map((d, i) => `    <navPoint id="np-${i + 1}" playOrder="${i + 1}"><navLabel><text>${xesc(d.title)}</text></navLabel><content src="${d.href}"/></navPoint>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${xesc(uid)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xesc(meta.title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>`;
}

function styleCss(): string {
  return `@page { margin: 5%; }
html, body { margin: 0; padding: 0; }
body { font-family: "EB Garamond", Georgia, serif; line-height: 1.5; widows: 2; orphans: 2; }
h1, h2, h3 { font-family: "EB Garamond", Georgia, serif; font-weight: 600; line-height: 1.2; text-align: left; }
h1 { font-size: 1.7em; margin: 1.2em 0 0.8em; }
h2 { font-size: 1.3em; margin: 2em 0 0.6em; }
p { margin: 0; text-indent: 1.4em; }
p:first-of-type, h1 + p, h2 + p, h3 + p, blockquote p { text-indent: 0; }
em { font-style: italic; }
strong { font-weight: 600; }
blockquote { margin: 1em 1.6em; font-style: italic; }
hr { border: none; text-align: center; margin: 1.4em 0; }
hr::after { content: "* * *"; letter-spacing: 0.5em; color: #888; }
code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.92em; }
.frontmatter p { text-indent: 0; }
.titlepage { text-align: center; margin-top: 22%; }
.tp-title { font-size: 2.6em; font-weight: 600; margin: 0 0 0.4em; }
.tp-subtitle { font-size: 1.2em; font-style: italic; color: #555; margin: 0 0 2em; }
.tp-author { font-size: 1.1em; letter-spacing: 0.12em; text-transform: uppercase; }
.tp-series { font-size: 0.9em; color: #777; margin-top: 0.8em; }
.copyright { text-align: center; margin-top: 30%; font-size: 0.85em; color: #555; }
.dedication { text-align: center; margin-top: 30%; font-style: italic; }
.epigraph-page, .epigraph { text-align: center; font-style: italic; }
.matter-list-item { text-align: center; font-style: italic; text-indent: 0; }
.matter-prose h1 { text-align: center; }
.backmatter p { text-indent: 0; }
`;
}

// ── Public: build the full file set (pure) ────────────────────────────────────
export function buildEpubFiles(meta: ExportManuscriptMeta, id: string, combinedMarkdown: string, now: Date = new Date()): ZipEntry[] {
  const lang = langCode(meta.publishing?.language);
  const uid = meta.publishing?.isbn?.trim()
    ? `urn:isbn:${meta.publishing.isbn.trim().replace(/[^0-9Xx]/g, '')}`
    : `urn:vellibris:${id}`;
  const modified = now.toISOString().replace(/\.\d+Z$/, 'Z');

  const clean = cleanManuscriptMarkdown(combinedMarkdown);
  const st = buildManuscriptStructure(clean);

  const docs: Doc[] = [...frontMatterDocs(meta, lang)];

  const frontCaptured = matterDocs(st.frontMatter, lang, 'front', 1);
  docs.push(...frontCaptured.docs);

  st.chapters.forEach((ch: ChapterSection, idx: number) => {
    const n = String(idx + 1).padStart(3, '0');
    const heading = ch.title ? `<h1>${inlineXhtml(ch.title)}</h1>\n` : '';
    const body = `<section epub:type="chapter">\n${heading}${renderStructuralBlocksXhtml(ch.blocks)}\n</section>`;
    docs.push({ id: `chap-${n}`, href: `chap-${n}.xhtml`, title: ch.title || `Chapter ${idx + 1}`, xhtml: page(lang, ch.title || `Chapter ${idx + 1}`, body), inToc: true });
  });

  const backCaptured = matterDocs(st.backMatter, lang, 'back', frontCaptured.nextId);
  docs.push(...backCaptured.docs);

  const tocDocs = docs.filter(d => d.inToc);

  // Assemble entries. mimetype MUST be first and stored (zipStore stores all).
  const entries: ZipEntry[] = [];
  entries.push({ name: 'mimetype', data: utf8('application/epub+zip') });
  entries.push({ name: 'META-INF/container.xml', data: utf8(
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`) });
  entries.push({ name: 'OEBPS/style.css', data: utf8(styleCss()) });
  for (const d of docs) entries.push({ name: `OEBPS/${d.href}`, data: utf8(d.xhtml) });
  entries.push({ name: 'OEBPS/nav.xhtml', data: utf8(navXhtml(lang, tocDocs)) });
  entries.push({ name: 'OEBPS/toc.ncx', data: utf8(tocNcx(meta, uid, tocDocs)) });
  entries.push({ name: 'OEBPS/content.opf', data: utf8(contentOpf(meta, lang, uid, docs, modified)) });

  return entries;
}

/** Build the .epub bytes (pure). */
export function buildEpub(meta: ExportManuscriptMeta, id: string, combinedMarkdown: string, now?: Date): Uint8Array {
  return zipStore(buildEpubFiles(meta, id, combinedMarkdown, now));
}

// ── Browser entry: download the .epub ─────────────────────────────────────────
export function exportManuscriptEpub(meta: ExportManuscriptMeta, id: string, combinedMarkdown: string): void {
  const bytes = buildEpub(meta, id, combinedMarkdown);
  const blob = new Blob([bytes as BlobPart], { type: 'application/epub+zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exportSlug(meta.title, id)}-${new Date().toISOString().slice(0, 10)}.epub`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
