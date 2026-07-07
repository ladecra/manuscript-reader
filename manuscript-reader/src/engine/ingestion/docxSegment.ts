// ─── Ingestion Engine: DOCX evidence-scoring segmenter ───────────────────────
// Consumes the layout + style signals from docxSignals.ts and proposes a
// structural role for each paragraph that carries structural meaning (title,
// author, division, chapter head, front/back-matter heading, table of contents).
//
// It does NOT decide from any single cue. "Centered" means almost nothing on its
// own; "centered + first page + largest font, followed by a smaller centered
// line" is almost certainly title-then-author. Every proposal therefore carries
// its CONFIDENCE and the EVIDENCE that produced it — so the import review card can
// spend the author's attention only where the engine is unsure, and so a wrong
// call is debugged by asking "what evidence outweighed everything else?" rather
// than "which regex fired?".
//
// AUGMENT-FIRST (per plan): this produces PROPOSALS. The existing text pipeline
// stays primary; a thin bridge uses these proposals to correct/fill what the text
// heuristics miss and to feed the review card. Signals become primary only once
// this is proven on the corpus.

import type { MatterRole } from '../types';
import { classifyMatter, isTocHeading } from './preprocessMarkdown';
import type { DocxParagraph, DocxSignals } from './docxSignals';

/** The structural role a paragraph plays. `body` paragraphs carry no proposal. */
export type StructuralRole =
  | 'title'
  | 'author'
  | 'subtitle'
  | 'copyright'
  | 'division'   // Part / Book — a grouping above chapters
  | 'chapter'
  | 'matter'     // a front/back-matter section heading (dedication, foreword, …)
  | 'toc';       // table-of-contents heading or entry — dropped, never a chapter

export interface StructuralProposal {
  /** Index of the paragraph this proposal anchors to (docxSignals order). */
  index: number;
  role: StructuralRole;
  /** The paragraph text (chapter/division heads may merge an adjacent label). */
  text: string;
  /** 0–1. How strongly the evidence supports this role over the alternatives. */
  confidence: number;
  /** Human-readable cues that produced the call — surfaced in the review card. */
  evidence: string[];
  /** For `matter`, the classified role; for `division`/`chapter`, filled later. */
  matterRole?: MatterRole;
  /** The source paragraph indices this heading covers — one, or two when an
   *  adjacent label + title were merged ("CHAPTER 1" ¶ "WHITE HUNGER"). The bridge
   *  uses these to inject the heading and remove the consumed title paragraph. */
  sourceIndices: number[];
}

export interface DocxSegmentation {
  title?: StructuralProposal;
  author?: StructuralProposal;
  /** True when a confident body-start anchor was found — i.e. the front matter / title
   *  page could be separated from the body. When false, the layout gave no reliable
   *  chapter anchor (title-page apparatus reads as body), so callers must NOT trust
   *  the chapters enough to inject them — the structure is unanchored guesswork. */
  anchored: boolean;
  /** Structural headings in document order (divisions, chapters, matter). */
  headings: StructuralProposal[];
  /** Paragraph indices that belong to a table of contents (drop these). */
  tocIndices: number[];
}

// ─── Feature helpers ─────────────────────────────────────────────────────────

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const isShort = (s: string) => s.length <= 60 && wordCount(s) <= 10;
/** Long enough to be real body prose, not a heading or TOC row. */
const isBodyProse = (p: DocxParagraph) => !p.empty && wordCount(p.text) >= 12;

const LEGAL = /(copyright|©|all rights reserved|isbn|library of congress|printed in|first edition|published by|cataloging|a novel by|a verse translation|imprint|p\. cm\.|dc21|pe\d{3,})/i;
const PAGE_TAIL = /\d\s*$/; // a page number glued or trailing ("Introduction2", "BOOK I … 22")
const DIVISION_KEYWORD = /^(part|book)\b/i;
const CHAPTER_KEYWORD = /^(chapter|part|book|section|prologue|epilogue|interlude|prelude)\b/i;

