-- harden_functions
--
-- Address three WARN findings from `supabase db advisors`:
--
-- 1. function_search_path_mutable / public.touch_updated_at
--    The trigger function had a mutable search_path, which is a known
--    schema-resolution attack vector. Pin search_path = '' and qualify
--    `now()` with its schema.
--
-- 2-3. {anon,authenticated}_security_definer_function_executable /
--      public.rls_auto_enable
--    The auto-RLS helper Supabase installs when you enable "Automatic RLS"
--    at project creation is SECURITY DEFINER and reachable via /rest/v1/rpc.
--    It is only ever called from a DDL event trigger; clients have no
--    reason to call it directly. Revoking EXECUTE from the public-facing
--    roles closes the RPC path without affecting the trigger.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
