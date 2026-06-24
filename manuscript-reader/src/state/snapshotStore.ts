import { create } from 'zustand';
import type { Manuscript, SnapshotMeta } from '../engine/types';
import { createSnapshot } from '../engine/snapshots';
import {
  listSnapshots, loadSnapshot, saveSnapshot, deleteSnapshot,
  loadAnnotations, loadSessions,
} from '../engine/storage';

// Version snapshots (Phase 8) as app state. The store is a thin reactive layer
// over the synchronous snapshot index in engine/storage: `versions[msId]` mirrors
// listSnapshots(msId) and is refreshed after any capture/relabel/delete. Frozen
// bodies are never held here — loadSnapshot fetches them on demand.

interface SnapshotStore {
  versions: Record<string, SnapshotMeta[]>;
  /** Re-read a manuscript's snapshot index into the store. */
  refresh: (msId: string) => void;
  /** Capture the import baseline — idempotent: a no-op if any snapshot exists. */
  captureBaseline: (m: Manuscript) => void;
  /** Explicit "Save as version" from the hub. Returns the new meta, or null if
   *  the manuscript has no source text to freeze. */
  saveVersion: (m: Manuscript, label?: string) => SnapshotMeta | null;
  /** Rename a version (metadata only; frozen content is untouched). */
  relabel: (msId: string, snapId: string, label: string) => Promise<void>;
  /** Delete a version. */
  remove: (msId: string, snapId: string) => void;
}

/** Build a Snapshot from a manuscript's current persisted state. Null when the
 *  source text has been evicted (nothing to freeze). */
function buildSnapshot(
  m: Manuscript,
  trigger: 'import' | 'manual',
  label?: string,
  parentId?: string,
) {
  const markdown = m.metadata.combinedMarkdown;
  if (!markdown) return null;
  return createSnapshot({
    manuscriptId: m.id,
    markdown,
    annotations: loadAnnotations(m.id),
    sessions: loadSessions(m.id),
    wordCount: m.metadata.wordCount,
    chapterCount: m.metadata.chapterCount,
    trigger,
    label,
    parentId,
  });
}

export const useSnapshotStore = create<SnapshotStore>((set, get) => ({
  versions: {},

  refresh(msId) {
    set(s => ({ versions: { ...s.versions, [msId]: listSnapshots(msId) } }));
  },

  captureBaseline(m) {
    if (listSnapshots(m.id).length > 0) return; // already has a version history
    const snap = buildSnapshot(m, 'import', 'Original import');
    if (!snap) return;
    saveSnapshot(snap);
    get().refresh(m.id);
  },

  saveVersion(m, label) {
    const existing = listSnapshots(m.id);
    const parentId = existing.length ? existing[existing.length - 1].id : undefined;
    const snap = buildSnapshot(m, 'manual', label ?? `Version ${existing.length + 1}`, parentId);
    if (!snap) return null;
    saveSnapshot(snap);
    get().refresh(m.id);
    return snap;
  },

  async relabel(msId, snapId, label) {
    const snap = await loadSnapshot(msId, snapId);
    if (!snap) return;
    saveSnapshot({ ...snap, label }); // body is content-addressed → re-save is a cheap metadata write
    get().refresh(msId);
  },

  remove(msId, snapId) {
    deleteSnapshot(msId, snapId);
    get().refresh(msId);
  },
}));
