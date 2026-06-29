// ─── Authored matter editing (front/back-matter sections in the source md) ────
// Lets the author ADD / EDIT / REMOVE front and back matter (a dedication,
// epigraph, acknowledgements, about-the-author…) the draft doesn't already carry.
//
// The store of record stays the single combined markdown: authored sections are
// written as the SAME comment-fenced regions ingestion produces
// (`<!-- matter:REGION role="ROLE" title="TITLE" -->` … `<!-- /matter -->`), so
// every export path (DOCX/EPUB/SMF/Markdown) and the reader already render them —
// no new renderer plumbing, and naive `# `-splitters stay correct (a fence carries
// no heading). Pure and browser-independent.
//
// IMPORTANT: operate on the ALREADY-FENCED combinedMarkdown (the output of
// preprocessMarkdown, which is what's stored). Persist via libraryStore
// `replaceMarkdown` (re-parses, does NOT re-run preprocessMarkdown) — re-running
// the structure pass over fenced markdown would re-classify the fences. The
// matterEditRoundTrip fixture guards this contract.

import type { MatterRole, MatterRegion } from '../types';

export interface AuthoredMatter {
  region: MatterRegion;
  role: MatterRole;
  title: string;
  /** Plain prose; paragraphs separated by blank lines. */
  body: string;
}

/** Canonical publishing order for matter roles (front sequence, then back). New
 *  sections are inserted at their conventional position so the author doesn't have
 *  to order them by hand; they can still reorder afterward. Roles not listed sort
 *  to the end of their region. */
export const CANONICAL_ORDER: MatterRole[] = [
  // front
  'half-title', 'frontispiece', 'title-page', 'copyright', 'dedication', 'epigraph',
  'foreword', 'preface', 'introduction', 'cast', 'list-of-illustrations',
  // back
  'acknowledgements', 'afterword', 'about-author', 'also-by', 'appendix', 'glossary',
  'bibliography', 'notes', 'index', 'reading-group-guide', 'excerpt', 'colophon', 'other',
];

const canonicalIndex = (role: MatterRole): number => {
  const i = CANONICAL_ORDER.indexOf(role);
  return i < 0 ? CANONICAL_ORDER.length : i;
};

/** Roles whose body is a LIST of short lines (book titles, illustration entries),
 *  not flowing prose — each line is its own item, rendered one-per-line. Stored as
 *  blank-line-separated paragraphs so the lines survive markdown's soft-break
 *  collapse and each becomes its own block. */
export const LIST_MATTER_ROLES: ReadonlySet<MatterRole> = new Set<MatterRole>(['also-by', 'list-of-illustrations']);
export const isListMatter = (role: MatterRole): boolean => LIST_MATTER_ROLES.has(role);

/** Normalize a list-matter body: one item per source line → blank-line-separated
 *  paragraphs (so parseMarkdown keeps them as distinct blocks). */
export function normalizeListBody(body: string): string {
  return body.split('\n').map(l => l.trim()).filter(Boolean).join('\n\n');
}

// A fresh regex each call — global state on a shared /g RegExp is a footgun.
const fenceRe = () =>
  /<!--\s*matter:(front|back)\s+role="([^"]*)"\s+title="([^"]*)"\s*-->\n?([\s\S]*?)\n?<!--\s*\/matter\s*-->/g;
const titleRe = () => /^<!--\s*title:[\s\S]*?-->/;

/** Emit one fence in the exact format ingestion produces (mirrors emitFence in
 *  preprocessMarkdown — kept in sync by the round-trip fixture). */
function emit(s: AuthoredMatter): string {
  const title = s.title.replace(/["<>]/g, '').trim();
  const body = s.body.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return `<!-- matter:${s.region} role="${s.role}" title="${title}" -->\n${body}\n<!-- /matter -->`;
}

interface Parsed { title: string; front: AuthoredMatter[]; body: string; back: AuthoredMatter[]; }

function parse(md: string): Parsed {
  const tm = titleRe().exec(md.trim());
  const title = tm ? tm[0] : '';
  const front: AuthoredMatter[] = [];
  const back: AuthoredMatter[] = [];
  const re = fenceRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const sec: AuthoredMatter = {
      region: m[1] as MatterRegion,
      role: m[2] as MatterRole,
      title: m[3],
      body: m[4].trim(),
    };
    (sec.region === 'front' ? front : back).push(sec);
  }
  // Body = everything that is neither the title comment nor a fence.
  let body = md;
  if (title) body = body.replace(title, '');
  body = body.replace(fenceRe(), '').replace(/\n{3,}/g, '\n\n').trim();
  return { title, front, body, back };
}

/** Reassemble in the canonical order ingestion uses: title · front fences · body ·
 *  back fences — normalized, so the output matches a freshly-structured manuscript. */
function reassemble(p: Parsed): string {
  const titleComment = p.title ? p.title.trim() + '\n\n' : '';
  const parts = [...p.front.map(emit), p.body, ...p.back.map(emit)].filter(Boolean);
  return (titleComment + parts.join('\n\n')).trim();
}

/** Insert a section (or replace the existing one of the same region+role). A new
 *  section is placed at its CANONICAL position (the author can reorder afterward);
 *  replacing one keeps its current position. List-matter bodies (also-by…) are
 *  normalized so each line survives as its own item. Returns the new markdown. */
export function upsertMatterSection(md: string, section: AuthoredMatter): string {
  const p = parse(md);
  const sec: AuthoredMatter = isListMatter(section.role)
    ? { ...section, body: normalizeListBody(section.body) }
    : section;
  const list = sec.region === 'front' ? p.front : p.back;
  const idx = list.findIndex(s => s.role === sec.role);
  if (idx >= 0) {
    list[idx] = sec;            // replace in place — preserve author's ordering
  } else {
    // Insert before the first existing section that sorts later canonically.
    const at = list.findIndex(s => canonicalIndex(s.role) > canonicalIndex(sec.role));
    if (at < 0) list.push(sec);
    else list.splice(at, 0, sec);
  }
  return reassemble(p);
}

/** Move a section one step earlier (dir -1) or later (dir +1) within its region.
 *  No-op at the ends. Order is the published order. */
export function moveMatterSection(md: string, region: MatterRegion, role: MatterRole, dir: -1 | 1): string {
  const p = parse(md);
  const list = region === 'front' ? p.front : p.back;
  const i = list.findIndex(s => s.role === role);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return md;
  [list[i], list[j]] = [list[j], list[i]];
  return reassemble(p);
}

/** Remove the section of this region+role, if present. */
export function removeMatterSection(md: string, region: MatterRegion, role: MatterRole): string {
  const p = parse(md);
  if (region === 'front') p.front = p.front.filter(s => s.role !== role);
  else p.back = p.back.filter(s => s.role !== role);
  return reassemble(p);
}

/** The authored/captured matter sections currently in the markdown (for listing). */
export function listMatterSections(md: string): { front: AuthoredMatter[]; back: AuthoredMatter[] } {
  const p = parse(md);
  return { front: p.front, back: p.back };
}
