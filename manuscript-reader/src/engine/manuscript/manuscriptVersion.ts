// ─── Manuscript content version id ────────────────────────────────────────────
// A stable, deterministic id for a manuscript's source markdown. Cheap forward
// investment ahead of real version snapshots (Phase 8): stamped into each
// shared-reader export so we can later tell whether two reader sessions reacted
// to the *same* draft — "Reader A annotated Draft 2, Reader B annotated Draft 3"
// is unrecoverable signal if we don't capture it at export time. Phase 8 can map
// these ids onto real snapshots when they exist.
//
// IMPORTANT: the shared-reader runtime (engine/exports/shareableReader.ts) inlines
// the byte-for-byte identical algorithm — it can't import this module (it ships as
// a self-contained string) — so the id a beta reader stamps matches the one the
// app computes for the same text. The headless check asserts the two agree; keep
// them in lockstep if you ever touch this.
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
