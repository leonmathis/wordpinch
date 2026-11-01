-- daily_pinch
--
-- F6 daily pinch: the same two letters for everyone each (UTC) day, one
-- try per player, timed from the moment the letters appear.
--
--   * daily_puzzles: one row per day, created by the server the first time
--     someone asks for that day (letters picked deterministically from the
--     date, among pairs with enough valid words).
--   * daily_attempts: one row per player and day. `started_at` is set by
--     the server when it reveals the letters, `finished_at` and `time_ms`
--     when it accepts a word, so the time can't be shortened by reading
--     the letters first or by a forged client clock.
--
-- Both are server-only: no client policies, RLS on, grants revoked. The
-- leaderboard and the player's own result go out through route handlers.

create table public.daily_puzzles (
  day          date     primary key,
  number       integer  not null unique check (number > 0),
  start_letter text     not null check (start_letter ~ '^[A-Z]$'),
  end_letter   text     not null check (end_letter ~ '^[A-Z]$'),
  min_length   integer  not null check (min_length between 3 and 8),
  created_at   timestamptz not null default now()
);

create table public.daily_attempts (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null references public.daily_puzzles (day) on delete cascade,
  name        text        not null check (char_length(name) between 1 and 32),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  word        text        check (word ~ '^[a-z]{1,50}$'),
  time_ms     integer     check (time_ms >= 0),
  primary key (user_id, day),
  check ((finished_at is null) = (time_ms is null) and (time_ms is null) = (word is null))
);

-- Today's board: the fastest finished attempts of a day.
create index daily_attempts_board_idx
  on public.daily_attempts (day, time_ms)
  where time_ms is not null;

alter table public.daily_puzzles enable row level security;
alter table public.daily_attempts enable row level security;
revoke all on public.daily_puzzles from anon, authenticated, public;
revoke all on public.daily_attempts from anon, authenticated, public;

comment on table public.daily_puzzles is
  'F6: the letters of each day''s pinch. Server-only (secret key).';
comment on table public.daily_attempts is
  'F6: one try per player and day; the server stamps start and finish. Server-only.';

-- Daily words show in the collection as "Daily pinch #128 · 6.8 s".
alter table public.collected_words
  add column daily_number integer check (daily_number > 0);

-- collect_word gains the daily number; the old signature goes so the
-- server can't call a version that drops it.
drop function if exists public.collect_word(uuid, text, jsonb, text, text, integer, text);

create or replace function public.collect_word(
  p_user_id      uuid,
  p_word         text,
  p_definitions  jsonb,
  p_source       text,
  p_opponent     text,
  p_time_ms      integer,
  p_room_code    text,
  p_daily_number integer default null
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted boolean;
begin
  insert into public.collected_words as c
    (user_id, word, definitions, source, opponent, time_ms, room_code, daily_number)
  values
    (p_user_id, lower(p_word), coalesce(p_definitions, '[]'::jsonb), p_source,
     left(p_opponent, 32), p_time_ms, p_room_code, p_daily_number)
  on conflict (user_id, word) do update set
    -- A win replaces a bookmark; a bookmark never downgrades a win.
    source = case when excluded.source = 'won' then 'won' else c.source end,
    -- The fastest win is the one worth showing, with where it came from.
    time_ms = case
      when excluded.source <> 'won' then c.time_ms
      when c.source <> 'won' or c.time_ms is null then excluded.time_ms
      else least(c.time_ms, coalesce(excluded.time_ms, c.time_ms))
    end,
    opponent = case
      when excluded.source = 'won' and (c.source <> 'won' or c.time_ms is null or excluded.time_ms < c.time_ms)
        then excluded.opponent
      else c.opponent
    end,
    daily_number = case
      when excluded.source = 'won' and (c.source <> 'won' or c.time_ms is null or excluded.time_ms < c.time_ms)
        then excluded.daily_number
      else c.daily_number
    end,
    definitions = case
      when jsonb_array_length(c.definitions) = 0 then excluded.definitions
      else c.definitions
    end
  returning (xmax = 0) into v_inserted;
  return v_inserted;
end;
$$;

revoke execute on function public.collect_word(uuid, text, jsonb, text, text, integer, text, integer) from public;
revoke execute on function public.collect_word(uuid, text, jsonb, text, text, integer, text, integer) from anon, authenticated;
grant execute on function public.collect_word(uuid, text, jsonb, text, text, integer, text, integer) to service_role;
