// ─── workflow-status check (assertions) ─────────────────────────────────────
// Runs the real derivation (deriveWorkflowStatus) over the fact combinations the
// Library row + manuscript Hub hang off, and asserts the lifecycle contract:
//   • returned feedback outranks transport — an imported-feedback manuscript that
//     was never share-flagged reads "Responses available," NOT "Not shared/Draft"
//     (the exact bug this replaces)
//   • a live link with no responses is "Shared"; a fresh import is "Ready to share"
//   • freezing a share that has responses advances to "Report ready"
//   • revoked collapses on feedback: responses → still available; none → draft
//   • determinism — same input in, same status out
//   Run with: npm run check-workflow-status
import { deriveWorkflowStatus } from '../src/engine/library/workflowStatus.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}
const stage = (input) => deriveWorkflowStatus(input).stage;

console.log('\n' + '─'.repeat(60));
console.log('CASE: fresh import — no share, no feedback');
{
  const s = deriveWorkflowStatus({ readerCount: 0 });
  check('stage is draft', s.stage === 'draft');
  check('label is "Ready to share" (not a non-status "Not shared")', s.label === 'Ready to share');
  check('tone neutral', s.tone === 'neutral');
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: live link, nobody has responded yet');
{
  check('explicit live share → shared', stage({ shareState: 'live', readerCount: 0 }) === 'shared');
  check('legacy shared flag → shared', stage({ legacyShared: true, readerCount: 0 }) === 'shared');
  check('frozen with no responses → shared', stage({ shareState: 'frozen', readerCount: 0 }) === 'shared');
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: THE BUG — imported feedback, never share-flagged');
{
  // No shareState, legacyShared falsy — exactly the AddFeedbackModal path that
  // merged sessions but never flipped `shared`. Must NOT read as draft/not-shared.
  const s = deriveWorkflowStatus({ readerCount: 3, newResponses: 2 });
  check('stage is responses (not draft)', s.stage === 'responses');
  check('label "Responses available"', s.label === 'Responses available');
  check('carries readerCount', s.readerCount === 3);
  check('carries newResponses', s.newResponses === 2);
  check('tone attention', s.tone === 'attention');
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: live share WITH responses');
{
  const s = deriveWorkflowStatus({ shareState: 'live', readerCount: 4, newResponses: 0 });
  check('stage responses', s.stage === 'responses');
  check('shareState carried through', s.shareState === 'live');
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: author froze the feedback set to work the report');
{
  const s = deriveWorkflowStatus({ shareState: 'frozen', readerCount: 5, newResponses: 0 });
  check('frozen + responses → report-ready', s.stage === 'report-ready');
  check('label "Report ready"', s.label === 'Report ready');
  check('tone done', s.tone === 'done');
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: revoked share collapses on feedback');
{
  check('revoked + responses → still available', stage({ shareState: 'revoked', readerCount: 2 }) === 'responses');
  check('revoked + no feedback → draft', stage({ shareState: 'revoked', readerCount: 0 }) === 'draft');
  check('revoked never counts as a live link', stage({ shareState: 'revoked', readerCount: 0 }) !== 'shared');
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: hardening — negative / fractional / missing counts');
{
  check('negative readerCount floors to 0 → draft', stage({ readerCount: -3 }) === 'draft');
  check('fractional readerCount floors (0.9 → 0)', stage({ readerCount: 0.9 }) === 'draft');
  check('undefined newResponses → 0', deriveWorkflowStatus({ readerCount: 1 }).newResponses === 0);
}

console.log('\n' + '─'.repeat(60));
console.log('CASE: determinism');
{
  const input = { shareState: 'frozen', readerCount: 5, newResponses: 1 };
  const a = JSON.stringify(deriveWorkflowStatus(input));
  const b = JSON.stringify(deriveWorkflowStatus(input));
  check('same input → identical output', a === b);
}

console.log('\n' + '─'.repeat(60));
if (failures) {
  console.error(`\n✗ ${failures} workflow-status check(s) failed`);
  process.exit(1);
}
console.log('\n✓ all workflow-status checks passed');
