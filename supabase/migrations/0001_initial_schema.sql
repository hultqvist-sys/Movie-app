-- 0001_initial_schema.sql
-- Movie Night App — initial schema, auth trigger, and Row Level Security policies.
-- Source of truth: PRD.md sections 4 and 5.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- Table: profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text
);

-- Table: media (id matches the TMDB ID)
create table public.media (
  id int primary key,
  title text not null,
  type text not null check (type in ('movie', 'tv')),
  poster_path text,
  status text not null default 'watchlist'
    check (status in ('watchlist', 'currently_watching', 'watched')),
  created_at timestamptz not null default now()
);

-- Table: votes
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  media_id int not null references public.media (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote_value int not null check (vote_value in (2, 1, -1)),
  unique (media_id, user_id)
);

-- Table: reviews
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  media_id int not null references public.media (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  star_rating int check (star_rating between 1 and 5),
  comment text,
  was_present boolean not null default true,
  unique (media_id, user_id)
);

-- Table: notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  media_id int not null references public.media (id) on delete cascade,
  message text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes for the common read paths (media detail pages, notification bell).
create index votes_media_id_idx on public.votes (media_id);
create index reviews_media_id_idx on public.reviews (media_id);
create index notifications_user_id_is_read_idx on public.notifications (user_id, is_read);
create index media_status_idx on public.media (status);

-- ---------------------------------------------------------------------------
-- 2. Auth trigger (profile creation) — verbatim from PRD.md section 5
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$ begin   insert into public.profiles (id, display_name, avatar_url)   values (new.id, new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'avatar_url');   return new; end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
-- Derived from PRD.md section 3 (the PRD file is truncated before the explicit
-- policy SQL). Model applied:
--   * Guests (anon) get read-only access to the shared household data.
--   * Authenticated household members get full access to shared data.
--   * Rows that belong to a single user (votes, reviews, profiles,
--     notifications) may only be written by that user.
--   * Notifications are private to their owner — not exposed to guests.

alter table public.profiles      enable row level security;
alter table public.media         enable row level security;
alter table public.votes         enable row level security;
alter table public.reviews       enable row level security;
alter table public.notifications enable row level security;

-- profiles ------------------------------------------------------------------
-- Readable by everyone so guest views can show who voted / reviewed.
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Inserts are handled exclusively by the handle_new_user() trigger, which runs
-- as security definer and therefore bypasses RLS. No insert policy on purpose.

-- media ---------------------------------------------------------------------
create policy "Media is viewable by everyone"
  on public.media for select
  to anon, authenticated
  using (true);

create policy "Members can add media"
  on public.media for insert
  to authenticated
  with check (true);

create policy "Members can update media"
  on public.media for update
  to authenticated
  using (true)
  with check (true);

create policy "Members can delete media"
  on public.media for delete
  to authenticated
  using (true);

-- votes ---------------------------------------------------------------------
create policy "Votes are viewable by everyone"
  on public.votes for select
  to anon, authenticated
  using (true);

create policy "Members can cast their own vote"
  on public.votes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Members can change their own vote"
  on public.votes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Members can remove their own vote"
  on public.votes for delete
  to authenticated
  using (auth.uid() = user_id);

-- reviews -------------------------------------------------------------------
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  to anon, authenticated
  using (true);

create policy "Members can write their own review"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Members can edit their own review"
  on public.reviews for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Members can delete their own review"
  on public.reviews for delete
  to authenticated
  using (auth.uid() = user_id);

-- notifications -------------------------------------------------------------
-- Private to the recipient: no anon access.
create policy "Users can view their own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Members can create notifications"
  on public.notifications for insert
  to authenticated
  with check (true);

create policy "Users can mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own notifications"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);
