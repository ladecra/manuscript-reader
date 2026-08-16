import { create } from 'zustand';
import type { Manuscript, ManuscriptStatus, PublishingMetadata, ShareHandle } from '../engine/types';
import { MANUSCRIPT_STATUSES } from '../engine/types';
import { loadLibrary, saveLibrary, uniqueManuscriptId, savePosition, loadPosition, clearManuscriptTombstone, loadAnnotations, saveAnnotations, saveSessions, type StoredManuscript } from '../engine/storage';
import { parseMarkdown, countWords } from '../engine/ingestion/parseMarkdown';
import { buildManuscriptStructure } from '../engine/ingestion/manuscriptStructure';
import { extractFrontMatterCandidates, applyFrontMatterCandidates } from '../engine/ingestion/frontMatterExtract';
import { demoManuscripts, demoFeedbackFor } from './demoSeed';

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
      importedAt: s.importedAt,
      shared: s.shared,
      readerCount: s.readerCount,
      newResponses: s.newResponses,
      readers: s.readers,
      responses: s.responses,
      share: s.share,
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
  seedDemoLibrary: () => void;
  importManuscript: (md: string) => Manuscript;
  updateManuscript: (id: string, patch: { title?: string; author?: string; status?: ManuscriptStatus; chapterCount?: number; publishing?: PublishingMetadata }) => void;
  /** Persist (or clear, with null) the author's hosted-share handle. Keeps the
   *  derived `shared` flag in step so the Library/Hub status reads correctly. */
  saveShare: (id: string, share: ShareHandle | null) => void;
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

    // DEV-only: insert the demo manuscripts if they aren't already present. Guarded
    // by the caller (App, on `?demo` in DEV) so it never runs in production or
    // without the flag. Idempotent — demo IDs are prefixed and skipped if seeded.
    seedDemoLibrary() {
      const stored = loadLibrary();
      const have = new Set(stored.map(m => m.id));
      const missing = demoManuscripts().filter(m => !have.has(m.id));
      if (missing.length === 0) return;
      const next = [...missing, ...stored];
      missing.forEach(m => clearManuscriptTombstone(m.id));
      saveLibrary(next);
      // Seed the flagship demo's real feedback (annotations + sessions) so the
      // report actually computes — passage convergences need overlapping marks,
      // not the aggregate roster numbers. Only fill when empty (idempotent).
      missing.forEach(m => {
        const fb = demoFeedbackFor(m.id);
        if (fb && loadAnnotations(m.id).length === 0) {
          saveAnnotations(m.id, fb.annotations);
          saveSessions(m.id, fb.sessions);
        }
      });
      set({ library: next.map(toManuscript) });
    },

    // Every import is its own manuscript. The ID is unique across the library, so
    // a Load can never overwrite an existing book — even when titles slugify the
    // same (e.g. two untitled manuscripts). Re-importing to *update* an existing
    // book is intentionally not a Load side effect; it belongs to the desktop
    // workspace's version management.
    importManuscript(md) {
      const stored = loadLibrary();
      const titleComment = md.match(/<!--\s*title:\s*(.+?)\s*-->/i);
      const h1Match = md.match(/^# (.+)$/m);
      const title = titleComment ? titleComment[1].trim() : h1Match ? h1Match[1].trim() : 'Untitled';
      const structure = buildManuscriptStructure(md);
      const candidates = extractFrontMatterCandidates(structure);
      const merged = applyFrontMatterCandidates(
        { author: candidates.author, publishing: {} },
        candidates,
      );
      const id = uniqueManuscriptId(title, stored.map(m => m.id));
      const { chapters } = parseMarkdown(md);
      const wordCount = countWords(md);
      const flat: StoredManuscript = {
        id, title, wordCount, chapterCount: chapters.length, lastOpened: Date.now(),
        status: 'Draft',
        combinedMarkdown: md,
        revision: 1,
        author: merged.author,
        publishing: Object.keys(merged.publishing).length ? merged.publishing : undefined,
      };
      stored.unshift(flat);
      clearManuscriptTombstone(id);
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

    saveShare(id, share) {
      const stored = loadLibrary();
      const idx = stored.findIndex(m => m.id === id);
      if (idx < 0) return;
      stored[idx].share = share ?? undefined;
      // `shared` drives the Library/Hub status label; a revoked link is no longer shared.
      stored[idx].shared = !!share && share.state !== 'revoked';
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
