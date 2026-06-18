import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import { hydrateStorage, setPersistErrorHandler, configureSync, setSyncCompleteHandler, performSync, type SyncResult } from './engine/storage'
import { useLibraryStore } from './state/libraryStore'
import { showToast } from './components/ui/Toast'
import { supabaseConfigured, getSupabaseClient } from './engine/storage/supabaseClient'
import { SupabaseSync } from './engine/storage/supabaseSync'

setPersistErrorHandler(() =>
  showToast('Could not save — your device may be out of storage space.', 6000),
)

function showSyncToast(r: SyncResult) {
  if (r.failed) {
    showToast('Sync error — changes may not have saved to the cloud.', 6000);
  } else if (r.pulled > 0 && r.pushed > 0) {
    showToast(`Library synced — ${r.pulled} pulled, ${r.pushed} pushed.`);
  } else if (r.pulled > 0) {
    const label = r.pulled === 1 ? '1 manuscript' : `${r.pulled} manuscripts`;
    showToast(`${label} synced from your account.`);
  } else if (r.pushed > 0) {
    const label = r.pushed === 1 ? '1 manuscript' : `${r.pushed} manuscripts`;
    showToast(`${label} saved to your account.`);
  }
  // No toast when already in sync — would fire on every page load.
}

setSyncCompleteHandler(() => useLibraryStore.getState().refresh())

function start() {
  // The library store initialized before the cache was hydrated; repopulate it.
  useLibraryStore.getState().refresh()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

async function init() {
  // Load persisted data (migrating localStorage → IndexedDB on first run) before
  // the first render, so the library doesn't flash empty then populate.
  await hydrateStorage().catch(e => console.error('[storage] hydrate failed', e))
  start()

  // If Supabase is configured, check for an existing session and sync in the
  // background. This never blocks the render — the app is fully functional
  // without a network connection.
  if (!supabaseConfigured()) return;
  try {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      configureSync(new SupabaseSync(sb, session.user.id));
      performSync().then(showSyncToast).catch(e => console.warn('[sync] background sync failed', e));
    }

    // Keep sync configured for the lifetime of the session (handles magic-link
    // return, sign-out, and token refresh automatically).
    sb.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        configureSync(new SupabaseSync(sb, newSession.user.id));
        performSync().then(showSyncToast).catch(e => console.warn('[sync] post-auth sync failed', e));
      } else {
        configureSync(null as unknown as SupabaseSync); // clear sync client on sign-out
      }
    });
  } catch (e) {
    console.warn('[sync] auth init failed', e);
  }
}

init()
