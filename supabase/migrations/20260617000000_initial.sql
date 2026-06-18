-- ─── Vellibris — initial schema ──────────────────────────────────────────────
--
-- manuscripts table: metadata only. combinedMarkdown lives in the Storage bucket
-- "manuscripts" at path {user_id}/{manuscript_id}.md  (avoids large-text in JSONB
-- and makes per-file Storage policies straightforward).
--
-- Child entity tables each store one JSONB array per manuscript — mirrors the
-- flat "one blob per manuscript" approach used by the IndexedDB provider.
--
-- revision is a top-level column (not buried in JSONB) so sync queries can
-- compare it without parsing JSON.

-- ── Tables ────────────────────────────────────────────────────────────────────

create table manuscripts (
  user_id       uuid        references auth.users on delete cascade not null,
  manuscript_id text        not null,
  revision      int         not null default 0,
  data          jsonb       not null,   -- StoredManuscript minus combinedMarkdown
  updated_at    timestamptz not null default now(),
  primary key (user_id, manuscript_id)
);

create table manuscript_annotations (
  user_id       uuid        references auth.users on delete cascade not null,
  manuscript_id text        not null,
  data          jsonb       not null default '[]',
  updated_at    timestamptz not null default now(),
  primary key (user_id, manuscript_id)
);

create table manuscript_edits (
  user_id       uuid        references auth.users on delete cascade not null,
  manuscript_id text        not null,
  data          jsonb       not null default '[]',
  updated_at    timestamptz not null default now(),
  primary key (user_id, manuscript_id)
);

create table manuscript_sessions (
  user_id       uuid        references auth.users on delete cascade not null,
  manuscript_id text        not null,
  data          jsonb       not null default '[]',
  updated_at    timestamptz not null default now(),
  primary key (user_id, manuscript_id)
);

create table manuscript_positions (
  user_id       uuid        references auth.users on delete cascade not null,
  manuscript_id text        not null,
  position      float       not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, manuscript_id)
);

-- ── updated_at trigger ────────────────────────────────────────────────────────

create or replace function _set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger manuscripts_updated_at           before update on manuscripts           for each row execute function _set_updated_at();
create trigger manuscript_annotations_updated_at before update on manuscript_annotations for each row execute function _set_updated_at();
create trigger manuscript_edits_updated_at       before update on manuscript_edits       for each row execute function _set_updated_at();
create trigger manuscript_sessions_updated_at    before update on manuscript_sessions    for each row execute function _set_updated_at();
create trigger manuscript_positions_updated_at   before update on manuscript_positions   for each row execute function _set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table manuscripts            enable row level security;
alter table manuscript_annotations enable row level security;
alter table manuscript_edits       enable row level security;
alter table manuscript_sessions    enable row level security;
alter table manuscript_positions   enable row level security;

create policy "own rows" on manuscripts            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on manuscript_annotations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on manuscript_edits       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on manuscript_sessions    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on manuscript_positions   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- Manuscript markdown files live at {user_id}/{manuscript_id}.md

insert into storage.buckets (id, name, public) values ('manuscripts', 'manuscripts', false);

create policy "own files" on storage.objects
  for all using (
    bucket_id = 'manuscripts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'manuscripts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
