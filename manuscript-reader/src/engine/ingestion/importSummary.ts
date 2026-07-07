// ─── Ingestion Engine: import review summary ─────────────────────────────────
// The decision layer behind the import REVIEW CARD — the one-time, confirm-before-
// reading surface where the author verifies what ingestion understood (title,
// author, and a front / chapters / back outline with word counts) and corrects it.
// Per the ingestion brief: the heuristics only need to be good enough to PROPOSE;
// this is where a wrong guess becomes a one-click fix instead of a silent error.
//
// Pure and browser-independent (buildManuscriptStructure + extractFrontMatterCandidates
// + word counts + smell flags), so it works for EVERY import path — DOCX, Markdown,
// paste — not just the layout-signal DOCX route. The smell flags are decisions, so
// they live here in the engine, not in the card component.

import { buildManuscriptStructure } from './manuscriptStructure';
import { extractFrontMatterCandidates } from './frontMatterExtract';
import { countWords, stripChapterLabel } from './parseMarkdown';
import { parseMatterDoc, reassembleMatterDoc } from '../manuscript/matterEdit';
import type { MatterSection, ChapterSection, MatterRegion, StructuralBlock } from '../types';

export interface ImportSection {
  /** For chapters this is the display title; for matter, the classified role. */
  role: string;
  title: string;
  words: number;
  sceneBreaks?: number;
  /** A short prose preview so the author can judge "is this the right section?" —
   *  the single most important thing the counts-only card omitted. */
  preview: string;
  /** Stable handle the Structure editor acts on. Chapters carry a 1-based ordinal
   *  (document order); matter sections carry their region and a 0-based index within
   *  that region (duplicate roles are common after ingestion). */
  chapterIndex?: number;
  region?: MatterRegion;
  matterIndex?: number;
}

export interface ImportFlag {
  level: 'warn' | 'info';
  message: string;
}

/** The structured summary the review card renders. */
export interface ImportSummary {
  title: string;
  author?: string;
  /** Other detected publishing candidates (isbn, copyright…), for display. */
  metadata: Record<string, string>;
  front: ImportSection[];
  chapters: ImportSection[];
  back: ImportSection[];
  totalWords: number;
  /** Smell flags — where the author's eye should go. Empty when nothing looks off. */
  flags: ImportFlag[];
}

const ARTICLE_ONLY = /^(?:(?:the|a|an|of|and|or|to|in|on|with|for|from)\b\s*)+$/i;

const matterWords = (s: MatterSection): number =>
  s.blocks.reduce((n, b) => n + countWords(b.text), 0);
const chapterWords = (c: ChapterSection): number =>
  c.blocks.reduce((n, b) => n + countWords(b.text), 0);

/** First ~40 words of a section's prose — enough to recognize it, short enough to
 *  scan. Empty string when the section has no body text. */
const PREVIEW_WORDS = 40;
function preview(blocks: StructuralBlock[]): string {
  const text = blocks.map(b => b.text).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const words = text.split(' ');
  return words.length > PREVIEW_WORDS ? words.slice(0, PREVIEW_WORDS).join(' ') + '…' : text;
}

