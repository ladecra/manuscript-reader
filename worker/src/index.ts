// ─── Vellibris sync worker — entry + router (see DESIGN.md) ───────────────────
// Six endpoints over R2 (blobs) + KV (metadata), secured by capability tokens.
// Hand-rolled routing to stay dependency-free.

import type { Env, ShareRecord, ShareSettings, ShareState, ReaderExportPayload, ReaderRosterEntry } from './types';
import { signToken, verifyToken, bearer } from './tokens';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
function err(status: number, message: string): Response {
  return json({ error: message }, status);
}

const kvKey = (shareId: string) => `share:${shareId}`;
const manuscriptKey = (shareId: string) => `share/${shareId}/manuscript`;
const readerKey = (shareId: string) => `share/${shareId}/reader.html`;
const sessionKey = (shareId: string, readerId: string) => `share/${shareId}/session/${readerId}`;
const sessionPrefix = (shareId: string) => `share/${shareId}/session/`;

async function loadShare(env: Env, shareId: string): Promise<ShareRecord | null> {
  return env.SHARES.get<ShareRecord>(kvKey(shareId), 'json');
}
async function saveShare(env: Env, rec: ShareRecord): Promise<void> {
  rec.updatedAt = Date.now();
  await env.SHARES.put(kvKey(rec.shareId), JSON.stringify(rec));
}

/** A long, URL-safe, unguessable id (192 bits from 24 random bytes → 32 base64url
 *  chars). High entropy because share URLs leak — browser history, screenshots,
 *  referer, forwarded email — so guessing must be effectively impossible. */
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function coerceSettings(raw: unknown): ShareSettings {
  const s = (raw ?? {}) as Partial<ShareSettings>;
  return { askName: s.askName !== false, privateNotes: s.privateNotes === true };
}

