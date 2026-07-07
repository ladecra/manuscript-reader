// ─── Front-matter metadata extraction (candidates, NOT facts) ─────────────────
// Reads the retained front matter (classify-and-keep) and PROPOSES publishing
// values — author, ISBN, copyright year/holder, edition, publication date,
// dedication. Pure and browser-independent.
//
// IMPORTANT — these are CANDIDATES, never authoritative. Authors arrive with KDP
// templates full of placeholders ("Copyright © 20XX Your Name", a sample ISBN), so
// the contract is: the consumer (the publishing-details hub) fills only EMPTY fields,
// never overwrites what the author set, and surfaces the proposals for review. This
// module makes no decisions about application — it only reads what the page says.

import type { ManuscriptStructure, MatterSection, PublishingMetadata } from '../types';

/** Candidate publishing values detected in the front matter. Every field optional;
 *  absent = nothing confidently detected. Keys mirror PublishingMetadata (+ author,
 *  which lives on the manuscript, not PublishingMetadata). */
export interface FrontMatterCandidates {
  author?: string;
  isbn?: string;
  edition?: string;
  publicationDate?: string;
  copyrightYear?: string;
  copyrightHolder?: string;
  publisher?: string;
  dedication?: string;
}

const sectionText = (s: MatterSection): string => s.blocks.map(b => b.text).join('\n').trim();
const firstOf = (sections: MatterSection[], role: string): MatterSection | undefined =>
  sections.find(s => s.role === role);

const clean = (v: string | undefined): string | undefined => {
  const t = v?.replace(/\s+/g, ' ').trim();
  return t || undefined;
};

/** A value that is obviously a template placeholder, not a real datum. */
function isPlaceholder(v: string): boolean {
  return /\b(20XX|XXXX|your name|author name|title here|publisher name|0{3,}|x{3,})\b/i.test(v)
    || /978-?[\dX]-?0{3,}/i.test(v);
}

const keep = (v: string | undefined): string | undefined =>
  v && !isPlaceholder(v) ? v : undefined;

/** Parse the copyright-block fields (©/year/holder, ISBN, edition, publication
 *  date) out of a block of prose. Reused for BOTH a real `copyright`-role section
 *  and the title-page fallback — many self-published manuscripts (and flattened
 *  imports) fold the whole copyright notice into the title page as body prose, so
 *  there is no distinct copyright section to read. Returns only what it finds. */
