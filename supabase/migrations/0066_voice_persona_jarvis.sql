-- The "butler" call-voice preset became "jarvis" (a different voice and a
-- livelier style). Existing choices follow it, and the CHECK is widened to the
-- new id set. The old constraint must go first, or the update to 'jarvis'
-- would violate it.
alter table public.user_preferences drop constraint user_preferences_voice_persona_check;
update public.user_preferences set voice_persona = 'jarvis' where voice_persona = 'butler';
alter table public.user_preferences
  add constraint user_preferences_voice_persona_check
  check (voice_persona in ('classic', 'jarvis', 'coach', 'calm', 'direct'));
