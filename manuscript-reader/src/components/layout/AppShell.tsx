import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronDownIcon, LibraryIcon, StarIcon, PlusIcon, BookIcon, QuillIcon } from '../ui/Icons';
import { SettingsMenu } from '../ui/SettingsMenu';

/** How many manuscripts to surface in the rail's Recent Files shelf. */
const RECENT_FILES_LIMIT = 4;
import { AuthPanel } from '../auth/AuthPanel';
import { supabaseConfigured, getSupabaseClient } from '../../engine/storage/supabaseClient';
import { getInitials, getDisplayName } from '../../lib/userDisplay';

export type LibraryNavFilter = 'all' | 'recent' | 'favorites';

export interface WorkspaceManuscriptRow {
  id: string;
  title: string;
}

interface AppShellProps {
  children: ReactNode;
  /** library | manuscript | reader | publishing — library nav highlights only on
   *  the library screen; a non-'library' variant cleanly de-highlights the filters. */
  variant: 'library' | 'manuscript' | 'reader' | 'publishing';
  /** Opens the Publishing Studio (the production destination — print-ready & query
   *  artifacts). Omitted ⇒ the rail CTA is hidden (e.g. the reader). */
  onPublishingStudio?: () => void;
  /** Highlights the rail CTA while the Studio screen is open. */
  publishingStudioActive?: boolean;
  /** Disables the CTA (e.g. an empty library — nothing to publish yet). */
  studioDisabled?: boolean;
  libraryFilter: LibraryNavFilter;
  onLibraryFilter: (f: LibraryNavFilter) => void;
  manuscriptCount: number;
  favoritesCount: number;
  activeManuscriptId?: string;
  workspaceManuscripts?: WorkspaceManuscriptRow[];
  onSwitchManuscript?: (id: string) => void;
  onNewManuscript?: () => void;
  /** Wordmark is the "home" affordance — back out to the marketing landing. */
  onHome?: () => void;
  /** When the global topbar is hidden (library), the rail carries the wordmark
   *  and the shell fills from the top of the viewport. */
  bareTop?: boolean;
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
  onHome,
  onPublishingStudio,
  publishingStudioActive = false,
  studioDisabled = false,
  bareTop = false,
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

  // The v3 rail is a stable Library + Collections nav on every shell screen
  // (library + hub); the per-manuscript switcher is retired from the rail.
  const showWorkspace = false;

  const workspaceRows = useMemo(() => {
    if (!activeManuscriptId) return workspaceManuscripts;
    const active = workspaceManuscripts.find(m => m.id === activeManuscriptId);
    const rest = workspaceManuscripts.filter(m => m.id !== activeManuscriptId);
    return active ? [active, ...rest] : workspaceManuscripts;
  }, [workspaceManuscripts, activeManuscriptId]);

  // Recent Files shelf — most-recently-opened first (workspaceManuscripts is
  // already sorted by lastOpened upstream), capped at RECENT_FILES_LIMIT.
  const recentFiles = useMemo(
    () => workspaceManuscripts.slice(0, RECENT_FILES_LIMIT),
    [workspaceManuscripts],
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
            <QuillIcon size={16} />
            {!collapsed && (
              <span className="app-shell-brand-text">
                <span className="app-shell-brand-word">Vellibris</span>
                <span className="app-shell-brand-sub">Manuscript Reader</span>
              </span>
            )}
          </button>
        )}
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

          {variant !== 'reader' && recentFiles.length > 0 && (
            <>
              <div className="app-shell-group-label app-shell-group-label--collections">
                {collapsed ? '·' : 'Recent Files'}
              </div>
              <nav className="app-shell-nav" aria-label="Recent files">
                {recentFiles.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className={`app-shell-item app-shell-item--collection${m.id === activeManuscriptId ? ' active' : ''}`}
                    onClick={() => onSwitchManuscript?.(m.id)}
                    title={m.title}
                  >
                    <span className="app-shell-item-icon"><BookIcon size={14} /></span>
                    {!collapsed && <span className="app-shell-item-label">{m.title}</span>}
                  </button>
                ))}
              </nav>
            </>
          )}
        </div>

        {onPublishingStudio && (
          <div className="app-shell-studio">
            <button
              type="button"
              className={`rail-studio-cta${publishingStudioActive ? ' active' : ''}`}
              onClick={onPublishingStudio}
              disabled={studioDisabled}
              title={studioDisabled ? 'Add a manuscript to publish' : 'Publishing Studio — print-ready & query formats'}
              aria-label="Publishing Studio"
            >
              {collapsed
                ? <QuillIcon size={16} />
                : <span className="rail-studio-cta-label">Publishing Studio</span>}
            </button>
            {!collapsed && (
              <span className="rail-studio-cta-sub">Print-ready &amp; query formats</span>
            )}
          </div>
        )}

        <div className="app-shell-footer">
          <SettingsMenu variant="rail-item" />
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
    </div>
  );
}
