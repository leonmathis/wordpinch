-- revoke_rls_auto_enable_from_public
--
-- Follow-up to harden_functions: that migration revoked EXECUTE on
-- public.rls_auto_enable from anon and authenticated, but the function
-- also has GRANT EXECUTE ... TO PUBLIC (visible in pg_proc.proacl as
-- "=X/postgres"), which implicitly includes both roles. The role-specific
-- REVOKEs were no-ops as long as the PUBLIC grant existed.
--
-- This removes the PUBLIC grant. service_role retains EXECUTE because
-- Supabase manages the auto-RLS trigger using it.

revoke execute on function public.rls_auto_enable() from public;
