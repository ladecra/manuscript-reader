// ─── Structural editing (the author's correction surface for ingestion) ───────
// Ingestion PROPOSES a spine; these ops let the author DISPOSE — rename a chapter,
// merge a stray chapter into the one before it, and reclassify a chapter as front/
// back matter (or matter back into a chapter). They are the engine behind the
// Structure stage (the import-review screen and the Studio chapter map).
//
// Same contract as matterEdit: operate on the ALREADY-FENCED combinedMarkdown, keep
// the single combined markdown as the store of record, and reuse ONE fence-format
// authority (parseMatterDoc / reassembleMatterDoc / upsertMatterSection). Chapters
// live in the body as `# ` (ATX h1) headings — exactly what parseMarkdown splits on —
// so a chapter⇄matter move is a body↔fence transfer, nothing more. Pure and
// browser-independent; persist via libraryStore `replaceMarkdown` (re-parse, NOT
// re-preprocess — re-running the structure pass would re-classify the fences).

import type { MatterRole, MatterRegion } from '../types';
import {
  parseMatterDoc, reassembleMatterDoc, upsertMatterSection,
  removeMatterSectionAt, listMatterSections,
} from './matterEdit';
import { stripChapterLabel } from '../ingestion/parseMarkdown';

/** A chapter as it sits in the body: its heading text (sans `# `) and its prose. */
interface BodyChapter { heading: string; body: string; }
interface BodySplit { preamble: string; chapters: BodyChapter[]; }

/** A single-`#` ATX h1 line (a chapter opener). `## `/`### ` subheadings and the
 *  fenced matter (which carries no heading) are deliberately excluded. */
const CHAPTER_LINE = /^#\s+(.+?)\s*$/;

/** Split the chapter-bearing body into its chapters (document order). Any prose
 *  before the first `# ` heading is kept as `preamble` so nothing is dropped. */
function splitBody(body: string): BodySplit {
  const chapters: (BodyChapter & { lines: string[] })[] = [];
  const preamble: string[] = [];
  for (const line of body.split('\n')) {
    const m = !line.startsWith('##') ? CHAPTER_LINE.exec(line) : null;
    if (m) chapters.push({ heading: m[1].trim(), body: '', lines: [] });
    else if (chapters.length) chapters[chapters.length - 1].lines.push(line);
    else preamble.push(line);
  }
  return {
    preamble: preamble.join('\n').trim(),
    chapters: chapters.map(({ heading, lines }) => ({ heading, body: lines.join('\n').trim() })),
  };
}

/** Reassemble the body from preamble + chapters (`# heading` then prose). */
function joinBody({ preamble, chapters }: BodySplit): string {
  const parts: string[] = [];
  if (preamble) parts.push(preamble);
  for (const c of chapters) parts.push(c.body ? `# ${c.heading}\n\n${c.body}` : `# ${c.heading}`);
  return parts.join('\n\n');
}

