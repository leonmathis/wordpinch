-- adopt_client_seats
--
-- F1 identity: every player now gets an anonymous Supabase account, and
-- room seats (rooms.host_id / rooms.guest_id) hold that account's id
-- (auth.uid() as text). Before F1 a seat held the browser's localStorage
-- clientId. This function moves a browser's old clientId seats onto its
-- anonymous account in one transaction, so a game in progress survives the
-- switch.
--
-- Called only by POST /api/identity/adopt with the secret-key admin client,
-- after the route has verified the caller's session (p_user_id comes from
-- the verified JWT, never from the request body) and checked that
-- p_client_id is not itself an account id. EXECUTE is revoked from
-- public, anon and authenticated, like claim_guest_slot and rename_player.
--
-- Returns the number of seats moved.

create or replace function public.adopt_client_seats(
  p_client_id text,
  p_user_id text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hosts  integer;
  v_guests integer;
begin
  if p_client_id is null or p_user_id is null or p_client_id = p_user_id then
    return 0;
  end if;

  update public.rooms
  set host_id = p_user_id
  where host_id = p_client_id
    -- rooms_guest_not_host: never seat one account on both sides.
    and guest_id is distinct from p_user_id;
  get diagnostics v_hosts = row_count;

  update public.rooms
  set guest_id = p_user_id
  where guest_id = p_client_id
    and host_id <> p_user_id;
  get diagnostics v_guests = row_count;

  return v_hosts + v_guests;
end;
$$;

revoke execute on function public.adopt_client_seats(text, text) from public;
revoke execute on function public.adopt_client_seats(text, text) from anon, authenticated;

comment on function public.adopt_client_seats(text, text) is
  'Move room seats held by a legacy localStorage clientId onto the caller''s '
  'anonymous account id. Server-only (secret key).';

comment on column public.rooms.host_id is
  'Seat of the host: the anonymous account id (auth.users.id as text), or a '
  'legacy client-generated UUID for browsers that could not sign in. '
  'Validated server-side before any state mutation; never sent to clients.';

comment on column public.rooms.guest_id is
  'Seat of the guest, same format as host_id. Set atomically by '
  'POST /api/rooms/[code]/join.';
