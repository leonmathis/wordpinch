-- harden_rooms_rls
--
-- Drop the broad public SELECT policy. The original policy allowed any
-- `anon` / `authenticated` caller to read every column of `rooms`,
-- including the `host_id` UUID which we use as a bearer token to authorize
-- POST /api/rooms/[code]/state mutations.
--
-- After this migration, clients no longer read `rooms` directly via the
-- publishable-key Supabase client. All reads go through Next.js route
-- handlers using the secret-key admin client, which redacts `host_id`.
-- Realtime channel subscriptions (Phase 4) are governed by a separate
-- permission system and are unaffected.

drop policy if exists "rooms readable by anon + authenticated" on public.rooms;

-- RLS remains enabled. With no policies, anon/authenticated get neither
-- SELECT nor INSERT/UPDATE/DELETE. The secret-key admin client still
-- bypasses RLS for server-side writes.
