// ─── HTML Intelligence Report Export ──────────────────────────────────────────
// Generates a self-contained, two-page HTML report matching the DOCX output
// in structure: header, At a Glance, density bar chart, key takeaways (p.1)
// then annotation heatmap, hotspots/silent chapters, type breakdown, report
// details (p.2). All charts are inline SVG. No external dependencies.

import type { Annotation, AnnotationType, Chapter, ChapterStat, Report } from '../types';
import { ANNOTATION_TYPES } from '../types';

// ── Palette (matches app light mode: index.css :root.light) ───────────────────
const COLOR: Record<AnnotationType, string> = {
  highlight:  '#D9AC3C',  // --ann-highlight-solid
  note:       '#8E9192',  // --ann-note-solid
  bookmark:   '#6366F1',  // --ann-bookmark-solid
  question:   '#EF6461',  // --ann-question-solid
  continuity: '#34D399',  // --ann-continuity-solid
  structural: '#FB923C',  // --ann-structural-solid
};
const LABEL: Record<AnnotationType, string> = {
  highlight:  'Highlights',
  note:       'Notes',
  bookmark:   'Bookmarks',
  question:   'Questions',
  continuity: 'Continuity Flags',
  structural: 'Structural',
};
const INK = '#1B1A17', HEAD = '#2C2A26', META = '#6B6760',
      LBL = '#A09B90', RULE = '#E8E4DB', PAPER = '#FAF9F6';

function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(PAD.top + chartH - totalBarH - 4).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="${INK}" font-family="Arial,sans-serif" font-weight="500">${ch.density.toFixed(1)}</text>`;
    }
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(PAD.top + chartH + 13).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="${META}" font-family="Arial,sans-serif">Ch. ${ch.index}</text>`;
    if (ch.words > 0) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(PAD.top + chartH + 25).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="${LBL}" font-family="Arial,sans-serif">${ch.words.toLocaleString()} words</text>`;
    }
  });

  let grid = '';
  const yTicks = [0, Math.round(maxD / 2), Math.round(maxD)];
  yTicks.forEach(v => {
    const y = PAD.top + chartH - (v / maxD) * chartH;
    grid += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${PAD.left + chartW}" y2="${y.toFixed(1)}" stroke="${RULE}" stroke-width="0.6"/>`;
    grid += `<text x="${(PAD.left - 5).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="7.5" fill="${LBL}" font-family="Arial,sans-serif">${v}</text>`;
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

  // Chapter markers
  let markers = '';
  let cumW = 0;
  for (const ch of chapterStats) {
    const midX = sx(cumW + ch.words / 2);
    markers += `<text x="${midX.toFixed(1)}" y="${(PAD.top - 8).toFixed(1)}" text-anchor="middle" font-size="8" fill="${LBL}" font-family="Arial,sans-serif">Ch. ${ch.index}</text>`;
    if (cumW > 0) {
      const bx = sx(cumW);
      markers += `<line x1="${bx.toFixed(1)}" y1="${PAD.top}" x2="${bx.toFixed(1)}" y2="${(PAD.top + chartH).toFixed(1)}" stroke="${RULE}" stroke-width="0.8" stroke-dasharray="2,3"/>`;
    }
    cumW += ch.words;
  }

  // Y axis
  let yAxis = '';
  const yTicks = [0, Math.round(yTop * 0.25), Math.round(yTop * 0.5), Math.round(yTop * 0.75), yTop];
  yTicks.forEach(v => {
    const y = sy(v);
    yAxis += `<line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${(PAD.left + chartW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${RULE}" stroke-width="0.5"/>`;
    yAxis += `<text x="${(PAD.left - 5).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="7.5" fill="${LBL}" font-family="Arial,sans-serif">${v}</text>`;
  });

  // X axis ticks
  let xAxis = '';
  const steps = Math.min(8, Math.floor(totalWords / 1000));
  for (let i = 0; i <= steps; i++) {
    const w = Math.round((i / steps) * totalWords);
    const x = sx(w);
    const label = w >= 1000 ? `${Math.round(w / 1000)}k` : String(w);
    xAxis += `<text x="${x.toFixed(1)}" y="${(PAD.top + chartH + 14).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="${LBL}" font-family="Arial,sans-serif">${label}</text>`;
  }
  xAxis += `<text x="${(PAD.left + chartW / 2).toFixed(1)}" y="${(H - 1).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="${LBL}" font-family="Arial,sans-serif">Word Count</text>`;

  // Hotspot callout
  let callout = '';
  if (hotspot && points.length > 0) {
    const peak = points.reduce((m, p) => p.y > m.y ? p : m, points[0]);
    const px = sx(peak.x), py = sy(peak.y);
    const cx2 = Math.min(px + 56, PAD.left + chartW - 136);
    const cy2 = Math.max(py - 46, PAD.top + 4);
    callout = `
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="${INK}"/>
      <line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${(cx2).toFixed(1)}" y2="${(cy2 + 14).toFixed(1)}" stroke="#EF6461" stroke-width="0.9"/>
      <rect x="${cx2.toFixed(1)}" y="${cy2.toFixed(1)}" width="134" height="30" fill="white" stroke="${RULE}" stroke-width="0.6" rx="2"/>
      <text x="${(cx2 + 7).toFixed(1)}" y="${(cy2 + 11).toFixed(1)}" font-size="7.5" fill="#EF6461" font-family="Arial,sans-serif" font-weight="bold">Hotspot</text>
      <text x="${(cx2 + 7).toFixed(1)}" y="${(cy2 + 22).toFixed(1)}" font-size="7" fill="${META}" font-family="Arial,sans-serif">${peak.y.toFixed(1)} annotations / 1,000 words</text>
    `;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#EF6461" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#EF6461" stop-opacity="0.03"/>
    </linearGradient>
  </defs>
  ${yAxis}${markers}
  <path d="${areaPath}" fill="url(#hg)"/>
  <path d="${linePath}" fill="none" stroke="#EF6461" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
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
    legend += `<text x="177" y="${ly + 7}" font-size="9.5" fill="${HEAD}" font-family="Georgia,serif">${LABEL[t]}</text>`;
    legend += `<text x="340" y="${ly + 7}" text-anchor="end" font-size="9" fill="${META}" font-family="Arial,sans-serif">${n}  (${pct}%)</text>`;
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
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="${LBL}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${paths[type] ?? ''}</svg>`;
}

