import type { EditorialSignals, ChapterStat, ProseAnalysis, ChapterProse, ManuscriptInsight, PassageConvergence, ConvergenceValence, ReaderDropoff } from '../../engine/types';
import { ANNOTATION_TYPES, ANNOTATION_LABELS, ANNOTATION_COLORS, DEVELOPMENTAL_TYPES } from '../../engine/types';
import { rankInsights } from '../../engine/insights/rankInsights';

// The Manuscript Intelligence content, rendered inline on the manuscript hub's
// Report tab. (It used to live in a reader drawer; the drawer is gone — intelligence
// lives on the hub now, never over the reading view.) Pure presentation over a
// precomputed EditorialSignals; jumping a chapter is delegated to the host.
// A jump may request Annotations mode (annotate) and a specific mark to scroll to
// (annotationId); prose/length jumps pass neither and land in reading at the chapter.
export type JumpFn = (index: number, opts?: { annotationId?: string; annotate?: boolean }) => void;

// Sum of a chapter's developmental-concern annotations (the chip count for the
// Developmental flags finding) — same type set the engine ranks density by.
const devCount = (c: ChapterStat) => DEVELOPMENTAL_TYPES.reduce((s, t) => s + (c.counts[t] ?? 0), 0);
export function ReportView({ signals, onJump }: { signals: EditorialSignals | null; onJump: JumpFn }) {
  const report = signals?.report ?? null;
  const prose = signals?.prose ?? null;
  const hasAnnotations = !!report && report.totalAnns > 0;
  const hasProse = !!prose && prose.chapters.some(c => c.words > 0);

  if (!hasAnnotations && !hasProse) {
    return (
      <div className="rp-empty">
        <p>No annotations yet.</p>
        <p style={{ fontSize: '14px', marginTop: '8px' }}>
          Open the reader and select text to begin annotating.
        </p>
      </div>
    );
  }

  // The ranked "look here first" layer — projected from the same signals the
  // sections below render in full, so the panel and the downloaded report lead
  // with the identical pointers. Legitimately empty on an even, unannotated draft.
  const insights = signals ? rankInsights(signals) : [];
  // Passage convergences are rendered as rich cards (ConvergenceLead) — so drop
  // the convergence tier from the compact insights strip to avoid saying it twice.
  const restInsights = insights.filter(i => i.tier !== 'convergence');

  const convergences = signals?.passageConvergences ?? [];
  const solo = signals?.soloPassages ?? [];
  const hasRoom = convergences.length > 0 || solo.length > 0;

  // Prose analysis is text-derived, so it's present the moment a manuscript loads —
  // it leads, before any annotation-derived findings. The annotation sections only
  // render once there's at least one annotation. The passage-convergence lead (the
  // "room") sits at the very top when it exists — the redesign's "see the whole
  // room at once", resolved to the exact lines.
  return (
    <>
      {hasRoom && <ThermalInstrument signals={signals!} />}
      {hasRoom && <ConvergenceLead convergences={convergences} solo={solo} dropoff={signals!.readerDropoff} onJump={onJump} />}
      {restInsights.length > 0 && <InsightsSection insights={restInsights} onJump={onJump} />}
      {hasProse && <ProseSection prose={prose!} onJump={onJump} />}
      {hasAnnotations && <ReportBody signals={signals!} onJump={onJump} />}
      {!hasAnnotations && hasProse && (
        <Section title="Reader feedback">
          <div className="rp-finding-desc">
            No annotations yet. Open the reader and select text to begin — your marks, and any imported editor or beta-reader feedback, fill in here.
          </div>
        </Section>
      )}
    </>
  );
}

// ── The instrument: a thermal ribbon of the manuscript, read by the room ──────
// One cell per chapter, coloured by the room's valence there (the dominant
// convergence), with a marker sized to how many distinct readers converged, an
// engagement sparkline above, and abandonment cliffs where reach falls away.
// Purely a projection of EditorialSignals — no new computation.
const VALENCE_CLASS: Record<ConvergenceValence, string> = { warm: 'warm', cool: 'cool', divided: 'split' };

