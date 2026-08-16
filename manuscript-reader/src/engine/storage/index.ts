// ─── Storage Engine ───────────────────────────────────────────────────────────
// Public storage API for the app. Internally:
//   • An async StorageProvider (IndexedDB in production, localStorage fallback)
//     owns persistence.
//   • A small in-memory cache is hydrated from the provider once at startup
//     (`hydrateStorage`). Reads are served synchronously from the cache so the
//     stores/components keep their simple synchronous calls; writes update the
//     cache and persist to the provider in the background.
// This is what lets us swap localStorage → IndexedDB (→ a future local store)
// without changing a single caller. Storage is local-first and device-local:
// there is no author account or cloud mirror. Cross-device sharing is the
// separate beta-reader share loop (unguessable link + capability token), never
// an account sync of the author's library.

import type { Annotation, Edit, ReaderSession, RevisionGraph, Snapshot, SnapshotMeta } from '../types';
import type { WorkMode } from '../reader/positionIntent';
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
  sessions: new Map<string, ReaderSession[]>(),
  positions: new Map<string, number>(),
  tombstones: new Map<string, number>(),
  // Snapshots: only the LIGHT index is cached (the cover precedent). Frozen bodies
  // are never held in memory — loadSnapshot fetches them on demand.
  snapshots: new Map<string, SnapshotMeta[]>(),
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

/** Await all queued persistence writes (e.g. before reading back through the provider). */
export function flushPendingWrites(): Promise<void> {
  return writeChain;
}

// Shallow copies are enough to keep callers from mutating cached records:
// fields get reassigned (not deep-mutated), and combinedMarkdown is an immutable
// string shared by reference — so we never re-copy multi-MB source text.
const copyMs = (m: StoredManuscript): StoredManuscript => ({ ...m });
const copyAnn = (a: Annotation): Annotation => ({ ...a });
const copyEdit = (e: Edit): Edit => ({ ...e });
const copySession = (s: ReaderSession): ReaderSession => ({ ...s, annotationIds: [...s.annotationIds] });

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
    cache.sessions.set(m.id, await provider.loadSessions(m.id));
    cache.snapshots.set(m.id, await provider.listSnapshots(m.id)); // index only — bodies stay lazy
    const pos = await provider.loadPosition(m.id);
    cache.positions.set(m.id, pos);
    m.progress = pos; // position is the source of truth for reading progress
  }
  cache.library = list;
  const tombs = await provider.loadTombstones();
  cache.tombstones = new Map(Object.entries(tombs));
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
    await target.saveSessions(m.id, await legacy.loadSessions(m.id));
    await target.savePosition(m.id, await legacy.loadPosition(m.id));
    const graph = await legacy.loadRevisionGraph(m.id);
    if (graph) await target.saveRevisionGraph(m.id, graph);
    for (const meta of await legacy.listSnapshots(m.id)) {
      const snap = await legacy.loadSnapshot(m.id, meta.id);
      if (snap) await target.saveSnapshot(snap);
    }
  }
  console.info(`[storage] migrated ${list.length} manuscript(s) to IndexedDB`);
}

// ── Manuscripts (library) ──────────────────────────────────────────────────────

export function loadLibrary(): StoredManuscript[] {
  return cache.library.map(copyMs);
}

function persistTombstones(): void {
  const rec = Object.fromEntries(cache.tombstones);
  persist(() => provider.saveTombstones(rec));
}

/** Record that a manuscript was deleted locally, so a stale cache/import can't
 *  silently resurrect it on this device. */
function recordManuscriptTombstone(id: string): void {
  const deletedAt = Date.now();
  cache.tombstones.set(id, deletedAt);
  persistTombstones();
}

/** User re-imported or recreated a manuscript with this id — allow it in the library again. */
export function clearManuscriptTombstone(id: string): void {
  if (!cache.tombstones.has(id)) return;
  cache.tombstones.delete(id);
  persistTombstones();
}

