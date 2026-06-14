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
        const t = unwrapEmphasis(lines[j]);
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

// ─── Structure pass (THE FIX) ─────────────────────────────────────────────────

/**
 * Strip forematter and back matter from normalized Markdown.
 *
 * ALGORITHM:
 * 1. If already structured (has <!-- title: --> comment), return as-is.
 * 2. Scan all # headings to find the first NARRATIVE OPENER (explicit chapter
 *    number, "Prologue", "Part I", etc.). Everything before it is forematter.
 * 3. From forematter, extract the book title heuristically.
 * 4. After the first narrative opener, drop any sections whose heading matches
 *    DROP_HEADINGS (back matter).
 * 5. Reconstruct with a <!-- title: --> comment.
 */
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

  // ── Extract book title from forematter ──
  let bookTitle = '';
  for (let h = 0; h < firstNarrativeIdx; h++) {
    const ln = lines[headingLines[h]].replace(/^# /, '').trim();
    if (!ln || isDropHeading(`# ${ln}`)) continue;
    // Skip lines that look like copyright / author attribution
    if (/(copyright|\u00a9|isbn|also by|by the same|all rights reserved|this is a work of fiction|table of contents|a novel\b)/i.test(ln)) continue;
    if (/^(by\s|written by\s)/i.test(ln)) continue;
    if (ln.length > 70) continue;
    bookTitle = /[a-z]/.test(ln) ? ln : smartTitleCase(ln);
    break;
  }

  // ── Also check raw pre-heading text for a title ──
  if (!bookTitle && firstNarrativeLineIdx > 0) {
    for (const lnRaw of lines.slice(0, firstNarrativeLineIdx)) {
      const ln = lnRaw.replace(/^#+\s*/, '').trim();
      if (!ln || /^<!--/.test(ln)) continue;
      if (/(copyright|\u00a9|isbn|also by|all rights reserved|table of contents|a novel\b|this is a work of fiction)/i.test(ln)) continue;
      if (/^(by\s|written by\s)/i.test(ln)) continue;
      if (ln.length > 70 || /^\d/.test(ln)) continue;
      bookTitle = /[a-z]/.test(ln) ? ln : smartTitleCase(ln);
      break;
    }
  }

  // ── Build sections from firstNarrativeLineIdx onward ──
  const narrativeLines = lines.slice(firstNarrativeLineIdx);
  const sections: Array<{ heading: string; body: string[] }> = [];
  let cur: { heading: string; body: string[] } | null = null;

  for (const line of narrativeLines) {
    if (/^# /.test(line)) {
      if (cur) sections.push(cur);
      cur = { heading: line, body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) sections.push(cur);

  // ── Drop known back-matter sections ──
  const kept = sections.filter(sec => !isDropHeading(sec.heading));
  const finalSections = kept.length ? kept : sections; // never drop everything

  const body = finalSections
    .map(sec => sec.heading + '\n' + sec.body.join('\n'))
    .join('\n');

  const titleComment = bookTitle ? `<!-- title: ${bookTitle} -->\n\n` : '';
  return (titleComment + body).trim();
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
  // 1. Undo mammoth's over-escaping of punctuation. Word/mammoth backslash-escape
  //    a wide range of characters (- ( ) . , : ; etc.). We strip the backslash
  //    before punctuation that is harmless to unescape, but deliberately leave
  //    * _ ` alone so we never turn literal text into accidental emphasis/code.
  text = text.replace(/\\([-\u2013\u2014.,:;!?()[\]{}'"\u201c\u201d\u2018\u2019#&%$@/<>=~|])/g, '$1');

  // 2. Promote heading-less chapter markers (bare "1", "1 TITLE", bold
  //    "CHAPTER 1" + title) from DOCX files whose chapter styles mammoth
  //    couldn't map. Runs first so multi-line label/title pairs are combined
  //    before the single-line prose pattern below can split them apart.
  text = promoteHeadinglessChapters(text);

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
