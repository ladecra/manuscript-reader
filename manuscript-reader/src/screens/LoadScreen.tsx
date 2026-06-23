import { useState, useRef, useCallback, useEffect } from 'react';
import { readFilesToMarkdown, sortFiles } from '../engine/ingestion/fileReader';
import { preprocessMarkdown, hasHeading } from '../engine/ingestion/preprocessMarkdown';
import { showToast } from '../components/ui/Toast';
import { XIcon } from '../components/ui/Icons';

interface LoadModalProps {
  onLoad: (combinedMarkdown: string) => void;
  onClose: () => void;
}

// New-manuscript flow as a modal over the library (no orphan full-screen route).
export function LoadModal({ onLoad, onClose }: LoadModalProps) {
  const [tab, setTab] = useState<'files' | 'paste'>('files');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const acceptFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const valid = sortFiles(
      [...incoming].filter(f => /\.(md|txt|docx)$/i.test(f.name)),
    );
    if (valid.length) setFiles(valid);
  }, []);

  const handleLoad = useCallback(async () => {
    if (!files.length) { showToast('No files selected.'); return; }
    setLoading(true);
    try {
      const combined = await readFilesToMarkdown(files);
      onLoad(combined);
    } catch {
      showToast('Could not read one or more files.');
    } finally {
      setLoading(false);
    }
  }, [files, onLoad]);

  const handlePaste = useCallback(() => {
    const raw = pasteText.trim();
    if (!raw) { showToast('Paste some text first.'); return; }
    let combined = preprocessMarkdown(raw);
    const title = pasteTitle.trim();
    if (!hasHeading(combined)) {
      combined = `# ${title || 'Untitled'}\n\n${combined}`;
    }
    if (title) {
      combined = `<!-- title: ${title} -->\n${combined}`;
    }
    onLoad(combined);
  }, [pasteText, pasteTitle, onLoad]);

  return (
    <div
      className="modal-overlay visible"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card load-modal" role="dialog" aria-modal="true" aria-label="New manuscript">
        <div className="modal-header">
          <span className="modal-title">New manuscript</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>

        <div className="modal-body load-modal-body">
          <div className="load-tabs">
            <button className={`tab${tab === 'files' ? ' active' : ''}`} onClick={() => setTab('files')}>Files</button>
            <button className={`tab${tab === 'paste' ? ' active' : ''}`} onClick={() => setTab('paste')}>Paste</button>
          </div>

          {tab === 'files' && (
            <div id="file-panel">
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
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              >
                <input
                  ref={fileInputRef}
                  id="file-input"
                  type="file"
                  accept=".md,.txt,.docx"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => acceptFiles(e.target.files)}
                />
                <p className="drop-label">
                  {files.length === 0
                    ? 'Drop DOCX, Markdown, or text files'
                    : `${files.length} file${files.length !== 1 ? 's' : ''} selected — in reading order`}
                </p>
                <span className="load-browse">{files.length ? 'Change files' : 'Browse files'}</span>
              </div>

              {files.length > 0 && (
                <div id="file-list-wrap">
                  <div id="file-list">
                    {files.map((f, idx) => (
                      <div key={f.name} className="file-row">
                        <span className="file-num">{String(idx + 1).padStart(2, '0')}</span>
                        {f.name.replace(/\.(md|txt|docx)$/i, '').replace(/[-_]/g, ' ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                className="load-cta"
                onClick={handleLoad}
                disabled={loading || files.length === 0}
              >
                {loading ? 'Reading…' : 'Read manuscript'}
              </button>
            </div>
          )}

          {tab === 'paste' && (
            <div id="paste-panel" className="active">
              <input
                id="paste-title"
                className="load-paste-title"
                type="text"
                placeholder="Title (optional)"
                value={pasteTitle}
                onChange={e => setPasteTitle(e.target.value)}
              />
              <textarea
                id="paste-textarea"
                className="load-paste-text"
                placeholder="Paste manuscript text here…"
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              <button
                type="button"
                className="load-cta"
                onClick={handlePaste}
                disabled={!pasteText.trim()}
              >
                Load text
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