function purgeManuscriptCache(id: string): void {
  cache.annotations.delete(id);
  cache.edits.delete(id);
  cache.sessions.delete(id);
  cache.positions.delete(id);
  cache.snapshots.delete(id);
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
    if (!old || manuscriptChanged(m, old)) {
      const rec = { ...m };
      persist(() => provider.saveManuscript(rec));
    }
  }
  for (const m of cache.library) {
    if (!nextIds.has(m.id)) {
      recordManuscriptTombstone(m.id);
      purgeManuscriptCache(m.id);
      persist(async () => {
        await provider.deleteManuscript(m.id);
        await provider.saveCover(m.id, null);
        await provider.saveNote(m.id, ''); // don't let a re-import resurrect a stale scratchpad
      });
    }
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
    || a.combinedMarkdown !== b.combinedMarkdown
    || !!a.favorite !== !!b.favorite
    || !!a.shared !== !!b.shared
    || JSON.stringify(a.share ?? null) !== JSON.stringify(b.share ?? null)
    || JSON.stringify(a.publishing ?? null) !== JSON.stringify(b.publishing ?? null);
}

export function manuscriptId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

/**
 * A storage ID for a freshly imported manuscript that is guaranteed not to
 * collide with any `taken` ID. The slug stays human-readable; on collision we
 * append a short random suffix rather than overwrite. Title-derived IDs used to
 * be reused directly, so two different manuscripts that slugified the same (most
 * commonly the `untitled` bucket — real manuscripts often lack an h1 title)
 * would silently overwrite each other. Every import is now its own manuscript.
 */
