// ─── Storage Engine ───────────────────────────────────────────────────────────
// localStorage persistence. Uses a flat "stored" format internally — the Zustand
// stores are responsible for converting to/from the canonical Manuscript type.

const LIBRARY_KEY  = 'ms_library_v2';
const POSITION_KEY = 'ms_pos_';
const ANN_KEY      = 'ms_ann_';
const THEME_KEY    = 'ms_theme';
const FONT_KEY     = 'ms_font';

// The flat format persisted to localStorage (matches v0.9 schema for backward compat)
export interface StoredManuscript {
  id: string;
  title: string;
  wordCount: number;
  chapterCount: number;
  lastOpened: number;
  status: string;
  combinedMarkdown?: string;
  uncached?: boolean;
  progress?: number;
}

import type { Annotation } from './types';

export function loadLibrary(): StoredManuscript[] {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]'); }
  catch { return []; }
}

export function saveLibrary(library: StoredManuscript[]): void {
  let attempts = 0;
  while (attempts <= library.length) {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); return; }
    catch {
      const candidates = [...library]
        .filter(m => m.combinedMarkdown)
        .sort((a, b) => (a.lastOpened ?? 0) - (b.lastOpened ?? 0));
      if (!candidates.length) return;
      delete candidates[0].combinedMarkdown;
      candidates[0].uncached = true;
      attempts++;
    }
  }
}

export function manuscriptId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

export function savePosition(id: string, frac: number): void {
  try { localStorage.setItem(POSITION_KEY + id, String(frac)); } catch { /**/ }
}

export function loadPosition(id: string): number {
  return parseFloat(localStorage.getItem(POSITION_KEY + id) ?? '0') || 0;
}

export function loadAnnotations(msId: string): Annotation[] {
  try { return JSON.parse(localStorage.getItem(ANN_KEY + msId) ?? '[]'); }
  catch { return []; }
}

export function saveAnnotations(msId: string, annotations: Annotation[]): void {
  try { localStorage.setItem(ANN_KEY + msId, JSON.stringify(annotations)); } catch { /**/ }
}

export function getAnnotationStats(library: StoredManuscript[]): { total: number; readers: Set<string> } {
  let total = 0;
  const readers = new Set<string>();
  for (const ms of library) {
    const anns = loadAnnotations(ms.id);
    total += anns.length;
    anns.forEach(a => { if (a.readerName) readers.add(`${ms.id}::${a.readerName}`); });
  }
  return { total, readers };
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
