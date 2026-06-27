import type { AnnotationType } from '../types';

/** Types that open a note field before saving; the rest save on click. */
export const ANNOTATION_NOTE_TYPES: ReadonlySet<AnnotationType> = new Set([
  'note', 'question', 'continuity', 'structural', 'pacing', 'voice',
]);

/** Monochrome line glyph paths (pipe-separated for multi-path SVGs). */
export const ANNOTATION_MENU_GLYPHS: Record<AnnotationType, string> = {
  highlight:  'M4 19h16|M8 15l8-8 3 3-8 8H5v-3z',
  question:   'M9 9a3 3 0 1 1 4 2.5c-.8.6-1 1-1 2|M12 17h.01',
  note:       'M4 20l4-1L19 8a2 2 0 0 0-3-3L5 16l-1 4z',
  bookmark:   'M7 4h10v16l-5-4-5 4z',
  pacing:     'M12 7v5l3 2|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  voice:      'M5 10v4|M9 6v12|M13 8v8|M17 5v14|M21 10v4',
  continuity: 'M9 12h6|M8 8a4 4 0 0 0 0 8h1|M16 16a4 4 0 0 0 0-8h-1',
  structural: 'M6 3v18|M6 4h11l-2 3 2 3H6',
};

/** 2×4 grid order — matches SelectionPopup. */
export const ANNOTATION_MENU_ITEMS: { type: AnnotationType; label: string }[] = [
  { type: 'highlight',  label: 'Highlight' },
  { type: 'pacing',     label: 'Pacing' },
  { type: 'question',   label: 'Question' },
  { type: 'voice',      label: 'Voice & Tone' },
  { type: 'note',       label: 'Note' },
  { type: 'continuity', label: 'Continuity' },
  { type: 'bookmark',   label: 'Bookmark' },
  { type: 'structural', label: 'Structural Marker' },
];
