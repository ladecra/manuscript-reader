// ─── Storage: localStorage provider ───────────────────────────────────────────
// Faithful wrapper of the original v0.9 localStorage format. Serves two roles:
//   1. the migration *source* when upgrading a user to IndexedDB, and
//   2. a fallback backend when IndexedDB is unavailable (old/locked-down browsers).
// Because it keeps the exact legacy keys, an existing user's data is readable
// here without any conversion.

import type { Annotation, Edit, ReaderSession, Snapshot, SnapshotMeta } from '../types';
import type { StorageProvider, StoredManuscript, SnapshotRecord } from './provider';

const LIBRARY_KEY = 'ms_library_v2';
const POSITION_KEY = 'ms_pos_';
const ANN_KEY = 'ms_ann_';
const EDIT_KEY = 'ms_edits_';
const SESSION_KEY = 'ms_sessions_';
const COVER_KEY = 'ms_cover_';
const SNAP_KEY = 'ms_snap_';        // ms_snap_{msId}_{snapId} → SnapshotRecord
const SNAPBODY_KEY = 'ms_snapbody_'; // ms_snapbody_{msId}_{versionId} → markdown

function toMeta(rec: SnapshotRecord): SnapshotMeta {
  const { annotations: _a, sessions: _s, ...meta } = rec;
  return meta;
}
/** All localStorage keys starting with `prefix` (localStorage has no range scan). */
function keysWithPrefix(prefix: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) out.push(k);
  }
  return out;
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'localStorage';

  async listManuscripts(): Promise<StoredManuscript[]> {
    try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]'); }
    catch { return []; }
  }

  async saveManuscript(ms: StoredManuscript): Promise<void> {
    const list = await this.listManuscripts();
    const idx = list.findIndex(m => m.id === ms.id);
    if (idx >= 0) list[idx] = ms; else list.unshift(ms);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(list)); // may throw QuotaExceededError
  }

  async deleteManuscript(id: string): Promise<void> {
    const list = (await this.listManuscripts()).filter(m => m.id !== id);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
    localStorage.removeItem(ANN_KEY + id);
    localStorage.removeItem(EDIT_KEY + id);
    localStorage.removeItem(SESSION_KEY + id);
    localStorage.removeItem(POSITION_KEY + id);
    localStorage.removeItem(COVER_KEY + id);
    for (const k of keysWithPrefix(`${SNAP_KEY}${id}_`)) localStorage.removeItem(k);
    for (const k of keysWithPrefix(`${SNAPBODY_KEY}${id}_`)) localStorage.removeItem(k);
  }

  async loadAnnotations(id: string): Promise<Annotation[]> {
    try { return JSON.parse(localStorage.getItem(ANN_KEY + id) ?? '[]'); }
    catch { return []; }
  }

  async saveAnnotations(id: string, annotations: Annotation[]): Promise<void> {
    localStorage.setItem(ANN_KEY + id, JSON.stringify(annotations));
  }

  async loadEdits(id: string): Promise<Edit[]> {
    try { return JSON.parse(localStorage.getItem(EDIT_KEY + id) ?? '[]'); }
    catch { return []; }
  }

  async saveEdits(id: string, edits: Edit[]): Promise<void> {
    localStorage.setItem(EDIT_KEY + id, JSON.stringify(edits));
  }

  async loadSessions(id: string): Promise<ReaderSession[]> {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY + id) ?? '[]'); }
    catch { return []; }
  }

  async saveSessions(id: string, sessions: ReaderSession[]): Promise<void> {
    localStorage.setItem(SESSION_KEY + id, JSON.stringify(sessions));
  }

  async loadPosition(id: string): Promise<number> {
    return parseFloat(localStorage.getItem(POSITION_KEY + id) ?? '0') || 0;
  }

  async savePosition(id: string, frac: number): Promise<void> {
    localStorage.setItem(POSITION_KEY + id, String(frac));
  }

  async loadCover(id: string): Promise<string | null> {
    return localStorage.getItem(COVER_KEY + id) ?? null;
  }

  async saveCover(id: string, dataUrl: string | null): Promise<void> {
    if (dataUrl === null) { localStorage.removeItem(COVER_KEY + id); return; }
    try { localStorage.setItem(COVER_KEY + id, dataUrl); }
    catch { /* QuotaExceededError — cover won't persist on this backend */ }
  }

  // ── Version snapshots ──
  // Faithful parity with the IndexedDB layout (record + content-addressed body),
  // via prefix iteration. NOTE: snapshots are exactly the large data that motivated
  // IndexedDB; on this fallback they can exhaust the ~5 MB quota (saveSnapshot may
  // throw QuotaExceededError, surfaced like any other persist failure).

  async listSnapshots(id: string): Promise<SnapshotMeta[]> {
    const out: SnapshotMeta[] = [];
    for (const k of keysWithPrefix(`${SNAP_KEY}${id}_`)) {
      try { out.push(toMeta(JSON.parse(localStorage.getItem(k) ?? ''))); } catch { /* skip */ }
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }

  async loadSnapshot(id: string, snapshotId: string): Promise<Snapshot | null> {
    const raw = localStorage.getItem(`${SNAP_KEY}${id}_${snapshotId}`);
    if (!raw) return null;
    const rec = JSON.parse(raw) as SnapshotRecord;
    const markdown = localStorage.getItem(`${SNAPBODY_KEY}${id}_${rec.versionId}`) ?? '';
    return { ...rec, markdown };
  }

  async saveSnapshot(snap: Snapshot): Promise<void> {
    const { markdown, ...rec } = snap;
    localStorage.setItem(`${SNAP_KEY}${snap.manuscriptId}_${snap.id}`, JSON.stringify(rec));
    const bodyKey = `${SNAPBODY_KEY}${snap.manuscriptId}_${snap.versionId}`;
    if (localStorage.getItem(bodyKey) === null) localStorage.setItem(bodyKey, markdown);
  }

  async saveSnapshotMeta(rec: SnapshotRecord): Promise<void> {
    localStorage.setItem(`${SNAP_KEY}${rec.manuscriptId}_${rec.id}`, JSON.stringify(rec)); // record only
  }

  async deleteSnapshot(id: string, snapshotId: string): Promise<void> {
    const raw = localStorage.getItem(`${SNAP_KEY}${id}_${snapshotId}`);
    if (!raw) return;
    const rec = JSON.parse(raw) as SnapshotRecord;
    localStorage.removeItem(`${SNAP_KEY}${id}_${snapshotId}`);
    const stillUsed = (await this.listSnapshots(id)).some(s => s.versionId === rec.versionId);
    if (!stillUsed) localStorage.removeItem(`${SNAPBODY_KEY}${id}_${rec.versionId}`);
  }
}