/** Count of letters — used to reject single-letter drop caps ("A", "I", "V"). */
const letterCount = (s: string) => (s.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;

/** Normalize a style name for keyword matching: split camelCase and ACRONYM+Word
 *  boundaries ("FWChapterTitle" → "FW Chapter Title"), fold separators, lowercase. */
const normalizeStyle = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .toLowerCase();

/** A paragraph style that denotes a chapter/part/section HEAD (our own exports
 *  and common manuscript templates). Excludes a bare "Title" style (the book
 *  title, not a chapter) and body/prose styles ("Chapter Body Text" is body). */
function isChapterStyle(styleName?: string): boolean {
  if (!styleName) return false;
  const n = normalizeStyle(styleName);
  if (/\b(body|text|prose|normal|paragraph|caption|footer|header|toc)\b/.test(n)) return false;
  return /\b(chapter|part|book|section)\b/.test(n) || /\bheading ?1\b/.test(n);
}

/** Squash a weighted evidence sum into a 0–1 confidence. */
const squash = (score: number) => Math.max(0, Math.min(1, 1 - Math.exp(-score / 2)));

function nextNonEmpty(paras: DocxParagraph[], from: number): DocxParagraph | undefined {
  for (let k = from; k < paras.length; k++) if (!paras[k].empty) return paras[k];
  return undefined;
}

// ─── Table of contents ───────────────────────────────────────────────────────
// A "Contents" heading followed by a run of short, non-prose entries (page-number
// tails, TOC styles, centered rows). Dropped wholesale — a frozen TOC is exactly
// where stale chapter names + meaningless page numbers surface, and its entries
// otherwise masquerade as real chapter/division heads.

function findTocIndices(paras: DocxParagraph[]): Set<number> {
  const toc = new Set<number>();
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.empty) continue;
    const isTocStyle = /^toc\d?$/i.test(p.styleName ?? '');
    if (isTocStyle) { toc.add(i); continue; }
    if (!isTocHeading(p.text)) continue;
    // Consume following non-prose entries until real body prose or a page break
    // into a section that reads like content.
    toc.add(i);
    for (let j = i + 1; j < paras.length; j++) {
      const q = paras[j];
      if (q.empty) continue;
      // A page break ends the TOC — the list doesn't span pages; the body starts
      // after it. Without this the consumer swallows the first real chapter head
      // (its "CHAPTER 1" + title read as more short TOC-like lines).
      if (q.pageBreakBefore) break;
      const entryish = /^toc\d?$/i.test(q.styleName ?? '') ||
        PAGE_TAIL.test(q.text) ||
        (isShort(q.text) && !isBodyProse(q));
      if (entryish) { toc.add(j); continue; }
      break; // first real content ends the TOC
    }
  }
  return toc;
}

// ─── Title & author (first-page pyramid) ─────────────────────────────────────
// A title page is a font-size pyramid of centered lines at the very top: the
// largest centered text is the title (often split across lines — "THE" / "AENEID"
// / "of" / "VIRGIL"); the next, smaller centered non-legal line is the author.

