import { useState } from 'react';
import { XIcon } from '../ui/Icons';

// A small format picker, mirroring the Share-reader flow: one entry button opens
// this toggle, the author picks a format, downloads. Generic over the formats so
// both the intelligence report (Word / web page) and the manuscript export
// (Word / Markdown) reuse it.
export interface ExportFormatOption {
  key: string;
  label: string;
  desc: string;
}

interface ExportChoiceModalProps {
  open: boolean;
  heading: string;          // modal title, e.g. "Export manuscript"
  subject: string;          // shown under the heading, e.g. the manuscript title
  formats: ExportFormatOption[];
  primaryLabel: string;     // download button text, e.g. "Download manuscript"
  onClose: () => void;
  onExport: (key: string) => void | Promise<void>;
}

export function ExportChoiceModal({ open, heading, subject, formats, primaryLabel, onClose, onExport }: ExportChoiceModalProps) {
  const [selected, setSelected] = useState(formats[0]?.key ?? '');
  const [building, setBuilding] = useState(false);

  if (!open) return null;

  const active = formats.find(f => f.key === selected) ?? formats[0];

  const handleDownload = () => {
    setBuilding(true);
    // Defer so the "Building…" label paints before the (possibly synchronous) build.
    setTimeout(async () => {
      try {
        await onExport(active.key);
        onClose();
      } finally {
        setBuilding(false);
      }
    }, 50);
  };

  return (
    <div
      className="modal-overlay visible"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{heading}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="share-meta">
            <strong style={{ color: 'var(--primary)' }}>{subject}</strong>
          </div>

          <div className="share-toggle-row">
            {formats.map(f => (
              <button
                key={f.key}
                className={`share-toggle-btn${selected === f.key ? ' active' : ''}`}
                onClick={() => setSelected(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <p className="share-mode-desc">{active?.desc}</p>
        </div>

        <div className="modal-footer">
          <button className="modal-primary-btn" onClick={handleDownload} disabled={building}>
            {building ? 'Building…' : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
