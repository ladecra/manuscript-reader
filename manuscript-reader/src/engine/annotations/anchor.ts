// ─── Annotation Anchoring Engine (Phase 4) ────────────────────────────────────
// Pure, browser-independent re-location of an annotated span within a body of
// text. Operates on plain strings (a chapter's rendered textContent), so every
// decision here is unit-testable without a DOM — the engine-purity test.
//
// The problem it solves: annotations used to re-attach by a bare
// `indexOf(quote)`, which silently attaches to the wrong passage when the same
// sentence appears twice, and vanishes the moment the author edits the quoted
// text. A TextAnchor carries the quote plus a window of surrounding context, so
// re-location can disambiguate duplicates and degrade gracefully across edits
// and chapter reordering.

import type { TextAnchor } from '../types';

/** Chars of surrounding context captured on each side of the quote. */
export const ANCHOR_CONTEXT = 40;

/** Confidence in a resolved location, surfaced so callers can flag weak matches. */
export type AnchorConfidence = 'exact' | 'context' | 'fuzzy';

export interface LocateResult {
  start: number;
  end: number;
  confidence: AnchorConfidence;
}

/**
 * Build a durable anchor for `quote` found at `start` within `fullText`
 * (the chapter's rendered text at creation time).
 */
export function buildAnchor(fullText: string, start: number, quote: string): TextAnchor {
  const end = start + quote.length;
  return {
    quote,
    prefix: fullText.slice(Math.max(0, start - ANCHOR_CONTEXT), start),
    suffix: fullText.slice(end, end + ANCHOR_CONTEXT),
    offset: start,
  };
}

function commonSuffixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** All indices at which `needle` occurs in `haystack`. */
function allIndicesOf(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    out.push(idx);
    idx = haystack.indexOf(needle, idx + 1);
  }
  return out;
}

/**
 * Score a candidate quote occurrence by how well its neighbours match the
 * anchor's recorded context, with a small bonus for landing near the original
 * offset (a tiebreak for otherwise-identical surroundings).
 */
function contextScore(fullText: string, hit: number, anchor: TextAnchor): number {
  const before = fullText.slice(Math.max(0, hit - anchor.prefix.length), hit);
  const after = fullText.slice(hit + anchor.quote.length, hit + anchor.quote.length + anchor.suffix.length);
  const pre = commonSuffixLen(before, anchor.prefix);
  const suf = commonPrefixLen(after, anchor.suffix);
  const proximity = -Math.min(ANCHOR_CONTEXT, Math.abs(hit - anchor.offset)) / ANCHOR_CONTEXT;
  return pre + suf + proximity;
}

/**
 * When the quote itself can't be found verbatim (it was edited), try to bracket
 * the original region using the stable context on either side, returning a
 * 'fuzzy' span so a mark lands in roughly the right place rather than vanishing.
 * Returns null when there isn't enough unique context to anchor safely.
 */
function locateByContext(fullText: string, anchor: TextAnchor): LocateResult | null {
  const { prefix, suffix, quote } = anchor;
  // Need a reasonably distinctive anchor on at least one side.
  const usablePrefix = prefix.trim().length >= 6 ? prefix : '';
  const usableSuffix = suffix.trim().length >= 6 ? suffix : '';
  if (!usablePrefix && !usableSuffix) return null;

  const maxGap = quote.length * 3 + 60;

  if (usablePrefix) {
    let p = fullText.indexOf(usablePrefix);
    while (p !== -1) {
      const spanStart = p + usablePrefix.length;
      if (usableSuffix) {
        const s = fullText.indexOf(usableSuffix, spanStart);
        if (s !== -1 && s - spanStart <= maxGap) {
          return { start: spanStart, end: s, confidence: 'fuzzy' };
        }
      } else {
        return { start: spanStart, end: spanStart, confidence: 'fuzzy' };
      }
      p = fullText.indexOf(usablePrefix, p + 1);
    }
  }

  if (usableSuffix) {
    const s = fullText.indexOf(usableSuffix);
    if (s !== -1) return { start: s, end: s, confidence: 'fuzzy' };
  }

  return null;
}

/**
 * Re-locate an anchored span within `fullText`. Returns the resolved range, or
 * null if it can't be placed (the caller treats null as an orphaned annotation).
 *
 * Resolution order:
 *  1. exact   — the quote occurs once → use it.
 *  2. context — the quote occurs several times → pick the occurrence whose
 *               surroundings best match the recorded context.
 *  3. fuzzy   — the quote is gone (edited) → bracket the region by context.
 */
export function locateAnchor(fullText: string, anchor: TextAnchor): LocateResult | null {
  const quote = anchor.quote;
  if (!quote) return null;

  const hits = allIndicesOf(fullText, quote);
  if (hits.length === 1) {
    return { start: hits[0], end: hits[0] + quote.length, confidence: 'exact' };
  }
  if (hits.length > 1) {
    let best = hits[0];
    let bestScore = -Infinity;
    for (const h of hits) {
      const score = contextScore(fullText, h, anchor);
      if (score > bestScore) { bestScore = score; best = h; }
    }
    return { start: best, end: best + quote.length, confidence: 'context' };
  }

  return locateByContext(fullText, anchor);
}

/**
 * Convenience for legacy annotations that have no stored anchor: synthesize a
 * minimal anchor from just the quote so they flow through the same resolver
 * (behaves like the old first-match search, but duplicate-aware once context
 * is later captured).
 */
export function anchorFromQuote(quote: string): TextAnchor {
  return { quote, prefix: '', suffix: '', offset: 0 };
}
