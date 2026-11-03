-- Realtime voice calls (Driving Mode "Start call"): one row per call, so the
-- per-call and per-day minute caps are enforced from a record the server owns
-- rather than from anything the browser reports.
--
-- The caps (5 minutes a call, 15 a day) are cost controls on a metered model.
-- A call's audio flows browser <-> OpenAI directly, so the server never sees
-- it; the only server-side signal is when the call was started and when it was
-- ended. Both are therefore written here by the server (started_at defaults to
-- now(); ended_at only through the functions below), and the client has no way
-- to under-report: it cannot update or delete a row.

create table public.voice_realtime_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text check (ended_reason in ('user', 'cap', 'idle', 'hidden', 'error', 'superseded')),
  -- A call is either open (no end, no reason) or closed with both.
  constraint voice_realtime_calls_end_consistent check ((ended_at is null) = (ended_reason is null))
);

-- Backs the daily-budget query (a user's calls since local midnight).
create index voice_realtime_calls_user_id_started_at_idx
  on public.voice_realtime_calls (user_id, started_at);

alter table public.voice_realtime_calls enable row level security;

-- select/insert only, like voice_speak_requests (0011): a caller reads and
-- appends their own rows and can never rewrite or remove one.
create policy voice_realtime_calls_select on public.voice_realtime_calls
  for select using ((select auth.uid()) = user_id);
create policy voice_realtime_calls_insert on public.voice_realtime_calls
  for insert with check ((select auth.uid()) = user_id);
revoke update, delete on public.voice_realtime_calls from anon, authenticated;

-- Ends one of the caller's open calls. SECURITY DEFINER because the table has
-- no update policy by design. The end time is capped at started_at + 300
-- seconds, so even a client that reports the end of a call late (or never,
-- then reports it on the next launch) cannot make a call look longer than the
-- cap -- and never shorter than it really was either: it is the server clock,
-- not a client-supplied time. 300 must match REALTIME_MAX_CALL_SECONDS in
-- src/lib/voice/realtime/constants.ts (a unit test reads this file to check).
--
-- Returns the recorded end time, or null when there was nothing to end (not
-- the caller's, unknown, or already ended) -- a repeat call is harmless.
create function public.end_voice_realtime_call(p_call_id uuid, p_reason text default 'user')
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ended_at timestamptz;
begin
  update public.voice_realtime_calls
  set ended_at = least(now(), started_at + interval '300 seconds'),
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

-- Closes every call the caller still has open, as 'superseded'. Run when a new
-- call starts: an app that was killed mid-call never reported its end, and that
-- stale row would otherwise sit open and count against the day.
create function public.close_open_voice_realtime_calls()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.voice_realtime_calls
  set ended_at = least(now(), started_at + interval '300 seconds'),
      ended_reason = 'superseded'
  where user_id = (select auth.uid())
    and ended_at is null;
end;
$$;

revoke execute on function public.close_open_voice_realtime_calls() from public, anon;
grant execute on function public.close_open_voice_realtime_calls() to authenticated;
