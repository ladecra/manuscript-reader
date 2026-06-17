import {
  PencilIcon,
  ReportIcon,
  BookIcon,
  ExportTrayIcon,
  ShareIcon,
  ChevronRightIcon,
  CheckIcon,
  LayersIcon,
} from '../ui/Icons';

export type HubPane = 'contents' | 'details' | 'feedback' | 'report' | 'exports' | 'share' | 'versions';

type RailTool = {
  id: HubPane;
  label: string;
  sub: string;
  Icon: typeof PencilIcon;
  badge?: number;
};

type ToolGroup = {
  sectionLabel: string;
  tools: RailTool[];
};

export type WorkspaceRailContext = 'hub' | 'reader';

interface ManuscriptWorkspaceRailProps {
  context: WorkspaceRailContext;
  pane: HubPane;
  annotationCount: number;
  savedLabel: string;
  readerSubtext?: string;
  onTogglePane: (id: HubPane) => void;
  onRead?: () => void;
  onManuscript?: () => void;
}

export function ManuscriptWorkspaceRail({
  context,
  pane,
  annotationCount,
  savedLabel,
  readerSubtext = 'Resume in the reader',
  onTogglePane,
  onRead,
  onManuscript,
}: ManuscriptWorkspaceRailProps) {
  const groups: ToolGroup[] = [
    {
      sectionLabel: 'Revision Tools',
      tools: [
        {
          id: 'feedback',
          label: 'Annotations',
          sub: 'Reader notes anchored to the text',
          Icon: PencilIcon,
          badge: annotationCount > 0 ? annotationCount : undefined,
        },
        {
          id: 'report',
          label: 'Report',
          sub: 'Manuscript intelligence from reader actions',
          Icon: ReportIcon,
        },
      ],
    },
    {
      sectionLabel: 'Manuscript',
      tools: [
        {
          id: 'details',
          label: 'Publishing details',
          sub: 'Title page, copyright, and metadata',
          Icon: BookIcon,
        },
      ],
    },
    {
      sectionLabel: 'Output',
      tools: [
        {
          id: 'exports',
          label: 'Exports',
          sub: 'Word, Markdown, and reports',
          Icon: ExportTrayIcon,
        },
        {
          id: 'share',
          label: 'Share',
          sub: 'Reader file for beta readers',
          Icon: ShareIcon,
        },
      ],
    },
  ];

  return (
    <aside className="hub-tools">
      <nav className="hub-tools-nav" aria-label="Manuscript workspace">
        {groups.map((group, groupIndex) => (
          <div key={group.sectionLabel} className="hub-tools-group">
            <div
              className={`instrument-group-label hub-tools-group-label${groupIndex === 0 ? ' hub-tools-group-label--first' : ''}`}
            >
              {group.sectionLabel}
            </div>
            <div className="instrument-nav hub-tools-group-nav">
              {groupIndex === 0 && context === 'hub' && onRead && (
                <button type="button" className="instrument-item instrument-item--tool" onClick={onRead}>
                  <span className="instrument-item-icon"><BookIcon size={15} /></span>
                  <span className="instrument-item-stack">
                    <span className="instrument-item-label">Reader</span>
                    <span className="instrument-item-sub">{readerSubtext}</span>
                  </span>
                  <span className="instrument-item-chevron"><ChevronRightIcon size={10} /></span>
                </button>
              )}
              {groupIndex === 0 && context === 'reader' && onManuscript && (
                <button type="button" className="instrument-item instrument-item--tool" onClick={onManuscript}>
                  <span className="instrument-item-icon"><LayersIcon size={15} /></span>
                  <span className="instrument-item-stack">
                    <span className="instrument-item-label">Manuscript</span>
                    <span className="instrument-item-sub">Title page &amp; workspace</span>
                  </span>
                  <span className="instrument-item-chevron"><ChevronRightIcon size={10} /></span>
                </button>
              )}
              {group.tools.map(t => (
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
                  {t.badge != null && (
                    <span className="instrument-item-meta hub-tools-badge">{t.badge}</span>
                  )}
                  <span className="instrument-item-chevron"><ChevronRightIcon size={10} /></span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="hub-tools-footer">
        <CheckIcon size={12} className="hub-tools-saved-icon" aria-hidden="true" />
        <span>{savedLabel}</span>
      </div>
      <div className="hub-notes-placeholder" aria-hidden="true" />
    </aside>
  );
}
