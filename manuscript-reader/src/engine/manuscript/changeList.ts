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
//
// Longer term, snapshot diffs answer "what changed meaningfully between drafts";
// this list answers "what did I change in this working session" at passage scale.

import type { Edit, ChangeEntry, TextAnchor, Chapter } from '../types';
import { editRenderedNeedle } from './editRenderedText';
import { narrowRenderedPair } from './renderedChangeRegion';
import { buildRenderedMarkAnchor, renderedWordDelta } from './editRenderedMark';
import { resolveChangeChapter } from './resolveChangeChapter';

const CTX_WORDS = 4; // words of unchanged context kept around the changed region

export interface BuildChangeListOptions {
  /** Rendered text per chapter id — used to build anchors for legacy edits. */
  chapterRenderedText?: (chapterId: string) => string | undefined;
  /** Live chapter list — resolves legacy rows missing chapterId / index. */
  chapters?: Chapter[];
}

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
  const gap = a.hi <= b.lo ? b.lo - a.hi : a.lo - b.hi;
  return gap <= CTX_WORDS;
}

interface Chain {
  firstOriginal: string;
  lastReplacement: string;
  currentNeedle: string;
  id: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  editCount: number;
  firstAt: number;
  lastAt: number;
  renderedMarkAnchor?: TextAnchor;
}

/** Cheap predicate for "is the Changes tab worth showing?" — early-exits on the
 *  first edit whose RENDERED prose actually changed, without coalescing/narrowing
 *  the whole log. Keeps the per-navigation hot path light (buildChangeList is only
 *  paid when the author actually opens Changes mode). */
export function hasMeaningfulEdits(edits: Edit[]): boolean {
  for (const e of edits) {
    if (e.originalText === e.replacementText) continue;
    if (editRenderedNeedle(e.originalText) !== editRenderedNeedle(e.replacementText)) return true;
  }
  return false;
}

export function buildChangeList(edits: Edit[], opts?: BuildChangeListOptions): ChangeEntry[] {
  const needleCache = new Map<string, string>();
  const needle = (source: string) => {
    let v = needleCache.get(source);
    if (v === undefined) {
      v = editRenderedNeedle(source);
      needleCache.set(source, v);
    }
    return v;
  };

  const ordered = [...edits].sort((a, b) => a.createdAt - b.createdAt);
  const openByChapter = new Map<string, Map<string, Chain>>();
  const chains: Chain[] = [];

  for (const e of ordered) {
    const origNeedle = needle(e.originalText);
    const replNeedle = needle(e.replacementText);
    const chapterKey = e.chapterId || `idx-${e.chapterIndex}`;
    let open = openByChapter.get(chapterKey);
    if (!open) { open = new Map(); openByChapter.set(chapterKey, open); }

    let prior = origNeedle ? open.get(origNeedle) : undefined;
    if (prior) {
      const priorSpan = changeWordSpan(needle(prior.firstOriginal), origNeedle);
      const nextSpan = changeWordSpan(origNeedle, replNeedle);
      if (!wordSpansOverlap(priorSpan, nextSpan)) {
        open.delete(origNeedle);
        prior = undefined;
      }
    }
    if (prior) {
      open.delete(prior.currentNeedle);
      prior.lastReplacement = e.replacementText;
      prior.currentNeedle = replNeedle;
      prior.id = e.id;
      prior.editCount += 1;
      prior.lastAt = e.createdAt;
      prior.chapterIndex = e.chapterIndex;
      prior.chapterTitle = e.chapterTitle;
      if (e.renderedMarkAnchor) prior.renderedMarkAnchor = e.renderedMarkAnchor;
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
        renderedMarkAnchor: e.renderedMarkAnchor,
      };
      chains.push(chain);
      if (replNeedle) open.set(replNeedle, chain);
    }
  }

  return chains
    .flatMap<ChangeEntry>(c => {
      const previousFull = needle(c.firstOriginal);
      const currentFull = needle(c.lastReplacement);
      if (previousFull === currentFull) return [];
      const kind: ChangeEntry['kind'] = previousFull === '' ? 'added' : currentFull === '' ? 'deleted' : 'revised';
      const span = kind === 'revised'
        ? narrowRenderedPair(previousFull, currentFull)
        : { previous: previousFull, current: currentFull, startEllipsis: false, endEllipsis: false };

      let { chapterId, chapterIndex, chapterTitle } = c;
      if (opts?.chapters?.length) {
        ({ chapterId, chapterIndex, chapterTitle } = resolveChangeChapter(
          { chapterId: c.chapterId, chapterIndex: c.chapterIndex, chapterTitle: c.chapterTitle },
          opts.chapters,
        ));
      }
      const resolvedChapterId = chapterId || (chapterIndex > 0 ? `ch-${chapterIndex}` : '');

      let renderedMarkAnchor = c.renderedMarkAnchor;
      if (!renderedMarkAnchor && resolvedChapterId && opts?.chapterRenderedText) {
        const chText = opts.chapterRenderedText(resolvedChapterId);
        if (chText) {
          renderedMarkAnchor = buildRenderedMarkAnchor(chText, c.firstOriginal, c.lastReplacement, resolvedChapterId)
            ?? undefined;
        }
      }

      return [{
        id: c.id, kind,
        chapterId, chapterIndex, chapterTitle,
        ...span,
        editCount: c.editCount, firstAt: c.firstAt, lastAt: c.lastAt,
        netWordDelta: renderedWordDelta(c.firstOriginal, c.lastReplacement),
        renderedMarkAnchor,
      }];
    })
    .sort((a, b) => a.chapterIndex - b.chapterIndex || a.firstAt - b.firstAt);
}
