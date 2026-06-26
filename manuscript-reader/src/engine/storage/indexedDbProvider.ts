// ─── Storage: IndexedDB provider ──────────────────────────────────────────────
// Production browser backend. Capacity is hundreds of MB to GBs (vs localStorage's
// ~5 MB), which is what removes the silent-eviction data loss.
//
// Everything lives in ONE key-value object store keyed by the "kind:id" scheme.
// A single store (rather than a store per kind) means new entity types can be
// added later WITHOUT an IndexedDB version bump / upgrade migration.

import { openDB, type IDBPDatabase } from 'idb';
import type { Annotation, Edit, ReaderSession, Snapshot, SnapshotMeta } from '../types';
import type { StorageProvider, StoredManuscript, SnapshotRecord } from './provider';
import { key, MANUSCRIPT_PREFIX } from './provider';

/** Drop the frozen children from a snapshot record down to the light index shape. */
function toMeta(rec: SnapshotRecord): SnapshotMeta {
  const { annotations: _a, sessions: _s, ...meta } = rec;
  return meta;
}

const DB_NAME = 'vellibris';
const DB_VERSION = 1;
const STORE = 'records';

export function indexedDbAvailable(): boolean {
  try { return typeof indexedDB !== 'undefined'; } catch { return false; }
}

export class IndexedDbProvider implements StorageProvider {
  readonly name = 'indexedDB';
  private dbp: Promise<IDBPDatabase> | null = null;

