// ─── Publishing assembly stage check (headless) ──────────────────────────────
// The stage model over readiness: Structure → Matter → Details → Preview, with
// per-format status (complete / optional-open / attention / not-applicable).
// Run with: npm run check-assembly
import { computeAssembly } from '../src/engine/publishing/assembly.ts';

let failures = 0;
const check = (name, cond) => { console.log(`  ${cond ? '✓' : '✗'}  ${name}`); if (!cond) failures++; };

const structureWith = (frontRoles = [], backRoles = [], chapterCount = 0) => ({
  title: 'X',
  frontMatter: frontRoles.map(role => ({ role, region: 'front', title: '', blocks: [] })),
  chapters: Array.from({ length: chapterCount }, (_, i) => ({
    id: `ch-${i}`, index: i, title: `Chapter ${i + 1}`, blocks: [], sceneBreakCount: 0,
  })),
  backMatter: backRoles.map(role => ({ role, region: 'back', title: '', blocks: [] })),
  blocks: [],
});

const stage = (asm, id) => asm.stages.find(s => s.id === id);

// ── SMF: matter not-applicable; details attention while author missing ──
{
  const asm = computeAssembly(
    { title: 'The Open Hand', author: '', publishing: {}, structure: structureWith([], [], 12) },
    'smf',
  );
  check('SMF matter stage is not-applicable', stage(asm, 'matter').status === 'not-applicable');
  check('SMF matter sub explains why', stage(asm, 'matter').summary === 'Not used for agent submission');
  check('SMF details attention when author missing', stage(asm, 'details').status === 'attention');
  check('SMF structure complete with chapters', stage(asm, 'structure').status === 'complete');
  check('SMF structure sub counts chapters', stage(asm, 'structure').summary === '12 chapters');
}

// ── SMF ready: title + author satisfies the agent submission ──
{
  const asm = computeAssembly(
    { title: 'The Open Hand', author: 'Jane Marlowe', publishing: {}, structure: structureWith([], [], 12) },
    'smf',
  );
  check('SMF details complete with title + author', stage(asm, 'details').status === 'complete');
  check('SMF readiness requiredMet', asm.readiness.requiredMet === true);
  check('SMF preview is optional-open stub', stage(asm, 'preview').status === 'optional-open');
}

// ── DOCX: details attention without copyright; matter optional (renders, none required) ──
{
  const asm = computeAssembly(
    { title: 'The Open Hand', author: 'Jane Marlowe', publishing: {}, structure: structureWith([], [], 12) },
    'docx',
  );
  check('DOCX details attention without copyright', stage(asm, 'details').status === 'attention');
  check('DOCX matter applies (optional-open)', stage(asm, 'matter').status === 'optional-open');
  check('DOCX matter sub when none added', stage(asm, 'matter').summary === 'Optional — none added');
}

// ── DOCX with copyright: details drop to optional-open (isbn/synopsis/etc. open) ──
{
  const asm = computeAssembly(
    {
      title: 'The Open Hand', author: 'Jane Marlowe',
      publishing: { copyrightYear: '2024', copyrightHolder: 'Jane Marlowe' },
      structure: structureWith([], ['about-author'], 12),
    },
    'docx',
  );
  check('DOCX details optional-open once required met', stage(asm, 'details').status === 'optional-open');
  check('DOCX matter counts authored sections', stage(asm, 'matter').summary === '1 section');
}

// ── EPUB: copyright optional; structure complete with chapters ──
{
  const asm = computeAssembly(
    { title: 'T', author: 'A', publishing: {}, structure: structureWith([], [], 5) },
    'epub',
  );
  check('EPUB structure complete', stage(asm, 'structure').status === 'complete');
  check('EPUB details optional-open (copyright optional)', stage(asm, 'details').status === 'optional-open');
  check('EPUB matter applies', stage(asm, 'matter').status === 'optional-open');
}

// ── No source: structure attention, canExport false ──
{
  const asm = computeAssembly({ title: 'T', author: 'A', publishing: {}, structure: null }, 'docx', { hasSource: false });
  check('no-source structure attention', stage(asm, 'structure').status === 'attention');
  check('no-source canExport false', asm.canExport === false);
}

// ── Container shape: format echoed, four stages in order, readiness folded in ──
{
  const asm = computeAssembly({ title: 'T', author: 'A', publishing: {}, structure: structureWith([], [], 3) }, 'docx');
  check('format echoed', asm.format === 'docx');
  check('four stages in rail order', asm.stages.map(s => s.id).join(',') === 'structure,matter,details,preview');
  check('readiness summary present', typeof asm.readiness.requiredMet === 'boolean');
  check('canExport defaults from structure presence', asm.canExport === true);
}

console.log(failures === 0 ? '\nAll assembly checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
