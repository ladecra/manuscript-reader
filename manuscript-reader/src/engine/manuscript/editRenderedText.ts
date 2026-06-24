// ─── Edit → rendered-text (Phase 8, Changes mode) ─────────────────────────────
// An Edit anchors in the SOURCE-MARKDOWN domain; its original/replacement text may
// carry block syntax (#, >, list markers), inline markdown (**bold**, *italic*,
// `code`, [links](url)), and mammoth's backslash escapes (\-, \(). To both (a)
// re-locate the edited passage in the RENDERED prose and (b) show a clean
// "Previously…" in the margin, we reduce source markdown to the text as it renders.
//
// Pure + deterministic; the DOM wrapping itself lives in the reader.

/** The plain rendered text of a source-markdown span — block + inline syntax
 *  removed, escapes undone, whitespace normalized. Used both to locate an edit in
 *  the prose and to display its before/after text. */
export function editRenderedNeedle(sourceText: string): string {
  let s = sourceText;
  // Inline markdown FIRST — so emphasis wrapping a heading (`*## Title*`, an
  // artifact seen when testing heading creation) exposes the `##` for the
  // block-marker pass below.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'); // image → alt
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');  // link → text
  s = s.replace(/`([^`]+)`/g, '$1');              // inline code
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/_([^_]+)_/g, '$1');
  // Per-line: strip leading block markers (heading #, blockquote >, list bullets).
  s = s.split('\n').map(line =>
    line
      .replace(/^\s{0,3}#{1,6}\s+/, '')      // ATX heading
      .replace(/^\s{0,3}>\s?/, '')           // blockquote
      .replace(/^\s{0,3}[-*+]\s+/, '')       // bullet list
      .replace(/^\s{0,3}\d+\.\s+/, ''),      // ordered list
  ).join('\n');
  // Undo mammoth-style backslash escapes (\-, \(, \. …) — keep the char, drop the slash.
  s = s.replace(/\\([-_*().[\]#`])/g, '$1');
  // Collapse all whitespace (incl. newlines) to single spaces, trim.
  return s.replace(/\s+/g, ' ').trim();
}
