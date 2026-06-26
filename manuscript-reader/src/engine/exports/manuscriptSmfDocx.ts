// ─── Manuscript export · Standard Manuscript Format (.docx) ───────────────────
// The agent-submission deliverable — Shunn-style Standard Manuscript Format, the
// query-ready sibling of the publication DOCX. Rigidly conventional on purpose:
//   · US Letter, 1" margins all round, 12pt Times New Roman, DOUBLE-SPACED
//   · ragged right (no justification), 0.5" first-line indent on every paragraph
//   · title page: author/contact top-left, full word count (nearest 1,000) top-right,
//     title + "by" centered a third of the way down
//   · running header on every text page: Surname / TITLE / page number (right)
//   · each chapter starts a third down a fresh page; scene breaks are a centered #
// Renders only the requested EXTENT (resolveExtent) — full, or first N chapters/pages/
// words snapped to a clean boundary. Front/back matter is omitted (a submission is body).
// Heavy `docx` dependency → dynamically imported at call time.

import {
  Document, Paragraph, TextRun, Tab, AlignmentType, TabStopType, PageNumber,
  Header, NumberFormat, Packer, type ISectionOptions, type FileChild,
} from 'docx';
import { exportSlug, type ExportManuscriptMeta } from './manuscriptMarkdown';
import { buildManuscriptStructure } from '../ingestion/manuscriptStructure';
import { resolveExtent, totalWords, roundedWordCount, type ExtentRequest, type ExtentChapter } from './manuscriptExtent';
import type { StructuralBlock } from '../types';

const TNR = 'Times New Roman';
const PT12 = 24;       // half-points
const DOUBLE = 480;    // 240 = single line; 480 = double
const INDENT = 720;    // 0.5" first-line indent
const INK = '000000';

// US Letter, 1" margins.
const PAGE_SIZE = { width: 12240, height: 15840 };
const PAGE_MARGIN = { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 720, footer: 720 };
const USABLE_WIDTH = PAGE_SIZE.width - PAGE_MARGIN.left - PAGE_MARGIN.right; // 9360

const L = AlignmentType.LEFT;
const C = AlignmentType.CENTER;
const R = AlignmentType.RIGHT;

