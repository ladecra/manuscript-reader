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

import type { Annotation, Edit, ReaderSession, PublishingMetadata, RevisionGraph, Snapshot, SnapshotMeta } from '../types';

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
  /** Monotonically incrementing counter bumped on every author edit (replaceMarkdown).
   *  Absent on legacy records — treat as 0. The seed for cross-device sync: two
   *  devices can tell which copy is newer without a server clock. */
  revision?: number;
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

  /** Cover image stored as a data URL. Returns null if none is set. */
  loadCover(id: string): Promise<string | null>;
  saveCover(id: string, dataUrl: string | null): Promise<void>;

  /** The manuscript's private "Working Notes" scratchpad (free text). Local-first;
   *  not synced yet (a clean follow-up). Returns '' when none is set. */
  loadNote(id: string): Promise<string>;
  saveNote(id: string, text: string): Promise<void>;

  /** The manuscript's revision-concern graph (concerns + membership links +
   *  answered suggestions). One blob per manuscript, same as annotations/edits.
   *  Local-first for now — cloud sync needs its own updatedAt reconcile (the
   *  manuscript `revision` counter only bumps on TEXT changes, and concern work
   *  never touches text), a deliberate follow-up. Returns null when unset. */
  loadRevisionGraph(id: string): Promise<RevisionGraph | null>;
  saveRevisionGraph(id: string, graph: RevisionGraph): Promise<void>;

  // ── Version snapshots (Phase 8) ──
  // Split read on purpose: list the light index without paying for the (large,
  // content-addressed) frozen bodies; load a single full snapshot on demand.
  /** Light index for a manuscript's snapshots — no frozen markdown bodies. */
  listSnapshots(id: string): Promise<SnapshotMeta[]>;
  /** One full snapshot (meta + frozen inputs), or null if absent. */
  loadSnapshot(id: string, snapshotId: string): Promise<Snapshot | null>;
  /** Persist a snapshot. Bodies are content-addressed by `versionId`, so an
   *  identical body is stored once (idempotent re-save of unchanged prose). */
  saveSnapshot(snap: Snapshot): Promise<void>;
  /** Persist only the snapshot RECORD (meta + frozen children), never the body —
   *  the cold-sync lazy-pull path: a pulled index entry has no body until first
   *  open, when loadSnapshot streams + backfills it. */
  saveSnapshotMeta(rec: SnapshotRecord): Promise<void>;
  /** Remove a snapshot; its body is reclaimed only when no sibling still references it. */
  deleteSnapshot(id: string, snapshotId: string): Promise<void>;

  /** Manuscript ids the user deleted — prevents cloud sync from resurrecting them.
   *  Map value is `deletedAt` (Unix ms). Re-importing the same title clears the entry. */
  loadTombstones(): Promise<Record<string, number>>;
  saveTombstones(tombstones: Record<string, number>): Promise<void>;
}

// ─── Key scheme (used by the IndexedDB provider's single key-value store) ──────
// Snapshots use two key families: a per-snapshot record (meta + frozen annotations
// + sessions, NO markdown) and a content-addressed body (markdown keyed by versionId,
// scoped per-manuscript so dedup is intra-manuscript and deletion needs no global
// refcount). The `*Prefix` helpers bound range scans.
export const MANUSCRIPT_PREFIX = 'manuscript:';
export const key = {
  manuscript: (id: string) => `${MANUSCRIPT_PREFIX}${id}`,
  annotations: (id: string) => `annotations:${id}`,
  edits: (id: string) => `edits:${id}`,
  sessions: (id: string) => `sessions:${id}`,
  position: (id: string) => `position:${id}`,
  cover: (id: string) => `cover:${id}`,
  note: (id: string) => `note:${id}`,
  revisionGraph: (id: string) => `revisionGraph:${id}`,
  snapshot: (msId: string, snapId: string) => `snapshot:${msId}:${snapId}`,
  snapshotPrefix: (msId: string) => `snapshot:${msId}:`,
  snapshotBody: (msId: string, versionId: string) => `snapbody:${msId}:${versionId}`,
  snapshotBodyPrefix: (msId: string) => `snapbody:${msId}:`,
  tombstones: () => 'meta:tombstones',
};

/** The per-snapshot record persisted under the `snapshot:` key — a Snapshot with
 *  its (large, separately stored) markdown body lifted out. Rejoined on load. */
export type SnapshotRecord = Omit<Snapshot, 'markdown'>;
