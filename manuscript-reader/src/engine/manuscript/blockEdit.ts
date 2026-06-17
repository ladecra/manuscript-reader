// ─── Block Editing Engine (Phase 4 → edit mode) ───────────────────────────────
// Pure functions backing the reader's prose edit. Three concerns:
//
//  1. applyBlockEdit — splice new markdown into the manuscript at an exact source
//     span (data-md-start/end, or a chapter body span). Browser-free.
//  2. htmlToMarkdownInline — serialize one contentEditable block's edited HTML
//     back into the small inline-markdown subset parseMarkdown emits, so an
//     edit round-trips (bold/italic/code/links preserved) instead of being
//     flattened to plain text. Annotation <mark> wrappers are unwrapped.
//  3. htmlToMarkdownBlocks — serialize a whole edited chapter body, walking its
//     top-level blocks, so structural edits (split/merge/add/delete) round-trip.
//
// All are pure string→string transforms: testable without a DOM, per the
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

/**
 * Serialize the inner HTML of an edited *chapter body* (a `.chapter-block`) back
 * to markdown. Where htmlToMarkdownInline rewrites one block in place, this walks
 * the whole region's top-level blocks — so structural edits the lightweight mode
 * couldn't express (splitting a paragraph with Enter, merging with Backspace,
 * adding or deleting paragraphs, editing headings/quotes/lists) all round-trip.
 *
 * Covers exactly the block grammar parseMarkdown emits inside a chapter: p, the
 * section headings h2–h4, blockquote, ul/ol, and hr. The chapter's own `# `
 * heading lives *outside* the block, so it is never touched here. Each block's
 * inline content goes through htmlToMarkdownInline, which defensively flattens any
 * unexpected nested markup to text rather than corrupting the source. Empty blocks
 * (e.g. the `<p><br></p>` a stray Enter leaves) are dropped. Pure string→string.
 */
export function htmlToMarkdownBlocks(html: string): string {
  // Drop annotation marks up front, keeping inner text (re-anchored on re-render).
  const s = html.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, '$1');

  const out: string[] = [];
  const pushInline = (raw: string) => {
    const md = htmlToMarkdownInline(raw);
    if (md) out.push(md);
  };

  // Match a void <hr> or any paired block element (non-greedy: contentEditable
  // splits prose into *sibling* blocks, not nested ones, so first-close is right).
  const re = /<hr\s*\/?>|<(p|div|h2|h3|h4|blockquote|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) pushInline(s.slice(last, m.index)); // loose text → paragraph
    last = re.lastIndex;

    if (/^<hr/i.test(m[0])) { out.push('---'); continue; }

    const tag = m[1].toLowerCase();
    const inner = m[2];
    switch (tag) {
      case 'h2': { const t = htmlToMarkdownInline(inner); if (t) out.push(`## ${t}`); break; }
      case 'h3': { const t = htmlToMarkdownInline(inner); if (t) out.push(`### ${t}`); break; }
      case 'h4': { const t = htmlToMarkdownInline(inner); if (t) out.push(`#### ${t}`); break; }
      case 'blockquote': { const t = htmlToMarkdownInline(inner); if (t) out.push(`> ${t}`); break; }
      case 'ul':
      case 'ol': {
        const items: string[] = [];
        const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
        let li: RegExpExecArray | null;
        let n = 0;
        while ((li = liRe.exec(inner)) !== null) {
          const t = htmlToMarkdownInline(li[1]);
          if (t) { n++; items.push(tag === 'ol' ? `${n}. ${t}` : `- ${t}`); }
        }
        if (items.length) out.push(items.join('\n'));
        break;
      }
      default: pushInline(inner); // p, div → a paragraph
    }
  }
  if (last < s.length) pushInline(s.slice(last)); // trailing loose text

  return out.join('\n\n');
}

/**
 * Rebuild combined markdown from the reader's rendered DOM (#content). Walks
 * chapter markers, h1 titles, and chapter bodies in document order. Used after
 * structural edits (e.g. promoting `# Title` to a new chapter) that the
 * per-chapter body splice cannot represent.
 */
export function serializeContentDomToMarkdown(container: HTMLElement): string {
  const parts: string[] = [];
  let el: Element | null = container.firstElementChild;
  while (el) {
    if (el.classList.contains('chapter-marker')) {
      const h1 = el.nextElementSibling;
      const block = h1?.nextElementSibling;
      if (h1?.tagName === 'H1' && block?.classList.contains('chapter-block')) {
        const title = (h1.textContent ?? '').trim();
        if (title) parts.push(`# ${title}`);
        const body = htmlToMarkdownBlocks((block as HTMLElement).innerHTML);
        if (body) parts.push(body);
        el = block.nextElementSibling;
        continue;
      }
    }
    if (el.classList.contains('chapter-block')) {
      const body = htmlToMarkdownBlocks((el as HTMLElement).innerHTML);
      if (body) parts.push(body);
    }
    el = el.nextElementSibling;
  }
  return parts.join('\n\n').trim() + '\n';
}