/** Sanitize a heading the author typed: strip any leading `#`, collapse newlines. */
const cleanHeading = (s: string): string =>
  s.replace(/^#+\s*/, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Transform the body in place within the full document, preserving matter fences. */
function editBody(md: string, fn: (s: BodySplit) => BodySplit | void): string {
  const doc = parseMatterDoc(md);
  const split = splitBody(doc.body);
  const next = fn(split) ?? split;
  doc.body = joinBody(next);
  return reassembleMatterDoc(doc);
}

// ─── Chapter ops (1-based ordinal = the chapter's position in document order, the
//     same order buildManuscriptStructure lists them) ───────────────────────────

/** Rename the nth chapter's heading. No-op for an out-of-range ordinal or a title
 *  that sanitizes to empty. */
export function renameChapter(md: string, ordinal: number, title: string): string {
  const heading = cleanHeading(title);
  if (!heading) return md;
  return editBody(md, ({ chapters }) => {
    if (ordinal < 1 || ordinal > chapters.length) return;
    chapters[ordinal - 1].heading = heading;
  });
}

/** Merge the nth chapter into the one before it: drop its `# ` heading so its prose
 *  joins the previous chapter. No-op for the first chapter (nothing above in body). */
export function mergeChapterUp(md: string, ordinal: number): string {
  return editBody(md, ({ chapters }) => {
    if (ordinal < 2 || ordinal > chapters.length) return;
    const prev = chapters[ordinal - 2];
    const cur = chapters[ordinal - 1];
    prev.body = [prev.body, cur.body].filter(Boolean).join('\n\n');
    chapters.splice(ordinal - 1, 1);
  });
}

/** Reclassify the nth chapter as a front/back-matter section (e.g. a titled bio
 *  mis-read as a chapter → back-matter `about-author`). The chapter's prose becomes
 *  the section body; its heading (chapter label stripped) becomes the section title.
 *  Placed canonically for its role via upsertMatterSection. No-op for a bad ordinal. */
export function reclassifyChapterAsMatter(
  md: string, ordinal: number, region: MatterRegion, role: MatterRole,
): string {
  const doc = parseMatterDoc(md);
  const split = splitBody(doc.body);
  if (ordinal < 1 || ordinal > split.chapters.length) return md;
  const [chapter] = split.chapters.splice(ordinal - 1, 1);
  doc.body = joinBody(split);
  const withoutChapter = reassembleMatterDoc(doc);
  const matterTitle = cleanHeading(stripChapterLabel(chapter.heading));
  const chapterProse = chapter.body
    ? (matterTitle ? `${matterTitle}\n\n${chapter.body}` : chapter.body)
    : matterTitle;
  const p0 = parseMatterDoc(withoutChapter);
  const list = region === 'front' ? p0.front : p0.back;
  const existingIdx = list.findIndex(s => s.role === role);
  if (existingIdx >= 0) {
    const target = list[existingIdx];
    target.title = target.title || matterTitle;
    target.body = [target.body, chapterProse].filter(Boolean).join('\n\n');
    return reassembleMatterDoc(p0);
  }
  return upsertMatterSection(withoutChapter, {
    region, role, title: matterTitle, body: chapterProse,
  });
}

/** Reclassify a matter section back into a body chapter (a false-positive matter
 *  detection). `matterIndex` is 0-based within the region (front or back). A front
 *  section becomes the first chapter; a back section the last. */
export function reclassifyMatterAsChapter(md: string, region: MatterRegion, matterIndex: number): string {
  const { front, back } = listMatterSections(md);
  const list = region === 'front' ? front : back;
  const section = list[matterIndex];
  if (!section) return md;
  const removed = removeMatterSectionAt(md, region, matterIndex);
  const doc = parseMatterDoc(removed);
  const split = splitBody(doc.body);
  const chapter: BodyChapter = {
    heading: cleanHeading(section.title) || section.role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    body: section.body,
  };
  if (region === 'front') split.chapters.unshift(chapter);
  else split.chapters.push(chapter);
  doc.body = joinBody(split);
  return reassembleMatterDoc(doc);
}

/** Change a matter section's role (e.g. mis-filed `title-page` → `foreword`) without
 *  moving it into the chapter body. `matterIndex` is 0-based within the region. */
export function reclassifyMatterRole(
  md: string, region: MatterRegion, matterIndex: number, role: MatterRole,
): string {
  const p = parseMatterDoc(md);
  const list = region === 'front' ? p.front : p.back;
  if (matterIndex < 0 || matterIndex >= list.length) return md;
  const [sec] = list.splice(matterIndex, 1);
  const out = reassembleMatterDoc(p);
  const existing = (region === 'front' ? parseMatterDoc(out).front : parseMatterDoc(out).back)
    .find(s => s.role === role);
  if (existing) {
    const p2 = parseMatterDoc(out);
    const target = (region === 'front' ? p2.front : p2.back).find(s => s.role === role)!;
    target.title = target.title || sec.title;
    target.body = [target.body, sec.body].filter(Boolean).join('\n\n');
    return reassembleMatterDoc(p2);
  }
  return upsertMatterSection(out, { region, role, title: sec.title, body: sec.body });
}
