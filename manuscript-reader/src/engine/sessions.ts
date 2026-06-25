// ─── Reader Sessions — construction & merge (Phase 5) ─────────────────────────
// Pure, browser-independent. Two responsibilities:
//   1. sessionFromImportPayload — turn a shared-reader export into a ReaderSession.
//   2. mergeReaderSessions       — combine many sessions into a multi-reader view
//      (completion, abandonment, consensus). No UI, no storage, fully testable.
//
// This is where the product stops tracking annotations and starts tracking
// *readers*: a reader who stopped at chapter four is signal, not absence. The
// merge result is the seed of Phase 6's EditorialSignals — it will fold into that
// object once the report engine converges on a single output shape.

import type { Annotation, Chapter, ReaderSession } from './types';

// ── Import payload → ReaderSession ────────────────────────────────────────────

/** The shape the shared-reader HTML exports (see engine/exports/shareableReader.ts).
 *  Every field except `annotations` may be absent in a legacy export file. */
export interface ReaderExportPayload {
  readerId?: string;
  readerName?: string | null;
  manuscript?: string;
  manuscriptVersionId?: string;
  snapshotId?: string;
  snapshotLabel?: string;
  startedAt?: number;
  completedAt?: number | null;
  exportedAt?: number;
  progress?: number;
  annotations: Annotation[];
}

/** Parse a beta-reader .json export (full payload or legacy annotations array). */
export function parseReaderExportPayload(raw: unknown): ReaderExportPayload {
  if (Array.isArray(raw)) return { annotations: raw as Annotation[] };
  if (raw && typeof raw === 'object' && Array.isArray((raw as ReaderExportPayload).annotations)) {
    return raw as ReaderExportPayload;
  }
  throw new Error('invalid');
}

/**
 * Build a ReaderSession from an import payload. Deterministic: the id is derived
 * from (manuscriptId, readerId), so re-importing an updated feedback file from
 * the same reader UPDATES their session rather than creating a duplicate. Legacy
 * payloads (missing identity/progress) degrade to a synthesized id and zeroed
 * progress — never throws.
 */
export function sessionFromImportPayload(
  payload: ReaderExportPayload,
  manuscriptId: string,
  fallbackReaderId?: string,
): ReaderSession {
  const readerId =
    payload.readerId ?? fallbackReaderId ?? ('r-import-' + Math.abs(hashStr(JSON.stringify(payload.annotations.map(a => a.id)))).toString(36));
  const anns = payload.annotations ?? [];
  return {
    id: `session-${manuscriptId}-${readerId}`,
    manuscriptId,
    readerId,
    readerName: payload.readerName ?? 'Beta reader',
    manuscriptVersionId: payload.manuscriptVersionId,
    startedAt: payload.startedAt ?? payload.exportedAt ?? Date.now(),
    completedAt: payload.completedAt ?? undefined,
    progress: clamp01(payload.progress ?? 0),
    annotationIds: anns.map(a => a.id),
  };
}

// ── Merge many sessions → one combined view ───────────────────────────────────

export interface ReaderSummary {
  readerId: string;
  readerName: string;
  progress: number;
  completed: boolean;
  annotationCount: number;
  furthestChapter: number;       // highest chapterIndex they annotated (0 = none)
  manuscriptVersionId?: string;
}

export interface ChapterAgreement {
  chapterIndex: number;
  annotationCount: number;
  readersWhoAnnotated: number;   // distinct readers with ≥1 annotation here
  readersWhoReached: number;     // readers whose progress reached this chapter (-1 if unknown — no word data)
}

export interface SessionMergeResult {
  readers: ReaderSummary[];
  readerCount: number;
  completionRate: number;        // fraction of readers with a completedAt
  versionsRead: string[];        // distinct manuscriptVersionIds across sessions (did everyone read the same draft?)
  chapters: ChapterAgreement[];
  consensusChapters: ChapterAgreement[]; // ≥2 readers independently annotated, strongest first
}

