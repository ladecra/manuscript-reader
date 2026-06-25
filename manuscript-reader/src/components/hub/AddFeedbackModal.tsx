import { useCallback, useEffect, useRef, useState } from 'react';
import { parseReaderExportPayload, type ReaderExportPayload } from '../../engine/sessions';
import { confirmFeedbackImportIfNeeded, validateFeedbackImport } from '../../engine/feedbackImport';
import type { SnapshotMeta } from '../../engine/types';
import { showToast } from '../ui/Toast';
import { XIcon } from '../ui/Icons';
import { ShareReaderBody, type ShareReaderMode } from '../share/ShareReaderBody';
import { useShareSnapshotSelection } from '../../hooks/useShareSnapshotSelection';

type Tab = 'import' | 'share';

interface AddFeedbackModalProps {
  open: boolean;
  title: string;
  manuscriptAvailable: boolean;
  liveMarkdown?: string;
  versions: SnapshotMeta[];
  onClose: () => void;
  onSaveVersion?: () => void;
  onImport: (payload: ReaderExportPayload) => void;
  onShareDownload: (snapshotId: string | null, withAnnotations: boolean) => void | Promise<void>;
}

export function AddFeedbackModal({
  open,
  title,
  manuscriptAvailable,
  liveMarkdown,
  versions,
  onClose,
  onSaveVersion,
  onImport,
  onShareDownload,
}: AddFeedbackModalProps) {
  const [tab, setTab] = useState<Tab>('import');
  const [dragging, setDragging] = useState(false);
  const [shareMode, setShareMode] = useState<ShareReaderMode>('annotating');
  const [building, setBuilding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectedSnapshotId, setSelectedSnapshotId } = useShareSnapshotSelection(versions);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const tryImport = useCallback((payload: ReaderExportPayload) => {
    const validation = validateFeedbackImport(payload, liveMarkdown, versions);
    if (!confirmFeedbackImportIfNeeded(validation)) return;
    onImport(payload);
    onClose();
  }, [liveMarkdown, versions, onImport, onClose]);

  const ingestFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const payload = parseReaderExportPayload(parsed);
        tryImport(payload);
      } catch {
        showToast('Could not read feedback file — expected a .json export from the reader.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }, [tryImport]);

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
    setTimeout(async () => {
      try {
        await onShareDownload(selectedSnapshotId, shareMode === 'annotating');
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
              <ShareReaderBody
                title={title}
                versions={versions}
                liveMarkdown={liveMarkdown}
                manuscriptAvailable={manuscriptAvailable}
                mode={shareMode}
                onModeChange={setShareMode}
                selectedSnapshotId={selectedSnapshotId}
                onSnapshotChange={setSelectedSnapshotId}
                onSaveVersion={onSaveVersion}
              />

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