// ── Key takeaways ─────────────────────────────────────────────────────────────
function buildTakeaways(rep: Report): { color: string; title: string; desc: string }[] {
  const out: { color: string; title: string; desc: string }[] = [];
  if (rep.questionClusters.length) {
    const top = rep.questionClusters[0];
    const q = top.counts.question ?? 0;
    out.push({ color: COLOR.question, title: `High Question Density in Chapter ${top.index}`,
      desc: `Readers raised ${q} question${q !== 1 ? 's' : ''} in this chapter — among the highest in the manuscript.` });
  }
  if (rep.hotspots.length) {
    out.push({ color: COLOR.highlight, title: 'Major Hotspot Detected',
      desc: `A concentrated spike of annotations suggests a section that challenged or engaged readers.` });
  }
  if (rep.continuityFlags.length) {
    const idxs = rep.continuityFlags.map(c => `${c.index}`).slice(0, 4).join(', ');
    out.push({ color: COLOR.continuity, title: 'Continuity Concerns to Review',
      desc: `Continuity was flagged in chapter${rep.continuityFlags.length !== 1 ? 's' : ''} ${idxs}. Consider a focused pass.` });
  }
  out.push({ color: COLOR.bookmark, title: `Reader Engagement: ${rep.label}`, desc: rep.blurb });
  return out;
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function css(): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Light mode (default) ── */
body {
  --bg:     #E8E4DB;
  --page:   ${PAPER};
  --card:   #ffffff;
  --ink:    ${INK};
  --head:   ${HEAD};
  --meta:   ${META};
  --lbl:    ${LBL};
  --rule:   ${RULE};
  --desc:   #4A4740;
  --shadow: rgba(0,0,0,.12);
  background: var(--bg);
  font-family: Georgia, 'EB Garamond', serif;
  -webkit-font-smoothing: antialiased;
  transition: background 0.3s ease;
}

/* ── Dark mode ── */
body[data-theme="dark"] {
  --bg:     #16150F;
  --page:   #1E1C16;
  --card:   #2A2720;
  --ink:    #F7F4EC;
  --head:   #E6E1D4;
  --meta:   #B6B1A3;
  --lbl:    #8A857A;
  --rule:   #3A362D;
  --desc:   #C8C2B4;
  --shadow: rgba(0,0,0,.4);
}

.page {
  width: 760px; min-height: 1000px;
  background: var(--page); color: var(--ink);
  margin: 36px auto; padding: 56px 60px;
  box-shadow: 0 4px 24px var(--shadow), 0 1px 4px var(--shadow);
  transition: background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease;
}

/* header */
.report-label { font-family: Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--lbl); }
.report-title { font-family: Georgia, serif; font-size: 46px; font-weight: 400; color: var(--ink); line-height: 1.08; margin: 8px 0 6px; }
.report-meta  { font-family: Arial, sans-serif; font-size: 11px; color: var(--meta); letter-spacing: .02em; }
.rule { border: none; border-top: 1.5px solid var(--rule); margin: 16px 0; }
.rule-sm { border: none; border-top: 1px solid var(--rule); margin: 8px 0 12px; }

