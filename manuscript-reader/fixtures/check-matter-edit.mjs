// ─── Authored matter edit — round-trip through the real parser ────────────────
// The safety contract: a section injected by upsertMatterSection must read back
// through the SAME pipeline ingestion uses (parseMarkdown → buildManuscriptStructure)
// as the right region + role, and the body must NOT leak into the chapter text.
// Run with: npm run check-matter-edit
import { preprocessMarkdown } from '../src/engine/ingestion/preprocessMarkdown.ts';
import { buildManuscriptStructure } from '../src/engine/ingestion/manuscriptStructure.ts';
import {
  upsertMatterSection, removeMatterSection, listMatterSections, moveMatterSection,
} from '../src/engine/manuscript/matterEdit.ts';

let failures = 0;
const check = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗'}  ${name}${extra ? ` — ${extra}` : ''}`); if (!cond) failures++; };

// A real, fenced manuscript — exactly what gets stored (preprocess runs structure).
const raw = `# Chapter One

The first chapter body, long enough to read as real prose and not a stray line of front matter.

# Chapter Two

The second chapter, also with enough words to count as genuine narrative body text here.
`;
let md = preprocessMarkdown(raw);

const baseChapters = buildManuscriptStructure(md).chapters.length;
check('baseline parses two chapters', baseChapters === 2, `got ${baseChapters}`);

// ── Add a front epigraph and a back about-the-author ──
md = upsertMatterSection(md, { region: 'front', role: 'epigraph', title: 'Epigraph', body: 'All that is gold does not glitter.' });
md = upsertMatterSection(md, { region: 'back', role: 'about-author', title: 'About the Author', body: 'Jane Marlowe lives by the sea.\n\nHer second novel is forthcoming.' });

{
  const st = buildManuscriptStructure(md);
  check('chapter count unchanged after injecting matter', st.chapters.length === 2, `got ${st.chapters.length}`);
  const epi = st.frontMatter.find(s => s.role === 'epigraph');
  check('epigraph reads back as front matter', !!epi);
  check('epigraph body survived', !!epi && epi.blocks.map(b => b.text).join(' ').includes('gold does not glitter'));
  const about = st.backMatter.find(s => s.role === 'about-author');
  check('about-author reads back as back matter', !!about);
  check('about-author keeps both paragraphs', !!about && about.blocks.length >= 2);
  // The injected prose must NOT bleed into chapter bodies.
  const chapterText = st.chapters.map(c => c.blocks.map(b => b.text).join(' ')).join(' ');
  check('matter prose did not leak into chapters', !chapterText.includes('gold does not glitter') && !chapterText.includes('lives by the sea'));
}

// ── Upsert replaces (not duplicates) the same role ──
md = upsertMatterSection(md, { region: 'front', role: 'epigraph', title: 'Epigraph', body: 'Not all those who wander are lost.' });
{
  const { front } = listMatterSections(md);
  const epigraphs = front.filter(s => s.role === 'epigraph');
  check('upsert replaces same-role section (no duplicate)', epigraphs.length === 1, `got ${epigraphs.length}`);
  check('replacement body is the new text', epigraphs[0]?.body.includes('wander are lost'));
}

// ── Remove ──
md = removeMatterSection(md, 'back', 'about-author');
{
  const st = buildManuscriptStructure(md);
  check('about-author removed', !st.backMatter.some(s => s.role === 'about-author'));
  check('epigraph still present after unrelated remove', st.frontMatter.some(s => s.role === 'epigraph'));
  check('chapters still intact', st.chapters.length === 2);
}

// ── Canonical insertion order: add out of order, expect conventional order ──
{
  let m2 = preprocessMarkdown(raw);
  // Add back matter out of canonical order: also-by before acknowledgements.
  m2 = upsertMatterSection(m2, { region: 'back', role: 'also-by', title: 'Also by', body: 'Book A' });
  m2 = upsertMatterSection(m2, { region: 'back', role: 'acknowledgements', title: 'Acknowledgements', body: 'Thanks to all.' });
  const { back } = listMatterSections(m2);
  check('new sections land in canonical order (acknowledgements before also-by)',
    back.map(s => s.role).join(',') === 'acknowledgements,also-by', back.map(s => s.role).join(','));

  // Author reorders: move also-by up one.
  m2 = moveMatterSection(m2, 'back', 'also-by', -1);
  check('moveMatterSection reorders (also-by now first)',
    listMatterSections(m2).back.map(s => s.role).join(',') === 'also-by,acknowledgements');
  // Move at the end is a no-op.
  const before = m2;
  check('move past the start is a no-op', moveMatterSection(m2, 'back', 'also-by', -1) === before);
}

// ── List-matter normalization: one title per line survives as separate items ──
{
  let m3 = preprocessMarkdown(raw);
  m3 = upsertMatterSection(m3, { region: 'back', role: 'also-by', title: 'Also by', body: 'First Book\nSecond Book\nThird Book' });
  const st = buildManuscriptStructure(m3);
  const alsoBy = st.backMatter.find(s => s.role === 'also-by');
  check('also-by keeps three separate title blocks', !!alsoBy && alsoBy.blocks.length === 3, `got ${alsoBy?.blocks.length}`);
  check('titles are not run together', !!alsoBy && alsoBy.blocks[0].text === 'First Book');
}

console.log(failures === 0 ? '\nAll matter-edit round-trip checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
