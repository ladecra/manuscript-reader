import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronDownIcon, LibraryIcon, StarIcon, ClockIcon, PlusIcon } from '../ui/Icons';
import { AuthPanel } from '../auth/AuthPanel';
import { supabaseConfigured, getSupabaseClient } from '../../engine/storage/supabaseClient';

export type LibraryNavFilter = 'all' | 'recent' | 'favorites';

export interface WorkspaceManuscriptRow {
  id: string;
  title: string;
}

interface AppShellProps {
  children: ReactNode;
  /** library | manuscript | reader — library nav highlights only on library screen. */
  variant: 'library' | 'manuscript' | 'reader';
  libraryFilter: LibraryNavFilter;
  onLibraryFilter: (f: LibraryNavFilter) => void;
  manuscriptCount: number;
  favoritesCount: number;
  activeManuscriptId?: string;
  workspaceManuscripts?: WorkspaceManuscriptRow[];
  onSwitchManuscript?: (id: string) => void;
  onNewManuscript?: () => void;
}

function getInitials(email: string): string {
  const [local] = email.split('@');
  const parts = local.split(/[._+-]/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

function getDisplayName(email: string): string {
  const [local] = email.split('@');
  return local.replace(/[._+-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function AppShell({
  children,
  variant,
  libraryFilter,
  onLibraryFilter,
  manuscriptCount,
  favoritesCount,
  activeManuscriptId,
  workspaceManuscripts = [],
  onSwitchManuscript,
  onNewManuscript,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabaseClient();
    sb.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user.email ?? null);
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const showWorkspace = true;

  const workspaceRows = useMemo(() => {
    if (!activeManuscriptId) return workspaceManuscripts;
    const active = workspaceManuscripts.find(m => m.id === activeManuscriptId);
    const rest = workspaceManuscripts.filter(m => m.id !== activeManuscriptId);
    return active ? [active, ...rest] : workspaceManuscripts;
  }, [workspaceManuscripts, activeManuscriptId]);

  return (
    <div className={`app-shell${collapsed ? ' app-shell--collapsed' : ''}`}>
      <aside className="app-shell-rail" aria-label="Application">
        <div className="app-shell-scroll">
          {showWorkspace && (
            <div className="app-shell-workspace">
              <div className="app-shell-workspace-head">
                <div className="app-shell-group-label">{collapsed ? '·' : 'My Manuscripts'}</div>
                {!collapsed && onNewManuscript && (
                  <button
                    type="button"
                    className="app-shell-add-btn"
                    onClick={onNewManuscript}
                    title="Add manuscript"
                    aria-label="Add manuscript"
                  >
                    <PlusIcon size={12} />
                  </button>
                )}
              </div>
              <nav className="app-shell-nav app-shell-nav--workspace" aria-label="My manuscripts">
                {workspaceRows.map(m => {
                  const isActive = m.id === activeManuscriptId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`app-shell-item app-shell-item--workspace${isActive ? ' active' : ''}`}
                      onClick={() => onSwitchManuscript?.(m.id)}
                      title={m.title}
                    >
                      <span
                        className={`app-shell-workspace-dot${isActive ? ' app-shell-workspace-dot--on' : ''}`}
                        aria-hidden="true"
                      />
                      {!collapsed && (
                        <span className="app-shell-item-label app-shell-item-label--workspace">{m.title}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}

          <div className="app-shell-group-label app-shell-group-label--library">
            {collapsed ? '·' : 'Library'}
          </div>
          <nav className="app-shell-nav" aria-label="Library">
            <button
              type="button"
              className={`app-shell-item${libraryFilter === 'all' && variant === 'library' ? ' active' : ''}`}
              onClick={() => onLibraryFilter('all')}
              title="All manuscripts"
            >
              <span className="app-shell-item-icon"><LibraryIcon size={15} /></span>
              {!collapsed && <span className="app-shell-item-label">All manuscripts</span>}
              {!collapsed && manuscriptCount > 0 && (
                <span className="app-shell-item-meta">{manuscriptCount}</span>
              )}
            </button>
            <button
              type="button"
              className={`app-shell-item${libraryFilter === 'recent' && variant === 'library' ? ' active' : ''}`}
              onClick={() => onLibraryFilter('recent')}
              title="Recent"
            >
              <span className="app-shell-item-icon"><ClockIcon size={14} /></span>
              {!collapsed && <span className="app-shell-item-label">Recent</span>}
            </button>
            <button
              type="button"
              className={`app-shell-item${libraryFilter === 'favorites' && variant === 'library' ? ' active' : ''}`}
              onClick={() => onLibraryFilter('favorites')}
              title="Favorites"
            >
              <span className="app-shell-item-icon"><StarIcon size={14} /></span>
              {!collapsed && <span className="app-shell-item-label">Favorites</span>}
              {!collapsed && favoritesCount > 0 && (
                <span className="app-shell-item-meta">{favoritesCount}</span>
              )}
            </button>
          </nav>
        </div>

        <div className="app-shell-footer">
          {supabaseConfigured() && (
            <div className="app-shell-user-section">
              {authOpen && (
                <div className="app-shell-auth-flyout">
                  <AuthPanel
                    userEmail={userEmail}
                    onSignedOut={() => { setUserEmail(null); setAuthOpen(false); }}
                  />
                </div>
              )}
              <button
                type="button"
                className="app-shell-user-chip"
                onClick={() => setAuthOpen(o => !o)}
                title={userEmail ? `Signed in as ${userEmail}` : 'Sign in to sync'}
                aria-expanded={authOpen}
              >
                <span className="app-shell-user-avatar">
                  {userEmail ? getInitials(userEmail) : '?'}
                </span>
                {!collapsed && (
                  <>
                    <span className="app-shell-user-name">
                      {userEmail ? getDisplayName(userEmail) : 'Sign in'}
                    </span>
                    <ChevronDownIcon
                      size={10}
                      className={authOpen ? 'app-shell-chevron-flip' : undefined}
                    />
                  </>
                )}
              </button>
            </div>
          )}

          <button
            type="button"
            className="app-shell-util-btn"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(c => !c)}
          >
            <ChevronLeftIcon size={12} className={collapsed ? 'app-shell-collapse-flip' : undefined} />
          </button>
        </div>
      </aside>
      <div className="app-shell-body">{children}</div>
    </div>
  );
}
