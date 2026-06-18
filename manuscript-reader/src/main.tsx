import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import { hydrateStorage, setPersistErrorHandler, configureSync, setSyncCompleteHandler, performSync } from './engine/storage'
import { useLibraryStore } from './state/libraryStore'
import { showToast } from './components/ui/Toast'
import { supabaseConfigured, getSupabaseClient } from './engine/storage/supabaseClient'
import { SupabaseSync } from './engine/storage/supabaseSync'

setPersistErrorHandler(() =>
  showToast('Could not save — your device may be out of storage space.', 6000),
)

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
      performSync().catch(e => console.warn('[sync] background sync failed', e));
    }

    // Keep sync configured for the lifetime of the session (handles magic-link
    // return, sign-out, and token refresh automatically).
    sb.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        configureSync(new SupabaseSync(sb, newSession.user.id));
        performSync().catch(e => console.warn('[sync] post-auth sync failed', e));
      } else {
        configureSync(null as unknown as SupabaseSync); // clear sync client on sign-out
      }
    });
  } catch (e) {
    console.warn('[sync] auth init failed', e);
  }
}

init()
