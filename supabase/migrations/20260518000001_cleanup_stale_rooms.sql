-- cleanup_stale_rooms
--
-- Schedule a daily delete of inactive rooms.
--
-- Without this, `public.rooms` grows monotonically: every POST /api/rooms
-- creates a row that lives forever. On the Supabase free plan the 500 MB
-- DB cap is distant, but the 4-char code namespace (~1.05M codes) and the
-- collision retry budget in `createRoom` become the practical bottleneck
-- well before that — especially if the unrate-limited room creation
-- endpoint were ever abused.
--
-- Threshold: 24 hours since the last write (`updated_at`). The trigger on
-- `rooms` already touches `updated_at` on every state mutation, so any
-- room with players still interacting stays alive; only abandoned games
-- get reaped. The `rooms_updated_at_idx` from the initial migration keeps
-- the delete cheap.

create extension if not exists pg_cron;

-- `cron.schedule(name, ...)` upserts by name — calling it again with the
-- same job name replaces the existing schedule. Idempotent without any
-- prior unschedule, which keeps the migration cleanly re-runnable and
-- avoids the `delete from cron.job` permission-denied path on Supabase.
select cron.schedule(
  'wordpinch-cleanup-stale-rooms',
  '0 3 * * *', -- 03:00 UTC daily
  $$ delete from public.rooms where updated_at < now() - interval '24 hours' $$
);
