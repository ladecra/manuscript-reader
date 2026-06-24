// ─── Version snapshots — pure capture primitive (Phase 8) ─────────────────────
// Building a Snapshot is a pure function: freeze the current editorial INPUTS
// (markdown + annotations + sessions) and stamp the content address. No derived
// signals are stored (they're recomputed from these inputs at compare time — see
// the Snapshot doc in types.ts). The store layer (engine/storage) persists what
// this returns; the UI and the headless harness both call this one entry.

import type { Annotation, ReaderSession, Snapshot } from './types';
import { manuscriptVersionId } from './manuscript/manuscriptVersion';

export interface CreateSnapshotInput {
  manuscriptId: string;
  markdown: string;
  annotations: Annotation[];
  sessions: ReaderSession[];
  /** Carried from the manuscript record so capture stays parser-free and cheap. */
  wordCount: number;
  chapterCount: number;
  /** Why the snapshot is being taken: the import baseline, or an explicit "Save version". */
  trigger: 'import' | 'manual';
  label?: string;
  parentId?: string;
  /** Injectable for deterministic tests; default Date.now(). */
  now?: number;
  /** Injectable id for deterministic tests; default derived from id+timestamp. */
  id?: string;
}

/** Freeze current state into an immutable Snapshot. The `versionId` is the content
 *  address of the markdown — identical prose yields the same id, which the store
 *  uses to dedup bodies and which reader sessions match against to bind to a draft. */
export function createSnapshot(input: CreateSnapshotInput): Snapshot {
  const createdAt = input.now ?? Date.now();
  const versionId = manuscriptVersionId(input.markdown);
  const id = input.id ?? `snap-${input.manuscriptId}-${createdAt.toString(36)}`;
  return {
    id,
    manuscriptId: input.manuscriptId,
    parentId: input.parentId,
    label: input.label,
    createdAt,
    trigger: input.trigger,
    versionId,
    wordCount: input.wordCount,
    chapterCount: input.chapterCount,
    markdown: input.markdown,
    // Defensive copies — a frozen snapshot must not alias the live arrays.
    annotations: input.annotations.map(a => ({ ...a })),
    sessions: input.sessions.map(s => ({ ...s, annotationIds: [...s.annotationIds] })),
  };
}

/** Whether the live markdown differs from a snapshot's frozen content — the cheap
 *  guard for "is a new version even worth taking?" (same versionId ⇒ no text change). */
export function markdownDiffersFromSnapshot(liveMarkdown: string, snap: { versionId: string }): boolean {
  return manuscriptVersionId(liveMarkdown) !== snap.versionId;
}
