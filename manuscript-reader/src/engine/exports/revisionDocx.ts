// ─── DOCX Intelligence Report Export ──────────────────────────────────────────
// Builds a richly formatted Word document from a manuscript's annotations and
// the EditorialSignals object. Ported from the v0.9 prototype's buildRevisionPacketDoc,
// adapted to the typed `docx` npm package; reads raw stats from signals.report and
// the cross-reader agreement from the multi-reader fields.

import {
  Document, Paragraph, TextRun, AlignmentType, BorderStyle, WidthType,
  Table, TableRow, TableCell, ShadingType, PageNumber, Footer, Packer,
  type IParagraphOptions, type ITableCellOptions,
} from 'docx';
import type { Annotation, AnnotationType, Chapter, EditorialSignals } from '../types';
import { ANNOTATION_TYPES, ANNOTATION_LABELS } from '../types';

const HEX: Record<AnnotationType, string> = {
  highlight: 'C79A3A', note: '8A857A', bookmark: '6366F1',
  question: 'EF6461', continuity: '2F9E7D', structural: 'FB923C',
};
const INK = '1B1A17', HEAD = '2C2A26', BODY = '3D3A36', META = '6B6760',
      RULE = 'E4E0D6', QUOTE = '5A5750', LABEL = 'A09B90', PAPER = 'F7F5F0';
const SERIF = 'Georgia', SANS = 'Arial';
const NONE = { style: BorderStyle.NONE };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE };

interface LabelOpts {
  color?: string;
  before?: number;
  after?: number;
  border?: boolean;
}

function stripChapterPrefix(title: string): string {
  return title.replace(/^Chapter \d+\s*[—-]?\s*/i, '');
}

