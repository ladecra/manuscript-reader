// ─── Publish readiness check (headless) ──────────────────────────────────────
// The pre-export checklist: required (title/author/copyright) vs. recommended.
// Run with: npm run check-readiness
import { computePublishReadiness, summarizeReadiness } from '../src/engine/publishing/readiness.ts';

let failures = 0;
const check = (name, cond) => { console.log(`  ${cond ? '✓' : '✗'}  ${name}`); if (!cond) failures++; };

const structureWith = (frontRoles = [], backRoles = []) => ({
  title: 'X', frontMatter: frontRoles.map(role => ({ role, region: 'front', title: '', blocks: [] })),
  chapters: [], backMatter: backRoles.map(role => ({ role, region: 'back', title: '', blocks: [] })), blocks: [],
});

// ── Print (DOCX): title/author/copyright required ──
{
  const items = computePublishReadiness({ title: '', author: '', publishing: {}, structure: null }, 'docx');
  const sum = summarizeReadiness(items);
  check('DOCX required = title/author/copyright', items.filter(i => i.required).map(i => i.id).join(',') === 'title,author,copyright');
  check('nothing met on an empty manuscript', items.every(i => !i.met));
  check('requiredMet is false', sum.requiredMet === false);
  check('three required missing', sum.missingRequired === 3);
  check('isbn appears for print but is optional', items.find(i => i.id === 'isbn')?.required === false);
}

// ── Print required complete, optional open ──
{
  const items = computePublishReadiness({
    title: 'The Open Hand', author: 'Jane Marlowe',
    publishing: { copyrightYear: '2024', copyrightHolder: 'Jane Marlowe' }, structure: null,
  }, 'docx');
  const sum = summarizeReadiness(items);
  check('requiredMet true once title/author/copyright present', sum.requiredMet === true);
  check('optional items still missing', sum.missingOptional > 0);
}

// ── SMF (agent submission): only title + author; no copyright/ISBN/matter ──
{
  const items = computePublishReadiness({ title: 'The Open Hand', author: 'Jane Marlowe', publishing: {}, structure: null }, 'smf');
  const sum = summarizeReadiness(items);
  check('SMF checks only title + author', items.map(i => i.id).join(',') === 'title,author');
  check('SMF does not demand copyright', !items.some(i => i.id === 'copyright'));
  check('SMF ready with just title + author', sum.requiredMet === true && sum.missingOptional === 0);
}

// ── EPUB: title/author required, copyright recommended (not required) ──
{
  const items = computePublishReadiness({ title: 'T', author: 'A', publishing: {}, structure: null }, 'epub');
  const sum = summarizeReadiness(items);
  check('EPUB requires title + author only', items.filter(i => i.required).map(i => i.id).join(',') === 'title,author');
  check('EPUB lists copyright as optional', items.find(i => i.id === 'copyright')?.required === false);
  check('EPUB requiredMet with title + author', sum.requiredMet === true);
}

// ── Dedication satisfied by metadata OR a matter section (print) ──
{
  const viaMeta = computePublishReadiness({ title: 'T', author: 'A', publishing: { dedication: 'For R.' }, structure: null }, 'docx');
  check('dedication met via metadata field', viaMeta.find(i => i.id === 'dedication')?.met === true);
  const viaMatter = computePublishReadiness({ title: 'T', author: 'A', publishing: {}, structure: structureWith(['dedication']) }, 'docx');
  check('dedication met via a front-matter section', viaMatter.find(i => i.id === 'dedication')?.met === true);
}

// ── About-the-author detected in back matter (print) ──
{
  const items = computePublishReadiness({ title: 'T', author: 'A', publishing: {}, structure: structureWith([], ['about-author']) }, 'docx');
  check('about-the-author met when a back-matter section exists', items.find(i => i.id === 'about-author')?.met === true);
  check('its action routes to the matter pane', items.find(i => i.id === 'about-author')?.action === 'matter');
}

console.log(failures === 0 ? '\nAll readiness checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
