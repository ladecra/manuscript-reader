// ─── Storage: provider interface ──────────────────────────────────────────────
// Storage is an implementation detail. Every persistence backend (localStorage,
// IndexedDB, future SQLite/desktop, future cloud sync) implements this one async
// interface, so callers never change when the backend does.
//
// Records are addressed by a forward-compatible "kind:id" key scheme so new
// entity types (edits, reader sessions, snapshots — Phases 4/5/8) can be added
// without a schema migration:
//
//   manuscript:{id}    annotations:{id}    position:{id}
//   edits:{id}         session:{id}:{readerId}    snapshot:{id}:{snapId}   (future)

import type { Annotation } from '../types';

/** The flat record persisted per manuscript (matches the v0.9 localStorage schema
 *  for backward compatibility). `combinedMarkdown` is the source of truth. */
export interface StoredManuscript {
  id: string;
  title: string;
  author?: string;
  wordCount: number;
  chapterCount: number;
  lastOpened: number;
  status: string;
  combinedMarkdown?: string;
  uncached?: boolean;
  progress?: number; // mirror of the position record; persisted via savePosition
}

export interface StorageProvider {
  /** Human-readable backend name, for diagnostics. */
  readonly name: string;

  listManuscripts(): Promise<StoredManuscript[]>;
  saveManuscript(ms: StoredManuscript): Promise<void>;
  /** Removes the manuscript and everything attached to it (annotations, position). */
  deleteManuscript(id: string): Promise<void>;

  loadAnnotations(id: string): Promise<Annotation[]>;
  saveAnnotations(id: string, annotations: Annotation[]): Promise<void>;

  loadPosition(id: string): Promise<number>;
  savePosition(id: string, frac: number): Promise<void>;
}

// ─── Key scheme (used by the IndexedDB provider's single key-value store) ──────
export const MANUSCRIPT_PREFIX = 'manuscript:';
export const key = {
  manuscript: (id: string) => `${MANUSCRIPT_PREFIX}${id}`,
  annotations: (id: string) => `annotations:${id}`,
  position: (id: string) => `position:${id}`,
};
