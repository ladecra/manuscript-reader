// ─── Publish readiness — what a clean artifact needs, per target format ───────
// Pure decision logic (browser-independent, testable). Requirements are
// FORMAT-DEPENDENT, not universal: an agent submission (SMF) needs no copyright
// page or front matter; a print book (DOCX/PDF → KDP) wants the full title-page
// apparatus; an ebook (EPUB) sits between. So readiness is computed against a
// target format — the Studio passes the format the author is about to export, and
// the checklist adapts. The rule lives here, in one place.

import type { ManuscriptStructure, PublishingMetadata } from '../types';

/** Export targets readiness is defined for. Mirrors the Studio's format ids
 *  (`StudioFormatId`), plus `pdf` for the forthcoming print route (same policy as
 *  DOCX). */
export type ArtifactFormat = 'docx' | 'pdf' | 'epub' | 'smf' | 'md';

/** Where an unmet item is fixed — the Studio routes the action to this pane. */
export type ReadinessAction = 'details' | 'matter';

export interface ReadinessItem {
  id: string;
  label: string;
  met: boolean;
  required: boolean;   // required for THIS format vs. recommended-but-optional
  hint: string;        // one line: what to do when unmet
  action: ReadinessAction;
}

export interface PublishReadinessInput {
  title: string;
  author?: string;
  publishing: PublishingMetadata;
  structure: ManuscriptStructure | null;
}

const has = (v?: string): boolean => !!v && !!v.trim();

/** Per-item presence + fix metadata, computed once; the format policy below
 *  decides which items appear and whether each is required. */
function itemState(input: PublishReadinessInput) {
  const { title, author, publishing, structure } = input;
  const front = structure?.frontMatter ?? [];
  const back = structure?.backMatter ?? [];
  // A dedication can come from the quick-entry metadata field OR a matter section.
  const dedication = has(publishing.dedication) || front.some(s => s.role === 'dedication');
  const aboutAuthor = back.some(s => s.role === 'about-author');

  const defs: Record<string, Omit<ReadinessItem, 'required'>> = {
    title:          { id: 'title',        label: 'Title',            met: has(title),                                                       action: 'details', hint: 'Set a title in Publishing Details.' },
    author:         { id: 'author',       label: 'Author',           met: has(author),                                                      action: 'details', hint: 'Add the author name in Publishing Details.' },
    copyright:      { id: 'copyright',    label: 'Copyright',        met: has(publishing.copyrightYear) && has(publishing.copyrightHolder), action: 'details', hint: 'Add a copyright year and holder.' },
    isbn:           { id: 'isbn',         label: 'ISBN',             met: has(publishing.isbn),                                             action: 'details', hint: 'Add the ISBN for this edition (needed for print).' },
    synopsis:       { id: 'synopsis',     label: 'Synopsis',         met: has(publishing.synopsis),                                         action: 'details', hint: 'A short synopsis flows into your exports.' },
    dedication:     { id: 'dedication',   label: 'Dedication',       met: dedication,                                                       action: 'details', hint: 'Add a dedication in Publishing Details.' },
    'about-author': { id: 'about-author', label: 'About the author', met: aboutAuthor,                                                      action: 'matter',  hint: 'Add an about-the-author page in Front & back matter.' },
  };
  return defs;
}

/** Which items each format checks, and whether each is required. Order is the
 *  display order. An item absent from a format's list simply doesn't apply there
 *  (e.g. copyright/ISBN/matter for an agent submission). */
const FORMAT_POLICY: Record<ArtifactFormat, { id: string; required: boolean }[]> = {
  // Print → KDP: the full title-page apparatus matters.
  docx: [
    { id: 'title', required: true }, { id: 'author', required: true }, { id: 'copyright', required: true },
    { id: 'isbn', required: false }, { id: 'synopsis', required: false },
    { id: 'dedication', required: false }, { id: 'about-author', required: false },
  ],
  pdf: [
    { id: 'title', required: true }, { id: 'author', required: true }, { id: 'copyright', required: true },
    { id: 'isbn', required: false }, { id: 'synopsis', required: false },
    { id: 'dedication', required: false }, { id: 'about-author', required: false },
  ],
  // Ebook: title/author required; copyright + synopsis (OPF description) recommended.
  epub: [
    { id: 'title', required: true }, { id: 'author', required: true },
    { id: 'copyright', required: false }, { id: 'synopsis', required: false }, { id: 'dedication', required: false },
  ],
  // Agent submission: just identification. No copyright page, no front/back matter.
  smf: [
    { id: 'title', required: true }, { id: 'author', required: true },
  ],
  // Toolchain markdown: minimal.
  md: [
    { id: 'title', required: true },
  ],
};

export function computePublishReadiness(
  input: PublishReadinessInput,
  format: ArtifactFormat = 'docx',
): ReadinessItem[] {
  const defs = itemState(input);
  return FORMAT_POLICY[format]
    .filter(p => defs[p.id])
    .map(p => ({ ...defs[p.id], required: p.required }));
}

export interface ReadinessSummary {
  requiredMet: boolean;       // every required element present for this format
  missingRequired: number;
  missingOptional: number;
}

export function summarizeReadiness(items: ReadinessItem[]): ReadinessSummary {
  const req = items.filter(i => i.required);
  const opt = items.filter(i => !i.required);
  return {
    requiredMet: req.every(i => i.met),
    missingRequired: req.filter(i => !i.met).length,
    missingOptional: opt.filter(i => !i.met).length,
  };
}
