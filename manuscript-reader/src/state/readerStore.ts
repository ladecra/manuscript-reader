import { create } from 'zustand';
import type { Manuscript, Chapter, Annotation, AnnotationType, TextAnchor, Edit, ReaderSession } from '../engine/types';
import { loadAnnotations, saveAnnotations, loadEdits, saveEdits, loadSessions, saveSessions } from '../engine/storage';
import { sessionFromImportPayload, type ReaderExportPayload } from '../engine/sessions';

function annId(): string {
  return 'a' + Date.now() + Math.random().toString(36).slice(2, 6);
}

function editId(): string {
  return 'e' + Date.now() + Math.random().toString(36).slice(2, 6);
}

interface ReaderStore {
  // Active manuscript
  manuscript: Manuscript | null;
  chapters: Chapter[];
  annotations: Annotation[];
  edits: Edit[];
  sessions: ReaderSession[];
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
    anchor?: TextAnchor;
  }) => Annotation;
  updateAnnotation: (id: string, note: string) => void;
  deleteAnnotation: (id: string) => void;
  /** Import a beta reader's feedback file: lands their annotations (deduped) AND
   *  records a durable ReaderSession (who, how far, which draft). Returns the
   *  count added and the session, or null session when there's no open manuscript. */
  importSession: (payload: ReaderExportPayload) => { imported: number; session: ReaderSession | null };
  reloadAnnotations: () => void;

  // Edit actions
  recordEdit: (params: {
    chapterId: string;
    chapterIndex: number;
    chapterTitle: string;
    anchor: TextAnchor;
    originalText: string;
    replacementText: string;
  }) => Edit | null;
}

export const useReaderStore = create<ReaderStore>((set, get) => ({
  manuscript: null,
  chapters: [],
  annotations: [],
  edits: [],
  sessions: [],
  totalWords: 0,

  openManuscript(ms, chapters) {
    const anns = ms.id ? loadAnnotations(ms.id) : [];
    const edits = ms.id ? loadEdits(ms.id) : [];
    const sessions = ms.id ? loadSessions(ms.id) : [];
    const words = ms.metadata.combinedMarkdown
      ? ms.metadata.combinedMarkdown.trim().split(/\s+/).filter(Boolean).length
      : 0;
    set({ manuscript: ms, chapters, annotations: anns, edits, sessions, totalWords: words });
  },

  closeManuscript() {
    set({ manuscript: null, chapters: [], annotations: [], edits: [], sessions: [], totalWords: 0 });
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

  importSession(payload) {
    const { manuscript, annotations, sessions } = get();
    if (!manuscript) return { imported: 0, session: null };

    // One identity for this imported file: the payload's readerId if present,
    // else a freshly-minted one. Every annotation in the file AND the session
    // share it, so a nameless import is still one distinct reader — not collapsed
    // into the same 'Beta reader' bucket as every other anonymous file.
    const fileReaderId = payload.readerId ?? ('r-import-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    const existingIds = new Set(annotations.map(a => a.id));
    const toAdd = (payload.annotations ?? [])
      .filter(a => a.id && a.type && !existingIds.has(a.id))
      .map(a => ({
        ...a,
        imported: true,
        readerId: a.readerId ?? fileReaderId,
        readerName: a.readerName ?? payload.readerName ?? 'Beta reader',
      }));
    const nextAnns = [...annotations, ...toAdd];
    saveAnnotations(manuscript.id, nextAnns);

    // Record the reader's session (who/how-far/which-draft). Deterministic id →
    // re-importing an updated file from the same reader replaces their session.
    const session = sessionFromImportPayload(payload, manuscript.id, fileReaderId);
    const nextSessions = [...sessions.filter(s => s.id !== session.id), session];
    saveSessions(manuscript.id, nextSessions);

    set({ annotations: nextAnns, sessions: nextSessions });
    return { imported: toAdd.length, session };
  },

  reloadAnnotations() {
    const { manuscript } = get();
    if (!manuscript) return;
    set({ annotations: loadAnnotations(manuscript.id) });
  },

  recordEdit(params) {
    const { manuscript } = get();
    if (!manuscript) return null;
    const edit: Edit = {
      id: editId(),
      manuscriptId: manuscript.id,
      ...params,
      createdAt: Date.now(),
    };
    set(state => {
      const next = [...state.edits, edit];
      saveEdits(manuscript.id, next);
      return { edits: next };
    });
    return edit;
  },
}));
