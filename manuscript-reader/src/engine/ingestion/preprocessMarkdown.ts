// ─── Ingestion Engine: Preprocessing ─────────────────────────────────────────
// Converts raw text (from DOCX conversion or paste) into normalized Markdown
// that parseMarkdown.ts can render reliably.
//
// THE FIXED ALGORITHM for forematter stripping:
// Previous versions tried to infer forematter from heading names alone,
// which failed whenever a book title or uncommon section name appeared as
// Heading 1. The new approach anchors on the first *explicitly numbered*
// chapter or recognized narrative opener (Prologue, Part I, etc.) and treats
// everything before it as forematter — regardless of what those headings say.

import type { MatterRole } from '../types';

// ─── Word/Roman numeral utilities ────────────────────────────────────────────

const NUM_WORDS: Record<string, number> = {
  one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16,
  seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40,
  fifty:50, sixty:60, seventy:70, eighty:80, ninety:90,
};

const SMALL_WORDS = new Set([
  'a','an','and','as','at','but','by','for','from','in','into','nor',
  'of','on','onto','or','over','per','the','to','up','via','vs','with',
]);

export function romanToInt(s: string): number | null {
  const m: Record<string, number> = { i:1, v:5, x:10, l:50, c:100, d:500, m:1000 };
  const lower = s.toLowerCase();
  let n = 0, prev = 0;
  for (let k = lower.length - 1; k >= 0; k--) {
    const v = m[lower[k]];
    if (!v) return null;
    if (v < prev) n -= v; else { n += v; prev = v; }
  }
  return n > 0 ? n : null;
}

export function wordsToInt(str: string): number | null {
  const parts = str.toLowerCase().split(/[\s-]+/).filter(Boolean);
  let total = 0, any = false;
  for (const p of parts) {
    if (NUM_WORDS[p] != null) { total += NUM_WORDS[p]; any = true; }
    else if (p === 'and') { /* skip */ }
    else return null;
  }
  return any ? total : null;
}

