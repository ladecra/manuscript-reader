// ─── SyncClient — the app's transport to the share worker (brief §3.2 / HP2) ──
// NOT engine: this talks to the network, so it can't be a pure function. The app
// depends on the abstract `SyncClient` interface; `WorkerSyncClient` implements it
// against the Cloudflare worker (see files/worker/DESIGN.md), and `NullSyncClient`
// stands in when no worker is configured (local-only mode). Swapping substrate
// (self-host, a different edge) means one new implementation, no caller changes.
//
// This is the AUTHOR side. Readers never touch this module — the shared-reader HTML
// carries its own inlined POST (buildShareableHTML's syncConfig). The author's
// capability is the `authorToken` minted at share creation and kept in their local
// manuscript record; it authorizes pull / manage / delete.

import type { ReaderExportPayload } from '../engine/sessions';

export type ShareState = 'live' | 'frozen' | 'revoked';

export interface ShareSettings {
  /** Ask each reader their name so feedback is attributed. */
  askName: boolean;
  /** Each reader sees only their own marks (honored by the reader runtime). */
  privateNotes: boolean;
}

/** Light roster entry (KV display cache — the canonical readers are the sessions). */
export interface ReaderRosterEntry {
  readerId: string;
  readerName: string | null;
  progress: number;
  joinedAt: number;
  lastActiveAt: number;
}

/** What the author gets back when a share is created. `authorToken` is the manage
 *  capability — persist it in the local manuscript record; it is never recoverable
 *  from the server (no accounts), so losing it means losing manage access. */
export interface CreatedShare {
  shareId: string;
  authorToken: string;
  readerUrl: string;
}

export interface CreateShareInput {
  title: string;
  /** Content address of the frozen snapshot being shared (parity contract). */
  versionId: string;
  /** Body-only manuscript markdown (matter already stripped by the caller). */
  markdown: string;
  settings?: Partial<ShareSettings>;
}

export interface SharePatch {
  state?: ShareState;
  title?: string;
  settings?: Partial<ShareSettings>;
}

/** The author's pull for the merge (HP3): roster + every reader's raw session. */
export interface ShareSessions {
  shareId: string;
  state: ShareState;
  readers: ReaderRosterEntry[];
  sessions: ReaderExportPayload[];
}

export interface DeletedShare {
  shareId: string;
  state: ShareState;
  /** Epoch-ms after which the worker GCs the blobs; revivable until then. */
  deleteAfter: number;
}

/** The author-side capability surface. Every method needs the author token except
 *  `createShare` (which mints it). */
export interface SyncClient {
  /** True when a real worker backs this client (vs. local-only Null). */
  readonly configured: boolean;
  createShare(input: CreateShareInput): Promise<CreatedShare>;
  /** Upload the self-contained reader HTML this share hosts (call right after create). */
  putReaderHtml(shareId: string, authorToken: string, html: string): Promise<void>;
  listSessions(shareId: string, authorToken: string): Promise<ShareSessions>;
  patchShare(shareId: string, authorToken: string, patch: SharePatch): Promise<void>;
  deleteShare(shareId: string, authorToken: string): Promise<DeletedShare>;
}

export interface SyncConfig {
  /** Worker origin, e.g. https://vellibris-sync.<sub>.workers.dev (no trailing /). */
  endpoint: string;
}

/** A transport failure or a non-2xx worker response. `status` is 0 for network errors. */
export class SyncError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SyncError';
    this.status = status;
  }
}

class WorkerSyncClient implements SyncClient {
  readonly configured = true;
  private base: string;

  constructor(config: SyncConfig) {
    // Normalize once so path joins never double-slash.
    this.base = config.endpoint.replace(/\/+$/, '');
  }

  private async call<T>(path: string, init: RequestInit, authorToken?: string): Promise<T> {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (init.body != null) headers['Content-Type'] = 'application/json';
    if (authorToken) headers['Authorization'] = `Bearer ${authorToken}`;

    let res: Response;
    try {
      res = await fetch(`${this.base}/v1${path}`, { ...init, headers });
    } catch (e) {
      throw new SyncError(0, e instanceof Error ? e.message : 'Network request failed.');
    }
    if (!res.ok) {
      let message = `Request failed (${res.status}).`;
      try {
        const body = await res.json() as { error?: string };
        if (body?.error) message = body.error;
      } catch { /* non-JSON error body — keep the generic message */ }
      throw new SyncError(res.status, message);
    }
    // 204/empty bodies resolve to undefined — callers that expect a body ask for one.
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  createShare(input: CreateShareInput): Promise<CreatedShare> {
    return this.call<CreatedShare>('/shares', { method: 'POST', body: JSON.stringify(input) });
  }

  async putReaderHtml(shareId: string, authorToken: string, html: string): Promise<void> {
    // Raw HTML body (not JSON), so this bypasses the JSON `call` helper.
    let res: Response;
    try {
      res = await fetch(`${this.base}/v1/shares/${encodeURIComponent(shareId)}/reader`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html', 'Authorization': `Bearer ${authorToken}` },
        body: html,
      });
    } catch (e) {
      throw new SyncError(0, e instanceof Error ? e.message : 'Network request failed.');
    }
    if (!res.ok) throw new SyncError(res.status, `Uploading the reader failed (${res.status}).`);
  }

  listSessions(shareId: string, authorToken: string): Promise<ShareSessions> {
    return this.call<ShareSessions>(`/shares/${encodeURIComponent(shareId)}/sessions`, { method: 'GET' }, authorToken);
  }

  async patchShare(shareId: string, authorToken: string, patch: SharePatch): Promise<void> {
    await this.call(`/shares/${encodeURIComponent(shareId)}`, { method: 'PATCH', body: JSON.stringify(patch) }, authorToken);
  }

  deleteShare(shareId: string, authorToken: string): Promise<DeletedShare> {
    return this.call<DeletedShare>(`/shares/${encodeURIComponent(shareId)}`, { method: 'DELETE' }, authorToken);
  }
}

/** Local-only stand-in: every share operation rejects with a clear message. Used
 *  when no worker endpoint is configured, so callers can depend on a SyncClient
 *  unconditionally and surface one honest error instead of branching everywhere. */
class NullSyncClient implements SyncClient {
  readonly configured = false;
  createShare(): Promise<CreatedShare> { return Promise.reject(this.err()); }
  putReaderHtml(): Promise<void> { return Promise.reject(this.err()); }
  listSessions(): Promise<ShareSessions> { return Promise.reject(this.err()); }
  patchShare(): Promise<void> { return Promise.reject(this.err()); }
  deleteShare(): Promise<DeletedShare> { return Promise.reject(this.err()); }
  private err(): SyncError { return new SyncError(0, 'Sharing is not configured — no sync worker connected.'); }
}

/** Build the right client for the current config. A missing/empty endpoint yields a
 *  NullSyncClient so the app runs fully local-first with no worker. */
export function createSyncClient(config?: SyncConfig | null): SyncClient {
  return config?.endpoint ? new WorkerSyncClient(config) : new NullSyncClient();
}
