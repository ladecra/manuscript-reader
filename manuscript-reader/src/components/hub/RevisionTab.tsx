import { useMemo, useState } from 'react';
import type { Annotation, ConcernSuggestion, Edit, RevisionConcern } from '../../engine/types';
import { ANNOTATION_LABELS, isAuthorAnnotation } from '../../engine/types';
import { bareFlagTerm, suggestConcernGroups } from '../../engine/concerns/suggestGroups';
import { sweepTerm } from '../../engine/concerns/termSweep';
import { computeConcernAnalytics } from '../../engine/concerns/concernAnalytics';
import { exportRevisionContext } from '../../engine/exports/revisionContext';
import { useConcernStore } from '../../state/concernStore';
import { showToast } from '../ui/Toast';
import { CheckIcon, ChevronDownIcon, DownloadIcon, PlusIcon, XIcon } from '../ui/Icons';

// Revision Threads: ratify, don't file. The author annotates freely in the
// reader; this pane is the review-time surface where the engine PROPOSES
// groupings (shared terms, shared entities, bare word-flags → manuscript-wide
// sweeps) and the author answers with one tap. Nothing is ever auto-filed, and
// every layer degrades gracefully — no marks, no suggestions, no threads, and
// the pane (and the REVISION_CONTEXT.md export) still stand on their own.

const chapterLabel = (a: { chapterIndex: number; chapterTitle: string }) =>
  a.chapterIndex > 0 ? `Ch. ${String(a.chapterIndex).padStart(2, '0')}` : 'Opening';

const excerpt = (text: string, max = 140) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

