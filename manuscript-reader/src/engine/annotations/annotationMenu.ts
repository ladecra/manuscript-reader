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

export interface AnnotationMenuItem {
  type: AnnotationType;
  label: string;
}

// ── The canonical marking taxonomy — single source for BOTH reading surfaces ──
// The in-app SelectionPopup (React) and the shared-reader runtime (vanilla, inlined
// into the exported HTML) must show the same choices, or the two surfaces drift.
// A tweak here reaches both. Per redesign-reader.html: a thin default every reader
// sees, plus an "Editorial" expander of craft signals for critique partners.

/** The thin default: a highlight and two ways to say something. */
export const ANNOTATION_PRIMARY: AnnotationMenuItem[] = [
  { type: 'highlight', label: 'Highlight' },
  { type: 'note',      label: 'Note' },
  { type: 'question',  label: 'Question' },
];

/** Craft signals behind the "Editorial" expander — one tap, no writing required.
 *  Casual readers never open this; the engine can also classify a plain note later. */
export const ANNOTATION_EDITORIAL: AnnotationMenuItem[] = [
  { type: 'pacing',     label: 'Pacing' },
  { type: 'continuity', label: 'Continuity' },
  { type: 'voice',      label: 'Voice' },
  { type: 'structural', label: 'Structure' },
];

/** The full offered set, in menu order (primary, then editorial). Bookmark is
 *  deliberately absent — it's a private reading aid, not a feedback type. */
export const ANNOTATION_MENU_ITEMS: AnnotationMenuItem[] = [
  ...ANNOTATION_PRIMARY,
  ...ANNOTATION_EDITORIAL,
];

/** Short menu label for a type (falls back to ANNOTATION_LABELS via the caller). */
export function annotationMenuLabel(type: AnnotationType): string | undefined {
  return ANNOTATION_MENU_ITEMS.find(i => i.type === type)?.label;
}
