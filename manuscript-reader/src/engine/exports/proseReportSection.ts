// Shared Prose section for intelligence report exports (HTML + DOCX).
// Mirrors the in-app ReportView prose table — counts only, vs this manuscript's average.

import type { ChapterProse, ProseAnalysis } from '../types';

export const PROSE_CHAPTER_LONG = 1.4;
export const PROSE_CHAPTER_SHORT = 0.6;

export function proseChaptersWithText(prose: ProseAnalysis): ChapterProse[] {
  return prose.chapters.filter(c => c.words > 0);
}

export function proseChapterLengthRatio(words: number, meanChapterWords: number): number {
  return meanChapterWords > 0 ? words / meanChapterWords : 1;
}

export function proseChapterLengthOutlier(ratio: number): boolean {
  return ratio >= PROSE_CHAPTER_LONG || ratio <= PROSE_CHAPTER_SHORT;
}

function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function chapterLabel(c: ChapterProse): string {
  const t = c.title?.trim();
  if (t) return t.length > 28 ? t.slice(0, 25) + '…' : t;
  return `Ch. ${c.index}`;
}

/** Self-contained HTML block for the intelligence report (page 1, before annotation stats). */
export function buildProseSectionHtml(prose: ProseAnalysis): string {
  const rows = proseChaptersWithText(prose);
  if (!rows.length) return '';

  const b = prose.baselines;
  const tableRows = rows.map(c => {
    const ratio = proseChapterLengthRatio(c.words, b.meanChapterWords);
    const rel = proseChapterLengthOutlier(ratio) ? ` <span class="prose-rel">· ${ratio.toFixed(1)}×</span>` : '';
    return `<tr>
      <td class="prose-ch">${esc(chapterLabel(c))}</td>
      <td class="prose-num">${c.words.toLocaleString()}${rel}</td>
      <td class="prose-num">${Math.round(c.dialogueRatio * 100)}%</td>
      <td class="prose-num">${c.meanSentenceWords}w</td>
    </tr>`;
  }).join('');

  return `
  <div class="sec-head mb4">Prose</div>
  <div class="sec-sub">Measured from the text itself — every figure is a count, compared only to this manuscript's own average. Nothing here is a judgment.</div>
  <div class="prose-glance">
    <div class="prose-stat"><span class="prose-stat-num">${b.totalWords.toLocaleString()}</span><span class="prose-stat-lab">Words</span></div>
    <div class="prose-stat"><span class="prose-stat-num">${Math.round(b.meanChapterWords).toLocaleString()}</span><span class="prose-stat-lab">Avg chapter</span></div>
    <div class="prose-stat"><span class="prose-stat-num">${Math.round(b.dialogueRatio * 100)}%</span><span class="prose-stat-lab">Dialogue</span></div>
    <div class="prose-stat"><span class="prose-stat-num">${b.meanSentenceWords}</span><span class="prose-stat-lab">Avg sentence</span></div>
  </div>
  <table class="prose-table">
    <thead><tr>
      <th>Chapter</th><th>Length</th><th>Dialogue</th><th>Sentence</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`;
}
