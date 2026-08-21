// ─── Chapter Editing Engine ───────────────────────────────────────────────────
// Pure functions for reordering, renaming, and deleting chapters by reslicing
// the manuscript's combined markdown. Engine-level (no React, no DOM) so the
// same logic can back a desktop or CLI client later.

import { parseMarkdown } from '../ingestion/parseMarkdown';

export interface ChapterEdit {
  /** Original chapter index (1-based, as produced by parseMarkdown). */
  index: number;
  /** New title, or undefined to keep the original. */
  newTitle?: string;
  /** Marked for deletion. */
  deleted?: boolean;
}

/** Chapter `# ` heading start offsets — same rules as parseMarkdown (ATX h1 only). */
function chapterSliceBounds(md: string): { start: number; end: number }[] {
  const normalized = md.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    if (/^<!--[\s\S]*?-->\s*$/.test(line.trim())) {
      offset += line.length + 1;
      continue;
    }
    if (/^# /.test(line)) starts.push(offset);
    offset += line.length + 1;
  }
  return starts.map((start, i) => ({
    start,
    end: starts[i + 1] ?? normalized.length,
  }));
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
  const md = combinedMarkdown.replace(/\r\n/g, '\n');
  const { chapters } = parseMarkdown(md);
  if (chapters.length === 0) return null;

  const bounds = chapterSliceBounds(md);
  if (bounds.length !== chapters.length) return null;

  const sliceMap = new Map<number, string>();
  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const { start, end } = bounds[ci];
    sliceMap.set(ch.index, md.slice(start, end).trimEnd());
  }

  const kept = orderedEdits
    .filter(e => !e.deleted)
    .map(e => {
      const s = sliceMap.get(e.index);
      if (!s) return null;
      const newT = e.newTitle?.trim();
      if (newT) {
        const currentTitle = parseMarkdown(s).chapters[0]?.title;
        if (newT !== currentTitle) {
          // If the slice has no ATX h1 (promoted-heading chapter), prepend one.
          return /^# /m.test(s) ? s.replace(/^# .+/m, `# ${newT}`) : `# ${newT}\n\n${s}`;
        }
      }
      return s;
    })
    .filter((x): x is string => Boolean(x));

  if (kept.length === 0) return null;
  return kept.join('\n\n');
}

/** True when the working edit set would change chapter order, titles, or membership. */
export function chapterEditsDirty(combinedMarkdown: string, edits: ChapterEdit[]): boolean {
  const { chapters } = parseMarkdown(combinedMarkdown);
  if (edits.length !== chapters.length) return true;
  return edits.some((e, i) =>
    !!e.deleted
    || e.index !== chapters[i].index
    || (e.newTitle?.trim() ?? '') !== chapters[i].title.trim(),
  );
}
