# Vellibris Sync Worker — API design

*The transport substrate for the beta-reader loop (brief §3.2 / HP2). A tiny Cloudflare
Worker over R2 (blobs) + KV (metadata). No author accounts — access is by **unguessable
shareId + signed capability token**, never a login. The app talks to it through an abstract
`SyncClient`, so the substrate stays reversible.*

## The model in one paragraph

An author **creates a share** of a frozen manuscript version and gets back a `shareId`, an
**author token** (the manage capability), and a **reader URL**. Beta readers open the URL, read
on any device, annotate, and their session **syncs optimistically** (localStorage is the reader's
source of truth; the worker is the mirror). The author **pulls the merged sessions** with their
token; the existing pure engine (`sessionFromImportPayload` → `mergeReaderSessions` →
`EditorialSignals`) folds them in **unchanged** — the worker is a transport swap for what JSON
import does today (§3.4 was already done). A share has three states: **live → frozen → revoked**.

## Capability tokens

Stateless, signed (HMAC-SHA256 over `SHARE_SIGNING_KEY`), base64url. Claims:

```
{ sid: shareId, role: 'author' | 'reader', rid?: readerId, iat: epochMs }
```

- **Author token** (`role:'author'`) — minted once at share creation, returned to the author,
  stored in *their* local library record. Required for GET sessions, PATCH, DELETE.
- **Reader token** (`role:'reader'`, carries `rid`) — minted on a reader's first session POST and
  handed back; the reader's device keeps it and presents it on later updates so no one else can
  overwrite that reader's session. Reading itself needs no token — knowledge of the `shareId`
  (in the URL) is the read capability.
- Revocation is by **share state**, not token blacklisting: a revoked share rejects every request
  regardless of token. (Good enough for a free launch-and-leave tool; token rotation is out of scope.)

## Endpoints (6)

All routes are versioned under **`/v1`** (so the protocol can evolve behind `/v2` without
breaking reader links already in the wild).

| # | Method + path | Auth | Purpose |
|---|---|---|---|
| 1 | `POST /v1/shares` | — (creator) | Create a share. Body: `{ title, versionId, markdown, settings }`. → `{ shareId, authorToken, readerUrl }`. Writes the manuscript blob to R2 **once** (immutable), record to KV, state `live`. |
| 2 | `GET /v1/shares/:id` | shareId (URL) | Fetch the manuscript payload (JSON). `410` if revoked. |
| 2b | `PUT /v1/shares/:id/reader` | author token | Upload the self-contained reader HTML this share hosts. Written once after create; immutable. |
| 3 | `POST /v1/shares/:id/sessions` | shareId (+ reader token on update) | A reader upserts their session (`ReaderExportPayload`). First call assigns `readerId` + mints a reader token. `403` if `frozen`/`revoked`; **`409` if the write is stale** (older `exportedAt` than the stored one). Updates roster (`progress`, `lastActiveAt`, name). → `{ readerId, readerToken }`. |
| 4 | `GET /v1/shares/:id/sessions` | author token | Author pulls all reader sessions for the merge (HP3), read from **R2** (canonical). → `{ state, readers[], sessions: ReaderExportPayload[] }`. |
| 5 | `PATCH /v1/shares/:id` | author token | Manage: `{ state?: 'live'|'frozen'|'revoked', title?, settings? }`. Freeze = 3rd state (still reads, rejects new feedback). Reviving from `revoked` cancels a pending soft-deletion. |
| 6 | `DELETE /v1/shares/:id` | author token | **Soft-delete:** flips to `revoked` now (instant access cut, no race with in-flight uploads) + stamps `deleteAfter = now + 7d`. A later cron GCs the blobs; `PATCH state=live` within the window revives it. |

