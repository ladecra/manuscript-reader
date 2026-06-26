import { useMemo, useState } from 'react';
import { XIcon } from '../ui/Icons';
import { buildManuscriptStructure } from '../../engine/ingestion/manuscriptStructure';
import { summarizeExtent, type ExtentRequest } from '../../engine/exports/manuscriptExtent';

// Standard Manuscript Format export with an EXTENT picker — agents request a slice
// ("first 3 chapters", "first 50 pages", "first 10,000 words"). The author picks a
// kind + amount and sees, BEFORE downloading, exactly where it lands (resolveExtent
// snaps to a clean boundary so it never cuts mid-sentence). A page = ~250 words (the
// SMF convention), so page and word requests are the same underlying computation.

type Kind = 'full' | 'chapters' | 'pages' | 'words';

const KIND_LABEL: Record<Kind, string> = { full: 'Full manuscript', chapters: 'First chapters', pages: 'First pages', words: 'First words' };
const DEFAULT_COUNT: Record<Exclude<Kind, 'full'>, number> = { chapters: 3, pages: 50, words: 10000 };

interface SmfExportModalProps {
  open: boolean;
  subject: string;
  combinedMarkdown: string;
  onClose: () => void;
  onExport: (request: ExtentRequest) => void | Promise<void>;
}

export function SmfExportModal({ open, subject, combinedMarkdown, onClose, onExport }: SmfExportModalProps) {
  const [kind, setKind] = useState<Kind>('full');
  const [count, setCount] = useState(3);
  const [building, setBuilding] = useState(false);

  const structure = useMemo(() => (open ? buildManuscriptStructure(combinedMarkdown) : null), [open, combinedMarkdown]);

  const request: ExtentRequest = kind === 'full' ? { kind: 'full' } : { kind, count: Math.max(1, count) };
  const summary = useMemo(() => (structure ? summarizeExtent(structure, request) : null), [structure, kind, count]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const chooseKind = (k: Kind) => { setKind(k); if (k !== 'full') setCount(DEFAULT_COUNT[k]); };

  const handleDownload = () => {
    setBuilding(true);
    setTimeout(async () => {
      try { await onExport(request); onClose(); }
      finally { setBuilding(false); }
    }, 50);
  };

  const unit = kind === 'chapters' ? 'chapters' : kind === 'pages' ? 'pages' : 'words';

  return (
    <div className="modal-overlay visible" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Submission manuscript (SMF)</span>
          <button className="modal-close" onClick={onClose} aria-label="Close"><XIcon size={14} /></button>
        </div>

        <div className="modal-body">
          <div className="share-meta"><strong style={{ color: 'var(--ink)' }}>{subject}</strong></div>
          <p className="share-mode-desc">Standard Manuscript Format — 12pt Times New Roman, double-spaced, 1″ margins. How much should the file include?</p>

          <div className="share-toggle-row">
            {(['full', 'chapters', 'pages', 'words'] as Kind[]).map(k => (
              <button key={k} className={`share-toggle-btn${kind === k ? ' active' : ''}`} onClick={() => chooseKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          {kind !== 'full' && (
            <div className="smf-extent-input">
              <label>First&nbsp;
                <input type="number" min={1} value={count}
                  onChange={(e) => setCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
                &nbsp;{unit}
              </label>
              {kind !== 'words' && <span className="smf-extent-hint">{kind === 'pages' ? '1 page ≈ 250 words (SMF convention)' : ''}</span>}
            </div>
          )}

          {summary && (
            <div className="smf-extent-summary">
              {summary.totalChapters === 0 ? (
                <span>No chapters detected in this draft.</span>
              ) : kind === 'full' ? (
                <span>Exports the complete manuscript — {summary.totalChapters} chapter{summary.totalChapters === 1 ? '' : 's'}, ≈{summary.pages} pages, {summary.words.toLocaleString('en-US')} words.</span>
              ) : (
                <>
                  <strong>{summary.endLabel}.</strong>{' '}
                  <span>{summary.chapters} chapter{summary.chapters === 1 ? '' : 's'} · ≈{summary.pages} pages · {summary.words.toLocaleString('en-US')} words{summary.truncated ? '' : ' (the whole manuscript fits)'}.</span>
                  <span className="smf-extent-total"> Full manuscript: {summary.totalChapters} chapters, {summary.totalWords.toLocaleString('en-US')} words.</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-primary-btn" onClick={handleDownload} disabled={building || (summary?.totalChapters ?? 0) === 0}>
            {building ? 'Building…' : 'Download SMF'}
          </button>
        </div>
      </div>
    </div>
  );
}