/** Build the review summary from already-ingested (post-preprocess) markdown. */
export function buildImportSummary(md: string): ImportSummary {
  const structure = buildManuscriptStructure(md);
  const candidates = extractFrontMatterCandidates(structure);

  const front: ImportSection[] = structure.frontMatter.map((s, i) => ({
    role: s.role, title: s.title, words: matterWords(s), preview: preview(s.blocks), region: 'front' as MatterRegion,
    matterIndex: i,
  }));
  const back: ImportSection[] = structure.backMatter.map((s, i) => ({
    role: s.role, title: s.title, words: matterWords(s), preview: preview(s.blocks), region: 'back' as MatterRegion,
    matterIndex: i,
  }));
  const chapters: ImportSection[] = structure.chapters.map((c, i) => ({
    role: 'chapter',
    title: stripChapterLabel(c.title),
    words: chapterWords(c),
    sceneBreaks: c.sceneBreakCount || undefined,
    preview: preview(c.blocks),
    chapterIndex: i + 1,
  }));
  const totalWords = chapters.reduce((n, c) => n + c.words, 0);

  const { author, ...restMeta } = candidates;
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(restMeta)) if (v) metadata[k] = String(v);

  // ── Smell flags — the same signals check-extraction surfaces, promoted into the
  //    engine so the card and the harness agree on what "looks off" means. ──
  const flags: ImportFlag[] = [];
  if (!structure.title) flags.push({ level: 'warn', message: 'No title detected — add one below.' });
  else if (ARTICLE_ONLY.test(structure.title)) flags.push({ level: 'warn', message: `The title reads as “${structure.title}” — likely truncated.` });
  if (chapters.length === 0) flags.push({ level: 'warn', message: 'No chapters detected.' });
  else if (chapters.length === 1 && totalWords > 4000) flags.push({ level: 'warn', message: 'The whole manuscript is one chapter — chapter breaks may not have been detected.' });
  const tiny = chapters.filter(c => c.words < 50).length;
  if (tiny > 0) flags.push({ level: 'info', message: `${tiny} chapter${tiny !== 1 ? 's' : ''} under 50 words — possibly a mis-split.` });
  if (!author) flags.push({ level: 'info', message: 'No author detected — add one below.' });

  return { title: structure.title, author, metadata, front, chapters, back, totalWords, flags };
}

// ─── Applying the author's title / author corrections ────────────────────────
// The card lets the author fix the two things ingestion gets wrong most often.
// These write the correction back through the SAME seams ingestion uses — the
// `<!-- title: -->` comment and the title-page fence's `by` line — so every
// downstream consumer (parseMarkdown, extractFrontMatterCandidates, exports)
// sees the corrected value with no special-casing. Pure: fresh string, no mutation.

const TITLE_COMMENT = /^<!--\s*title:\s*.*?-->/im;
const BY_LINE = /^\s*(?:by|written by)\s+.*$/im;

/**
 * Write a `by <author>` attribution into the title-page fence(s). `onlyIfAbsent`
 * (the signal auto-apply path) leaves an existing attribution untouched; without
 * it (the author's explicit correction) an existing `by` line is REPLACED. When
 * ingestion emitted multiple title-page fences, updates every fence that already
 * carries a `by` line; otherwise only the first title-page (the real title page).
 */
export function setAuthorByLine(md: string, author: string, opts: { onlyIfAbsent?: boolean } = {}): string {
  const p = parseMatterDoc(md);
  const titlePages = p.front.filter(s => s.role === 'title-page');
  if (!titlePages.length) return md;
  const withBy = titlePages.filter(s => BY_LINE.test(s.body));
  if (opts.onlyIfAbsent && withBy.length) return md;
  const targets = withBy.length ? withBy : [titlePages[0]];
  for (const sec of targets) {
    const hasBy = BY_LINE.test(sec.body);
    sec.body = hasBy ? sec.body.replace(BY_LINE, `by ${author}`) : `by ${author}\n\n${sec.body}`;
  }
  return reassembleMatterDoc(p);
}

/** Comment-safe: no `<`, `>`, or comment-closing `--`. */
const commentSafe = (s: string) => s.replace(/[<>]/g, '').replace(/--+/g, '—').trim();

/** Set (or insert at top) the `<!-- title: X -->` comment. */
export function setTitleComment(md: string, title: string): string {
  const line = `<!-- title: ${commentSafe(title)} -->`;
  if (TITLE_COMMENT.test(md)) return md.replace(TITLE_COMMENT, line);
  return `${line}\n\n${md}`;
}

/** Apply the author's corrected title/author from the review card. Blank/omitted
 *  fields are left as ingested (never blanks out a detected value). */
export function applyImportEdits(md: string, edits: { title?: string; author?: string }): string {
  let out = md;
  if (edits.title && edits.title.trim()) out = setTitleComment(out, edits.title.trim());
  if (edits.author && edits.author.trim()) out = setAuthorByLine(out, edits.author.trim());
  return out;
}
