-- ============================================================
--  CAZA — push notifications (run AFTER the main + play schemas)
--  Supabase -> SQL Editor -> New query -> paste -> Run
-- ============================================================

-- one row per device a user has enabled notifications on
create table public.push_subs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,          -- the browser's push address
  p256dh     text not null,                 -- encryption keys the browser gives us
  auth       text not null,
  created_at timestamptz not null default now()
);
create index push_subs_user_idx on public.push_subs(user_id);

alter table public.push_subs enable row level security;

-- a user manages only their own subscriptions
create policy "read own subs"   on public.push_subs for select using (user_id = auth.uid());
create policy "insert own subs" on public.push_subs for insert with check (user_id = auth.uid());
create policy "delete own subs" on public.push_subs for delete using (user_id = auth.uid());

-- helper the Edge Function uses: given a pair + a sender, return the OTHER
-- person's push subscriptions (so we notify the partner, not yourself).
create or replace function public.partner_subs(p_pair uuid, p_sender uuid)
returns table(endpoint text, p256dh text, auth text)
language sql security definer set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.pairs pr
  join public.push_subs s
    on s.user_id = case when pr.user_a = p_sender then pr.user_b else pr.user_a end
  where pr.id = p_pair;
$$;

-- ============================================================
--  Done. "Success. No rows returned."
-- ============================================================
