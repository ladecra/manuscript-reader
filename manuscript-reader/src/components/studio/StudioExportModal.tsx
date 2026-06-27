import { useState } from 'react';
import type { SnapshotMeta } from '../../engine/types';
import { XIcon } from '../ui/Icons';
import { StudioExportBody, STUDIO_EXPORT_LIVE_DRAFT } from './StudioExportBody';
import type { StudioFormatId } from './StudioFormatRail';
import { STUDIO_FORMATS } from './StudioFormatRail';

interface StudioExportModalProps {
  open: boolean;
  format: StudioFormatId;
  title: string;
  versions: SnapshotMeta[];
  liveMarkdown?: string;
  manuscriptAvailable: boolean;
  onClose: () => void;
  onSaveVersion?: () => void;
  /** Resolve markdown for the chosen export source, then run the download. */
  onConfirm: (exportSource: string) => void | Promise<void>;
}

export function StudioExportModal({
  open,
  format,
  title,
  versions,
  liveMarkdown,
  manuscriptAvailable,
  onClose,
  onSaveVersion,
  onConfirm,
}: StudioExportModalProps) {
  const [exportSource, setExportSource] = useState(STUDIO_EXPORT_LIVE_DRAFT);
  const [building, setBuilding] = useState(false);
  const primary = STUDIO_FORMATS.find(f => f.id === format) ?? STUDIO_FORMATS[0];

  if (!open) return null;

  const handleConfirm = () => {
    if (!manuscriptAvailable) return;
    setBuilding(true);
    setTimeout(async () => {
      try {
        await onConfirm(exportSource);
        onClose();
      } finally {
        setBuilding(false);
      }
    }, 50);
  };

  return (
    <div
      className="modal-overlay visible"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Export manuscript">
        <div className="modal-header">
          <span className="modal-title">Export this manuscript</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>

        <div className="modal-body">
          <StudioExportBody
            title={title}
            versions={versions}
            liveMarkdown={liveMarkdown}
            manuscriptAvailable={manuscriptAvailable}
            exportSource={exportSource}
            onExportSourceChange={setExportSource}
            onSaveVersion={onSaveVersion}
          />
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="modal-primary-btn"
            onClick={handleConfirm}
            disabled={building || !manuscriptAvailable}
          >
            {building ? 'Building…' : primary.primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { STUDIO_EXPORT_LIVE_DRAFT };
