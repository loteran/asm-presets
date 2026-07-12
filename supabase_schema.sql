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


-- =============================================================
-- ASM Themes — theme sharing (feature/theme-sharing)
-- Mirrors the presets / votes / toggle_vote pattern above, but for
-- shareable UI color themes (arctis-asm://import-theme deep links).
-- Does not touch the presets/votes tables above.
--
-- Written to be safely re-runnable: paste the whole file again in
-- the Supabase SQL Editor any time without erroring or duplicating.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────

create table if not exists public.themes (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  colors        jsonb       not null default '{}',
  link          text        not null,
  author_id     uuid,
  author_name   text        not null default 'Anonymous',
  author_avatar text        not null default '',
  created_at    timestamptz not null default now(),
  official      boolean     not null default false,
  vote_count    int         not null default 0
);

create index if not exists idx_themes_vote_count on public.themes (vote_count desc);
create index if not exists idx_themes_created_at  on public.themes (created_at desc);
create index if not exists idx_themes_author_id   on public.themes (author_id);


create table if not exists public.theme_votes (
  user_id    uuid        not null,
  theme_id   uuid        not null references public.themes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, theme_id)
);

create index if not exists idx_theme_votes_theme_id on public.theme_votes (theme_id);
create index if not exists idx_theme_votes_user_id  on public.theme_votes (user_id);


-- ─────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

alter table public.themes      enable row level security;
alter table public.theme_votes enable row level security;

-- Themes: anyone can read; only authenticated users can insert their own
drop policy if exists "read_themes" on public.themes;
create policy "read_themes"
  on public.themes
  for select
  using (true);

drop policy if exists "insert_themes" on public.themes;
create policy "insert_themes"
  on public.themes
  for insert
  with check (auth.uid() is not null and auth.uid() = author_id);

drop policy if exists "delete_own_themes" on public.themes;
create policy "delete_own_themes"
  on public.themes
  for delete
  using (auth.uid() = author_id);

-- Theme votes: anyone can read; authenticated users manage their own rows
drop policy if exists "read_theme_votes" on public.theme_votes;
create policy "read_theme_votes"
  on public.theme_votes
  for select
  using (true);

drop policy if exists "insert_theme_votes" on public.theme_votes;
create policy "insert_theme_votes"
  on public.theme_votes
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "delete_theme_votes" on public.theme_votes;
create policy "delete_theme_votes"
  on public.theme_votes
  for delete
  using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- TOGGLE THEME VOTE FUNCTION
-- Uses SECURITY DEFINER so the vote_count update bypasses RLS
-- on the themes table (users cannot directly update that row).
-- ─────────────────────────────────────────────────────────────

create or replace function public.toggle_theme_vote(p_theme_id uuid)
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
    from public.theme_votes
    where user_id = v_uid
      and theme_id = p_theme_id
  ) into v_voted;

  if v_voted then
    -- Remove vote
    delete from public.theme_votes
    where user_id = v_uid
      and theme_id = p_theme_id;

    update public.themes
      set vote_count = greatest(0, vote_count - 1)
    where id = p_theme_id
    returning vote_count into v_count;

    return json_build_object('voted', false, 'vote_count', v_count);
  else
    -- Add vote
    insert into public.theme_votes (user_id, theme_id)
    values (v_uid, p_theme_id);

    update public.themes
      set vote_count = vote_count + 1
    where id = p_theme_id
    returning vote_count into v_count;

    return json_build_object('voted', true, 'vote_count', v_count);
  end if;
end;
$$;

-- Revoke direct execution from anon/public; grant only to authenticated users
revoke execute on function public.toggle_theme_vote(uuid) from public, anon;
grant  execute on function public.toggle_theme_vote(uuid) to authenticated;


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