/**
 * Combine reader sessions into a multi-reader view. `annotations` is the flat
 * store the sessions reference (annotations carry their own readerId, so the
 * merge groups by that); `chapters` is optional and only enables the
 * "readers who reached this chapter" abandonment signal (needs word counts to
 * map a progress fraction to a chapter).
 */
export function mergeReaderSessions(
  sessions: ReaderSession[],
  annotations: Annotation[],
  chapters?: Chapter[],
): SessionMergeResult {
  // Index annotations by the reader who made them.
  const annsByReader = new Map<string, Annotation[]>();
  for (const a of annotations) {
    const rid = a.readerId ?? (a.readerName ? 'name:' + a.readerName : null);
    if (!rid) continue; // author's own / unattributed — not a beta session here
    const list = annsByReader.get(rid) ?? [];
    list.push(a);
    annsByReader.set(rid, list);
  }

  const readers: ReaderSummary[] = sessions.map(s => {
    const anns = annsByReader.get(s.readerId) ?? [];
    return {
      readerId: s.readerId,
      readerName: s.readerName,
      progress: clamp01(s.progress),
      completed: s.completedAt != null,
      annotationCount: anns.length,
      furthestChapter: anns.reduce((m, a) => Math.max(m, a.chapterIndex || 0), 0),
      manuscriptVersionId: s.manuscriptVersionId,
    };
  });

  const completionRate = sessions.length
    ? sessions.filter(s => s.completedAt != null).length / sessions.length
    : 0;
  const versionsRead = [...new Set(sessions.map(s => s.manuscriptVersionId).filter(Boolean))] as string[];

  // Cumulative start fraction of each chapter, for the "reached" signal.
  const startFractionByIndex = chapters ? chapterStartFractions(chapters) : null;

  // Per-chapter aggregation over the sessions' readers.
  const sessionReaderIds = new Set(sessions.map(s => s.readerId));
  const byChapter = new Map<number, { count: number; readers: Set<string> }>();
  for (const [rid, anns] of annsByReader) {
    if (!sessionReaderIds.has(rid)) continue; // only count readers that have a session
    for (const a of anns) {
      const ci = a.chapterIndex || 0;
      const slot = byChapter.get(ci) ?? { count: 0, readers: new Set<string>() };
      slot.count++; slot.readers.add(rid);
      byChapter.set(ci, slot);
    }
  }

  const chapterIndices = chapters
    ? chapters.map(c => c.index)
    : [...byChapter.keys()].sort((a, b) => a - b);

  const chapterStats: ChapterAgreement[] = chapterIndices.map(ci => {
    const slot = byChapter.get(ci);
    const reached = startFractionByIndex
      ? sessions.filter(s => clamp01(s.progress) >= (startFractionByIndex.get(ci) ?? 0)).length
      : -1;
    return {
      chapterIndex: ci,
      annotationCount: slot?.count ?? 0,
      readersWhoAnnotated: slot?.readers.size ?? 0,
      readersWhoReached: reached,
    };
  });

  const consensusChapters = chapterStats
    .filter(c => c.readersWhoAnnotated >= 2)
    .sort((a, b) => b.readersWhoAnnotated - a.readersWhoAnnotated || b.annotationCount - a.annotationCount);

  return {
    readers,
    readerCount: sessions.length,
    completionRate,
    versionsRead,
    chapters: chapterStats,
    consensusChapters,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

/** Cumulative word-fraction at which each chapter begins (0 for the first). When
 *  word counts are missing, falls back to even spacing by chapter order. */
function chapterStartFractions(chapters: Chapter[]): Map<number, number> {
  const total = chapters.reduce((s, c) => s + (c.wordCount ?? 0), 0);
  const out = new Map<number, number>();
  if (total > 0) {
    let acc = 0;
    for (const c of chapters) { out.set(c.index, acc / total); acc += c.wordCount ?? 0; }
  } else {
    chapters.forEach((c, i) => out.set(c.index, chapters.length ? i / chapters.length : 0));
  }
  return out;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return h;
}
