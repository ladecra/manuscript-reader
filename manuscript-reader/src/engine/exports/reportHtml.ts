// ─── HTML Intelligence Report Export ──────────────────────────────────────────
// Generates a self-contained, two-page HTML report matching the DOCX output
// in structure: header, At a Glance, density bar chart, key takeaways (p.1)
// then annotation heatmap, hotspots/silent chapters, type breakdown, report
// details (p.2). All charts are inline SVG. No external dependencies.

import type { Annotation, AnnotationCluster, AnnotationType, Chapter, ChapterStat, EditorialSignals } from '../types';
import { ANNOTATION_TYPES, ANNOTATION_COLORS as COLOR } from '../types';
import { ANN_LABEL_PLURAL as LABEL, INK, HEAD, MUTED as META, DIM as LBL, RULE, PAGE as PAPER, GOOGLE_FONTS_LINK } from './exportPalette';
import { buildProseSectionHtml } from './proseReportSection';
import { rankInsights } from '../insights/rankInsights';
import type { InsightTier } from '../types';

// ── Editorial signal presentation ─────────────────────────────────────────────
// The engine decides which clusters exist (report.ts); this maps each signal to
// how it reads on the page.
const SIGNAL_META: Record<AnnotationCluster['signal'], { label: string; color: string; unit: string; lead: (c: AnnotationCluster) => string }> = {
  'confusion': {
    label: 'Possible Confusion', color: COLOR.question, unit: 'questions',
    lead: c => `Readers raised ${c.count} question${c.count !== 1 ? 's' : ''} ${rangeLabel(c).toLowerCase()} — a likely setup, motivation, or clarity gap.`,
  },
  'continuity-break': {
    label: 'Continuity to Reconcile', color: COLOR.continuity, unit: 'flags',
    lead: c => `${c.count} continuity flag${c.count !== 1 ? 's' : ''} ${rangeLabel(c).toLowerCase()}. Worth a focused consistency pass.`,
  },
  'structural-issue': {
    label: 'Structural Note', color: COLOR.structural, unit: 'notes',
    lead: c => `${c.count} structural note${c.count !== 1 ? 's' : ''} ${rangeLabel(c).toLowerCase()} — pacing, scene order, or chapter shape.`,
  },
  'engagement': {
    label: 'Strong Engagement', color: COLOR.highlight, unit: 'marks',
    lead: c => `A concentration of ${c.count} highlights and bookmarks ${rangeLabel(c).toLowerCase()} — this is landing.`,
  },
};

function rangeLabel(c: AnnotationCluster): string {
  const [lo, hi] = c.chapterRange;
  return lo === hi ? `in Chapter ${lo}` : `across Chapters ${lo}–${hi}`;
}

function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Verbatim feedback selection ───────────────────────────────────────────────
// For most signals the reader's note IS the feedback (a question, a continuity
// concern). For highlights/bookmarks the marked passage (quote) is the point.
function snippetText(a: Annotation): string {
  const noteFirst = a.type !== 'highlight' && a.type !== 'bookmark';
  const raw = noteFirst
    ? (a.note.trim() || a.quote.trim())
    : (a.quote.trim() || a.note.trim());
  return raw.length > 190 ? raw.slice(0, 187).trimEnd() + '…' : raw;
}

function snippetHtml(a: Annotation): string {
  const text = snippetText(a);
  if (!text) return '';
  const who = a.readerName ? esc(a.readerName) : 'You';
  return `<div class="quote">
    <span class="quote-mark" style="background:${COLOR[a.type] ?? LBL}"></span>
    <div class="quote-body">
      <div class="quote-text">${esc(text)}</div>
      <div class="quote-attr">${who}&nbsp;&nbsp;·&nbsp;&nbsp;Ch.&nbsp;${a.chapterIndex}</div>
    </div>
  </div>`;
}

// Best single annotation to show for a chapter: lead with editorial signal types.
function representativeForChapter(annotations: Annotation[], index: number): Annotation | undefined {
  const inCh = annotations.filter(a => a.chapterIndex === index && snippetText(a));
  const order: AnnotationType[] = ['question', 'continuity', 'structural', 'note', 'bookmark', 'highlight'];
  for (const t of order) {
    const hit = inCh.find(a => a.type === t);
    if (hit) return hit;
  }
  return inCh[0];
}

// ── Heatmap data: distribute annotations deterministically within chapters ─────
function buildHeatmapPoints(
  annotations: Annotation[],
  chapterStats: ChapterStat[],
): { x: number; y: number }[] {
  let cumulative = 0;
  const starts = new Map<number, number>();
  for (const ch of chapterStats) {
    starts.set(ch.index, cumulative);
    cumulative += ch.words;
  }
  const totalWords = cumulative;
  if (totalWords === 0 || annotations.length === 0) return [];

  // group annotations by chapter, sort by createdAt for determinism
  const byChapter = new Map<number, Annotation[]>();
  for (const ann of annotations) {
    const arr = byChapter.get(ann.chapterIndex) ?? [];
    arr.push(ann);
    byChapter.set(ann.chapterIndex, arr);
  }

  const positions: number[] = [];
  for (const [idx, anns] of byChapter) {
    const ch = chapterStats.find(c => c.index === idx);
    const start = starts.get(idx) ?? 0;
    const words = ch?.words ?? 500;
    const sorted = [...anns].sort((a, b) => a.createdAt - b.createdAt);
    sorted.forEach((_, i) => {
      positions.push(start + ((i + 1) / (sorted.length + 1)) * words);
    });
  }
  positions.sort((a, b) => a - b);

  const WINDOW = Math.min(1000, Math.max(200, Math.floor(totalWords / 8)));
  const STEP = Math.max(30, Math.floor(totalWords / 250));
  const points: { x: number; y: number }[] = [];
  for (let w = 0; w <= totalWords - WINDOW; w += STEP) {
    const count = positions.filter(p => p >= w && p < w + WINDOW).length;
    points.push({ x: w + WINDOW / 2, y: (count / WINDOW) * 1000 });
  }
  return points;
}

