// ─── Share reader — version selection (pure) ────────────────────────────────
// Authors choose a frozen snapshot at share time; the live draft is not implied.

import type { SnapshotMeta } from './types';
import { manuscriptVersionId } from './manuscript/manuscriptVersion';

export function sortSnapshotsNewestFirst(versions: SnapshotMeta[]): SnapshotMeta[] {
  return [...versions].sort((a, b) => b.createdAt - a.createdAt);
}

/** Default share target: the newest saved version (not the live editor). */
export function defaultShareSnapshotId(versions: SnapshotMeta[]): string | null {
  return sortSnapshotsNewestFirst(versions)[0]?.id ?? null;
}

export function snapshotById(versions: SnapshotMeta[], id: string): SnapshotMeta | undefined {
  return versions.find(v => v.id === id);
}

export function liveDraftDiffersFromSnapshot(
  liveMarkdown: string | undefined,
  snap: SnapshotMeta,
): boolean {
  if (!liveMarkdown) return false;
  return manuscriptVersionId(liveMarkdown) !== snap.versionId;
}

export function formatSnapshotShareLabel(
  snap: SnapshotMeta,
  ordinal: number,
): string {
  const name = snap.label?.trim() || `Version ${ordinal}`;
  const when = new Date(snap.createdAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  return `${name} · ${when}`;
}

/** Ordinal (v1, v2…) by creation order — matches the Versions tab. */
export function snapshotOrdinalMap(versions: SnapshotMeta[]): Map<string, number> {
  const ordered = [...versions].sort((a, b) => a.createdAt - b.createdAt);
  return new Map(ordered.map((v, i) => [v.id, i + 1] as const));
}
