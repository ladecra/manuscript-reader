import { useState, useEffect, useRef } from 'react';
import type { AnnotationType } from '../../engine/types';
import { ANNOTATION_LABELS, ANNOTATION_COLORS } from '../../engine/types';

interface SelectionPopupProps {
  visible: boolean;
  position: { left: number; top: number };
  onSave: (type: AnnotationType, note: string) => void;
  onClose: () => void;
}

const NOTE_TYPES = new Set<AnnotationType>(['note', 'question', 'continuity', 'structural']);

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
    if (NOTE_TYPES.has(type)) {
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

  // Two rows of annotation types
  const row1: AnnotationType[] = ['highlight', 'bookmark'];
  const row2: AnnotationType[] = ['note', 'question', 'continuity', 'structural'];

  return (
    <div
      id="selection-popup"
      className="visible"
      style={{ left: position.left, top: position.top }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="popup-row">
        {row1.map(t => (
          <button key={t} className={`ann-type-btn${pendingType === t ? ' active-type' : ''}`} data-type={t} onClick={() => handleType(t)}>
            <span className="type-dot" style={{ background: ANNOTATION_COLORS[t] }} />
            {ANNOTATION_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="popup-row">
        {row2.map(t => (
          <button key={t} className={`ann-type-btn${pendingType === t ? ' active-type' : ''}`} data-type={t} onClick={() => handleType(t)}>
            <span className="type-dot" style={{ background: ANNOTATION_COLORS[t] }} />
            {ANNOTATION_LABELS[t]}
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
            <button id="popup-cancel" className="text-btn" onClick={onClose}>Cancel</button>
            <button id="popup-save" className="outline-btn" style={{ padding: '5px 12px', fontSize: '11px' }} onClick={handleSave}>
              Save ⌘↵
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
