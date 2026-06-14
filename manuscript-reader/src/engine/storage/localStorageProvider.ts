// ─── Storage: localStorage provider ───────────────────────────────────────────
// Faithful wrapper of the original v0.9 localStorage format. Serves two roles:
//   1. the migration *source* when upgrading a user to IndexedDB, and
//   2. a fallback backend when IndexedDB is unavailable (old/locked-down browsers).
// Because it keeps the exact legacy keys, an existing user's data is readable
// here without any conversion.

import type { Annotation } from '../types';
import type { StorageProvider, StoredManuscript } from './provider';

const LIBRARY_KEY = 'ms_library_v2';
const POSITION_KEY = 'ms_pos_';
const ANN_KEY = 'ms_ann_';

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
    localStorage.removeItem(POSITION_KEY + id);
  }

  async loadAnnotations(id: string): Promise<Annotation[]> {
    try { return JSON.parse(localStorage.getItem(ANN_KEY + id) ?? '[]'); }
    catch { return []; }
  }

  async saveAnnotations(id: string, annotations: Annotation[]): Promise<void> {
    localStorage.setItem(ANN_KEY + id, JSON.stringify(annotations));
  }

  async loadPosition(id: string): Promise<number> {
    return parseFloat(localStorage.getItem(POSITION_KEY + id) ?? '0') || 0;
  }

  async savePosition(id: string, frac: number): Promise<void> {
    localStorage.setItem(POSITION_KEY + id, String(frac));
  }
}
