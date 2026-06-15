// ─── Storage Engine ───────────────────────────────────────────────────────────
// Public storage API for the app. Internally:
//   • An async StorageProvider (IndexedDB in production, localStorage fallback)
//     owns persistence.
//   • A small in-memory cache is hydrated from the provider once at startup
//     (`hydrateStorage`). Reads are served synchronously from the cache so the
//     stores/components keep their simple synchronous calls; writes update the
//     cache and persist to the provider in the background.
// This is what lets us swap localStorage → IndexedDB (→ future SQLite/cloud)
// without changing a single caller.

import type { Annotation, Edit } from '../types';
import type { StorageProvider, StoredManuscript } from './provider';
import { LocalStorageProvider } from './localStorageProvider';
import { IndexedDbProvider, indexedDbAvailable } from './indexedDbProvider';

export type { StoredManuscript };

// ── In-memory cache (hydrated once from the active provider) ──
let provider: StorageProvider = new LocalStorageProvider();
let hydrated = false;
const cache = {
  library: [] as StoredManuscript[],
  annotations: new Map<string, Annotation[]>(),
  edits: new Map<string, Edit[]>(),
  positions: new Map<string, number>(),
};

// Persistence failures (e.g. quota) are surfaced through a settable handler so
// this engine module stays UI-free; the app wires it to a toast.
let onPersistError: ((e: unknown) => void) | null = null;
export function setPersistErrorHandler(fn: ((e: unknown) => void) | null): void {
  onPersistError = fn;
}
function reportPersistError(e: unknown): void {
  console.error('[storage] persist failed', e);
  onPersistError?.(e);
}

// All provider mutations run through one serialized chain. IndexedDB writes are
// independent per key, but the localStorage fallback read-modify-writes a single
// shared list, so concurrent unawaited writes there could clobber one another.
let writeChain: Promise<void> = Promise.resolve();
function persist(op: () => Promise<void>): void {
  writeChain = writeChain.then(op).catch(reportPersistError);
}

// Shallow copies are enough to keep callers from mutating cached records:
// fields get reassigned (not deep-mutated), and combinedMarkdown is an immutable
// string shared by reference — so we never re-copy multi-MB source text.
const copyMs = (m: StoredManuscript): StoredManuscript => ({ ...m });
const copyAnn = (a: Annotation): Annotation => ({ ...a });
const copyEdit = (e: Edit): Edit => ({ ...e });

// ── Startup ──────────────────────────────────────────────────────────────────

/** Choose the best provider, migrating legacy localStorage data into IndexedDB
 *  on first run, and load everything into the in-memory cache. Call once before
 *  the app reads storage. */
export async function hydrateStorage(): Promise<void> {
  if (hydrated) return;
  provider = await selectProvider();
  const list = await provider.listManuscripts();
  for (const m of list) {
    cache.annotations.set(m.id, await provider.loadAnnotations(m.id));
    cache.edits.set(m.id, await provider.loadEdits(m.id));
    const pos = await provider.loadPosition(m.id);
    cache.positions.set(m.id, pos);
    m.progress = pos; // position is the source of truth for reading progress
  }
  cache.library = list;
  hydrated = true;
}

async function selectProvider(): Promise<StorageProvider> {
  if (!indexedDbAvailable()) return new LocalStorageProvider();
  try {
    const idb = new IndexedDbProvider();
    const existing = await idb.listManuscripts();
    if (existing.length === 0) await migrateFromLocalStorage(idb);
    return idb;
  } catch (e) {
    console.warn('[storage] IndexedDB unavailable, using localStorage', e);
    return new LocalStorageProvider();
  }
}

async function migrateFromLocalStorage(target: StorageProvider): Promise<void> {
  const legacy = new LocalStorageProvider();
  const list = await legacy.listManuscripts();
  if (!list.length) return;
  for (const m of list) {
    await target.saveManuscript(m);
    await target.saveAnnotations(m.id, await legacy.loadAnnotations(m.id));
    await target.saveEdits(m.id, await legacy.loadEdits(m.id));
    await target.savePosition(m.id, await legacy.loadPosition(m.id));
  }
  console.info(`[storage] migrated ${list.length} manuscript(s) to IndexedDB`);
}

