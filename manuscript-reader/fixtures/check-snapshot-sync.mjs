// ─── Snapshot cloud-sync reconcile check (Phase 8) ──────────────────────────
// Drives the REAL storage cache layer (engine/storage) — hydrate → local work →
// performSync — against a FAKE SupabaseSync (no network/auth). Verifies the
// presence-based snapshot reconcile: a local-only snapshot is pushed whole; a
// remote-only snapshot is pulled as a BODYLESS index entry, then its body
// lazy-streams + backfills on first loadSnapshot. The live Supabase wire itself
// is validated by running the app across devices; this checks the algorithm.
//   Run with: npm run check-snapshot-sync
import 'fake-indexeddb/auto';
import { manuscriptVersionId } from '../src/engine/manuscript/manuscriptVersion.ts';
import { createSnapshot } from '../src/engine/snapshots.ts';
import {
  hydrateStorage, saveLibrary, saveSnapshot, listSnapshots, loadSnapshot,
  configureSync, performSync,
} from '../src/engine/storage/index.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}
const flush = () => new Promise(r => setTimeout(r, 100)); // let background persist() settle

const MD_LOCAL = '# One\n\nThe trial chamber sat on the basalt rise.\n';
const MD_REMOTE = '# One\n\nThe gallery watched from behind iron latticework.\n';
const REMOTE_VID = manuscriptVersionId(MD_REMOTE);

// A remote snapshot record (meta + frozen children, NO markdown — bodies live in
// the bucket and lazy-pull). This is what fetchSnapshotRecords returns.
const remoteRec = {
  id: 'remote-1', manuscriptId: 'frost', createdAt: 5000, trigger: 'manual',
  label: 'Beta draft', versionId: REMOTE_VID, wordCount: 8, chapterCount: 1,
  annotations: [], sessions: [],
};

// Fake SupabaseSync — only the methods performSync touches, plus call counters.
function makeFakeSync() {
  return {
    userId: 'u1',
    pushedSnapshots: [], bodyFetches: 0,
    // tombstone reconcile (inert: no deletions in this scenario)
    async fetchTombstones() { return {}; },
    async pushTombstone() {},
    async clearTombstone() {},
    // manuscript loops (kept inert: equal revisions ⇒ no pull/push of manuscripts)
    async fetchAllMetadata() { return [{ id: 'frost', revision: 0, title: 'Frostwood', wordCount: 8, chapterCount: 1, lastOpened: 1, status: 'draft' }]; },
    async fetchMarkdown() { return null; },
    async fetchAnnotations() { return []; },
    async fetchEdits() { return []; },
    async fetchSessions() { return []; },
    async fetchPosition() { return 0; },
    async pushManuscript() {}, async pushAnnotations() {}, async pushEdits() {},
    async pushSessions() {}, async pushPosition() {},
    // snapshots
    async fetchSnapshotRecords(id) { return id === 'frost' ? [remoteRec] : []; },
    async pushSnapshot(snap) { this.pushedSnapshots.push(snap.id); },
    async fetchSnapshotBody(id, versionId) {
      this.bodyFetches++;
      return id === 'frost' && versionId === REMOTE_VID ? MD_REMOTE : null;
    },
    async deleteSnapshot() {},
  };
}

await hydrateStorage();

// Local work BEFORE sync is configured (mimics offline authoring).
saveLibrary([{ id: 'frost', title: 'Frostwood', wordCount: 8, chapterCount: 1, lastOpened: 1, status: 'draft', combinedMarkdown: MD_LOCAL, revision: 0 }]);
saveSnapshot(createSnapshot({ manuscriptId: 'frost', markdown: MD_LOCAL, annotations: [], sessions: [], wordCount: 8, chapterCount: 1, trigger: 'import', label: 'Draft 1', now: 1000, id: 'local-1' }));
await flush();

console.log('PHASE: before sync');
check('local index has only local-1', listSnapshots('frost').map(s => s.id).join() === 'local-1');

const fake = makeFakeSync();
configureSync(fake);
const result = await performSync();
await flush();

console.log('PHASE: after performSync');
check('local-only snapshot was pushed whole', fake.pushedSnapshots.join() === 'local-1');
const ids = listSnapshots('frost').map(s => s.id).sort().join();
check('remote-only snapshot pulled into local index', ids === 'local-1,remote-1');
check('pulled remote meta carries label + versionId', listSnapshots('frost').find(s => s.id === 'remote-1')?.label === 'Beta draft');
check('pull was lazy — body NOT fetched during reconcile', fake.bodyFetches === 0);
check('performSync reported the pull + push', result.pulled >= 1 && result.pushed >= 1 && !result.failed);

console.log('PHASE: first open of pulled snapshot (lazy body pull)');
const opened = await loadSnapshot('frost', 'remote-1');
await flush();
check('body streamed on first open', opened?.markdown === MD_REMOTE);
check('exactly one body fetch happened', fake.bodyFetches === 1);

const reopened = await loadSnapshot('frost', 'remote-1');
check('second open served from local backfill (no new fetch)', reopened?.markdown === MD_REMOTE && fake.bodyFetches === 1);

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
