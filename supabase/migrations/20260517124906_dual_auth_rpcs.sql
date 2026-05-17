-- dual_auth_rpcs
--
-- Replaces the read-modify-write pattern in src/lib/rooms.ts (claimGuestSlot,
-- renamePlayer) with stored procedures that hold a row lock for the
-- duration and surgically update only the relevant jsonb path via
-- jsonb_set. Without this, a concurrent host write to `state` could be
-- clobbered when the guest's join or rename routine writes its
-- pre-modified-state read back in full.
--
-- Both functions are `security definer` with a pinned search_path — the
-- Supabase advisor "function_search_path_mutable" check requires this on
-- definer functions touching `public.*`. EXECUTE is revoked from public;
-- only the secret-key admin client (which bypasses these grants) calls
-- them via supabase.rpc().

-- ---------------------------------------------------------------------------
-- claim_guest_slot
-- ---------------------------------------------------------------------------
-- Atomically claim the guest slot for a clientId. Idempotent on the caller's
-- side: re-calling with the same clientId returns the current state without
-- mutation. Returns jsonb of shape:
--   { ok: true, role: 'host' | 'guest', state: <state jsonb> }
--   { ok: false, reason: 'not_found' | 'occupied' }
-- ---------------------------------------------------------------------------

create or replace function public.claim_guest_slot(
  p_code text,
  p_client_id text,
  p_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room   public.rooms%rowtype;
  v_state  jsonb;
begin
  -- Row lock for the duration of the function — serializes concurrent
  -- claim_guest_slot calls and any updates from the host's /state route
  -- so we never overwrite a fresher state value.
  select * into v_room
  from public.rooms
  where code = p_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_room.host_id = p_client_id then
    return jsonb_build_object('ok', true, 'role', 'host', 'state', v_room.state);
  end if;

  if v_room.guest_id = p_client_id then
    return jsonb_build_object('ok', true, 'role', 'guest', 'state', v_room.state);
  end if;

  if v_room.guest_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'occupied');
  end if;

  v_state := jsonb_set(
    v_room.state,
    '{players,guest}',
    jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), 'guest'))
  );

  update public.rooms
  set guest_id = p_client_id,
      state    = v_state
  where id = v_room.id;

  return jsonb_build_object('ok', true, 'role', 'guest', 'state', v_state);
end;
$$;

revoke execute on function public.claim_guest_slot(text, text, text) from public;

comment on function public.claim_guest_slot(text, text, text) is
  'Atomically claim the guest slot for clientId, setting state.players.guest. '
  'Race-safe via SELECT FOR UPDATE + surgical jsonb_set.';

-- ---------------------------------------------------------------------------
-- rename_player
-- ---------------------------------------------------------------------------
-- Rename the caller's own player slot. Server-resolves role from clientId vs
-- host_id / guest_id. Returns jsonb of shape:
--   { ok: true, state: <state jsonb> }
--   { ok: false, reason: 'not_found' | 'forbidden' }
-- ---------------------------------------------------------------------------

create or replace function public.rename_player(
  p_code text,
  p_client_id text,
  p_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room      public.rooms%rowtype;
  v_role      text;
  v_path      text[];
  v_trimmed   text;
  v_state     jsonb;
begin
  v_trimmed := nullif(trim(p_name), '');
  if v_trimmed is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  v_trimmed := left(v_trimmed, 32);

  select * into v_room
  from public.rooms
  where code = p_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_room.host_id = p_client_id then
    v_role := 'host';
  elsif v_room.guest_id = p_client_id then
    v_role := 'guest';
  else
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_path := array['players', v_role];

  v_state := jsonb_set(
    v_room.state,
    v_path,
    jsonb_build_object('name', v_trimmed)
  );

  update public.rooms
  set state = v_state
  where id = v_room.id;

  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

revoke execute on function public.rename_player(text, text, text) from public;

comment on function public.rename_player(text, text, text) is
  'Rename the caller''s own slot in state.players. Race-safe via SELECT '
  'FOR UPDATE + surgical jsonb_set.';
