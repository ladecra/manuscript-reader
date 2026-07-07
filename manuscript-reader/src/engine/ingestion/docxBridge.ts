// ─── Ingestion Engine: signal → text-pipeline bridge (augment-first) ─────────
// The text pipeline (preprocessMarkdown) stays the structural authority. This
// bridge lets the DOCX layout signals CORRECT and FILL what the text pipeline
// can't see — the two things flattened Markdown loses hardest:
//   • the book TITLE (a font pyramid on the title page, not "by"-marked text), and
//   • the AUTHOR (the centered line under the title, usually with no "by" marker).
// Both are injected back into the normalized Markdown through existing seams — the
// `<!-- title: -->` comment and the title-page matter fence — so every downstream
// consumer (parseMarkdown, extractFrontMatterCandidates, exports) benefits with no
// new plumbing. It also assembles the ImportReview the confirmation card will read.
//
// Confidence-gated: only confident proposals are applied, and author is only ever
// ADDED (never overwrites an author the front matter already states). Everything
// remains reversible — the author confirms/edits in the Studio.

import type { DocxSegmentation, StructuralProposal } from './docxSegment';
import type { DocxSignals } from './docxSignals';
import { setTitleComment, setAuthorByLine } from './importSummary';

/** The structured, confidence-scored summary of what ingestion recovered — the
 *  data the import review card renders (title/author to confirm, the chapter/
 *  division spine, matter, and how much TOC was dropped). */
export interface ImportReview {
  title?: StructuralProposal;
  author?: StructuralProposal;
  divisions: StructuralProposal[];
  chapters: StructuralProposal[];
  matter: StructuralProposal[];
  /** How many paragraphs were dropped as table-of-contents. */
  tocDropped: number;
}

/** Confidence floors for AUTO-APPLYING a proposal to the markdown. Deliberately
 *  generous — the author confirms in the review card; a wrong auto-fill is a
 *  one-click fix, a missed one is invisible. */
const TITLE_MIN = 0.6;
const AUTHOR_MIN = 0.5;

/** Partition the segmenter's proposals into the review card's shape. */
export function buildImportReview(seg: DocxSegmentation): ImportReview {
  return {
    title: seg.title,
    author: seg.author,
    divisions: seg.headings.filter(h => h.role === 'division'),
    chapters: seg.headings.filter(h => h.role === 'chapter'),
    matter: seg.headings.filter(h => h.role === 'matter'),
    tocDropped: seg.tocIndices.length,
  };
}

// ─── Markdown augmentation ───────────────────────────────────────────────────

/**
 * Apply the confident title/author proposals to already-preprocessed markdown.
 * Pure: returns augmented markdown, mutates nothing. The title/author are written
 * through the shared ingestion seams (`setTitleComment`, `setAuthorByLine`); here
 * they are AUTO-applied only above a confidence floor and never overwrite an
 * attribution the draft already states (`onlyIfAbsent`). The text pipeline's own
 * title stands unless the layout signal is confident — layout is the more reliable
 * source, since a flattened title page routinely yields "The" or a filename fallback.
 */
export function applySignalsToMarkdown(md: string, seg: DocxSegmentation): string {
  let out = md;
  if (seg.title && seg.title.confidence >= TITLE_MIN && seg.title.text.trim()) {
    out = setTitleComment(out, seg.title.text);
  }
  if (seg.author && seg.author.confidence >= AUTHOR_MIN && seg.author.text.trim()) {
    out = setAuthorByLine(out, seg.author.text.trim(), { onlyIfAbsent: true });
  }
  return out;
}

// ─── Signal-driven structure injection (the one-giant-chapter fix) ───────────
// When the TEXT pipeline can't find chapter boundaries — a manuscript whose
// chapters are marked only visually (bare "BOOK I", body-styled matter, no Word
// heading styles) — it leaves the whole book as one chapter and never strips
// front/back matter (structureManuscript anchors on the first `#` heading, and
// there is none). The segmenter DID locate every boundary from layout. This
// injects a `# ` heading at each detected chapter/division/matter boundary in the
// RAW mammoth markdown and drops the TOC lines, then the normal pipeline
// (promote → structure → matter fences → title) runs unchanged over it. That is
// the whole point of the augment-first design: everything downstream is untouched;
// we only give the text pipeline the headings it couldn't see.

