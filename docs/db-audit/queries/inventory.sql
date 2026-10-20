-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db-audit/queries/inventory.sql
-- Catalog only: this script does not read application rows.
\pset pager off
\echo 'TABLES AND RLS'
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2;
\echo 'POLICIES'
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual IS NOT NULL AS has_using, with_check IS NOT NULL AS has_with_check
FROM pg_policies ORDER BY 1, 2, 3;
\echo 'FUNCTIONS'
SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments, p.prosecdef AS security_definer, p.provolatile AS volatility, COALESCE(array_to_string(p.proconfig, ', '), '') AS settings
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2, 3;
\echo 'TRIGGERS'
SELECT event_object_schema AS schema_name, event_object_table AS table_name, trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers WHERE event_object_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2, 3, 4;
\echo 'PUBLICATIONS'
SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate FROM pg_publication ORDER BY 1;
\echo 'PUBLICATION TABLES'
SELECT pubname, schemaname, tablename FROM pg_publication_tables ORDER BY 1, 2, 3;
