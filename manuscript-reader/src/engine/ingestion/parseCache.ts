// ─── Ingestion Engine: parsed-manuscript cache ───────────────────────────────
// Navigation re-parses the same manuscript repeatedly: opening the hub, entering
// the reader, resolving annotation chapters, building the structural model, and
// every reader mode-switch can each call parseMarkdown on the identical source.
// parseMarkdown is a pure function of its input string, so the result is reusable
// whenever the input is unchanged.
//
// Keyed on CONTENT IDENTITY — the markdown string itself — NOT on a manuscript
// id+revision. That distinction is deliberate: a bare id+revision key would serve
// a stale parse for any caller that parses a *transient* string at the same
// revision (mid-edit source before the revision bump, a structural-edit probe),
// and would silently desync if a revision bump were ever missed. With the content
// as the key, a hit is correct by construction: same bytes in, same parse out.
//
// Why this is also fast: V8 lazily caches a string's hash in the string header on
// first use, so Map lookups on the SAME string instance are O(1). combinedMarkdown
// is a stable instance across a navigation sequence, so repeated lookups are cheap;
// a distinct instance with equal content pays one hash, then hits.
//
// Pure/testable: a module-level Map is browser-independent. The cache is a
// transparent memo — it never changes parseMarkdown's output, only avoids redoing
// it — so golden-file harnesses (check-fixtures / check-sessions) are unaffected.

import type { ParsedManuscript } from '../types';
import { parseMarkdown } from './parseMarkdown';

// Small LRU. One book is open at a time; a handful of entries covers the open
// manuscript plus a couple of recently-touched ones. Transient edit/probe strings
// land here too and are evicted as newer parses push them out — bounded memory,
// and a miss only ever costs a recompute (never a wrong answer).
const MAX_ENTRIES = 8;
const cache = new Map<string, ParsedManuscript>();

/**
 * parseMarkdown, memoized on the exact markdown string. Use on hot read paths that
 * parse a manuscript's stable source repeatedly (hub open, reader mount + mode
 * switches, annotation-chapter resolution, structural model). Cold one-off parses
 * of ever-changing strings (live keystroke probes, export serialization) should
 * keep calling parseMarkdown directly so they don't churn this cache.
 */
export function getParsedManuscript(md: string): ParsedManuscript {
  const hit = cache.get(md);
  if (hit) {
    // LRU bump: re-insert so it counts as most-recently-used.
    cache.delete(md);
    cache.set(md, hit);
    return hit;
  }
  const parsed = parseMarkdown(md);
  cache.set(md, parsed);
  if (cache.size > MAX_ENTRIES) {
    // Map iteration is insertion-order: the first key is the least-recently-used.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return parsed;
}

/** Drop all cached parses. Exposed for tests/harnesses that want a clean slate. */
export function clearParseCache(): void {
  cache.clear();
}
