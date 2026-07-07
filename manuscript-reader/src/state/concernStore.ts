import { create } from 'zustand';
import type { Annotation, ConcernSuggestion, RevisionGraph } from '../engine/types';
import {
  createConcern, deleteConcern, emptyRevisionGraph, linkAnnotations,
  normalizeRevisionGraph, ratifySuggestion, recordSuggestionHandled,
  setLinkStatus, unlinkAnnotation, updateConcern, type CreateConcernInput,
} from '../engine/concerns/revisionGraph';
import { loadRevisionGraph, saveRevisionGraph } from '../engine/storage';

// Revision-concern graph as app state. A thin reactive layer over the pure
// graph operations in engine/concerns: every action delegates to an engine
// function that returns a NEW graph, which is set here and persisted through
// the storage write chain. No decisions live in this file — suggestions,
// validation, and analytics are all engine calls made by the consuming screen.

interface ConcernStore {
  manuscriptId: string | null;
  graph: RevisionGraph;
  hydrated: boolean;
  /** Load (or reset to) the graph for a manuscript. Safe to call repeatedly. */
  hydrate: (manuscriptId: string) => Promise<void>;
  ratify: (suggestion: ConcernSuggestion, annotations: Annotation[], title?: string) => void;
  dismissSuggestion: (signature: string) => void;
  create: (input: Omit<CreateConcernInput, 'manuscriptId'>, annotations: Annotation[]) => void;
  rename: (concernId: string, title: string) => void;
  setSummary: (concernId: string, summary: string) => void;
  setStatus: (concernId: string, status: 'active' | 'resolved' | 'archived') => void;
  remove: (concernId: string) => void;
  link: (concernId: string, annotationIds: string[], annotations: Annotation[]) => void;
  unlink: (concernId: string, annotationId: string) => void;
  setMarkStatus: (concernId: string, annotationId: string, status: 'open' | 'resolved') => void;
}

export const useConcernStore = create<ConcernStore>((set, get) => {
  /** Apply an engine-produced graph: update state + persist. */
  const commit = (graph: RevisionGraph) => {
    const { manuscriptId } = get();
    set({ graph });
    if (manuscriptId) saveRevisionGraph(manuscriptId, graph);
  };

  return {
    manuscriptId: null,
    graph: emptyRevisionGraph(),
    hydrated: false,

    async hydrate(manuscriptId) {
      if (get().manuscriptId === manuscriptId && get().hydrated) return;
      set({ manuscriptId, graph: emptyRevisionGraph(), hydrated: false });
      const stored = await loadRevisionGraph(manuscriptId);
      // Guard against a stale resolve if the user switched manuscripts mid-load.
      if (get().manuscriptId !== manuscriptId) return;
      set({ graph: normalizeRevisionGraph(stored), hydrated: true });
    },

    ratify(suggestion, annotations, title) {
      const { graph, manuscriptId } = get();
      if (!manuscriptId) return;
      commit(ratifySuggestion(graph, suggestion, manuscriptId, annotations, title).graph);
    },

    dismissSuggestion(signature) {
      commit(recordSuggestionHandled(get().graph, signature));
    },

    create(input, annotations) {
      const { graph, manuscriptId } = get();
      if (!manuscriptId) return;
      commit(createConcern(graph, { ...input, manuscriptId }, annotations).graph);
    },

    rename(concernId, title) {
      commit(updateConcern(get().graph, concernId, { title }));
    },

    setSummary(concernId, summary) {
      commit(updateConcern(get().graph, concernId, { summary }));
    },

    setStatus(concernId, status) {
      commit(updateConcern(get().graph, concernId, { status }));
    },

    remove(concernId) {
      commit(deleteConcern(get().graph, concernId));
    },

    link(concernId, annotationIds, annotations) {
      commit(linkAnnotations(get().graph, concernId, annotationIds, annotations).graph);
    },

    unlink(concernId, annotationId) {
      commit(unlinkAnnotation(get().graph, concernId, annotationId));
    },

    setMarkStatus(concernId, annotationId, status) {
      commit(setLinkStatus(get().graph, concernId, annotationId, status));
    },
  };
});
