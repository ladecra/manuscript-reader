import { create } from 'zustand';
import type { Manuscript, Chapter, Annotation, AnnotationType } from '../engine/types';
import { loadAnnotations, saveAnnotations } from '../engine/storage';

function annId(): string {
  return 'a' + Date.now() + Math.random().toString(36).slice(2, 6);
}

interface ReaderStore {
  // Active manuscript
  manuscript: Manuscript | null;
  chapters: Chapter[];
  annotations: Annotation[];
  totalWords: number;

  // Actions
  openManuscript: (ms: Manuscript, chapters: Chapter[]) => void;
  closeManuscript: () => void;

  // Annotation actions
  addAnnotation: (params: {
    type: AnnotationType;
    quote: string;
    note: string;
    chapterTitle: string;
    chapterIndex: number;
  }) => Annotation;
  updateAnnotation: (id: string, note: string) => void;
  deleteAnnotation: (id: string) => void;
  importAnnotations: (incoming: Annotation[], defaultReader: string | null) => number;
  reloadAnnotations: () => void;
}

export const useReaderStore = create<ReaderStore>((set, get) => ({
  manuscript: null,
  chapters: [],
  annotations: [],
  totalWords: 0,

  openManuscript(ms, chapters) {
    const anns = ms.id ? loadAnnotations(ms.id) : [];
    const words = ms.metadata.combinedMarkdown
      ? ms.metadata.combinedMarkdown.trim().split(/\s+/).filter(Boolean).length
      : 0;
    set({ manuscript: ms, chapters, annotations: anns, totalWords: words });
  },

  closeManuscript() {
    set({ manuscript: null, chapters: [], annotations: [], totalWords: 0 });
  },

  addAnnotation(params) {
    const { manuscript } = get();
    const ann: Annotation = {
      id: annId(),
      ...params,
      createdAt: Date.now(),
      readerName: null,
    };
    set(state => {
      const next = [...state.annotations, ann];
      if (manuscript) saveAnnotations(manuscript.id, next);
      return { annotations: next };
    });
    return ann;
  },

  updateAnnotation(id, note) {
    const { manuscript } = get();
    set(state => {
      const next = state.annotations.map(a => a.id === id ? { ...a, note } : a);
      if (manuscript) saveAnnotations(manuscript.id, next);
      return { annotations: next };
    });
  },

  deleteAnnotation(id) {
    const { manuscript } = get();
    set(state => {
      const next = state.annotations.filter(a => a.id !== id);
      if (manuscript) saveAnnotations(manuscript.id, next);
      return { annotations: next };
    });
  },

  importAnnotations(incoming, defaultReader) {
    const { manuscript, annotations } = get();
    const existingIds = new Set(annotations.map(a => a.id));
    const toAdd = incoming
      .filter(a => a.id && a.type && !existingIds.has(a.id))
      .map(a => ({
        ...a,
        imported: true,
        readerName: a.readerName ?? defaultReader ?? 'Beta reader',
      }));
    const next = [...annotations, ...toAdd];
    if (manuscript) saveAnnotations(manuscript.id, next);
    set({ annotations: next });
    return toAdd.length;
  },

  reloadAnnotations() {
    const { manuscript } = get();
    if (!manuscript) return;
    set({ annotations: loadAnnotations(manuscript.id) });
  },
}));
