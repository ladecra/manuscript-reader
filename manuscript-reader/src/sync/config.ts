// ─── Sync configuration — where the app finds its worker ─────────────────────
// The worker origin comes from build-time env (VITE_SYNC_ENDPOINT). When it's
// unset the app is fully local-first: `getSyncClient()` returns a NullSyncClient
// and the Sharing UI shows its "not configured" state instead of erroring. To
// enable hosted sharing, add to .env.local and restart the dev server:
//
//   VITE_SYNC_ENDPOINT=https://vellibris-sync.<your-subdomain>.workers.dev

import { createSyncClient, type SyncClient, type SyncConfig } from './client';

/** Normalized worker origin, or '' when unconfigured. */
export function syncEndpoint(): string {
  return (import.meta.env.VITE_SYNC_ENDPOINT ?? '').replace(/\/+$/, '');
}

/** True when a worker is configured — the Sharing UI gates its create button on this. */
export function isSyncConfigured(): boolean {
  return syncEndpoint().length > 0;
}

export function syncConfig(): SyncConfig | null {
  const endpoint = syncEndpoint();
  return endpoint ? { endpoint } : null;
}

let cached: SyncClient | null = null;
/** The process-wide SyncClient (memoized — config is fixed at build time). */
export function getSyncClient(): SyncClient {
  return (cached ??= createSyncClient(syncConfig()));
}

// Dev-only visibility: prints once at load so you can confirm the worker endpoint
// Vite actually baked in (an empty value here = restart the dev server). Safe to
// remove once the loop is verified.
if (import.meta.env.DEV) {
  console.info('[vellibris] sync endpoint:', syncEndpoint() || '(none — sharing disabled)');
}
