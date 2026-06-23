import type { EditorialSignals, ChapterStat, ProseAnalysis, ChapterProse } from '../../engine/types';
import { ANNOTATION_TYPES, ANNOTATION_LABELS, ANNOTATION_COLORS } from '../../engine/types';

// The Manuscript Intelligence content, rendered inline on the manuscript hub's
// Report tab. (It used to live in a reader drawer; the drawer is gone — intelligence
// lives on the hub now, never over the reading view.) Pure presentation over a
// precomputed EditorialSignals; jumping a chapter is delegated to the host.
export function ReportView({ signals, onJump }: { signals: EditorialSignals | null; onJump: (index: number) => void }) {
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

  // Prose analysis is text-derived, so it's present the moment a manuscript loads —
  // it leads, before any annotation-derived findings. The annotation sections only
  // render once there's at least one annotation.
  return (
    <>
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

function ReportBody({ signals, onJump }: { signals: EditorialSignals; onJump: (i: number) => void }) {
  const report = signals.report;
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

      {/* ── Findings ── */}
      <Section title="Findings">
        <Finding
          color="var(--ann-question-solid)"
          title="Hotspots"
          desc="Chapters drawing the densest feedback — usually where something is working hard, for better or worse."
          chips={report.hotspots}
          chipLabel={c => `${c.count}`}
          onJump={onJump}
        />

        <Finding
          color="var(--dim)"
          title="Silent chapters"
          desc="Little or no reader reaction. Could be smooth — or could be where attention drifts."
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
            desc="Chapters carrying continuity notes worth a focused pass."
            chips={report.continuityFlags}
            chipLabel={c => `${c.counts.continuity ?? 0}`}
            onJump={onJump}
          />
        )}
      </Section>
    </>
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

function ProseSection({ prose, onJump }: { prose: ProseAnalysis; onJump: (i: number) => void }) {
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

function ProseRow({ c, meanChapterWords, onJump }: { c: ChapterProse; meanChapterWords: number; onJump: (i: number) => void }) {
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

function ReaderConsensus({ signals, onJump }: { signals: EditorialSignals; onJump: (i: number) => void }) {
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
                  onClick={() => onJump(a.chapterIndex)}
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
  onJump: (i: number) => void;
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
              onClick={() => onJump(c.index)}
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
