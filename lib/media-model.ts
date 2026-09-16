/**
 * Normalized view model for media cards that works with both TMDB and database rows
 */

import type { Media, MediaType, MediaStatus } from '@/types/database.types'
import type { TMDBMedia } from '@/lib/tmdb'
import { getMediaTitle, getMediaYear, getPosterUrl } from '@/lib/tmdb'

export interface CardMedia {
  id: number
  title: string
  type: MediaType
  posterPath: string | null
  year: string | null
  status: MediaStatus | null
}

export function fromTMDB(media: TMDBMedia): CardMedia {
  return {
    id: media.id,
    title: getMediaTitle(media),
    type: media.media_type,
    posterPath: media.poster_path,
    year: getMediaYear(media),
    status: null
  }
}

export function fromDbRow(row: Media): CardMedia {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    posterPath: row.poster_path,
    year: null,
    status: row.status
  }
}