// ─── Manuscript hub — glance + insight copy (pure, surface-agnostic) ─────────

import type { EditorialSignals } from '../types';

export interface HubGlanceRow {
  label: string;
  value: string;
}

export interface HubStudioSummary {
  glance: HubGlanceRow[];
  lastInsight: string | null;
  insightVia: number | null;
}

function pacingLabel(reportLabel: string): string {
  switch (reportLabel) {
    case 'Excellent':
    case 'Good':
      return 'Steady';
    case 'Mixed':
      return 'Uneven';
    case 'Sparse':
      return 'Light';
    default:
      return '—';
  }
}

/** Factual studio strip for the right rail — hidden when empty. */
export function buildHubStudioSummary(signals: EditorialSignals | null): HubStudioSummary | null {
  if (!signals || signals.report.totalAnns === 0) return null;

  const { report } = signals;
  const total = report.totalAnns || 1;
  const analyzed = Math.round(report.coverage * 100);
  const hi = Math.round((report.typeTotals.highlight ?? 0) / total * 100);
  const notes = Math.round((report.typeTotals.note ?? 0) / total * 100);

  const glance: HubGlanceRow[] = [
    { label: 'Pacing', value: pacingLabel(report.label) },
    { label: 'Highlights', value: `${hi}%` },
    { label: 'Notes', value: `${notes}%` },
    { label: 'Analyzed', value: `${analyzed}%` },
  ];

  // Authorship-aware (Part 1): reader clusters read as reader reaction; with no
  // reader marks we surface the author's OWN revision queue — never "reader
  // reaction" when there are no readers.
  const hasReaderMarks = report.readers.length > 0;
  const readerTop = report.clusters.find(c => c.signal === 'confusion' || c.signal === 'continuity-break')
    ?? report.clusters[0];
  let lastInsight: string | null = null;
  if (readerTop) {
    const [from, to] = readerTop.chapterRange;
    const ch = from === to ? `Chapter ${from}` : `Chapters ${from}–${to}`;
    lastInsight = `Readers flagged ${readerTop.signal === 'confusion' ? 'confusion' : 'continuity'} around ${ch} — worth a close read on your next pass.`;
  } else if (report.authorRevision.chapters[0]) {
    const c = report.authorRevision.chapters[0];
    const where = c.title ? c.title : `Chapter ${c.index}`;
    lastInsight = `You’ve flagged ${c.count} item${c.count === 1 ? '' : 's'} in ${where} — your own revision queue to pick up.`;
  } else if (report.hotspots[0]) {
    const h = report.hotspots[0];
    lastInsight = hasReaderMarks
      ? `Chapter ${h.index} drew the heaviest reader reaction — a natural place to focus revision.`
      : `Chapter ${h.index} carries your densest marks — a natural place to focus revision.`;
  }

  return {
    glance,
    lastInsight,
    insightVia: report.totalAnns,
  };
}
