/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Deployed sync-worker origin, no trailing slash (e.g.
   *  https://vellibris-sync.<sub>.workers.dev). Empty/unset → the app runs fully
   *  local-first with sharing disabled (a NullSyncClient). Set in `.env.local`. */
  readonly VITE_SYNC_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
