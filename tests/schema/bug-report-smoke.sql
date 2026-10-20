begin;
do $$
declare
  result jsonb;
  bucket bytea := decode(repeat('ab', 32), 'hex');
begin
  result := public.xzones_submit_bug_report(bucket, 'The map froze', 2000, 3600, 1);
  if result->>'accepted' <> 'true' then raise exception 'valid report rejected: %', result; end if;
  result := public.xzones_submit_bug_report(bucket, 'Another report', 2000, 3600, 1);
  if result->>'error' <> 'RATE_LIMITED' then raise exception 'rate limit missing: %', result; end if;
  result := public.xzones_submit_bug_report(decode(repeat('cd', 32), 'hex'), ' ', 2000, 3600, 1);
  if result->>'error' <> 'INVALID_INPUT' then raise exception 'blank report accepted: %', result; end if;
  if has_table_privilege('service_role', 'public.bug_reports', 'SELECT')
    or has_table_privilege('service_role', 'public.bug_reports', 'UPDATE')
    or has_table_privilege('service_role', 'public.bug_reports', 'DELETE')
    or not has_table_privilege('service_role', 'public.bug_reports', 'INSERT') then
    raise exception 'bug report table privileges are not insert-only';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='bug_reports' and column_name in ('auth_user_id','player_id','metadata','coordinates')) then
    raise exception 'bug report table stores unintended identifiers or metadata';
  end if;
end;
$$;
rollback;
