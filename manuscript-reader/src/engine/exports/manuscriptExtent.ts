// ─── Submission extent resolver (pure) ────────────────────────────────────────
// Agents request a slice of a manuscript — "first 3 chapters", "first 50 pages",
// "first 10,000 words". This computes WHICH content a request includes, snapping to
// a clean boundary so it never cuts mid-sentence, and reports where it actually lands.
//
// The SMF convention is the simplifier: a "page" is ~250 manuscript words, so page and
// word requests are the same computation. Chapter requests cut exactly at a chapter
// boundary; page/word requests snap to the nearest paragraph end, preferring a scene
// break or chapter end within tolerance (agents accept going slightly over/under).
//
// `candidates` exposes the nearby stop points so a future interactive "choose the
// cutoff" UI is a drop-in — this resolver already knows them.

import type { ManuscriptStructure, ChapterSection, StructuralBlock } from '../types';

export const WORDS_PER_PAGE = 250; // SMF convention

export type ExtentRequest =
  | { kind: 'full' }
  | { kind: 'chapters'; count: number }
  | { kind: 'pages'; count: number }
  | { kind: 'words'; count: number };

/** A paragraph-boundary stop point near the target (for the resolved cut + the scrubber). */
export interface ExtentStopPoint {
  chapterIndex: number;
  blockEnd: number;   // exclusive index into that chapter's blocks
  words: number;      // cumulative manuscript words up to here
  pages: number;      // ceil(words / 250)
  atChapterEnd: boolean;
  atSceneBreak: boolean;
  label: string;
}

/** One included chapter; `blocks` may be a prefix of the chapter's blocks (partial). */
export interface ExtentChapter {
  chapter: ChapterSection;
  blocks: StructuralBlock[];
  partial: boolean;
}

export interface ResolvedExtent {
  chapters: ExtentChapter[];
  truncated: boolean;
  words: number;
  pages: number;
  endLabel: string;
  candidates: ExtentStopPoint[];
}

const blockWords = (b: StructuralBlock): number =>
  b.role === 'scene-break' ? 0 : (b.text.trim() ? b.text.trim().split(/\s+/).length : 0);

export const estimatePages = (words: number): number => Math.max(1, Math.ceil(words / WORDS_PER_PAGE));

export function totalWords(structure: ManuscriptStructure): number {
  let n = 0;
  for (const ch of structure.chapters) for (const b of ch.blocks) n += blockWords(b);
  return n;
}

/** Round to the nearest 1,000 for the SMF title-page word count. */
export const roundedWordCount = (words: number): number => Math.max(1000, Math.round(words / 1000) * 1000);

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const chapterLabel = (ch: ChapterSection): string => ch.title?.trim() || `Chapter ${ch.index}`;

interface Boundary { ci: number; biEnd: number; cum: number; chapterEnd: boolean; sceneBreak: boolean; }

function boundariesOf(chapters: ChapterSection[]): Boundary[] {
  const bounds: Boundary[] = [];
  let cum = 0;
  for (const ch of chapters) {
    const startLen = bounds.length;
    ch.blocks.forEach((b, bi) => {
      cum += blockWords(b);
      if (b.role === 'scene-break') {
        bounds.push({ ci: ch.index, biEnd: bi, cum, chapterEnd: false, sceneBreak: true }); // stop before the break glyph
      } else if (b.role === 'paragraph' || b.role === 'blockquote' || b.role === 'list' || b.role === 'code') {
        bounds.push({ ci: ch.index, biEnd: bi + 1, cum, chapterEnd: false, sceneBreak: false });
      }
    });
    if (bounds.length > startLen) bounds[bounds.length - 1].chapterEnd = true;
  }
  return bounds;
}

function fullChapters(chapters: ChapterSection[]): ExtentChapter[] {
  return chapters.map(chapter => ({ chapter, blocks: chapter.blocks, partial: false }));
}

function stopLabel(chapters: ChapterSection[], b: Boundary): string {
  const ch = chapters.find(c => c.index === b.ci);
  const name = ch ? chapterLabel(ch) : `Chapter ${b.ci}`;
  if (b.chapterEnd) return `Ends after ${name}`;
  if (b.sceneBreak) return `Ends at a scene break in ${name}`;
  return `Ends partway through ${name}`;
}

