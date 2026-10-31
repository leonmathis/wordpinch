-- collected_words
--
-- F2 collection: every word a player has won, or bookmarked on a round
-- result, lands on their anonymous account (F1) with its meaning.
--
-- Writes are server-only: the round resolver records won words and
-- POST /api/rooms/[code]/save-word records bookmarks, both through
-- collect_word() with the secret-key admin client. The user id always
-- comes from a room seat or a verified session, never from a body.
-- Players read their own rows through RLS (GET /api/collection runs with
-- the caller's session).
--
-- One row per player and word. Winning a word that was only saved turns
-- the row into a win; saving a word already won changes nothing.

create table public.collected_words (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  word        text        not null check (word ~ '^[a-z]{1,50}$'),
  definitions jsonb       not null default '[]'::jsonb,
  source      text        not null check (source in ('won', 'saved')),
  -- The other player's display name: "vs Juno" for a win, "saved from
  -- Juno" for a bookmark of their word.
  opponent    text        check (char_length(opponent) <= 32),
  -- Race time from the letters to the submission; wins only.
  time_ms     integer     check (time_ms >= 0),
  room_code   text        check (room_code ~ '^[A-HJ-NP-Z2-9]{4}$'),
  created_at  timestamptz not null default now(),
  primary key (user_id, word)
);

comment on table public.collected_words is
  'F2: words a player won or bookmarked. Written only by the server '
  '(collect_word); each player reads their own rows via RLS.';

-- The match-end banner counts this match's new words per room.
create index collected_words_room_idx
  on public.collected_words (user_id, room_code, created_at);

alter table public.collected_words enable row level security;

create policy "Players read their own words"
  on public.collected_words
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.collected_words from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on public.collected_words from authenticated;
grant select on public.collected_words to authenticated;

create or replace function public.collect_word(
  p_user_id     uuid,
  p_word        text,
  p_definitions jsonb,
  p_source      text,
  p_opponent    text,
  p_time_ms     integer,
  p_room_code   text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted boolean;
begin
  insert into public.collected_words as c
    (user_id, word, definitions, source, opponent, time_ms, room_code)
  values
    (p_user_id, lower(p_word), coalesce(p_definitions, '[]'::jsonb), p_source,
     left(p_opponent, 32), p_time_ms, p_room_code)
  on conflict (user_id, word) do update set
    -- A win replaces a bookmark; a bookmark never downgrades a win.
    source = case when excluded.source = 'won' then 'won' else c.source end,
    -- The fastest win is the one worth showing.
    time_ms = case
      when excluded.source <> 'won' then c.time_ms
      when c.source <> 'won' or c.time_ms is null then excluded.time_ms
      else least(c.time_ms, coalesce(excluded.time_ms, c.time_ms))
    end,
    opponent = case
      when excluded.source = 'won' and c.source <> 'won' then excluded.opponent
      else c.opponent
    end,
    definitions = case
      when jsonb_array_length(c.definitions) = 0 then excluded.definitions
      else c.definitions
    end
  returning (xmax = 0) into v_inserted;
  return v_inserted;
end;
$$;

revoke execute on function public.collect_word(uuid, text, jsonb, text, text, integer, text) from public;
revoke execute on function public.collect_word(uuid, text, jsonb, text, text, integer, text) from anon, authenticated;
grant execute on function public.collect_word(uuid, text, jsonb, text, text, integer, text) to service_role;

comment on function public.collect_word(uuid, text, jsonb, text, text, integer, text) is
  'Add a won or saved word to a player''s collection. Server-only (secret '
  'key). Returns true when the word is new to the collection.';
