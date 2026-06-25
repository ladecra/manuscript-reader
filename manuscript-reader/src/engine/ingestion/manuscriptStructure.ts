// ─── Structural model builder (Stage 0 — the publish-ready linchpin) ──────────
// Lifts parseMarkdown's flat block stream into a grouped ManuscriptStructure:
// front matter → chapters (with scene breaks) → back matter. Pure and browser-
// independent — every downstream stage (publish-ready renderer, tiering, query
// export) renders from THIS instead of re-parsing markdown.
//
// SCOPE TODAY (scaffold): grouping is faithful for the BODY (chapters, scene
// breaks, block roles). Front/back matter is sparse because the ingestion
// pipeline (`structureManuscript` in preprocessMarkdown.ts) strips front matter
// and drops back matter *before* this runs — so there is little left to group.
// Retaining that matter is the key Stage-0/1 follow-up; the model has the slots
// ready (`frontMatter`/`backMatter`) for when capture lands.

import type { ManuscriptStructure, ChapterSection, StructuralBlock } from '../types';
import { getParsedManuscript } from './parseCache';

const TITLE_COMMENT = /<!--\s*title:\s*([\s\S]*?)\s*-->/i;

export function buildManuscriptStructure(md: string): ManuscriptStructure {
  // Cached parse: the hub builds the structural model on the same source it (and
  // the reader) already parsed for html/chapters — reuse it instead of re-parsing.
  const { chapters, blocks } = getParsedManuscript(md);

  const titleMatch = TITLE_COMMENT.exec(md);
  const title = titleMatch ? titleMatch[1].trim() : (chapters[0]?.title ?? '');

  // Forematter region = everything before the first chapter heading.
  const frontMatter = blocks.filter(b => b.chapterIndex === 0);

  // Body blocks grouped by owning chapter (the chapter-heading block defines the
  // section via the chapters array, so it isn't repeated in the body list).
  const byChapter = new Map<number, StructuralBlock[]>();
  for (const b of blocks) {
    if (b.chapterIndex === 0 || b.role === 'chapter-heading') continue;
    const arr = byChapter.get(b.chapterIndex);
    if (arr) arr.push(b);
    else byChapter.set(b.chapterIndex, [b]);
  }

  const chapterSections: ChapterSection[] = chapters.map(c => {
    const body = byChapter.get(c.index) ?? [];
    return {
      index: c.index,
      id: c.id,
      title: c.title,
      blocks: body,
      sceneBreakCount: body.filter(b => b.role === 'scene-break').length,
    };
  });

  return {
    title,
    frontMatter,
    chapters: chapterSections,
    backMatter: [], // dropped upstream by structureManuscript — capture is the follow-up
    blocks,
  };
}
