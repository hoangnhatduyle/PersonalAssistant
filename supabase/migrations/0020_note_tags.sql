-- Add tags to notes for categorization and filtering.
-- Markdown body is already supported (plain text is valid markdown) —
-- the rendering change is purely client-side.
alter table public.notes add column tags text[] not null default '{}';
