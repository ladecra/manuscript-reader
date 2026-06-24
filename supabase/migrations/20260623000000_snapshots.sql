-- ─── Vellibris — version snapshots (Phase 8) ─────────────────────────────────
--
-- Unlike the other child tables (one JSONB blob per manuscript), snapshots are
-- MANY rows per manuscript — one immutable row per captured version — so the PK
-- is (user_id, manuscript_id, snapshot_id).
--
-- The large frozen markdown body does NOT live here. It goes in the existing
-- "manuscripts" Storage bucket, content-addressed at
--   {user_id}/snapshots/{manuscript_id}/{version_id}.md
-- Identical prose across versions shares one body (the cyrb53 versionId is the
-- dedup key). The existing "own files" storage policy already covers these paths
-- (it keys on the first path segment = auth.uid()), so NO new bucket/policy here.
--
-- version_id and created_at are top-level columns (not just inside `data`) so
-- sync/ordering/orphan queries don't have to parse JSON — same rationale as
-- `revision` on the manuscripts table. created_at is bigint epoch-millis to match
-- the app's Snapshot.createdAt (a JS number), not a wall-clock timestamptz.

-- ── Table ───────────────────────────────────────────────────────────────────

create table if not exists manuscript_snapshots (
  user_id       uuid        references auth.users on delete cascade not null,
  manuscript_id text        not null,
  snapshot_id   text        not null,
  version_id    text        not null,   -- content address of the frozen markdown body
  created_at    bigint      not null,   -- epoch millis (mirrors Snapshot.createdAt)
  data          jsonb       not null,   -- SnapshotRecord = Snapshot minus markdown
  updated_at    timestamptz not null default now(),
  primary key (user_id, manuscript_id, snapshot_id)
);

-- Listing a manuscript's snapshot index is the hot path.
create index if not exists manuscript_snapshots_by_ms
  on manuscript_snapshots (user_id, manuscript_id);

-- ── updated_at trigger ──────────────────────────────────────────────────────
-- Reuses _set_updated_at() defined in the initial migration. Snapshots are
-- immutable except for label edits (an upsert), so this only fires on relabel.

drop trigger if exists manuscript_snapshots_updated_at on manuscript_snapshots;
create trigger manuscript_snapshots_updated_at
  before update on manuscript_snapshots
  for each row execute function _set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table manuscript_snapshots enable row level security;

drop policy if exists "own rows" on manuscript_snapshots;
create policy "own rows" on manuscript_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
