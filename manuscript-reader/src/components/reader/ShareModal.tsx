import { useState } from 'react';
import { XIcon } from '../ui/Icons';

const SHARE_MODE_DESC = {
  reading: 'Clean reading experience. No annotation tools visible.',
  annotating: 'Full annotation tools included. The reader exports their feedback as a .json file — use "Import beta reader feedback" in your annotations panel to bring it in.',
} as const;

type ShareMode = keyof typeof SHARE_MODE_DESC;

interface ShareModalProps {
  open: boolean;
  title: string;
  wordCount: number;
  chapterCount: number;
  onClose: () => void;
  onDownload: (withAnnotations: boolean) => void;
}

export function ShareModal({ open, title, wordCount, chapterCount, onClose, onDownload }: ShareModalProps) {
  const [mode, setMode] = useState<ShareMode>('reading');
  const [building, setBuilding] = useState(false);

  if (!open) return null;

  const handleDownload = () => {
    setBuilding(true);
    // Defer so the "Building…" label paints before the (synchronous) build.
    setTimeout(() => {
      try {
        onDownload(mode === 'annotating');
      } finally {
        setBuilding(false);
      }
    }, 50);
  };

  return (
    <div
      id="share-modal"
      className="modal-overlay visible"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Share reader file</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div id="share-meta" className="share-meta">
            <strong style={{ color: 'var(--primary)' }}>{title}</strong><br />
            {wordCount ? `${wordCount.toLocaleString()} words · ` : ''}{chapterCount} chapter{chapterCount !== 1 ? 's' : ''}
          </div>

          <div className="share-toggle-row">
            <button
              className={`share-toggle-btn${mode === 'reading' ? ' active' : ''}`}
              data-share-mode="reading"
              onClick={() => setMode('reading')}
            >
              Reading only
            </button>
            <button
              className={`share-toggle-btn${mode === 'annotating' ? ' active' : ''}`}
              data-share-mode="annotating"
              onClick={() => setMode('annotating')}
            >
              With annotation tools
            </button>
          </div>

          <p id="share-mode-desc" className="share-mode-desc">{SHARE_MODE_DESC[mode]}</p>
        </div>

        <div className="modal-footer">
          <button
            id="share-download-btn"
            className="modal-primary-btn"
            onClick={handleDownload}
            disabled={building}
          >
            {building ? 'Building…' : 'Download reader file'}
          </button>
        </div>
      </div>
    </div>
  );
}
