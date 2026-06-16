// ─── Manuscript export · Markdown ─────────────────────────────────────────────
// The revised manuscript as the author leaves with it: the source markdown is
// already the live text (edit mode rewrites it in place), so a clean Markdown
// export is just the source with the internal <!-- title: --> marker stripped.
// Portable and version-control friendly. Pure assembly + one DOM call.

/** The current manuscript source as clean Markdown — the title marker removed and
 *  surrounding whitespace tidied. Pure: no DOM. */
export function cleanManuscriptMarkdown(combinedMarkdown: string): string {
  return combinedMarkdown
    .replace(/\r\n/g, '\n')
    .replace(/^\s*<!--\s*title:[\s\S]*?-->\s*\n?/i, '') // internal title marker only
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

/** A filesystem-friendly base name from the manuscript title (falls back to the id). */
export function exportSlug(title: string, id: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return slug || id || 'manuscript';
}

export function exportManuscriptMarkdown(title: string, id: string, combinedMarkdown: string): void {
  const md = cleanManuscriptMarkdown(combinedMarkdown);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exportSlug(title, id)}-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
