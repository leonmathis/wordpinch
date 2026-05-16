-- wordpinch_rooms
-- One row per game room. State (phase, scores, used words, settings) lives in `state` jsonb.
-- Clients only ever SELECT (via publishable key). All writes go through Next.js route
-- handlers using the secret key, which bypasses RLS.

create table public.rooms (
  id         uuid        primary key default gen_random_uuid(),
  code       text        not null unique check (code ~ '^[A-HJ-NP-Z2-9]{4}$'),
  host_id    text        not null,
  state      jsonb       not null,
  language   text        not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rooms is
  'One game room per row. Code is the access token (4 chars, unambiguous alphabet). '
  'Clients read via publishable key (RLS allows SELECT); all writes server-side via secret key.';

comment on column public.rooms.code is
  'Public 4-char room code drawn from [A-HJ-NP-Z2-9] (excludes I, O, 0, 1 for legibility).';

comment on column public.rooms.host_id is
  'Client-generated UUID of the host. Validated server-side before any state mutation.';

comment on column public.rooms.state is
  'Full GameState (matches GameCtx in src/lib/game/types.ts).';

-- Indexes
create index rooms_updated_at_idx on public.rooms (updated_at);

-- Touch updated_at on every UPDATE
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger rooms_touch_updated_at
  before update on public.rooms
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.rooms enable row level security;

-- Anyone holding the code can read the room. The code IS the access token.
create policy "rooms readable by anon + authenticated"
  on public.rooms
  for select
  to anon, authenticated
  using (true);

-- No INSERT / UPDATE / DELETE policies for anon/authenticated.
-- All mutations go through Next.js route handlers using the SUPABASE_SECRET_KEY,
-- which bypasses RLS entirely.
