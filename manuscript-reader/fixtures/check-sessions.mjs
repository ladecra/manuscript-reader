// ─── Reader-session merge check (golden-file + assertions) ──────────────────
// Runs hand-authored multi-reader fixtures (fixtures/sessions/*.json) through the
// real engine (mergeReaderSessions, sessionFromImportPayload) and both prints the
// combined view AND asserts the known overlaps. Unlike check-fixtures (pure
// inspection), merges have a verifiable right answer, so we assert it.
//   Run with: npm run check-sessions
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mergeReaderSessions, sessionFromImportPayload } from '../src/engine/sessions.ts';
import { computeEditorialSignals } from '../src/engine/editorialSignals.ts';

const here = dirname(fileURLToPath(import.meta.url));
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

const dir = join(here, 'sessions');
const files = (await readdir(dir)).filter(f => f.endsWith('.json'));

for (const file of files) {
  const fx = JSON.parse(await readFile(join(dir, file), 'utf8'));
  console.log('\n' + '─'.repeat(60));
  console.log('FIXTURE:', file);

  const res = mergeReaderSessions(fx.sessions, fx.annotations, fx.chapters);

  console.log(`  readers: ${res.readerCount}  completion: ${(res.completionRate * 100).toFixed(0)}%  versions read: ${res.versionsRead.join(', ')}`);
  for (const r of res.readers) {
    console.log(`    ${r.readerName.padEnd(6)} ${(r.progress * 100).toFixed(0).padStart(3)}%  ${r.completed ? 'finished ' : 'abandoned'}  ${r.annotationCount} notes, furthest ch.${r.furthestChapter}  [${r.manuscriptVersionId}]`);
  }
  console.log('  per chapter (annotated / reached):');
  for (const c of res.chapters) {
    console.log(`    ch.${c.chapterIndex}: ${c.readersWhoAnnotated} reader(s) annotated, ${c.readersWhoReached < 0 ? '?' : c.readersWhoReached} reached, ${c.annotationCount} notes`);
  }
  console.log('  consensus:', res.consensusChapters.map(c => `ch.${c.chapterIndex} (${c.readersWhoAnnotated})`).join(', ') || 'none');

  const e = fx.expect;
  if (e) {
    console.log('  assertions:');
    check(`readerCount = ${e.readerCount}`, res.readerCount === e.readerCount);
    check(`completionRate ≈ ${e.completionRate}`, approx(res.completionRate, e.completionRate));
    check(`distinct versions = ${e.versionsReadCount}`, res.versionsRead.length === e.versionsReadCount);
    check(`top consensus chapter = ch.${e.topConsensusChapter} with ${e.topConsensusReaders} readers`,
      res.consensusChapters[0]?.chapterIndex === e.topConsensusChapter &&
      res.consensusChapters[0]?.readersWhoAnnotated === e.topConsensusReaders);
    const ch1 = res.chapters.find(c => c.chapterIndex === 1);
    check(`ch.1 readers = ${e.ch1Readers}`, ch1?.readersWhoAnnotated === e.ch1Readers);
    const ch3 = res.chapters.find(c => c.chapterIndex === 3);
    check(`ch.3 reached/annotated = ${e.ch3ReachedVsAnnotated.join('/')}`,
      ch3?.readersWhoReached === e.ch3ReachedVsAnnotated[0] && ch3?.readersWhoAnnotated === e.ch3ReachedVsAnnotated[1]);
  }

  // EditorialSignals: the composed canonical output the panel/exports/AI consume.
  const sig = computeEditorialSignals({ manuscriptId: fx.manuscriptId, annotations: fx.annotations, chapters: fx.chapters, sessions: fx.sessions });
  console.log('  editorial signals:');
  console.log(`    readers ${sig.readerCount}, completion ${(sig.completionRate*100).toFixed(0)}%, versions [${sig.versionsRead.join(', ')}], unresolved concerns ${sig.unresolvedConcerns}`);
  console.log(`    agreement: ${sig.readerAgreement.map(a => `ch.${a.chapterIndex} ${a.readersWhoAnnotated}/${a.readersWhoReached<0?'?':a.readersWhoReached} (${(a.agreement*100).toFixed(0)}%)`).join(', ')}`);
  console.log(`    engagement curve: [${sig.engagementCurve.map(v => v.toFixed(2)).join(', ')}]  drops at: ${sig.engagementDrops.join(', ') || 'none'}`);
  // The exports/panel read raw per-chapter stats from sig.report (the composed
  // substrate); guard that it's carried so the single-entry repoint can't regress.
  check('signals: carries composed report substrate (chapters + typeTotals)',
    !!sig.report && Array.isArray(sig.report.chapters) && typeof sig.report.typeTotals === 'object');
  if (e && e.signals) {
    check(`signals: top agreement chapter = ch.${e.signals.topAgreementChapter}`, sig.readerAgreement[0]?.chapterIndex === e.signals.topAgreementChapter);
    check(`signals: unresolved concerns = ${e.signals.unresolvedConcerns}`, sig.unresolvedConcerns === e.signals.unresolvedConcerns);
    check(`signals: versions read = ${e.signals.versionsReadCount}`, sig.versionsRead.length === e.signals.versionsReadCount);
    check('signals: revisionImpact null until Phase 8', sig.revisionImpact === null);
  }

  // sessionFromImportPayload: deterministic id + idempotent re-import.
  const payload = { readerId: 'rA', readerName: 'Ada', manuscriptVersionId: 'v1', startedAt: 1, completedAt: 2, progress: 1, annotations: [{ id: 'a1' }, { id: 'a2' }] };
  const s1 = sessionFromImportPayload(payload, fx.manuscriptId);
  const s2 = sessionFromImportPayload(payload, fx.manuscriptId);
  console.log('  sessionFromImportPayload:');
  check('deterministic id (idempotent re-import)', s1.id === s2.id && s1.id === `session-${fx.manuscriptId}-rA`);
  check('maps annotationIds + identity', s1.annotationIds.length === 2 && s1.readerId === 'rA' && s1.progress === 1);
  // legacy payload (no identity/progress) never throws and degrades.
  const legacy = sessionFromImportPayload({ annotations: [{ id: 'x' }] }, fx.manuscriptId);
  check('legacy payload degrades (synth id, progress 0)', legacy.progress === 0 && legacy.id.startsWith(`session-${fx.manuscriptId}-`));
}

console.log('\n' + '═'.repeat(60));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
