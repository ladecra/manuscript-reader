import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useUIStore } from '../../state/uiStore';
import { GearIcon } from './Icons';
import { AuthPanel } from '../auth/AuthPanel';
import { supabaseConfigured, getSupabaseClient } from '../../engine/storage/supabaseClient';

interface SettingsMenuProps {
  /** 'icon' — compact gear button (mobile top-right / topbar). 'rail-item' — a
   *  full nav row (gear + "Settings" label) matching the rail's other items, for
   *  the desktop app-shell / reader rails. */
  variant?: 'icon' | 'rail-item';
}

/** Settings popover — theme + text-size controls. On mobile (≤860px) also shows
 *  auth. The popover is position:fixed off the trigger so it never clips inside
 *  the rail's overflow. */
export function SettingsMenu({ variant = 'icon' }: SettingsMenuProps) {
  const { theme, fontSize, toggleTheme, increaseFontSize, decreaseFontSize } = useUIStore();
  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Anchor the fixed popover to the trigger. A rail item opens upward, aligned to
  // the trigger's left edge and extending into the body (clears a narrow rail).
  // The compact icon opens downward, right-aligned under the trigger.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const W = 244;
    if (variant === 'rail-item') {
      setPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
    } else {
      setPos({ left: Math.max(12, r.right - W), top: r.bottom + 8 });
    }
  }, [open, variant]);

  const setTheme = (t: 'light' | 'dark') => { if (theme !== t) toggleTheme(); };

  return (
    <>
      {variant === 'rail-item' ? (
        <button
          ref={triggerRef}
          type="button"
          className={`app-shell-item app-shell-settings-item${open ? ' active' : ''}`}
          onClick={() => setOpen(o => !o)}
          title="Settings"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="app-shell-item-icon"><GearIcon size={15} /></span>
          <span className="app-shell-item-label">Settings</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          className={`btn-icon${open ? ' active' : ''}`}
          onClick={() => setOpen(o => !o)}
          title="Settings"
          aria-label="Settings"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <GearIcon />
        </button>
      )}

      {open && (
        <>
          <div className="settings-menu-backdrop" onMouseDown={() => setOpen(false)} />
          <div
            role="menu"
            className="settings-menu"
            onMouseDown={e => e.stopPropagation()}
            style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom }}
          >
            <Section label="Theme">
              <div className="settings-seg">
                <button className={`settings-seg-opt${theme === 'light' ? ' selected' : ''}`} onClick={() => setTheme('light')}>Light</button>
                <button className={`settings-seg-opt${theme === 'dark' ? ' selected' : ''}`} onClick={() => setTheme('dark')}>Dark</button>
              </div>
            </Section>

            <Section label="Text size">
              <div className="settings-textsize">
                <button className="settings-step" onClick={decreaseFontSize} aria-label="Decrease text size">A−</button>
                <span className="settings-textsize-val">{fontSize}</span>
                <button className="settings-step" onClick={increaseFontSize} aria-label="Increase text size">A+</button>
              </div>
            </Section>

            {supabaseConfigured() && (
              <div className="settings-sync-section">
                <Section label="Sync">
                  <AuthPanel
                    userEmail={userEmail}
                    onSignedOut={() => setUserEmail(null)}
                  />
                </Section>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-menu-section">
      <div className="settings-menu-label">{label}</div>
      {children}
    </div>
  );
}
