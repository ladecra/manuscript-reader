import { create } from 'zustand';
import type { Manuscript, ManuscriptStatus, PublishingMetadata } from '../engine/types';
import { MANUSCRIPT_STATUSES } from '../engine/types';
import { loadLibrary, saveLibrary, manuscriptId, savePosition, loadPosition, type StoredManuscript } from '../engine/storage';
import { parseMarkdown, countWords } from '../engine/ingestion/parseMarkdown';

function toManuscript(s: StoredManuscript): Manuscript {
  return {
    id: s.id,
    metadata: {
      title: s.title,
      author: s.author,
      wordCount: s.wordCount,
      chapterCount: s.chapterCount,
      lastOpened: s.lastOpened,
      status: (s.status as ManuscriptStatus) ?? 'Draft',
      combinedMarkdown: s.combinedMarkdown,
      uncached: s.uncached,
      progress: s.progress,
      publishing: s.publishing,
      favorite: s.favorite,
    },
    chapters: [],
    annotations: [],
    edits: [],
    reports: [],
    exports: [],
  };
}

interface LibraryStore {
  library: Manuscript[];
  refresh: () => void;
  upsertManuscript: (md: string) => Manuscript;
  updateManuscript: (id: string, patch: { title?: string; author?: string; status?: ManuscriptStatus; chapterCount?: number; publishing?: PublishingMetadata }) => void;
  cycleStatus: (id: string) => void;
  toggleFavorite: (id: string) => void;
  deleteManuscript: (id: string) => void;
  touchManuscript: (id: string) => void;
  updateProgress: (id: string, frac: number) => void;
  appendChapters: (id: string, newMarkdown: string) => Manuscript | null;
  replaceMarkdown: (id: string, newMarkdown: string) => Manuscript | null;
  getReadingPosition: (id: string) => number;
}

export const useLibraryStore = create<LibraryStore>((_set, _get) => {
  const set = _set;
  return {
    library: loadLibrary().map(toManuscript),

    refresh() { set({ library: loadLibrary().map(toManuscript) }); },

    upsertManuscript(md) {
      const stored = loadLibrary();
      const titleComment = md.match(/<!--\s*title:\s*(.+?)\s*-->/i);
      const h1Match = md.match(/^# (.+)$/m);
      const title = titleComment ? titleComment[1].trim() : h1Match ? h1Match[1].trim() : 'Untitled';
      const id = manuscriptId(title);
      const { chapters } = parseMarkdown(md);
      const wordCount = countWords(md);
      const existing = stored.findIndex(m => m.id === id);
      const prev = existing >= 0 ? stored[existing] : null;
      const contentChanged = prev ? prev.combinedMarkdown !== md : true;
      const flat: StoredManuscript = {
        id, title, wordCount, chapterCount: chapters.length, lastOpened: Date.now(),
        status: prev ? prev.status : 'Draft',
        author: prev ? prev.author : undefined,
        combinedMarkdown: md,
        revision: contentChanged ? (prev?.revision ?? 0) + 1 : (prev?.revision ?? 1),
      };
      if (existing >= 0) stored[existing] = flat; else stored.unshift(flat);
      saveLibrary(stored);
      const converted = stored.map(toManuscript);
      set({ library: converted });
      return converted.find(m => m.id === id)!;
    },

    updateManuscript(id, patch) {
      const stored = loadLibrary();
      const idx = stored.findIndex(m => m.id === id);
      if (idx < 0) return;
      if (patch.title) stored[idx].title = patch.title;
      if (patch.author !== undefined) stored[idx].author = patch.author;
      if (patch.status) stored[idx].status = patch.status;
      if (patch.chapterCount !== undefined) stored[idx].chapterCount = patch.chapterCount;
      if (patch.publishing !== undefined) stored[idx].publishing = patch.publishing;
      saveLibrary(stored);
      set({ library: stored.map(toManuscript) });
    },

    cycleStatus(id) {
      const stored = loadLibrary();
      const idx = stored.findIndex(m => m.id === id);
      if (idx < 0) return;
      const curr = MANUSCRIPT_STATUSES.indexOf((stored[idx].status as ManuscriptStatus) ?? 'Draft');
      stored[idx].status = MANUSCRIPT_STATUSES[(curr + 1) % MANUSCRIPT_STATUSES.length];
      saveLibrary(stored);
      set({ library: stored.map(toManuscript) });
    },

    toggleFavorite(id) {
      const stored = loadLibrary();
      const idx = stored.findIndex(m => m.id === id);
      if (idx < 0) return;
      stored[idx].favorite = !stored[idx].favorite;
      saveLibrary(stored);
      set({ library: stored.map(toManuscript) });
    },

    deleteManuscript(id) {
      const stored = loadLibrary().filter(m => m.id !== id);
      saveLibrary(stored);
      set({ library: stored.map(toManuscript) });
    },

    touchManuscript(id) {
      const stored = loadLibrary();
      const idx = stored.findIndex(m => m.id === id);
      if (idx >= 0) {
        stored[idx].lastOpened = Date.now();
        saveLibrary(stored);
        set({ library: stored.map(toManuscript) });
      }
    },

    updateProgress(id, frac) {
      savePosition(id, frac);
      const stored = loadLibrary();
      const idx = stored.findIndex(m => m.id === id);
      if (idx >= 0) {
        stored[idx].progress = frac;
        saveLibrary(stored);
        set({ library: stored.map(toManuscript) });
      }
    },

    appendChapters(id, newMarkdown) {
      const stored = loadLibrary();
      const idx = stored.findIndex(m => m.id === id);
      if (idx < 0 || !stored[idx].combinedMarkdown) return null;
      const combined = stored[idx].combinedMarkdown!.trimEnd() + '\n\n' + newMarkdown.trim();
      const { chapters } = parseMarkdown(combined);
      stored[idx] = { ...stored[idx], combinedMarkdown: combined, chapterCount: chapters.length, wordCount: countWords(combined), lastOpened: Date.now() };
      saveLibrary(stored);
      const converted = stored.map(toManuscript);
      set({ library: converted });
      return converted.find(m => m.id === id) ?? null;
    },

    replaceMarkdown(id, newMarkdown) {
      const stored = loadLibrary();
      const idx = stored.findIndex(m => m.id === id);
      if (idx < 0) return null;
      const combined = newMarkdown.trim();
      const { chapters } = parseMarkdown(combined);
      const revision = (stored[idx].revision ?? 0) + 1;
      stored[idx] = { ...stored[idx], combinedMarkdown: combined, chapterCount: chapters.length, wordCount: countWords(combined), lastOpened: Date.now(), revision };
      saveLibrary(stored);
      const converted = stored.map(toManuscript);
      set({ library: converted });
      return converted.find(m => m.id === id) ?? null;
    },

    getReadingPosition: (id) => loadPosition(id),
  };
});