function detectTitleAuthor(
  paras: DocxParagraph[],
  body: number | undefined,
  tocIdx: Set<number>,
  firstHeadingIdx: number,
): { title?: StructuralProposal; author?: StructuralProposal; consumed: number[] } {
  const rel = (p: DocxParagraph) => (body && p.fontSizeHalfPts ? p.fontSizeHalfPts / body : 1);
  // The title region is everything before the first structural heading (chapter/
  // division/matter) — i.e. the front title page, not the whole book.
  const region = paras.filter(p =>
    !p.empty && p.index < firstHeadingIdx && !tocIdx.has(p.index) && !LEGAL.test(p.text));

  // Title: the run of consecutive centered lines carrying the largest font, at the
  // top. Accumulate consecutive centered fragments (multi-line titles).
  const centeredLarge = region.filter(p => p.alignment === 'center' && rel(p) >= 1);
  if (!centeredLarge.length) return { consumed: [] };
  const maxRel = Math.max(...centeredLarge.map(rel));

  // The title is the run of consecutive centered lines at (near) the LARGEST font.
  // Cutting at the size drop is what separates the title from the author line
  // below it (36pt "Title" then 18pt "AUTHOR NAME" — both bigger than body, but
  // the author is a clear step smaller).
  const titleParts: DocxParagraph[] = [];
  let lastIdx = -2;
  for (const p of region) {
    const big = p.alignment === 'center' && rel(p) >= maxRel * 0.8 - 0.001;
    if (big && (titleParts.length === 0 || p.index - lastIdx <= 3)) {
      titleParts.push(p);
      lastIdx = p.index;
    } else if (titleParts.length) {
      break; // title block ended
    }
  }
  if (!titleParts.length) return { consumed: [] };

  const titleText = titleParts.map(p => p.text).join(' ').replace(/\s+/g, ' ').trim();
  const titleEv = ['centered', 'top of document'];
  if (body && titleParts.some(p => rel(p) > 1)) titleEv.push(`${Math.round(maxRel * 100)}% of body size`);
  if (titleParts.length > 1) titleEv.push(`${titleParts.length} lines merged`);
  const title: StructuralProposal = {
    index: titleParts[0].index, role: 'title', text: titleText,
    confidence: squash(2 + (body ? (maxRel - 1) * 2 : 0)), evidence: titleEv,
    sourceIndices: titleParts.map(p => p.index),
  };

  // Author: the next centered, non-legal line after the title block, smaller than
  // the title. Frequently CAPS ("ROLFE HUMPHRIES", "AUTHOR NAME").
  const afterTitle = region.filter(p => p.index > lastIdx);
  const authorP = afterTitle.find(p =>
    p.alignment === 'center' && rel(p) < maxRel && isShort(p.text) && !isTocHeading(p.text));
  let author: StructuralProposal | undefined;
  if (authorP) {
    const ev = ['centered', 'follows the title', 'smaller than title'];
    if (authorP.allCaps) ev.push('all caps');
    author = {
      index: authorP.index, role: 'author', text: authorP.text.replace(/^by\s+/i, '').trim(),
      confidence: squash(1.5 + (authorP.allCaps ? 0.5 : 0)), evidence: ev,
      sourceIndices: [authorP.index],
    };
  }
  const consumed = [...titleParts.map(p => p.index), ...(authorP ? [authorP.index] : [])];
  return { title, author, consumed };
}

// ─── Divisions & chapters ────────────────────────────────────────────────────

/** Score a paragraph as a chapter/division head. Returns evidence + weight, or
 *  null when it isn't heading-like at all. */
function scoreHeading(p: DocxParagraph, body: number | undefined, next: DocxParagraph | undefined): { weight: number; evidence: string[] } | null {
  if (p.empty || !isShort(p.text) || LEGAL.test(p.text)) return null;
  // A single-letter, styleless line is a drop cap or ornament, not a heading —
  // unless it's an explicit chapter marker (a number/keyword the caller merges).
  if (letterCount(p.text) <= 1 && !CHAPTER_KEYWORD.test(p.text)) return null;
  const ev: string[] = [];
  let w = 0;
  if (p.pageBreakBefore) { w += 1.6; ev.push('starts a new page'); }
  if (isChapterStyle(p.styleName)) { w += 1.8; ev.push(`style "${p.styleName}"`); }
  if (CHAPTER_KEYWORD.test(p.text)) { w += 0.8; ev.push('chapter/part keyword'); }
  if (p.alignment === 'center') { w += 0.7; ev.push('centered'); }
  if (p.allCaps) { w += 0.5; ev.push('all caps'); }
  if (p.bold) { w += 0.4; ev.push('bold'); }
  if (body && p.fontSizeHalfPts && p.fontSizeHalfPts > body) { w += 0.8; ev.push('larger than body'); }
  // A heading is followed by body prose (chapter) or another heading (division).
  if (next && isBodyProse(next)) { w += 0.6; ev.push('body prose follows'); }
  if (w < 1) return null; // not enough to call it a heading
  return { weight: w, evidence: ev };
}

// ─── Public entry ────────────────────────────────────────────────────────────

/** The paragraph where the book's body begins — the first confident chapter/
 *  division opener (NOT a matter heading). Everything before it is the title page
 *  + front matter, where centered/caps lines are title-page apparatus (title,
 *  author, publisher, legal), not chapters. A hard signal is required so the
 *  eager centered+caps cue can't fire on the title page. */