function ThermalInstrument({ signals }: { signals: EditorialSignals }) {
  const chapters = [...signals.report.chapters].sort((a, b) => a.index - b.index);
  const curve = signals.engagementCurve;
  // The cliff marks where reach ENDS (readers stop and don't return) — the truest
  // abandonment signal — not merely where engagement density dipped.
  const cliffs = new Set(signals.readerDropoff.map(d => d.chapterIndex));
  const silent = new Set(signals.silentChapters.map(c => c.index));

  // Strongest convergence per chapter → the cell's valence + marker size.
  const topByChapter = new Map<number, PassageConvergence>();
  for (const c of signals.passageConvergences) {
    const cur = topByChapter.get(c.chapterIndex);
    if (!cur || c.readerCount > cur.readerCount) topByChapter.set(c.chapterIndex, c);
  }

  // Sparkline path over the engagement curve (normalized 0–1), aligned to columns.
  const n = chapters.length;
  const W = Math.max(n * 20, 120), H = 44;
  const pts = chapters.map((_, i) => {
    const x = n > 1 ? (i / (n - 1)) * (W - 8) + 4 : W / 2;
    const y = H - 4 - (curve[i] ?? 0) * (H - 10);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1]?.[0].toFixed(1) ?? W},${H} L${pts[0]?.[0].toFixed(1) ?? 0},${H} Z`;

  return (
    <div className="rp-thermal">
      <div className="rp-thermal-head">
        <span className="rp-thermal-title">The manuscript, read by the room</span>
        <span className="rp-thermal-meta">
          <b>{n}</b> chapter{n === 1 ? '' : 's'} · <b>{signals.readerCount || signals.report.readers.length}</b> reader{(signals.readerCount || signals.report.readers.length) === 1 ? '' : 's'} · <b>{signals.report.totalAnns}</b> marks
        </span>
      </div>
      <div className="rp-thermal-body">
        <div className="rp-ribbon-scroll" style={{ minWidth: `${Math.max(n * 22, 320)}px` }}>
          <svg className="rp-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Engagement across the manuscript">
            <path className="rp-spark-area" d={area} />
            <path className="rp-spark-line" d={line} fill="none" />
          </svg>
          <div className="rp-ribbon" role="list" aria-label="Chapters by reaction">
            {chapters.map(ch => {
              const conv = topByChapter.get(ch.index);
              const cls = conv ? VALENCE_CLASS[conv.valence] : silent.has(ch.index) ? 'silent' : '';
              return (
                <div key={ch.index} className={`rp-cell ${cls}`} role="listitem"
                  title={`Ch. ${ch.index}${ch.title ? ' — ' + ch.title : ''}${conv ? ` · ${conv.readerCount} readers converged (${conv.valence})` : silent.has(ch.index) ? ' · reached, quiet' : ''}`}>
                  {conv && <span className={`rp-mk ${VALENCE_CLASS[conv.valence]}`}>{conv.readerCount}</span>}
                  {cliffs.has(ch.index) && <span className="rp-cliff" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="rp-legend">
        <span className="rp-lg warm"><i />Leaned in</span>
        <span className="rp-lg cool"><i />Tripped — questions &amp; snags</span>
        <span className="rp-lg split"><i />Divided</span>
        <span className="rp-lg silent"><i />Silent — reached, quiet</span>
        <span className="rp-lg-note">● size = readers who converged</span>
      </div>
    </div>
  );
}

// ── Worth a look first — ranked convergence cards + the one-voice isolate ──────
const VALENCE_TAG: Record<ConvergenceValence, { cls: string; glyph: string; label: string }> = {
  cool:    { cls: 'cool',  glyph: '△', label: 'The room tripped' },
  warm:    { cls: 'warm',  glyph: '▲', label: 'The room leaned in' },
  divided: { cls: 'split', glyph: '◑', label: 'The room divided' },
};

function ConvergenceLead({ convergences, solo, dropoff, onJump }: {
  convergences: PassageConvergence[]; solo: PassageConvergence[]; dropoff: ReaderDropoff[]; onJump: JumpFn;
}) {
  // Interleave rank numbers across convergence cards + the abandonment card so the
  // ranking reads as one list (abandonment sits just below the passage cards, as
  // the concept artifact ranks it).
  const cards = convergences.slice(0, 5);
  return (
    <div className="rp-section">
      <div className="rp-section-label">Worth a look first</div>
      <div className="rp-finding-desc">
        Ranked by how much of the room corroborates it — independent agreement first, then severity. Every item is tethered to the exact passage that drew it.
      </div>
      <div className="rp-looks">
        {cards.map((c, i) => (
          <ConvergenceCard key={c.id} c={c} rank={i + 1} onJump={onJump} />
        ))}
        {dropoff.length > 0 && <AbandonmentCard d={dropoff[0]} rank={cards.length + 1} onJump={onJump} />}
      </div>
      {solo.length > 0 && <OneVoice c={solo[0]} onJump={onJump} />}
    </div>
  );
}

function ConvergenceCard({ c, rank, onJump }: {
  c: PassageConvergence; rank: number; onJump: JumpFn;
}) {
  const tag = VALENCE_TAG[c.valence];
  // Reach-aware denominator: of the readers who actually reached this passage.
  const total = Math.max(c.readersReached, c.readerCount);
  const where = `${c.chapterTitle || `Chapter ${c.chapterIndex}`}${c.blockOrdinal > 0 ? ` · ¶${c.blockOrdinalEnd && c.blockOrdinalEnd > c.blockOrdinal ? `${c.blockOrdinal}–${c.blockOrdinalEnd}` : c.blockOrdinal}` : ''}`;
  const mix = c.valence === 'divided'
    ? `${c.reactionMarks} highlight${c.reactionMarks === 1 ? '' : 's'} vs. ${c.concernMarks} flag${c.concernMarks === 1 ? '' : 's'}`
    : c.concernMarks > 0
      ? `${c.concernMarks} question${c.concernMarks === 1 ? '' : 's'}/flag${c.concernMarks === 1 ? '' : 's'}`
      : `${c.reactionMarks} highlight${c.reactionMarks === 1 ? '' : 's'}/note${c.reactionMarks === 1 ? '' : 's'}`;
  return (
    <button
      className={`rp-look ${tag.cls}`}
      onClick={() => onJump(c.chapterIndex, { annotate: true, annotationId: c.annotationIds[0] })}
      title={`Jump to ${c.chapterTitle || `Chapter ${c.chapterIndex}`}`}
    >
      <span className="rp-look-rank">{rank}</span>
      <span className="rp-look-body">
        <span className="rp-look-top">
          <span className={`rp-vtag ${tag.cls}`}>{tag.glyph} {tag.label}</span>
          <span className="rp-look-where">{where}</span>
        </span>
        <span className="rp-look-quote">{c.quote}</span>
        <span className="rp-look-foot">
          <span className="rp-avs" aria-hidden="true">
            {c.readerNames.slice(0, 6).map((nm, i) => (
              <span key={i} className={`rp-av ${c.valence}`}>{initials(nm)}</span>
            ))}
          </span>
          <span className="rp-look-read"><b>{c.readerCount} of {total} readers</b> · {mix}</span>
        </span>
      </span>
    </button>
  );
}

// The abandonment card — where reach ends and doesn't resume. Styled silent (a
// reach signal, not a valence), sits just below the passage cards.
function AbandonmentCard({ d, rank, onJump }: { d: ReaderDropoff; rank: number; onJump: JumpFn }) {
  const where = d.chapterTitle || `Chapter ${d.chapterIndex}`;
  return (
    <button className="rp-look silent" onClick={() => onJump(d.chapterIndex)} title={`Jump to ${where}`}>
      <span className="rp-look-rank">{rank}</span>
      <span className="rp-look-body">
        <span className="rp-look-top">
          <span className="rp-vtag silent">■ Where the room thinned</span>
          <span className="rp-look-where">after {where}</span>
        </span>
        <span className="rp-look-quote rp-look-quote--muted">{d.readersStopped} of {d.readersReached} readers stopped here and did not return.</span>
        <span className="rp-look-foot">
          <span className="rp-look-read">Reach ends here — the sharpest drop in the room across the book. Not what readers said, but where they stopped saying anything.</span>
        </span>
      </span>
    </button>
  );
}

function OneVoice({ c, onJump }: { c: PassageConvergence; onJump: JumpFn }) {
  const name = c.readerNames[0] || 'One reader';
  return (
    <button className="rp-voice" onClick={() => onJump(c.chapterIndex, { annotate: true, annotationId: c.annotationIds[0] })}
      title={`Jump to ${c.chapterTitle || `Chapter ${c.chapterIndex}`}`}>
      <span className="rp-av silent" aria-hidden="true">{initials(name)}</span>
      <span className="rp-voice-b">
        <span className="rp-voice-h">One voice · <b>{name}, {c.chapterTitle || `Chapter ${c.chapterIndex}`}</b></span>
        <span className="rp-voice-p">A single reader flagged this passage. Kept and shown so you can weigh it — held apart from the room, never counted as agreement. One thoughtful reaction is taste, not consensus.</span>
      </span>
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ReportBody({ signals, onJump }: { signals: EditorialSignals; onJump: JumpFn }) {
  const report = signals.report;
  // Framing keys on whether READER-authored marks exist (not session count): the
  // reader-reaction findings (developmental/question/continuity) are reader-only
  // and thus empty for a solo author; the author's own marks show in their own
  // "Your revision flags" band below. `hasReaderMarks` only tunes the voice of the
  // descriptive all-marks findings (hotspots/silent).
  const hasReaderMarks = report.readers.length > 0;
  const authorRevision = report.authorRevision;
  const maxT = Math.max(1, ...ANNOTATION_TYPES.map(t => report.typeTotals[t] ?? 0));

  return (
    <>
      {/* ── Overview ── */}
      <Section title="Overview">
        <div className="rp-overview-grid">
          <div className="rp-stat">
            <span className="rp-stat-num">{report.totalAnns}</span>
            <span className="rp-stat-label">Annotations</span>
          </div>
          {report.hotspots.length > 0 && (
            <div className="rp-stat">
              <span className="rp-stat-num">{report.hotspots[0].count}</span>
              <span className="rp-stat-label">Peak chapter</span>
            </div>
          )}
          {report.silent.length > 0 && (
            <div className="rp-stat">
              <span className="rp-stat-num">{report.silent.length}</span>
              <span className="rp-stat-label">Silent chapters</span>
            </div>
          )}
        </div>
      </Section>

      {/* ── Reader consensus (the multi-reader moat — only when beta readers exist) ── */}
      {signals.readerCount > 0 && <ReaderConsensus signals={signals} onJump={onJump} />}

      {/* ── Type distribution ── */}
      <Section title="Annotation types">
        {ANNOTATION_TYPES
          .filter(t => (report.typeTotals[t] ?? 0) > 0)
          .map(t => {
            const n = report.typeTotals[t] ?? 0;
            const pct = Math.round((n / report.totalAnns) * 100);
            return (
              <div key={t} className="rp-type-row">
                <span className="rp-type-dot" style={{ background: ANNOTATION_COLORS[t] }} />
                <span className="rp-type-name">{ANNOTATION_LABELS[t]}</span>
                <span className="rp-type-bar-track">
                  <span
                    className="rp-type-bar-fill"
                    style={{
                      width: `${(n / maxT) * 100}%`,
                      background: ANNOTATION_COLORS[t],
                    }}
                  />
                </span>
                <span className="rp-type-val">{n} · {pct}%</span>
              </div>
            );
          })}
      </Section>

      {/* ── Reader reactions (READER marks only — empty until beta readers annotate) ── */}
      <Section title="Findings">
        {report.developmentalHotspots.length > 0 && (
          <Finding
            color="var(--ann-structural-solid)"
            title="Developmental flags"
            desc="Chapters densest in reader concerns — questions, continuity, structural, pacing, voice. Where the developmental work concentrates, regardless of where readers simply leaned in."
            chips={report.developmentalHotspots}
            chipLabel={c => `${devCount(c)}`}
            onJump={onJump}
          />
        )}

        <Finding
          color="var(--ann-question-solid)"
          title="Hotspots"
          desc={hasReaderMarks
            ? "Chapters drawing the densest feedback overall — engagement and concern together, usually where something is working hard."
            : "Chapters carrying your densest marks overall — engagement and concern together, usually where something is working hard."}
          chips={report.hotspots}
          chipLabel={c => `${c.count}`}
          onJump={onJump}
        />

        <Finding
          color="var(--dim)"
          title="Silent chapters"
          desc={hasReaderMarks
            ? "Little or no reader reaction. Could be smooth — or could be where attention drifts."
            : "Chapters you haven't marked. Could be smooth — or could be where attention drifts."}
          chips={report.silent}
          onJump={onJump}
        />

        {report.questionClusters.length > 0 && (
          <Finding
            color="var(--ann-question-solid)"
            title="Question clusters"
            desc="Where readers asked the most — possible confusion or unanswered setups."
            chips={report.questionClusters}
            chipLabel={c => `${c.counts.question ?? 0}?`}
            onJump={onJump}
          />
        )}

        {report.continuityFlags.length > 0 && (
          <Finding
            color="var(--ann-continuity-solid)"
            title="Continuity flags"
            desc="Chapters carrying reader continuity notes worth a focused pass."
            chips={report.continuityFlags}
            chipLabel={c => `${c.counts.continuity ?? 0}`}
            onJump={onJump}
          />
        )}
      </Section>

      {/* ── Your revision flags (the author's OWN marks — a queue, not reader reaction) ── */}
      {authorRevision.totalFlags > 0 && (
        <Section title="Your revision flags">
          <div className="rp-finding-desc">
            Your own marks — a revision queue, not reader reaction. {authorRevision.totalFlags} flag{authorRevision.totalFlags === 1 ? '' : 's'} across {authorRevision.chapters.length} chapter{authorRevision.chapters.length === 1 ? '' : 's'}.
          </div>
          <Finding
            color="var(--ann-note-solid)"
            title="Where your flags cluster"
            desc="Chapters you’ve marked most — your own questions, notes, and revision to-dos to work through. Jump in to pick up the thread."
            chips={authorRevision.chapters}
            chipLabel={c => `${c.count}`}
            onJump={onJump}
          />
        </Section>
      )}
    </>
  );
}

// ── Insights (the ranked "look here first" strip) ─────────────────────────────
// Evidence-backed pointers, most-actionable first (consensus → reaction → prose),
// each clickable into the prose. Tone is a librarian's pointer, never a verdict —
// the copy lives in the engine (rankInsights); this only renders it.
// Authorship-aware: with no beta readers the reaction tier is the AUTHOR's own
// revision flags, never "reader reactions" (the data is identical; the framing
// must not be). Consensus only ever appears when readers exist.
function tierLabel(tier: ManuscriptInsight['tier']): string {
  switch (tier) {
    case 'convergence':  return 'The room converged';
    case 'abandonment':  return 'Where the room thinned';
    case 'consensus':    return 'Reader agreement';
    case 'reaction':     return 'Reader reactions';
    case 'author-queue': return 'Your revision flags';
    case 'prose':        return 'Prose';
  }
}

function InsightsSection({ insights, onJump }: { insights: ManuscriptInsight[]; onJump: JumpFn }) {
  return (
    <Section title="Worth a look">
      <div className="rp-finding-desc">
        Ranked pointers from the findings below — where the signal is strongest. The same items lead your downloaded report.
      </div>
      <div className="rp-insights">
        {insights.map((i, idx) => {
          // Stacked same-rationale rows (e.g. two consensus chapters) read as
          // repetition — show the explanatory line only on the first of a run.
          const showDetail = !!i.detail && insights[idx - 1]?.detail !== i.detail;
          return (
            <button
              key={i.id}
              className="rp-insight"
              data-tier={i.tier}
              onClick={() => i.chapter != null && onJump(i.chapter, {
                // Reaction/consensus trace to reader actions → open Annotations
                // mode (and the specific mark when we have one). Prose is text-
                // derived → land in reading at the chapter start.
                annotate: i.tier !== 'prose',
                annotationId: i.evidence.annotationIds?.[0],
              })}
              disabled={i.chapter == null}
              title={i.chapter != null ? `Jump to Chapter ${i.chapter}` : undefined}
            >
              <span className="rp-insight-main">
                <span className="rp-insight-tier">{tierLabel(i.tier)}</span>
                <span className="rp-insight-headline">{i.headline}</span>
                {showDetail && <span className="rp-insight-detail">{i.detail}</span>}
              </span>
              <span className="rp-insight-tag">{i.evidence.label}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ── Prose (text-derived, Tier 1) ──────────────────────────────────────────────
// Factual measurements of the prose itself, framed only against this manuscript's
// own averages — never an external "correct" style, never a judgment. Leads with
// the glanceable signals: chapter length (with self-relative outliers), dialogue
// balance, and sentence rhythm.

// A chapter is a "length outlier" when it's notably longer/shorter than the
// manuscript's mean. Neutral threshold — flag the genuinely off, stay quiet otherwise.
const LONG = 1.4, SHORT = 0.6;

function ProseSection({ prose, onJump }: { prose: ProseAnalysis; onJump: JumpFn }) {
  const { baselines: b, chapters } = prose;

  return (
    <Section title="Prose">
      <div className="rp-overview-grid">
        <div className="rp-stat">
          <span className="rp-stat-num">{b.totalWords.toLocaleString()}</span>
          <span className="rp-stat-label">Words</span>
        </div>
        <div className="rp-stat">
          <span className="rp-stat-num">{Math.round(b.meanChapterWords).toLocaleString()}</span>
          <span className="rp-stat-label">Avg chapter</span>
        </div>
        <div className="rp-stat">
          <span className="rp-stat-num">{Math.round(b.dialogueRatio * 100)}%</span>
          <span className="rp-stat-label">Dialogue</span>
        </div>
        <div className="rp-stat">
          <span className="rp-stat-num">{b.meanSentenceWords}</span>
          <span className="rp-stat-label">Avg sentence</span>
        </div>
      </div>

      <div className="rp-finding-desc" style={{ marginTop: '14px' }}>
        Measured from the text itself — every figure is a count, compared only to this manuscript's own average. Nothing here is a judgment.
      </div>

      <div className="rp-prose-table">
        <div className="rp-prose-row rp-prose-head">
          <span>Chapter</span>
          <span>Length</span>
          <span>Dialogue</span>
          <span>Sentence</span>
        </div>
        {chapters.filter(c => c.words > 0).map(c => (
          <ProseRow key={c.index} c={c} meanChapterWords={b.meanChapterWords} onJump={onJump} />
        ))}
      </div>
    </Section>
  );
}

function ProseRow({ c, meanChapterWords, onJump }: { c: ChapterProse; meanChapterWords: number; onJump: JumpFn }) {
  const ratio = meanChapterWords > 0 ? c.words / meanChapterWords : 1;
  const outlier = ratio >= LONG || ratio <= SHORT;
  return (
    <button
      className="rp-prose-row rp-prose-rowbtn"
      onClick={() => onJump(c.index)}
      title={`Jump to ${c.title || `Ch. ${c.index}`} · ${c.paragraphs} paragraphs · ${c.scenes} scene${c.scenes !== 1 ? 's' : ''} · sentence-length variance ${c.sentenceLengthVariance}`}
    >
      <span className="rp-prose-name">{c.title ? c.title.slice(0, 22) : `Ch. ${c.index}`}</span>
      <span className="rp-prose-cell">
        {c.words.toLocaleString()}
        {outlier && <span className="rp-prose-rel"> · {ratio.toFixed(1)}×</span>}
      </span>
      <span className="rp-prose-cell">{Math.round(c.dialogueRatio * 100)}%</span>
      <span className="rp-prose-cell">{c.meanSentenceWords}w</span>
    </button>
  );
}

function ReaderConsensus({ signals, onJump }: { signals: EditorialSignals; onJump: JumpFn }) {
  const { readerCount, completionRate, versionsRead, readerAgreement } = signals;
  const finishedPct = Math.round(completionRate * 100);
  const topAgreement = readerAgreement.slice(0, 5);
  const mixedDrafts = versionsRead.length > 1;

  return (
    <Section title="Reader consensus">
      <div className="rp-overview-grid">
        <div className="rp-stat">
          <span className="rp-stat-num">{readerCount}</span>
          <span className="rp-stat-label">Beta reader{readerCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="rp-stat">
          <span className="rp-stat-num">{finishedPct}%</span>
          <span className="rp-stat-label">Finished</span>
        </div>
      </div>

      {mixedDrafts && (
        <div className="rp-consensus-note">
          Readers responded to {versionsRead.length} different drafts — consensus may mix versions.
        </div>
      )}

      <div className="rp-finding" style={{ marginTop: '16px' }}>
        <div className="rp-finding-head">
          <span className="rp-finding-dot" style={{ background: 'var(--ink)' }} />
          <span className="rp-finding-title">Where readers agree</span>
        </div>
        <div className="rp-finding-desc">
          Chapters several readers reacted to independently — agreement is the strongest signal that something needs attention, not just one reader's taste.
        </div>
        {topAgreement.length > 0 ? (
          <div className="rp-chips">
            {topAgreement.map(a => {
              const reached = a.readersWhoReached > 0 ? a.readersWhoReached : readerCount;
              return (
                <button
                  key={a.chapterIndex}
                  className="rp-chip"
                  onClick={() => onJump(a.chapterIndex, { annotate: true })}
                  title={`Jump to ${a.chapterTitle || `Ch. ${a.chapterIndex}`} · ${a.readersWhoAnnotated} of ${reached} readers reacted`}
                >
                  <span className="rp-chip-name">
                    {a.chapterTitle ? a.chapterTitle.slice(0, 22) : `Ch. ${a.chapterIndex}`}
                  </span>
                  <span className="rp-chip-count">{a.readersWhoAnnotated}/{reached}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ color: 'var(--dim)', fontFamily: "'Hanken Grotesk', system-ui, sans-serif", fontSize: '12px', fontStyle: 'italic', padding: '6px 0' }}>
            No overlapping reactions yet.
          </div>
        )}
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rp-section">
      <div className="rp-section-label">{title}</div>
      {children}
    </div>
  );
}

function Finding({
  color, title, desc, chips, chipLabel, onJump,
}: {
  color: string;
  title: string;
  desc: string;
  chips: ChapterStat[];
  chipLabel?: (c: ChapterStat) => string;
  onJump: JumpFn;
}) {
  return (
    <div className="rp-finding">
      <div className="rp-finding-head">
        <span className="rp-finding-dot" style={{ background: color }} />
        <span className="rp-finding-title">{title}</span>
      </div>
      <div className="rp-finding-desc">{desc}</div>
      {chips.length > 0 ? (
        <div className="rp-chips">
          {chips.map(c => (
            <button
              key={c.index}
              className="rp-chip"
              data-jump={c.index}
              onClick={() => onJump(c.index, { annotate: true })}
              title={`Jump to ${c.title}`}
            >
              <span className="rp-chip-name">
                {c.title ? c.title.slice(0, 22) : `Ch. ${c.index}`}
              </span>
              {chipLabel && <span className="rp-chip-count">{chipLabel(c)}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--dim)', fontFamily: "'Hanken Grotesk', system-ui, sans-serif", fontSize: '12px', fontStyle: 'italic', padding: '6px 0' }}>
          None yet.
        </div>
      )}
    </div>
  );
}