export function RevisionTab({
  manuscriptTitle,
  authorName,
  annotations,
  edits,
  combinedMarkdown,
  onJump,
}: {
  manuscriptTitle: string;
  authorName?: string;
  annotations: Annotation[];
  edits: Edit[];
  combinedMarkdown?: string;
  onJump: (chapterIndex: number, opts?: { annotationId?: string; annotate?: boolean }) => void;
}) {
  const {
    manuscriptId, graph, hydrated,
    ratify, dismissSuggestion, create, rename, setStatus, remove, unlink, setMarkStatus,
  } = useConcernStore();

  const suggestions = useMemo(
    () => hydrated ? suggestConcernGroups(annotations, graph) : [],
    [hydrated, annotations, graph],
  );
  const analytics = useMemo(
    () => new Map(computeConcernAnalytics(graph, annotations, combinedMarkdown).map(a => [a.concernId, a])),
    [graph, annotations, combinedMarkdown],
  );
  const annById = useMemo(() => new Map(annotations.map(a => [a.id, a])), [annotations]);
  const authorMarkCount = useMemo(() => annotations.filter(isAuthorAnnotation).length, [annotations]);

  const visible = graph.concerns.filter(c => c.status !== 'archived');
  const archivedCount = graph.concerns.length - visible.length;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const handleExportContext = () => {
    exportRevisionContext(
      { title: manuscriptTitle, author: authorName, annotations, edits, graph, combinedMarkdown },
      manuscriptId ?? 'manuscript',
    );
    showToast('REVISION_CONTEXT.md exported.');
  };

  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    create({ title, kind: 'group' }, annotations);
    setNewTitle('');
  };

  return (
    <div className="hub-panel">
      <div className="hub-overview-head">
        <h2 className="hub-panel-title">Revision Threads</h2>
        <button type="button" className="btn-cta-gold" onClick={handleExportContext} disabled={!manuscriptId}>
          <DownloadIcon size={13} /> Revision context (.md)
        </button>
      </div>
      <p className="hub-panel-lead">
        Themes across your own marks. Annotate freely in the reader — when several notes share a
        thread, it's proposed here for a one-tap yes or no. The export is a single briefing file
        (goals, threads, marks, changes) for any drafting environment or AI review, threads or not.
      </p>

      {suggestions.length > 0 && (
        <section className="hub-export-section">
          <div className="hub-export-section-label">Suggested threads</div>
          <div className="hub-suggest-list">
            {suggestions.map(s => (
              <SuggestionCard
                key={s.signature}
                suggestion={s}
                annById={annById}
                onRatify={title => {
                  ratify(s, annotations, title);
                  showToast(s.addToConcernId
                    ? `Added to “${s.suggestedTitle}”.`
                    : `Thread “${title ?? s.suggestedTitle}” created.`);
                }}
                onDismiss={() => dismissSuggestion(s.signature)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="hub-export-section">
        <div className="hub-export-section-label">Threads</div>
        {visible.length === 0 ? (
          <div className="hub-empty">
            <p>No revision threads yet.</p>
            <p className="hub-empty-sub">
              {authorMarkCount === 0
                ? 'Marks you make in the reader feed this pane — highlight a recurring word, or write notes as they come; related ones are suggested as threads here.'
                : suggestions.length === 0
                  ? 'Your marks stand on their own so far. Start a thread below, or keep annotating — related notes are suggested automatically.'
                  : 'Ratify a suggestion above, or start a thread by hand below.'}
            </p>
          </div>
        ) : (
          <ul className="hub-concerns">
            {visible.map(c => (
              <ConcernRow
                key={c.id}
                concern={c}
                analytics={analytics.get(c.id)}
                links={graph.links.filter(l => l.concernId === c.id)}
                annById={annById}
                combinedMarkdown={combinedMarkdown}
                expanded={expandedId === c.id}
                onToggle={() => setExpandedId(id => (id === c.id ? null : c.id))}
                onRename={title => rename(c.id, title)}
                onSetStatus={status => setStatus(c.id, status)}
                onDelete={() => { if (confirm(`Delete thread “${c.title}”? Marks stay; only the thread is removed.`)) remove(c.id); }}
                onUnlink={annotationId => unlink(c.id, annotationId)}
                onMarkStatus={(annotationId, status) => setMarkStatus(c.id, annotationId, status)}
                onJump={onJump}
              />
            ))}
          </ul>
        )}
        {archivedCount > 0 && (
          <p className="hub-concern-archived-note">{archivedCount} archived thread{archivedCount !== 1 ? 's' : ''} kept in the export.</p>
        )}

        <div className="hub-concern-new">
          <input
            className="hub-concern-new-input"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="Start a thread by hand — a character, a pattern, a question…"
            aria-label="New thread title"
          />
          <button type="button" className="btn-ghost" onClick={handleCreate} disabled={!newTitle.trim()}>
            <PlusIcon size={12} /> New thread
          </button>
        </div>
      </section>
    </div>
  );
}

/** Manuscript-wide occurrence chips for a bare word-flag inside a thread: the
 *  flagged word is an INSTANCE of an issue, so its extent is computed from the
 *  live text on demand — one chip per chapter, jump on tap. Renders nothing for
 *  ordinary marks (noted, or longer than the flag gesture). */
function MarkOccurrences({ ann, combinedMarkdown, onJump }: {
  ann: Annotation;
  combinedMarkdown?: string;
  onJump: (chapterIndex: number, opts?: { annotationId?: string; annotate?: boolean }) => void;
}) {
  const term = !ann.note?.trim() ? bareFlagTerm(ann.quote) : null;
  const sweep = useMemo(
    () => (term && combinedMarkdown ? sweepTerm(combinedMarkdown, term) : null),
    [term, combinedMarkdown],
  );
  if (!sweep || sweep.total === 0) return null;
  return (
    <div className="hub-concern-sweep hub-concern-sweep--mark">
      <span className="hub-concern-sweep-lead">{sweep.total} occurrence{sweep.total !== 1 ? 's' : ''}:</span>
      {sweep.chapters.map(ch => (
        <button
          key={ch.chapterIndex}
          type="button"
          className="hub-concern-sweep-chip"
          onClick={() => onJump(ch.chapterIndex)}
          title={ch.snippets[0] ?? undefined}
        >
          {`Ch. ${String(ch.chapterIndex).padStart(2, '0')}`} ×{ch.count}
        </button>
      ))}
    </div>
  );
}

function SuggestionCard({ suggestion, annById, onRatify, onDismiss }: {
  suggestion: ConcernSuggestion;
  annById: Map<string, Annotation>;
  onRatify: (title?: string) => void;
  onDismiss: () => void;
}) {
  const members = suggestion.annotationIds
    .map(id => annById.get(id))
    .filter((a): a is Annotation => !!a);
  const isAddition = !!suggestion.addToConcernId;
  return (
    <div className="hub-suggest">
      <div className="hub-suggest-body">
        <div className="hub-suggest-title">{suggestion.suggestedTitle}</div>
        <div className="hub-suggest-basis">{suggestion.basis}</div>
        {members.length > 0 && (
          <div className="hub-suggest-preview">
            {members.slice(0, 3).map(a => (
              <span key={a.id} className="hub-suggest-quote">“{excerpt(a.quote, 48)}”</span>
            ))}
            {members.length > 3 && <span className="hub-suggest-quote hub-suggest-quote--more">+{members.length - 3} more</span>}
          </div>
        )}
      </div>
      <div className="hub-suggest-actions">
        <button type="button" className="btn-cta-gold hub-suggest-ratify" onClick={() => onRatify()}>
          <CheckIcon size={12} /> {isAddition ? 'Add to thread' : 'Create thread'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

function ConcernRow({
  concern, analytics, links, annById, combinedMarkdown, expanded,
  onToggle, onRename, onSetStatus, onDelete, onUnlink, onMarkStatus, onJump,
}: {
  concern: RevisionConcern;
  analytics?: import('../../engine/types').ConcernAnalytics;
  links: { annotationId: string; status?: 'open' | 'resolved' }[];
  annById: Map<string, Annotation>;
  combinedMarkdown?: string;
  expanded: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onSetStatus: (status: 'active' | 'resolved' | 'archived') => void;
  onDelete: () => void;
  onUnlink: (annotationId: string) => void;
  onMarkStatus: (annotationId: string, status: 'open' | 'resolved') => void;
  onJump: (chapterIndex: number, opts?: { annotationId?: string; annotate?: boolean }) => void;
}) {
  const [title, setTitle] = useState(concern.title);
  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== concern.title) onRename(next);
    else setTitle(concern.title);
  };
  const facts: string[] = [];
  if (analytics) {
    if (analytics.linkedCount > 0) facts.push(`${analytics.openCount} open · ${analytics.resolvedCount} resolved`);
    if (analytics.sweep) facts.push(`${analytics.sweep.total} occurrence${analytics.sweep.total !== 1 ? 's' : ''}`);
    if (analytics.chaptersAffected.length) facts.push(`ch. ${analytics.chaptersAffected.join(', ')}`);
    if (analytics.ageDays > 0) facts.push(`${analytics.ageDays}d old`);
  }
  const resolved = concern.status === 'resolved';

  return (
    <li className={`hub-concern${resolved ? ' hub-concern--resolved' : ''}`}>
      <div className="hub-concern-head">
        <button type="button" className="hub-concern-toggle" onClick={onToggle} aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} thread ${concern.title}`}>
          <ChevronDownIcon size={12} className={expanded ? 'hub-concern-chev hub-concern-chev--open' : 'hub-concern-chev'} />
        </button>
        <div className="hub-concern-body">
          <input
            className="hub-concern-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTitle(concern.title); }}
            aria-label={`Thread title: ${concern.title}`}
          />
          {facts.length > 0 && <div className="hub-concern-meta">{facts.join(' · ')}</div>}
        </div>
        <div className="hub-concern-actions">
          <button type="button" className="btn-ghost" onClick={() => onSetStatus(resolved ? 'active' : 'resolved')}>
            {resolved ? 'Reopen' : 'Resolve'}
          </button>
          <button type="button" className="btn-icon hub-concern-del" onClick={onDelete} aria-label={`Delete thread ${concern.title}`}>
            <XIcon size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="hub-concern-detail">
          {analytics?.sweep && (
            <div className="hub-concern-sweep">
              {analytics.sweep.total === 0 ? (
                <span className="hub-concern-sweep-empty">No occurrences of “{analytics.sweep.term}” in the current draft.</span>
              ) : (
                analytics.sweep.chapters.map(ch => (
                  <button
                    key={ch.chapterIndex}
                    type="button"
                    className="hub-concern-sweep-chip"
                    onClick={() => onJump(ch.chapterIndex)}
                    title={ch.snippets[0] ?? undefined}
                  >
                    {`Ch. ${String(ch.chapterIndex).padStart(2, '0')}`} ×{ch.count}
                  </button>
                ))
              )}
            </div>
          )}
          {links.length === 0 && !analytics?.sweep && (
            <p className="hub-empty-sub">No marks in this thread yet — add them from your annotations as they come up.</p>
          )}
          {links.map(l => {
            const ann = annById.get(l.annotationId);
            if (!ann) return null;
            const markResolved = l.status === 'resolved';
            return (
              <div key={l.annotationId} className={`hub-concern-mark${markResolved ? ' hub-concern-mark--resolved' : ''}`}>
                <div className="hub-concern-mark-main">
                  <button
                    type="button"
                    className="hub-concern-mark-body"
                    onClick={() => onJump(ann.chapterIndex, { annotationId: ann.id, annotate: true })}
                    title="Open in the reader"
                  >
                    <span className="hub-concern-mark-head">
                      {ANNOTATION_LABELS[ann.type]} · {chapterLabel(ann)}
                    </span>
                    {ann.quote && <span className="hub-concern-mark-quote">“{excerpt(ann.quote, 90)}”</span>}
                    {ann.note?.trim() && <span className="hub-concern-mark-note">{excerpt(ann.note, 160)}</span>}
                  </button>
                  <MarkOccurrences ann={ann} combinedMarkdown={combinedMarkdown} onJump={onJump} />
                </div>
                <div className="hub-concern-mark-actions">
                  <button type="button" className="btn-ghost" onClick={() => onMarkStatus(ann.id, markResolved ? 'open' : 'resolved')}>
                    {markResolved ? 'Reopen' : 'Resolve'}
                  </button>
                  <button type="button" className="btn-icon" onClick={() => onUnlink(ann.id)} aria-label="Remove from thread">
                    <XIcon size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
