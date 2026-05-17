-- add_guest_id
--
-- Phase 7 dual-auth: the guest slot needs its own bearer-token column so the
-- guest's clientId can authorize mutations independently of the host. Until
-- now POST /api/rooms/[code]/state was host-only and the guest's letter was
-- randomized server-side; this column unblocks real 2-player play.
--
-- guest_id is nullable: rooms start with no guest. The first claimant via
-- POST /api/rooms/[code]/join sets it. The check constraint prevents the
-- host from also claiming the guest slot (which would let a single client
-- play both sides and skew presence / role logic).

alter table public.rooms
  add column guest_id text;

alter table public.rooms
  add constraint rooms_guest_not_host
  check (guest_id is null or guest_id <> host_id);

comment on column public.rooms.guest_id is
  'Client-generated UUID of the guest. Set atomically by POST /api/rooms/[code]/join '
  'and validated server-side before any guest-driven state mutation.';
