import { DownloadIcon } from '../ui/Icons';

/** A single artifact/export tile — a chip, a title + one-line quality promise, and a
 *  download glyph. Shared by the hub's Exports tab and the Publishing Studio so both
 *  read the same. */
export function ExportCard({
  chip, title, desc, onClick, disabled, disabledHint,
}: {
  chip: string; title: string; desc: string;
  onClick: () => void; disabled?: boolean; disabledHint?: string;
}) {
  return (
    <button
      type="button"
      className="hub-export-card"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
    >
      <span className="hub-export-card-chip">{chip}</span>
      <span className="hub-export-card-body">
        <span className="hub-export-card-title">{title}</span>
        <span className="hub-export-card-desc">{desc}</span>
      </span>
      <DownloadIcon size={15} className="hub-export-card-icon" />
    </button>
  );
}
