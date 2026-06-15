// ─── Block Editing Engine (Phase 4 → edit mode) ───────────────────────────────
// Pure functions backing the reader's light-touch prose edit. Two concerns:
//
//  1. applyBlockEdit — splice a block's new markdown into the manuscript at the
//     exact source span the parser recorded (data-md-start/end). Browser-free.
//  2. htmlToMarkdownInline — serialize a contentEditable block's edited HTML
//     back into the small inline-markdown subset parseMarkdown emits, so an
//     edit round-trips (bold/italic/code/links preserved) instead of being
//     flattened to plain text. Annotation <mark> wrappers are unwrapped.
//
// Both are pure string→string transforms: testable without a DOM, per the
// engine-purity rule.

export interface BlockEditResult {
  markdown: string;
  delta: number; // change in length (newSource.length − spanLength)
}

/**
 * Replace the source span [start, end) of `markdown` with `newSource`.
 * Normalizes line endings first so offsets match the parser's domain.
 * Returns null if the span is out of bounds.
 */
export function applyBlockEdit(markdown: string, start: number, end: number, newSource: string): BlockEditResult | null {
  const md = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (start < 0 || end > md.length || start > end) return null;
  const next = md.slice(0, start) + newSource + md.slice(end);
  return { markdown: next, delta: newSource.length - (end - start) };
}

function unescapeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" → "&lt;"
}

/**
 * Serialize the inner HTML of an edited prose block back to markdown, covering
 * exactly the inline grammar parseMarkdown produces. Unknown tags degrade to
 * their text content rather than corrupting the source.
 */
export function htmlToMarkdownInline(html: string): string {
  let s = html;

  // Drop annotation marks (and any leftover spans), keeping inner text.
  s = s.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, '$1');

  // Block-ish artifacts contentEditable may introduce → spaces (block boundaries).
  s = s.replace(/<br\s*\/?>/gi, ' ');
  s = s.replace(/<\/?(div|p)\b[^>]*>/gi, ' ');

  // Links (our anchors carry a style attr) → [text](href).
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => `[${text}](${href})`);

  // Bold+italic (parser emits <strong><em>…</em></strong>), both nesting orders.
  s = s.replace(/<strong>\s*<em>([\s\S]*?)<\/em>\s*<\/strong>/gi, '***$1***');
  s = s.replace(/<em>\s*<strong>([\s\S]*?)<\/strong>\s*<\/em>/gi, '***$1***');

  // Bold / italic / code.
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*');
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');

  // Strip anything else (defensive), then unescape entities.
  s = s.replace(/<[^>]+>/g, '');
  s = unescapeEntities(s);

  // Collapse the whitespace contentEditable scatters; a paragraph is one line.
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/** Whitespace-insensitive comparison, to tell a real edit from re-wrapping. */
export function sameProse(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
}
