import { useMemo } from 'react';
import type { SnapshotMeta } from '../../engine/types';
import {
  formatSnapshotShareLabel,
  liveDraftDiffersFromSnapshot,
  snapshotById,
  snapshotOrdinalMap,
  sortSnapshotsNewestFirst,
} from '../../engine/shareReader';

const LIVE_DRAFT = '__live__';

export interface StudioExportBodyProps {
  title: string;
  versions: SnapshotMeta[];
  liveMarkdown?: string;
  manuscriptAvailable: boolean;
  exportSource: string;
  onExportSourceChange: (source: string) => void;
  onSaveVersion?: () => void;
}

/** Version fork before a publishable download — same gate pattern as ShareReaderBody. */
export function StudioExportBody({
  title,
  versions,
  liveMarkdown,
  manuscriptAvailable,
  exportSource,
  onExportSourceChange,
  onSaveVersion,
}: StudioExportBodyProps) {
  const ordinals = useMemo(() => snapshotOrdinalMap(versions), [versions]);
  const ordered = useMemo(() => sortSnapshotsNewestFirst(versions), [versions]);
  const fromSnapshot = exportSource !== LIVE_DRAFT;
  const selected = fromSnapshot ? snapshotById(versions, exportSource) : undefined;
  const unpublished = selected && liveDraftDiffersFromSnapshot(liveMarkdown, selected);

  const wordCount = fromSnapshot ? (selected?.wordCount ?? 0) : undefined;
  const chapterCount = fromSnapshot ? (selected?.chapterCount ?? 0) : undefined;

  return (
    <>
      <div className="share-meta">
        <strong style={{ color: 'var(--ink)' }}>{title}</strong>
        {fromSnapshot && selected ? (
          <>
            <br />
            {wordCount ? `${wordCount.toLocaleString()} words · ` : ''}
            {chapterCount} chapter{chapterCount !== 1 ? 's' : ''}
          </>
        ) : null}
      </div>

      <label className="share-version-field">
        <span className="share-version-label">Export from</span>
        <select
          className="share-version-select"
          value={exportSource}
          onChange={e => onExportSourceChange(e.target.value)}
          disabled={!manuscriptAvailable}
        >
          <option value={LIVE_DRAFT}>Current working draft</option>
          {ordered.map(v => (
            <option key={v.id} value={v.id}>
              {formatSnapshotShareLabel(v, ordinals.get(v.id) ?? 0)}
            </option>
          ))}
        </select>
      </label>

      {ordered.length === 0 && (
        <p className="share-mode-desc share-version-empty">
          No saved versions yet — this export uses your current draft. Save a version on the Manuscript page when you want a frozen milestone to export from.
        </p>
      )}

      {unpublished && (
        <p className="share-version-warn" role="status">
          Your editor has changes that are not in this version. The file will use the saved version above, not your latest edits.
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

      {exportSource === LIVE_DRAFT && hasMeaningfulLiveWarning(liveMarkdown, ordered, liveDraftDiffersFromSnapshot) && (
        <p className="share-mode-desc">
          Exporting your working draft including any edits not yet captured in a saved version.
        </p>
      )}
    </>
  );
}

function hasMeaningfulLiveWarning(
  liveMarkdown: string | undefined,
  ordered: SnapshotMeta[],
  differs: typeof liveDraftDiffersFromSnapshot,
): boolean {
  if (!liveMarkdown || ordered.length === 0) return false;
  const newest = ordered[0];
  return differs(liveMarkdown, newest);
}

export { LIVE_DRAFT as STUDIO_EXPORT_LIVE_DRAFT };
