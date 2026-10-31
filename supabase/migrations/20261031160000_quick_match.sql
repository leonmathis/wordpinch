-- quick_match
--
-- F7 quick match: players wait in a queue and the server pairs the first
-- two into a fresh room with the fixed quick-match rules (decision 4).
--
-- match_queue holds one row per waiting (or just matched) player.
-- quick_match_pair() does the pairing in one transaction: it takes the
-- oldest other waiting player with FOR UPDATE SKIP LOCKED, so two people
-- joining at once can't both grab the same partner, creates the room and
-- marks both rows. Rows older than 75 s without a match are dropped, so a
-- closed tab doesn't get paired with the next visitor.
--
-- Server-only: called by /api/quick with the secret key; no client policies.

create table public.match_queue (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  name         text        not null check (char_length(name) between 1 and 32),
  joined_at    timestamptz not null default now(),
  matched_room text        references public.rooms (code) on delete set null,
  matched_at   timestamptz
);

create index match_queue_waiting_idx on public.match_queue (joined_at) where matched_room is null;

alter table public.match_queue enable row level security;
revoke all on public.match_queue from anon, authenticated, public;

comment on table public.match_queue is
  'F7: players waiting for a quick match, and who they were paired with. Server-only.';

create or replace function public.quick_match_pair(
  p_user_id uuid,
  p_name    text,
  p_code    text,
  p_state   jsonb
) returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_other public.match_queue%rowtype;
  v_state jsonb;
begin
  delete from public.match_queue
  where matched_room is null and joined_at < now() - interval '75 seconds';

  select * into v_other
  from public.match_queue
  where matched_room is null and user_id <> p_user_id
  order by joined_at
  limit 1
  for update skip locked;

  if not found then
    insert into public.match_queue (user_id, name, joined_at)
    values (p_user_id, left(p_name, 32), now())
    on conflict (user_id) do update
      set name = excluded.name, joined_at = now(), matched_room = null, matched_at = null;
    return null;
  end if;

  -- The one who waited longer hosts.
  v_state := jsonb_set(
    jsonb_set(p_state, '{players,host}', jsonb_build_object('name', v_other.name)),
    '{players,guest}', jsonb_build_object('name', left(p_name, 32))
  );
  insert into public.rooms (code, host_id, guest_id, state)
  values (p_code, v_other.user_id::text, p_user_id::text, v_state);

  update public.match_queue set matched_room = p_code, matched_at = now() where user_id = v_other.user_id;
  insert into public.match_queue (user_id, name, joined_at, matched_room, matched_at)
  values (p_user_id, left(p_name, 32), now(), p_code, now())
  on conflict (user_id) do update
    set name = excluded.name, matched_room = p_code, matched_at = now();
  return p_code;
end;
$$;

revoke execute on function public.quick_match_pair(uuid, text, text, jsonb) from public;
revoke execute on function public.quick_match_pair(uuid, text, text, jsonb) from anon, authenticated;
grant execute on function public.quick_match_pair(uuid, text, text, jsonb) to service_role;

comment on function public.quick_match_pair(uuid, text, text, jsonb) is
  'F7: pair the caller with the oldest waiting player into room p_code, or queue them. '
  'Returns the room code when paired, null while waiting. Server-only.';
