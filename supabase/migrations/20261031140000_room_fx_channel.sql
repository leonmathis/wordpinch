-- room_fx_channel
--
-- F3 reactions, cheers and the opponent's letter count. These travel on
-- their own private Realtime topic, `fx:<CODE>`, next to the room's state
-- topic `room:<CODE>`:
--
--   * `room:` stays server-only for broadcasts (clients may only track
--     presence there), so nobody can forge a game state.
--   * Presence can't carry them: Realtime allows a client 5 presence
--     events per 30 s, and the letter count changes several times a second.
--
-- On `fx:` any connected client may broadcast. Everything sent there is
-- cosmetic and checked by the receiver: a reaction is an id from a fixed
-- list (never free text) and the letter count is a small integer (never
-- the letters). The worst a forged message can do is show a wrong bubble.

drop policy if exists "wordpinch_realtime_receive_fx" on realtime.messages;
drop policy if exists "wordpinch_realtime_send_fx" on realtime.messages;

create policy "wordpinch_realtime_receive_fx"
on realtime.messages
for select
to anon, authenticated
using ( realtime.topic() like 'fx:%' );

create policy "wordpinch_realtime_send_fx"
on realtime.messages
for insert
to anon, authenticated
with check (
  realtime.topic() like 'fx:%'
  and extension = 'broadcast'
);