/** Assert the request carries a valid author token scoped to this share. */
async function requireAuthor(req: Request, env: Env, shareId: string): Promise<Response | null> {
  const tok = bearer(req);
  if (!tok) return err(401, 'Missing author token.');
  const claims = await verifyToken(tok, env.SHARE_SIGNING_KEY);
  if (!claims || claims.role !== 'author' || claims.sid !== shareId) return err(403, 'Not authorized for this share.');
  return null;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/** 1. POST /shares — create a share. */
async function createShare(req: Request, env: Env): Promise<Response> {
  let body: { title?: string; versionId?: string; markdown?: string; settings?: unknown };
  try { body = await req.json(); } catch { return err(400, 'Invalid JSON body.'); }
  if (!body.markdown || typeof body.markdown !== 'string') return err(400, 'Missing manuscript markdown.');

  const shareId = newId();
  const now = Date.now();
  const rec: ShareRecord = {
    shareId,
    title: (body.title || 'Untitled manuscript').slice(0, 300),
    versionId: body.versionId || '',
    state: 'live',
    createdAt: now,
    updatedAt: now,
    settings: coerceSettings(body.settings),
    readers: [],
  };
  // The manuscript blob is written exactly once, here, and never rewritten by any
  // endpoint: a share is an immutable publication. Editing the text means creating
  // a NEW share — which is why anchors never drift and reports stay reproducible.
  await env.BLOBS.put(manuscriptKey(shareId), body.markdown);
  await saveShare(env, rec);

  const authorToken = await signToken({ sid: shareId, role: 'author', iat: now }, env.SHARE_SIGNING_KEY);
  const base = env.READER_BASE_URL || new URL(req.url).origin;
  return json({ shareId, authorToken, readerUrl: `${base}/r/${shareId}` }, 201);
}

/** 2. GET /shares/:id — manuscript payload for the reader runtime. */
async function getShare(_req: Request, env: Env, shareId: string): Promise<Response> {
  const rec = await loadShare(env, shareId);
  if (!rec) return err(404, 'Share not found.');
  if (rec.state === 'revoked') return err(410, 'This share link has been revoked.');
  const blob = await env.BLOBS.get(manuscriptKey(shareId));
  if (!blob) return err(404, 'Manuscript not found.');
  const markdown = await blob.text();
  return json({
    shareId,
    title: rec.title,
    versionId: rec.versionId,
    state: rec.state,
    settings: rec.settings,
    markdown,
  });
}

/** 2b. PUT /shares/:id/reader — author uploads the self-contained reader HTML that
 *  this share hosts (brief §3.2: "hosts the share ... at an unlisted URL"). Written
 *  once right after createShare; immutable like the manuscript blob. */
async function putReader(req: Request, env: Env, shareId: string): Promise<Response> {
  const authFail = await requireAuthor(req, env, shareId);
  if (authFail) return authFail;
  const rec = await loadShare(env, shareId);
  if (!rec) return err(404, 'Share not found.');
  const html = await req.text();
  if (!html || html.length < 32) return err(400, 'Empty reader document.');
  await env.BLOBS.put(readerKey(shareId), html, { httpMetadata: { contentType: 'text/html; charset=utf-8' } });
  return json({ shareId, ok: true });
}

/** Public: GET /r/:id — the hosted reader page. No token: knowing the id (in the
 *  unlisted URL) is the read capability. Serves the self-contained HTML the author
 *  uploaded; a revoked/missing share gets a friendly notice, never a raw error. A
 *  frozen share still reads (it only rejects new feedback). */
async function getReader(_req: Request, env: Env, shareId: string): Promise<Response> {
  const rec = await loadShare(env, shareId);
  if (!rec) return readerNotice('This reading link was not found.', 404);
  if (rec.state === 'revoked') return readerNotice('This reading link has been turned off by the author.', 410);
  const blob = await env.BLOBS.get(readerKey(shareId));
  if (!blob) return readerNotice('This reading link is not ready yet.', 404);
  return new Response(blob.body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}

/** A minimal, self-styled HTML notice for unavailable shares (matches the reader's
 *  dark ground so it doesn't flash white). */
function readerNotice(message: string, status: number): Response {
  const safe = message.replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vellibris</title><style>html{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#161615;color:#a4a39c}main{max-width:32ch;text-align:center;padding:32px}</style></head><body><main>${safe}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** 3. POST /shares/:id/sessions — a reader upserts their session. */
async function putSession(req: Request, env: Env, shareId: string): Promise<Response> {
  const rec = await loadShare(env, shareId);
  if (!rec) return err(404, 'Share not found.');
  if (rec.state === 'revoked') return err(410, 'This share link has been revoked.');
  if (rec.state === 'frozen') return err(403, 'Feedback is closed for this share.');

  let payload: ReaderExportPayload;
  try { payload = await req.json(); } catch { return err(400, 'Invalid JSON body.'); }
  if (!Array.isArray(payload.annotations)) return err(400, 'Missing annotations array.');

  // Resolve reader identity: an existing reader presents their token; a new reader
  // is assigned an id + minted a token.
  let readerId: string;
  let readerToken: string | undefined;
  const tok = bearer(req);
  if (tok) {
    const claims = await verifyToken(tok, env.SHARE_SIGNING_KEY);
    if (!claims || claims.role !== 'reader' || claims.sid !== shareId || !claims.rid) {
      return err(403, 'Invalid reader token.');
    }
    readerId = claims.rid;
  } else {
    readerId = payload.readerId || newId();
    readerToken = await signToken({ sid: shareId, role: 'reader', rid: readerId, iat: Date.now() }, env.SHARE_SIGNING_KEY);
  }

  // Optimistic concurrency: a reader's session is a full snapshot, and `exportedAt`
  // is when this device produced it. Reject a strictly-older write so a phone that
  // was offline can't clobber newer marks from another install on reconnect. (Same
  // reader on two installs = two readerIds anyway — see the browser-install model in
  // DESIGN.md — so true races are rare; this is belt-and-suspenders.)
  const key = sessionKey(shareId, readerId);
  if (Number.isFinite(payload.exportedAt as number)) {
    const existing = await env.BLOBS.get(key);
    if (existing) {
      try {
        const prev = JSON.parse(await existing.text()) as ReaderExportPayload;
        if (Number.isFinite(prev.exportedAt as number) && (payload.exportedAt as number) < (prev.exportedAt as number)) {
          return json({ error: 'stale', serverExportedAt: prev.exportedAt }, 409);
        }
      } catch { /* unreadable prior blob — allow the write to heal it */ }
    }
  }

  const stored: ReaderExportPayload = { ...payload, readerId };
  await env.BLOBS.put(key, JSON.stringify(stored));

  // Update the light roster in KV.
  const now = Date.now();
  const progress = clamp01(payload.progress ?? 0);
  const name = payload.readerName ?? null;
  const existing = rec.readers.find(r => r.readerId === readerId);
  if (existing) {
    existing.progress = progress;
    existing.lastActiveAt = now;
    if (name) existing.readerName = name;
  } else {
    const entry: ReaderRosterEntry = { readerId, readerName: name, progress, joinedAt: now, lastActiveAt: now };
    rec.readers.push(entry);
  }
  await saveShare(env, rec);

  return json({ readerId, ...(readerToken ? { readerToken } : {}) });
}

/** 4. GET /shares/:id/sessions — author pulls all sessions for the merge. */
async function listSessions(req: Request, env: Env, shareId: string): Promise<Response> {
  const authFail = await requireAuthor(req, env, shareId);
  if (authFail) return authFail;
  const rec = await loadShare(env, shareId);
  if (!rec) return err(404, 'Share not found.');

  const listed = await env.BLOBS.list({ prefix: sessionPrefix(shareId) });
  const sessions: ReaderExportPayload[] = [];
  for (const obj of listed.objects) {
    const blob = await env.BLOBS.get(obj.key);
    if (!blob) continue;
    try { sessions.push(JSON.parse(await blob.text())); } catch { /* skip corrupt */ }
  }
  return json({ shareId, state: rec.state, readers: rec.readers, sessions });
}

/** 5. PATCH /shares/:id — author manages state / title / settings. */
async function patchShare(req: Request, env: Env, shareId: string): Promise<Response> {
  const authFail = await requireAuthor(req, env, shareId);
  if (authFail) return authFail;
  const rec = await loadShare(env, shareId);
  if (!rec) return err(404, 'Share not found.');

  let body: { state?: ShareState; title?: string; settings?: unknown };
  try { body = await req.json(); } catch { return err(400, 'Invalid JSON body.'); }
  if (body.state) {
    if (!['live', 'frozen', 'revoked'].includes(body.state)) return err(400, 'Invalid state.');
    rec.state = body.state;
    // Reviving a share (back to live/frozen) cancels a pending soft-deletion.
    if (body.state !== 'revoked') rec.deleteAfter = undefined;
  }
  if (typeof body.title === 'string') rec.title = body.title.slice(0, 300);
  if (body.settings !== undefined) rec.settings = coerceSettings(body.settings);
  await saveShare(env, rec);
  return json({ shareId, state: rec.state, title: rec.title, settings: rec.settings });
}

/** 6. DELETE /shares/:id — soft-delete: revoke now, GC the blobs later.
 *  Revoking immediately kills all access with no race against in-flight uploads,
 *  and keeps a 7-day recovery window (PATCH state=live revives it). A later cron
 *  purges blobs of shares whose `deleteAfter` has passed. */
const SOFT_DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
async function deleteShare(req: Request, env: Env, shareId: string): Promise<Response> {
  const authFail = await requireAuthor(req, env, shareId);
  if (authFail) return authFail;
  const rec = await loadShare(env, shareId);
  if (!rec) return err(404, 'Share not found.');

  rec.state = 'revoked';
  rec.deleteAfter = Date.now() + SOFT_DELETE_GRACE_MS;
  await saveShare(env, rec);
  return json({ shareId, state: rec.state, deleteAfter: rec.deleteAfter });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

// ── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(req.url);
    const segs = url.pathname.split('/').filter(Boolean); // e.g. ['v1','shares',':id','sessions']

    // Public hosted-reader URL: /r/:shareId — the unlisted link readers open. Kept
    // OUTSIDE /v1 because it's a human-facing page, not the machine API; its shape
    // must stay stable forever (links live in inboxes for months).
    if (segs[0] === 'r') {
      try {
        if (segs.length === 2 && req.method === 'GET') return await getReader(req, env, segs[1]);
        return readerNotice('This reading link was not found.', 404);
      } catch {
        return readerNotice('Something went wrong loading this manuscript.', 500);
      }
    }

    // Versioned API from day one — the share protocol can evolve behind /v2 without
    // breaking reader links already in the wild.
    if (segs[0] !== 'v1') return err(404, 'Not found.');
    const parts = segs.slice(1);

    try {
      if (parts[0] === 'shares') {
        // /shares
        if (parts.length === 1) {
          if (req.method === 'POST') return await createShare(req, env);
          return err(405, 'Method not allowed.');
        }
        const shareId = parts[1];
        // /shares/:id
        if (parts.length === 2) {
          if (req.method === 'GET') return await getShare(req, env, shareId);
          if (req.method === 'PATCH') return await patchShare(req, env, shareId);
          if (req.method === 'DELETE') return await deleteShare(req, env, shareId);
          return err(405, 'Method not allowed.');
        }
        // /shares/:id/sessions
        if (parts.length === 3 && parts[2] === 'sessions') {
          if (req.method === 'POST') return await putSession(req, env, shareId);
          if (req.method === 'GET') return await listSessions(req, env, shareId);
          return err(405, 'Method not allowed.');
        }
        // /shares/:id/reader
        if (parts.length === 3 && parts[2] === 'reader') {
          if (req.method === 'PUT') return await putReader(req, env, shareId);
          return err(405, 'Method not allowed.');
        }
      }
      return err(404, 'Not found.');
    } catch (e) {
      return err(500, e instanceof Error ? e.message : 'Internal error.');
    }
  },
} satisfies ExportedHandler<Env>;
