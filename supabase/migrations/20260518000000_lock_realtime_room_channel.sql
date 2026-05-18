-- lock_realtime_room_channel
--
-- Background: prior to this migration, the browser opened the room channel
-- (`room:<CODE>`) without `private: true` and no policies existed on
-- `realtime.messages`. Any party with the 4-char room code (a co-player or
-- a spectator) could connect with the publishable key and `.send()` a
-- forged 'state' broadcast that other clients piped straight into setState,
-- producing fake match-end screens, fake scores, or unsolicited phase
-- transitions until the next legitimate server broadcast overwrote it.
-- Server DB state remained canonical, so the impact was mid-match visual
-- corruption rather than persistent damage.
--
-- Fix: the browser now sets `config.private: true` on the channel, which
-- enforces RLS on `realtime.messages`. The policies below allow anon /
-- authenticated clients to receive room broadcasts and track their own
-- presence, but do NOT grant INSERT for broadcast messages. The server
-- publisher hits the HTTP Broadcast API with `SUPABASE_SECRET_KEY`
-- (service_role), which bypasses RLS and remains unaffected.

-- Idempotent re-apply.
drop policy if exists "wordpinch_realtime_receive_room" on realtime.messages;
drop policy if exists "wordpinch_realtime_track_presence_room" on realtime.messages;

-- Receive (subscribe to broadcast events and read presence sync) for any
-- room channel.
create policy "wordpinch_realtime_receive_room"
on realtime.messages
for select
to anon, authenticated
using ( realtime.topic() like 'room:%' );

-- Allow `channel.track(...)` for presence on room channels only. The
-- `extension = 'presence'` predicate excludes broadcast inserts, so
-- forged 'state' broadcasts from a publishable-key client are denied.
create policy "wordpinch_realtime_track_presence_room"
on realtime.messages
for insert
to anon, authenticated
with check (
  realtime.topic() like 'room:%'
  and extension = 'presence'
);
