-- SPEC-VOICE-005 NC-VOICE-006, SPEC-API-005 NC-API-003: architect-review
-- finding on Item 5 -- trg_guard_voice_session_state (0001_init.sql) was
-- declared `before update of state`, so an UPDATE that never touches the
-- `state` column never fires it at all. Since the `voice_sessions_owner`
-- RLS policy (0001_init.sql) is a blanket `for all` grant, an authenticated
-- user's own client could PATCH pending_mutation or expires_at directly via
-- PostgREST -- bypassing every guarantee this app's own code (src/lib/voice/
-- session.ts) makes about them (that pending_mutation is only ever set
-- alongside a genuine mutating_action_resolved transition, and expires_at
-- alongside AwaitingConfirmation) without ever calling this app's routes.
--
-- Widen the trigger to also fire on pending_mutation/expires_at, and
-- reject any write to either that does NOT arrive together with a real
-- state change (every legitimate write in session.ts's transition() helper
-- always pairs the two: resolveVoiceTransition never maps an event to its
-- own current state, so a genuine transition's NEW.state is always
-- distinct from OLD.state). service_role is exempt -- it already bypasses
-- RLS entirely (a strictly stronger bypass than this trigger), and is what
-- test setup (supabase/tests/*.test.ts) and any legitimate system-level
-- maintenance use; the gap this closes is specifically the authenticated/
-- anon end-user path.
drop trigger trg_guard_voice_session_state on public.voice_sessions;

create or replace function public.guard_voice_session_state()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.state is distinct from 'Idle' then
      raise exception 'voice_sessions.state must be Idle on insert, got %', NEW.state;
    end if;
    return NEW;
  end if;

  if NEW.state is distinct from OLD.state then
    if (OLD.state, NEW.state) not in (
      ('Idle', 'Listening'),
      ('Listening', 'Transcribing'),
      ('Transcribing', 'IntentResolved'),
      ('Transcribing', 'IntentAmbiguous'),
      ('IntentAmbiguous', 'Responding'),
      ('IntentResolved', 'Executing'),
      ('IntentResolved', 'AwaitingConfirmation'),
      ('AwaitingConfirmation', 'Executing'),
      ('AwaitingConfirmation', 'Responding'),
      ('Executing', 'Responding'),
      ('Responding', 'Idle')
    ) then
      raise exception 'Forbidden voice_session_state transition: % -> %', OLD.state, NEW.state;
    end if;

    -- NC-VOICE-005: a mutation MUST NOT execute past its confirmation
    -- window, however the confirm request arrives.
    if OLD.state = 'AwaitingConfirmation' and NEW.state = 'Executing' then
      if OLD.expires_at is null or now() > OLD.expires_at then
        raise exception 'voice_sessions confirmation window has expired, cannot transition to Executing';
      end if;
    end if;
  elsif current_user <> 'service_role' then
    if NEW.pending_mutation is distinct from OLD.pending_mutation
       or NEW.expires_at is distinct from OLD.expires_at then
      raise exception 'voice_sessions.pending_mutation/expires_at may only change together with a valid state transition';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_voice_session_state
before insert or update of state, pending_mutation, expires_at on public.voice_sessions
for each row execute function public.guard_voice_session_state();