// ── SVG: Stacked density bar chart ────────────────────────────────────────────
function densityChart(chapters: ChapterStat[]): string {
  const n = chapters.length;
  if (n === 0) return '';
  const W = 480, H = 210;
  const PAD = { top: 22, right: 8, bottom: 44, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxD = Math.max(0.001, ...chapters.map(c => c.density));
  const spacing = chartW / n;
  const barW = Math.max(6, Math.min(40, spacing - 6));

  let bars = '';
  chapters.forEach((ch, i) => {
    const x = PAD.left + i * spacing + (spacing - barW) / 2;
    const totalBarH = chartH * (ch.density / maxD);
    let stackY = PAD.top + chartH;

    ANNOTATION_TYPES.forEach(t => {
      const tc = ch.counts[t] ?? 0;
      if (tc === 0 || ch.count === 0) return;
      const segH = Math.max(1, Math.round((tc / ch.count) * totalBarH));
      stackY -= segH;
      bars += `<rect x="${x.toFixed(1)}" y="${stackY.toFixed(1)}" width="${barW}" height="${segH}" fill="${COLOR[t]}"/>`;
    });

    if (ch.density > 0) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(PAD.top + chartH - totalBarH - 4).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="var(--ink)" font-family="'Hanken Grotesk',system-ui,sans-serif" font-weight="500">${ch.density.toFixed(1)}</text>`;
    }
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(PAD.top + chartH + 13).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="var(--meta)" font-family="'Hanken Grotesk',system-ui,sans-serif">Ch. ${ch.index}</text>`;
    if (ch.words > 0) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(PAD.top + chartH + 25).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="var(--lbl)" font-family="'Hanken Grotesk',system-ui,sans-serif">${ch.words.toLocaleString()} words</text>`;
    }
  });

  let grid = '';
  const yTicks = [0, Math.round(maxD / 2), Math.round(maxD)];
  yTicks.forEach(v => {
    const y = PAD.top + chartH - (v / maxD) * chartH;
    grid += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${PAD.left + chartW}" y2="${y.toFixed(1)}" stroke="var(--rule)" stroke-width="0.6"/>`;
    grid += `<text x="${(PAD.left - 5).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="7.5" fill="var(--lbl)" font-family="'Hanken Grotesk',system-ui,sans-serif">${v}</text>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${grid}${bars}</svg>`;
}

// ── SVG: Annotation heatmap (area/line) ───────────────────────────────────────
function heatmapChart(
  points: { x: number; y: number }[],
  chapterStats: ChapterStat[],
  totalWords: number,
  hotspot?: ChapterStat,
): string {
  if (points.length < 2) return '';
  const W = 600, H = 195;
  const PAD = { top: 32, right: 16, bottom: 34, left: 34 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxY = Math.max(1, ...points.map(p => p.y));
  const yTop = Math.ceil(maxY / 20) * 20;

  const sx = (x: number) => PAD.left + (x / totalWords) * chartW;
  const sy = (y: number) => PAD.top + chartH - (y / yTop) * chartH;

  // Smooth path: use cubic bezier through points
  const pathPts = points.map(p => ({ x: sx(p.x), y: sy(p.y) }));
  let linePath = `M ${pathPts[0].x.toFixed(1)} ${pathPts[0].y.toFixed(1)}`;
  for (let i = 1; i < pathPts.length; i++) {
    const prev = pathPts[i - 1];
    const cur  = pathPts[i];
    const cx   = (prev.x + cur.x) / 2;
    linePath += ` C ${cx.toFixed(1)} ${prev.y.toFixed(1)} ${cx.toFixed(1)} ${cur.y.toFixed(1)} ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
  }
  const last = pathPts[pathPts.length - 1];
  const first = pathPts[0];
  const areaPath = `${linePath} L ${last.x.toFixed(1)} ${(PAD.top + chartH).toFixed(1)} L ${first.x.toFixed(1)} ${(PAD.top + chartH).toFixed(1)} Z`;

  // Chapter markers. Boundary lines are cheap and never collide, so draw them all;
  // labels collide on narrow chapters, so only label a chapter when its on-chart
  // width clears a threshold (with the hotspot always labelled). This is the
  // density check the old "label every chapter at its center" code lacked.
  const LABEL_MIN_PX = 26; // ~"Ch. NN" at 8px
  let markers = '';
  let cumW = 0;
  for (const ch of chapterStats) {
    const widthPx = (ch.words / totalWords) * chartW;
    const midX = sx(cumW + ch.words / 2);
    if (widthPx >= LABEL_MIN_PX || ch.index === hotspot?.index) {
      markers += `<text x="${midX.toFixed(1)}" y="${(PAD.top - 8).toFixed(1)}" text-anchor="middle" font-size="8" fill="var(--lbl)" font-family="'Hanken Grotesk',system-ui,sans-serif">Ch. ${ch.index}</text>`;
    }
    if (cumW > 0) {
      const bx = sx(cumW);
      markers += `<line x1="${bx.toFixed(1)}" y1="${PAD.top}" x2="${bx.toFixed(1)}" y2="${(PAD.top + chartH).toFixed(1)}" stroke="var(--rule)" stroke-width="0.8" stroke-dasharray="2,3"/>`;
    }
    cumW += ch.words;
  }

  // Y axis
  let yAxis = '';
  const yTicks = [0, Math.round(yTop * 0.25), Math.round(yTop * 0.5), Math.round(yTop * 0.75), yTop];
  yTicks.forEach(v => {
    const y = sy(v);
    yAxis += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${(PAD.left + chartW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--rule)" stroke-width="0.5"/>`;
    yAxis += `<text x="${(PAD.left - 5).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="7.5" fill="var(--lbl)" font-family="'Hanken Grotesk',system-ui,sans-serif">${v}</text>`;
  });

  // X axis ticks
  let xAxis = '';
  const steps = Math.min(8, Math.floor(totalWords / 1000));
  for (let i = 0; i <= steps; i++) {
    const w = Math.round((i / steps) * totalWords);
    const x = sx(w);
    const label = w >= 1000 ? `${Math.round(w / 1000)}k` : String(w);
    xAxis += `<text x="${x.toFixed(1)}" y="${(PAD.top + chartH + 14).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="var(--lbl)" font-family="'Hanken Grotesk',system-ui,sans-serif">${label}</text>`;
  }
  xAxis += `<text x="${(PAD.left + chartW / 2).toFixed(1)}" y="${(H - 1).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="var(--lbl)" font-family="'Hanken Grotesk',system-ui,sans-serif">Word Count</text>`;

  // Hotspot callout
  let callout = '';
  if (hotspot && points.length > 0) {
    const peak = points.reduce((m, p) => p.y > m.y ? p : m, points[0]);
    const px = sx(peak.x), py = sy(peak.y);
    const cx2 = Math.min(px + 56, PAD.left + chartW - 136);
    const cy2 = Math.max(py - 46, PAD.top + 4);
    callout = `
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="var(--ink)"/>
      <line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${(cx2).toFixed(1)}" y2="${(cy2 + 14).toFixed(1)}" stroke="var(--accent-heat)" stroke-width="0.9"/>
      <rect x="${cx2.toFixed(1)}" y="${cy2.toFixed(1)}" width="134" height="30" fill="var(--card)" stroke="var(--rule)" stroke-width="0.6" rx="2"/>
      <text x="${(cx2 + 7).toFixed(1)}" y="${(cy2 + 11).toFixed(1)}" font-size="7.5" fill="var(--accent-heat)" font-family="'Hanken Grotesk',system-ui,sans-serif" font-weight="bold">Hotspot</text>
      <text x="${(cx2 + 7).toFixed(1)}" y="${(cy2 + 22).toFixed(1)}" font-size="7" fill="var(--meta)" font-family="'Hanken Grotesk',system-ui,sans-serif">${peak.y.toFixed(1)} annotations / 1,000 words</text>
    `;
  }

  // Flat low-opacity fill (was a vertical opacity-stop gradient, which banded on
  // dark backgrounds). currentColor + fill-opacity keeps it theme-aware.
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${yAxis}${markers}
  <path d="${areaPath}" fill="var(--accent-heat)" fill-opacity="0.12"/>
  <path d="${linePath}" fill="none" stroke="var(--accent-heat)" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  ${xAxis}${callout}
</svg>`;
}

// ── SVG: Pie chart ────────────────────────────────────────────────────────────
function pieChart(typeTotals: Record<AnnotationType, number>, totalAnns: number): string {
  const active = ANNOTATION_TYPES.filter(t => (typeTotals[t] ?? 0) > 0);
  if (active.length === 0) return '';

  const R = 62, CX = 75, CY = 75;
  let angle = -Math.PI / 2;
  let slices = '';

  for (const t of active) {
    const n = typeTotals[t] ?? 0;
    const sweep = (n / totalAnns) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(angle);
    const y1 = CY + R * Math.sin(angle);
    angle += sweep;
    const x2 = CX + R * Math.cos(angle);
    const y2 = CY + R * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    slices += `<path d="M ${CX} ${CY} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${COLOR[t]}"/>`;
  }

  let legend = '';
  let ly = 14;
  active.forEach(t => {
    const n = typeTotals[t] ?? 0;
    const pct = Math.round((n / totalAnns) * 100);
    legend += `<rect x="164" y="${ly}" width="8" height="8" fill="${COLOR[t]}" rx="1"/>`;
    legend += `<text x="177" y="${ly + 7}" font-size="9.5" fill="var(--head)" font-family="'EB Garamond',Georgia,serif">${LABEL[t]}</text>`;
    legend += `<text x="340" y="${ly + 7}" text-anchor="end" font-size="9" fill="var(--meta)" font-family="'Hanken Grotesk',system-ui,sans-serif">${n}  (${pct}%)</text>`;
    ly += 19;
  });

  return `<svg viewBox="0 0 345 150" width="345" height="150" xmlns="http://www.w3.org/2000/svg">
  ${slices}
  ${legend}
</svg>`;
}

// ── Page-break icon stubs (simple SVG paths for stat cards) ───────────────────
function statIcon(type: string): string {
  const paths: Record<string, string> = {
    total:      '<path d="M12 3l1.5 4.5H18l-3.75 2.7 1.5 4.5L12 12l-3.75 2.7 1.5-4.5L6 7.5h4.5z"/>',
    question:   '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9a3 3 0 0 1 5.12 2.1c0 1.4-1.2 2.1-2.12 2.9M12 17v.5"/>',
    bookmark:   '<path d="M5 4h14v17l-7-4-7 4z"/>',
    highlight:  '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8" fill="none"/>',
    continuity: '<path d="M20 11a8 8 0 1 0-1.5 5"/><path d="M20 5v5h-5"/>',
  };
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--lbl)" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${paths[type] ?? ''}</svg>`;
}

// ── Editorial signals (clusters → cards, each with verbatim feedback) ─────────
function signalCard(c: AnnotationCluster, annById: Map<string, Annotation>): string {
  const meta = SIGNAL_META[c.signal];
  const samples = c.annotations.map(id => annById.get(id)).filter((a): a is Annotation => !!a && !!snippetText(a)).slice(0, 2);
  const quotes = samples.map(snippetHtml).join('');
  return `<div class="signal-card" style="--sc:${meta.color}">
    <div class="signal-head">
      <span class="signal-label">${esc(meta.label)}</span>
      <span class="signal-sev sev-${c.severity}">${c.severity}</span>
    </div>
    <div class="signal-lead">${esc(meta.lead(c))}</div>
    ${quotes}
  </div>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function css(): string {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* Theme is baked at export from the app's active theme (uiStore.theme) and can be
   flipped in-file via the toggle (data-theme on <html>, persisted to localStorage).
   Charts read these same tokens, so they track the active theme automatically.
   --accent-heat is the hotspot/heatmap-line accent; it lightens in dark for contrast. */
:root, [data-theme="light"] {
  --bg:     #E8E4DB;
  --page:   ${PAPER};
  --card:   #ffffff;
  --ink:    ${INK};
  --head:   ${HEAD};
  --meta:   ${META};
  --lbl:    ${LBL};
  --rule:   ${RULE};
  --desc:   #4A4740;
  --accent-heat: #EF6461;
  --shadow: rgba(0,0,0,.12);
}
[data-theme="dark"] {
  --bg:     #151412;
  --page:   #1e1c19;
  --card:   #252320;
  --ink:    #EDE8DF;
  --head:   #D4CEC5;
  --meta:   #8A8580;
  --lbl:    #5E5A55;
  --rule:   #333028;
  --desc:   #B8B2A8;
  --accent-heat: #F58A88;
  --shadow: rgba(0,0,0,.4);
}

/* in-file theme toggle */
.theme-toggle {
  position: fixed; top: 16px; right: 16px; z-index: 10;
  font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 10px; font-weight: 600;
  letter-spacing: .12em; text-transform: uppercase;
  color: var(--meta); background: var(--card); border: 1px solid var(--rule);
  padding: 7px 12px; border-radius: 4px; cursor: pointer;
  box-shadow: 0 1px 4px var(--shadow);
}
.theme-toggle:hover { color: var(--ink); }
@media print { .theme-toggle { display: none; } }

body {
  background: var(--bg);
  font-family: 'EB Garamond', Georgia, serif;
  -webkit-font-smoothing: antialiased;
}

.page {
  width: 760px; min-height: 1000px;
  background: var(--page); color: var(--ink);
  margin: 36px auto; padding: 56px 60px;
  box-shadow: 0 4px 24px var(--shadow), 0 1px 4px var(--shadow);
}

/* header */
.report-label { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--lbl); }
.report-title { font-family: 'EB Garamond', Georgia, serif; font-size: 46px; font-weight: 400; color: var(--ink); line-height: 1.08; margin: 8px 0 6px; }
.report-meta  { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 11px; color: var(--meta); letter-spacing: .02em; }
.rule { border: none; border-top: 1.5px solid var(--rule); margin: 16px 0; }
.rule-sm { border: none; border-top: 1px solid var(--rule); margin: 8px 0 12px; }

/* page 2 header bar */
.page2-bar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 28px; }
.page2-bar-label { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--lbl); }
.page2-bar-title { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--meta); }

/* section heading */
.sec-head { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--lbl); margin-bottom: 6px; }
.sec-sub   { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 10px; color: var(--meta); margin-bottom: 12px; }

/* stat cards */
.glance-row { display: flex; gap: 10px; margin-top: 12px; margin-bottom: 24px; }
.stat-card {
  flex: 1; background: var(--card); padding: 14px 12px 12px;
  border-top: 2.5px solid var(--accent, var(--lbl));
  border-bottom: 1px solid var(--rule);
  border-left: 1px solid var(--rule);
  border-right: 1px solid var(--rule);
}
.stat-icon { margin-bottom: 6px; }
.stat-num  { font-family: 'EB Garamond', Georgia, serif; font-size: 28px; color: var(--ink); display: block; line-height: 1; margin-bottom: 4px; }
.stat-name { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 8px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--meta); display: block; margin-bottom: 3px; }
.stat-sub  { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 8.5px; color: var(--lbl); }

/* density legend */
.legend { display: flex; gap: 16px; margin-bottom: 10px; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 5px; font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 9px; color: var(--meta); }
.legend-dot  { width: 8px; height: 8px; border-radius: 1px; flex-shrink: 0; }

/* engagement lead line */
.engagement-lead { font-family: 'EB Garamond', Georgia, serif; font-size: 13px; color: var(--desc); line-height: 1.5; margin-bottom: 16px; }
.engagement-lead strong { color: var(--ink); font-weight: 600; }

/* insights lead — ranked "look here first" rows */
.insight-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; }
.insight-row { display: flex; align-items: flex-start; gap: 14px; padding: 11px 14px; border: 1px solid var(--rule); border-left: 2px solid var(--accent); }
.insight-text { flex: 1; min-width: 0; }
.insight-tier { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 8.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--desc); margin-bottom: 3px; }
.insight-headline { font-family: 'EB Garamond', Georgia, serif; font-size: 14px; color: var(--ink); line-height: 1.4; }
.insight-detail { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 11px; color: var(--desc); line-height: 1.5; margin-top: 3px; }
.insight-tag { flex-shrink: 0; font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 10px; color: var(--ink); padding: 2px 8px; border: 1px solid var(--rule); white-space: nowrap; }

/* editorial signal cards */
.signal-card {
  border-left: 2.5px solid var(--sc); background: var(--card);
  padding: 11px 14px 12px; margin-bottom: 11px;
  border-top: 1px solid var(--rule); border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
}
.signal-head { display: flex; align-items: center; gap: 9px; margin-bottom: 5px; }
.signal-label { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--sc); }
.signal-sev { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 7.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; padding: 2px 6px; border-radius: 2px; }
.sev-high   { color: #fff; background: var(--sc); }
.sev-medium { color: var(--sc); background: var(--card); border: 1px solid var(--sc); }
.sev-low    { color: var(--meta); background: var(--card); border: 1px solid var(--rule); }
.signal-lead { font-family: 'EB Garamond', Georgia, serif; font-size: 12px; color: var(--desc); line-height: 1.5; margin-bottom: 8px; }

/* verbatim quote */
.quote { display: flex; gap: 9px; margin-top: 7px; }
.quote-mark { width: 3px; border-radius: 2px; flex-shrink: 0; align-self: stretch; }
.quote-body { min-width: 0; }
.quote-text { font-family: 'EB Garamond', Georgia, serif; font-size: 12px; font-style: italic; color: var(--head); line-height: 1.42; }
.quote-attr { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 8.5px; letter-spacing: .04em; color: var(--lbl); margin-top: 3px; text-transform: uppercase; }

/* reader consensus */
.consensus-row { display: flex; align-items: center; gap: 12px; margin-bottom: 9px; }
.consensus-ch { font-family: 'EB Garamond', Georgia, serif; font-size: 12px; color: var(--head); width: 180px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.consensus-track { flex: 1; height: 7px; background: var(--rule); border-radius: 4px; overflow: hidden; }
.consensus-fill { height: 100%; background: ${COLOR.bookmark}; border-radius: 4px; }
.consensus-val { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 9.5px; color: var(--meta); white-space: nowrap; flex-shrink: 0; min-width: 56px; text-align: right; }

/* reader feedback log */
.feedback-group { margin-bottom: 18px; break-inside: avoid; }
.feedback-ch { font-family: 'EB Garamond', Georgia, serif; font-size: 14px; color: var(--ink); margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid var(--rule); }
.feedback-item { display: flex; gap: 9px; margin-bottom: 10px; }
.feedback-mark { width: 3px; border-radius: 2px; flex-shrink: 0; align-self: stretch; }
.feedback-type { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 7.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--meta); margin-bottom: 2px; }
.feedback-text { font-family: 'EB Garamond', Georgia, serif; font-size: 12.5px; color: var(--desc); line-height: 1.48; }
.feedback-quote { font-family: 'EB Garamond', Georgia, serif; font-size: 11px; font-style: italic; color: var(--meta); line-height: 1.4; margin-top: 3px; padding-left: 9px; border-left: 1px solid var(--rule); }
.feedback-attr { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 8.5px; color: var(--lbl); margin-top: 3px; }

/* two-column */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
.three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }

/* hotspot list */
.hotspot-item { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.hotspot-num  { font-family: 'EB Garamond', Georgia, serif; font-size: 16px; color: #EF6461; min-width: 18px; margin-top: 1px; }
.hotspot-ch   { font-family: 'EB Garamond', Georgia, serif; font-size: 12px; color: var(--head); line-height: 1.3; }
.hotspot-sub  { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 9.5px; color: var(--meta); margin-top: 2px; }

/* silent chapters */
.silent-item  { margin-bottom: 11px; }
.silent-ch    { font-family: 'EB Garamond', Georgia, serif; font-size: 12px; color: ${COLOR.bookmark}; }
.silent-sub   { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 9.5px; color: var(--meta); margin-top: 2px; }

/* annotation breakdown */
.breakdown-block { display: flex; align-items: center; gap: 12px; }

/* report details box */
.details-box { border: 1px solid var(--rule); padding: 14px 16px; }
.detail-row  { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 9px; }
.detail-ico  { color: var(--meta); margin-top: 1px; }
.detail-label { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--lbl); margin-bottom: 1px; }
.detail-val   { font-family: 'EB Garamond', Georgia, serif; font-size: 12px; color: var(--head); }

/* footer */
.page-footer { margin-top: 28px; text-align: center; font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 9px; color: var(--lbl); letter-spacing: .06em; }

/* prose section (text-derived metrics) */
.prose-glance { display: flex; gap: 20px; flex-wrap: wrap; margin: 14px 0 18px; }
.prose-stat { display: flex; flex-direction: column; gap: 2px; min-width: 72px; }
.prose-stat-num { font-family: 'EB Garamond', Georgia, serif; font-size: 22px; color: var(--ink); line-height: 1; }
.prose-stat-lab { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 8px; letter-spacing: .14em; text-transform: uppercase; color: var(--lbl); }
.prose-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 10px; }
.prose-table th {
  text-align: left; font-size: 8px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--lbl); font-weight: 600; padding: 0 8px 8px 0; border-bottom: 1px solid var(--rule);
}
.prose-table th:not(:first-child) { text-align: right; }
.prose-table td { padding: 7px 8px 7px 0; border-bottom: 1px solid var(--rule); color: var(--desc); vertical-align: baseline; }
.prose-table td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; color: var(--head); }
.prose-ch { color: var(--meta) !important; text-align: left !important; max-width: 200px; }
.prose-rel { color: var(--lbl); font-size: 9px; }

/* section spacing */
.mb4  { margin-bottom: 4px; }
.mb12 { margin-bottom: 12px; }
.mb20 { margin-bottom: 20px; }
.mb28 { margin-bottom: 28px; }
.mt24 { margin-top: 24px; }
.mt28 { margin-top: 28px; }

@media print {
  body { background: white; }
  .page { margin: 0; box-shadow: none; page-break-after: always; width: 100%; }
  .page:last-child { page-break-after: auto; }
  @page { size: letter; margin: 0.75in; }
}
`.trim();
}

// ── Full HTML builder ─────────────────────────────────────────────────────────
function buildHtml(opts: {
  title: string;
  annotations: Annotation[];
  chapters: Chapter[];
  signals: EditorialSignals;
  dateStr: string;
  theme?: 'light' | 'dark';
}): string {
  const { title, annotations, chapters, signals, dateStr, theme = 'light' } = opts;
  const rep = signals.report;
  const pct = (n: number) => rep.totalAnns > 0 ? Math.round((n / rep.totalAnns) * 100) : 0;
  const annById = new Map(annotations.map(a => [a.id, a]));
  const stripCh = (t: string) => t.replace(/^Chapter \d+\s*[—-]?\s*/i, '');

  const metaParts = [
    `${rep.totalWords.toLocaleString()} words`,
    `${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}`,
    rep.readers.length ? `${rep.readers.length} reader${rep.readers.length !== 1 ? 's' : ''}` : null,
    `${rep.totalAnns} annotation${rep.totalAnns !== 1 ? 's' : ''}`,
    `Generated ${dateStr}`,
  ].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');

  const proseHtml = signals.prose ? buildProseSectionHtml(signals.prose) : '';

  // Insights lead — the same ranked pointers the in-app panel opens with, so the
  // downloaded report and the screen lead with one story. Leads page 1; omitted
  // when nothing is genuinely off (an even, lightly-annotated draft).
  const insights = rankInsights(signals);
  // Authorship-aware by tier (matches the in-app panel): reader marks are reader
  // reaction; the author's own marks ride the distinct 'author-queue' tier —
  // "Your revision flags" — and are never labeled reader reaction.
  const tierLabel: Record<InsightTier, string> = { consensus: 'Reader agreement', reaction: 'Reader reactions', 'author-queue': 'Your revision flags', prose: 'Prose' };
  const tierAccent: Record<InsightTier, string> = { consensus: 'var(--ink)', reaction: COLOR.question, 'author-queue': COLOR.note, prose: 'var(--desc)' };
  const insightsHtml = insights.length ? `
  <div class="sec-head mb4">Worth a Look First</div>
  <div class="insight-list">
    ${insights.map(i => `
    <div class="insight-row" style="--accent:${tierAccent[i.tier]}">
      <div class="insight-text">
        <div class="insight-tier">${esc(tierLabel[i.tier])}</div>
        <div class="insight-headline">${esc(i.headline)}</div>
        ${i.detail ? `<div class="insight-detail">${esc(i.detail)}</div>` : ''}
      </div>
      <div class="insight-tag">${esc(i.evidence.label)}</div>
    </div>`).join('')}
  </div>` : '';

  // At a Glance cards
  const glanceItems = [
    { key: 'total',     accent: COLOR.highlight, icon: 'total',     num: rep.totalAnns,             name: 'Total Annotations',  sub: `${(rep.totalAnns / (rep.totalWords / 1000 || 1)).toFixed(1)} per 1,000 words` },
    { key: 'question',  accent: COLOR.question,  icon: 'question',  num: rep.typeTotals.question,   name: 'Questions',           sub: `${pct(rep.typeTotals.question)}% of all` },
    { key: 'bookmark',  accent: COLOR.bookmark,  icon: 'bookmark',  num: rep.typeTotals.bookmark,   name: 'Bookmarks',           sub: `${pct(rep.typeTotals.bookmark)}% of all` },
    { key: 'highlight', accent: COLOR.highlight, icon: 'highlight', num: rep.typeTotals.highlight,  name: 'Highlights',          sub: `${pct(rep.typeTotals.highlight)}% of all` },
    { key: 'continuity',accent: COLOR.continuity,icon: 'continuity',num: rep.typeTotals.continuity, name: 'Continuity Flags',    sub: `${pct(rep.typeTotals.continuity)}% of all` },
  ];
  const glanceHtml = `<div class="glance-row">${glanceItems.map(g => `
    <div class="stat-card" style="--accent:${g.accent}">
      <div class="stat-icon">${statIcon(g.icon)}</div>
      <span class="stat-num">${g.num}</span>
      <span class="stat-name">${esc(g.name)}</span>
      <span class="stat-sub">${esc(g.sub)}</span>
    </div>`).join('')}
  </div>`;

  // Density chart + legend
  const activeDensityTypes = ANNOTATION_TYPES.filter(t => (rep.typeTotals[t] ?? 0) > 0);
  const legendHtml = `<div class="legend">${activeDensityTypes.map(t =>
    `<div class="legend-item"><span class="legend-dot" style="background:${COLOR[t]}"></span>${LABEL[t]}</div>`
  ).join('')}</div>`;

  // Editorial signals (cluster cards with verbatim feedback) + engagement lead.
  // Engagement is a READER measure — shown only when reader-authored marks exist;
  // a solo author's own flags never render as "reader engagement".
  const engagementLead = rep.readers.length > 0
    ? `<div class="engagement-lead"><strong>Reader engagement: ${esc(rep.label)}.</strong> ${esc(rep.blurb)}</div>`
    : '';
  const signalsHtml = rep.clusters.length
    ? rep.clusters.slice(0, 4).map(c => signalCard(c, annById)).join('')
    : `<p style="color:var(--lbl);font-size:12px;font-style:italic">No concentrated signals yet — feedback is spread evenly across the manuscript.</p>`;

  // Hotspots — each with one representative piece of verbatim feedback.
  const hotspotsHtml = rep.hotspots.length ? rep.hotspots.slice(0, 3).map((h, i) => {
    const rep1 = representativeForChapter(annotations, h.index);
    return `
    <div class="hotspot-item">
      <div class="hotspot-num">${i + 1}</div>
      <div style="min-width:0">
        <div class="hotspot-ch">Chapter ${h.index}${h.title ? ` — ${esc(stripCh(h.title))}` : ''}</div>
        <div class="hotspot-sub">${h.density.toFixed(1)} annotations&nbsp;/&nbsp;1,000 words</div>
        ${rep1 ? snippetHtml(rep1) : ''}
      </div>
    </div>`;
  }).join('') : `<p style="color:var(--lbl);font-size:11px;font-style:italic">No standout hotspots yet.</p>`;

  const silentHtml = rep.silent.length ? rep.silent.slice(0, 4).map(s => `
    <div class="silent-item">
      <div class="silent-ch">Chapter ${s.index}${s.title ? ` — ${esc(stripCh(s.title))}` : ''}</div>
      <div class="silent-sub">${s.count === 0 ? 'No annotations.' : `${s.density.toFixed(1)} ann. / 1,000 words · below average (${rep.avgDensity.toFixed(1)})`}</div>
    </div>`).join('') : `<p style="color:var(--lbl);font-size:11px;font-style:italic">Every chapter drew engagement.</p>`;

  // Cross-reader agreement — abandonment-aware (Phase 6 EditorialSignals): of the
  // readers who *reached* a chapter, how many independently reacted. Distinguishes
  // "silence from readers who got there" from "nobody arrived". Only meaningful
  // with ≥1 reader session (engine returns [] otherwise).
  const consensusHtml = signals.readerAgreement.length ? signals.readerAgreement.slice(0, 6).map(a => {
    const reached = a.readersWhoReached < 0 ? signals.readerCount : a.readersWhoReached;
    const pct = Math.round(a.agreement * 100);
    return `
    <div class="consensus-row">
      <div class="consensus-ch">Ch. ${a.chapterIndex}${a.chapterTitle ? ` — ${esc(stripCh(a.chapterTitle))}` : ''}</div>
      <div class="consensus-track"><div class="consensus-fill" style="width:${pct}%"></div></div>
      <div class="consensus-val">${a.readersWhoAnnotated} of ${reached} · ${pct}%</div>
    </div>`;
  }).join('') : '';

  // Reader feedback log (page 3) — verbatim questions, continuity & structural notes by chapter.
  const logTypes: AnnotationType[] = ['question', 'continuity', 'structural'];
  const logAnns = annotations
    .filter(a => logTypes.includes(a.type) && snippetText(a))
    .sort((a, b) => a.chapterIndex - b.chapterIndex || a.createdAt - b.createdAt);
  const logByChapter = new Map<number, Annotation[]>();
  for (const a of logAnns) {
    const arr = logByChapter.get(a.chapterIndex) ?? [];
    arr.push(a);
    logByChapter.set(a.chapterIndex, arr);
  }
  const feedbackLogHtml = [...logByChapter.entries()].map(([idx, anns]) => {
    const chTitle = rep.chapters.find(c => c.index === idx)?.title;
    const items = anns.map(a => {
      const isNote = a.type !== 'highlight' && a.type !== 'bookmark';
      const primary = isNote ? (a.note.trim() || a.quote.trim()) : a.quote.trim();
      const ptrunc = primary.length > 280 ? primary.slice(0, 277).trimEnd() + '…' : primary;
      const ctx = isNote && a.note.trim() && a.quote.trim()
        ? `<div class="feedback-quote">“${esc(a.quote.trim().length > 160 ? a.quote.trim().slice(0, 157).trimEnd() + '…' : a.quote.trim())}”</div>` : '';
      return `
      <div class="feedback-item">
        <span class="feedback-mark" style="background:${COLOR[a.type] ?? LBL}"></span>
        <div style="min-width:0">
          <div class="feedback-type" style="color:${COLOR[a.type] ?? META}">${esc(LABEL[a.type] ?? a.type)}</div>
          <div class="feedback-text">${esc(ptrunc)}</div>
          ${ctx}
          <div class="feedback-attr">${a.readerName ? esc(a.readerName) : 'You'}</div>
        </div>
      </div>`;
    }).join('');
    return `<div class="feedback-group">
      <div class="feedback-ch">Chapter ${idx}${chTitle ? ` — ${esc(stripCh(chTitle))}` : ''}</div>
      ${items}
    </div>`;
  }).join('');

  // Heatmap
  const heatPts = buildHeatmapPoints(annotations, rep.chapters);
  const heatSvg = heatmapChart(heatPts, rep.chapters, rep.totalWords, rep.hotspots[0]);

  // Pie chart
  const pieSvg = pieChart(rep.typeTotals, rep.totalAnns);

  // Density chart
  const barSvg = densityChart(rep.chapters);

  // Report details
  const detailsHtml = `
    <div class="details-box">
      <div class="detail-row">
        <div>
          <div class="detail-label">Manuscript</div>
          <div class="detail-val">${esc(title)}</div>
        </div>
      </div>
      <div class="detail-row">
        <div>
          <div class="detail-label">Total Words</div>
          <div class="detail-val">${rep.totalWords.toLocaleString()}</div>
        </div>
      </div>
      <div class="detail-row">
        <div>
          <div class="detail-label">Total Readers</div>
          <div class="detail-val">${rep.readers.length ? rep.readers.length : '—'}</div>
        </div>
      </div>
      <div class="detail-row">
        <div>
          <div class="detail-label">Generated</div>
          <div class="detail-val">${esc(dateStr)}</div>
        </div>
      </div>
    </div>`;

  const completionPct = Math.round(signals.completionRate * 100);
  const versionsNote = signals.versionsRead.length > 1
    ? ` · ⚠ readers saw ${signals.versionsRead.length} different drafts`
    : '';
  const readerSummary = signals.readerCount > 0
    ? `${signals.readerCount} reader${signals.readerCount !== 1 ? 's' : ''} · ${completionPct}% finished${versionsNote}`
    : '';
  const consensusSection = consensusHtml ? `
  <div class="sec-head mt28 mb4">Reader Agreement</div>
  <div class="sec-sub">Of the readers who reached each chapter, how many independently reacted — your strongest revision signal.${readerSummary ? `  ${esc(readerSummary)}` : ''}</div>
  ${consensusHtml}` : '';

  const page3 = feedbackLogHtml ? `
<!-- ════════ PAGE 3 ════════ -->
<div class="page">
  <div class="page2-bar">
    <span class="page2-bar-label">Reader Feedback — Verbatim</span>
    <span class="page2-bar-title">${esc(title.toUpperCase())}</span>
  </div>
  <div class="sec-head mb4">Questions, Continuity &amp; Structural Notes</div>
  <div class="sec-sub">Every flagged note in reading order — the raw editorial signal behind the charts</div>
  <div class="mt24">${feedbackLogHtml}</div>
  <div class="page-footer">${esc(title)}&nbsp;&nbsp;—&nbsp;&nbsp;Intelligence Report&nbsp;&nbsp;—&nbsp;&nbsp;p.3</div>
</div>` : '';

  // Bake the app's active theme as the initial data-theme, but let a stored
  // recipient preference win on load (set before paint to avoid a flash).
  const initTheme = `<script>(function(){try{var t=localStorage.getItem('vellibris-report-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;
  const toggleScript = `<script>(function(){var b=document.getElementById('theme-toggle');if(!b)return;function sync(){var d=document.documentElement.getAttribute('data-theme')==='dark';b.textContent=d?'☀ Light':'☾ Dark';}b.addEventListener('click',function(){var d=document.documentElement.getAttribute('data-theme')==='dark';var n=d?'light':'dark';document.documentElement.setAttribute('data-theme',n);try{localStorage.setItem('vellibris-report-theme',n);}catch(e){}sync();});sync();})();</script>`;

  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Intelligence Report</title>
${initTheme}
${GOOGLE_FONTS_LINK}
<style>${css()}</style>
</head>
<body>
<button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle light or dark theme">☾ Dark</button>

<!-- ════════ PAGE 1 ════════ -->
<div class="page">

  <div class="report-label">Manuscript Intelligence Report</div>
  <h1 class="report-title">${esc(title)}</h1>
  <p class="report-meta">${metaParts}</p>
  <hr class="rule" />

  ${insightsHtml}

  ${proseHtml}

  <!-- At a Glance -->
  <div class="sec-head mb4${proseHtml ? ' mt28' : ''}">At a Glance</div>
  ${glanceHtml}

  <!-- Density by chapter -->
  <div class="sec-head mb4">Annotation Density by Chapter</div>
  <div class="sec-sub">Annotations per 1,000 words</div>
  ${legendHtml}
  ${barSvg}

  <!-- Editorial Signals -->
  <div class="sec-head mt24 mb12">Editorial Signals</div>
  ${engagementLead}
  ${signalsHtml}

  <div class="page-footer">${esc(title)}&nbsp;&nbsp;—&nbsp;&nbsp;Intelligence Report&nbsp;&nbsp;—&nbsp;&nbsp;p.1</div>
</div>

<!-- ════════ PAGE 2 ════════ -->
<div class="page">

  <div class="page2-bar">
    <span class="page2-bar-label">Manuscript Intelligence Report</span>
    <span class="page2-bar-title">${esc(title.toUpperCase())}</span>
  </div>

  <!-- Heatmap -->
  <div class="sec-head mb4">Annotation Heatmap</div>
  <div class="sec-sub">Annotations per 1,000 words (sliding window)</div>
  ${heatSvg || `<p style="color:var(--lbl);font-size:11px;font-style:italic;margin-bottom:20px">Insufficient data for heatmap.</p>`}

  <!-- Hotspots + Silent -->
  <div class="two-col mt24 mb28">
    <div>
      <div class="sec-head mb4">Top Annotation Hotspots</div>
      <hr class="rule-sm" />
      ${hotspotsHtml}
    </div>
    <div>
      <div class="sec-head mb4">Silent Chapters</div>
      <hr class="rule-sm" />
      ${silentHtml}
    </div>
  </div>
  ${consensusSection}

  <!-- Breakdown + Details -->
  <div class="two-col mt28">
    <div>
      <div class="sec-head mb4">Annotation Type Breakdown</div>
      <div class="sec-sub">Distribution across the manuscript</div>
      ${pieSvg}
    </div>
    <div>
      <div class="sec-head mb4">Report Details</div>
      <div class="sec-sub">&nbsp;</div>
      ${detailsHtml}
    </div>
  </div>

  <div class="page-footer">${esc(title)}&nbsp;&nbsp;—&nbsp;&nbsp;Intelligence Report&nbsp;&nbsp;—&nbsp;&nbsp;p.2</div>
</div>
${page3}
${toggleScript}
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────
export { buildHtml as buildReportHtml };

export function exportReportHtml(
  title: string,
  id: string,
  annotations: Annotation[],
  chapters: Chapter[],
  signals: EditorialSignals,
  theme: 'light' | 'dark' = 'light',
): void {
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const html = buildHtml({ title, annotations, chapters, signals, dateStr, theme });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${id}-intelligence-report.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
