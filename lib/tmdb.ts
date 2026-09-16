/**
 * Server-side TMDB v3 API client.
 *
 * SERVER ONLY. Every function here reads `process.env.TMDB_READ_ACCESS_TOKEN`,
 * which is intentionally not prefixed with `NEXT_PUBLIC_`. Never import this
 * module from a Client Component — call it from a Server Component, a Server
 * Action, or a Route Handler and pass the plain data down as props.
 *
 * Safety contract (build/dev without credentials):
 *   * Missing token       -> console.warn + empty result (`[]` / `null`)
 *   * Non-2xx response    -> console.warn + empty result
 *   * Network/parse error -> console.warn + empty result
 * Nothing in this file throws, so a missing env var can never crash a render.
 * No mock or placeholder data is ever substituted.
 */

const TMDB_API_BASE = 'https://api.themoviedb.org/3';

/** Base URL for TMDB image assets. */
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Poster width used by the media grid. */
export const TMDB_POSTER_SIZE = 'w500';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** TMDB's `media_type` discriminator. Matches `MediaType` in database.types.ts. */
export type TMDBMediaType = 'movie' | 'tv';

/** Standard TMDB list envelope. */
export interface TMDBPaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

interface TMDBMediaBase {
  id: number;
  adult: boolean;
  backdrop_path: string | null;
  genre_ids: number[];
  original_language: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
}

/** A movie as returned by list endpoints (`/trending`, `/search/multi`). */
export interface TMDBMovie extends TMDBMediaBase {
  media_type: 'movie';
  title: string;
  original_title: string;
  /** `YYYY-MM-DD`; TMDB returns `''` when unknown. */
  release_date: string;
  video: boolean;
}

/** A TV show as returned by list endpoints. */
export interface TMDBTVShow extends TMDBMediaBase {
  media_type: 'tv';
  name: string;
  original_name: string;
  /** `YYYY-MM-DD`; TMDB returns `''` when unknown. */
  first_air_date: string;
  origin_country: string[];
}

/**
 * `/search/multi` and `/trending/all` also return people. We model the shape
 * so the union discriminates cleanly, then filter these out.
 */
export interface TMDBPerson {
  media_type: 'person';
  id: number;
  name: string;
  profile_path: string | null;
  popularity: number;
}

/** Any movie-or-TV list item. This is what the UI renders. */
export type TMDBMedia = TMDBMovie | TMDBTVShow;

/** Raw union returned by mixed endpoints, before filtering. */
export type TMDBMultiSearchResult = TMDBMovie | TMDBTVShow | TMDBPerson;

/** A video attached to a media item — trailers, teasers, clips. */
export interface TMDBTrailer {
  id: string;
  iso_639_1: string;
  iso_3166_1: string;
  key: string;
  name: string;
  official: boolean;
  /** ISO 8601 timestamp. */
  published_at: string;
  site: 'YouTube' | 'Vimeo';
  size: 360 | 480 | 720 | 1080;
  type:
    | 'Trailer'
    | 'Teaser'
    | 'Clip'
    | 'Featurette'
    | 'Behind the Scenes'
    | 'Bloopers'
    | 'Opening Credits'
    | 'Recap';
}

interface TMDBVideosResponse {
  id: number;
  results: TMDBTrailer[];
}
}

interface TMDBWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

interface TMDBWatchProvidersResponse {
  link: string;
  flatrate?: TMDBWatchProvider[];
  rent?: TMDBWatchProvider[];
  buy?: TMDBWatchProvider[];
}

export interface TMDBWatchProviders {
  results: Record<string, TMDBWatchProvidersResponse>;
}
  id: number;
  results: TMDBTrailer[];
}

interface TMDBGenre {
  id: number;
  name: string;
}

/** `/movie/{id}?append_to_response=videos` */
export interface TMDBMovieDetails extends Omit<TMDBMovie, 'genre_ids'> {
  "watch/providers": TMDBWatchProviders;
  genres: TMDBGenre[];
  /** Minutes. `null` when TMDB has no data. */
  runtime: number | null;
  tagline: string;
  homepage: string;
  imdb_id: string | null;
  status: string;
  budget: number;
  revenue: number;
  videos: TMDBVideosResponse;
}

/** `/tv/{id}?append_to_response=videos` */
export interface TMDBTVShowDetails extends Omit<TMDBTVShow, 'genre_ids'> {
  "watch/providers": TMDBWatchProviders;
  genres: TMDBGenre[];
  /** Minutes per episode. TMDB returns an empty array when unknown. */
  episode_run_time: number[];
  tagline: string;
  homepage: string;
  status: string;
  number_of_seasons: number;
  number_of_episodes: number;
  last_air_date: string | null;
  in_production: boolean;
  videos: TMDBVideosResponse;
}

export type TMDBMediaDetails = TMDBMovieDetails | TMDBTVShowDetails;

// ---------------------------------------------------------------------------
// Internal request plumbing
// ---------------------------------------------------------------------------

/**
 * Builds the Bearer auth headers, or returns `null` when the read access
 * token is absent so callers can degrade to an empty result.
 */
