import { useState, useEffect, useRef } from 'react';
import type { AnnotationType } from '../../engine/types';
import { ANNOTATION_LABELS, ANNOTATION_COLORS } from '../../engine/types';
import {
  ANNOTATION_MENU_GLYPHS,
  ANNOTATION_MENU_ITEMS,
  ANNOTATION_NOTE_TYPES,
} from '../../engine/annotations/annotationMenu';

interface SelectionPopupProps {
  visible: boolean;
  position: { left: number; top: number };
  onSave: (type: AnnotationType, note: string) => void;
  onClose: () => void;
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

export function SelectionPopup({ visible, position, onSave, onClose }: SelectionPopupProps) {
  const [pendingType, setPendingType] = useState<AnnotationType | null>(null);
  const [noteText, setNoteText] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Clear the pending selection when the popup hides (reset during render).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) {
      setPendingType(null);
      setNoteText('');
    }
  }

  useEffect(() => {
    if (pendingType && textareaRef.current) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [pendingType]);

  const handleType = (type: AnnotationType) => {
    if (ANNOTATION_NOTE_TYPES.has(type)) {
      setPendingType(type);
    } else {
      onSave(type, '');
    }
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
      <div className="popup-grid">
        {ANNOTATION_MENU_ITEMS.map(({ type, label }) => (
          <button
            key={type}
            className={`ann-type-btn${pendingType === type ? ' active-type' : ''}`}
            data-type={type}
            onClick={() => handleType(type)}
          >
            <span className="ann-type-icon"><Glyph d={ANNOTATION_MENU_GLYPHS[type]} /></span>
            <span className="ann-type-dot" style={{ background: ANNOTATION_COLORS[type] }} />
            <span className="ann-type-name">{label}</span>
          </button>
        ))}
      </div>

      {pendingType && (
        <div id="popup-note-row" className="visible">
          <textarea
            ref={textareaRef}
            id="popup-textarea"
            placeholder={`Add a ${ANNOTATION_LABELS[pendingType].toLowerCase()}…`}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
              if (e.key === 'Escape') onClose();
            }}
          />
          <div className="popup-save-row">
            <button id="popup-cancel" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button id="popup-save" className="btn-outline" style={{ padding: '5px 12px', fontSize: '11px' }} onClick={handleSave}>
              Save ⌘↵
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
