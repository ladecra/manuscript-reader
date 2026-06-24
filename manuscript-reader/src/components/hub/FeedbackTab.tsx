import { useMemo, useState } from 'react';
import type { Annotation, AnnotationType } from '../../engine/types';
import {
  ANNOTATION_TYPES,
  ANNOTATION_LABELS,
  ANNOTATION_COLORS,
} from '../../engine/types';
import { useReaderStore } from '../../state/readerStore';
import { useUIStore } from '../../state/uiStore';
import { XIcon } from '../ui/Icons';

type SortMode = 'manuscript' | 'recent' | 'type';

function typeRank(t: AnnotationType): number {
  const i = ANNOTATION_TYPES.indexOf(t);
  return i === -1 ? ANNOTATION_TYPES.length : i;
}

function compareAnnotations(a: Annotation, b: Annotation, mode: SortMode): number {
  if (mode === 'recent') return b.createdAt - a.createdAt;
  if (mode === 'type') {
    const byType = typeRank(a.type) - typeRank(b.type);
    if (byType !== 0) return byType;
  }
  const byChapter = a.chapterIndex - b.chapterIndex;
  if (byChapter !== 0) return byChapter;
  return a.createdAt - b.createdAt;
}

function allTypesEnabled(): Record<AnnotationType, boolean> {
  return Object.fromEntries(ANNOTATION_TYPES.map(t => [t, true])) as Record<AnnotationType, boolean>;
}

