import { useState, useEffect, useRef } from 'react';
import type { AnnotationType } from '../../engine/types';
import { ANNOTATION_LABELS } from '../../engine/types';
import {
  ANNOTATION_MENU_GLYPHS,
  ANNOTATION_NOTE_TYPES,
  ANNOTATION_PRIMARY as PRIMARY,
  ANNOTATION_EDITORIAL as EDITORIAL,
} from '../../engine/annotations/annotationMenu';

interface SelectionPopupProps {
  visible: boolean;
  position: { left: number; top: number };
  onSave: (type: AnnotationType, note: string) => void;
  onClose: () => void;
}

function Glyph({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export function SelectionPopup({ visible, position, onSave, onClose }: SelectionPopupProps) {
  const [pendingType, setPendingType] = useState<AnnotationType | null>(null);
  const [editorialOpen, setEditorialOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset the transient composer/expander state when the popup hides.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) {
      setPendingType(null);
      setEditorialOpen(false);
      setNoteText('');
    }
  }

  useEffect(() => {
    if (pendingType && textareaRef.current) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [pendingType]);

  const handleType = (type: AnnotationType) => {
    if (ANNOTATION_NOTE_TYPES.has(type)) setPendingType(type);
    else onSave(type, ''); // highlight saves on the tap
  };

  const handleSave = () => {
    if (!pendingType) return;
    onSave(pendingType, noteText.trim());
    setPendingType(null);
    setNoteText('');
  };

  if (!visible) return null;

  return (
    <div
      id="selection-popup"
      className="visible"
      style={{ left: position.left, top: position.top }}
      onMouseDown={e => e.stopPropagation()}
    >
      {!pendingType && (
        <>
          <div className="anntool">
            {PRIMARY.map(({ type, label }) => (
              <button key={type} className="anntool-btn" onClick={() => handleType(type)}>
                <Glyph d={ANNOTATION_MENU_GLYPHS[type]} />{label}
              </button>
            ))}
            <span className="anntool-div" aria-hidden="true" />
            <button
              className={`anntool-btn anntool-more${editorialOpen ? ' open' : ''}`}
              onClick={() => setEditorialOpen(o => !o)}
              aria-expanded={editorialOpen}
            >
              Editorial
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
          {editorialOpen && (
            <div className="edrow">
              {EDITORIAL.map(({ type, label }) => (
                <button key={type} className="edchip" onClick={() => handleType(type)}>
                  <span className="edchip-dot" aria-hidden="true" />{label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {pendingType && (
        <div className="composer visible">
          <div className="composer-head">
            <Glyph d={ANNOTATION_MENU_GLYPHS[pendingType]} size={13} />
            {ANNOTATION_LABELS[pendingType]}
          </div>
          <textarea
            ref={textareaRef}
            className="composer-body"
            placeholder={`Add a ${ANNOTATION_LABELS[pendingType].toLowerCase()}…`}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
              if (e.key === 'Escape') onClose();
            }}
          />
          <div className="composer-foot">
            <span className="composer-anchor">Anchored to your selection</span>
            <div className="composer-actions">
              <button className="composer-cancel" onClick={onClose}>Cancel</button>
              <button className="composer-save" onClick={handleSave}>Save ⌘↵</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
