-- Cloud sync of training data: per-user tables + RLS.
--
-- ⚠ Like the rest of this project, there is NO migration system — this DDL is
-- applied by hand on the piano-trainer Supabase instance and this file is the
-- canonical record. Apply via the Management API SQL endpoint or:
--   psql "$SUPABASE_DB_URL" -f supabase/sync.sql
--
-- Model (see why it's conflict-free in the PR): you can't play two piano
-- sessions at once, so sessions across devices are disjoint in time with unique
-- ids — sync is a plain union by id, no conflict resolution needed.
--   - training_sessions: one row per finished session, append-only. Sessions are
--     immutable once ended; sync pushes ids the server lacks and pulls ids the
--     client lacks. Aggregates are NOT stored here — they are recomputed locally
--     from sessions after a pull.
--   - user_fingerings: one row per (user, score); last-write-wins on updated_at
--     (a JS epoch-ms value), which is safe because the workflow always pulls
--     before editing.
--
-- Auth: Supabase Auth (email magic link). RLS restricts every row to its owner
-- via auth.uid(); the publishable key alone grants nothing without a session.

create table if not exists public.training_sessions (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,          -- client-generated session id (immutable)
  data       jsonb not null,         -- the full session record
  ended_at   timestamptz,            -- session.endedAt, for ordering/debug
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists training_sessions_user_ended
  on public.training_sessions (user_id, ended_at);

alter table public.training_sessions enable row level security;
drop policy if exists training_sessions_owner on public.training_sessions;
create policy training_sessions_owner on public.training_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.user_fingerings (
  user_id    uuid not null references auth.users (id) on delete cascade,
  score_url  text not null,
  fingerings jsonb not null,
  updated_at bigint not null,        -- client updatedAt (epoch ms) for last-write-wins
  primary key (user_id, score_url)
);

alter table public.user_fingerings enable row level security;
drop policy if exists user_fingerings_owner on public.user_fingerings;
create policy user_fingerings_owner on public.user_fingerings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
