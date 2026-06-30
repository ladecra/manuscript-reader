// ─── Studio format metadata — author-facing edition copy, one source ──────────
// Shared by the hero edition picker, the assembly rail header, and the export
// modal so the wording can't drift. `StudioFormatId` is the UI export set; it maps
// 1:1 onto the engine's `ArtifactFormat` (which also carries `pdf` for the
// forthcoming print route). Icons live here (not the pure engine) by design.

import { BookIcon, ExportTrayIcon, LayersIcon } from '../ui/Icons';
import { PrintEditionArt, EbookEditionArt, AgentSubmissionArt } from './studioEditionArt';

export type StudioFormatId = 'docx' | 'epub' | 'smf' | 'md';

export interface StudioFormatMeta {
  id: StudioFormatId;
  /** Edition name in the hero picker, e.g. "Print edition". */
  edition: string;
  /** One-line subtitle under the edition name. */
  editionSub: string;
  /** Card line 1 — the format produced, e.g. "Publication-quality DOCX". */
  formatLine: string;
  /** Card line 2 — the spec / targets, e.g. "5.5 × 8.5 · KDP interior". */
  specLine: string;
  /** Edition illustration for the picker card (line-art object). */
  Art?: typeof PrintEditionArt;
  /** Rail header title for the selected edition, e.g. "Print edition (Word)". */
  railTitle: string;
  Icon: typeof BookIcon;
  /** Export button / modal confirm label. */
  primaryLabel: string;
}

export const STUDIO_FORMATS: StudioFormatMeta[] = [
  {
    id: 'docx',
    edition: 'Print edition',
    editionSub: '5.5×8.5 · KDP interior via Word',
    formatLine: 'Publication-quality DOCX',
    specLine: '5.5 × 8.5 · KDP interior',
    Art: PrintEditionArt,
    railTitle: 'Print edition (Word)',
    Icon: ExportTrayIcon,
    primaryLabel: 'Download publication DOCX',
  },
  {
    id: 'epub',
    edition: 'Ebook edition',
    editionSub: 'Kindle, Apple Books, Kobo',
    formatLine: 'EPUB 3',
    specLine: 'Kindle · Apple Books · Kobo',
    Art: EbookEditionArt,
    railTitle: 'Ebook edition (EPUB)',
    Icon: BookIcon,
    primaryLabel: 'Download EPUB',
  },
  {
    id: 'smf',
    edition: 'Agent submission',
    editionSub: 'Manuscript format · extent options',
    formatLine: 'Standard manuscript format',
    specLine: 'Configurable extent',
    Art: AgentSubmissionArt,
    railTitle: 'Agent submission (SMF)',
    Icon: LayersIcon,
    primaryLabel: 'Configure & download SMF',
  },
  {
    id: 'md',
    edition: 'Markdown',
    editionSub: 'Pandoc & toolchains',
    formatLine: 'Markdown',
    specLine: 'Pandoc & toolchains',
    railTitle: 'Markdown',
    Icon: ExportTrayIcon,
    primaryLabel: 'Download Markdown',
  },
];

/** Editions offered in the hero picker. Markdown is demoted to "Advanced export"
 *  (no assembly stage) per the flow review — it isn't a finished-book edition. */
export const PRIMARY_EDITIONS: StudioFormatId[] = ['docx', 'epub', 'smf'];

export const studioFormat = (id: StudioFormatId): StudioFormatMeta =>
  STUDIO_FORMATS.find(f => f.id === id) ?? STUDIO_FORMATS[0];