/** Inline Markdown (bold/italic) → 12pt TNR runs. */
function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const push = (t: string, opts: { bold?: boolean; italics?: boolean }) => {
    if (!t) return;
    runs.push(new TextRun({ text: t, font: TNR, size: PT12, color: INK, bold: opts.bold, italics: opts.italics }));
  };
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+?)`/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) push(text.slice(last, m.index), {});
    if (m[1]) push(m[2], { bold: true });
    else if (m[3]) push(m[4], { italics: true });
    else if (m[5]) push(m[5], {});  // SMF: code reads as plain text
    last = re.lastIndex;
  }
  if (last < text.length) push(text.slice(last), {});
  if (!runs.length) push(text || ' ', {});
  return runs;
}

const bodyPara = (text: string): Paragraph => new Paragraph({
  alignment: L, spacing: { line: DOUBLE, lineRule: 'auto', after: 0 }, indent: { firstLine: INDENT },
  children: inlineRuns(text),
});

const sceneBreak = (): Paragraph => new Paragraph({
  alignment: C, spacing: { line: DOUBLE, lineRule: 'auto', after: 0 },
  children: [new TextRun({ text: '#', font: TNR, size: PT12, color: INK })],
});

function renderBlocks(blocks: StructuralBlock[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const b of blocks) {
    if (b.role === 'scene-break') out.push(sceneBreak());
    else if (b.role === 'subheading') out.push(new Paragraph({ alignment: C, spacing: { line: DOUBLE, lineRule: 'auto' }, children: [new TextRun({ text: b.text, font: TNR, size: PT12, color: INK })] }));
    else if (b.role === 'list') for (const li of b.text.split('\n').filter(Boolean)) out.push(bodyPara(li));
    else if (b.role === 'paragraph' || b.role === 'blockquote' || b.role === 'code') out.push(bodyPara(b.text));
  }
  return out;
}

const surnameOf = (author?: string): string => {
  const t = author?.trim();
  if (!t) return '';
  return t.split(/\s+/).pop() || t;
};

/** SMF title page: contact top-left + word count top-right, title/by/author centered. */
function titlePage(meta: ExportManuscriptMeta, manuscriptWords: number): Paragraph[] {
  const words = roundedWordCount(manuscriptWords);
  const author = meta.author?.trim() || '';
  return [
    new Paragraph({
      alignment: L, spacing: { after: 0 },
      tabStops: [{ type: TabStopType.RIGHT, position: USABLE_WIDTH }],
      children: [
        new TextRun({ text: author || ' ', font: TNR, size: PT12, color: INK }),
        new TextRun({ children: [new Tab(), `about ${words.toLocaleString('en-US')} words`], font: TNR, size: PT12, color: INK }),
      ],
    }),
    new Paragraph({ alignment: C, spacing: { before: 3600, after: 0, line: DOUBLE, lineRule: 'auto' }, children: [new TextRun({ text: meta.title, font: TNR, size: PT12, color: INK })] }),
    new Paragraph({ alignment: C, spacing: { line: DOUBLE, lineRule: 'auto', after: 0 }, children: [new TextRun({ text: 'by', font: TNR, size: PT12, color: INK })] }),
    new Paragraph({ alignment: C, spacing: { line: DOUBLE, lineRule: 'auto', after: 0 }, children: [new TextRun({ text: author || meta.title, font: TNR, size: PT12, color: INK })] }),
  ];
}

function chapterHeading(label: string, title: string, first: boolean): Paragraph[] {
  const real = !!title.trim() && title.trim() !== label;
  const out: Paragraph[] = [new Paragraph({
    alignment: C, pageBreakBefore: !first, keepNext: true,
    spacing: { before: 3600, after: real ? 0 : DOUBLE, line: DOUBLE, lineRule: 'auto' },
    children: [new TextRun({ text: label, font: TNR, size: PT12, color: INK })],
  })];
  if (real) out.push(new Paragraph({ alignment: C, keepNext: true, spacing: { after: DOUBLE, line: DOUBLE, lineRule: 'auto' }, children: [new TextRun({ text: title, font: TNR, size: PT12, color: INK })] }));
  return out;
}

const runningHeader = (meta: ExportManuscriptMeta): Header => {
  const head = `${surnameOf(meta.author)} / ${meta.title.toUpperCase()} / `.replace(/^ \/ /, '');
  return new Header({
    children: [new Paragraph({
      alignment: R,
      children: [new TextRun({ text: head, font: TNR, size: PT12, color: INK }), new TextRun({ children: [PageNumber.CURRENT], font: TNR, size: PT12, color: INK })],
    })],
  });
};

function buildDoc(meta: ExportManuscriptMeta, combinedMarkdown: string, request: ExtentRequest): Document {
  const structure = buildManuscriptStructure(combinedMarkdown);
  const resolved = resolveExtent(structure, request);
  const manuscriptWords = totalWords(structure);

  const bodyChildren: FileChild[] = [];
  resolved.chapters.forEach((ec: ExtentChapter, i: number) => {
    const label = `Chapter ${ec.chapter.index}`;
    bodyChildren.push(...chapterHeading(label, ec.chapter.title, i === 0));
    bodyChildren.push(...renderBlocks(ec.blocks));
  });

  const sections: ISectionOptions[] = [
    { properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } }, children: titlePage(meta, manuscriptWords) },
    {
      properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
      headers: { default: runningHeader(meta) },
      children: bodyChildren,
    },
  ];

  return new Document({
    title: meta.title,
    creator: meta.author || undefined,
    styles: { default: { document: { run: { font: TNR, size: PT12, color: INK } } } },
    sections,
  });
}

/** Build the SMF docx `Document` (exported for the headless `check-smf` harness). */
export function buildManuscriptSmfDocument(meta: ExportManuscriptMeta, combinedMarkdown: string, request: ExtentRequest): Document {
  return buildDoc(meta, combinedMarkdown, request);
}

export async function exportManuscriptSmfDocx(meta: ExportManuscriptMeta, id: string, combinedMarkdown: string, request: ExtentRequest = { kind: 'full' }): Promise<void> {
  const doc = buildDoc(meta, combinedMarkdown, request);
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = request.kind === 'full' ? '' : `-${request.kind}-${request.count}`;
  a.download = `${exportSlug(meta.title, id)}-SMF${suffix}-${new Date().toISOString().slice(0, 10)}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
