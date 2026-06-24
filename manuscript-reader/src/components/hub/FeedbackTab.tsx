import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation, AnnotationType } from '../../engine/types';
import {
  ANNOTATION_TYPES,
  ANNOTATION_LABELS,
  ANNOTATION_COLORS,
} from '../../engine/types';
import { useReaderStore } from '../../state/readerStore';
import { useUIStore } from '../../state/uiStore';
import { ChevronDownIcon, FilterSlidersIcon } from '../ui/Icons';

type SortMode = 'manuscript' | 'recent' | 'type';

const SORT_LABELS: Record<SortMode, string> = {
  manuscript: 'Manuscript order',
  recent: 'Most recent',
  type: 'Type',
};

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

function FilterToggle({
  checked,
  onChange,
  label,
  dotColor,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`hub-filter-toggle${checked ? ' hub-filter-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="hub-filter-toggle-box" aria-hidden="true">
        {checked && <span className="hub-filter-toggle-mark" />}
      </span>
      {dotColor && (
        <span className="hub-filter-toggle-dot" style={{ background: dotColor }} aria-hidden="true" />
      )}
      <span className="hub-filter-toggle-label">{label}</span>
    </button>
  );
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
  const [hideResolved, setHideResolved] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFilterOpen(false);
        setSortOpen(false);
        setRowMenuId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!filterOpen && !sortOpen && !rowMenuId) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (filterOpen && filterRef.current && !filterRef.current.contains(t)) setFilterOpen(false);
      if (sortOpen && sortRef.current && !sortRef.current.contains(t)) setSortOpen(false);
      if (rowMenuId) {
        const el = document.querySelector(`[data-ann-menu="${rowMenuId}"]`);
        if (el && !el.contains(t)) setRowMenuId(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [filterOpen, sortOpen, rowMenuId]);

  const visible = useMemo(() => {
    let list = annotations.filter(a => typeEnabled[a.type] !== false);
    if (hideResolved) list = list.filter(a => a.status !== 'resolved');
    if (hideOpen) list = list.filter(a => a.status === 'resolved');
    return [...list].sort((a, b) => compareAnnotations(a, b, sort));
  }, [annotations, typeEnabled, hideResolved, hideOpen, sort]);

  const goToPassage = (ann: Annotation) => {
    setRowMenuId(null);
    setPendingChapterIndex(ann.chapterIndex);
    setPendingAnnotationId(ann.id);
    onRead();
  };

  const startEdit = (ann: Annotation) => {
    setRowMenuId(null);
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

  const setResolved = (ann: Annotation, resolved: boolean) => {
    patchAnnotation(ann.id, { status: resolved ? 'resolved' : undefined });
  };

  const toggleType = (t: AnnotationType) => {
    setTypeEnabled(prev => ({ ...prev, [t]: !prev[t] }));
  };

  const filterActive = hideResolved || hideOpen || ANNOTATION_TYPES.some(t => !typeEnabled[t]);

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
            <div className="hub-feedback-filter" ref={filterRef}>
              <button
                type="button"
                className={`hub-feedback-filter-btn${filterOpen ? ' hub-feedback-filter-btn--open' : ''}${filterActive ? ' hub-feedback-filter-btn--active' : ''}`}
                aria-expanded={filterOpen}
                aria-haspopup="true"
                onClick={() => { setSortOpen(false); setFilterOpen(o => !o); }}
              >
                <span className="hub-feedback-toolbar-label">Filter</span>
                <FilterSlidersIcon size={15} />
              </button>
              {filterOpen && (
                <div className="hub-feedback-popover" role="dialog" aria-label="Filter annotations">
                  <div className="hub-feedback-popover-section">
                    <div className="hub-feedback-popover-heading">Status</div>
                    <FilterToggle checked={hideOpen} onChange={setHideOpen} label="Hide open" />
                    <FilterToggle checked={hideResolved} onChange={setHideResolved} label="Hide resolved" />
                  </div>
                  <div className="hub-feedback-popover-section">
                    <div className="hub-feedback-popover-heading">Types</div>
                    <div className="hub-feedback-popover-types">
                      {ANNOTATION_TYPES.map(t => (
                        <FilterToggle
                          key={t}
                          checked={typeEnabled[t] !== false}
                          onChange={() => toggleType(t)}
                          label={ANNOTATION_LABELS[t]}
                          dotColor={ANNOTATION_COLORS[t]}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="hub-feedback-sort" ref={sortRef}>
              <button
                type="button"
                className={`hub-feedback-sort-btn${sortOpen ? ' hub-feedback-sort-btn--open' : ''}`}
                aria-expanded={sortOpen}
                aria-haspopup="listbox"
                onClick={() => { setFilterOpen(false); setSortOpen(o => !o); }}
              >
                <span className="hub-feedback-toolbar-label">Sort</span>
                <span className="hub-feedback-sort-value">{SORT_LABELS[sort]}</span>
                <ChevronDownIcon size={10} />
              </button>
              {sortOpen && (
                <ul className="hub-feedback-popover hub-feedback-sort-menu" role="listbox" aria-label="Sort order">
                  {(Object.keys(SORT_LABELS) as SortMode[]).map(mode => (
                    <li key={mode} role="option" aria-selected={sort === mode}>
                      <button
                        type="button"
                        className={`hub-feedback-sort-option${sort === mode ? ' hub-feedback-sort-option--active' : ''}`}
                        onClick={() => { setSort(mode); setSortOpen(false); }}
                      >
                        {SORT_LABELS[mode]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="hub-empty hub-empty--compact">
              <p>No annotations match these filters.</p>
            </div>
          ) : (
            <div className="hub-ann-list">
              {visible.map(a => {
                const resolved = a.status === 'resolved';
                const editing = editingId === a.id;
                const menuOpen = rowMenuId === a.id;
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
                        <div className="hub-ann-meta-line">
                          <span className="hub-ann-meta-text">
                            {ANNOTATION_LABELS[a.type]}
                            {a.chapterTitle ? ` · ${a.chapterTitle}` : ''}
                            {a.readerName ? ` · ${a.readerName}` : ''}
                          </span>
                          <span className="hub-ann-meta-sep" aria-hidden="true"> · </span>
                          <button type="button" className="hub-ann-passage-link" onClick={() => goToPassage(a)}>
                            Go to passage →
                          </button>
                        </div>
                        <div className="hub-ann-edit-wrap" data-ann-menu={a.id}>
                          <button
                            type="button"
                            className={`hub-ann-edit-trigger${menuOpen ? ' hub-ann-edit-trigger--open' : ''}`}
                            aria-expanded={menuOpen}
                            onClick={() => setRowMenuId(menuOpen ? null : a.id)}
                          >
                            Edit
                          </button>
                          {menuOpen && (
                            <div className="hub-ann-edit-menu" role="menu">
                              <button type="button" role="menuitem" className="hub-ann-edit-menu-item" onClick={() => startEdit(a)}>
                                {a.note ? 'Edit note' : 'Add note'}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="hub-ann-edit-menu-item hub-ann-edit-menu-item--danger"
                                onClick={() => { deleteAnnotation(a.id); setRowMenuId(null); }}
                              >
                                Delete
                              </button>
                              <div className="hub-ann-edit-menu-status">
                                <span className="hub-ann-edit-menu-status-label">Status</span>
                                <div className="hub-ann-status-options">
                                  <button
                                    type="button"
                                    className={`hub-ann-status-opt${!resolved ? ' hub-ann-status-opt--selected' : ''}`}
                                    onClick={() => setResolved(a, false)}
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    className={`hub-ann-status-opt hub-ann-status-opt--resolved${resolved ? ' hub-ann-status-opt--selected' : ''}`}
                                    onClick={() => setResolved(a, true)}
                                  >
                                    Resolved
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {a.quote && (
                        <div className="hub-ann-quote">
                          &ldquo;{a.quote.length > 280 ? `${a.quote.slice(0, 280)}…` : a.quote}&rdquo;
                        </div>
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
