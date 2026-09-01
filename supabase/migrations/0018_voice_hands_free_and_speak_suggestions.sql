-- Two new user_preferences toggles for the hands-free voice work:
-- hands_free_voice_enabled re-arms the mic after any voice-originated
-- response instead of requiring a tap for every turn; speak_suggestions_aloud
-- lets a button-tap on the Suggestions dashboard panel also trigger a
-- spoken review-and-confirm loop (the sole deliberate exception to "only
-- speak back when the input was voice" — the user explicitly opts in).
alter table public.user_preferences add column hands_free_voice_enabled boolean not null default false;
alter table public.user_preferences add column speak_suggestions_aloud boolean not null default false;
