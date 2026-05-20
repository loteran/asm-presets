-- =============================================================
-- ASM Presets — Supabase schema
-- Paste this entire file into the Supabase SQL Editor and run it.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────

create table public.presets (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  game          text        not null default '',
  channel       text        not null default 'Game',
  device        text        not null default '',
  data          jsonb       not null default '{}',
  link          text        not null,
  author_id     uuid,
  author_name   text        not null default 'Anonymous',
  author_avatar text        not null default '',
  created_at    timestamptz not null default now(),
  official      boolean     not null default false,
  vote_count    int         not null default 0,

  constraint channel_values check (channel in ('Game', 'Chat', 'Mic', 'Media'))
);

create index idx_presets_vote_count  on public.presets (vote_count desc);
create index idx_presets_created_at  on public.presets (created_at desc);
create index idx_presets_channel     on public.presets (channel);
create index idx_presets_author_id   on public.presets (author_id);


create table public.votes (
  user_id    uuid        not null,
  preset_id  uuid        not null references public.presets (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, preset_id)
);

create index idx_votes_preset_id on public.votes (preset_id);
create index idx_votes_user_id   on public.votes (user_id);


-- ─────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

alter table public.presets enable row level security;
alter table public.votes   enable row level security;

-- Presets: anyone can read; only authenticated users can insert their own
create policy "read_presets"
  on public.presets
  for select
  using (true);

create policy "insert_presets"
  on public.presets
  for insert
  with check (auth.uid() is not null);

create policy "delete_own_presets"
  on public.presets
  for delete
  using (auth.uid() = author_id);

-- Votes: anyone can read; authenticated users manage their own rows
create policy "read_votes"
  on public.votes
  for select
  using (true);

create policy "insert_votes"
  on public.votes
  for insert
  with check (auth.uid() = user_id);

create policy "delete_votes"
  on public.votes
  for delete
  using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- TOGGLE VOTE FUNCTION
-- Uses SECURITY DEFINER so the vote_count update bypasses RLS
-- on the presets table (users cannot directly update that row).
-- ─────────────────────────────────────────────────────────────

create or replace function public.toggle_vote(p_preset_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid    := auth.uid();
  v_voted boolean;
  v_count int;
begin
  -- Must be authenticated
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Is there an existing vote?
  select exists(
    select 1
    from public.votes
    where user_id = v_uid
      and preset_id = p_preset_id
  ) into v_voted;

  if v_voted then
    -- Remove vote
    delete from public.votes
    where user_id = v_uid
      and preset_id = p_preset_id;

    update public.presets
      set vote_count = greatest(0, vote_count - 1)
    where id = p_preset_id
    returning vote_count into v_count;

    return json_build_object('voted', false, 'vote_count', v_count);
  else
    -- Add vote
    insert into public.votes (user_id, preset_id)
    values (v_uid, p_preset_id);

    update public.presets
      set vote_count = vote_count + 1
    where id = p_preset_id
    returning vote_count into v_count;

    return json_build_object('voted', true, 'vote_count', v_count);
  end if;
end;
$$;

-- Revoke direct execution from anon/public; grant only to authenticated users
revoke execute on function public.toggle_vote(uuid) from public, anon;
grant  execute on function public.toggle_vote(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- OPTIONAL: seed an official sample preset for testing
-- Uncomment and adjust to verify the site works before launch.
-- ─────────────────────────────────────────────────────────────

-- insert into public.presets
--   (name, game, channel, device, data, link, author_name, official, vote_count)
-- values
--   (
--     'Flat Reference',
--     'All games',
--     'Game',
--     'Arctis Nova Pro Wireless',
--     '{"eq": [0,0,0,0,0,0,0,0,0,0]}',
--     'arctis-asm://import?data=eyJlcSI6WzAsMCwwLDAsMCwwLDAsMCwwLDBdfQ',
--     'ASM Team',
--     true,
--     0
--   );