export function uniqueManuscriptId(title: string, taken: Iterable<string>): string {
  const used = taken instanceof Set ? taken : new Set(taken);
  const base = manuscriptId(title) || 'manuscript';
  if (!used.has(base)) return base;
  let id: string;
  do {
    id = `${base.slice(0, 33)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (used.has(id));
  return id;
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
    anns.forEach(a => { const id = a.readerId ?? a.readerName; if (id) readers.add(`${ms.id}::${id}`); });
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

// ── Reader sessions ────────────────────────────────────────────────────────────

export function loadSessions(id: string): ReaderSession[] {
  return (cache.sessions.get(id) ?? []).map(copySession);
}

export function saveSessions(id: string, sessions: ReaderSession[]): void {
  cache.sessions.set(id, sessions.map(copySession));
  persist(() => provider.saveSessions(id, sessions));
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

// ── Cover images ───────────────────────────────────────────────────────────────
// Stored separately from the manuscript record (images are large; keeping them
// off StoredManuscript means the library list load stays fast). Covers are NOT
// cached in memory — they're loaded on demand per component.

export async function loadCover(id: string): Promise<string | null> {
  return provider.loadCover(id);
}

export function saveCover(id: string, dataUrl: string | null): void {
  persist(() => provider.saveCover(id, dataUrl));
}

// ── Working Notes scratchpad ─────────────────────────────────────────────────
// A free-text note per manuscript. Loaded on demand (the cover pattern — not held
// in the startup cache), saved through the serialized write chain. Returns ''
// when unset.

export function loadNote(id: string): Promise<string> {
  return provider.loadNote(id);
}

export function saveNote(id: string, text: string): void {
  persist(() => provider.saveNote(id, text));
}

// ── Revision-concern graph ────────────────────────────────────────────────────
// One blob per manuscript (concerns + membership links + answered suggestions).
// Loaded on demand (the cover/note pattern — the concern store holds it while a
// manuscript is open), saved through the serialized write chain.

export function loadRevisionGraph(id: string): Promise<RevisionGraph | null> {
  return provider.loadRevisionGraph(id);
}

export function saveRevisionGraph(id: string, graph: RevisionGraph): void {
  persist(() => provider.saveRevisionGraph(id, graph));
}

// ── Version snapshots (Phase 8) ──────────────────────────────────────────────
// The light index is cached (hydrated at startup, kept current on save/delete) so
// the library/hub can list versions synchronously. Frozen bodies are NEVER cached:
// loadSnapshot is async and fetches them from the provider on demand (the cover
// pattern).

const copySnapMeta = (m: SnapshotMeta): SnapshotMeta => ({ ...m });

/** Light index of a manuscript's snapshots, newest-capture last. Synchronous. */
export function listSnapshots(id: string): SnapshotMeta[] {
  return (cache.snapshots.get(id) ?? []).map(copySnapMeta);
}

/** Load one full snapshot (frozen markdown + inputs). Async — bodies are lazy. */
export async function loadSnapshot(id: string, snapshotId: string): Promise<Snapshot | null> {
  return provider.loadSnapshot(id, snapshotId);
}

/** Persist a snapshot (immutable once written; re-save only backfills/dedups the
 *  body). Updates the cached index and persists locally. */
export function saveSnapshot(snap: Snapshot): void {
  const meta = toSnapshotMeta(snap);
  const list = (cache.snapshots.get(snap.manuscriptId) ?? []).filter(s => s.id !== snap.id);
  list.push(meta);
  list.sort((a, b) => a.createdAt - b.createdAt);
  cache.snapshots.set(snap.manuscriptId, list);
  persist(() => provider.saveSnapshot(snap));
}

/** Delete a snapshot. Updates the cached index and persists locally. */
export function deleteSnapshot(id: string, snapshotId: string): void {
  cache.snapshots.set(id, (cache.snapshots.get(id) ?? []).filter(s => s.id !== snapshotId));
  persist(() => provider.deleteSnapshot(id, snapshotId));
}

function toSnapshotMeta(s: Snapshot): SnapshotMeta {
  const { markdown: _m, annotations: _a, sessions: _s, ...meta } = s;
  return meta;
}

// ── Preferences (theme / font) ───────────────────────────────────────────────
// Tiny, read synchronously at startup to avoid a flash. These stay on
// localStorage on purpose — they don't need IndexedDB capacity or async.

export const THEME_KEY = 'ms_theme';
export const FONT_KEY = 'ms_font';
const WORK_POS_KEY = 'ms_workpos_v1';

/** Apply persisted theme + font size to `<html>` before React paints. Also used
 *  from the inline bootstrap in index.html (keep keys in sync). */
export function applyDocumentPreferences(): void {
  try {
    const root = document.documentElement;
    root.classList.add('theme-bootstrapping');
    root.classList.toggle('light', localStorage.getItem(THEME_KEY) === 'light');
    const fs = localStorage.getItem(FONT_KEY);
    if (fs) {
      const n = parseInt(fs, 10);
      if (Number.isFinite(n) && n > 0) {
        root.style.setProperty('--body-size', `${n}px`);
      }
    }
  } catch { /**/ }
}

/** Re-enable theme crossfades after the first frame (see .theme-bootstrapping). */
export function endThemeBootstrap(): void {
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('theme-bootstrapping');
  });
}

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

// ── Mode work bookmarks (local-only, disposable) ─────────────────────────────
// Where the author was working in Annotations / Changes mode, kept separate from
// the canonical reading progress. Pure wayfinding (the hub's "resume where you
// left off" rows read these), so they live in localStorage and are NOT synced —
// losing them on a new device is fine. Keyed { [manuscriptId]: { [mode]: frac } }.

function readWorkPositions(): Record<string, Partial<Record<WorkMode, number>>> {
  try { return JSON.parse(localStorage.getItem(WORK_POS_KEY) ?? '{}'); }
  catch { return {}; }
}

export function loadWorkPosition(id: string, mode: WorkMode): number {
  return readWorkPositions()[id]?.[mode] ?? 0;
}

export function saveWorkPosition(id: string, mode: WorkMode, frac: number): void {
  const all = readWorkPositions();
  (all[id] ??= {})[mode] = frac;
  try { localStorage.setItem(WORK_POS_KEY, JSON.stringify(all)); } catch { /**/ }
}
