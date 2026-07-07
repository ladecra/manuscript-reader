// ─── REVISION_CONTEXT.md — the single-file revision briefing ───────────────────
// One coherent markdown document an author drops into any drafting environment
// or AI tool: goals, revision concerns (with computed sweep densities), every
// author mark, a reader-feedback summary, and recent edits. Deliberately
// narrative — a 5–10 page document outperforms a ZIP of JSON for most model
// workflows.
//
// The document is FIRST-CLASS WITH ZERO CONCERNS: an author who never opens the
// Revision pane still gets their full marks + changes context (grouping
// enriches the file, it never gates it). Everything here is deterministic
// assembly of captured data — no interpretation, no invented narrative.

import type { Annotation, AnnotationType, Edit, RevisionGraph } from '../types';
import { ANNOTATION_LABELS, ANNOTATION_TYPES, isReaderAnnotation } from '../types';
import { emptyRevisionGraph } from '../concerns/revisionGraph';
import { computeConcernAnalytics } from '../concerns/concernAnalytics';
import { resolveAnnotationChapters } from '../annotations/chapterResolve';

export interface RevisionContextInput {
  title: string;
  author?: string;
  combinedMarkdown?: string;
  annotations: Annotation[];
  edits: Edit[];
  graph?: RevisionGraph;
  /** Injectable clock for deterministic harness output. */
  now?: number;
}

const MAX_RECENT_EDITS = 20;
const MAX_EDIT_EXCERPT = 280;

const chapterLabel = (a: { chapterIndex: number; chapterTitle: string }) =>
  a.chapterIndex > 0
    ? `Ch. ${String(a.chapterIndex).padStart(2, '0')}${a.chapterTitle ? ` — ${a.chapterTitle}` : ''}`
    : 'Opening';

const excerpt = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

function markLine(a: Annotation): string {
  const quote = a.quote ? `> “${excerpt(a.quote, 200)}”` : '';
  const note = a.note?.trim() ? `\n> \n> ${a.note.trim().replace(/\n/g, '\n> ')}` : '';
  return `- **${ANNOTATION_LABELS[a.type]} · ${chapterLabel(a)}**\n${quote}${note}`;
}