/* page 2 header bar */
.page2-bar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 28px; }
.page2-bar-label { font-family: Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--lbl); }
.page2-bar-title { font-family: Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--meta); }

/* section heading */
.sec-head { font-family: Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--lbl); margin-bottom: 6px; }
.sec-sub   { font-family: Arial, sans-serif; font-size: 10px; color: var(--meta); margin-bottom: 12px; }

/* stat cards */
.glance-row { display: flex; gap: 10px; margin-top: 12px; margin-bottom: 24px; }
.stat-card {
  flex: 1; background: var(--card); padding: 14px 12px 12px;
  border-top: 2.5px solid var(--accent, var(--lbl));
  border-bottom: 1px solid var(--rule);
  border-left: 1px solid var(--rule);
  border-right: 1px solid var(--rule);
  transition: background 0.3s ease, border-color 0.3s ease;
}
.stat-icon { margin-bottom: 6px; }
.stat-num  { font-family: Georgia, serif; font-size: 28px; color: var(--ink); display: block; line-height: 1; margin-bottom: 4px; }
.stat-name { font-family: Arial, sans-serif; font-size: 8px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--meta); display: block; margin-bottom: 3px; }
.stat-sub  { font-family: Arial, sans-serif; font-size: 8.5px; color: var(--lbl); }

/* density legend */
.legend { display: flex; gap: 16px; margin-bottom: 10px; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 5px; font-family: Arial, sans-serif; font-size: 9px; color: var(--meta); }
.legend-dot  { width: 8px; height: 8px; border-radius: 1px; flex-shrink: 0; }