function parseCopyrightFields(text: string): Partial<FrontMatterCandidates> {
  const out: Partial<FrontMatterCandidates> = {};
  const cYear = /(?:©|\(c\)|copyright)\s*(?:©|\(c\)\s*)?(\d{4})/i.exec(text);
  if (cYear) out.copyrightYear = cYear[1];
  // "© 2025 Jane Marlowe" / "Copyright 2025 by Jane Marlowe" → holder
  const holder = /(?:©|\(c\)|copyright)\s*(?:©\s*)?\d{4}\s+(?:by\s+)?([^.,\n©]+?)(?:[.,\n]|\s+all rights|$)/i.exec(text);
  if (holder) out.copyrightHolder = clean(holder[1]);
  const isbn = /ISBN(?:-1[03])?[:\s]*((?:97[89][\s\-–]?)?[\d][\d\s\-–X]{8,16}[\dX])/i.exec(text);
  if (isbn) out.isbn = clean(isbn[1].replace(/\s/g, ''));
  const ed = /\b((?:first|second|third|fourth|fifth|\d+(?:st|nd|rd|th))\s+edition)\b/i.exec(text);
  if (ed) out.edition = clean(ed[1]);
  const date = /\b(?:(?:first|second|third|\d+(?:st|nd|rd|th))\s+(?:edition|printing)[,\s]+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i.exec(text);
  if (date) out.publicationDate = clean(date[1]);
  return out;
}

/** Fill only the still-empty candidate keys from `src`. */
function fill(out: FrontMatterCandidates, src: Partial<FrontMatterCandidates>): void {
  for (const [k, v] of Object.entries(src) as [keyof FrontMatterCandidates, string | undefined][]) {
    if (v && out[k] == null) out[k] = v;
  }
}

export function extractFrontMatterCandidates(structure: ManuscriptStructure): FrontMatterCandidates {
  const front = structure.frontMatter;
  const out: FrontMatterCandidates = {};

  // ── Title page: author ("by …"), publisher ──
  const titlePage = firstOf(front, 'title-page');
  const titlePageText = titlePage ? sectionText(titlePage) : '';
  if (titlePage) {
    const by = /^\s*(?:by|written by)\s+(.+?)\s*$/im.exec(titlePageText);
    if (by) out.author = clean(by[1]);
    const pub = /^\s*(?:published by|publisher:?)\s+(.+?)\s*$/im.exec(titlePageText);
    if (pub) out.publisher = clean(pub[1]);
  }

  // ── Copyright page: ©/year/holder, ISBN, edition, publication date ──
  const cr = firstOf(front, 'copyright');
  if (cr) fill(out, parseCopyrightFields(sectionText(cr)));
  // Fallback: the copyright notice frequently lives inside the title-page prose
  // (no separate copyright section) — read the same fields there for what's missing.
  if (titlePageText) fill(out, parseCopyrightFields(titlePageText));

  // ── Author fallback: the copyright holder, when the title page gave none ──
  if (!out.author && out.copyrightHolder) out.author = out.copyrightHolder;

  // ── Dedication: the section's prose verbatim ──
  const ded = firstOf(front, 'dedication');
  if (ded) out.dedication = clean(sectionText(ded));

  // Drop template placeholders so they never masquerade as real data.
  out.isbn = keep(out.isbn);
  out.copyrightHolder = keep(out.copyrightHolder);
  out.author = keep(out.author);
  out.publisher = keep(out.publisher);

  // Prune undefined keys for a tidy candidate object.
  (Object.keys(out) as (keyof FrontMatterCandidates)[]).forEach(k => { if (out[k] == null) delete out[k]; });
  return out;
}

// ─── Applying candidates (empty-fields-only, never overwrites author input) ────
// The consumer-side contract from the module header, made concrete: the
// Publishing Studio proposes detected values for review, then fills ONLY the
// fields the author has left empty. `author` lives on the manuscript, the rest on
// PublishingMetadata — both are handled here so a caller applies one merge.

/** Where a candidate field lands. `author` is on the manuscript; all others on
 *  PublishingMetadata (keys are shared by name). */
export type CandidateField = keyof FrontMatterCandidates;

const CANDIDATE_LABELS: Record<CandidateField, string> = {
  author: 'Author',
  isbn: 'ISBN',
  edition: 'Edition',
  publicationDate: 'Publication date',
  copyrightYear: 'Copyright year',
  copyrightHolder: 'Copyright holder',
  publisher: 'Publisher',
  dedication: 'Dedication',
};

/** Current values a merge would write into — `author` plus the publishing fields. */
export interface FrontMatterTarget {
  author?: string;
  publishing: PublishingMetadata;
}

/** One reviewable proposal: a detected value for a field the author left empty. */
export interface FrontMatterProposal {
  field: CandidateField;
  label: string;
  value: string;
}

const isEmpty = (v: string | undefined): boolean => !v || !v.trim();

/** Read the target's current value for a candidate field (author off the
 *  manuscript, everything else off PublishingMetadata). */
function currentValue(target: FrontMatterTarget, field: CandidateField): string | undefined {
  if (field === 'author') return target.author;
  return target.publishing[field];
}

/** The detected values for fields the author has NOT filled — the review list.
 *  Empty when nothing is both detected and missing. Order follows CANDIDATE_LABELS. */
export function proposeFrontMatter(
  target: FrontMatterTarget,
  candidates: FrontMatterCandidates,
): FrontMatterProposal[] {
  return (Object.keys(CANDIDATE_LABELS) as CandidateField[])
    .filter(field => !isEmpty(candidates[field]) && isEmpty(currentValue(target, field)))
    .map(field => ({ field, label: CANDIDATE_LABELS[field], value: candidates[field]!.trim() }));
}

/** Apply detected candidates into empty fields only — never overwriting author
 *  input — and return the merged target. Pure: returns fresh objects, mutates
 *  nothing. Pass an explicit `fields` to apply a subset (a per-field accept);
 *  omit it to apply every proposal. */
export function applyFrontMatterCandidates(
  target: FrontMatterTarget,
  candidates: FrontMatterCandidates,
  fields?: CandidateField[],
): FrontMatterTarget {
  const proposals = proposeFrontMatter(target, candidates);
  const allow = fields ? new Set(fields) : null;
  const next: FrontMatterTarget = { author: target.author, publishing: { ...target.publishing } };
  for (const { field, value } of proposals) {
    if (allow && !allow.has(field)) continue;
    if (field === 'author') next.author = value;
    else next.publishing[field] = value;
  }
  return next;
}
