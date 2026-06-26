// ─── Manuscript export · Word (.docx) ─────────────────────────────────────────
// Publication-grade Word output — the artifact an author hands to KDP, a print
// service, or a designer. Driven off the structural model (buildManuscriptStructure),
// so it renders CLASSIFIED structure (front matter / chapters / back matter), not a
// re-scan of markdown. Typographic intent, close to a professional typesetter:
//   · 5.5 × 8.5 trade trim, binding gutter, header/footer allowance
//   · per-chapter sections: chapter openers carry no running head, a dropped folio
//   · alternating running heads (author verso · title recto) + page numbers
//   · justified body, first-paragraph-flush convention, widow/orphan control
//   · regenerated front matter (title/copyright from metadata; dedication, epigraph,
//     foreword… from the captured prose) + a regenerated Word TOC field
// `docx` lacks a true mirror-margins flag, so recto/verso is approximated with a
// gutter + alternating heads. Heavy `docx` dependency → dynamically imported.

import {
  Document, Paragraph, TextRun, AlignmentType, HeadingLevel, PageNumber,
  Header, Footer, TableOfContents, NumberFormat, SectionType, Packer,
  type ISectionOptions, type FileChild,
} from 'docx';
import { exportSlug, copyrightLine, type ExportManuscriptMeta } from './manuscriptMarkdown';
import { buildManuscriptStructure } from '../ingestion/manuscriptStructure';
import type { ManuscriptStructure, ChapterSection, MatterSection, StructuralBlock } from '../types';
import { DOCX_INK as INK, DOCX_QUOTE as QUOTE } from './exportPalette';

const SERIF = 'Georgia';
const BODY = 22;     // half-points → 11pt book body
const LINE = 312;    // 240 = single; ~1.3 leading
const INDENT = 360;  // first-line indent ≈ 0.25"

// 5.5 × 8.5 inch trade trim (twips: inch × 1440).
const PAGE_SIZE = { width: 7920, height: 12240 };
const PAGE_MARGIN = { top: 1080, bottom: 1080, left: 1000, right: 900, gutter: 200, header: 720, footer: 720 };

const C = AlignmentType.CENTER;
const J = AlignmentType.JUSTIFIED;

interface RunBase { italics?: boolean; color?: string; }

