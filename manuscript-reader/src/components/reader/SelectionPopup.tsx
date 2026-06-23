import { useState, useEffect, useRef } from 'react';
import type { AnnotationType } from '../../engine/types';
import { ANNOTATION_LABELS, ANNOTATION_COLORS } from '../../engine/types';

interface SelectionPopupProps {
  visible: boolean;
  position: { left: number; top: number };
  onSave: (type: AnnotationType, note: string) => void;
  onClose: () => void;
}

// Types that open a note field before saving; the rest save on click.
const NOTE_TYPES = new Set<AnnotationType>(['note', 'question', 'continuity', 'structural', 'pacing', 'voice']);

// Monochrome line glyphs (currentColor). Small, quiet — the command-menu idiom.
function Glyph({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const GLYPHS: Record<AnnotationType, string> = {
  highlight:  'M4 19h16|M8 15l8-8 3 3-8 8H5v-3z',                       // marker
  question:   'M9 9a3 3 0 1 1 4 2.5c-.8.6-1 1-1 2|M12 17h.01',         // question
  note:       'M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z',               // pencil
  bookmark:   'M7 4h10v16l-5-4-5 4z',                                  // bookmark
  pacing:     'M12 7v5l3 2|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',      // clock
  voice:      'M5 10v4|M9 6v12|M13 8v8|M17 5v14|M21 10v4',             // waveform
  continuity: 'M9 12h6|M8 8a4 4 0 0 0 0 8h1|M16 16a4 4 0 0 0 0-8h-1',  // link
  structural: 'M6 3v18|M6 4h11l-2 3 2 3H6',                            // flag
};

// 2×4 grid, filled row-by-row, in the order the design specifies:
//   Highlight  · Pacing
//   Question   · Voice & Tone
//   Note       · Continuity
//   Bookmark   · Structural Marker
const MENU: { type: AnnotationType; label: string }[] = [
  { type: 'highlight',  label: 'Highlight' },
  { type: 'pacing',     label: 'Pacing' },
  { type: 'question',   label: 'Question' },
  { type: 'voice',      label: 'Voice & Tone' },
  { type: 'note',       label: 'Note' },
  { type: 'continuity', label: 'Continuity' },
  { type: 'bookmark',   label: 'Bookmark' },
  { type: 'structural', label: 'Structural Marker' },
];

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

  return (
    <div
      id="selection-popup"
      className="visible"
      style={{ left: position.left, top: position.top }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="popup-grid">
        {MENU.map(({ type, label }) => (
          <button
            key={type}
            className={`ann-type-btn${pendingType === type ? ' active-type' : ''}`}
            data-type={type}
            onClick={() => handleType(type)}
          >
            <span className="ann-type-icon"><Glyph d={GLYPHS[type]} /></span>
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
