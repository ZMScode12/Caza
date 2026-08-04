-- ============================================================
--  CAZA — games + food match (run this AFTER the main schema)
--  Supabase -> SQL Editor -> New query -> paste -> Run
-- ============================================================

-- one row per pair holds all "play" state (both games + the food list)
-- as a single JSON blob, same simple pattern as the coloring table.
create table public.play (
  pair_id    uuid primary key references public.pairs(id) on delete cascade,
  data       jsonb not null default '{"ttt":null,"dots":null,"food":{"items":[],"votes":{},"match":null}}',
  updated_at timestamptz not null default now()
);

alter table public.play enable row level security;

create policy "read pair play"   on public.play for select using (is_my_pair(pair_id));
create policy "insert pair play" on public.play for insert with check (is_my_pair(pair_id));
create policy "update pair play" on public.play for update using (is_my_pair(pair_id));

alter publication supabase_realtime add table public.play;

-- also make sure a play row exists for pairs that already paired before this table existed
insert into public.play(pair_id)
  select id from public.pairs where user_b is not null
  on conflict (pair_id) do nothing;

-- ============================================================
--  Done. "Success. No rows returned."
-- ============================================================
