-- Realtime voice calls: raise the per-call cap from 5 minutes (300 s) to 10
-- minutes (600 s). Supersedes the 300 in 0058_voice_realtime_calls.sql.
--
-- Both functions clamp the recorded end of a call to started_at + the cap, so
-- a client that reports a call's end late (or never) cannot make it look
-- longer than the cap. The cap must match REALTIME_MAX_CALL_SECONDS in
-- src/lib/voice/realtime/constants.ts (a unit test reads the newest migration
-- that defines these functions to check). The per-day budget (20 minutes) is
-- enforced in application code from these rows and needs no schema change.
--
-- Deploy order: apply this BEFORE the code that allows 10-minute calls. If the
-- code shipped first, the database would still clamp a long call's recorded end
-- at 5 minutes and under-count the day's budget.
--
-- Same signatures as 0058, so existing grants carry over; they are repeated so
-- this file stands on its own.

create or replace function public.end_voice_realtime_call(p_call_id uuid, p_reason text default 'user')
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ended_at timestamptz;
begin
  update public.voice_realtime_calls
  set ended_at = least(now(), started_at + interval '600 seconds'),
      ended_reason = p_reason
  where id = p_call_id
    and user_id = (select auth.uid())
    and ended_at is null
  returning ended_at into v_ended_at;
  return v_ended_at;
end;
$$;

revoke execute on function public.end_voice_realtime_call(uuid, text) from public, anon;
grant execute on function public.end_voice_realtime_call(uuid, text) to authenticated;

create or replace function public.close_open_voice_realtime_calls()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.voice_realtime_calls
  set ended_at = least(now(), started_at + interval '600 seconds'),
      ended_reason = 'superseded'
  where user_id = (select auth.uid())
    and ended_at is null;
end;
$$;

revoke execute on function public.close_open_voice_realtime_calls() from public, anon;
grant execute on function public.close_open_voice_realtime_calls() to authenticated;
