-- Which voice + speaking style the live call assistant uses. The id is a key
-- into src/lib/voice/realtime/personas.ts (voice and tone live in code so a
-- tweak does not need a migration); the CHECK keeps a direct write from storing
-- an id the app cannot resolve. 'classic' is the pre-existing behaviour.
alter table public.user_preferences
  add column voice_persona text not null default 'classic'
  check (voice_persona in ('classic', 'butler', 'coach', 'calm', 'direct'));
