begin;

do $$
declare
  v_now timestamptz := clock_timestamp();
  v_first jsonb;
  v_second jsonb;
  v_third jsonb;
begin
  v_first := public.xzones_cleanup(v_now);
  v_second := public.xzones_cleanup(v_now + interval '59 seconds');
  v_third := public.xzones_cleanup(v_now + interval '60 seconds');

  if v_first->>'skipped' <> 'false' then raise exception 'first cleanup should run: %', v_first; end if;
  if v_second->>'skipped' <> 'true' or v_second->>'reason' <> 'THROTTLED' then
    raise exception 'cleanup inside 60 seconds should be throttled: %', v_second;
  end if;
  if v_third->>'skipped' <> 'false' then raise exception 'cleanup should run at 60 seconds: %', v_third; end if;
end;
$$;

rollback;
