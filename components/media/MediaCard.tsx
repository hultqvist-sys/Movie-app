import Image from 'next/image';
import Link from 'next/link';
import { ImageOff, ThumbsUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { getPosterUrl } from '@/lib/tmdb';
import type { CardMedia } from '@/lib/media-model';

interface MediaCardProps {
  media: CardMedia;
  /**
   * Aggregated vote score from the Supabase `votes` table.
   * PLACEHOLDER — `undefined` until Phase 2 wires the query, which renders a
   * muted em dash rather than a misleading zero.
   */
  voteScore?: number;
}

/**
 * Poster tile for a single TMDB movie or TV show.
 *
 * Mobile-first: the card fills its grid cell and the poster holds a fixed 2:3
 * aspect ratio so the grid never shifts while images stream in.
 */
export function MediaCard({
  media,
  voteScore,
  voteControls,
  actions
}: MediaCardProps & {
  voteControls?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const title = media.title;
  const year = media.year;
  const posterUrl = getPosterUrl(media.posterPath);
  const typeLabel = media.type === 'movie' ? 'Movie' : 'TV';

    return (
    <Card size="sm" className="h-full">
      <Link 
        href={`/media/${media.type}/${media.id}`}
        aria-label={`View details for ${title}`}
        className="block"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={`Poster for ${title}`}
              fill
              // Two columns on phones, up to five on desktop — keeps the
              // requested srcset close to the rendered size.
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-cover"
            />
          ) : (
            <div
              role="img"
              aria-label={`No poster available for ${title}`}
              className="flex h-full w-full items-center justify-center"
            >
              <ImageOff className="size-6 text-muted-foreground" aria-hidden />
            </div>
          )}

          <Badge
            variant="secondary"
            className="absolute top-2 left-2 text-[10px] uppercase"
          >
            {typeLabel}
          </Badge>
        </div>
      </Link>

      {voteControls}
      <CardContent className="flex flex-col gap-1">
        <Link 
          href={`/media/${media.type}/${media.id}`}
          aria-label={`View details for ${title}`}
        >
          <CardTitle className="line-clamp-2 hover:text-primary transition-colors" title={title}>
            {title}
          </CardTitle>
        </Link>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{year ?? 'TBA'}</span>

          {/* PLACEHOLDER(phase-2): household vote score from Supabase. */}
          <span
            className="inline-flex items-center gap-1"
            aria-label={
              voteScore === undefined
                ? 'Vote score not available yet'
                : `Vote score ${voteScore}`
            }
          >
            <ThumbsUp className="size-3" aria-hidden />
            <span className="tabular-nums">
              {voteScore === undefined ? '—' : voteScore}
            </span>
          </span>
        </div>
      </CardContent>
      {actions}
    </Card>
  );}
}
