// ─── Storage: IndexedDB provider ──────────────────────────────────────────────
// Production browser backend. Capacity is hundreds of MB to GBs (vs localStorage's
// ~5 MB), which is what removes the silent-eviction data loss.
//
// Everything lives in ONE key-value object store keyed by the "kind:id" scheme.
// A single store (rather than a store per kind) means new entity types can be
// added later WITHOUT an IndexedDB version bump / upgrade migration.

import { openDB, type IDBPDatabase } from 'idb';
import type { Annotation, Edit, ReaderSession } from '../types';
import type { StorageProvider, StoredManuscript } from './provider';
import { key, MANUSCRIPT_PREFIX } from './provider';

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
    const tx = db.transaction(STORE, 'readwrite');
    await Promise.all([
      tx.store.delete(key.manuscript(id)),
      tx.store.delete(key.annotations(id)),
      tx.store.delete(key.edits(id)),
      tx.store.delete(key.sessions(id)),
      tx.store.delete(key.position(id)),
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
}
