import { useEffect, useState, type ReactNode } from 'react';
import { useUIStore } from '../../state/uiStore';
import { GearIcon } from './Icons';
import { AuthPanel } from '../auth/AuthPanel';
import { supabaseConfigured, getSupabaseClient } from '../../engine/storage/supabaseClient';

interface SettingsMenuProps {
  /** Open the popover above the button instead of below (for rail footer placement). */
  upward?: boolean;
}

/** Settings popover — theme + text-size controls. On mobile (≤860px) also shows auth. */
export function SettingsMenu({ upward = false }: SettingsMenuProps) {
  const { theme, fontSize, toggleTheme, increaseFontSize, decreaseFontSize } = useUIStore();
  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

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

  const setTheme = (t: 'light' | 'dark') => { if (theme !== t) toggleTheme(); };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className={`icon-btn${open ? ' active-btn' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <GearIcon />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 198 }} onMouseDown={() => setOpen(false)} />
          <div
            role="menu"
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              ...(upward
                ? { bottom: 'calc(100% + 8px)', top: 'auto' }
                : { top: 'calc(100% + 8px)' }),
              right: 0, zIndex: 199,
              minWidth: '190px', padding: '14px',
              background: 'var(--surface-high)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: '14px',
            }}
          >
            <Section label="Theme">
              <div style={{ display: 'flex', gap: '6px' }}>
                <Choice active={theme === 'light'} onClick={() => setTheme('light')}>Light</Choice>
                <Choice active={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</Choice>
              </div>
            </Section>

            <Section label="Text size">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="text-btn" onClick={decreaseFontSize} title="Decrease font" aria-label="Decrease text size">A−</button>
                <span style={{ fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", fontSize: '12px', color: 'var(--on-surface)', minWidth: '20px', textAlign: 'center' }}>{fontSize}</span>
                <button className="text-btn" onClick={increaseFontSize} title="Increase font" aria-label="Increase text size">A+</button>
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
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '8px' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`status-opt${active ? ' selected' : ''}`} style={{ flex: 1 }} onClick={onClick}>
      {children}
    </button>
  );
}
