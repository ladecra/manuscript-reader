// ─── Export Palette ────────────────────────────────────────────────────────────
// Single source of truth for all hardcoded color values used across export
// engines. Annotation colors (HTML format) live in ../types as ANNOTATION_COLORS
// and should be imported from there. This module provides everything else:
// the base ink/page palette in both HTML and DOCX wire formats, the
// DOCX-specific muted annotation variants, plural display labels, and the
// shared Google Fonts link tag.

import type { AnnotationType } from '../types';

// ── Base palette · HTML/CSS format (matches :root.light in index.css) ─────────
export const INK   = '#1B1A17';   // --ink
export const HEAD  = '#2C2A26';   // --on-surface
export const MUTED = '#6B6760';   // --muted
export const DIM   = '#A09B90';   // --dim
export const RULE  = '#E8E4DB';   // --border
export const PAGE  = '#FAF9F6';   // --bg (light)
export const QUOTE = '#5A5750';   // no direct token; mid-tone for body prose

// ── Base palette · DOCX format (no '#' prefix — required by the docx library) ─
// Slightly warmer rule/paper than the screen values to compensate for print gamma.
export const DOCX_INK   = '1B1A17';
export const DOCX_HEAD  = '2C2A26';
export const DOCX_BODY  = '3D3A36';
export const DOCX_META  = '6B6760';
export const DOCX_RULE  = 'E4E0D6';   // warmer than screen RULE for print
export const DOCX_QUOTE = '5A5750';
export const DOCX_LABEL = 'A09B90';
export const DOCX_PAPER = 'F7F5F0';   // warmer than screen PAGE for print

// ── Annotation colors · DOCX format ───────────────────────────────────────────
// Slightly muted/adjusted for print legibility. For screen (HTML) use
// ANNOTATION_COLORS from '../types' directly.
export const ANN_COLOR_DOCX: Record<AnnotationType, string> = {
  highlight:  'C79A3A',
  note:       '8A857A',
  bookmark:   '6366F1',
  question:   'EF6461',
  continuity: '2F9E7D',
  structural: 'FB923C',
  pacing:     '38BDF8',
  voice:      'C084FC',
};

// ── Annotation display labels · plural form (for charts, tables, legends) ─────
export const ANN_LABEL_PLURAL: Record<AnnotationType, string> = {
  highlight:  'Highlights',
  note:       'Notes',
  bookmark:   'Bookmarks',
  question:   'Questions',
  continuity: 'Continuity Flags',
  structural: 'Structural',
  pacing:     'Pacing',
  voice:      'Voice / Tone',
};

// ── Google Fonts · shared by standalone HTML exports ──────────────────────────
// EB Garamond for prose / editorial headings; Hanken Grotesk for UI labels.
export const GOOGLE_FONTS_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">';
