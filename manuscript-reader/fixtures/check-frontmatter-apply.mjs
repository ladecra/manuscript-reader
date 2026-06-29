// ─── Front-matter candidate apply check (headless) ───────────────────────────
// The safety contract behind the Publishing Studio's "Use these details" prompt:
// detected candidates fill ONLY empty fields and NEVER overwrite author input.
// Run with: npm run check-frontmatter-apply
import {
  proposeFrontMatter,
  applyFrontMatterCandidates,
} from '../src/engine/ingestion/frontMatterExtract.ts';

let failures = 0;
const check = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗'}  ${name}${extra ? ` — ${extra}` : ''}`); if (!cond) failures++; };

const candidates = {
  author: 'Jane Marlowe',
  isbn: '9781234567897',
  copyrightYear: '2024',
  copyrightHolder: 'Jane Marlowe',
  publisher: 'Hollow Press',
  dedication: 'For R.',
};

// ── 1. Empty target → every candidate is proposed and applied ──
{
  const target = { author: undefined, publishing: {} };
  const proposals = proposeFrontMatter(target, candidates);
  check('proposes all 6 detected fields on an empty target', proposals.length === 6, `got ${proposals.length}`);
  const merged = applyFrontMatterCandidates(target, candidates);
  check('applies author to the manuscript field', merged.author === 'Jane Marlowe');
  check('applies isbn to publishing', merged.publishing.isbn === '9781234567897');
  check('applies dedication to publishing', merged.publishing.dedication === 'For R.');
}

// ── 2. Author input is NEVER overwritten (the safety contract) ──
{
  const target = { author: 'My Real Name', publishing: { isbn: '0000000000000', copyrightYear: '' } };
  const proposals = proposeFrontMatter(target, candidates);
  const fields = proposals.map(p => p.field);
  check('does not propose author (already filled)', !fields.includes('author'));
  check('does not propose isbn (already filled)', !fields.includes('isbn'));
  check('proposes copyrightYear (empty string counts as empty)', fields.includes('copyrightYear'));
  const merged = applyFrontMatterCandidates(target, candidates);
  check('keeps the author-entered name', merged.author === 'My Real Name');
  check('keeps the author-entered isbn', merged.publishing.isbn === '0000000000000');
  check('fills the empty copyrightYear', merged.publishing.copyrightYear === '2024');
}

// ── 3. Purity — inputs are not mutated ──
{
  const target = { author: undefined, publishing: { isbn: 'keep' } };
  const before = JSON.stringify(target);
  applyFrontMatterCandidates(target, candidates);
  check('does not mutate the input target', JSON.stringify(target) === before);
}

// ── 4. Subset apply (per-field accept) ──
{
  const target = { author: undefined, publishing: {} };
  const merged = applyFrontMatterCandidates(target, candidates, ['author']);
  check('subset applies only the named field', merged.author === 'Jane Marlowe' && merged.publishing.isbn === undefined);
}

// ── 5. No candidates → no proposals, identity merge ──
{
  const target = { author: 'X', publishing: { isbn: 'Y' } };
  check('no proposals when nothing detected', proposeFrontMatter(target, {}).length === 0);
  const merged = applyFrontMatterCandidates(target, {});
  check('identity merge preserves values', merged.author === 'X' && merged.publishing.isbn === 'Y');
}

console.log(failures === 0 ? '\nAll front-matter apply checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
