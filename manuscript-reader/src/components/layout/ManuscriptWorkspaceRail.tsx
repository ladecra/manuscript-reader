import {
  PencilIcon,
  ReportIcon,
  BookIcon,
  ExportTrayIcon,
  ChevronRightIcon,
  CheckIcon,
  LayersIcon,
} from '../ui/Icons';
export type HubPane = 'contents' | 'details' | 'feedback' | 'report' | 'exports' | 'share' | 'versions' | 'revision';

type RailTool = {
  id: HubPane;
  label: string;
  sub: string;
  Icon: typeof PencilIcon;
  badge?: number;
};

export type WorkspaceRailContext = 'hub' | 'reader';

/** One "pick up where you left off" row. `chapterLabel` null ⇒ nothing yet
 *  (renders the quiet empty state); otherwise the whole row resumes that mode. */
export interface RailWayfindingRow {
  chapterLabel: string | null;
  onResume: () => void;
}

export interface RailWayfinding {
  annotations: RailWayfindingRow;
  changes: RailWayfindingRow;
}

interface ManuscriptWorkspaceRailProps {
  context: WorkspaceRailContext;
  pane: HubPane;
  annotationCount: number;
  versionCount?: number;
  /** Open suggestions + active revision threads (hub badge). */
  revisionCount?: number;
  savedLabel: string;
  readerSubtext?: string;
  wayfinding?: RailWayfinding;
  /** The Working Notes scratchpad — controlled value + change handler (hub owns
   *  persistence). Omitted ⇒ the section shows its quiet placeholder. */
  note?: { value: string; onChange: (v: string) => void };
  className?: string;
  onTogglePane: (id: HubPane) => void;
  onRead?: () => void;
  onManuscript?: () => void;
  onOpenAnnotations?: () => void;
}

// Rail order: Publishing Details · Versions · Exports & Sharing · Editorial Report · Annotations.
const MANUSCRIPT_TOOLS: RailTool[] = [
  { id: 'details', label: 'Publishing Details', sub: 'Genre, synopsis & copyright', Icon: BookIcon },
  { id: 'versions', label: 'Versions', sub: 'Saved drafts of this manuscript', Icon: LayersIcon },
  { id: 'exports', label: 'Exports & Sharing', sub: 'Files & reader copies', Icon: ExportTrayIcon },
  { id: 'report', label: 'Editorial Report', sub: 'Patterns from reader actions', Icon: ReportIcon },
  { id: 'feedback', label: 'Annotations', sub: 'Notes & marks across the manuscript', Icon: PencilIcon },
  { id: 'revision', label: 'Revision Threads', sub: 'Themes across your own marks', Icon: LayersIcon },
];

export function ManuscriptWorkspaceRail({
  context,
  pane,
  annotationCount,
  versionCount = 0,
  revisionCount = 0,
  savedLabel,
  readerSubtext = 'Resume in the reader',
  wayfinding,
  note,
  className,
  onTogglePane,
  onRead,
  onManuscript,
  onOpenAnnotations,
}: ManuscriptWorkspaceRailProps) {
  return (
    <aside className={`hub-tools${className ? ` ${className}` : ''}`}>
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
            const badge = t.id === 'feedback' && annotationCount > 0 ? annotationCount
              : t.id === 'versions' && versionCount > 0 ? versionCount
              : t.id === 'revision' && revisionCount > 0 ? revisionCount
              : t.badge;
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

        {wayfinding && (
          <>
            <section className="hub-rail-section">
              <div className="hub-rail-section-head">
                <div className="instrument-group-label hub-rail-section-label">Pick up where you left off</div>
                {onOpenAnnotations && wayfinding.annotations.chapterLabel && (
                  <button type="button" className="hub-rail-viewall" onClick={onOpenAnnotations}>View all</button>
                )}
              </div>
              <WayfindingItem
                kind="annotations" lead="Annotations recently added"
                empty="No annotations yet" row={wayfinding.annotations}
              />
              <WayfindingItem
                kind="changes" lead="Changes under review"
                empty="No changes to review" row={wayfinding.changes}
              />
            </section>

            {/* Working Notes anchors the bottom and flex-fills the rail — a private,
                open-ended writing space rather than dead air on tall screens. */}
            <section className="hub-rail-section hub-rail-section--notes">
              <div className="instrument-group-label hub-rail-section-label">Working Notes</div>
              {note ? (
                <textarea
                  className="hub-rail-notes-field"
                  value={note.value}
                  onChange={e => note.onChange(e.target.value)}
                  placeholder="A private scratchpad for this manuscript…"
                  spellCheck
                />
              ) : (
                <p className="hub-rail-note-empty">A private scratchpad for this manuscript lives here.</p>
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

// A single wayfinding row: when there's recent work it's a button that resumes
// that mode at its last position; otherwise a quiet empty line. Navigation, not a
// feed — it points the author back to where they were, not at a timeline.
function WayfindingItem({ kind, lead, empty, row }: {
  kind: 'annotations' | 'changes';
  lead: string;
  empty: string;
  row: RailWayfindingRow;
}) {
  const Icon = kind === 'annotations' ? PencilIcon : ReportIcon;
  if (!row.chapterLabel) {
    return <p className="hub-rail-note-empty">{empty}.</p>;
  }
  return (
    <button type="button" className="hub-rail-wayfind" onClick={row.onResume}>
      <span className="hub-rail-wayfind-icon"><Icon size={13} /></span>
      <span className="hub-rail-wayfind-body">
        <span className="hub-rail-wayfind-lead">{lead}</span>
        <span className="hub-rail-wayfind-meta">{row.chapterLabel}</span>
      </span>
      <span className="instrument-item-chevron"><ChevronRightIcon size={10} /></span>
    </button>
  );
}
