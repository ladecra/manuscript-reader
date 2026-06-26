// Verifies that a local delete + tombstone survives performSync when the remote
// still has the manuscript (the signed-in "zombie reappear" bug).
// Run with: npm run check-delete-sync
import 'fake-indexeddb/auto';
import {
  hydrateStorage, saveLibrary, loadLibrary,
  configureSync, performSync, flushPendingWrites,
} from '../src/engine/storage/index.ts';
import { useLibraryStore } from '../src/state/libraryStore.ts';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}
const flush = () => flushPendingWrites().then(() => new Promise(r => setTimeout(r, 50)));

const MD = '# Gone\n\nOne paragraph.\n';
const MS = {
  id: 'gone', title: 'Gone', wordCount: 3, chapterCount: 1, lastOpened: 1,
  status: 'Draft', combinedMarkdown: MD, revision: 1,
};

function makeFakeSync() {
  let remoteMeta = [{ ...MS, combinedMarkdown: undefined }];
  let remoteMarkdown = MD;
  const tombstones = {};
  let deleteCalls = 0;
  return {
    userId: 'u1',
    get deleteCalls() { return deleteCalls; },
    async fetchTombstones() { return { ...tombstones }; },
    async pushTombstone(id, deletedAt) { tombstones[id] = deletedAt; },
    async clearTombstone(id) { delete tombstones[id]; },
    async fetchAllMetadata() {
      return remoteMeta.map(m => ({ ...m }));
    },
    async fetchMarkdown(id) { return id === 'gone' ? remoteMarkdown : null; },
    async fetchAnnotations() { return []; },
    async fetchEdits() { return []; },
    async fetchSessions() { return []; },
    async fetchPosition() { return 0; },
    async pushManuscript() {},
    async pushAnnotations() {},
    async pushEdits() {},
    async pushSessions() {},
    async pushPosition() {},
    async deleteManuscript(id) {
      deleteCalls++;
      remoteMeta = remoteMeta.filter(m => m.id !== id);
      remoteMarkdown = null;
    },
    async fetchSnapshotRecords() { return []; },
    async pushSnapshot() {},
  };
}

await hydrateStorage();
saveLibrary([MS]);
await flush();

const fake = makeFakeSync();
configureSync(fake);

useLibraryStore.getState().deleteManuscript('gone');
await flush();
check('local library empty after delete', loadLibrary().length === 0);

const result = await performSync();
await flush();

check('performSync did not pull the manuscript back', loadLibrary().length === 0);
check('remote delete was requested', fake.deleteCalls >= 1);
const tombs = await fake.fetchTombstones();
check('tombstone on remote', (tombs.gone ?? 0) > 0);
check('sync completed without hard failure', !result.failed);

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
