// Resolve chapter identity on ChangeEntry / Edit records when chapterId or index
// were missing at commit time (legacy log rows still carry chapterTitle).

import type { ChangeEntry, Chapter } from '../types';

const norm = (t: string) => t.trim().toLowerCase();

export function resolveChangeChapter(
  e: Pick<ChangeEntry, 'chapterId' | 'chapterIndex' | 'chapterTitle'>,
  chapters: Chapter[],
): Pick<ChangeEntry, 'chapterId' | 'chapterIndex' | 'chapterTitle'> {
  if (e.chapterId?.startsWith('ch-')) {
    const ch = chapters.find(c => c.id === e.chapterId);
    if (ch) {
      return { chapterId: ch.id, chapterIndex: ch.index, chapterTitle: ch.title || e.chapterTitle };
    }
    return { chapterId: e.chapterId, chapterIndex: e.chapterIndex, chapterTitle: e.chapterTitle };
  }
  if (e.chapterTitle) {
    const hit = chapters.find(c => norm(c.title) === norm(e.chapterTitle));
    if (hit) {
      return { chapterId: hit.id, chapterIndex: hit.index, chapterTitle: hit.title };
    }
  }
  if (e.chapterIndex > 0) {
    const hit = chapters.find(c => c.index === e.chapterIndex);
    if (hit) {
      return { chapterId: hit.id, chapterIndex: hit.index, chapterTitle: hit.title || e.chapterTitle };
    }
    return {
      chapterId: `ch-${e.chapterIndex}`,
      chapterIndex: e.chapterIndex,
      chapterTitle: e.chapterTitle || `Chapter ${e.chapterIndex}`,
    };
  }
  return { chapterId: e.chapterId, chapterIndex: e.chapterIndex, chapterTitle: e.chapterTitle };
}

export function changeChapterGroupKey(
  e: Pick<ChangeEntry, 'chapterId' | 'chapterIndex' | 'chapterTitle'>,
  chapters: Chapter[],
): string {
  const r = resolveChangeChapter(e, chapters);
  if (r.chapterId?.startsWith('ch-')) return r.chapterId;
  if (r.chapterTitle) return `title:${norm(r.chapterTitle)}`;
  if (r.chapterIndex > 0) return `idx-${r.chapterIndex}`;
  return 'front';
}

export function changeChapterDisplayTitle(
  e: Pick<ChangeEntry, 'chapterId' | 'chapterIndex' | 'chapterTitle'>,
  chapters: Chapter[],
  titleByIndex: Map<number, string>,
): string {
  const r = resolveChangeChapter(e, chapters);
  if (r.chapterIndex > 0) {
    return titleByIndex.get(r.chapterIndex) || r.chapterTitle || `Chapter ${r.chapterIndex}`;
  }
  if (r.chapterTitle) return r.chapterTitle;
  return 'Front matter';
}
