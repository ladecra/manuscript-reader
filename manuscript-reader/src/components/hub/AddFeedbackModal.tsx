import { useCallback, useEffect, useRef, useState } from 'react';
import { parseReaderExportPayload, type ReaderExportPayload } from '../../engine/sessions';
import { showToast } from '../ui/Toast';
import { XIcon } from '../ui/Icons';

const SHARE_MODE_DESC = {
  reading: 'Clean reading experience. No annotation tools visible.',
  annotating: 'Full annotation tools included. Your reader exports their feedback as a .json file — import it here to merge their notes.',
} as const;

type ShareMode = keyof typeof SHARE_MODE_DESC;
type Tab = 'import' | 'share';

interface AddFeedbackModalProps {
  open: boolean;
  title: string;
  wordCount: number;
  chapterCount: number;
  manuscriptAvailable: boolean;
  onClose: () => void;
  onImport: (payload: ReaderExportPayload) => void;
  onShareDownload: (withAnnotations: boolean) => void;
}

export function AddFeedbackModal({
  open,
  title,
  wordCount,
  chapterCount,
  manuscriptAvailable,
  onClose,
  onImport,
  onShareDownload,
}: AddFeedbackModalProps) {
  const [tab, setTab] = useState<Tab>('import');
  const [dragging, setDragging] = useState(false);
  const [shareMode, setShareMode] = useState<ShareMode>('annotating');
  const [building, setBuilding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const ingestFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const payload = parseReaderExportPayload(parsed);
        onImport(payload);
        onClose();
      } catch {
        showToast('Could not read feedback file — expected a .json export from the reader.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }, [onImport, onClose]);

  const acceptFiles = useCallback((incoming: FileList | null) => {
    if (!incoming?.length) return;
    const file = [...incoming].find(f => /\.json$/i.test(f.name)) ?? incoming[0];
    if (file) ingestFile(file);
  }, [ingestFile]);

  const handleShareDownload = () => {
    if (!manuscriptAvailable) {
      showToast('Re-import this manuscript to share a reader file.');
      return;
    }
    setBuilding(true);
    setTimeout(() => {
      try {
        onShareDownload(shareMode === 'annotating');
        onClose();
      } finally {
        setBuilding(false);
      }
    }, 50);
  };

  if (!open) return null;

  return (
    <div
      className="modal-overlay visible"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-card load-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add or share feedback"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">Add or share feedback</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>

        <div className="modal-body load-modal-body">
          <div className="load-tabs">
            <button type="button" className={`tab${tab === 'import' ? ' active' : ''}`} onClick={() => setTab('import')}>
              Import
            </button>
            <button type="button" className={`tab${tab === 'share' ? ' active' : ''}`} onClick={() => setTab('share')}>
              Share reader
            </button>
          </div>

          {tab === 'import' && (
            <div>
              <p className="hub-feedback-modal-lead">
                Import a .json file from a beta reader&apos;s shared reader — their annotations and session merge into this manuscript.
              </p>
              <div
                id="drop-border"
                className={dragging ? 'drag-over' : ''}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragging(false);
                  acceptFiles(e.dataTransfer.files);
                }}
              >
                <div className="drop-label">Drop a feedback file here</div>
                <span className="load-browse">or browse for .json</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={e => acceptFiles(e.target.files)}
              />
            </div>
          )}

          {tab === 'share' && (
            <div>
              <div id="share-meta" className="share-meta">
                <strong style={{ color: 'var(--ink)' }}>{title}</strong><br />
                {wordCount ? `${wordCount.toLocaleString()} words · ` : ''}
                {chapterCount} chapter{chapterCount !== 1 ? 's' : ''}
              </div>

              <div className="share-toggle-row">
                <button
                  type="button"
                  className={`share-toggle-btn${shareMode === 'reading' ? ' active' : ''}`}
                  onClick={() => setShareMode('reading')}
                >
                  Reading only
                </button>
                <button
                  type="button"
                  className={`share-toggle-btn${shareMode === 'annotating' ? ' active' : ''}`}
                  onClick={() => setShareMode('annotating')}
                >
                  With annotation tools
                </button>
              </div>

              <p className="share-mode-desc">{SHARE_MODE_DESC[shareMode]}</p>

              <button
                type="button"
                className="load-cta"
                style={{ marginTop: 18 }}
                onClick={handleShareDownload}
                disabled={building || !manuscriptAvailable}
              >
                {building ? 'Building…' : 'Download reader file'}
              </button>
              {!manuscriptAvailable && (
                <p className="hub-feedback-modal-hint">Re-import the manuscript source to generate a reader file.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
