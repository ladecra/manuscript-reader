// Markdown line-prefix shortcuts (Notion-style) for reader edit mode.
// Matched against the text from the start of the block to the caret, immediately
// before Space is inserted.

export type MarkdownBlockPromote =
  | { kind: 'chapter'; title: string }
  | { kind: 'heading'; level: 2 | 3 | 4; title: string }
  | { kind: 'blockquote'; title: string };

/** Longest-prefix wins: #### before ### before ## before #. */
export function matchMarkdownBlockPrefix(lineBeforeSpace: string): MarkdownBlockPromote | null {
  const s = lineBeforeSpace;
  let m = s.match(/^#### (.+)$/);
  if (m) return { kind: 'heading', level: 4, title: m[1].trim() };
  m = s.match(/^### (.+)$/);
  if (m) return { kind: 'heading', level: 3, title: m[1].trim() };
  m = s.match(/^## (.+)$/);
  if (m) return { kind: 'heading', level: 2, title: m[1].trim() };
  m = s.match(/^# (.+)$/);
  if (m) return { kind: 'chapter', title: m[1].trim() };
  m = s.match(/^> (.+)$/);
  if (m) return { kind: 'blockquote', title: m[1].trim() };
  return null;
}
