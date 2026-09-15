# Technical Product Requirements Document (TPRD): Movie Night App

## 1. App Overview & Scope
A mobile-first Next.js web application designed for a 3-person household to discover, track, vote on, and review Movies and TV Shows. 
*   **Core Objective:** Eliminate decision paralysis for "movie night" via a democratic voting system and shared watchlist.
*   **Target Audience:** 3 authenticated household members (Full Access), plus unauthenticated Guests (Read-Only Access).

## 2. Tech Stack & Architecture
*   **Framework:** Next.js (App Router)
*   **Language:** Strict TypeScript
*   **Styling:** Tailwind CSS
*   **UI Components:** shadcn/ui (Lucide React for icons)
*   **Database & Auth:** Supabase (PostgreSQL, GoTrue for Auth)
*   **Data Fetching & State:** Next.js Server Actions for mutations; React Server Components (RSC) for initial reads. Use `revalidatePath` after mutations to sync state (do not use Supabase Realtime for this MVP to keep complexity low).
*   **External API:** TMDB (The Movie Database) v3 API.

## 3. Auth & Security Restrictions (Whitelist Logic)
*   **Open Signups Disabled:** Email signups will be explicitly disabled in the Supabase dashboard. 
*   **Provisioning:** The 3 core users will be manually invited via the Supabase Admin dashboard. 
*   **Middleware:** Next.js middleware must check for an active Supabase session. Authenticated users route to the standard app. Unauthenticated users route to a Read-Only guest view where mutations (voting, adding, commenting) are hidden or disabled.

## 4. Strict Database Schema (Supabase)
Claude must implement this exact relational structure.

**Table: `profiles`**
*   `id` (uuid, primary key, references auth.users)
*   `display_name` (text, nullable)
*   `avatar_url` (text, nullable)

**Table: `media`**
*   `id` (int, primary key - matches TMDB ID)
*   `title` (text, not null)
*   `type` (text, either 'movie' or 'tv')
*   `poster_path` (text, nullable)
*   `status` (text: 'watchlist', 'currently_watching', 'watched')
*   `created_at` (timestamptz, default now())

**Table: `votes`**
*   `id` (uuid, primary key)
*   `media_id` (int, foreign key to media.id, cascade delete)
*   `user_id` (uuid, foreign key to profiles.id, cascade delete)
*   `vote_value` (int: +2, +1, or -1)
*   *Constraint:* Unique combination of `media_id` and `user_id`.

**Table: `reviews`**
*   `id` (uuid, primary key)
*   `media_id` (int, foreign key to media.id, cascade delete)
*   `user_id` (uuid, foreign key to profiles.id, cascade delete)
*   `star_rating` (int, 1-5, nullable)
*   `comment` (text, nullable)
*   `was_present` (boolean, default true)
*   *Constraint:* Unique combination of `media_id` and `user_id`.

**Table: `notifications`**
*   `id` (uuid, primary key)
*   `user_id` (uuid, foreign key to profiles.id, cascade delete)
*   `media_id` (int, foreign key to media.id, cascade delete)
*   `message` (text)
*   `is_read` (boolean, default false)
*   `created_at` (timestamptz, default now())

## 5. Triggers & Row Level Security (RLS)
Claude must generate a SQL migration that includes the following:

**Auth Trigger (Profile Creation):**
```sql
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$ begin   insert into public.profiles (id, display_name, avatar_url)   values (new.id, new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'avatar_url');   return new; end; $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();