// ─── Manuscript content version id ────────────────────────────────────────────
// A stable, deterministic id for a manuscript's source markdown. Cheap forward
// investment ahead of real version snapshots (Phase 8): stamped into each
// shared-reader export so we can later tell whether two reader sessions reacted
// to the *same* draft — "Reader A annotated Draft 2, Reader B annotated Draft 3"
// is unrecoverable signal if we don't capture it at export time. Phase 8 can map
// these ids onto real snapshots when they exist.
//
// IMPORTANT: the shared-reader runtime (engine/exports/shareableReader.ts) ships as
// a self-contained HTML string and can't import this module at runtime — so instead
// of hand-copying the algorithm (which silently drifts), it inlines THIS function's
// own source via `manuscriptVersionIdSource()` below. One source of truth: the id a
// beta reader stamps is computed by the exact same code the app runs. `npm run
// check-share-parity` proves the inlined copy still agrees. Keep this function
// self-contained (no closure refs, no imported helpers) so `.toString()` stays valid.
//
// cyrb53: a fast, dependency-free 53-bit string hash with good distribution.
// Not cryptographic — collision resistance isn't the goal; cheap content identity is.
export function manuscriptVersionId(markdown: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < markdown.length; i++) {
    const ch = markdown.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return 'v' + n.toString(36);
}

/**
 * The exact source text of `manuscriptVersionId`, as a parenthesized function
 * expression ready to inline into the self-contained shareable-reader HTML. Using
 * the function's own `.toString()` guarantees the export computes byte-identical
 * ids — there is no second copy to drift. Minification doesn't matter: the source
 * stays semantically identical, and `check-share-parity` asserts agreement.
 */
export function manuscriptVersionIdSource(): string {
  return `(${manuscriptVersionId.toString()})`;
}
