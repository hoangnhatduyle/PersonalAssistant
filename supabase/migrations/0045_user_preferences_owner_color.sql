-- The account owner's own display color (People rows already have their own
-- via people.color). Null = never chosen: the UI keeps its built-in
-- per-type colors for the owner's Courses until one is picked in Settings.
alter table public.user_preferences
  add column owner_color text
  check (owner_color is null or owner_color ~ '^#[0-9a-fA-F]{6}$');
