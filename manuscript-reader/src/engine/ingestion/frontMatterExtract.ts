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

import type { ManuscriptStructure, MatterSection } from '../types';

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

export function extractFrontMatterCandidates(structure: ManuscriptStructure): FrontMatterCandidates {
  const front = structure.frontMatter;
  const out: FrontMatterCandidates = {};

  // ── Title page: author ("by …"), publisher ──
  const titlePage = firstOf(front, 'title-page');
  if (titlePage) {
    const text = sectionText(titlePage);
    const by = /^\s*(?:by|written by)\s+(.+?)\s*$/im.exec(text);
    if (by) out.author = clean(by[1]);
    const pub = /^\s*(?:published by|publisher:?)\s+(.+?)\s*$/im.exec(text);
    if (pub) out.publisher = clean(pub[1]);
  }

  // ── Copyright page: ©/year/holder, ISBN, edition, publication date ──
  const cr = firstOf(front, 'copyright');
  if (cr) {
    const text = sectionText(cr);
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
  }

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
