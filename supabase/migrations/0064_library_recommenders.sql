-- Library > Employers > "Recommendation": people who could write (or already
-- wrote) a recommendation letter, plus a log of each letter. Standalone — a
-- recommender isn't tied to one employer, and letters name what they were for
-- in free text. Real deletes (the letters cascade), like the link tables.

create table public.library_recommenders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  affiliation text not null default '' check (char_length(affiliation) <= 200),
  email text not null default '' check (char_length(email) <= 200),
  relationship text not null default '' check (char_length(relationship) <= 200),
  status text not null default 'potential' check (status in ('potential', 'asked', 'agreed', 'declined')),
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index library_recommenders_user_idx on public.library_recommenders (user_id, created_at);

create table public.library_recommender_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recommender_id uuid not null references public.library_recommenders(id) on delete cascade,
  purpose text not null check (char_length(purpose) between 1 and 200),
  status text not null default 'requested' check (status in ('requested', 'received', 'declined')),
  requested_on date,
  received_on date,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index library_recommender_letters_recommender_idx on public.library_recommender_letters (recommender_id, created_at);
create index library_recommender_letters_user_idx on public.library_recommender_letters (user_id);

alter table public.library_recommenders enable row level security;
alter table public.library_recommender_letters enable row level security;

create policy library_recommenders_select on public.library_recommenders for select using (auth.uid() = user_id);
create policy library_recommenders_insert on public.library_recommenders for insert with check (auth.uid() = user_id);
create policy library_recommenders_update on public.library_recommenders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy library_recommenders_delete on public.library_recommenders for delete using (auth.uid() = user_id);

create policy library_recommender_letters_select on public.library_recommender_letters for select using (auth.uid() = user_id);
create policy library_recommender_letters_insert on public.library_recommender_letters for insert with check (auth.uid() = user_id);
create policy library_recommender_letters_update on public.library_recommender_letters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy library_recommender_letters_delete on public.library_recommender_letters for delete using (auth.uid() = user_id);

create trigger trg_library_recommenders_set_updated_at
before update on public.library_recommenders
for each row execute function public.set_updated_at();

create trigger trg_library_recommender_letters_set_updated_at
before update on public.library_recommender_letters
for each row execute function public.set_updated_at();

-- A letter's recommender must be owned by the same user.
create function public.guard_library_recommender_letter_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.library_recommenders where id = NEW.recommender_id and user_id = NEW.user_id
  ) then
    raise exception 'library_recommender_letters.recommender_id must reference a library_recommenders row owned by library_recommender_letters.user_id';
  end if;
  return NEW;
end;
$$;

create trigger trg_guard_library_recommender_letter_ownership
before insert or update of recommender_id, user_id on public.library_recommender_letters
for each row execute function public.guard_library_recommender_letter_ownership();
