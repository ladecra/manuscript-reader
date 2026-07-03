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

const TITLE_COMMENT = /^<!--\s*title:\s*.*?-->/im;
const TITLE_PAGE_FENCE =
  /(<!--\s*matter:front\s+role="title-page"[^\n]*?-->\n)([\s\S]*?)(\n<!--\s*\/matter\s*-->)/;
const BY_LINE = /^\s*(?:by|written by)\s+\S/im;

/** Comment-safe: a value written into an HTML comment must not contain `<`, `>`
 *  or the `--` that could close it. */
const commentSafe = (s: string) => s.replace(/[<>]/g, '').replace(/--+/g, '—').trim();

/** Set (or insert) the `<!-- title: X -->` comment at the top of the markdown. */
function setTitleComment(md: string, title: string): string {
  const line = `<!-- title: ${commentSafe(title)} -->`;
  if (TITLE_COMMENT.test(md)) return md.replace(TITLE_COMMENT, line);
  return `${line}\n\n${md}`;
}

/** Inject a `by <author>` line into the title-page fence when it lacks an explicit
 *  attribution, so extractFrontMatterCandidates recovers an author the draft never
 *  "by"-marked. The centered author name usually IS already in the title-page
 *  prose — but as a bare line the extractor's `by`-pattern can't see; the injected
 *  marker is what makes it recoverable. A fence with an existing `by …` line, or
 *  no title-page fence at all, is left untouched. */
function injectAuthor(md: string, author: string): string {
  const m = TITLE_PAGE_FENCE.exec(md);
  if (!m) return md;
  if (BY_LINE.test(m[2])) return md; // already attributed with a "by" line
  // Blank line after, so the attribution is its own paragraph — otherwise it
  // merges with the title line below and the extractor's `by` capture swallows it.
  const inserted = `${m[1]}by ${author}\n\n${m[2]}${m[3]}`;
  return md.slice(0, m.index) + inserted + md.slice(m.index + m[0].length);
}

/**
 * Apply the confident title/author proposals to already-preprocessed markdown.
 * Pure: returns augmented markdown, mutates nothing. The text pipeline's own
 * title stands unless the layout signal is confident (layout is the more reliable
 * source — a flattened title page routinely yields "The" or a filename fallback).
 */
export function applySignalsToMarkdown(md: string, seg: DocxSegmentation): string {
  let out = md;
  if (seg.title && seg.title.confidence >= TITLE_MIN && seg.title.text.trim()) {
    out = setTitleComment(out, seg.title.text);
  }
  if (seg.author && seg.author.confidence >= AUTHOR_MIN && seg.author.text.trim()) {
    out = injectAuthor(out, seg.author.text.trim());
  }
  return out;
}
