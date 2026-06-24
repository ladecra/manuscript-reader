// ─── Version-snapshot storage check (Phase 8) ───────────────────────────────
// Exercises the REAL capture primitive (engine/snapshots) and the REAL storage
// providers (IndexedDbProvider via fake-indexeddb, LocalStorageProvider via a
// localStorage shim) through their full contract: capture → save → list (light
// index, no bodies) → load (rejoined body) → content-addressed dedup → delete
// reclaiming bodies only when unreferenced → manuscript-delete cascade.
//   Run with: npm run check-snapshots
import 'fake-indexeddb/auto';
import { createSnapshot, markdownDiffersFromSnapshot } from '../src/engine/snapshots.ts';
import { manuscriptVersionId } from '../src/engine/manuscript/manuscriptVersion.ts';
import { IndexedDbProvider } from '../src/engine/storage/indexedDbProvider.ts';
import { LocalStorageProvider } from '../src/engine/storage/localStorageProvider.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

// Minimal localStorage shim so the localStorage provider runs under Node.
function installLocalStorageShim() {
  const m = new Map();
  globalThis.localStorage = {
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
  };
}
installLocalStorageShim();

const ANNS = [
  { id: 'a1', type: 'note', readerId: 'rA', readerName: 'Ada', quote: 'the basalt rise' },
  { id: 'a2', type: 'question', readerId: 'rB', readerName: 'Bo', quote: 'cooking pot' },
];
const SESSIONS = [
  { id: 's1', manuscriptId: 'frost', readerId: 'rB', readerName: 'Bo', startedAt: 1, progress: 0.6, annotationIds: ['a2'] },
];
const MD_V1 = '# One\n\nThe trial chamber sat on the basalt rise.\n\n# Two\n\nWe called it the cooking pot.\n';
const MD_V2 = '# One\n\nThe trial chamber sat high on the basalt rise above the river.\n\n# Two\n\nWe called it the cooking pot.\n';

async function runProvider(name, provider) {
  console.log('\n' + '─'.repeat(60));
  console.log('PROVIDER:', name);

  // Capture two distinct drafts + a re-capture of v1 (same text, new label).
  const s1 = createSnapshot({ manuscriptId: 'frost', markdown: MD_V1, annotations: ANNS, sessions: SESSIONS,
    wordCount: 11, chapterCount: 2, trigger: 'import', label: 'Draft 1', now: 1000, id: 'snap-1' });
  const s2 = createSnapshot({ manuscriptId: 'frost', markdown: MD_V2, annotations: ANNS, sessions: SESSIONS,
    wordCount: 13, chapterCount: 2, trigger: 'manual', label: 'Draft 2', parentId: 'snap-1', now: 2000, id: 'snap-2' });
  const s1b = createSnapshot({ manuscriptId: 'frost', markdown: MD_V1, annotations: [], sessions: [],
    wordCount: 11, chapterCount: 2, trigger: 'manual', label: 'Draft 1 (dup text)', now: 3000, id: 'snap-1b' });

  for (const s of [s1, s2, s1b]) await provider.saveSnapshot(s);

  // listSnapshots is the LIGHT index — must carry meta, must NOT carry bodies.
  const idx = await provider.listSnapshots('frost');
  check('list returns all 3 snapshots, createdAt-ordered', idx.length === 3 && idx[0].id === 'snap-1' && idx[2].id === 'snap-1b');
  check('list is light (no markdown / annotations / sessions on meta)',
    idx.every(m => !('markdown' in m) && !('annotations' in m) && !('sessions' in m)));
  check('meta carries label, trigger, parentId, versionId, counts',
    idx[1].label === 'Draft 2' && idx[1].trigger === 'manual' && idx[1].parentId === 'snap-1' &&
    idx[1].versionId === manuscriptVersionId(MD_V2) && idx[1].wordCount === 13);

  // loadSnapshot rejoins the frozen body + inputs.
  const full = await provider.loadSnapshot('frost', 'snap-2');
  check('load rejoins frozen markdown body', full?.markdown === MD_V2);
  check('load carries frozen annotations + sessions', full?.annotations.length === 2 && full?.sessions[0].annotationIds[0] === 'a2');
  check('frozen content matches versionId (content address)', manuscriptVersionId(full.markdown) === full.versionId);

  // Content-addressing: snap-1 and snap-1b share identical text ⇒ one body.
  check('identical text dedups to one body (snap-1 ≡ snap-1b versionId)', s1.versionId === s1b.versionId && s1.versionId !== s2.versionId);
  const dup = await provider.loadSnapshot('frost', 'snap-1b');
  check('dup snapshot still loads its (shared) body', dup?.markdown === MD_V1);

  // Delete snap-1: body must SURVIVE (snap-1b still references the shared versionId).
  await provider.deleteSnapshot('frost', 'snap-1');
  check('after deleting snap-1, snap-1b body still resolves (shared body kept)',
    (await provider.loadSnapshot('frost', 'snap-1b'))?.markdown === MD_V1);
  check('list now has 2', (await provider.listSnapshots('frost')).length === 2);

  // Delete snap-1b: now the shared body is unreferenced ⇒ reclaimed; snap-2 untouched.
  await provider.deleteSnapshot('frost', 'snap-1b');
  check('snap-2 still intact after sibling deletes', (await provider.loadSnapshot('frost', 'snap-2'))?.markdown === MD_V2);

  // Manuscript-delete cascade removes everything snapshot-related.
  await provider.deleteManuscript('frost');
  check('manuscript delete cascades snapshots to empty', (await provider.listSnapshots('frost')).length === 0);
  check('manuscript delete reclaims bodies (load returns null)', (await provider.loadSnapshot('frost', 'snap-2')) === null);
}

// Pure primitive checks.
console.log('PRIMITIVE: createSnapshot / markdownDiffers');
const p1 = createSnapshot({ manuscriptId: 'm', markdown: MD_V1, annotations: ANNS, sessions: SESSIONS, wordCount: 11, chapterCount: 2, trigger: 'import', now: 1, id: 'x' });
check('versionId is the content address of markdown', p1.versionId === manuscriptVersionId(MD_V1));
check('no derived signals frozen on the snapshot', !('signals' in p1) && !('report' in p1));
check('defensive copy — mutating source annotation does not bleed into snapshot', (ANNS[0].quote = 'mutated', p1.annotations[0].quote === 'the basalt rise'));
check('markdownDiffersFromSnapshot true on edit, false on identical', markdownDiffersFromSnapshot(MD_V2, p1) && !markdownDiffersFromSnapshot(MD_V1, p1));

await runProvider('IndexedDB (fake-indexeddb)', new IndexedDbProvider());
await runProvider('localStorage (shim)', new LocalStorageProvider());

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
