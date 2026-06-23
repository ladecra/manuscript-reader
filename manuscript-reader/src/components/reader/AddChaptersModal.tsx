import { useState, useRef, useCallback } from 'react';
import { XIcon } from '../ui/Icons';
import { readFilesToMarkdown, sortFiles } from '../../engine/ingestion/fileReader';

interface AddChaptersModalProps {
  open: boolean;
  manuscriptTitle: string;
  onClose: () => void;
  /** Returns combined markdown chunk to append, or throws on read failure. */
  onAppend: (markdownChunk: string) => void;
}

type Mode = 'paste' | 'files';

export function AddChaptersModal({ open, manuscriptTitle, onClose, onAppend }: AddChaptersModalProps) {
  const [mode, setMode] = useState<Mode>('paste');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPasteTitle(''); setPasteText(''); setFiles([]); setMode('paste'); setBusy(false);
  }, []);

  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  const pickFiles = (incoming: FileList | null) => {
    if (!incoming || !incoming.length) return;
    const valid = Array.from(incoming).filter(f => /\.(docx|md|txt)$/i.test(f.name));
    if (valid.length) setFiles(sortFiles(valid));
  };

  const handleSubmit = () => {
    if (mode === 'paste') {
      const raw = pasteText.trim();
      if (!raw) { window.alert('Nothing to add.'); return; }
      let chunk = raw;
      if (!/^# /m.test(chunk)) {
        chunk = `# ${pasteTitle.trim() || 'New Chapter'}\n\n${chunk}`;
      }
      onAppend(chunk);
      reset();
    } else {
      if (!files.length) { window.alert('No files selected.'); return; }
      setBusy(true);
      readFilesToMarkdown(files)
        .then(chunk => { onAppend(chunk); reset(); })
        .catch(() => { window.alert('Could not read files.'); setBusy(false); });
    }
  };

  if (!open) return null;

  return (
    <div
      id="add-ch-modal"
      className="modal-overlay visible"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="modal-card add-ch-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add chapters — {manuscriptTitle}</span>
          <button id="add-ch-close" className="modal-close" onClick={handleClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>

        <div className="tabs">
          <button className={`tab${mode === 'paste' ? ' active' : ''}`} onClick={() => setMode('paste')}>
            Paste text
          </button>
          <button className={`tab${mode === 'files' ? ' active' : ''}`} onClick={() => setMode('files')}>
            Add files
          </button>
        </div>

        <div className="add-ch-body">
          {mode === 'paste' ? (
            <>
              <input
                className="add-ch-paste-title"
                type="text"
                placeholder="Chapter title (optional)"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
              <textarea
                className="add-ch-textarea"
                placeholder="Paste chapter text or Markdown here. Use # headings to split multiple chapters."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={12}
              />
            </>
          ) : (
            <>
              <div
                className={`add-ch-file-drop${dragOver ? ' drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFiles(e.dataTransfer.files); }}
              >
                <div className="add-ch-file-drop-label">Drop .docx, .md, or .txt files</div>
                <div className="add-ch-file-drop-sub">or click to browse</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.md,.txt"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => pickFiles(e.target.files)}
              />
              {files.length > 0 && (
                <div id="add-ch-file-list">
                  {files.map((f, i) => (
                    <div key={i} className="add-ch-file-item">
                      <span style={{ color: 'var(--border)' }}>{String(i + 1).padStart(2, '0')}</span>
                      <span>{f.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="add-ch-footer">
          <button id="add-ch-submit" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Adding…' : 'Append to manuscript'}
          </button>
        </div>
      </div>
    </div>
  );
}