function findBodyStart(paras: DocxParagraph[], tocIdx: Set<number>): number {
  for (const p of paras) {
    if (p.empty || tocIdx.has(p.index) || LEGAL.test(p.text)) continue;
    if (classifyMatter(p.text)) continue; // matter isn't the body start
    if (!isShort(p.text) || letterCount(p.text) <= 1) continue;
    const strong =
      isChapterStyle(p.styleName) ||
      (p.pageBreakBefore) ||
      (p.allCaps && p.bold) ||
      CHAPTER_KEYWORD.test(p.text) ||
      /^\d{1,3}$/.test(p.text.trim());
    if (strong) return p.index;
  }
  return -1; // no confident body-start anchor found
}

export function segmentDocx(signals: DocxSignals): DocxSegmentation {
  const paras = signals.paragraphs;
  const body = signals.bodyFontSizeHalfPts;
  const tocIdx = findTocIndices(paras);
  const anchor = findBodyStart(paras, tocIdx);
  const anchored = anchor >= 0;
  const bodyStart = anchored ? anchor : 0; // unanchored: treat all as body (nothing injected)

  // Title & author live on the title page — the front region before bodyStart.
  // Detect them first so their lines are never mistaken for chapters.
  const { title, author, consumed } = detectTitleAuthor(paras, body, tocIdx, bodyStart);
  const consumedIdx = new Set(consumed);

  // Classify each non-empty, non-TOC paragraph that reads as a heading. In the
  // front region only matter headings are emitted (a title page's centered/caps
  // lines are apparatus, not chapters); from bodyStart on, full chapter/division
  // scoring applies.
  const headings: StructuralProposal[] = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.empty || tocIdx.has(i) || consumedIdx.has(i)) continue;

    const matterRole = classifyMatter(p.text);
    const next = nextNonEmpty(paras, i + 1);
    const h = scoreHeading(p, body, next);

    if (matterRole && (h || p.pageBreakBefore || isChapterStyle(p.styleName))) {
      const ev = ['recognized matter heading', ...(h?.evidence ?? [])];
      headings.push({ index: i, role: 'matter', text: p.text, matterRole, confidence: squash(2.2 + (h?.weight ?? 0) / 2), evidence: ev, sourceIndices: [i] });
      continue;
    }
    if (p.index < bodyStart) continue; // front-region apparatus, not a chapter
    if (!h) continue;

    // Division vs chapter: a Part/Book keyword, or a heading immediately followed
    // by ANOTHER heading (not body prose), is a division.
    const nextIsHeading = next && !isBodyProse(next) && scoreHeading(next, body, nextNonEmpty(paras, (next.index) + 1)) != null;
    const isDivision = DIVISION_KEYWORD.test(p.text) || (nextIsHeading && DIVISION_KEYWORD.test(p.text));
    const role: StructuralRole = isDivision ? 'division' : 'chapter';
    const ev = [...h.evidence];
    if (isDivision) ev.unshift('Part/Book keyword');

    // Merge an adjacent label+title pair ("CHAPTER 1" ¶ "WHITE HUNGER",
    // "1" ¶ "THE PROCESSION") into a single heading — the number line and the
    // title line are one chapter opener split across two paragraphs.
    let text = p.text;
    const sourceIndices = [p.index];
    if (!isDivision && /^(chapter\s+)?(\d{1,3}|[ivxlcdm]+)\.?$/i.test(p.text) && next && isShort(next.text) && !isBodyProse(next) && scoreHeading(next, body, nextNonEmpty(paras, next.index + 1))) {
      text = `${p.text} ${next.text}`.replace(/\s+/g, ' ').trim();
      ev.push('number + title merged');
      sourceIndices.push(next.index);
      i = next.index; // consume the title paragraph
    }

    headings.push({ index: p.index, role, text, confidence: squash(h.weight), evidence: ev, sourceIndices });
  }

  return { title, author, anchored, headings, tocIndices: [...tocIdx].sort((a, b) => a - b) };
}
