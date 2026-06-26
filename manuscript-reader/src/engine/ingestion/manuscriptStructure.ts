// ─── Structural model builder (Stage 0 — the publish-ready linchpin) ──────────
// Lifts parseMarkdown's flat block stream into a grouped ManuscriptStructure:
// front matter → chapters (with scene breaks) → back matter. Pure and browser-
// independent — every downstream stage (publish-ready renderer, tiering, query
// export) renders from THIS instead of re-parsing markdown.
//
// Front/back matter is now CAPTURED (classify-and-keep in preprocessMarkdown):
// retained sections arrive as `region`-tagged blocks, each opened by a
// `matter-heading` block carrying the classified `matterRole` + display title.
// We group those into MatterSections here.

import type {
  ManuscriptStructure, ChapterSection, StructuralBlock, MatterSection, MatterRegion,
} from '../types';
import { getParsedManuscript } from './parseCache';

const TITLE_COMMENT = /<!--\s*title:\s*([\s\S]*?)\s*-->/i;

/** Group a region's blocks into sections, one per `matter-heading` marker. */
function groupMatter(blocks: StructuralBlock[], region: MatterRegion): MatterSection[] {
  const sections: MatterSection[] = [];
  let cur: MatterSection | null = null;
  for (const b of blocks) {
    if (b.region !== region) continue;
    if (b.role === 'matter-heading') {
      cur = { role: b.matterRole ?? 'other', region, title: b.text, blocks: [] };
      sections.push(cur);
    } else if (cur) {
      cur.blocks.push(b);
    } else {
      // A region block with no preceding heading (shouldn't happen — the fence
      // always emits a heading marker first). Open an untitled section to keep it.
      cur = { role: 'other', region, title: '', blocks: [b] };
      sections.push(cur);
    }
  }
  return sections;
}

export function buildManuscriptStructure(md: string): ManuscriptStructure {
  // Cached parse: the hub builds the structural model on the same source it (and
  // the reader) already parsed for html/chapters — reuse it instead of re-parsing.
  const { chapters, blocks } = getParsedManuscript(md);

  const titleMatch = TITLE_COMMENT.exec(md);
  const title = titleMatch ? titleMatch[1].trim() : (chapters[0]?.title ?? '');

  const frontMatter = groupMatter(blocks, 'front');
  const backMatter = groupMatter(blocks, 'back');

  // Body blocks grouped by owning chapter. Matter blocks (region set) and the
  // chapter-heading blocks (the chapters array already carries them) are excluded.
  const byChapter = new Map<number, StructuralBlock[]>();
  for (const b of blocks) {
    if (b.region || b.role === 'chapter-heading') continue;
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
    backMatter,
    blocks,
  };
}
