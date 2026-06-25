import { useState } from 'react';
import type { SnapshotMeta } from '../../engine/types';
import { XIcon } from '../ui/Icons';
import { ShareReaderBody, type ShareReaderMode } from './ShareReaderBody';
import { useShareSnapshotSelection } from '../../hooks/useShareSnapshotSelection';

interface ShareReaderModalProps {
  open: boolean;
  title: string;
  versions: SnapshotMeta[];
  liveMarkdown?: string;
  manuscriptAvailable: boolean;
  initialMode?: ShareReaderMode;
  onClose: () => void;
  onSaveVersion?: () => void;
  onDownload: (snapshotId: string | null, withAnnotations: boolean) => void | Promise<void>;
}

export function ShareReaderModal({
  open,
  title,
  versions,
  liveMarkdown,
  manuscriptAvailable,
  initialMode = 'annotating',
  onClose,
  onSaveVersion,
  onDownload,
}: ShareReaderModalProps) {
  const [mode, setMode] = useState<ShareReaderMode>(initialMode);
  const [building, setBuilding] = useState(false);
  const { selectedSnapshotId, setSelectedSnapshotId } = useShareSnapshotSelection(versions);

  if (!open) return null;

  const handleDownload = () => {
    if (!manuscriptAvailable) return;
    setBuilding(true);
    setTimeout(async () => {
      try {
        await onDownload(selectedSnapshotId, mode === 'annotating');
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
      <div className="modal-card" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Share this version">
        <div className="modal-header">
          <span className="modal-title">Share this version</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>

        <div className="modal-body">
          <ShareReaderBody
            title={title}
            versions={versions}
            liveMarkdown={liveMarkdown}
            manuscriptAvailable={manuscriptAvailable}
            mode={mode}
            onModeChange={setMode}
            selectedSnapshotId={selectedSnapshotId}
            onSnapshotChange={setSelectedSnapshotId}
            onSaveVersion={onSaveVersion}
          />
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="modal-primary-btn"
            onClick={handleDownload}
            disabled={building || !manuscriptAvailable}
          >
            {building ? 'Building…' : 'Download reader file'}
          </button>
        </div>
      </div>
    </div>
  );
}
