import { CoverImage } from '../ui/CoverImage';
import { listSnapshots } from '../../engine/storage';

interface StudioShelfTileProps {
  manuscriptId: string;
  title: string;
  selected: boolean;
  onSelect: () => void;
}

/** A cover on the publishing shelf — selection only, not navigation to the hub. */
export function StudioShelfTile({ manuscriptId, title, selected, onSelect }: StudioShelfTileProps) {
  const versionCount = listSnapshots(manuscriptId).length;

  return (
    <button
      type="button"
      className={`studio-shelf-tile${selected ? ' studio-shelf-tile--selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      title={title}
    >
      <span className="studio-shelf-cover">
        <CoverImage manuscriptId={manuscriptId} title={title} />
        {versionCount > 0 && (
          <span className="studio-shelf-version" aria-hidden="true">v{versionCount}</span>
        )}
      </span>
      <span className="studio-shelf-title">{title}</span>
    </button>
  );
}