export function resolveExtent(structure: ManuscriptStructure, request: ExtentRequest): ResolvedExtent {
  const chapters = structure.chapters;
  const total = totalWords(structure);

  if (request.kind === 'full' || chapters.length === 0) {
    return { chapters: fullChapters(chapters), truncated: false, words: total, pages: estimatePages(total), endLabel: 'Complete manuscript', candidates: [] };
  }

  if (request.kind === 'chapters') {
    const n = clamp(Math.round(request.count), 1, chapters.length);
    const taken = chapters.slice(0, n);
    const words = taken.reduce((s, ch) => s + ch.blocks.reduce((a, b) => a + blockWords(b), 0), 0);
    const truncated = n < chapters.length;
    const endLabel = n === 1 ? `${chapterLabel(taken[0])} only` : `Chapters 1–${n}`;
    return { chapters: fullChapters(taken), truncated, words, pages: estimatePages(words), endLabel, candidates: [] };
  }

  // pages / words → a target word count
  const target = request.kind === 'pages' ? Math.round(request.count) * WORDS_PER_PAGE : Math.round(request.count);
  const bounds = boundariesOf(chapters);
  if (bounds.length === 0 || target >= total) {
    return { chapters: fullChapters(chapters), truncated: false, words: total, pages: estimatePages(total), endLabel: 'Complete manuscript', candidates: [] };
  }

  // Default: the first paragraph boundary that reaches/crosses the target (slightly over,
  // never mid-sentence). Then snap to a chapter end or scene break within tolerance.
  let idx = bounds.findIndex(b => b.cum >= target);
  if (idx === -1) idx = bounds.length - 1;
  const window = Math.max(WORDS_PER_PAGE, target * 0.12);
  const inWindow = bounds.filter(b => b.cum >= target - window && b.cum <= target + window);
  const closest = (arr: Boundary[]): Boundary => arr.reduce((best, b) => Math.abs(b.cum - target) < Math.abs(best.cum - target) ? b : best);
  const chEnds = inWindow.filter(b => b.chapterEnd);
  const scenes = inWindow.filter(b => b.sceneBreak);
  const chosen = chEnds.length ? closest(chEnds) : scenes.length ? closest(scenes) : bounds[idx];

  const inc: ExtentChapter[] = [];
  for (const ch of chapters) {
    if (ch.index < chosen.ci) { inc.push({ chapter: ch, blocks: ch.blocks, partial: false }); continue; }
    if (ch.index === chosen.ci) {
      const blocks = ch.blocks.slice(0, chosen.biEnd);
      inc.push({ chapter: ch, blocks, partial: !chosen.chapterEnd && chosen.biEnd < ch.blocks.length });
      break;
    }
  }

  // Candidate stop points for the future scrubber: paragraph boundaries near the cut.
  const candWindow = Math.max(WORDS_PER_PAGE * 1.5, target * 0.15);
  const candidates: ExtentStopPoint[] = bounds
    .filter(b => Math.abs(b.cum - chosen.cum) <= candWindow)
    .slice(0, 11)
    .map(b => ({
      chapterIndex: b.ci, blockEnd: b.biEnd, words: b.cum, pages: estimatePages(b.cum),
      atChapterEnd: b.chapterEnd, atSceneBreak: b.sceneBreak, label: stopLabel(chapters, b),
    }));

  return { chapters: inc, truncated: true, words: chosen.cum, pages: estimatePages(chosen.cum), endLabel: stopLabel(chapters, chosen), candidates };
}

/** Light summary for the export UI — what a request resolves to, without rendering. */
export interface ExtentSummary { words: number; pages: number; chapters: number; truncated: boolean; endLabel: string; totalWords: number; totalChapters: number; }

export function summarizeExtent(structure: ManuscriptStructure, request: ExtentRequest): ExtentSummary {
  const r = resolveExtent(structure, request);
  return {
    words: r.words, pages: r.pages, chapters: r.chapters.length, truncated: r.truncated, endLabel: r.endLabel,
    totalWords: totalWords(structure), totalChapters: structure.chapters.length,
  };
}
