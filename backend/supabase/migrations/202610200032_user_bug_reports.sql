create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  report text not null check (char_length(report) between 1 and 5000),
  created_at timestamptz not null default clock_timestamp()
);

alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from public, anon, authenticated, service_role;
grant insert on public.bug_reports to service_role;
drop policy if exists xzones_bug_reports_insert_service on public.bug_reports;
create policy xzones_bug_reports_insert_service on public.bug_reports
  for insert to service_role with check (char_length(report) between 1 and 5000);

create or replace function public.xzones_submit_bug_report(
  p_bucket_key bytea,
  p_report text,
  p_max_characters integer,
  p_window_seconds integer,
  p_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_report is null or char_length(btrim(p_report)) not between 1 and p_max_characters
    or p_max_characters < 1 or p_max_characters > 5000
    or p_window_seconds < 60 or p_window_seconds > 86_400
    or p_limit < 1 or p_limit > 10 then
    return jsonb_build_object('error', 'INVALID_INPUT');
  end if;
  if not public.xzones_consume_rate_limit(p_bucket_key, 'bug_report', p_window_seconds, p_limit) then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;
  insert into public.bug_reports(report) values (btrim(p_report));
  return jsonb_build_object('accepted', true);
end;
$$;

revoke all on function public.xzones_submit_bug_report(bytea, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.xzones_submit_bug_report(bytea, text, integer, integer, integer) to service_role;
