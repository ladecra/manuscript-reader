// ─── Chapter-level rollups for Changes mode ─────────────────────────────────

import type { ChangeEntry, Chapter } from '../types';
import {
  changeChapterGroupKey,
  changeChapterDisplayTitle,
  resolveChangeChapter,
} from './resolveChangeChapter';

export interface ChapterChangeRollup {
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  entries: ChangeEntry[];
  revisionCount: number;
  expandedPassages: number;
  rewrittenPassages: number;
  netWordDelta: number;
}

export function formatChapterRollupLine(r: ChapterChangeRollup): string {
  const parts: string[] = [];
  if (r.revisionCount > 0) parts.push(`${r.revisionCount} revision${r.revisionCount === 1 ? '' : 's'}`);
  if (r.rewrittenPassages > 0) {
    parts.push(`${r.rewrittenPassages} passage${r.rewrittenPassages === 1 ? '' : 's'} substantially rewritten`);
  }
  if (r.expandedPassages > 0) {
    const w = r.netWordDelta > 0 ? ` (+${r.netWordDelta} words)` : '';
    parts.push(`${r.expandedPassages} passage${r.expandedPassages === 1 ? '' : 's'} expanded${w}`);
  } else if (r.netWordDelta !== 0) {
    const sign = r.netWordDelta > 0 ? '+' : '';
    parts.push(`${sign}${r.netWordDelta} words net`);
  }
  if (parts.length === 0) return `${r.entries.length} passage${r.entries.length === 1 ? '' : 's'}`;
  return parts.join(' · ');
}

export function rollupChangesByChapter(
  entries: ChangeEntry[],
  chapters: Chapter[],
  titleByIndex: Map<number, string>,
): ChapterChangeRollup[] {
  const byKey = new Map<string, ChangeEntry[]>();
  for (const e of entries) {
    const k = changeChapterGroupKey(e, chapters);
    const list = byKey.get(k);
    if (list) list.push(e);
    else byKey.set(k, [e]);
  }

  const rollups: ChapterChangeRollup[] = [];
  for (const [, group] of byKey) {
    const first = group[0];
    const resolved = resolveChangeChapter(first, chapters);
    const title = changeChapterDisplayTitle(first, chapters, titleByIndex);
    let revisionCount = 0;
    let netWordDelta = 0;
    let expandedPassages = 0;
    let rewrittenPassages = 0;
    for (const e of group) {
      revisionCount += e.editCount;
      netWordDelta += e.netWordDelta;
      if (e.netWordDelta >= 40) expandedPassages += 1;
      if (e.kind === 'revised' && (e.editCount >= 2 || (e.previous.length > 60 && e.current.length > 60))) {
        rewrittenPassages += 1;
      }
    }
    rollups.push({
      chapterId: resolved.chapterId,
      chapterIndex: resolved.chapterIndex,
      chapterTitle: title,
      entries: group,
      revisionCount,
      expandedPassages,
      rewrittenPassages,
      netWordDelta,
    });
  }

  return rollups.sort((a, b) => a.chapterIndex - b.chapterIndex || a.chapterTitle.localeCompare(b.chapterTitle));
}
