// ─── Shared types for the Vellibris sync worker (see DESIGN.md) ──────────────

export interface Env {
  SHARES: KVNamespace;
  BLOBS: R2Bucket;
  /** HMAC key for capability tokens. Secret — set via `wrangler secret put`. */
  SHARE_SIGNING_KEY: string;
  /** Public base URL of the reader host, e.g. https://read.vellibris.com.
   *  Optional var; falls back to the request origin when unset. */
  READER_BASE_URL?: string;
}

export type ShareState = 'live' | 'frozen' | 'revoked';

export interface ShareSettings {
  /** Ask each reader their name so feedback is attributed. */
  askName: boolean;
  /** Each reader sees only their own marks (honored by the reader runtime). */
  privateNotes: boolean;
}

export interface ReaderRosterEntry {
  readerId: string;
  readerName: string | null;
  /** 0..1 reading progress, last reported. */
  progress: number;
  joinedAt: number;
  lastActiveAt: number;
}

/** The KV record for one share — light metadata + roster only. */
export interface ShareRecord {
  shareId: string;
  title: string;
  versionId: string;
  state: ShareState;
  createdAt: number;
  updatedAt: number;
  /** Set when the share is deleted (soft): revoked now, blobs GC'd after this
   *  epoch-ms. Cleared if the author revives the share before then. */
  deleteAfter?: number;
  settings: ShareSettings;
  /** Display cache only — NOT the source of truth. Canonical readers/sessions are
   *  the R2 session blobs (strongly consistent); this KV roster may lag. */
  readers: ReaderRosterEntry[];
}

/** The reader-submitted session payload. Mirrors the app's `ReaderExportPayload`
 *  (src/engine/sessions.ts) — kept structurally identical so the pure merge engine
 *  folds it in unchanged. `annotations` is opaque to the worker (stored as-is). */
export interface ReaderExportPayload {
  readerId?: string;
  readerName?: string | null;
  manuscript?: string;
  manuscriptVersionId?: string;
  snapshotId?: string;
  snapshotLabel?: string;
  startedAt?: number;
  completedAt?: number | null;
  exportedAt?: number;
  progress?: number;
  annotations: unknown[];
}