**The share hosts its own reader** (brief §3.2: "hosts the share — a self-contained ~1–3 MB static
file — at an unlisted URL"). The app builds the self-contained reader HTML (`buildShareableHTML` +
`syncConfig`), then `PUT`s it here; the worker serves it at the public, tokenless **`GET /r/:id`**.
One artifact, so the shared reader is a single source of truth and no separate static host is needed —
it works on `*.workers.dev` today; point `read.vellibris.com` at the same worker once the domain lands.
A revoked share serves a friendly notice (`410`), never the file.

CORS: the app calls the worker cross-origin (the app and worker are different origins), so the JSON
API responses carry permissive CORS headers and `OPTIONS` preflight is handled. The hosted reader at
`/r/:id` is same-origin with its own sync calls, so it needs no CORS. (Tighten
`Access-Control-Allow-Origin` to the known app origin before public launch.)

## Data model

**KV** — fast metadata + roster, one key per share:

```
share:{shareId} → ShareRecord {
  shareId, title, versionId,
  state: 'live'|'frozen'|'revoked',
  createdAt, updatedAt,
  settings: { askName, privateNotes },
  readers: [ { readerId, readerName, progress, joinedAt, lastActiveAt } ]
}
```

**R2** (bucket `vellibris-shares`) — larger blobs, prefixed by share:

```
share/{shareId}/manuscript          → the stripped body markdown, written ONCE (immutable)
share/{shareId}/reader.html         → the self-contained hosted reader, written ONCE (immutable)
share/{shareId}/session/{readerId}  → the reader's ReaderExportPayload JSON (mutable)
```

**R2 is the source of truth; KV is a display cache.** Author-pull lists `share/{shareId}/session/`
by prefix — R2 list is *strongly consistent*, so it never misses a just-written session (whereas KV
is eventually consistent, which is why the roster must not be authoritative for counts). Session
bodies live in R2 (annotations can be large); only the light roster lives in KV so the author's
Library rows / Hub roster render cheaply. Prefix-listing is fine at beta scale (tens of readers per
manuscript); if a share ever has hundreds, revisit with a KV-cached readerId index.

**`readerId` = a browser installation, not a human.** It's minted into the reader's localStorage;
if that's cleared (Safari eviction, private mode, a new phone) the same person returns as a new
reader. Embraced, not fought — it keeps identity accountless and makes same-person cross-device
races a non-issue (two installs are simply two readers).

## Optimistic sync (reader side)

`Saved (local) → Queued → Synced`. localStorage is authoritative; a failed POST leaves the mark
`Queued` and retries. `lastActiveAt` on each roster entry drives the author's roster liveness dots.

## Local development

`wrangler dev` runs the whole thing on Miniflare with **local** KV + R2 emulation — **no Cloudflare
account needed** to build and test. `.dev.vars` (gitignored) holds a dev `SHARE_SIGNING_KEY`.
Provisioning real KV/R2 + the domain (Stage B/C of the checklist) is only needed for the first
`wrangler deploy`.

## Design review (2026-07-12)

Reviewed against `raw/gpt-sync-worker.md`. **Adopted:** immutable manuscript blob (explicit
guarantee — a share is a frozen publication); 24-byte high-entropy shareIds; `/v1` versioning;
soft-delete (revoke + `deleteAfter`, GC cron deferred); optimistic concurrency via `exportedAt`
(`409` on stale); `readerId` = browser-install (documented); KV-as-cache / R2-as-truth (made
explicit). **Declined:** KV `readerIds[]` index instead of R2 prefix-list — R2 list is *strongly*
consistent and our scale is tens of readers, so listing is both correct and cheap; a KV index would
make the *eventually*-consistent store authoritative. Also declined splitting `POST`/`PUT` for
create-vs-update — the single upsert is simpler and the reader token already distinguishes them.

## Explicitly out of scope (v1)

Author accounts · token rotation/blacklist · the soft-delete **GC cron** (blobs of expired
`deleteAfter` shares; add later) · per-reader private-note enforcement server-side (the flag rides
in settings; the reader runtime honors it) · rate limiting (add before public launch) · the
passage-convergence pass (a separate engine deliverable, downstream of this).
