-- Conversation memory for the tool-calling conversational core: a
-- voice_conversations row groups the last ~N voice_sessions turns a user
-- had in one continuous back-and-forth, so the model can resolve "what
-- about tomorrow?" against what was just said instead of every turn being a
-- fresh, contextless row. At most one active (ended_at is null) conversation
-- per user -- resolveActiveConversation (src/lib/voice/conversation-memory.ts)
-- is the sole writer, closing it on either a 30-minute inactivity timeout or
-- an explicit reset (natural-language "start over" trigger, or the UI
-- button) -- both funnel through the same endConversation() call.
create type voice_conversation_end_reason as enum ('explicit', 'timeout');

create table public.voice_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason voice_conversation_end_reason,
  constraint voice_conversations_end_reason_set_iff_ended
    check ((ended_at is null) = (end_reason is null))
);

-- Enforces at most one active conversation per user, and doubles as the
-- natural lookup/CAS target resolveActiveConversation's insert races against
-- (see that function's own race-handling comment).
create unique index voice_conversations_one_active_per_user_idx
  on public.voice_conversations (user_id) where ended_at is null;
create index voice_conversations_user_id_idx on public.voice_conversations (user_id);
create index voice_conversations_retention_idx
  on public.voice_conversations (coalesce(ended_at, last_active_at));

alter table public.voice_conversations enable row level security;
create policy voice_conversations_owner on public.voice_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- conversation_id links a turn to the conversation it belongs to --
-- `on delete set null`, not cascade: a voice_conversations row disappearing
-- via its own retention sweep below must never cascade-delete voice_sessions
-- rows, which are independently governed by their own 24h sweep
-- (0004_voice_session_retention.sql). response_message closes a real gap --
-- VoiceTurnResult.message was never persisted anywhere, and conversation
-- history loading needs to read it back.
alter table public.voice_sessions
  add column conversation_id uuid references public.voice_conversations(id) on delete set null,
  add column response_message text;

-- What loadConversationHistory's query actually needs: the most recent
-- turns for one conversation, oldest-first.
create index voice_sessions_conversation_history_idx
  on public.voice_sessions (conversation_id, started_at) where conversation_id is not null;

-- Retention sweep, same shape as delete_expired_voice_sessions()
-- (0004_voice_session_retention.sql): SECURITY DEFINER, EXECUTE revoked from
-- public/anon/authenticated, scheduled via pg_cron every 15 minutes.
--
-- Threshold is 48 hours from coalesce(ended_at, last_active_at) -- longer
-- than voice_sessions' own 24h sweep on purpose. This table holds no
-- transcript/PII (only timestamps and a two-value enum), so the aggressive
-- 24h privacy rationale behind voice_sessions' sweep doesn't apply here; 48h
-- just needs to comfortably outlive every voice_sessions row that might
-- still reference a given conversation (that table's own 24h sweep runs
-- independently), so a live turn's conversation_id never silently goes null
-- out from under it mid-window.
create function public.delete_expired_voice_conversations()
returns setof public.voice_conversations
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  delete from public.voice_conversations
  where coalesce(ended_at, last_active_at) < now() - interval '48 hours'
  returning *;
end;
$$;

revoke execute on function public.delete_expired_voice_conversations() from public, anon, authenticated;
grant execute on function public.delete_expired_voice_conversations() to service_role;

select cron.schedule(
  'voice-conversation-retention-sweep',
  '*/15 * * * *',
  $cron$select public.delete_expired_voice_conversations();$cron$
);
