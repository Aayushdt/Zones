-- Test-only shim for running migrations in a vanilla PostgreSQL instance.
-- Do not apply this file to Supabase; Supabase owns these schemas and roles.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema realtime;
create table realtime.messages (id bigint generated always as identity, extension text);
create function realtime.topic() returns text
language sql stable
as $$ select current_setting('request.realtime.topic', true) $$;
