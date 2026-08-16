import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import {
  applyDocumentPreferences,
  endThemeBootstrap,
  hydrateStorage,
  setPersistErrorHandler,
} from './engine/storage'
import { useLibraryStore } from './state/libraryStore'
import { showToast } from './components/ui/Toast'

applyDocumentPreferences()

setPersistErrorHandler(() =>
  showToast('Could not save — your device may be out of storage space.', 6000),
)

function start() {
  endThemeBootstrap()
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
  // the first render, so the library doesn't flash empty then populate. Storage is
  // device-local and account-free — there is no cloud sync to kick off here.
  await hydrateStorage().catch(e => console.error('[storage] hydrate failed', e))
  start()
}

init()
