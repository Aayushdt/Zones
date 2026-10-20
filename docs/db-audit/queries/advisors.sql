-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db-audit/queries/advisors.sql
-- Catalog only. Non-empty result sets require review; they are not findings by themselves.
\pset pager off
\echo 'TABLES WITHOUT RLS'
SELECT n.nspname AS schema_name, c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p') AND n.nspname = 'public' AND NOT c.relrowsecurity ORDER BY 1, 2;
\echo 'SECURITY DEFINER FUNCTIONS WITHOUT PINNED SEARCH PATH'
SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%') ORDER BY 1, 2, 3;
\echo 'PUBLIC OR ANON EXECUTE GRANTS'
SELECT routine_schema, routine_name, specific_name, grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_schema = 'public' AND grantee IN ('PUBLIC', 'anon', 'authenticated') ORDER BY 1, 2, 3, 4;
\echo 'FOREIGN KEYS WITHOUT A MATCHING LEADING INDEX'
SELECT con.conrelid::regclass AS table_name, con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con WHERE con.contype = 'f' AND NOT EXISTS (SELECT 1 FROM pg_index idx WHERE idx.indrelid = con.conrelid AND idx.indisvalid AND (idx.indkey::smallint[])[0:array_length(con.conkey, 1) - 1] = con.conkey) ORDER BY 1, 2;
