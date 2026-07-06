// ─── Manuscript-wide term sweep ────────────────────────────────────────────────
// The payoff of the bare-flag gesture: highlight "without" once, and the engine
// computes every occurrence across the whole manuscript — exact counts per
// chapter plus bounded context snippets. Pure string work over the same parsed
// chapter text the anchor machinery uses (no DOM, no models). Counts are always
// exact; snippets are capped so a 500-hit sweep stays a light object.

import type { SweepResult } from '../types';
import { getParsedManuscript } from '../ingestion/parseCache';

const MAX_SNIPPETS_TOTAL = 24;  // across the manuscript, chapter order
const SNIPPET_RADIUS = 60;      // chars of context either side of the hit

/** Word-ish boundary check so "without" doesn't count "withoutward"; multi-word
 *  and punctuation terms (". A beat.") fall back to plain substring matching. */
function isWordBounded(text: string, start: number, len: number): boolean {
  const before = start > 0 ? text[start - 1] : ' ';
  const after = start + len < text.length ? text[start + len] : ' ';
  return !/[A-Za-z0-9]/.test(before) && !/[A-Za-z0-9]/.test(after);
}

function snippetAt(text: string, start: number, len: number): string {
  const from = Math.max(0, start - SNIPPET_RADIUS);
  const to = Math.min(text.length, start + len + SNIPPET_RADIUS);
  const core = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return `${from > 0 ? '…' : ''}${core}${to < text.length ? '…' : ''}`;
}

/**
 * Case-insensitive sweep of `term` over the manuscript's chapter prose.
 * Single-word alphanumeric terms match on word boundaries; anything else
 * (phrases, punctuation patterns) matches as a raw substring.
 */
export function sweepTerm(combinedMarkdown: string, term: string): SweepResult {
  const needle = term.trim().toLowerCase();
  const empty: SweepResult = { term, total: 0, chapters: [] };
  if (!needle || !combinedMarkdown) return empty;
  const wordMode = /^[a-z0-9'’-]+$/i.test(needle);

  const { blocks, chapters } = getParsedManuscript(combinedMarkdown);
  const titles = new Map(chapters.map(c => [c.index, c.title]));

  // Assemble chapter plain texts (forematter chapterIndex ≤ 0 excluded — sweeps
  // are prose concerns).
  const texts = new Map<number, string>();
  for (const b of blocks) {
    if (b.chapterIndex <= 0) continue;
    const prev = texts.get(b.chapterIndex);
    texts.set(b.chapterIndex, prev ? `${prev}\n${b.text}` : b.text);
  }

  const result: SweepResult = { term, total: 0, chapters: [] };
  let snippetBudget = MAX_SNIPPETS_TOTAL;
  for (const idx of [...texts.keys()].sort((a, b) => a - b)) {
    const text = texts.get(idx)!;
    const lower = text.toLowerCase();
    let count = 0;
    const snippets: string[] = [];
    let at = lower.indexOf(needle);
    while (at !== -1) {
      if (!wordMode || isWordBounded(text, at, needle.length)) {
        count++;
        if (snippetBudget > 0) { snippets.push(snippetAt(text, at, needle.length)); snippetBudget--; }
      }
      at = lower.indexOf(needle, at + needle.length);
    }
    if (count > 0) {
      result.total += count;
      result.chapters.push({ chapterIndex: idx, chapterTitle: titles.get(idx) ?? '', count, snippets });
    }
  }
  return result;
}
