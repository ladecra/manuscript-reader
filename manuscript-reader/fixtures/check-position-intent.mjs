// Verifies the mode-aware position rule: which persistence channel each reader
// mode writes to. Reading owns the canonical progress; Annotations/Changes keep
// private work bookmarks; Manuscript (editing) persists nothing.
// Run with: npm run check-position-intent
import { positionChannelForMode, isWorkMode } from '../src/engine/reader/positionIntent.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

check('reading → canonical reading-progress', positionChannelForMode('reading') === 'reading-progress');
check('annotations → its own work bookmark', positionChannelForMode('annotations') === 'annotations');
check('changes → its own work bookmark', positionChannelForMode('changes') === 'changes');
check('manuscript (editing) → persists nothing', positionChannelForMode('manuscript') === null);

check('reading is NOT a work mode (drives progress)', !isWorkMode('reading-progress'));
check('annotations IS a work mode', isWorkMode('annotations'));
check('changes IS a work mode', isWorkMode('changes'));
check('null is NOT a work mode', !isWorkMode(null));

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