export function smartTitleCase(str: string): string {
  const words = str.trim().split(/\s+/);
  return words.map((w, i) => {
    const lower = w.toLowerCase();
    const bare = lower.replace(/[^a-z]/g, '');
    if (i !== 0 && i !== words.length - 1 && SMALL_WORDS.has(bare)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

// ─── Heading classification ───────────────────────────────────────────────────

// Known front/back matter heading names that should always be dropped.
const DROP_HEADINGS = new Set([
  'title page','half title','frontispiece','copyright','dedication',
  'epigraph','contents','table of contents','foreword','preface',
  'acknowledgment','acknowledgments','acknowledgement','acknowledgements',
  'about the author','about the book','colophon','dramatis personae',
  'cast of characters','a note on the text','translator note','glossary',
  'bibliography','index','notes','references','appendix',
  'also by','also by the same author',
]);

/** Returns true if the heading text names a known front/back matter section. */
export function isDropHeading(rawLine: string): boolean {
  let s = rawLine.replace(/^#+\s*/, '').toLowerCase();
  // Strip subtitle (after — : -)
  s = s.split(/[\u2013\u2014]|\s-\s|:/)[0];
  s = s.replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return false;
  if (DROP_HEADINGS.has(s)) return true;
  if (/^(also by|by the same author|other books|praise for|advance praise|reading group|discussion questions|book club|a note from)/.test(s)) return true;
  return false;
}

// ─── Matter classification (classify-and-keep) ────────────────────────────────
// Replaces the old strip/drop verdict with a typed role, so front/back matter is
// RETAINED (as fenced regions) and the publish-ready renderer + metadata extractor
// can use it. The decision is made once here, at ingestion, where the original
// heading is available, and frozen into the fence — a deterministic mapping, not a
// fuzzy match, so freezing it is safe. Prologue/epilogue are deliberately absent:
// they are narrative and stay body chapters.

const MATTER_ROLE_MAP: Record<string, MatterRole> = {
  'title page': 'title-page', frontispiece: 'frontispiece',
  'half title': 'half-title',
  copyright: 'copyright',
  dedication: 'dedication',
  epigraph: 'epigraph',
  foreword: 'foreword',
  preface: 'preface',
  introduction: 'introduction',
  'dramatis personae': 'cast', 'cast of characters': 'cast', 'list of characters': 'cast',
  'list of illustrations': 'list-of-illustrations', 'list of figures': 'list-of-illustrations',
  'list of maps': 'list-of-illustrations', 'list of tables': 'list-of-illustrations',
  acknowledgment: 'acknowledgements', acknowledgments: 'acknowledgements',
  acknowledgement: 'acknowledgements', acknowledgements: 'acknowledgements',
  'author note': 'author-note', 'authors note': 'author-note',
  'a note on the text': 'author-note', 'note on the text': 'author-note',
  'translator note': 'author-note',
  afterword: 'afterword',
  'about the author': 'about-author', 'about the book': 'about-author',
  colophon: 'colophon',
  glossary: 'glossary',
  appendix: 'appendix',
  // Each was previously fused into `notes`; split so the renderer can treat them
  // by convention. `notes` now means endnotes specifically.
  notes: 'notes', endnotes: 'notes',
  bibliography: 'bibliography', references: 'bibliography', 'works cited': 'bibliography',
  index: 'index',
  'also by': 'also-by', 'also by the same author': 'also-by',
};

/** Normalize a heading to the bare section keyword (lowercased, subtitle + non-letters stripped). */
function matterKey(rawLine: string): string {
  let s = rawLine.replace(/^#+\s*/, '').toLowerCase();
  s = s.split(/[–—]|\s-\s|:/)[0];
  return s.replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

/** The table of contents — discarded entirely (regenerated from real structure at
 *  export, never echoed: a frozen TOC is exactly where stale chapter names surface). */
export function isTocHeading(rawLine: string): boolean {
  const s = matterKey(rawLine);
  return s === 'contents' || s === 'table of contents';
}

/** Classify a heading as a front/back-matter role, or null if it isn't matter. */
export function classifyMatter(rawLine: string): MatterRole | null {
  const s = matterKey(rawLine);
  if (!s) return null;
  if (MATTER_ROLE_MAP[s]) return MATTER_ROLE_MAP[s];
  if (/^(also by|other books|by the same author)/.test(s)) return 'also-by';
  if (/^(praise for|advance praise)/.test(s)) return 'about-author';
  if (/^(reading group|discussion questions|book club|questions for discussion)/.test(s)) return 'reading-group-guide';
  if (/^(excerpt|sneak peek|a preview of)/.test(s)) return 'excerpt';
  if (/^a note from/.test(s)) return 'author-note';
  return null;
}

// ── Matter fence emit ─────────────────────────────────────────────────────────
// A retained section is wrapped in a comment fence carrying its region + role +
// display title. Deliberately NO markdown heading inside: every naive `# `-splitter
// (the shared-reader parser, computeChapterWords) then stays correct by construction
// — they see only comment lines (skipped) and prose. parseMarkdown reads the fence.

interface MatterSpec { region: 'front' | 'back'; role: MatterRole; title: string; body: string[]; }

function emitFence(spec: MatterSpec): string {
  const title = spec.title.replace(/["<>]/g, '').trim();
  const body = spec.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return `<!-- matter:${spec.region} role="${spec.role}" title="${title}" -->\n${body}\n<!-- /matter -->`;
}

/**
 * Returns true if the heading text signals the START OF NARRATIVE CONTENT —
 * i.e., an explicitly numbered chapter or recognized narrative opener.
 * This is the anchor for forematter stripping.
 */
export function isNarrativeOpener(rawLine: string): boolean {
  const s = rawLine.replace(/^#+\s*/, '').trim();

  // Explicit chapter/part/prologue/epilogue keyword
  if (/^(chapter|prologue|epilogue|part|book|section|interlude|prelude|afterword)\s/i.test(s)) return true;
  // Just the keyword alone (e.g. "# Prologue")
  if (/^(prologue|epilogue|interlude|prelude)$/i.test(s)) return true;
  // Leading number: "1", "01", "1.", "1 —", "I.", "IV."
  if (/^(\d{1,3}|[ivxlcdm]{1,8})[\s.):-]/i.test(s)) return true;
  // Just a bare number (e.g. "# 1")
  if (/^\d{1,3}$/.test(s.trim())) return true;

  return false;
}

// ─── Heading-less chapter detection (DOCX without heading styles) ─────────────
// Many real manuscripts mark chapters purely visually — a bare number, "N TITLE",
// or a bold "CHAPTER 1" / title pair — using paragraph styles or character
// formatting that mammoth can't map to headings. After conversion these arrive
// as plain prose (sometimes wrapped in **/__ emphasis). We promote them to `# `
// headings, but ONLY when a chapter-sized body paragraph follows shortly after.
// That single guard rejects tables of contents, whose number/title lines are
// followed by more short lines rather than prose.

const NUM_WORD_RE = Object.keys(NUM_WORDS).join('|');
// A leading chapter "number": digits, roman numerals, or spelled-out words.
const LEADING_NUM = new RegExp(
  `^(\\d{1,3}|[ivxlcdm]+|(?:${NUM_WORD_RE})(?:[\\s-]+(?:${NUM_WORD_RE}|and))*)\\b`,
  'i',
);
const CHAPTER_KEYWORD = /^(chapter|part|book|section|prologue|epilogue|interlude|prelude|afterword)\b/i;

/** A line that reads like a heading: ALL CAPS, or Title Case (each significant
 *  word capitalized). Sentences fail this because interior words start lower. */
export function isHeadingLike(raw: string): boolean {
  const t = raw.trim();
  if (!/[A-Za-z]/.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters === letters.toUpperCase()) return true; // ALL CAPS
  const words = t.split(/\s+/).filter(w => /[A-Za-z]/.test(w));
  return words.every((w, idx) => {
    const first = (w.match(/[A-Za-z]/) ?? [''])[0];
    if (first && first === first.toUpperCase()) return true;
    const bare = w.toLowerCase().replace(/[^a-z]/g, '');
    return idx !== 0 && SMALL_WORDS.has(bare);
  });
}

/** A line substantial enough to be chapter body (not a TOC entry / page number). */
function isChapterBody(raw: string): boolean {
  const t = raw.trim();
  if (!t || /^[#>]/.test(t)) return false;
  return t.split(/\s+/).length >= 8;
}

/** A short, heading-cased line that isn't a sentence — a plausible chapter title.
 *  The trailing-period check rejects catalog/prose lines like "Young Women—Fiction." */
function looksLikeTitle(raw: string): boolean {
  const t = raw.trim();
  return t.length <= 60 && !/\.$/.test(t) && isHeadingLike(t);
}

/** If the whole trimmed line is wrapped in one emphasis run (**x**, __x__, *x*,
 *  _x_), return the inner text — these whole-line bolds are almost always
 *  headings, not inline emphasis. Otherwise return the trimmed line unchanged. */
function unwrapEmphasis(line: string): string {
  const t = line.trim();
  const m = /^(\*\*|__|\*|_)([\s\S]+?)\1$/.exec(t);
  return m ? m[2].trim() : t;
}

/** The title text remaining after a chapter label's keyword + number are removed
 *  ("Chapter 2: The Gate" → "The Gate", "Chapter 1" → "", "1" → ""). */
function labelTitlePart(label: string): string {
  let t = label.replace(CHAPTER_KEYWORD, '').trim();
  t = t.replace(LEADING_NUM, '').replace(/^[\s.):–—-]+/, '').trim();
  return t;
}

/** True if a (de-emphasized) line opens a chapter: an explicit keyword, or a
 *  number/word-number marker at the start. */
function isChapterLabel(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 60) return false;
  return CHAPTER_KEYWORD.test(t) || LEADING_NUM.test(t);
}

// ─── Table-of-contents excision ───────────────────────────────────────────────
// The TOC is discarded and regenerated from the real chapter structure at export
// (a frozen TOC is exactly where stale chapter names + meaningless page numbers
// surface). It must be removed BEFORE the chapter-promotion passes, or its entry
// lines ("Chapter One", "Chapter Two", dot-leader rows) get promoted to phantom
// chapters that then masquerade as the start of the body.

/** A line that reads like a TOC entry (scanned only after a "Contents" heading). */
function isTocEntry(raw: string): boolean {
  const t = unwrapEmphasis(raw).replace(/^#+\s*/, '').trim();
  if (!t || t.length > 70) return false;
  if (/\.{2,}\s*\d+\s*$/.test(t)) return true;                                  // dot leaders → page no
  if (/\s\d+\s*$/.test(t) && t.split(/\s+/).length <= 10) return true;          // trailing page no
  if (CHAPTER_KEYWORD.test(t)) return true;                                     // "Chapter One", "Part II"
  if (/^(\d{1,3}|[ivxlcdm]+)[.):\s]/i.test(t)) return true;                     // "1." / "IV "
  const words = t.split(/\s+/).filter(Boolean);
  return words.length <= 10 && !/[.!?]$/.test(t);                              // short, non-sentence
}

/** Remove a Table of Contents (heading + its entry rows) before promotion runs. */
export function stripTableOfContents(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const key = unwrapEmphasis(lines[i]).replace(/^#+\s*/, '')
      .toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
    if (key === 'contents' || key === 'table of contents') {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;       // skip blanks under the heading
      const entryStart = j;
      // Scan entry rows, TOLERATING the blank line mammoth emits after every
      // paragraph (each TOC row + its page number arrives blank-separated). Stop
      // at the first non-blank line that isn't a TOC entry — that's the body.
      const nextNonBlankFrom = (from: number): number => {
        for (let k = from; k < lines.length; k++) if (lines[k].trim()) return k;
        return -1;
      };
      let lastEntry = entryStart - 1;
      while (j < lines.length) {
        if (!lines[j].trim()) { j++; continue; }               // blank between rows — keep scanning
        if (!isTocEntry(lines[j])) break;                      // real content — TOC ended
        // A candidate row that BEGINS the body is the first chapter, not a TOC
        // row: the TOC ended at the previous entry. (TOC rows are followed by more
        // short rows / page numbers, never chapter prose.) Two body-start shapes:
        //   • the row is immediately followed by chapter body prose, or
        //   • the row is a "Chapter N" / numbered LABEL whose title line is in
        //     turn followed by body prose (the first chapter's label sits right
        //     after the TOC and is otherwise indistinguishable from a TOC row).
        const nb1 = nextNonBlankFrom(j + 1);
        let labelStartsBody = false;
        if (isChapterLabel(unwrapEmphasis(lines[j])) && nb1 !== -1) {
          const titleText = unwrapEmphasis(lines[nb1].replace(/^#+\s*/, ''));
          // The label's title must be a PLAIN title — not itself a matter/drop
          // heading or another chapter label. That's what separates a real first
          // chapter ("CHAPTER 1" → "Arsène Lupin in Prison" → prose) from a TOC
          // row followed by a matter heading ("Chapter Two" → "Foreword" → prose).
          const titleIsPlain =
            looksLikeTitle(titleText) && !classifyMatter(`# ${titleText}`) &&
            !isDropHeading(`# ${titleText}`) && !isChapterLabel(titleText);
          if (titleIsPlain) {
            const nb2 = nextNonBlankFrom(nb1 + 1);
            labelStartsBody = nb2 !== -1 && isChapterBody(lines[nb2]);
          }
        }
        if ((nb1 !== -1 && isChapterBody(lines[nb1])) || labelStartsBody) break;
        lastEntry = j;
        j++;
      }
      if (lastEntry >= entryStart) { i = lastEntry; continue; } // drop heading + entries
      // No entry rows followed — leave the line (it's a real "Contents" section).
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** Promote heading-less chapter markers to `# ` headings. */
export function promoteHeadinglessChapters(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  const nextNonBlank = (from: number): number => {
    for (let k = from; k < lines.length; k++) if (lines[k].trim()) return k;
    return -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#/.test(line)) { out.push(line); continue; } // leave real headings alone

    const label = unwrapEmphasis(line);
    if (!isChapterLabel(label)) { out.push(line); continue; }

    const hasKeyword = CHAPTER_KEYWORD.test(label);
    const inlineTitle = labelTitlePart(label);

    // A number/word marker with no chapter keyword must carry a title-cased,
    // non-sentence title (inline or on the next line) — otherwise it's just
    // prose/catalog data that happens to start with "One"/"I"/a number.
    if (!hasKeyword && inlineTitle && !looksLikeTitle(inlineTitle)) {
      out.push(line);
      continue;
    }

    let combined = label;
    let consumedUpto = i;

    if (!inlineTitle) {
      // Label alone ("1", "CHAPTER 1", "__CHAPTER 1__") — the title, if any, is
      // the next non-blank line. Consume it when it reads like a heading.
      const j = nextNonBlank(i + 1);
      if (j !== -1) {
        // The title may arrive as its own real heading (`# Title`) — e.g. our own
        // publication DOCX emits "CHAPTER N" + the title as HEADING_1. Strip the
        // leading `#` before combining, or it survives into the subtitle and shifts
        // smartTitleCase's token 0 (lowercasing the real first word: "the Escape…").
        const t = unwrapEmphasis(lines[j].replace(/^#+\s*/, ''));
        if (looksLikeTitle(t) && !isChapterLabel(t) && !isChapterBody(t)) {
          combined = `${label} — ${t}`;
          consumedUpto = j;
        }
      }
      // A bare number/word with neither inline nor following title is too weak
      // a signal on its own — require the keyword form to stand alone.
      if (!hasKeyword && consumedUpto === i) { out.push(line); continue; }
    }

    // Guard: a real chapter is followed by prose. TOC rows are not.
    const b = nextNonBlank(consumedUpto + 1);
    if (b !== -1 && isChapterBody(lines[b])) {
      out.push(`# ${normalizeChapterHeading(combined)}`);
      i = consumedUpto;
      continue;
    }

    out.push(line);
  }
  return out.join('\n');
}

/**
 * Promote a run of BARE numeric chapter markers — lines that are just "1", "2",
 * "3"… (optionally wrapped in emphasis), each followed by body prose — to `# `
 * headings. A single bare number is too weak a signal on its own (a list item, a
 * stray digit), which is why `promoteHeadinglessChapters` deliberately rejects the
 * title-less form; but a CONSECUTIVE ASCENDING RUN starting at 1 is an
 * unambiguous chapter sequence. This is the common paste / plain-text form (a
 * manuscript typed with bare chapter numbers and no Word heading styles), which
 * the DOCX path recovers from layout signals but the text path otherwise misses.
 *
 * Deliberately strict — exactly 1..N, each followed by prose — so it never splits
 * on a stray number. Anything it under-detects is correctable in the import review.
 */
export function promoteNumberedChapterSequence(text: string): string {
  const lines = text.split('\n');
  const nextNonBlank = (from: number): number => {
    for (let k = from; k < lines.length; k++) if (lines[k].trim()) return k;
    return -1;
  };

  const markers: Array<{ line: number; value: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^#/.test(lines[i])) continue;                    // already a heading
    const t = unwrapEmphasis(lines[i]).trim();
    if (!/^\d{1,3}$/.test(t)) continue;                   // not a bare number
    const b = nextNonBlank(i + 1);
    if (b === -1 || !isChapterBody(lines[b])) continue;   // must be followed by prose
    markers.push({ line: i, value: parseInt(t, 10) });
  }

  // Require a clean consecutive run 1, 2, 3, … of length ≥ 2. A single marker, a
  // gap, or a non-1 start all abort promotion (safer to leave it to the review).
  if (markers.length < 2) return text;
  for (let k = 0; k < markers.length; k++) {
    if (markers[k].value !== k + 1) return text;
  }

  const promote = new Set(markers.map(m => m.line));
  return lines
    .map((l, i) => (promote.has(i) ? `# ${unwrapEmphasis(l).trim()}` : l))
    .join('\n');
}

// ─── Heading normalization ────────────────────────────────────────────────────

/** Convert a raw heading string to a canonical "Chapter N — Subtitle" form. */
export function normalizeChapterHeading(raw: string): string {
  const s = raw.replace(/^#+\s*/, '').trim();

  const kw = /^(chapter|part|book|section|prologue|epilogue|interlude|afterword|foreword|prelude)\b/i.exec(s);
  if (!kw) {
    // Number-first: "1 CHAPTER NAME", "10 — The Gate", "IV. The Fall"
    const numFirst = /^(\d{1,3}|[ivxlcdm]+)(?:\s*[.):\u2013\u2014-]\s*|\s+)(.*)$/i.exec(s);
    if (numFirst) {
      const np = numFirst[1];
      const num = /^\d+$/.test(np) ? parseInt(np, 10) : romanToInt(np);
      const subtitle = numFirst[2].trim();
      if (num != null) {
        return subtitle ? `Chapter ${num} — ${smartTitleCase(subtitle)}` : `Chapter ${num}`;
      }
    }
    if (/^\d{1,3}$/.test(s)) return `Chapter ${parseInt(s, 10)}`;
    return smartTitleCase(s);
  }

  const keyword = kw[1].toLowerCase();
  const rest = s.slice(kw[0].length);
  let subtitle = '';
  const sep = rest.match(/\s*[\u2013\u2014]\s*(.+)$/) || rest.match(/\s*:\s*(.+)$/) || rest.match(/\s+-\s+(.+)$/);
  let numPart = rest;
  if (sep) { subtitle = sep[1].trim(); numPart = rest.slice(0, rest.length - sep[0].length); }
  numPart = numPart.trim().replace(/[.)]$/, '');

  let num: number | null = null;
  if (numPart) {
    if (/^\d+$/.test(numPart)) num = parseInt(numPart, 10);
    else {
      const w = wordsToInt(numPart);
      if (w != null) num = w;
      else { const r = romanToInt(numPart); if (r != null) num = r; }
    }
    if (num == null && !subtitle) subtitle = numPart;
  }

  const Keyword = keyword.charAt(0).toUpperCase() + keyword.slice(1);
  let label = num != null ? `${Keyword} ${num}` : Keyword;
  if (subtitle) label += ` — ${smartTitleCase(subtitle)}`;
  return label;
}

// ─── Structure pass (classify-and-keep) ──────────────────────────────────────

/** Split a line range into segments at each `# ` heading. The first segment
 *  (`heading: null`) holds any content before the first heading. */
function splitByHeading(lines: string[]): Array<{ heading: string | null; body: string[] }> {
  const segs: Array<{ heading: string | null; body: string[] }> = [{ heading: null, body: [] }];
  for (const line of lines) {
    if (/^# /.test(line)) segs.push({ heading: line, body: [] });
    else segs[segs.length - 1].body.push(line);
  }
  return segs;
}

const stripComments = (body: string[]): string[] => body.filter(l => !/^\s*<!--/.test(l));
const hasContent = (body: string[]): boolean => body.some(l => l.trim());

/**
 * CLASSIFY-AND-KEEP forematter and back matter in normalized Markdown.
 *
 * Supersedes the old strip/drop pass. The body stays the single source of record;
 * front/back matter is RETAINED as comment-fenced regions (see emitFence) so the
 * publish-ready renderer and the metadata extractor can use it, while the reader
 * fences it out of the immersive view. Only the TOC is discarded outright — it is
 * always regenerated from the real chapter structure.
 *
 * ALGORITHM:
 * 1. If already structured (has <!-- title: --> comment), return as-is.
 * 2. Find the first NARRATIVE OPENER (explicit chapter number, "Prologue",
 *    "Part I", …). Everything before it is front matter.
 * 3. Extract the book title from the front matter heuristically.
 * 4. Group the front matter into classified, fenced sections.
 * 5. From the first narrative opener on, keep narrative sections as body and
 *    fence DROP/matter-classified sections as back matter (discard the TOC).
 * 6. Reconstruct: title comment · front fences · body · back fences.
 */
// Lines on a title page that end (or aren't part of) the title: attribution,
// legal, series, or "A Novel" tag lines. Latching the title stops here.
const TITLE_STOP = /(copyright|©|isbn|also by|by the same|all rights reserved|this is a work of fiction|table of contents|a (novel|memoir|play|verse translation)\b|edited by|translat|publish|foreword|preface|introduction|contents)/i;
const ATTRIB_LEAD = /^(by\s|written by\s|edited\b|translated\b|a\s+(verse\s+)?(translation|novel|memoir)\b)/i;
// A short connector/article/preposition word — as a WHOLE line these separate a
// title's words on a centered title page; a *lowercase, emphasized* one (mammoth's
// `*of*`) signals an attribution connector ("… of Virgil") and ends the title.
const CONNECTOR_WORD = /^(of|by|and|or|for|from|with|to|in|on|the|a|an|de|la|le|del|di|und|et)$/i;
// A "title" made only of articles/connectors ("The", "A", "An", "A The") is never
// a real title — no book is called "The" — so it's rejected and detection continues.
const ARTICLE_ONLY = /^(?:(?:the|a|an|of|and|or|to|in|on|with|for|from)\b\s*)+$/i;

function cleanTitleLine(raw: string): { text: string; emphasized: boolean } {
  const trimmed = raw.replace(/^#+\s*/, '').trim();
  const emphasized = /^[*_]/.test(trimmed);
  return { text: trimmed.replace(/^[*_]+|[*_]+$/g, '').replace(/\s+/g, ' ').trim(), emphasized };
}

// How a title-page line reads: skippable noise, a hard boundary that ends the
// title region, or a usable title fragment.
type TitleLineKind = 'ignore' | 'boundary' | 'fragment';
function classifyTitleLine(text: string): TitleLineKind {
  if (!text || /^<!--/.test(text) || /^\d/.test(text) || /^[\W_]+$/.test(text)) return 'ignore';
  if (text.length > 60 || text.split(/\s+/).length > 8) return 'boundary'; // prose, not a title line
  if (TITLE_STOP.test(text) || ATTRIB_LEAD.test(text)) return 'boundary';
  // A line that classifies as its own matter section (Dedication, Foreword…) or a
  // drop heading ends the title page — the title, if any, precedes it. This is a
  // hard STOP, never skipped past (else a dedication's body becomes the title).
  if (classifyMatter(`# ${text}`) || isDropHeading(`# ${text}`)) return 'boundary';
  return 'fragment';
}

/**
 * Recover the book title from the ordered lines of the front region. Real title
 * pages routinely split a multi-word title across centered lines — mammoth emits
 * `THE` / `AENEID` / `*of*` / `VIRGIL` as separate paragraphs — so we must
 * ACCUMULATE the consecutive title fragments rather than grab the first line
 * (which yielded absurdities like a book titled "The" or "A"). The title sits at
 * the TOP of the front region: we stop at the first boundary (attribution, legal
 * line, or a matter/section heading), and reject an article-only result.
 */
function recoverTitle(rawLines: string[]): string {
  const cleaned = rawLines.map(cleanTitleLine);
  const parts: string[] = [];
  let blanks = 0;
  for (const { text, emphasized } of cleaned) {
    const kind = classifyTitleLine(text);
    // Title-page words arrive as separate paragraphs (`THE` ¶ `AENEID` ¶ …), so a
    // blank line between fragments is normal — skip it. But a *big* gap (a page
    // break / new section) ends the title.
    if (kind === 'ignore') { if (text === '' && ++blanks > 2 && parts.length) break; continue; }
    blanks = 0;
    if (kind === 'boundary') break;
    // "… of Virgil" / "… by Homer": an emphasized lowercase connector begins the
    // attribution clause, not the title. (A plain, same-case connector like "and"
    // inside "The Sound and the Fury" is kept.)
    if (parts.length && emphasized && /^[a-z]/.test(text) && CONNECTOR_WORD.test(text)) break;
    parts.push(text);
    if (parts.join(' ').length > 60 || parts.length >= 8) break;
  }
  const title = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!title || ARTICLE_ONLY.test(title)) return '';
  return /[a-z]/.test(title) ? title : smartTitleCase(title);
}

export function structureManuscript(text: string): string {
  const lines = text.split('\n');

  // Already structured
  const firstNonEmpty = lines.find(l => l.trim());
  if (firstNonEmpty && /^<!--\s*title:/i.test(firstNonEmpty.trim())) return text;

  // ── Find all # headings and their line positions ──
  const headingLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^# /.test(lines[i])) headingLines.push(i);
  }

  if (headingLines.length === 0) return text; // no headings — leave untouched

  // ── Find the first narrative opener ──
  let firstNarrativeIdx = -1; // index into headingLines[]
  for (let h = 0; h < headingLines.length; h++) {
    const line = lines[headingLines[h]];
    if (isNarrativeOpener(line) && !isDropHeading(line)) {
      firstNarrativeIdx = h;
      break;
    }
  }

  // If no explicit narrative opener found, fall back to: first heading that
  // isn't a known drop heading (better than showing nothing at all).
  if (firstNarrativeIdx === -1) {
    for (let h = 0; h < headingLines.length; h++) {
      if (!isDropHeading(lines[headingLines[h]])) {
        firstNarrativeIdx = h;
        break;
      }
    }
  }

  // If still nothing, keep the whole text unchanged.
  if (firstNarrativeIdx === -1) return text;

  const firstNarrativeLineIdx = headingLines[firstNarrativeIdx];

  // ── Extract book title from forematter (accumulates multi-line titles) ──
  // Prefer the heading lines of the front region; fall back to its raw text.
  let bookTitle = recoverTitle(
    headingLines.slice(0, firstNarrativeIdx).map(i => lines[i]),
  );
  if (!bookTitle && firstNarrativeLineIdx > 0) {
    bookTitle = recoverTitle(lines.slice(0, firstNarrativeLineIdx));
  }

  // ── Group the front region into classified, fenced sections ──
  const frontSpecs: MatterSpec[] = [];
  for (const seg of splitByHeading(lines.slice(0, firstNarrativeLineIdx))) {
    if (seg.heading && isTocHeading(seg.heading)) continue; // discard the TOC
    const headingText = seg.heading ? seg.heading.replace(/^#+\s*/, '').trim() : '';
    // The book-title heading itself is not a section — its body (author / subtitle)
    // is kept as title-page material; the renderer regenerates the page from metadata.
    const isTitleHeading = !!seg.heading && headingText === bookTitle;
    const named = !!seg.heading && !isTitleHeading;
    const role: MatterRole = named ? (classifyMatter(seg.heading!) ?? 'title-page') : 'title-page';
    const title = named ? headingText : '';
    const body = stripComments(seg.body);
    if (!title && !hasContent(body)) continue; // nothing worth keeping
    frontSpecs.push({ region: 'front', role, title, body });
  }

  // ── Classify body+back sections (narrative stays body; matter/DROP is fenced) ──
  type Decided = { kind: 'body' | 'back' | 'drop'; heading: string | null; body: string[]; role: MatterRole };
  const decided: Decided[] = splitByHeading(lines.slice(firstNarrativeLineIdx)).map(seg => {
    if (!seg.heading) return { kind: 'body', heading: null, body: seg.body, role: 'other' };
    if (isTocHeading(seg.heading)) return { kind: 'drop', heading: seg.heading, body: seg.body, role: 'other' };
    const role = classifyMatter(seg.heading);
    if (role || isDropHeading(seg.heading)) return { kind: 'back', heading: seg.heading, body: seg.body, role: role ?? 'other' };
    return { kind: 'body', heading: seg.heading, body: seg.body, role: 'other' };
  });
  // Never fence away the entire manuscript: if nothing reads as body, keep it all.
  const anyBody = decided.some(d => d.kind === 'body' && (!!d.heading || hasContent(d.body)));

  const bodyOut: string[] = [];
  const backSpecs: MatterSpec[] = [];
  for (const d of decided) {
    if (d.kind === 'drop') continue;
    if (d.kind === 'back' && anyBody) {
      const title = d.heading!.replace(/^#+\s*/, '').trim();
      backSpecs.push({ region: 'back', role: d.role, title, body: stripComments(d.body) });
    } else {
      if (d.heading) bodyOut.push(d.heading);
      bodyOut.push(...d.body);
    }
  }

  const titleComment = bookTitle ? `<!-- title: ${bookTitle} -->\n\n` : '';
  const parts = [
    ...frontSpecs.map(emitFence),
    bodyOut.join('\n').trim(),
    ...backSpecs.map(emitFence),
  ].filter(Boolean);
  return (titleComment + parts.join('\n\n')).trim();
}

// ─── Main preprocessing pipeline ─────────────────────────────────────────────

/** The prose-chapter pattern: detect "Chapter One", "Chapter 1", "Prologue",
 *  etc. in body text and promote them to ATX # headings. */
const CHAPTER_PATTERN = /^[ \t]*(chapter\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|[ivxlcdm]+|\d+)[^\n]*|part\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|[ivxlcdm]+|\d+)[^\n]*|prologue[^\n]*|epilogue[^\n]*|interlude[^\n]*|afterword[^\n]*|foreword[^\n]*|prelude[^\n]*)[ \t]*$/gim;

/**
 * Full preprocessing pipeline:
 * 1. Fix mammoth over-escaping
 * 2. Detect prose chapter headings → normalize to `# ` ATX headings
 * 3. Normalize existing ATX headings
 * 4. Structure: strip forematter, drop back matter, recover book title
 * 5. Collapse excessive blank lines
 */
export function preprocessMarkdown(text: string): string {
  // 0. Drop embedded images. mammoth inlines DOCX images as base64 data-URIs
  //    (`![alt](data:image/…;base64,…)`); a single figure can be millions of
  //    characters and swamp the actual prose (a 6.6 MB TIFF became ~100% of one
  //    real manuscript's ingested text). The engine has no image model, so these
  //    are pure noise — strip them before anything downstream sees them. Keep any
  //    alt text as a plain caption line so a meaningful label isn't lost.
  text = text.replace(/!\[([^\]]*)\]\(data:[^)]*\)/g, (_m, alt) => (alt ? String(alt).trim() : ''));

  // 0b. Strip mammoth's empty HTML anchors + footnote plumbing. Two sources of the
  //     same noise: DOCX footnotes (`<a id="footnote-ref-1"></a>[[1]](#footnote-1)`
  //     — the reading view showed `ripios<a…>[[1]](…).`), and Word TOC/heading
  //     BOOKMARKS (`<a id="_Toc233…"></a>`) which our own publication export attaches
  //     to every Heading 1. On re-import mammoth glues the bookmark to the heading
  //     text, prefixing every chapter/matter title with an anchor — which broke
  //     round-tripping our own DOCX (mis-classified matter, wrecked title-casing).
  //     Strip ALL empty anchors; footnote note *text* at the doc end is kept.
  //     (A real footnote model is logged as follow-up.)
  text = text
    .replace(/<a\s+[^>]*>\s*<\/a>/gi, '')                        // empty anchors: footnote + Word _Toc bookmarks
    .replace(/\[\[?\d+\]?\]\(#footnote-[^)]*\)/gi, '')            // [[1]](#footnote-1) refs
    .replace(/\[[↑^]\]\(#footnote-ref-[^)]*\)/gi, '');       // [↑](#footnote-ref-1) back-links

  // 1. Undo mammoth's over-escaping of punctuation. Word/mammoth backslash-escape
  //    a wide range of characters (- ( ) . , : ; etc.). We strip the backslash
  //    before punctuation that is harmless to unescape, but deliberately leave
  //    * _ ` alone so we never turn literal text into accidental emphasis/code.
  text = text.replace(/\\([-\u2013\u2014.,:;!?()[\]{}'"\u201c\u201d\u2018\u2019#&%$@/<>=~|])/g, '$1');

  // 1b. Excise any table of contents BEFORE promotion, so its entry rows ("Chapter
  //     One", dot-leader page rows) aren't promoted into phantom chapters. The TOC
  //     is regenerated from the real structure at export.
  text = stripTableOfContents(text);

  // 2. Promote heading-less chapter markers (bare "1", "1 TITLE", bold
  //    "CHAPTER 1" + title) from DOCX files whose chapter styles mammoth
  //    couldn't map. Runs first so multi-line label/title pairs are combined
  //    before the single-line prose pattern below can split them apart.
  text = promoteHeadinglessChapters(text);

  // 2a2. Promote bare-number chapter sequences ("1", "2", "3"… each followed by
  //      prose) that the per-line pass rejects as too weak individually. The DOCX
  //      path recovers these from layout signals; this is the plain-text/paste
  //      equivalent.
  text = promoteNumberedChapterSequence(text);

  // 2b. Promote remaining single-line prose chapter lines to # headings
  text = text.replace(CHAPTER_PATTERN, (match) => {
    const trimmed = match.trim();
    if (trimmed.startsWith('#')) return match; // already a heading
    return `\n# ${normalizeChapterHeading(trimmed)}\n`;
  });

  // 3. Normalize existing ATX headings (but skip <!-- comment --> lines)
  text = text.replace(/^# (.+)$/gm, (m, h) => {
    if (/<!--/.test(h)) return m;
    return `# ${normalizeChapterHeading(h)}`;
  });

  // 4. Structure: forematter stripping with the fixed algorithm
  text = structureManuscript(text);

  // 5. Collapse excessive blank lines
  text = text.replace(/\n{4,}/g, '\n\n\n');

  return text;
}

/** True if text has at least one detectable heading. */
export function hasHeading(text: string): boolean {
  if (/^# /m.test(text)) return true;
  // Setext headings
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const next = lines[i + 1].trim();
    if (line.length > 0 && line.length < 80 && /^(={3,}|-{3,})$/.test(next)) return true;
  }
  // Prose chapter pattern
  if (/^[ \t]*(chapter\s+[\w]+|prologue|epilogue|part\s+[\w]+)/im.test(text)) return true;
  return false;
}

// ─── Mammoth style map ────────────────────────────────────────────────────────

/** Maps common manuscript heading styles to Markdown headings during DOCX import. */
export const MAMMOTH_STYLE_MAP: string[] = [
  "p[style-name='CSP - Chapter Title'] => h1:fresh",
  "p[style-name='Chapter Title'] => h1:fresh",
  "p[style-name='Chapter Heading'] => h1:fresh",
  "p[style-name='Chapter Name'] => h1:fresh",
  "p[style-name='ChapterTitle'] => h1:fresh",
  "p[style-name='Chapter'] => h1:fresh",
  "p[style-name='Part Title'] => h1:fresh",
  "p[style-name='Part Heading'] => h1:fresh",
  "p[style-name='Section Title'] => h1:fresh",
  "p[style-name^='Heading 1'] => h1:fresh",
  "p[style-name^='Heading 2'] => h2:fresh",
  "p[style-name^='Heading 3'] => h3:fresh",
];
