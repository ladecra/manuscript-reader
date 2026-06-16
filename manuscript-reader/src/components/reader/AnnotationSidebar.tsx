import React, { useRef } from 'react';
import type { Annotation, AnnotationType } from '../../engine/types';
import { ANNOTATION_TYPES, ANNOTATION_LABELS, ANNOTATION_COLORS } from '../../engine/types';
import type { ReaderExportPayload } from '../../engine/sessions';
import { XIcon } from '../ui/Icons';

interface AnnotationSidebarProps {
  open: boolean;
  annotations: Annotation[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onJumpTo: (id: string) => void;
  onImport: (payload: ReaderExportPayload) => void;
}

export function AnnotationSidebar({
  open,
  annotations,
  onClose,
  onDelete,
  onJumpTo,
  onImport,
}: AnnotationSidebarProps) {
  const [activeFilter, setActiveFilter] = React.useState<AnnotationType | 'all'>('all');
  const importRef = useRef<HTMLInputElement>(null);

  const filtered = (activeFilter === 'all' ? [...annotations] : annotations.filter(a => a.type === activeFilter))
    .sort((a, b) => (a.chapterIndex - b.chapterIndex) || (a.createdAt - b.createdAt));

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        // Normalize to a ReaderExportPayload: a bare array is a legacy export
        // (annotations only); the full object carries session fields too.
        let payload: ReaderExportPayload;
        if (Array.isArray(parsed)) { payload = { annotations: parsed }; }
        else if (parsed && Array.isArray(parsed.annotations)) { payload = parsed; }
        else throw new Error('invalid');
        onImport(payload);
      } catch {
        alert('Could not read annotation file.');
      }
      if (importRef.current) importRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  return (
    <div id="ann-sidebar" className={open ? 'open' : ''}>
      <div className="ann-sidebar-header">
        <div className="ann-sidebar-title-row">
          <span className="ann-sidebar-title">Annotations</span>
          <button id="ann-close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>

        <div className="ann-filter-tabs" id="ann-filter-tabs">
          {(['all', ...ANNOTATION_TYPES] as const).map(t => (
            <button
              key={t}
              className={`ann-tab${activeFilter === t ? ' active' : ''}`}
              data-filter={t}
              onClick={() => setActiveFilter(t)}
            >
              {t === 'all' ? 'All' : ANNOTATION_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="ann-list" id="ann-list">
        {filtered.length === 0 ? (
          <div className="ann-empty">
            {annotations.length === 0
              ? 'Select any passage to annotate.'
              : 'No annotations of this type.'}
          </div>
        ) : (
          filtered.map(ann => (
            <AnnotationItem
              key={ann.id}
              ann={ann}
              onDelete={() => onDelete(ann.id)}
              onJump={() => onJumpTo(ann.id)}
            />
          ))
        )}
      </div>

      <div className="ann-sidebar-footer">
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
          <button
            className="text-btn"
            style={{ fontSize: '10px', padding: '6px 0' }}
            onClick={() => importRef.current?.click()}
          >
            Import beta reader feedback
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
            id="ann-import-input"
          />
        </div>
      </div>
    </div>
  );
}

function AnnotationItem({
  ann,
  onDelete,
  onJump,
}: {
  ann: Annotation;
  onDelete: () => void;
  onJump: () => void;
}) {
  const loc = ann.chapterTitle ? `Ch. ${String(ann.chapterIndex).padStart(2, '0')}` : '';
  const color = ANNOTATION_COLORS[ann.type];

  return (
    <div
      className={`ann-item${ann.imported ? ' ann-imported' : ''}`}
      onClick={onJump}
      style={ann.imported ? { boxShadow: `inset 3px 0 0 ${ANNOTATION_COLORS.bookmark}` } : {}}
    >
      <div className="ann-item-header">
        <span className="ann-dot" style={{ background: color }} />
        <span className="ann-type-label">{ANNOTATION_LABELS[ann.type]}</span>
        {ann.readerName && (
          <span className="ann-reader">{ann.readerName}</span>
        )}
        <span className="ann-loc">{loc}</span>
        <button
          className="ann-item-more"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Remove annotation"
        >
          <XIcon size={12} />
        </button>
      </div>
      {ann.quote && <div className="ann-quote">"{ann.quote}"</div>}
      {ann.note && <div className="ann-note-text">{ann.note}</div>}
    </div>
  );
}