/** Normalize a line/paragraph for order-preserving text alignment: drop a leading
 *  `#`, HTML anchors mammoth leaves in, emphasis, backslash-escapes, and tabs;
 *  collapse whitespace; lowercase. */
const normLine = (s: string) =>
  s.replace(/^#+\s*/, '').replace(/<[^>]*>/g, '').replace(/[*_\\\t]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Map each DOCX paragraph index → its line index in the mammoth markdown, by a
 *  single forward walk (both are in document order). EXACT normalized match only —
 *  a prefix match would let a short line ("of", a drop-cap "A") overshoot the
 *  cursor and strand every later heading. A paragraph mammoth split/merged simply
 *  stays unmapped; the cursor holds so the next paragraph still aligns. */
function alignParagraphsToLines(lines: string[], paras: DocxSignals['paragraphs']): Map<number, number> {
  const map = new Map<number, number>();
  let cursor = 0;
  for (const para of paras) {
    if (para.empty) continue;
    const want = normLine(para.text);
    if (!want) continue;
    for (let li = cursor; li < lines.length; li++) {
      if (normLine(lines[li]) === want) {
        map.set(para.index, li);
        cursor = li + 1;
        break;
      }
    }
  }
  return map;
}

/**
 * Inject the segmenter's detected structure into the RAW (pre-preprocess) mammoth
 * markdown: a `# ` heading at every chapter/division/matter boundary, TOC lines
 * removed. Divisions become chapter-level headings for now (parts[] is deferred).
 * Pure: returns new markdown. Downstream preprocessMarkdown then fences matter and
 * recovers the title exactly as it does for a manuscript that had headings.
 */
export function injectSignalStructure(rawMarkdown: string, signals: DocxSignals, seg: DocxSegmentation): string {
  const lines = rawMarkdown.split('\n');
  const map = alignParagraphsToLines(lines, signals.paragraphs);
  const paras = signals.paragraphs;
  const wc = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

  // Drop TOC paragraphs (their entry rows otherwise promote to phantom chapters).
  for (const idx of seg.tocIndices) {
    const li = map.get(idx);
    if (li != null) lines[li] = '';
  }

  // A chapter/division heading is only injected if real content follows it before
  // the next heading — otherwise it's a stacked title/subtitle or apparatus line
  // that would become an empty 0-word "chapter". Measured as TOTAL words in the gap
  // (not a single long paragraph) so a poem's short verse lines still count. Matter
  // headings are EXEMPT — a dedication or acknowledgements is legitimately short.
  const starts = seg.headings.map(h => h.sourceIndices[0]).sort((a, b) => a - b);
  const nextStart = (idx: number) => starts.find(s => s > idx) ?? Infinity;
  const gapWords = (startIdx: number, limit: number) =>
    paras.reduce((n, p) => (p.index > startIdx && p.index < limit && !p.empty ? n + wc(p.text) : n), 0);

  // Inject a heading at each qualifying boundary; blank any merged-in title line.
  for (const h of seg.headings) {
    const [firstIdx, ...rest] = h.sourceIndices;
    const li = map.get(firstIdx);
    if (li == null) continue;
    if (h.role !== 'matter' && gapWords(Math.max(firstIdx, ...rest), nextStart(firstIdx)) < 30) continue;
    lines[li] = `# ${h.text}`;
    for (const extra of rest) {
      const el = map.get(extra);
      if (el != null) lines[el] = '';
    }
  }
  return lines.join('\n');
}

/** Does the text pipeline's result look like a failed segmentation — a whole book
 *  collapsed into one (or zero) chapters — such that signal structure should take
 *  over? A genuinely single-chapter short piece (few words) is left alone. */
export function textPipelineUnderSegmented(chapterCount: number, totalWords: number): boolean {
  return chapterCount === 0 || (chapterCount <= 1 && totalWords > 3000);
}
