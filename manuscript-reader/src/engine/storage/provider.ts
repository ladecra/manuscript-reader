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
//   edits:{id}         sessions:{id}             snapshot:{id}:{snapId}   (future)
//
// Like annotations/edits, reader sessions are stored as one blob per manuscript
// (`sessions:{id}`) — it fits the hydrate-once cache (Map<msId, T[]>) and the
// "single key-value store, no schema migration" design. (The earlier note here
// floated a per-reader `session:{id}:{readerId}` key; a per-manuscript list is
// simpler and consistent with how every other child entity is stored.)

import type { Annotation, Edit, ReaderSession, PublishingMetadata } from '../types';

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
  publishing?: PublishingMetadata; // author-supplied publishing data (optional; absent on legacy records)
  favorite?: boolean; // starred in the library (optional; absent on legacy records)
}

export interface StorageProvider {
  /** Human-readable backend name, for diagnostics. */
  readonly name: string;

  listManuscripts(): Promise<StoredManuscript[]>;
  saveManuscript(ms: StoredManuscript): Promise<void>;
  /** Removes the manuscript and everything attached to it (annotations, edits, position). */
  deleteManuscript(id: string): Promise<void>;

  loadAnnotations(id: string): Promise<Annotation[]>;
  saveAnnotations(id: string, annotations: Annotation[]): Promise<void>;

  loadEdits(id: string): Promise<Edit[]>;
  saveEdits(id: string, edits: Edit[]): Promise<void>;

  loadSessions(id: string): Promise<ReaderSession[]>;
  saveSessions(id: string, sessions: ReaderSession[]): Promise<void>;

  loadPosition(id: string): Promise<number>;
  savePosition(id: string, frac: number): Promise<void>;
}

// ─── Key scheme (used by the IndexedDB provider's single key-value store) ──────
export const MANUSCRIPT_PREFIX = 'manuscript:';
export const key = {
  manuscript: (id: string) => `${MANUSCRIPT_PREFIX}${id}`,
  annotations: (id: string) => `annotations:${id}`,
  edits: (id: string) => `edits:${id}`,
  sessions: (id: string) => `sessions:${id}`,
  position: (id: string) => `position:${id}`,
};
