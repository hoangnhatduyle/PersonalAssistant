-- Observability columns for diagnosing voice-turn misbehavior without
-- needing production server logs: which query_kind/schedule_time_window
-- the intent resolver actually picked (neither was previously persisted
-- anywhere, only resolved_intent's free-text summary), and what error a
-- swallowed transcribe()/resolveIntent() failure carried (previously
-- discarded entirely -- a failed turn left resolved_intent/confidence_score
-- both NULL with no way to tell why).
alter table public.voice_sessions
  add column query_kind text,
  add column schedule_time_window text,
  add column error_message text;
