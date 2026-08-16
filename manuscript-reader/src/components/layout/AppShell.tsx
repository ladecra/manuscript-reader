import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeftIcon, LibraryIcon, StarIcon, PlusIcon, ClockIcon } from '../ui/Icons';
import { SettingsMenu } from '../ui/SettingsMenu';

export type LibraryNavFilter = 'all' | 'recent' | 'favorites';

export interface WorkspaceManuscriptRow {
  id: string;
  title: string;
}

interface AppShellProps {
  children: ReactNode;
  /** library | manuscript | reader — library nav highlights only on the library
   *  screen; a non-'library' variant cleanly de-highlights the filters. */
  variant: 'library' | 'manuscript' | 'reader';
  libraryFilter: LibraryNavFilter;
  onLibraryFilter: (f: LibraryNavFilter) => void;
  manuscriptCount: number;
  favoritesCount: number;
  activeManuscriptId?: string;
  workspaceManuscripts?: WorkspaceManuscriptRow[];
  onSwitchManuscript?: (id: string) => void;
  onNewManuscript?: () => void;
  continueTitle?: string;
  onContinue?: () => void;
  /** Wordmark is the "home" affordance — back out to the marketing landing. */
  onHome?: () => void;
  /** When the global topbar is hidden (library), the rail carries the wordmark
   *  and the shell fills from the top of the viewport. */
  bareTop?: boolean;
}

/** Local-first storage meter — the honest footer signal (no accounts to show). */
function StorageMeter({ collapsed }: { collapsed: boolean }) {
  const [used, setUsed] = useState<{ label: string; pct: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
    navigator.storage.estimate().then(({ usage = 0, quota = 0 }) => {
      if (cancelled) return;
      const gb = usage / 1e9;
      const label = gb >= 0.1 ? `${gb.toFixed(1)} GB on this device` : `${Math.round(usage / 1e6)} MB on this device`;
      const pct = quota > 0 ? Math.min(100, Math.max(2, (usage / quota) * 100)) : 4;
      setUsed({ label, pct });
    }).catch(() => { /* estimate unsupported — meter simply doesn't render */ });
    return () => { cancelled = true; };
  }, []);

  if (!used || collapsed) return null;
  return (
    <div className="app-shell-storage">
      <div className="app-shell-storage-label">
        <span>Storage</span><span className="tnum">{used.label}</span>
      </div>
      <div className="app-shell-storage-bar"><i style={{ width: `${used.pct}%` }} /></div>
    </div>
  );
}

export function AppShell({
  children,
  variant,
  libraryFilter,
  onLibraryFilter,
  activeManuscriptId,
  workspaceManuscripts = [],
  onSwitchManuscript,
  onNewManuscript,
  onHome,
  continueTitle,
  onContinue,
  bareTop = false,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  const railItem = (filter: LibraryNavFilter, icon: ReactNode, label: string) => (
    <button
      type="button"
      className={`app-shell-item${libraryFilter === filter && variant === 'library' ? ' active' : ''}`}
      onClick={() => onLibraryFilter(filter)}
      title={label}
    >
      <span className="app-shell-item-icon">{icon}</span>
      {!collapsed && <span className="app-shell-item-label">{label}</span>}
    </button>
  );

  return (
    <div className={`app-shell${collapsed ? ' app-shell--collapsed' : ''}${bareTop ? ' app-shell--bare' : ''}`}>
      <aside className="app-shell-rail" aria-label="Application">
        {bareTop && (
          <button
            type="button"
            className="app-shell-brand"
            onClick={onHome}
            title="Home"
            aria-label="Vellibris — home"
          >
            <span className="app-shell-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 5.5A2 2 0 0 1 6 4h5v15H6a2 2 0 0 0-2 1.5z" />
                <path d="M20 5.5A2 2 0 0 0 18 4h-5v15h5a2 2 0 0 1 2 1.5z" />
              </svg>
            </span>
            {!collapsed && (
              <span className="app-shell-brand-text">
                <span className="app-shell-brand-word">Vellibris</span>
              </span>
            )}
          </button>
        )}
        <div className="app-shell-scroll">
          <nav className="app-shell-nav" aria-label="Library">
            {onContinue && continueTitle && (
              <button
                type="button"
                className="app-shell-item app-shell-item--continue"
                onClick={onContinue}
                title={continueTitle}
              >
                <span className="app-shell-item-icon"><ClockIcon size={15} /></span>
                {!collapsed && <span className="app-shell-item-label">Continue</span>}
              </button>
            )}
            {railItem('recent', <ClockIcon size={15} />, 'Recent')}
            {railItem('all', <LibraryIcon size={15} />, 'Library')}
            {railItem('favorites', <StarIcon size={14} />, 'Favorites')}
            {workspaceManuscripts.length > 0 && !collapsed && (
              <div className="app-shell-works" aria-label="Works">
                <div className="app-shell-works-label">Works</div>
                <div className="app-shell-works-list">
                  {workspaceManuscripts.map(row => (
                    <button
                      key={row.id}
                      type="button"
                      className={`app-shell-work${row.id === activeManuscriptId ? ' active' : ''}`}
                      onClick={() => onSwitchManuscript?.(row.id)}
                      title={row.title}
                    >
                      {row.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <SettingsMenu variant="rail-item" />
          </nav>
        </div>

        <div className="app-shell-footer">
          <StorageMeter collapsed={collapsed} />
          <button
            type="button"
            className="btn-icon app-shell-collapse-btn"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(c => !c)}
          >
            <ChevronLeftIcon size={12} className={collapsed ? 'app-shell-collapse-flip' : undefined} />
          </button>
        </div>
      </aside>
      <div className="app-shell-body">{children}</div>

      {/* Mobile bottom nav — mirrors the rail's destinations (the rail is hidden
          on phones). Desktop hides this via CSS. */}
      <nav className="app-mobilenav" aria-label="Primary">
        <button
          type="button"
          className={`app-mobilenav-item${variant === 'library' && libraryFilter === 'all' ? ' active' : ''}`}
          onClick={() => onLibraryFilter('all')}
        >
          <LibraryIcon size={21} /><span className="app-mobilenav-label">Library</span>
        </button>
        <button
          type="button"
          className={`app-mobilenav-item${variant === 'library' && libraryFilter === 'favorites' ? ' active' : ''}`}
          onClick={() => onLibraryFilter('favorites')}
        >
          <StarIcon size={20} /><span className="app-mobilenav-label">Favorites</span>
        </button>
        <button
          type="button"
          className={`app-mobilenav-item${variant === 'library' && libraryFilter === 'recent' ? ' active' : ''}`}
          onClick={() => onLibraryFilter('recent')}
        >
          <ClockIcon size={21} /><span className="app-mobilenav-label">Recent</span>
        </button>
        <SettingsMenu variant="mobilenav-item" />
      </nav>

      {/* Primary create action on the library — the mockup's floating "＋ New". */}
      {variant === 'library' && onNewManuscript && (
        <button type="button" className="app-fab" onClick={onNewManuscript} aria-label="New manuscript">
          <PlusIcon size={18} /> New
        </button>
      )}
    </div>
  );
}
