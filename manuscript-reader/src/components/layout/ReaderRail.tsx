import { useEffect, useState } from 'react';
import { QuillIcon, LibraryIcon, PanelIcon, ChevronLeftIcon, ChevronDownIcon } from '../ui/Icons';
import { SettingsMenu } from '../ui/SettingsMenu';
import { AuthPanel } from '../auth/AuthPanel';
import { supabaseConfigured, getSupabaseClient } from '../../engine/storage/supabaseClient';
import { getInitials, getDisplayName } from '../../lib/userDisplay';

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
 *  the three cross-app links (home / library / manuscript page), the settings
 *  gear, and the user chip. */
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
        <button type="button" className="app-shell-item" onClick={onManuscriptPage} title="Manuscript page">
          <span className="app-shell-item-icon"><PanelIcon size={15} /></span>
          {!collapsed && <span className="app-shell-item-label">Manuscript page</span>}
        </button>
      </nav>

      <div className="app-shell-footer">
        <div className="reader-rail-settings">
          <SettingsMenu variant="rail-item" />
        </div>
        <div className="reader-rail-sep" aria-hidden="true" />
        {supabaseConfigured() && <RailUserChip collapsed={collapsed} />}
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

/** The signed-in identity chip — same markup/classes as the AppShell footer
 *  chip, so it inherits the shared rail styling. */
function RailUserChip({ collapsed }: { collapsed: boolean }) {
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

  return (
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
  );
}
