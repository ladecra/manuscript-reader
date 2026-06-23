// ─── Prose-analysis engine (Phase A — Tier 1: counts & ratios) ────────────────
// Deterministic metrics derived from the manuscript PROSE, not annotations.
// Consumes the already-parsed ManuscriptStructure (no re-parsing — one parse pass
// upstream, no second parser to drift). Pure and browser-independent; every
// figure traces to the text. Tier 1 only: chapter length, paragraph/scene
// structure, dialogue ratio, sentence rhythm. Lexical flags (Tier 2) and
// inferential proxies (Tier 3) come later — see raw/prose-analysis-engine-brief.md.

import type {
  ManuscriptStructure, ChapterSection, ProseAnalysis, ChapterProse, ProseBaselines,
} from '../types';
import { countWords } from '../ingestion/parseMarkdown';

// Blocks whose text is prose the reader actually reads. Headings aren't sentences,
// scene-breaks/lists/code aren't narrative — paragraphs and blockquotes carry it.
const PROSE_ROLES = new Set(['paragraph', 'blockquote']);

// Opening quotation marks across common conventions (straight, curly, guillemet).
// A paragraph that OPENS with one is classified as dialogue — the explicit, stated
// rule. Imperfect by design (action beats within dialogue, em-dash dialogue styles),
// so dialogue is reported as a ratio, never an exact line count.
const OPENING_QUOTES = ['"', '“', '«', '‘', "'"];

function isDialogue(text: string): boolean {
  const t = text.trimStart();
  return OPENING_QUOTES.some(q => t.startsWith(q));
}

// Sentence splitter: breaks after a run of . ! ? (plus an optional closing
// quote/bracket) at a whitespace boundary. A heuristic — abbreviations and
// ellipses can over/under-count — so callers use it for means and distributions,
// where small errors wash out, never as exact sentence truth.
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?]["'”’)\]]?)\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// Raw per-chapter accumulation, kept unrounded so manuscript baselines aggregate
// without compounding rounding error. Projected to the public ChapterProse after.
interface RawChapter {
  index: number;
  title: string;
  words: number;
  paragraphWords: number;
  paragraphs: number;
  scenes: number;
  dialogueWords: number;
  sentenceLengths: number[];
}

function rawChapter(ch: ChapterSection): RawChapter {
  const blocks = ch.blocks.filter(b => PROSE_ROLES.has(b.role) && b.text.trim());

  let words = 0, paragraphWords = 0, paragraphs = 0, dialogueWords = 0;
  const sentenceLengths: number[] = [];

  for (const b of blocks) {
    const w = countWords(b.text);
    words += w;
    if (b.role === 'paragraph') { paragraphs++; paragraphWords += w; }
    if (isDialogue(b.text)) dialogueWords += w;
    for (const s of splitSentences(b.text)) sentenceLengths.push(countWords(s));
  }

  return {
    index: ch.index,
    title: ch.title,
    words,
    paragraphWords,
    paragraphs,
    // A chapter with prose is at least one scene; no prose → no scenes.
    scenes: words > 0 ? ch.sceneBreakCount + 1 : 0,
    dialogueWords,
    sentenceLengths,
  };
}

function toChapterProse(c: RawChapter): ChapterProse {
  const sentences = c.sentenceLengths.length;
  const meanSentenceWords = sentences
    ? c.sentenceLengths.reduce((s, v) => s + v, 0) / sentences
    : 0;
  return {
    index: c.index,
    title: c.title,
    words: c.words,
    paragraphs: c.paragraphs,
    meanParagraphWords: c.paragraphs ? r1(c.paragraphWords / c.paragraphs) : 0,
    scenes: c.scenes,
    dialogueRatio: c.words ? r3(c.dialogueWords / c.words) : 0,
    sentences,
    meanSentenceWords: r1(meanSentenceWords),
    sentenceLengthVariance: r1(variance(c.sentenceLengths)),
  };
}

/**
 * Compute Tier-1 prose analysis for a parsed manuscript. Pure and deterministic
 * given the structure. Baselines are the manuscript's own means — the reference
 * every chapter is framed against. Degrades cleanly: an empty manuscript yields
 * empty chapters and zeroed baselines.
 */
export function computeProseAnalysis(structure: ManuscriptStructure): ProseAnalysis {
  const raw = structure.chapters.map(rawChapter);

  const withProse = raw.filter(c => c.words > 0);
  const totalWords = raw.reduce((s, c) => s + c.words, 0);
  const totalDialogueWords = raw.reduce((s, c) => s + c.dialogueWords, 0);
  const allSentenceLengths = raw.flatMap(c => c.sentenceLengths);
  const totalSentenceWords = allSentenceLengths.reduce((s, v) => s + v, 0);

  const baselines: ProseBaselines = {
    chapterCount: raw.length,
    totalWords,
    meanChapterWords: withProse.length ? r1(totalWords / withProse.length) : 0,
    meanSentenceWords: allSentenceLengths.length ? r1(totalSentenceWords / allSentenceLengths.length) : 0,
    dialogueRatio: totalWords ? r3(totalDialogueWords / totalWords) : 0,
  };

  return {
    generatedAt: Date.now(),
    chapters: raw.map(toChapterProse),
    baselines,
  };
}
