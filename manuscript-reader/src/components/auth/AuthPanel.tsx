import { useState } from 'react';
import { getSupabaseClient, supabaseConfigured } from '../../engine/storage/supabaseClient';

interface AuthPanelProps {
  userEmail: string | null;
  onSignedOut: () => void;
}

export function AuthPanel({ userEmail, onSignedOut }: AuthPanelProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (!supabaseConfigured()) return null;

  async function handleSend() {
    const e = email.trim();
    if (!e) return;
    setStatus('sending');
    try {
      const { error } = await getSupabaseClient().auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut();
    onSignedOut();
  }

  if (userEmail) {
    return (
      <div className="auth-panel">
        <div className="auth-panel-row">
          <span className="auth-panel-label">Syncing as</span>
          <span className="auth-panel-email">{userEmail}</span>
        </div>
        <button className="auth-panel-signout" onClick={handleSignOut}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <div className="auth-panel-label">Sign in to sync across devices</div>
      {status === 'sent' ? (
        <div className="auth-panel-sent">Check your email for a magic link.</div>
      ) : (
        <>
          <input
            className="auth-panel-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            disabled={status === 'sending'}
          />
          <button
            className="auth-panel-btn"
            onClick={handleSend}
            disabled={status === 'sending' || !email.trim()}
          >
            {status === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
          {status === 'error' && <div className="auth-panel-error">Could not send link. Try again.</div>}
        </>
      )}
    </div>
  );
}
