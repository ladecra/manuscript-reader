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

/** One reversible edit: the full manuscript markdown before/after, plus the Edit
 *  record it produced. Undo restores `before` and drops the record; redo restores
 *  `after` and re-adds it — so the revision log stays in lockstep with the source.
 *  Transient (in-memory only): editing history doesn't survive a reload. */
interface EditTransition {
  before: string;
  after: string;
  edit: Edit;
}

interface ReaderStore {
  // Active manuscript
  manuscript: Manuscript | null;
  chapters: Chapter[];
  annotations: Annotation[];
  edits: Edit[];
  sessions: ReaderSession[];
  totalWords: number;

  // Edit history (transient; cleared when a different manuscript opens)
  undoStack: EditTransition[];
  redoStack: EditTransition[];
  /** Scroll Y to restore on the next edit re-render, so undo/redo/commit hold
   *  the reading position instead of resuming/jumping. Set just before reopen. */
  editReturnScroll: number | null;

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
  /** Push a committed edit onto the undo history (clears the redo branch). */
  pushEditTransition: (before: string, after: string, edit: Edit) => void;
  /** Undo the most recent edit: drop its record, return the markdown to restore
   *  (caller re-stores + reopens), or null if there's nothing to undo. */
  undoEdit: () => string | null;
  /** Redo the most recently undone edit, returning the markdown to restore. */
  redoEdit: () => string | null;
  setEditReturnScroll: (y: number | null) => void;
}

export const useReaderStore = create<ReaderStore>((set, get) => ({
  manuscript: null,
  chapters: [],
  annotations: [],
  edits: [],
  sessions: [],
  totalWords: 0,
  undoStack: [],
  redoStack: [],
  editReturnScroll: null,

  openManuscript(ms, chapters) {
    const anns = ms.id ? loadAnnotations(ms.id) : [];
    const edits = ms.id ? loadEdits(ms.id) : [];
    const sessions = ms.id ? loadSessions(ms.id) : [];
    const words = ms.metadata.combinedMarkdown
      ? ms.metadata.combinedMarkdown.trim().split(/\s+/).filter(Boolean).length
      : 0;
    // A commit/undo/redo reopens the *same* manuscript to re-render — preserve its
    // edit history then. Only opening a different manuscript resets the history.
    const sameMs = get().manuscript?.id === ms.id;
    set({
      manuscript: ms, chapters, annotations: anns, edits, sessions, totalWords: words,
      ...(sameMs ? {} : { undoStack: [], redoStack: [], editReturnScroll: null }),
    });
  },

  closeManuscript() {
    set({ manuscript: null, chapters: [], annotations: [], edits: [], sessions: [], totalWords: 0, undoStack: [], redoStack: [], editReturnScroll: null });
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

  pushEditTransition(before, after, edit) {
    set(state => ({
      undoStack: [...state.undoStack, { before, after, edit }],
      redoStack: [], // a fresh edit forks the timeline — discard the redo branch
    }));
  },

  undoEdit() {
    const { manuscript, undoStack, redoStack, edits } = get();
    if (!manuscript || undoStack.length === 0) return null;
    const t = undoStack[undoStack.length - 1];
    const nextEdits = edits.filter(e => e.id !== t.edit.id);
    saveEdits(manuscript.id, nextEdits); // openManuscript reload will match this
    set({
      edits: nextEdits,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, t],
    });
    return t.before;
  },

  redoEdit() {
    const { manuscript, undoStack, redoStack, edits } = get();
    if (!manuscript || redoStack.length === 0) return null;
    const t = redoStack[redoStack.length - 1];
    const nextEdits = [...edits, t.edit];
    saveEdits(manuscript.id, nextEdits);
    set({
      edits: nextEdits,
      undoStack: [...undoStack, t],
      redoStack: redoStack.slice(0, -1),
    });
    return t.after;
  },

  setEditReturnScroll(y) { set({ editReturnScroll: y }); },
}));
