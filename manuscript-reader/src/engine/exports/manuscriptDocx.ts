// ─── Manuscript export · Word (.docx) ─────────────────────────────────────────
// The revised manuscript as a formatted Word document — the clean draft the
// author leaves with, edits already applied (edit mode rewrites the source in
// place). Renders the Markdown subset our manuscripts use: chapter headings (#),
// sub-headings (## / ###), scene breaks, blockquotes, lists, and paragraphs with
// inline bold / italic / code. Heavy `docx` dependency, so this module is
// dynamically imported at call time.

import {
  Document, Paragraph, TextRun, AlignmentType, Packer, type IParagraphOptions,
} from 'docx';
import { cleanManuscriptMarkdown, exportSlug, copyrightLine, type ExportManuscriptMeta } from './manuscriptMarkdown';

import { DOCX_INK as INK, DOCX_QUOTE as QUOTE } from './exportPalette';

const SERIF = 'Georgia';
const BODY = 24; // half-points → 12pt

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

const isSpecial = (line: string): boolean =>
  /^(#{1,3} |>\s|[-*+] |\d+\. |(-{3,}|\*{3,}|_{3,})\s*$)/.test(line);

function heading(text: string, size: number): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: SERIF, size, bold: true, color: INK })],
  });
}

// ── Front matter (title / copyright / dedication pages) ──────────────────────
// A centered run on its own line, at a given point size.
function centered(text: string, halfPt: number, opts: { italics?: boolean; color?: string; before?: number; after?: number; pageBreak?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER, pageBreakBefore: opts.pageBreak,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120 },
    children: [new TextRun({ text, font: SERIF, size: halfPt, italics: opts.italics, color: opts.color ?? INK })],
  });
}

/** The title page, copyright page, and (optional) dedication page, in order.
 *  Only renders what the author supplied — no blank copyright page, no empty
 *  "ISBN:" lines. Always at least a title page (the manuscript has a title). */
function frontMatter(meta: ExportManuscriptMeta): Paragraph[] {
  const p = meta.publishing ?? {};
  const out: Paragraph[] = [];

  // — Title page —
  if (p.series?.trim()) out.push(centered(p.series.trim().toUpperCase(), 18, { before: 2400, after: 240, color: QUOTE }));
  out.push(centered(meta.title, 52, { before: p.series?.trim() ? 0 : 2600, after: p.subtitle?.trim() ? 160 : 360 }));
  if (p.subtitle?.trim()) out.push(centered(p.subtitle.trim(), 30, { italics: true, after: 360, color: QUOTE }));
  if (meta.author?.trim()) out.push(centered(meta.author.trim(), 26, { before: 360 }));
  if (p.publisher?.trim() || p.imprint?.trim()) {
    out.push(centered([p.imprint?.trim(), p.publisher?.trim()].filter(Boolean).join(' · '), 18, { before: 2600, color: QUOTE }));
  }

  // — Copyright page (verso) — only if there's anything to put on it.
  const cr = copyrightLine(p);
  const crLines: string[] = [];
  if (cr) crLines.push(cr);
  if (p.rights?.trim()) crLines.push(p.rights.trim());
  if (p.edition?.trim()) crLines.push(p.edition.trim());
  if (p.publisher?.trim() || p.imprint?.trim()) crLines.push([p.imprint?.trim(), p.publisher?.trim()].filter(Boolean).join(', '));
  if (p.publicationDate?.trim()) crLines.push(p.publicationDate.trim());
  if (p.isbn?.trim()) crLines.push(`ISBN ${p.isbn.trim()}`);
  if (p.language?.trim()) crLines.push(p.language.trim());
  if (crLines.length) {
    crLines.forEach((t, i) => out.push(new Paragraph({
      pageBreakBefore: i === 0, spacing: { before: i === 0 ? 1800 : 0, after: 80 },
      children: [new TextRun({ text: t, font: SERIF, size: 18, color: QUOTE })],
    })));
  }

  // — Dedication page —
  if (p.dedication?.trim()) out.push(centered(p.dedication.trim(), 26, { italics: true, before: 2800, pageBreak: true, color: QUOTE }));

  return out;
}

function buildDoc(meta: ExportManuscriptMeta, combinedMarkdown: string): Document {
  const lines = cleanManuscriptMarkdown(combinedMarkdown).split('\n');
  const children: Paragraph[] = [...frontMatter(meta)];
  // Front matter always precedes the body, so the first chapter starts a fresh page.
  let firstChapter = false;

  const paraOpts = (): IParagraphOptions => ({
    spacing: { line: 360, lineRule: 'auto', after: 60 },
    indent: { firstLine: 360 },
    children: [],
  });

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (/^<!--[\s\S]*?-->\s*$/.test(t)) { i++; continue; }

    // Chapter heading — page break before each chapter after the first.
    if (/^# /.test(line)) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER, pageBreakBefore: !firstChapter,
        spacing: { before: firstChapter ? 0 : 240, after: 320 },
        children: [new TextRun({ text: line.replace(/^# /, '').trim(), font: SERIF, size: 32, bold: true, color: INK })],
      }));
      firstChapter = false; i++; continue;
    }
    if (/^## /.test(line)) { children.push(heading(line.replace(/^## /, '').trim(), 28)); i++; continue; }
    if (/^### /.test(line)) { children.push(heading(line.replace(/^### /, '').trim(), 25)); i++; continue; }

    // Scene break / horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 160, after: 160 },
        children: [new TextRun({ text: '* * *', font: SERIF, size: BODY, color: INK })],
      }));
      i++; continue;
    }

    // Blockquote (collect consecutive).
    if (/^> /.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^> /.test(lines[i])) { buf.push(lines[i].replace(/^> /, '')); i++; }
      children.push(new Paragraph({
        indent: { left: 480 }, spacing: { line: 360, lineRule: 'auto', after: 120 },
        children: inlineRuns(buf.join(' ').trim(), { italics: true, color: QUOTE }),
      }));
      continue;
    }

    // Bulleted list.
    if (/^[-*+] /.test(line)) {
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: inlineRuns(lines[i].replace(/^[-*+] /, '')) }));
        i++;
      }
      continue;
    }

    // Ordered list — keep the literal numbering (avoids a docx numbering config
    // for a case manuscripts almost never use).
    if (/^\d+\. /.test(line)) {
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 40 }, children: inlineRuns(lines[i]) }));
        i++;
      }
      continue;
    }

    if (t === '') { i++; continue; }

    // Paragraph — accumulate consecutive non-blank, non-special lines.
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isSpecial(lines[i])) { buf.push(lines[i]); i++; }
    children.push(new Paragraph({ ...paraOpts(), children: inlineRuns(buf.join(' ').trim()) }));
  }

  const p = meta.publishing ?? {};
  return new Document({
    title: meta.title,
    creator: meta.author || undefined,
    description: p.subtitle || undefined,
    styles: { default: { document: { run: { font: SERIF, size: BODY, color: INK } } } },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children,
    }],
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
