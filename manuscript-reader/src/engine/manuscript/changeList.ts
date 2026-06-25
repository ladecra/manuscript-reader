// ─── Change list — coalesce + filter the Edit log (Phase 8, Changes mode) ─────
// The raw Edit log is append-only and fine-grained: revising one paragraph five
// times is five edits, and toggling a heading level or bolding a word is an edit
// whose rendered text never changed. For revision *review* the author wants the
// meaningful before→after per passage, not every keystroke-level commit.
//
// This pure pass turns Edit[] into ChangeEntry[]:
//   • Coalesce chains — an edit whose original matches a prior edit's replacement
//     (same chapter) continues that chain when the two edits' changed regions
//     overlap in the shared "before" text. Whole-chapter commits (Manuscript mode)
//     share the same before/after snapshot between scenes, so without the overlap
//     guard unrelated scene edits would collapse into one unreadable entry.
//   • Drop noise — entries whose rendered text didn't actually change (pure
//     formatting), and empty results.
// Matching is on the RENDERED text (editRenderedNeedle), so formatting churn
// inside a passage doesn't break the chain.

import type { Edit, ChangeEntry } from '../types';
import { editRenderedNeedle } from './editRenderedText';

const CTX_WORDS = 4; // words of unchanged context kept around the changed region

/** Word-index span of the passage that differs between two rendered strings. */
function changeWordSpan(before: string, after: string): { lo: number; hi: number } {
  const a = before.split(' ');
  const b = after.split(' ');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return { lo: i, hi: Math.max(a.length - j, b.length - j) };
}

function wordSpansOverlap(a: { lo: number; hi: number }, b: { lo: number; hi: number }): boolean {
  if (a.lo < b.hi && b.lo < a.hi) return true;
  // Refinements one word apart (e.g. "busy" then "busy enough") should still chain.
  const gap = a.hi <= b.lo ? b.lo - a.hi : a.lo - b.hi;
  return gap <= CTX_WORDS;
}

// Narrow a before→after pair to the region that actually differs: trim the common
// leading/trailing words (a desktop edit commits a whole chapter block, but only a
// phrase moved), keeping a few words of context on each side for legibility.
function narrowChange(prev: string, cur: string): Pick<ChangeEntry, 'previous' | 'current' | 'startEllipsis' | 'endEllipsis'> {
  const a = prev.split(' ');
  const b = cur.split(' ');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const start = Math.max(0, i - CTX_WORDS);
  const endA = Math.min(a.length, a.length - j + CTX_WORDS);
  const endB = Math.min(b.length, b.length - j + CTX_WORDS);
  return {
    previous: a.slice(start, endA).join(' '),
    current: b.slice(start, endB).join(' '),
    startEllipsis: start > 0,
    endEllipsis: endA < a.length || endB < b.length,
  };
}

interface Chain {
  firstOriginal: string;   // raw source of the chain's first original
  lastReplacement: string; // raw source of the chain's last replacement
  currentNeedle: string;   // rendered text the chain currently produces (for linking)
  id: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  editCount: number;
  firstAt: number;
  lastAt: number;
}

/** Cheap predicate for "is the Changes tab worth showing?" — early-exits on the
 *  first edit whose RENDERED prose actually changed, without coalescing/narrowing
 *  the whole log. Keeps the per-navigation hot path light (buildChangeList is only
 *  paid when the author actually opens Changes mode). */
export function hasMeaningfulEdits(edits: Edit[]): boolean {
  for (const e of edits) {
    if (e.originalText === e.replacementText) continue; // identical source → skip the regex work
    if (editRenderedNeedle(e.originalText) !== editRenderedNeedle(e.replacementText)) return true;
  }
  return false;
}

export function buildChangeList(edits: Edit[]): ChangeEntry[] {
  const ordered = [...edits].sort((a, b) => a.createdAt - b.createdAt);
  // Open chains per chapter, keyed by the rendered text they currently produce —
  // so the next edit that starts from that text continues the chain.
  const openByChapter = new Map<string, Map<string, Chain>>();
  const chains: Chain[] = [];

  for (const e of ordered) {
    const origNeedle = editRenderedNeedle(e.originalText);
    const replNeedle = editRenderedNeedle(e.replacementText);
    const chapterKey = e.chapterId || `idx-${e.chapterIndex}`;
    let open = openByChapter.get(chapterKey);
    if (!open) { open = new Map(); openByChapter.set(chapterKey, open); }

    let prior = origNeedle ? open.get(origNeedle) : undefined;
    if (prior) {
      // Whole-chapter commits share identical before snapshots; only chain when the
      // cumulative change so far and this edit touch the same passage.
      const priorSpan = changeWordSpan(editRenderedNeedle(prior.firstOriginal), origNeedle);
      const nextSpan = changeWordSpan(origNeedle, replNeedle);
      if (!wordSpansOverlap(priorSpan, nextSpan)) {
        open.delete(origNeedle);
        prior = undefined;
      }
    }
    if (prior) {
      // Continue the chain: this edit started from what the prior edit produced.
      open.delete(prior.currentNeedle);
      prior.lastReplacement = e.replacementText;
      prior.currentNeedle = replNeedle;
      prior.id = e.id;
      prior.editCount += 1;
      prior.lastAt = e.createdAt;
      prior.chapterIndex = e.chapterIndex;
      prior.chapterTitle = e.chapterTitle;
      if (replNeedle) open.set(replNeedle, prior);
    } else {
      const chain: Chain = {
        firstOriginal: e.originalText,
        lastReplacement: e.replacementText,
        currentNeedle: replNeedle,
        id: e.id,
        chapterId: e.chapterId,
        chapterIndex: e.chapterIndex,
        chapterTitle: e.chapterTitle,
        editCount: 1,
        firstAt: e.createdAt,
        lastAt: e.createdAt,
      };
      chains.push(chain);
      if (replNeedle) open.set(replNeedle, chain);
    }
  }

  return chains
    .flatMap<ChangeEntry>(c => {
      const previousFull = editRenderedNeedle(c.firstOriginal);
      const currentFull = editRenderedNeedle(c.lastReplacement);
      // Drop net no-ops (formatting / whitespace / escape cleanup) — rendered prose
      // unchanged. Keep revisions, additions, AND deletions.
      if (previousFull === currentFull) return [];
      const kind: ChangeEntry['kind'] = previousFull === '' ? 'added' : currentFull === '' ? 'deleted' : 'revised';
      // Narrow revisions to the changed region; additions/deletions show in full.
      const span = kind === 'revised'
        ? narrowChange(previousFull, currentFull)
        : { previous: previousFull, current: currentFull, startEllipsis: false, endEllipsis: false };
      return [{
        id: c.id, kind,
        chapterId: c.chapterId, chapterIndex: c.chapterIndex, chapterTitle: c.chapterTitle,
        ...span,
        editCount: c.editCount, firstAt: c.firstAt, lastAt: c.lastAt,
      }];
    })
    .sort((a, b) => a.chapterIndex - b.chapterIndex || a.firstAt - b.firstAt);
}
