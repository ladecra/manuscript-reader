import { useMemo } from 'react';
import type { SnapshotMeta } from '../../engine/types';
import {
  formatSnapshotShareLabel,
  liveDraftDiffersFromSnapshot,
  snapshotById,
  snapshotOrdinalMap,
  sortSnapshotsNewestFirst,
} from '../../engine/shareReader';

const SHARE_MODE_DESC = {
  reading: 'Clean reading experience. No annotation tools visible.',
  annotating: 'Full annotation tools included. Your reader exports their feedback as a .json file — import it here to merge their notes.',
} as const;

export type ShareReaderMode = keyof typeof SHARE_MODE_DESC;

export interface ShareReaderBodyProps {
  title: string;
  versions: SnapshotMeta[];
  liveMarkdown?: string;
  manuscriptAvailable: boolean;
  mode: ShareReaderMode;
  onModeChange: (mode: ShareReaderMode) => void;
  selectedSnapshotId: string | null;
  onSnapshotChange: (id: string | null) => void;
  onSaveVersion?: () => void;
}

export function ShareReaderBody({
  title,
  versions,
  liveMarkdown,
  manuscriptAvailable,
  mode,
  onModeChange,
  selectedSnapshotId,
  onSnapshotChange,
  onSaveVersion,
}: ShareReaderBodyProps) {
  const ordinals = useMemo(() => snapshotOrdinalMap(versions), [versions]);
  const ordered = useMemo(() => sortSnapshotsNewestFirst(versions), [versions]);
  const selected = selectedSnapshotId ? snapshotById(versions, selectedSnapshotId) : undefined;
  const unpublished = selected && liveDraftDiffersFromSnapshot(liveMarkdown, selected);

  const wordCount = selected?.wordCount ?? 0;
  const chapterCount = selected?.chapterCount ?? 0;

  return (
    <>
      <div className="share-meta">
        <strong style={{ color: 'var(--ink)' }}>{title}</strong>
        {selected ? (
          <>
            <br />
            {wordCount ? `${wordCount.toLocaleString()} words · ` : ''}
            {chapterCount} chapter{chapterCount !== 1 ? 's' : ''}
          </>
        ) : null}
      </div>

      {ordered.length > 0 ? (
        <label className="share-version-field">
          <span className="share-version-label">Share this version</span>
          <select
            className="share-version-select"
            value={selectedSnapshotId ?? ''}
            onChange={e => onSnapshotChange(e.target.value || null)}
            disabled={!manuscriptAvailable}
          >
            {ordered.map(v => (
              <option key={v.id} value={v.id}>
                {formatSnapshotShareLabel(v, ordinals.get(v.id) ?? 0)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="share-mode-desc share-version-empty">
          No saved versions yet — sharing uses your current draft. Save a version on the Versions tab to freeze a milestone before beta readers.
        </p>
      )}

      {unpublished && (
        <p className="share-version-warn" role="status">
          Your editor has changes that are not in this version. Readers will get the saved version above, not your latest edits.
          {onSaveVersion && (
            <>
              {' '}
              <button type="button" className="share-version-save-link" onClick={onSaveVersion}>
                Save current as version
              </button>
            </>
          )}
        </p>
      )}

      <div className="share-toggle-row">
        <button
          type="button"
          className={`share-toggle-btn${mode === 'reading' ? ' active' : ''}`}
          onClick={() => onModeChange('reading')}
        >
          Reading only
        </button>
        <button
          type="button"
          className={`share-toggle-btn${mode === 'annotating' ? ' active' : ''}`}
          onClick={() => onModeChange('annotating')}
        >
          With annotation tools
        </button>
      </div>

      <p className="share-mode-desc">{SHARE_MODE_DESC[mode]}</p>
    </>
  );
}
