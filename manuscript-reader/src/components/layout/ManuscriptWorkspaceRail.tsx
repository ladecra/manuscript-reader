import {
  PencilIcon,
  ReportIcon,
  BookIcon,
  ExportTrayIcon,
  ChevronRightIcon,
  CheckIcon,
  LayersIcon,
} from '../ui/Icons';
import { ANNOTATION_LABELS, ANNOTATION_COLORS } from '../../engine/types';

export type HubPane = 'contents' | 'details' | 'feedback' | 'report' | 'exports' | 'share' | 'versions';

type RailTool = {
  id: HubPane;
  label: string;
  sub: string;
  Icon: typeof PencilIcon;
  badge?: number;
};

export type WorkspaceRailContext = 'hub' | 'reader';

export interface RailAnnotation {
  id: string;
  type: string;
  quote: string;
  chapterTitle: string;
}

interface ManuscriptWorkspaceRailProps {
  context: WorkspaceRailContext;
  pane: HubPane;
  annotationCount: number;
  savedLabel: string;
  readerSubtext?: string;
  recentAnnotations?: RailAnnotation[];
  onTogglePane: (id: HubPane) => void;
  onRead?: () => void;
  onManuscript?: () => void;
  onOpenAnnotations?: () => void;
}

// Rail order: Publishing Details · Exports & Sharing · Editorial Report · Annotations.
// (Snapshots is hidden for now — its pane still exists but isn't surfaced.)
const MANUSCRIPT_TOOLS: RailTool[] = [
  { id: 'details', label: 'Publishing Details', sub: 'Genre, synopsis & copyright', Icon: BookIcon },
  { id: 'exports', label: 'Exports & Sharing', sub: 'Files & reader copies', Icon: ExportTrayIcon },
  { id: 'report', label: 'Editorial Report', sub: 'Patterns from reader actions', Icon: ReportIcon },
  { id: 'feedback', label: 'Annotations', sub: 'Notes & marks across the manuscript', Icon: PencilIcon },
];

export function ManuscriptWorkspaceRail({
  context,
  pane,
  annotationCount,
  savedLabel,
  readerSubtext = 'Resume in the reader',
  recentAnnotations,
  onTogglePane,
  onRead,
  onManuscript,
  onOpenAnnotations,
}: ManuscriptWorkspaceRailProps) {
  return (
    <aside className="hub-tools">
      <nav className="hub-tools-nav" aria-label="Manuscript workspace">
        <div className="instrument-group-label hub-tools-eyebrow">Tools</div>
        <div className="instrument-nav hub-tools-group-nav">
          {context === 'hub' && onRead && (
            <button type="button" className="instrument-item instrument-item--tool" onClick={onRead}>
              <span className="instrument-item-icon"><BookIcon size={15} /></span>
              <span className="instrument-item-stack">
                <span className="instrument-item-label">Reader</span>
                <span className="instrument-item-sub">{readerSubtext}</span>
              </span>
              <span className="instrument-item-chevron"><ChevronRightIcon size={10} /></span>
            </button>
          )}
          {context === 'reader' && onManuscript && (
            <button type="button" className="instrument-item instrument-item--tool" onClick={onManuscript}>
              <span className="instrument-item-icon"><LayersIcon size={15} /></span>
              <span className="instrument-item-stack">
                <span className="instrument-item-label">Manuscript</span>
                <span className="instrument-item-sub">Title page &amp; workspace</span>
              </span>
              <span className="instrument-item-chevron"><ChevronRightIcon size={10} /></span>
            </button>
          )}
          {MANUSCRIPT_TOOLS.map(t => {
            const badge = t.id === 'feedback' && annotationCount > 0 ? annotationCount : t.badge;
            return (
              <button
                key={t.id}
                type="button"
                className={`instrument-item instrument-item--tool${pane === t.id ? ' active' : ''}`}
                onClick={() => onTogglePane(t.id)}
              >
                <span className="instrument-item-icon"><t.Icon size={15} /></span>
                <span className="instrument-item-stack">
                  <span className="instrument-item-label">{t.label}</span>
                  <span className="instrument-item-sub">{t.sub}</span>
                </span>
                {badge != null && (
                  <span className="instrument-item-meta hub-tools-badge">{badge}</span>
                )}
                <span className="instrument-item-chevron"><ChevronRightIcon size={10} /></span>
              </button>
            );
          })}
        </div>

        {recentAnnotations && (
          <>
            <section className="hub-rail-section">
              <div className="instrument-group-label hub-rail-section-label">Working Notes</div>
              <p className="hub-rail-note-empty">A private scratchpad for this manuscript lives here.</p>
            </section>

            <section className="hub-rail-section">
              <div className="hub-rail-section-head">
                <div className="instrument-group-label hub-rail-section-label">Recent Activity</div>
                {onOpenAnnotations && recentAnnotations.length > 0 && (
                  <button type="button" className="hub-rail-viewall" onClick={onOpenAnnotations}>View all</button>
                )}
              </div>
              {recentAnnotations.length === 0 ? (
                <p className="hub-rail-note-empty">No annotations yet.</p>
              ) : (
                <ul className="hub-rail-anns">
                  {recentAnnotations.map(a => (
                    <li key={a.id} className="hub-rail-ann">
                      <span
                        className="hub-rail-ann-dot"
                        style={{ background: ANNOTATION_COLORS[a.type as keyof typeof ANNOTATION_COLORS] ?? 'var(--dim)' }}
                        aria-hidden="true"
                      />
                      <span className="hub-rail-ann-body">
                        <span className="hub-rail-ann-quote">
                          {a.quote ? `“${a.quote.slice(0, 72)}”` : (ANNOTATION_LABELS[a.type as keyof typeof ANNOTATION_LABELS] ?? a.type)}
                        </span>
                        {a.chapterTitle && <span className="hub-rail-ann-meta">{a.chapterTitle}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </nav>
      <div className="hub-tools-footer">
        <CheckIcon size={12} className="hub-tools-saved-icon" aria-hidden="true" />
        <span>{savedLabel}</span>
      </div>
    </aside>
  );
}
