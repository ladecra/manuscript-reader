// ─── Manuscript export · Markdown ─────────────────────────────────────────────
// The revised manuscript as the author leaves with it: the source markdown is
// already the live text (edit mode rewrites it in place), so a clean Markdown
// export is the source with the internal <!-- title: --> marker stripped, plus a
// YAML front-matter block carrying the author's publishing metadata (Pandoc and
// most static-site/ebook toolchains read this). Pure assembly + one DOM call.

import type { PublishingMetadata } from '../types';

/** The author-supplied data an export renders into front matter. Shared by the
 *  Markdown and DOCX manuscript exports so they stay in lockstep. */
export interface ExportManuscriptMeta {
  title: string;
  author?: string;
  publishing?: PublishingMetadata;
}

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

/** A composed copyright line from the parts the author supplied, or '' if none. */
export function copyrightLine(p: PublishingMetadata | undefined): string {
  if (!p) return '';
  const holder = p.copyrightHolder?.trim();
  const year = p.copyrightYear?.trim();
  if (!holder && !year) return '';
  return `© ${[year, holder].filter(Boolean).join(' ')}`.trim();
}

/** Build a YAML front-matter block from the metadata — present fields only, so the
 *  artifact never carries blank `isbn:` lines. Returns '' when nothing but a title
 *  exists (a lone title isn't worth a front-matter block in plain Markdown). */
function frontMatterYaml(meta: ExportManuscriptMeta): string {
  const p = meta.publishing ?? {};
  const esc = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
  const rows: [string, string | undefined][] = [
    ['title', meta.title],
    ['subtitle', p.subtitle],
    ['author', meta.author],
    ['series', p.series],
    ['publisher', p.publisher],
    ['imprint', p.imprint],
    ['isbn', p.isbn],
    ['edition', p.edition],
    ['date', p.publicationDate],
    ['lang', p.language],
    ['rights', p.rights],
    ['copyright', copyrightLine(p)],
    ['dedication', p.dedication],
  ];
  const present = rows.filter(([, v]) => v && v.trim());
  // A title alone doesn't justify a YAML block — only emit when there's real metadata.
  if (present.length <= 1) return '';
  return ['---', ...present.map(([k, v]) => `${k}: ${esc(v!.trim())}`), '---', '', ''].join('\n');
}

export function exportManuscriptMarkdown(meta: ExportManuscriptMeta, id: string, combinedMarkdown: string): void {
  const md = frontMatterYaml(meta) + cleanManuscriptMarkdown(combinedMarkdown);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exportSlug(meta.title, id)}-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
