import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMediaDetails } from '@/lib/tmdb';
import { createClient } from '@/lib/supabase/server';
import type { MediaStatus } from '@/types/database.types';
import type { PageProps } from '@/types/next';
import { MediaCard } from '@/components/media/MediaCard';
import { AddToWatchlistButton } from '@/components/media/AddToWatchlistButton';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/media/[type]/[id]'>) {
  const { type, id } = await params;
  const details = await getMediaDetails(Number(id), type as 'movie' | 'tv');
  return {
    title: details ? `${details.media_type === 'movie' ? details.title : details.name} | Movie Night` : 'Media Details',
  };
}

export default async function MediaDetailPage(props: PageProps<'/media/[type]/[id]'>) {
  const { type, id } = await props.params;
  
  // Validate params
  if (type !== 'movie' && type !== 'tv') notFound();
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) notFound();

  const [details, supabaseMedia] = await Promise.all([
    getMediaDetails(idNum, type),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase.from('media').select('*').eq('id', idNum).maybeSingle() as { data: { status: MediaStatus } | null };
      return data;
    })(),
  ]);

  if (!details) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Details unavailable</h1>
          <p className="mt-2 text-muted-foreground">
            Could not load details for this media item.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-primary">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  const title = details.media_type === 'movie' ? details.title : details.name;
  const year = details.media_type === 'movie' 
    ? details.release_date?.slice(0, 4) 
    : details.first_air_date?.slice(0, 4);
  const trailerKey = (details as any).videos?.results?.[0]?.key || null;
  const providers = (details as any)["watch/providers"]?.results?.US?.flatrate?.map((p: any) => p.provider_name) || [];

  return (
    <div className="container max-w-4xl py-6">
      <Link href="/" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        ← Back to home
      </Link>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          {details.backdrop_path ? (
            <img 
              src={`https://image.tmdb.org/t/p/w780${details.backdrop_path}`}
              alt={`Backdrop for ${title}`}
              className="rounded-lg"
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-lg bg-muted">
              <span className="text-muted-foreground">No backdrop available</span>
            </div>
          )}

          <div className="mt-4">
            <h1 className="text-2xl font-bold">{title}</h1>
            <div className="mt-2 flex items-center gap-2">
              <Badge>{type === 'movie' ? 'Movie' : 'TV'}</Badge>
              {year && <span className="text-muted-foreground">{year}</span>}
            </div>
          </div>

          {details.overview && (
            <div className="mt-4">
              <h2 className="text-lg font-semibold">Overview</h2>
              <p className="mt-2 text-muted-foreground">{details.overview}</p>
            </div>
          )}

          {providers.length > 0 && (
            <div className="mt-4">
              <h2 className="text-lg font-semibold">Where to Watch</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {providers.map((provider: string) => (
                  <Badge key={provider} variant="secondary">
                    {provider}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Streaming data provided by JustWatch
              </p>
            </div>
          )}

          {!supabaseMedia || supabaseMedia.status !== 'watchlist' ? (
            <div className="mt-6">
              <AddToWatchlistButton 
                media={{
                  id: details.id,
                  title,
                  type,
                  posterPath: details.poster_path,
                  year,
                  status: supabaseMedia?.status || null
                }} 
              />
            </div>
          ) : null}
        </div>

        {trailerKey && (
          <div className="aspect-video w-full">
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}`}
              title={`${title} Trailer`}
              allowFullScreen
              loading="lazy"
              className="h-full w-full rounded-lg"
            />
          </div>
        )}
      </div>
    </div>
  );
}