export function FeedbackTab({
  annotations,
  readerCount,
  onRead,
}: {
  annotations: Annotation[];
  readerCount: number;
  onRead: () => void;
}) {
  const { patchAnnotation, deleteAnnotation } = useReaderStore();
  const { setPendingChapterIndex, setPendingAnnotationId } = useUIStore();

  const [sort, setSort] = useState<SortMode>('manuscript');
  const [typeEnabled, setTypeEnabled] = useState(allTypesEnabled);
  const [hideAddressed, setHideAddressed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');

  const visible = useMemo(() => {
    let list = annotations.filter(a => typeEnabled[a.type] !== false);
    if (hideAddressed) list = list.filter(a => a.status !== 'resolved');
    return [...list].sort((a, b) => compareAnnotations(a, b, sort));
  }, [annotations, typeEnabled, hideAddressed, sort]);

  const typeCounts = useMemo(() => {
    const m = Object.fromEntries(ANNOTATION_TYPES.map(t => [t, 0])) as Record<AnnotationType, number>;
    for (const a of annotations) m[a.type] += 1;
    return m;
  }, [annotations]);

  const goToPassage = (ann: Annotation) => {
    setPendingChapterIndex(ann.chapterIndex);
    setPendingAnnotationId(ann.id);
    onRead();
  };

  const startEdit = (ann: Annotation) => {
    setEditingId(ann.id);
    setDraftNote(ann.note);
  };

  const saveEdit = (id: string) => {
    patchAnnotation(id, { note: draftNote.trim() });
    setEditingId(null);
    setDraftNote('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftNote('');
  };

  const toggleAddressed = (ann: Annotation) => {
    const resolved = ann.status === 'resolved';
    patchAnnotation(ann.id, { status: resolved ? undefined : 'resolved' });
  };

  const toggleType = (t: AnnotationType) => {
    setTypeEnabled(prev => ({ ...prev, [t]: !prev[t] }));
  };

  return (
    <div className="hub-panel">
      <div className="hub-overview-head">
        <h2 className="hub-panel-title">Feedback</h2>
        <button type="button" className="btn-outline" style={{ fontSize: '12px' }} onClick={onRead}>
          Annotate in reader →
        </button>
      </div>
      <div className="hub-stats">
        <div className="lib-stat">
          <span className="lib-stat-num">{annotations.length}</span>
          <span className="lib-stat-label">Annotations</span>
        </div>
        <div className="lib-stat">
          <span className="lib-stat-num">{readerCount}</span>
          <span className="lib-stat-label">Readers</span>
        </div>
      </div>

      {annotations.length === 0 ? (
        <div className="hub-empty">
          <p>No annotations yet.</p>
          <p className="hub-empty-sub">
            Open the reader to annotate, or import a beta reader&apos;s feedback file from the reader&apos;s
            annotations panel.
          </p>
        </div>
      ) : (
        <>
          <div className="hub-feedback-toolbar">
            <label className="hub-feedback-sort-label">
              Sort
              <select
                className="library-sort-select hub-feedback-sort"
                value={sort}
                onChange={e => setSort(e.target.value as SortMode)}
                aria-label="Sort annotations"
              >
                <option value="manuscript">Manuscript order</option>
                <option value="recent">Most recent</option>
                <option value="type">Type</option>
              </select>
            </label>
            <label className="hub-feedback-check">
              <input
                type="checkbox"
                checked={hideAddressed}
                onChange={e => setHideAddressed(e.target.checked)}
              />
              Hide addressed
            </label>
          </div>

          <fieldset className="hub-feedback-types">
            <legend className="hub-feedback-types-legend">Show types</legend>
            <div className="hub-feedback-type-grid">
              {ANNOTATION_TYPES.map(t => (
                <label key={t} className="hub-feedback-type-check">
                  <input
                    type="checkbox"
                    checked={typeEnabled[t] !== false}
                    onChange={() => toggleType(t)}
                  />
                  <span
                    className="hub-feedback-type-dot"
                    style={{ background: ANNOTATION_COLORS[t] }}
                    aria-hidden="true"
                  />
                  {ANNOTATION_LABELS[t]}
                  {typeCounts[t] > 0 && (
                    <span className="hub-feedback-type-count">{typeCounts[t]}</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>

          {visible.length === 0 ? (
            <div className="hub-empty hub-empty--compact">
              <p>No annotations match these filters.</p>
            </div>
          ) : (
            <div className="hub-ann-list">
              {visible.map(a => {
                const resolved = a.status === 'resolved';
                const editing = editingId === a.id;
                return (
                  <article
                    key={a.id}
                    className={`hub-ann${resolved ? ' hub-ann--resolved' : ''}${a.imported ? ' hub-ann--imported' : ''}`}
                  >
                    <span
                      className="hub-ann-dot"
                      style={{ background: ANNOTATION_COLORS[a.type] ?? 'var(--dim)' }}
                      aria-hidden="true"
                    />
                    <div className="hub-ann-body">
                      <div className="hub-ann-head">
                        <div className="hub-ann-meta">
                          {ANNOTATION_LABELS[a.type]}
                          {a.chapterTitle ? ` · ${a.chapterTitle}` : ''}
                          {a.readerName ? ` · ${a.readerName}` : ''}
                        </div>
                        <label className="hub-ann-addressed">
                          <input
                            type="checkbox"
                            checked={resolved}
                            onChange={() => toggleAddressed(a)}
                          />
                          Addressed
                        </label>
                      </div>

                      {a.quote && (
                        <button
                          type="button"
                          className="hub-ann-quote hub-ann-quote--link"
                          onClick={() => goToPassage(a)}
                        >
                          &ldquo;{a.quote.length > 200 ? `${a.quote.slice(0, 200)}…` : a.quote}&rdquo;
                          <span className="hub-ann-goto">Go to passage</span>
                        </button>
                      )}

                      {!a.quote && (
                        <button type="button" className="hub-ann-goto-only" onClick={() => goToPassage(a)}>
                          Go to passage
                        </button>
                      )}

                      {editing ? (
                        <div className="hub-ann-edit">
                          <textarea
                            className="hub-ann-edit-input"
                            value={draftNote}
                            onChange={e => setDraftNote(e.target.value)}
                            rows={3}
                            placeholder="Note (optional)"
                            autoFocus
                          />
                          <div className="hub-ann-edit-actions">
                            <button type="button" className="btn-ghost hub-ann-btn" onClick={cancelEdit}>
                              Cancel
                            </button>
                            <button type="button" className="btn-outline hub-ann-btn" onClick={() => saveEdit(a.id)}>
                              Save note
                            </button>
                          </div>
                        </div>
                      ) : (
                        a.note && <div className="hub-ann-note">{a.note}</div>
                      )}

                      <div className="hub-ann-actions">
                        {!editing && (
                          <button type="button" className="hub-ann-action" onClick={() => startEdit(a)}>
                            {a.note ? 'Edit note' : 'Add note'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="hub-ann-action hub-ann-action--danger"
                          onClick={() => deleteAnnotation(a.id)}
                          aria-label="Delete annotation"
                        >
                          <XIcon size={12} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