/** Parse a line's inline Markdown (bold / italic / code) into styled runs. */
function inlineRuns(text: string, base: RunBase = {}): TextRun[] {
  const color = base.color ?? INK;
  const runs: TextRun[] = [];
  const push = (t: string, opts: { bold?: boolean; italics?: boolean; font?: string }) => {
    if (!t) return;
    runs.push(new TextRun({
      text: t, font: opts.font ?? SERIF, size: BODY, color,
      bold: opts.bold, italics: opts.italics ?? base.italics,
    }));
  };
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+?)`/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) push(text.slice(last, m.index), {});
    if (m[1]) push(m[2], { bold: true });
    else if (m[3]) push(m[4], { italics: true });
    else if (m[5]) push(m[5], { font: 'Courier New' });
    last = re.lastIndex;
  }
  if (last < text.length) push(text.slice(last), {});
  if (!runs.length) push(text || ' ', {});
  return runs;
}

// ── Body block paragraphs ─────────────────────────────────────────────────────

/** A body paragraph: justified, widow/orphan-controlled. The first paragraph after
 *  a heading or scene break is set flush left (no indent) — the book convention. */
function bodyParagraph(text: string, flush: boolean): Paragraph {
  return new Paragraph({
    alignment: J, widowControl: true,
    spacing: { line: LINE, lineRule: 'auto', after: 0 },
    indent: flush ? undefined : { firstLine: INDENT },
    children: inlineRuns(text),
  });
}

function sceneBreak(): Paragraph {
  return new Paragraph({
    alignment: C, keepLines: true, spacing: { before: 220, after: 220 },
    children: [new TextRun({ text: '* * *', font: SERIF, size: BODY, color: QUOTE })],
  });
}

function subheading(text: string, level?: number): Paragraph {
  return new Paragraph({
    alignment: C, keepNext: true, keepLines: true, spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, font: SERIF, size: level === 3 ? 22 : 24, bold: true, color: INK })],
  });
}

function blockquote(text: string): Paragraph {
  return new Paragraph({
    indent: { left: 540, right: 360 }, spacing: { line: LINE, lineRule: 'auto', before: 120, after: 120 },
    children: inlineRuns(text, { italics: true, color: QUOTE }),
  });
}

function listItem(text: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: inlineRuns(text) });
}

/** Render a run of structural blocks (chapter or matter body) into paragraphs,
 *  tracking the flush-first-paragraph convention across headings/breaks. */
function renderBlocks(blocks: StructuralBlock[], startFlush = true): Paragraph[] {
  const out: Paragraph[] = [];
  let flush = startFlush;
  for (const b of blocks) {
    switch (b.role) {
      case 'scene-break': out.push(sceneBreak()); flush = true; break;
      case 'subheading': out.push(subheading(b.text, b.level)); flush = true; break;
      case 'blockquote': out.push(blockquote(b.text)); flush = true; break;
      case 'list':
        for (const li of b.text.split('\n').filter(Boolean)) out.push(listItem(li));
        flush = true; break;
      case 'paragraph':
      case 'code':
        out.push(bodyParagraph(b.text, flush)); flush = false; break;
      default: break;
    }
  }
  return out;
}

// ── Front matter (regenerated + captured) ─────────────────────────────────────

function centered(text: string, halfPt: number, opts: { italics?: boolean; color?: string; before?: number; after?: number; pageBreak?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: C, pageBreakBefore: opts.pageBreak,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120 },
    children: [new TextRun({ text, font: SERIF, size: halfPt, italics: opts.italics, color: opts.color ?? INK })],
  });
}

const matterText = (s: MatterSection | undefined): string => s ? s.blocks.map(b => b.text).join('\n').trim() : '';
const findFront = (st: ManuscriptStructure, role: string): MatterSection | undefined =>
  st.frontMatter.find(s => s.role === role);

/** Title page — regenerated from author metadata (never the captured template prose). */
function titlePage(meta: ExportManuscriptMeta): Paragraph[] {
  const p = meta.publishing ?? {};
  const out: Paragraph[] = [];
  if (p.series?.trim()) out.push(centered(p.series.trim().toUpperCase(), 18, { before: 2200, after: 240, color: QUOTE }));
  out.push(centered(meta.title, 48, { before: p.series?.trim() ? 0 : 2600, after: p.subtitle?.trim() ? 160 : 360 }));
  if (p.subtitle?.trim()) out.push(centered(p.subtitle.trim(), 28, { italics: true, after: 360, color: QUOTE }));
  if (meta.author?.trim()) out.push(centered(meta.author.trim(), 24, { before: 360 }));
  const imp = [p.imprint?.trim(), p.publisher?.trim()].filter(Boolean).join(' · ');
  if (imp) out.push(centered(imp, 18, { before: 2600, color: QUOTE }));
  return out;
}

/** Copyright page — regenerated from metadata; the captured copyright prose (often a
 *  template) is intentionally not echoed. Empty when the author supplied nothing. */
function copyrightPage(meta: ExportManuscriptMeta): Paragraph[] {
  const p = meta.publishing ?? {};
  const lines: string[] = [];
  const cr = copyrightLine(p);
  if (cr) lines.push(cr);
  if (p.rights?.trim()) lines.push(p.rights.trim());
  if (p.edition?.trim()) lines.push(p.edition.trim());
  const pub = [p.imprint?.trim(), p.publisher?.trim()].filter(Boolean).join(', ');
  if (pub) lines.push(pub);
  if (p.publicationDate?.trim()) lines.push(p.publicationDate.trim());
  if (p.isbn?.trim()) lines.push(`ISBN ${p.isbn.trim()}`);
  if (p.language?.trim()) lines.push(p.language.trim());
  return lines.map((t, i) => new Paragraph({
    pageBreakBefore: i === 0, spacing: { before: i === 0 ? 1800 : 0, after: 80 },
    children: [new TextRun({ text: t, font: SERIF, size: 18, color: QUOTE })],
  }));
}

/** A centered, italic page (dedication / epigraph) from supplied lines of prose. */
function centeredProsePage(lines: string[]): Paragraph[] {
  return lines.filter(l => l.trim()).map((t, i) => new Paragraph({
    pageBreakBefore: i === 0, alignment: C,
    spacing: { before: i === 0 ? 1600 : 0, after: 160, line: LINE, lineRule: 'auto' },
    children: inlineRuns(t, { italics: true, color: QUOTE }),
  }));
}

/** A titled prose page (foreword / preface / acknowledgements / about the author…).
 *  `inToc` makes the heading a Heading-1 so the regenerated TOC field lists it. */
function prosePage(title: string, blocks: StructuralBlock[], inToc: boolean): FileChild[] {
  const head = new Paragraph({
    pageBreakBefore: true, heading: inToc ? HeadingLevel.HEADING_1 : undefined,
    alignment: C, keepNext: true, spacing: { before: 1000, after: 360 },
    children: [new TextRun({ text: title, font: SERIF, size: 28, color: INK })],
  });
  return [head, ...renderBlocks(blocks)];
}

const FRONT_PROSE_ORDER = ['foreword', 'preface', 'introduction', 'author-note', 'other'];

function frontMatterChildren(meta: ExportManuscriptMeta, st: ManuscriptStructure): FileChild[] {
  const out: FileChild[] = [...titlePage(meta), ...copyrightPage(meta)];

  // Dedication: author metadata wins; else the captured dedication prose.
  const dedMeta = meta.publishing?.dedication?.trim();
  const dedCap = matterText(findFront(st, 'dedication'));
  const ded = dedMeta || dedCap;
  if (ded) out.push(...centeredProsePage(ded.split('\n')));

  // Epigraph: captured prose only (no metadata field).
  const epi = findFront(st, 'epigraph');
  if (epi) out.push(...centeredProsePage(epi.blocks.map(b => b.text)));

  // Foreword / preface / introduction / author-note / other front prose, in order.
  for (const sec of st.frontMatter) {
    if (!FRONT_PROSE_ORDER.includes(sec.role)) continue;
    out.push(...prosePage(sec.title || sec.role, sec.blocks, true));
  }

  // Regenerated table of contents (Word field; populates on open/field-update).
  out.push(new Paragraph({
    pageBreakBefore: true, alignment: C, keepNext: true, spacing: { before: 1000, after: 360 },
    children: [new TextRun({ text: 'Contents', font: SERIF, size: 28, color: INK })],
  }));
  out.push(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-1' }));
  return out;
}

// ── Headers / footers (fresh instances per section) ───────────────────────────

const runningHead = (text: string): Header => new Header({
  children: [new Paragraph({ alignment: C, spacing: { after: 0 }, children: [new TextRun({ text, font: SERIF, size: 16, color: QUOTE })] })],
});
const blankHeader = (): Header => new Header({ children: [new Paragraph({ children: [] })] });
const pageFooter = (): Footer => new Footer({
  children: [new Paragraph({ alignment: C, spacing: { before: 0 }, children: [new TextRun({ children: [PageNumber.CURRENT], font: SERIF, size: 18, color: QUOTE })] })],
});

// ── Chapters ──────────────────────────────────────────────────────────────────

const isRealTitle = (t: string): boolean => !!t.trim() && !/^chapter\s+\d+$/i.test(t.trim());

function chapterHeading(ch: ChapterSection): Paragraph[] {
  if (isRealTitle(ch.title)) {
    return [
      new Paragraph({
        alignment: C, keepNext: true, spacing: { before: 1200, after: 80 },
        children: [new TextRun({ text: `Chapter ${ch.index}`.toUpperCase(), font: SERIF, size: 18, color: QUOTE })],
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1, alignment: C, keepNext: true, spacing: { before: 0, after: 420 },
        children: [new TextRun({ text: ch.title, font: SERIF, size: 32, color: INK })],
      }),
    ];
  }
  return [new Paragraph({
    heading: HeadingLevel.HEADING_1, alignment: C, keepNext: true, spacing: { before: 1200, after: 420 },
    children: [new TextRun({ text: ch.title || `Chapter ${ch.index}`, font: SERIF, size: 32, color: INK })],
  })];
}

function chapterSection(meta: ExportManuscriptMeta, ch: ChapterSection, startNumbering: boolean): ISectionOptions {
  const recto = meta.title;
  const verso = meta.author?.trim() || meta.title;
  return {
    properties: {
      type: SectionType.NEXT_PAGE, titlePage: true,
      page: {
        size: PAGE_SIZE, margin: PAGE_MARGIN,
        pageNumbers: startNumbering ? { start: 1, formatType: NumberFormat.DECIMAL } : undefined,
      },
    },
    headers: { default: runningHead(recto), even: runningHead(verso), first: blankHeader() },
    footers: { default: pageFooter(), even: pageFooter(), first: pageFooter() },
    children: [...chapterHeading(ch), ...renderBlocks(ch.blocks)],
  };
}

function backMatterSection(meta: ExportManuscriptMeta, st: ManuscriptStructure): ISectionOptions {
  const recto = meta.title;
  const verso = meta.author?.trim() || meta.title;
  const children: FileChild[] = [];
  for (const sec of st.backMatter) children.push(...prosePage(sec.title || sec.role, sec.blocks, false));
  return {
    properties: { type: SectionType.NEXT_PAGE, titlePage: true, page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
    headers: { default: runningHead(recto), even: runningHead(verso), first: blankHeader() },
    footers: { default: pageFooter(), even: pageFooter(), first: pageFooter() },
    children,
  };
}

/** Build the docx `Document` (exported for the headless `check-docx` harness). */
export function buildManuscriptDocxDocument(meta: ExportManuscriptMeta, combinedMarkdown: string): Document {
  return buildDoc(meta, combinedMarkdown);
}

function buildDoc(meta: ExportManuscriptMeta, combinedMarkdown: string): Document {
  const st = buildManuscriptStructure(combinedMarkdown);
  const p = meta.publishing ?? {};

  const sections: ISectionOptions[] = [{
    properties: { titlePage: true, page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
    children: frontMatterChildren(meta, st),
  }];
  st.chapters.forEach((ch, i) => sections.push(chapterSection(meta, ch, i === 0)));
  if (st.backMatter.length) sections.push(backMatterSection(meta, st));

  return new Document({
    title: meta.title,
    creator: meta.author || undefined,
    description: p.subtitle || p.synopsis || undefined,
    evenAndOddHeaderAndFooters: true,
    styles: {
      default: { document: { run: { font: SERIF, size: BODY, color: INK } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: SERIF, size: 32, bold: false, color: INK },
          paragraph: { alignment: C, spacing: { after: 360 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: SERIF, size: 24, bold: true, color: INK } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: SERIF, size: 22, bold: true, color: INK } },
      ],
    },
    sections,
  });
}

export async function exportManuscriptDocx(meta: ExportManuscriptMeta, id: string, combinedMarkdown: string): Promise<void> {
  const doc = buildDoc(meta, combinedMarkdown);
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exportSlug(meta.title, id)}-${new Date().toISOString().slice(0, 10)}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
