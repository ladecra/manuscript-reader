import { QuillIcon, LibraryIcon, PanelIcon, ChevronLeftIcon } from '../ui/Icons';
import { SettingsMenu } from '../ui/SettingsMenu';

interface ReaderRailProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Vellibris home — back out to the marketing landing. */
  onHome: () => void;
  /** Library — all manuscripts. */
  onLibrary: () => void;
  /** Manuscript page — this manuscript's hub (reuses the old tools-rail icon). */
  onManuscriptPage: () => void;
}

/** The reader's left rail. A differently-styled sibling of the library/hub
 *  AppShell rail: collapsed by default, no Recent Files, and the background
 *  matches the reader topbar so the two read as one chrome surface. It carries
 *  the three cross-app links (home / library / Details) and the settings
 *  gear. */
export function ReaderRail({
  collapsed,
  onToggleCollapsed,
  onHome,
  onLibrary,
  onManuscriptPage,
}: ReaderRailProps) {
  return (
    <aside
      className={`app-shell-rail reader-rail${collapsed ? ' reader-rail--collapsed' : ''}`}
      aria-label="Reader navigation"
    >
      <nav className="app-shell-nav reader-rail-nav" aria-label="Navigate">
        <button type="button" className="app-shell-item" onClick={onHome} title="Vellibris — home">
          <span className="app-shell-item-icon"><QuillIcon size={16} /></span>
          {!collapsed && <span className="app-shell-item-label">Home</span>}
        </button>
        <button type="button" className="app-shell-item" onClick={onLibrary} title="Library">
          <span className="app-shell-item-icon"><LibraryIcon size={15} /></span>
          {!collapsed && <span className="app-shell-item-label">Library</span>}
        </button>
        <button type="button" className="app-shell-item" onClick={onManuscriptPage} title="Details">
          <span className="app-shell-item-icon"><PanelIcon size={15} /></span>
          {!collapsed && <span className="app-shell-item-label">Details</span>}
        </button>
      </nav>

      <div className="app-shell-footer">
        <div className="reader-rail-settings">
          <SettingsMenu variant="rail-item" />
        </div>
        <div className="reader-rail-sep" aria-hidden="true" />
        <button
          type="button"
          className="btn-icon app-shell-collapse-btn"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapsed}
        >
          <ChevronLeftIcon size={12} className={collapsed ? 'app-shell-collapse-flip' : undefined} />
        </button>
      </div>
    </aside>
  );
}