/* key takeaways */
.takeaway { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
.takeaway-dot { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
.takeaway-dot svg { width: 11px; height: 11px; }
.takeaway-title { font-family: Arial, sans-serif; font-size: 11px; font-weight: 600; color: var(--tc); margin-bottom: 2px; }
.takeaway-desc  { font-family: Georgia, serif; font-size: 12px; color: var(--desc); line-height: 1.55; }

/* two-column */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
.three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }

/* hotspot list */
.hotspot-item { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.hotspot-num  { font-family: Georgia, serif; font-size: 16px; color: #EF6461; min-width: 18px; margin-top: 1px; }
.hotspot-ch   { font-family: Georgia, serif; font-size: 12px; color: var(--head); line-height: 1.3; }
.hotspot-sub  { font-family: Arial, sans-serif; font-size: 9.5px; color: var(--meta); margin-top: 2px; }

/* silent chapters */
.silent-item  { margin-bottom: 11px; }
.silent-ch    { font-family: Georgia, serif; font-size: 12px; color: ${COLOR.bookmark}; }
.silent-sub   { font-family: Arial, sans-serif; font-size: 9.5px; color: var(--meta); margin-top: 2px; }

/* annotation breakdown */
.breakdown-block { display: flex; align-items: center; gap: 12px; }

/* report details box */
.details-box { border: 1px solid var(--rule); padding: 14px 16px; transition: border-color 0.3s ease; }
.detail-row  { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 9px; }
.detail-ico  { color: var(--meta); margin-top: 1px; }
.detail-label { font-family: Arial, sans-serif; font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--lbl); margin-bottom: 1px; }
.detail-val   { font-family: Georgia, serif; font-size: 12px; color: var(--head); }

/* footer */
.page-footer { margin-top: 28px; text-align: center; font-family: Arial, sans-serif; font-size: 9px; color: var(--lbl); letter-spacing: .06em; }

/* section spacing */
.mb4  { margin-bottom: 4px; }
.mb12 { margin-bottom: 12px; }
.mb20 { margin-bottom: 20px; }
.mb28 { margin-bottom: 28px; }
.mt24 { margin-top: 24px; }

/* ── Theme toggle button ── */
#theme-toggle {
  position: fixed; top: 18px; right: 18px; z-index: 99;
  display: flex; align-items: center; gap: 7px;
  font-family: Arial, sans-serif; font-size: 10px; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase;
  background: var(--card); color: var(--meta);
  border: 1px solid var(--rule); padding: 7px 13px;
  cursor: pointer; border-radius: 2px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
#theme-toggle:hover { color: var(--ink); }
#theme-toggle svg { flex-shrink: 0; transition: opacity 0.2s; }

@media print {
  body { background: white; }
  #theme-toggle { display: none; }
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
  report: Report;
  dateStr: string;
}): string {
  const { title, annotations, chapters, report: rep, dateStr } = opts;
  const pct = (n: number) => rep.totalAnns > 0 ? Math.round((n / rep.totalAnns) * 100) : 0;

  const metaParts = [
    `${rep.totalWords.toLocaleString()} words`,
    `${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}`,
    rep.readers.length ? `${rep.readers.length} reader${rep.readers.length !== 1 ? 's' : ''}` : null,
    `${rep.totalAnns} annotation${rep.totalAnns !== 1 ? 's' : ''}`,
    `Generated ${dateStr}`,
  ].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');

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

  // Key takeaways
  const takeaways = buildTakeaways(rep);
  const takeawaysHtml = takeaways.map(t => `
    <div class="takeaway">
      <div class="takeaway-dot" style="background:${t.color}22; --tc:${t.color}">
        <svg viewBox="0 0 12 12" fill="none" stroke="${t.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="6" r="4.5"/>
        </svg>
      </div>
      <div>
        <div class="takeaway-title" style="--tc:${t.color}">${esc(t.title)}</div>
        <div class="takeaway-desc">${esc(t.desc)}</div>
      </div>
    </div>`).join('');

  // Hotspots + silent chapter HTML
  const hotspotsHtml = rep.hotspots.length ? rep.hotspots.slice(0, 3).map((h, i) => `
    <div class="hotspot-item">
      <div class="hotspot-num">${i + 1}</div>
      <div>
        <div class="hotspot-ch">Chapter ${h.index}${h.title ? ` — ${esc(h.title.replace(/^Chapter \d+\s*[—-]?\s*/i, ''))}` : ''}</div>
        <div class="hotspot-sub">${h.density.toFixed(1)} annotations&nbsp;/&nbsp;1,000 words</div>
      </div>
    </div>`).join('') : `<p style="color:${LBL};font-size:11px;font-style:italic">No standout hotspots yet.</p>`;

  const silentHtml = rep.silent.length ? rep.silent.slice(0, 4).map(s => `
    <div class="silent-item">
      <div class="silent-ch">Chapter ${s.index}${s.title ? ` — ${esc(s.title.replace(/^Chapter \d+\s*[—-]?\s*/i, ''))}` : ''}</div>
      <div class="silent-sub">${s.count === 0 ? 'No annotations.' : `${s.density.toFixed(1)} ann. / 1,000 words · below average (${rep.avgDensity.toFixed(1)})`}</div>
    </div>`).join('') : `<p style="color:${LBL};font-size:11px;font-style:italic">Every chapter drew engagement.</p>`;

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

  const moonIcon = `<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 12.5A7.5 7.5 0 0 1 7.5 2.5a7.5 7.5 0 1 0 10 10z"/></svg>`;
  const sunIcon  = `<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>`;

  // Escape SVG for use inside a JS single-quoted string inside a <script> block.
  // We only need to escape backslashes and single quotes; angle brackets are fine in <script>.
  const moonStr = moonIcon.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const sunStr  = sunIcon.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const toggleScript = `<script>
(function(){
  var moon='${moonStr}',sun='${sunStr}';
  var btn=document.getElementById('theme-toggle');
  btn.addEventListener('click',function(){
    var b=document.body,d=b.getAttribute('data-theme')==='dark';
    b.setAttribute('data-theme',d?'light':'dark');
    btn.innerHTML=(d?moon+' Dark':sun+' Light');
  });
})();
<\/script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Intelligence Report</title>
<style>${css()}</style>
</head>
<body>
<button id="theme-toggle" aria-label="Toggle theme">
  ${moonIcon} Dark
</button>

<!-- ════════ PAGE 1 ════════ -->
<div class="page">

  <div class="report-label">Manuscript Intelligence Report</div>
  <h1 class="report-title">${esc(title)}</h1>
  <p class="report-meta">${metaParts}</p>
  <hr class="rule" />

  <!-- At a Glance -->
  <div class="sec-head mb4">At a Glance</div>
  ${glanceHtml}

  <!-- Density by chapter -->
  <div class="sec-head mb4">Annotation Density by Chapter</div>
  <div class="sec-sub">Annotations per 1,000 words</div>
  ${legendHtml}
  ${barSvg}

  <!-- Key Takeaways -->
  <div class="sec-head mt24 mb12">Key Takeaways</div>
  ${takeawaysHtml}

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
  ${heatSvg || `<p style="color:${LBL};font-size:11px;font-style:italic;margin-bottom:20px">Insufficient data for heatmap.</p>`}

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

  <!-- Breakdown + Details -->
  <div class="two-col">
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

${toggleScript}
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function exportReportHtml(
  title: string,
  id: string,
  annotations: Annotation[],
  chapters: Chapter[],
  report: Report,
): void {
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const html = buildHtml({ title, annotations, chapters, report, dateStr });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${id}-intelligence-report.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
