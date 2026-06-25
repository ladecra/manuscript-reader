import { useState } from 'react';
import type { SnapshotMeta } from '../engine/types';
import { defaultShareSnapshotId } from '../engine/shareReader';

/** Selected snapshot for share export; falls back to newest when unset or stale. */
export function useShareSnapshotSelection(versions: SnapshotMeta[]) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selectedSnapshotId =
    pickedId && versions.some(v => v.id === pickedId)
      ? pickedId
      : defaultShareSnapshotId(versions);
  return { selectedSnapshotId, setSelectedSnapshotId: setPickedId };
}