// ── Manuscripts (library) ──────────────────────────────────────────────────────

export function loadLibrary(): StoredManuscript[] {
  return cache.library.map(copyMs);
}

/** Replace the library. Persists only the manuscripts that actually changed (so
 *  frequent metadata saves don't rewrite every manuscript's source text), and
 *  deletes any that were removed. Writes are serialized (see `persist`) so the
 *  localStorage fallback can't lose an update by interleaving read-modify-write.
 *  Quota failures surface through the persist-error handler, not a return value. */
export function saveLibrary(library: StoredManuscript[]): void {
  const prev = new Map(cache.library.map(m => [m.id, m]));
  const nextIds = new Set(library.map(m => m.id));
  for (const m of library) {
    const old = prev.get(m.id);
    if (!old || manuscriptChanged(m, old)) { const rec = { ...m }; persist(() => provider.saveManuscript(rec)); }
  }
  for (const m of cache.library) {
    if (!nextIds.has(m.id)) persist(() => provider.deleteManuscript(m.id));
  }
  cache.library = library.map(copyMs);
}

/** Compares everything that lives on the manuscript record. `progress` is
 *  deliberately excluded — it is persisted via savePosition, so progress ticks
 *  don't trigger a rewrite of the (potentially large) source text. */
function manuscriptChanged(a: StoredManuscript, b: StoredManuscript): boolean {
  return a.title !== b.title || a.author !== b.author || a.status !== b.status
    || a.wordCount !== b.wordCount || a.chapterCount !== b.chapterCount
    || a.lastOpened !== b.lastOpened || a.uncached !== b.uncached
    || a.combinedMarkdown !== b.combinedMarkdown;
}

export function manuscriptId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

// ── Annotations ────────────────────────────────────────────────────────────────

export function loadAnnotations(id: string): Annotation[] {
  return (cache.annotations.get(id) ?? []).map(copyAnn);
}

export function saveAnnotations(id: string, annotations: Annotation[]): void {
  cache.annotations.set(id, annotations.map(copyAnn));
  persist(() => provider.saveAnnotations(id, annotations));
}

export function getAnnotationStats(library: StoredManuscript[]): { total: number; readers: Set<string> } {
  let total = 0;
  const readers = new Set<string>();
  for (const ms of library) {
    const anns = cache.annotations.get(ms.id) ?? [];
    total += anns.length;
    anns.forEach(a => { if (a.readerName) readers.add(`${ms.id}::${a.readerName}`); });
  }
  return { total, readers };
}

// ── Edits ────────────────────────────────────────────────────────────────────────

export function loadEdits(id: string): Edit[] {
  return (cache.edits.get(id) ?? []).map(copyEdit);
}

export function saveEdits(id: string, edits: Edit[]): void {
  cache.edits.set(id, edits.map(copyEdit));
  persist(() => provider.saveEdits(id, edits));
}

// ── Reading position ────────────────────────────────────────────────────────────

export function loadPosition(id: string): number {
  return cache.positions.get(id) ?? 0;
}

export function savePosition(id: string, frac: number): void {
  cache.positions.set(id, frac);
  const m = cache.library.find(x => x.id === id);
  if (m) m.progress = frac; // keep the library UI in sync without a manuscript rewrite
  persist(() => provider.savePosition(id, frac));
}

// ── Preferences (theme / font) ───────────────────────────────────────────────
// Tiny, read synchronously at startup to avoid a flash. These stay on
// localStorage on purpose — they don't need IndexedDB capacity or async.

const THEME_KEY = 'ms_theme';
const FONT_KEY = 'ms_font';

export function loadTheme(): 'light' | 'dark' {
  return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') ?? 'dark';
}
export function saveTheme(t: 'light' | 'dark'): void {
  try { localStorage.setItem(THEME_KEY, t); } catch { /**/ }
}
export function loadFontSize(): number {
  return parseInt(localStorage.getItem(FONT_KEY) ?? '19', 10) || 19;
}
export function saveFontSize(n: number): void {
  try { localStorage.setItem(FONT_KEY, String(n)); } catch { /**/ }
}
