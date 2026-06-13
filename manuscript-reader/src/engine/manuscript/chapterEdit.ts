// ─── Chapter Editing Engine ───────────────────────────────────────────────────
// Pure functions for reordering, renaming, and deleting chapters by reslicing
// the manuscript's combined markdown. Engine-level (no React, no DOM) so the
// same logic can back a desktop or CLI client later.

import { parseMarkdown } from '../ingestion/parseMarkdown';

function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ChapterEdit {
  /** Original chapter index (1-based, as produced by parseMarkdown). */
  index: number;
  /** New title, or undefined to keep the original. */
  newTitle?: string;
  /** Marked for deletion. */
  deleted?: boolean;
}

/**
 * Apply an ordered list of chapter edits to combined markdown.
 *
 * @param combinedMarkdown  The manuscript source.
 * @param orderedEdits      Edits in the DESIRED final order. Each references an
 *                          original chapter by `index`. Deleted entries may be
 *                          included (they're filtered out) or omitted.
 * @returns The new combined markdown, or null if nothing could be applied
 *          (e.g. no chapters, or every chapter deleted).
 */
export function applyChapterEdits(combinedMarkdown: string, orderedEdits: ChapterEdit[]): string | null {
  const { chapters } = parseMarkdown(combinedMarkdown);
  if (chapters.length === 0) return null;

  const md = combinedMarkdown;

  // Build a slice of source markdown for each original chapter, spanning from
  // its heading to the next chapter's heading.
  const sliceMap = new Map<number, { index: number; title: string; md: string }>();
  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const next = chapters[ci + 1];
    const headingRe = new RegExp(`^# ${escRegex(ch.title)}`, 'm');
    const start = md.search(headingRe);
    if (start === -1) return null; // can't safely reslice; bail without mutating
    const end = next ? md.search(new RegExp(`^# ${escRegex(next.title)}`, 'm')) : md.length;
    sliceMap.set(ch.index, { index: ch.index, title: ch.title, md: md.slice(start, end).trimEnd() });
  }

  const kept = orderedEdits
    .filter(e => !e.deleted)
    .map(e => {
      const s = sliceMap.get(e.index);
      if (!s) return null;
      const newT = e.newTitle?.trim();
      if (newT && newT !== s.title) {
        return s.md.replace(/^# .+/m, `# ${newT}`);
      }
      return s.md;
    })
    .filter((x): x is string => Boolean(x));

  if (kept.length === 0) return null;
  return kept.join('\n\n');
}
