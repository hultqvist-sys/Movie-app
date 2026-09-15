/**
 * Strict TypeScript definitions for the Movie Night Supabase schema.
 *
 * Mirrors supabase/migrations/0001_initial_schema.sql. Keep both in sync —
 * the SQL file is the source of truth (PRD.md, "Schema First").
 */

// ---------------------------------------------------------------------------
// Enum-like column unions (mirroring the SQL CHECK constraints)
// ---------------------------------------------------------------------------

/** `media.type` */
export type MediaType = 'movie' | 'tv';

/** `media.status` */
export type MediaStatus = 'watchlist' | 'currently_watching' | 'watched';

/** `votes.vote_value` — +2 (really want to), +1 (happy to), -1 (veto). */
export type VoteValue = 2 | 1 | -1;

/** `reviews.star_rating` */
export type StarRating = 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------------
// Table rows
// ---------------------------------------------------------------------------

/** `public.profiles` — one row per household member, created by the auth trigger. */
export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ProfileInsert {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export type ProfileUpdate = Partial<Omit<Profile, 'id'>>;

/** `public.media` — `id` is the TMDB ID, not a generated key. */
export interface Media {
  id: number;
  title: string;
  type: MediaType;
  poster_path: string | null;
  status: MediaStatus;
  created_at: string;
}

export interface MediaInsert {
  id: number;
  title: string;
  type: MediaType;
  poster_path?: string | null;
  /** Defaults to 'watchlist' in the database. */
  status?: MediaStatus;
  created_at?: string;
}

export type MediaUpdate = Partial<Omit<Media, 'id'>>;

/** `public.votes` — unique per (media_id, user_id). */
export interface Vote {
  id: string;
  media_id: number;
  user_id: string;
  vote_value: VoteValue;
}

export interface VoteInsert {
  id?: string;
  media_id: number;
  user_id: string;
  vote_value: VoteValue;
}

export type VoteUpdate = Partial<Omit<Vote, 'id'>>;

/** `public.reviews` — unique per (media_id, user_id). */
export interface Review {
  id: string;
  media_id: number;
  user_id: string;
  star_rating: StarRating | null;
  comment: string | null;
  was_present: boolean;
}

export interface ReviewInsert {
  id?: string;
  media_id: number;
  user_id: string;
  star_rating?: StarRating | null;
  comment?: string | null;
  /** Defaults to true in the database. */
  was_present?: boolean;
}

export type ReviewUpdate = Partial<Omit<Review, 'id'>>;

/** `public.notifications` — private to `user_id`. */
export interface Notification {
  id: string;
  user_id: string;
  media_id: number;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationInsert {
  id?: string;
  user_id: string;
  media_id: number;
  message?: string | null;
  /** Defaults to false in the database. */
  is_read?: boolean;
  created_at?: string;
}

export type NotificationUpdate = Partial<Omit<Notification, 'id'>>;

// ---------------------------------------------------------------------------
// Database shape for the typed Supabase client
// ---------------------------------------------------------------------------

/**
 * Pass to the Supabase client for end-to-end type safety, e.g.
 * `createServerClient<Database>(url, key, { cookies })`.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      media: {
        Row: Media;
        Insert: MediaInsert;
        Update: MediaUpdate;
      };
      votes: {
        Row: Vote;
        Insert: VoteInsert;
        Update: VoteUpdate;
      };
      reviews: {
        Row: Review;
        Insert: ReviewInsert;
        Update: ReviewUpdate;
      };
      notifications: {
        Row: Notification;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience helpers: `Tables<'media'>`, `TablesInsert<'votes'>`, … */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