/** Assemble the full briefing. Pure: no DOM, injectable clock. */
export function buildRevisionContextMarkdown(input: RevisionContextInput): string {
  const now = input.now ?? Date.now();
  const graph = input.graph ?? emptyRevisionGraph();
  const annotations = resolveAnnotationChapters(input.annotations, input.combinedMarkdown);
  const byId = new Map(annotations.map(a => [a.id, a]));
  const authorMarks = annotations.filter(a => !isReaderAnnotation(a));
  const readerMarks = annotations.filter(isReaderAnnotation);
  const date = new Date(now).toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`# Revision Context — ${input.title}`);
  lines.push('');
  if (input.author) lines.push(`*by ${input.author}*`, '');
  lines.push(`*Generated ${date} by Vellibris. Everything below is captured author/reader data —*`);
  lines.push(`*no machine interpretation. “Author marks” are the author's own revision notes;*`);
  lines.push(`*“reader feedback” is beta-reader reaction; “concerns” are revision themes the author*`);
  lines.push(`*ratified. Preserve the author's voice; treat open questions as questions.*`);
  lines.push('');
  lines.push(`**${authorMarks.length}** author mark${authorMarks.length === 1 ? '' : 's'} · ` +
    `**${graph.concerns.length}** revision concern${graph.concerns.length === 1 ? '' : 's'} · ` +
    `**${input.edits.length}** edit${input.edits.length === 1 ? '' : 's'} · ` +
    `**${readerMarks.length}** reader mark${readerMarks.length === 1 ? '' : 's'}`);
  lines.push('', '---', '');

  // ── Revision concerns (only when any exist) ──────────────────────────────────
  if (graph.concerns.length) {
    lines.push('## Revision concerns', '');
    const analytics = new Map(
      computeConcernAnalytics(graph, annotations, input.combinedMarkdown, now).map(a => [a.concernId, a]),
    );
    const active = graph.concerns.filter(c => c.status !== 'archived');
    for (const c of active) {
      const a = analytics.get(c.id);
      const facts: string[] = [];
      if (a) {
        if (a.linkedCount) facts.push(`${a.openCount} open / ${a.resolvedCount} resolved of ${a.linkedCount} marks`);
        if (a.chaptersAffected.length) facts.push(`chapters ${a.chaptersAffected.join(', ')}`);
        facts.push(`${a.ageDays} day${a.ageDays === 1 ? '' : 's'} old`);
      }
      lines.push(`### ${c.title}${c.status === 'resolved' ? ' — resolved' : ''}`);
      lines.push('');
      if (c.summary) lines.push(c.summary, '');
      if (facts.length) lines.push(`*${facts.join(' · ')}*`, '');
      if (a?.sweep) {
        const s = a.sweep;
        lines.push(`Manuscript-wide watch on **“${s.term}”** — ${s.total} occurrence${s.total === 1 ? '' : 's'}: ` +
          s.chapters.map(ch => `ch. ${ch.chapterIndex} ×${ch.count}`).join(', ') + '.');
        lines.push('');
      }
      const members = graph.links
        .filter(l => l.concernId === c.id)
        .map(l => ({ link: l, ann: byId.get(l.annotationId) }))
        .filter((m): m is { link: typeof m.link; ann: Annotation } => !!m.ann);
      for (const { link, ann } of members) {
        lines.push(markLine(ann) + (link.status === 'resolved' ? '\n> *(resolved for this concern)*' : ''));
        lines.push('');
      }
    }
    lines.push('---', '');
  }

  // ── All author marks, by type (always present) ───────────────────────────────
  lines.push('## Author marks', '');
  if (!authorMarks.length) {
    lines.push('*(none yet)*', '');
  } else {
    const byType = new Map<AnnotationType, Annotation[]>();
    for (const a of authorMarks) (byType.get(a.type) ?? byType.set(a.type, []).get(a.type)!).push(a);
    for (const type of ANNOTATION_TYPES) {
      const list = byType.get(type);
      if (!list?.length) continue;
      lines.push(`### ${ANNOTATION_LABELS[type]} (${list.length})`, '');
      for (const a of [...list].sort((x, y) => (x.chapterIndex - y.chapterIndex) || (x.createdAt - y.createdAt))) {
        lines.push(markLine(a), '');
      }
    }
  }
  lines.push('---', '');

  // ── Reader feedback summary (only when readers exist) ────────────────────────
  if (readerMarks.length) {
    lines.push('## Reader feedback (summary)', '');
    const byReader = new Map<string, Annotation[]>();
    for (const a of readerMarks) {
      const k = a.readerName || a.readerId || 'Reader';
      (byReader.get(k) ?? byReader.set(k, []).get(k)!).push(a);
    }
    for (const [name, list] of byReader) {
      const typeCounts = new Map<AnnotationType, number>();
      for (const a of list) typeCounts.set(a.type, (typeCounts.get(a.type) ?? 0) + 1);
      const parts = ANNOTATION_TYPES.filter(t => typeCounts.has(t))
        .map(t => `${typeCounts.get(t)} ${ANNOTATION_LABELS[t].toLowerCase()}`);
      lines.push(`- **${name}** — ${list.length} marks (${parts.join(', ')})`);
    }
    lines.push('', '---', '');
  }

  // ── Recent changes ────────────────────────────────────────────────────────────
  lines.push('## Recent changes', '');
  if (!input.edits.length) {
    lines.push('*(no edits recorded)*', '');
  } else {
    const recent = [...input.edits].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_RECENT_EDITS);
    if (input.edits.length > recent.length) {
      lines.push(`*Most recent ${recent.length} of ${input.edits.length} edits.*`, '');
    }
    for (const e of recent) {
      lines.push(`- **${chapterLabel(e)}**`);
      lines.push(`> Before: ${excerpt(e.originalText, MAX_EDIT_EXCERPT) || '(empty)'}`);
      lines.push(`> After: ${excerpt(e.replacementText, MAX_EDIT_EXCERPT) || '(empty)'}`);
      lines.push('');
    }
  }

  lines.push('---', '');
  lines.push(`*${input.title} — revision context generated by Vellibris*`);
  return lines.join('\n');
}

export function exportRevisionContext(input: RevisionContextInput, manuscriptId: string): void {
  const md = buildRevisionContextMarkdown(input);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `REVISION_CONTEXT-${manuscriptId}-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
