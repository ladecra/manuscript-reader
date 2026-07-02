-- ─── Vellibris — deletion tombstones (cross-device delete) ───────────────────
--
-- A persistent manuscriptId → deletedAt record that survives after the manuscript
-- row is gone, so cloud sync cannot resurrect a manuscript the user deleted on
-- another device. One row per deleted manuscript; PK (user_id, manuscript_id).
--
-- deleted_at is bigint epoch-millis to match the app's Date.now() value (a JS
-- number), same rationale as created_at on manuscript_snapshots.
--
-- Re-importing the same title clears the row (clearTombstone), so the title is
-- allowed back into the library.

-- ── Table ───────────────────────────────────────────────────────────────────

create table if not exists manuscript_tombstones (
  user_id       uuid        references auth.users on delete cascade not null,
  manuscript_id text        not null,
  deleted_at    bigint      not null,   -- epoch millis (mirrors Date.now())
  primary key (user_id, manuscript_id)
);

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table manuscript_tombstones enable row level security;

drop policy if exists "own rows" on manuscript_tombstones;
create policy "own rows" on manuscript_tombstones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