function buildAuthHeaders(caller: string): HeadersInit | null {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;

  if (!token) {
    console.warn(
      `[tmdb] TMDB_READ_ACCESS_TOKEN is not set — ${caller}() returned no data. ` +
        'Add TMDB_READ_ACCESS_TOKEN to .env.local to enable TMDB requests.'
    );
    return null;
  }

  return {
    accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Performs an authenticated GET against TMDB. Resolves to `null` on any
 * failure — missing token, non-2xx, network error, or malformed JSON.
 */
async function tmdbFetch<T>(path: string, caller: string): Promise<T | null> {
  const headers = buildAuthHeaders(caller);
  if (!headers) return null;

  try {
    const response = await fetch(`${TMDB_API_BASE}${path}`, { headers });

    if (!response.ok) {
      console.warn(
        `[tmdb] ${caller}() failed: ${response.status} ${response.statusText} for ${path}`
      );
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.warn(`[tmdb] ${caller}() threw while requesting ${path}:`, error);
    return null;
  }
}

/** Narrows a mixed TMDB result list to movies and TV shows only. */
function isRenderableMedia(item: TMDBMultiSearchResult): item is TMDBMedia {
  return item.media_type === 'movie' || item.media_type === 'tv';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Trending movies and TV shows for the week.
 * Returns `[]` when the token is missing or the request fails.
 */
export async function getTrending(): Promise<TMDBMedia[]> {
  const data = await tmdbFetch<TMDBPaginatedResponse<TMDBMultiSearchResult>>(
    '/trending/all/week?language=en-US',
    'getTrending'
  );

  if (!data) return [];

  return data.results.filter(isRenderableMedia);
}

/**
 * Multi-search across movies and TV shows.
 * Returns `[]` for a blank query, a missing token, or a failed request.
 */
export async function searchMedia(query: string): Promise<TMDBMedia[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const data = await tmdbFetch<TMDBPaginatedResponse<TMDBMultiSearchResult>>(
    `/search/multi?query=${encodeURIComponent(trimmed)}&include_adult=false&language=en-US&page=1`,
    'searchMedia'
  );

  if (!data) return [];

  return data.results.filter(isRenderableMedia);
}

/**
 * Full details for one media item, with videos (trailers) appended.
 *
 * TMDB v3 has no type-agnostic detail endpoint — `/movie/{id}` and `/tv/{id}`
 * are distinct and the same numeric ID means different things on each. Pass
 * the `type` you stored on the `media` row; it defaults to `'movie'`.
 *
 * Returns `null` when the token is missing or the request fails.
 */
export async function getMediaDetails(
  id: number,
  type: TMDBMediaType = 'movie'
): Promise<TMDBMediaDetails | null> {
  const data = await tmdbFetch<
    Omit<TMDBMovieDetails, 'media_type'> | Omit<TMDBTVShowDetails, 'media_type'>
  >(`/${type}/${id}?append_to_response=videos,watch/providers&language=en-US`, 'getMediaDetails');

  if (!data) return null;

  // Detail endpoints omit `media_type`, so we reattach the discriminator to
  // keep the returned object assignable to the TMDBMediaDetails union.
  return { ...data, media_type: type } as TMDBMediaDetails;
}

/**
 * Official YouTube trailers for a details payload, newest-looking first
 * (official trailers before teasers and clips).
 */
export function getTrailers(details: TMDBMediaDetails | null): TMDBTrailer[] {

/**
 * Returns the YouTube key of the primary trailer, or null if none exists.
 * Prefers official trailers over teasers and clips.
 */
export function getPrimaryTrailerKey(details: TMDBMediaDetails | null): string | null {
  const trailers = getTrailers(details);
  return trailers[0]?.key ?? null;
}

/**
 * Returns names of flatrate (subscription) streaming providers for a region.
 * Defaults to 'US' but can be overridden.
 */
export function getFlatrateProviders(
  details: TMDBMediaDetails | null,
  region = 'US'
): string[] {
  if (!details) return [];
  
  const providers = details["watch/providers"].results[region]?.flatrate;
  return providers?.map(p => p.provider_name) ?? [];
}
  if (!details) return [];

  return details.videos.results
    .filter((video) => video.site === 'YouTube')
    .sort((a, b) => {
      const rank = (video: TMDBTrailer) =>
        (video.type === 'Trailer' ? 0 : video.type === 'Teaser' ? 1 : 2) +
        (video.official ? 0 : 0.5);
      return rank(a) - rank(b);
    });
}

// ---------------------------------------------------------------------------
// Display helpers (safe to use from Client Components)
// ---------------------------------------------------------------------------

/** Full image URL for a TMDB path, or `null` when there is no image. */
export function getPosterUrl(
  posterPath: string | null,
  size: string = TMDB_POSTER_SIZE
): string | null {
  if (!posterPath) return null;
  return `${TMDB_IMAGE_BASE}/${size}${posterPath}`;
}

/** Movies expose `title`, TV shows expose `name`. */
export function getMediaTitle(media: TMDBMedia): string {
  return media.media_type === 'movie' ? media.title : media.name;
}

/** Movies expose `release_date`, TV shows expose `first_air_date`. */
export function getMediaReleaseDate(media: TMDBMedia): string | null {
  const date =
    media.media_type === 'movie' ? media.release_date : media.first_air_date;
  return date || null;
}

/** Four-digit release year, or `null` when TMDB has no date. */
export function getMediaYear(media: TMDBMedia): string | null {
  return getMediaReleaseDate(media)?.slice(0, 4) ?? null;
}