  private db(): Promise<IDBPDatabase> {
    if (!this.dbp) {
      this.dbp = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        },
      });
    }
    return this.dbp;
  }

  async listManuscripts(): Promise<StoredManuscript[]> {
    const db = await this.db();
    // All keys in the "manuscript:" namespace (￿ is the high sentinel).
    const range = IDBKeyRange.bound(MANUSCRIPT_PREFIX, MANUSCRIPT_PREFIX + '￿');
    return (await db.getAll(STORE, range)) as StoredManuscript[];
  }

  async saveManuscript(ms: StoredManuscript): Promise<void> {
    const db = await this.db();
    await db.put(STORE, ms, key.manuscript(ms.id));
  }

  async deleteManuscript(id: string): Promise<void> {
    const db = await this.db();
    // Snapshot records + bodies are keyed by ranges; collect their keys first.
    const snapKeys = await db.getAllKeys(
      STORE, IDBKeyRange.bound(key.snapshotPrefix(id), key.snapshotPrefix(id) + '￿'));
    const bodyKeys = await db.getAllKeys(
      STORE, IDBKeyRange.bound(key.snapshotBodyPrefix(id), key.snapshotBodyPrefix(id) + '￿'));
    const tx = db.transaction(STORE, 'readwrite');
    await Promise.all([
      tx.store.delete(key.manuscript(id)),
      tx.store.delete(key.annotations(id)),
      tx.store.delete(key.edits(id)),
      tx.store.delete(key.sessions(id)),
      tx.store.delete(key.position(id)),
      tx.store.delete(key.cover(id)),
      ...snapKeys.map(k => tx.store.delete(k)),
      ...bodyKeys.map(k => tx.store.delete(k)),
      tx.done,
    ]);
  }

  async loadAnnotations(id: string): Promise<Annotation[]> {
    const db = await this.db();
    return ((await db.get(STORE, key.annotations(id))) as Annotation[]) ?? [];
  }

  async saveAnnotations(id: string, annotations: Annotation[]): Promise<void> {
    const db = await this.db();
    await db.put(STORE, annotations, key.annotations(id));
  }

  async loadEdits(id: string): Promise<Edit[]> {
    const db = await this.db();
    return ((await db.get(STORE, key.edits(id))) as Edit[]) ?? [];
  }

  async saveEdits(id: string, edits: Edit[]): Promise<void> {
    const db = await this.db();
    await db.put(STORE, edits, key.edits(id));
  }

  async loadSessions(id: string): Promise<ReaderSession[]> {
    const db = await this.db();
    return ((await db.get(STORE, key.sessions(id))) as ReaderSession[]) ?? [];
  }

  async saveSessions(id: string, sessions: ReaderSession[]): Promise<void> {
    const db = await this.db();
    await db.put(STORE, sessions, key.sessions(id));
  }

  async loadPosition(id: string): Promise<number> {
    const db = await this.db();
    return ((await db.get(STORE, key.position(id))) as number) ?? 0;
  }

  async savePosition(id: string, frac: number): Promise<void> {
    const db = await this.db();
    await db.put(STORE, frac, key.position(id));
  }

  async loadCover(id: string): Promise<string | null> {
    const db = await this.db();
    return ((await db.get(STORE, key.cover(id))) as string) ?? null;
  }

  async saveCover(id: string, dataUrl: string | null): Promise<void> {
    const db = await this.db();
    if (dataUrl === null) await db.delete(STORE, key.cover(id));
    else await db.put(STORE, dataUrl, key.cover(id));
  }

  // ── Version snapshots ──
  // The record (meta + frozen children) and the markdown body live under separate
  // keys so listing never loads bodies, and an identical body (same versionId)
  // stores once.

  async listSnapshots(id: string): Promise<SnapshotMeta[]> {
    const db = await this.db();
    const range = IDBKeyRange.bound(key.snapshotPrefix(id), key.snapshotPrefix(id) + '￿');
    const recs = (await db.getAll(STORE, range)) as SnapshotRecord[];
    return recs.map(toMeta).sort((a, b) => a.createdAt - b.createdAt);
  }

  async loadSnapshot(id: string, snapshotId: string): Promise<Snapshot | null> {
    const db = await this.db();
    const rec = (await db.get(STORE, key.snapshot(id, snapshotId))) as SnapshotRecord | undefined;
    if (!rec) return null;
    const markdown = ((await db.get(STORE, key.snapshotBody(id, rec.versionId))) as string) ?? '';
    return { ...rec, markdown };
  }

  async saveSnapshot(snap: Snapshot): Promise<void> {
    const db = await this.db();
    const { markdown, ...rec } = snap;
    const bodyKey = key.snapshotBody(snap.manuscriptId, snap.versionId);
    const tx = db.transaction(STORE, 'readwrite');
    const bodyExists = (await tx.store.get(bodyKey)) !== undefined;
    const ops: Promise<unknown>[] = [
      tx.store.put(rec as SnapshotRecord, key.snapshot(snap.manuscriptId, snap.id)),
    ];
    if (!bodyExists) ops.push(tx.store.put(markdown, bodyKey)); // content-addressed: write once
    await Promise.all([...ops, tx.done]);
  }

  async saveSnapshotMeta(rec: SnapshotRecord): Promise<void> {
    const db = await this.db();
    await db.put(STORE, rec, key.snapshot(rec.manuscriptId, rec.id)); // record only, no body
  }

  async deleteSnapshot(id: string, snapshotId: string): Promise<void> {
    const db = await this.db();
    const rec = (await db.get(STORE, key.snapshot(id, snapshotId))) as SnapshotRecord | undefined;
    if (!rec) return;
    await db.delete(STORE, key.snapshot(id, snapshotId));
    // Reclaim the body only if no sibling snapshot still references this versionId.
    const range = IDBKeyRange.bound(key.snapshotPrefix(id), key.snapshotPrefix(id) + '￿');
    const siblings = (await db.getAll(STORE, range)) as SnapshotRecord[];
    if (!siblings.some(s => s.versionId === rec.versionId)) {
      await db.delete(STORE, key.snapshotBody(id, rec.versionId));
    }
  }

  async loadTombstones(): Promise<Record<string, number>> {
    const db = await this.db();
    return ((await db.get(STORE, key.tombstones())) as Record<string, number>) ?? {};
  }

  async saveTombstones(tombstones: Record<string, number>): Promise<void> {
    const db = await this.db();
    await db.put(STORE, tombstones, key.tombstones());
  }
}
