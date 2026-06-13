import { useState, useRef, useCallback } from 'react';
import { readFilesToMarkdown, sortFiles } from '../engine/ingestion/fileReader';
import { preprocessMarkdown, hasHeading } from '../engine/ingestion/preprocessMarkdown';
import { showToast } from '../components/ui/Toast';

interface LoadScreenProps {
  onLoad: (combinedMarkdown: string) => void;
}

export function LoadScreen({ onLoad }: LoadScreenProps) {
  const [tab, setTab] = useState<'files' | 'paste'>('files');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!hasHeading(combined)) {
      combined = `# ${pasteTitle.trim() || 'Untitled'}\n\n${combined}`;
    }
    onLoad(combined);
  }, [pasteText, pasteTitle, onLoad]);

  return (
    <div id="screen-load" className="active">
      <div className="screen-inner">
        <h2 className="load-title">Load Manuscript</h2>
        <p className="load-sub">DOCX, Markdown, or plain text.</p>

        {/* ── Tabs ── */}
        <div className="load-tabs">
          <button
            className={`load-tab${tab === 'files' ? ' active' : ''}`}
            onClick={() => setTab('files')}
            id="tab-files"
          >
            Files
          </button>
          <button
            className={`load-tab${tab === 'paste' ? ' active' : ''}`}
            onClick={() => setTab('paste')}
            id="tab-paste"
          >
            Paste
          </button>
        </div>

        {/* ── Files panel ── */}
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
                  ? 'Drop DOCX, MD, or TXT files here'
                  : `${files.length} file${files.length !== 1 ? 's' : ''} selected — in reading order`}
              </p>
              <button className="text-btn" style={{ fontSize: '11px' }}>
                {files.length ? 'Change files' : 'Browse files'}
              </button>
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
              id="load-btn"
              className="outline-btn"
              style={{ width: '100%', justifyContent: 'center', marginTop: '24px', padding: '13px 16px' }}
              onClick={handleLoad}
              disabled={loading || files.length === 0}
            >
              {loading ? 'Reading…' : 'Read manuscript'}
            </button>
          </div>
        )}

        {/* ── Paste panel ── */}
        {tab === 'paste' && (
          <div id="paste-panel" className="active">
            <input
              id="paste-title"
              className="edit-input"
              type="text"
              placeholder="Title (optional)"
              value={pasteTitle}
              onChange={e => setPasteTitle(e.target.value)}
              style={{ width: '100%', marginBottom: '16px', fontSize: '18px' }}
            />
            <textarea
              id="paste-textarea"
              placeholder="Paste manuscript text here…"
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              style={{
                width: '100%',
                minHeight: '240px',
                background: 'none',
                border: '1px solid var(--border)',
                color: 'var(--on-surface)',
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: '17px',
                lineHeight: '1.6',
                padding: '16px',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <button
              id="paste-load-btn"
              className="outline-btn"
              style={{ width: '100%', justifyContent: 'center', marginTop: '16px', padding: '13px 16px' }}
              onClick={handlePaste}
              disabled={!pasteText.trim()}
            >
              Load text
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
