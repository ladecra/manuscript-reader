import { useMemo } from 'react';
import { BookIcon, CheckIcon, DownloadIcon, ExportTrayIcon, LayersIcon } from '../ui/Icons';

export type StudioFormatId = 'docx' | 'epub' | 'smf' | 'md';

const FORMATS: {
  id: StudioFormatId;
  label: string;
  sub: string;
  Icon: typeof BookIcon;
  primaryLabel: string;
}[] = [
  {
    id: 'docx',
    label: 'Word Document (.docx)',
    sub: '5.5×8.5 trim, running heads, regenerated front matter',
    Icon: ExportTrayIcon,
    primaryLabel: 'Download publication DOCX',
  },
  {
    id: 'epub',
    label: 'EPUB or KDP ebook',
    sub: 'Reflowable — Kindle, Apple Books, Kobo',
    Icon: BookIcon,
    primaryLabel: 'Download EPUB',
  },
  {
    id: 'smf',
    label: 'Agent submission',
    sub: 'Standard Manuscript Format. Choose full manuscript or specify number of chapters, pages, or words',
    Icon: LayersIcon,
    primaryLabel: 'Configure & download SMF',
  },
  {
    id: 'md',
    label: 'Markdown',
    sub: 'Plain text + YAML for Pandoc and toolchains, ideal for collaboration with AI agents',
    Icon: ExportTrayIcon,
    primaryLabel: 'Download Markdown',
  },
];

interface StudioFormatRailProps {
  selectedFormat: StudioFormatId;
  onSelectFormat: (id: StudioFormatId) => void;
  canExport: boolean;
  disabledHint: string;
  footerLine: string;
  footerAction?: { label: string; onClick: () => void };
  onPrimary: () => void;
}

/** Publishable formats as hub instrument rows + one gold download action. */
export function StudioFormatRail({
  selectedFormat,
  onSelectFormat,
  canExport,
  disabledHint,
  footerLine,
  footerAction,
  onPrimary,
}: StudioFormatRailProps) {
  const primary = useMemo(
    () => FORMATS.find(f => f.id === selectedFormat) ?? FORMATS[0],
    [selectedFormat],
  );

  return (
    <aside className="hub-tools studio-format-rail">
      <nav className="hub-tools-nav" aria-label="Publishable formats">
        <div className="instrument-group-label hub-tools-eyebrow">Formats</div>
        <div className="instrument-nav hub-tools-group-nav">
          {FORMATS.map(f => (
            <button
              key={f.id}
              type="button"
              className={`instrument-item instrument-item--tool studio-format-item${selectedFormat === f.id ? ' active' : ''}`}
              onClick={() => onSelectFormat(f.id)}
              disabled={!canExport}
              title={!canExport ? disabledHint : undefined}
            >
              <span className="instrument-item-icon"><f.Icon size={15} /></span>
              <span className="instrument-item-stack">
                <span className="instrument-item-label">{f.label}</span>
                <span className="instrument-item-sub">{f.sub}</span>
              </span>
              <span className="instrument-item-chevron"><DownloadIcon size={14} /></span>
            </button>
          ))}
        </div>
      </nav>

      <div className="studio-format-actions">
        <button
          type="button"
          className="hub-continue-btn btn-fill studio-format-primary"
          disabled={!canExport}
          title={!canExport ? disabledHint : undefined}
          onClick={onPrimary}
        >
          {primary.primaryLabel}
        </button>
      </div>

      <div className="hub-tools-footer studio-format-footer">
        <CheckIcon size={12} className="hub-tools-saved-icon" aria-hidden="true" />
        <span className="studio-format-footer-text">{footerLine}</span>
        {footerAction && (
          <button type="button" className="studio-format-footer-link" onClick={footerAction.onClick}>
            {footerAction.label}
          </button>
        )}
      </div>
    </aside>
  );
}

export { FORMATS as STUDIO_FORMATS };