function buildDoc(data: {
  title: string;
  signals: EditorialSignals;
  annotations: Annotation[];
  chapters: Chapter[];
  dateStr: string;
}): Document {
  const { title, signals, annotations, chapters, dateStr } = data;
  const rep = signals.report;
  const pct = (n: number) => rep.totalAnns ? Math.round((n / rep.totalAnns) * 100) : 0;

  const label = (t: string, opts: LabelOpts = {}): Paragraph => new Paragraph({
    children: [new TextRun({ text: t.toUpperCase(), font: SANS, size: 15, bold: true,
      color: opts.color || LABEL, characterSpacing: 24 })],
    spacing: { before: opts.before ?? 360, after: opts.after ?? 120 },
    ...(opts.border ? { border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE, space: 6 } } } : {}),
  });
  const gap = (before = 0, after = 0): Paragraph => new Paragraph({ children: [], spacing: { before, after } });
  const cell = (children: (Paragraph | Table)[], w: number | null, extra: Partial<ITableCellOptions> = {}): TableCell => new TableCell({
    width: w != null ? { size: w, type: WidthType.DXA } : undefined,
    borders: extra.borders || noBorders,
    margins: extra.margins || { top: 40, bottom: 40, left: 0, right: 0 },
    shading: extra.shading,
    verticalAlign: extra.verticalAlign,
    children,
  });

  const children: (Paragraph | Table)[] = [];

  // ════════ HEADER ════════
  children.push(new Paragraph({
    children: [new TextRun({ text: 'MANUSCRIPT INTELLIGENCE REPORT', font: SANS, size: 14,
      bold: true, color: LABEL, characterSpacing: 30 })],
    spacing: { after: 60 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: title, font: SERIF, size: 52, color: INK })],
    spacing: { after: 90 },
  }));
  const metaBits = [
    `${rep.totalWords.toLocaleString()} words`,
    `${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}`,
    rep.readers.length ? `${rep.readers.length} reader${rep.readers.length !== 1 ? 's' : ''}` : null,
    `${rep.totalAnns} annotation${rep.totalAnns !== 1 ? 's' : ''}`,
    `Generated ${dateStr}`,
  ].filter(Boolean) as string[];
  children.push(new Paragraph({
    children: [new TextRun({ text: metaBits.join('   ·   '), font: SANS, size: 17, color: META })],
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 12 } },
  }));

  // ════════ AT A GLANCE ════════
  children.push(label('At a Glance', { before: 320, after: 140 }));
  const glance = [
    { n: rep.totalAnns, lab: 'Total Annotations', sub: `${(rep.totalAnns / (rep.totalWords / 1000 || 1)).toFixed(1)} per 1,000 words`, color: HEX.highlight },
    { n: rep.typeTotals.question, lab: 'Questions', sub: `${pct(rep.typeTotals.question)}% of all`, color: HEX.question },
    { n: rep.typeTotals.bookmark, lab: 'Bookmarks', sub: `${pct(rep.typeTotals.bookmark)}% of all`, color: HEX.bookmark },
    { n: rep.typeTotals.highlight, lab: 'Highlights', sub: `${pct(rep.typeTotals.highlight)}% of all`, color: HEX.highlight },
    { n: rep.typeTotals.continuity, lab: 'Continuity Flags', sub: `${pct(rep.typeTotals.continuity)}% of all`, color: HEX.continuity },
  ];
  const cardW = Math.floor(9360 / glance.length);
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: glance.map(() => cardW),
    borders: noBorders,
    rows: [new TableRow({ children: glance.map(g => new TableCell({
      width: { size: cardW, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.SINGLE, size: 18, color: g.color }, bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE }, left: NONE, right: { style: BorderStyle.SINGLE, size: 6, color: 'FFFFFF' } },
      shading: { type: ShadingType.CLEAR, fill: PAPER, color: 'auto' },
      margins: { top: 140, bottom: 140, left: 120, right: 120 },
      children: [
        new Paragraph({ children: [new TextRun({ text: String(g.n), font: SERIF, size: 40, color: INK })], spacing: { after: 30 } }),
        new Paragraph({ children: [new TextRun({ text: g.lab.toUpperCase(), font: SANS, size: 13, bold: true, color: META, characterSpacing: 16 })], spacing: { after: 20 } }),
        new Paragraph({ children: [new TextRun({ text: g.sub, font: SANS, size: 14, color: LABEL })] }),
      ],
    })) })],
  }));
  children.push(gap(0, 360));

  // ════════ ANNOTATION DENSITY BY CHAPTER ════════
  children.push(label('Annotation Density by Chapter', { before: 200, after: 60 }));
  children.push(new Paragraph({ children: [new TextRun({ text: 'Annotations per 1,000 words', font: SANS, size: 15, color: LABEL })], spacing: { after: 140 } }));
  const maxD = Math.max(0.0001, ...rep.chapters.map(c => c.density));
  const BAR = 4200;
  const blankRun = () => new Paragraph({ children: [new TextRun({ text: '', size: 14 })] });
  const densityRows = rep.chapters.map(c => {
    const chW = Math.max(c.count > 0 ? 40 : 0, Math.round(BAR * (c.density / maxD)));
    const segs: TableCell[] = [];
    if (c.count > 0) {
      ANNOTATION_TYPES.forEach(t => {
        const tc = c.counts[t] ?? 0;
        if (tc > 0) {
          const w = Math.max(24, Math.round(chW * (tc / c.count)));
          segs.push(new TableCell({ width: { size: w, type: WidthType.DXA }, borders: noBorders,
            shading: { type: ShadingType.CLEAR, fill: HEX[t], color: 'auto' }, margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [blankRun()] }));
        }
      });
    }
    let sum = 0;
    ANNOTATION_TYPES.forEach(t => { const tc = c.counts[t] ?? 0; if (tc > 0) sum += Math.max(24, Math.round(chW * (tc / c.count))); });
    const remainder = Math.max(0, BAR - sum);
    if (remainder > 0) segs.push(new TableCell({ width: { size: remainder, type: WidthType.DXA }, borders: noBorders,
      shading: { type: ShadingType.CLEAR, fill: 'FFFFFF', color: 'auto' }, margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: [blankRun()] }));
    const barTable = new Table({ width: { size: BAR, type: WidthType.DXA }, borders: noBorders,
      rows: [new TableRow({ height: { value: 150, rule: 'exact' }, children: segs.length ? segs : [new TableCell({ width: { size: BAR, type: WidthType.DXA }, borders: noBorders, children: [blankRun()] })] })] });

    return new TableRow({ children: [
      cell([new Paragraph({ children: [new TextRun({ text: `Ch ${String(c.index).padStart(2, '0')}`, font: SANS, size: 16, color: META })] })], 900, { margins: { top: 60, bottom: 60, left: 0, right: 80 }, verticalAlign: 'center' }),
      cell([barTable], BAR, { margins: { top: 60, bottom: 60, left: 0, right: 80 }, verticalAlign: 'center' }),
      cell([new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: c.density.toFixed(1), font: SANS, size: 18, bold: true, color: INK })] })], 1100, { margins: { top: 60, bottom: 60, left: 0, right: 80 }, verticalAlign: 'center' }),
      cell([new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${c.words.toLocaleString()} words`, font: SANS, size: 14, color: LABEL })] })], 1260, { margins: { top: 60, bottom: 60, left: 0, right: 0 }, verticalAlign: 'center' }),
    ] });
  });
  if (densityRows.length) children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [900, BAR, 1100, 1260], borders: noBorders, rows: densityRows }));
  children.push(gap(0, 360));

  // ════════ KEY TAKEAWAYS ════════
  children.push(label('Key Takeaways', { before: 200, after: 140 }));
  const takeaways: { color: string; title: string; desc: string }[] = [];
  if (rep.questionClusters.length) {
    const top = rep.questionClusters[0];
    const q = top.counts.question ?? 0;
    takeaways.push({ color: HEX.question, title: `High Question Density in Chapter ${top.index}`,
      desc: `Readers raised ${q} question${q !== 1 ? 's' : ''} in this chapter — among the highest in the manuscript. Worth checking for confusion or unanswered setups.` });
  }
  if (rep.hotspots.length) {
    const h = rep.hotspots[0];
    takeaways.push({ color: HEX.highlight, title: 'Major Hotspot Detected',
      desc: `Chapter ${h.index} drew ${h.count} annotations (${h.density.toFixed(1)} per 1,000 words) — a concentration that suggests a section that challenged or engaged readers.` });
  }
  if (rep.continuityFlags.length) {
    const chs = rep.continuityFlags.map(c => c.index).slice(0, 4).join(', ');
    takeaways.push({ color: HEX.continuity, title: 'Continuity Concerns to Review',
      desc: `Continuity was flagged in chapter${rep.continuityFlags.length !== 1 ? 's' : ''} ${chs}. Consider a focused continuity pass across these.` });
  }
  takeaways.push({ color: HEX.bookmark, title: `Reader Engagement: ${rep.label}`, desc: rep.blurb });
  takeaways.forEach(t => {
    children.push(new Paragraph({
      children: [new TextRun({ text: `●  ${t.title}`, font: SANS, size: 18, bold: true, color: t.color })],
      spacing: { before: 160, after: 40 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: t.desc, font: SERIF, size: 19, color: BODY })],
      indent: { left: 200 }, spacing: { after: 80 },
    }));
  });
  children.push(gap(0, 320));

  // ════════ HOTSPOTS + SILENT CHAPTERS ════════
  children.push(label('Top Annotation Hotspots', { before: 200, after: 120, border: true }));
  if (rep.hotspots.length) {
    rep.hotspots.slice(0, 3).forEach((h, i) => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${i + 1}   `, font: SERIF, size: 22, color: HEX.question }),
          new TextRun({ text: `Chapter ${h.index}${h.title ? ' — ' + stripChapterPrefix(h.title) : ''}`, font: SERIF, size: 20, color: HEAD }),
        ], spacing: { before: 120, after: 20 },
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: `${h.density.toFixed(1)} annotations / 1,000 words · ${h.count} total`, font: SANS, size: 15, color: META })],
        indent: { left: 320 }, spacing: { after: 40 },
      }));
    });
  } else {
    children.push(new Paragraph({ children: [new TextRun({ text: 'No standout hotspots yet.', font: SERIF, size: 19, color: LABEL })], spacing: { after: 40 } }));
  }

  children.push(label('Silent Chapters', { before: 280, after: 120, border: true }));
  if (rep.silent.length) {
    rep.silent.slice(0, 5).forEach(s => {
      children.push(new Paragraph({
        children: [new TextRun({ text: `Chapter ${s.index}${s.title ? ' — ' + stripChapterPrefix(s.title) : ''}`, font: SERIF, size: 20, color: HEX.bookmark })],
        spacing: { before: 120, after: 20 },
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: s.count === 0 ? 'No annotations — readers passed through without reacting.' : `${s.density.toFixed(1)} / 1,000 words · below the manuscript average (${rep.avgDensity.toFixed(1)})`, font: SANS, size: 15, color: META })],
        indent: { left: 0 }, spacing: { after: 40 },
      }));
    });
  } else {
    children.push(new Paragraph({ children: [new TextRun({ text: 'Every chapter drew engagement.', font: SERIF, size: 19, color: LABEL })], spacing: { after: 40 } }));
  }
  children.push(gap(0, 320));

  // ════════ READER AGREEMENT (multi-reader; Phase 6 EditorialSignals) ════════
  // Of the readers who *reached* each chapter, how many independently reacted —
  // the cross-reader signal the single-version report can't produce. Only shown
  // once at least one reader session exists.
  if (signals.readerCount > 0) {
    children.push(label('Reader Agreement', { before: 200, after: 60, border: true }));
    const completionPct = Math.round(signals.completionRate * 100);
    const versionsNote = signals.versionsRead.length > 1
      ? `  ·  readers saw ${signals.versionsRead.length} different drafts`
      : '';
    children.push(new Paragraph({
      children: [new TextRun({ text: `${signals.readerCount} reader${signals.readerCount !== 1 ? 's' : ''}  ·  ${completionPct}% finished${versionsNote}`, font: SANS, size: 15, color: META })],
      spacing: { after: 140 },
    }));
    if (signals.readerAgreement.length) {
      signals.readerAgreement.slice(0, 6).forEach(a => {
        const reached = a.readersWhoReached < 0 ? signals.readerCount : a.readersWhoReached;
        const pct = Math.round(a.agreement * 100);
        children.push(new Paragraph({
          children: [new TextRun({ text: `Chapter ${a.chapterIndex}${a.chapterTitle ? ' — ' + stripChapterPrefix(a.chapterTitle) : ''}`, font: SERIF, size: 20, color: HEAD })],
          spacing: { before: 100, after: 16 },
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: `${a.readersWhoAnnotated} of ${reached} readers reacted  ·  ${pct}% agreement`, font: SANS, size: 15, color: META })],
          spacing: { after: 30 },
        }));
      });
    } else {
      children.push(new Paragraph({ children: [new TextRun({ text: 'No chapter drew multiple readers yet.', font: SERIF, size: 19, color: LABEL })], spacing: { after: 40 } }));
    }
    children.push(gap(0, 320));
  }

  // ════════ ANNOTATION TYPE BREAKDOWN ════════
  children.push(label('Annotation Type Breakdown', { before: 200, after: 60 }));
  children.push(new Paragraph({ children: [new TextRun({ text: 'Distribution across the manuscript', font: SANS, size: 15, color: LABEL })], spacing: { after: 140 } }));
  const maxT = Math.max(1, ...ANNOTATION_TYPES.map(t => rep.typeTotals[t]));
  const typeRows = ANNOTATION_TYPES.filter(t => rep.typeTotals[t] > 0).map(t => {
    const n = rep.typeTotals[t]; const fillW = Math.max(60, Math.round(3000 * (n / maxT)));
    const barTable = new Table({ width: { size: 3000, type: WidthType.DXA }, borders: noBorders, rows: [new TableRow({ height: { value: 120, rule: 'exact' }, children: [
      new TableCell({ width: { size: fillW, type: WidthType.DXA }, borders: noBorders, shading: { type: ShadingType.CLEAR, fill: HEX[t], color: 'auto' }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ children: [new TextRun({ text: '', size: 12 })] })] }),
      new TableCell({ width: { size: 3000 - fillW, type: WidthType.DXA }, borders: noBorders, shading: { type: ShadingType.CLEAR, fill: 'FFFFFF', color: 'auto' }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ children: [new TextRun({ text: '', size: 12 })] })] }),
    ] })] });
    return new TableRow({ children: [
      cell([new Paragraph({ children: [new TextRun({ text: '■ ', font: SANS, size: 18, color: HEX[t] }), new TextRun({ text: ANNOTATION_LABELS[t], font: SERIF, size: 19, color: HEAD })] })], 2600, { margins: { top: 60, bottom: 60, left: 0, right: 80 }, verticalAlign: 'center' }),
      cell([barTable], 3000, { margins: { top: 60, bottom: 60, left: 0, right: 120 }, verticalAlign: 'center' }),
      cell([new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${n}  ·  ${pct(n)}%`, font: SANS, size: 17, color: META })] })], 1760, { margins: { top: 60, bottom: 60, left: 0, right: 0 }, verticalAlign: 'center' }),
    ] });
  });
  if (typeRows.length) children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2600, 3000, 1760], borders: noBorders, rows: typeRows }));
  children.push(gap(0, 320));

  // ════════ REPORT DETAILS ════════
  children.push(label('Report Details', { before: 200, after: 120 }));
  const detail = (k: string, v: string | number) => new TableRow({ children: [
    cell([new Paragraph({ children: [new TextRun({ text: k.toUpperCase(), font: SANS, size: 14, bold: true, color: LABEL, characterSpacing: 14 })] })], 2600, { margins: { top: 60, bottom: 60, left: 0, right: 80 } }),
    cell([new Paragraph({ children: [new TextRun({ text: String(v), font: SERIF, size: 19, color: HEAD })] })], 6760, { margins: { top: 60, bottom: 60, left: 0, right: 0 } }),
  ] });
  children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2600, 6760], borders: noBorders,
    rows: [
      detail('Manuscript', title),
      detail('Total Words', rep.totalWords.toLocaleString()),
      detail('Chapters', chapters.length),
      detail('Total Readers', rep.readers.length ? `${rep.readers.length} — ${rep.readers.join(', ')}` : 'You only'),
      detail('Engagement', `${rep.score} / 100 · ${rep.label}`),
      detail('Generated', dateStr),
    ] }));

  // ════════ BY-CHAPTER ANNOTATION DETAIL ════════
  children.push(new Paragraph({ children: [], pageBreakBefore: true }));
  children.push(label('Annotations by Chapter', { before: 0, after: 120, border: true }));
  const sorted = [...annotations].sort((a, b) => (a.chapterIndex - b.chapterIndex) || (a.createdAt - b.createdAt));
  const byCh: Record<number, { title: string; items: Annotation[] }> = {};
  sorted.forEach(a => { const k = a.chapterIndex || 0; (byCh[k] = byCh[k] || { title: a.chapterTitle, items: [] }).items.push(a); });
  Object.keys(byCh).sort((a, b) => +a - +b).forEach(k => {
    const ch = byCh[+k];
    const chLabel = ch.title ? (/^Chapter/i.test(ch.title) ? ch.title : `Chapter ${String(k).padStart(2, '0')} — ${ch.title}`) : 'Opening';
    children.push(new Paragraph({ children: [new TextRun({ text: chLabel, font: SERIF, size: 26, color: HEAD })], spacing: { before: 360, after: 120 } }));
    ch.items.forEach(a => {
      const head = [new TextRun({ text: ANNOTATION_LABELS[a.type].toUpperCase(), font: SANS, size: 15, bold: true, color: HEX[a.type], characterSpacing: 14 })];
      if (a.readerName) head.push(new TextRun({ text: `   ${a.readerName}`, font: SANS, size: 14, color: LABEL }));
      children.push(new Paragraph({ children: head, spacing: { before: 160, after: 50 } }));
      if (a.quote) children.push(new Paragraph({ children: [new TextRun({ text: `"${a.quote}"`, font: SERIF, size: 19, italics: true, color: QUOTE })],
        indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 10, color: HEX[a.type], space: 14 } }, spacing: { after: 50 } } as IParagraphOptions));
      if (a.note) children.push(new Paragraph({ children: [new TextRun({ text: a.note, font: SERIF, size: 19, color: BODY })], indent: { left: 360 }, spacing: { after: 60 } }));
    });
  });

  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: `${title}  —  Intelligence Report  —  `, font: SANS, size: 15, color: LABEL }),
    new TextRun({ children: [PageNumber.CURRENT], font: SANS, size: 15, color: LABEL }),
  ] })] });

  return new Document({
    styles: { default: { document: { run: { font: SERIF, size: 20, color: BODY } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      footers: { default: footer },
      children,
    }],
  });
}

/**
 * Build and download a DOCX intelligence report.
 * Returns a promise that resolves once the download has been triggered.
 */
export async function exportRevisionDocx(
  title: string,
  id: string,
  annotations: Annotation[],
  chapters: Chapter[],
  signals: EditorialSignals,
): Promise<void> {
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const doc = buildDoc({ title, signals, annotations, chapters, dateStr });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${id}-intelligence-report.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
