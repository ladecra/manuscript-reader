import React from 'react';
import type { Report, ChapterStat } from '../../engine/types';
import { ANNOTATION_TYPES, ANNOTATION_LABELS, ANNOTATION_COLORS } from '../../engine/types';
import { XIcon } from '../ui/Icons';

interface ReportPanelProps {
  open: boolean;
  report: Report | null;
  onClose: () => void;
  onExport: () => void;
  onExportDocx: () => void;
  onExportHtml: () => void;
  onExportRevisionLog: () => void;
  editCount: number;
  onJumpToChapter: (index: number) => void;
}

export function ReportPanel({ open, report, onClose, onExport, onExportDocx, onExportHtml, onExportRevisionLog, editCount, onJumpToChapter }: ReportPanelProps) {
  return (
    <div id="report-panel" className={open ? 'open' : ''}>
      <div className="rp-header">
        <div className="rp-header-row">
          <span className="rp-title">Manuscript Intelligence</span>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', padding: '2px', display: 'flex' }}
            onClick={onClose}
            aria-label="Close report"
          >
            <XIcon size={14} />
          </button>
        </div>
      </div>

      <div id="report-body" className="rp-body">
        {!report || report.totalAnns === 0 ? (
          <div className="rp-empty">
            <p>No annotations yet.</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>
              Select text in the reader to begin annotating.
            </p>
          </div>
        ) : (
          <ReportBody report={report} onJump={onJumpToChapter} />
        )}
      </div>

      <div className="rp-footer">
        <button id="export-html-btn" className="rp-export-btn" onClick={onExportHtml} style={{ marginBottom: '8px' }}>
          Export intelligence report (.html)
        </button>
        <button id="export-docx-btn" className="rp-export-btn ann-export-secondary" onClick={onExportDocx} style={{ marginBottom: '8px' }}>
          Export intelligence report (.docx)
        </button>
        <button id="report-export-btn" className="rp-export-btn ann-export-secondary" onClick={onExport}>
          Export report data (.json)
        </button>
        {editCount > 0 && (
          <button id="revision-log-btn" className="rp-export-btn ann-export-secondary" onClick={onExportRevisionLog} style={{ marginTop: '8px' }}>
            Export revision log ({editCount} edit{editCount !== 1 ? 's' : ''})
          </button>
        )}
      </div>
    </div>
  );
}

function ReportBody({ report, onJump }: { report: Report; onJump: (i: number) => void }) {
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
        <div style={{ color: 'var(--dim)', fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", fontSize: '12px', fontStyle: 'italic', padding: '6px 0' }}>
          None yet.
        </div>
      )}
    </div>
  );
}
