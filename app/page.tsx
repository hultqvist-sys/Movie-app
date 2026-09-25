import { Suspense } from "react";
import { Bookmark, CheckCircle2, SearchX, TriangleAlert } from "lucide-react";
import type { CardMedia } from "@/lib/media-model";

import { MediaCard } from "@/components/media/MediaCard";
import { VoteControls } from "@/components/media/VoteControls";
import { SearchBar } from "@/components/media/SearchBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTrending, searchMedia } from "@/lib/tmdb";
import { fromTMDB, fromDbRow } from "@/lib/media-model";
import { createClient } from "@/lib/supabase/server";
import type { VoteValue, MediaStatus } from "@/types/database.types";
import type { PageProps } from "@/types/next";

// TMDB is fetched per request. Without this, Next.js would try to run the
// fetch while prerendering at build time — before TMDB_READ_ACCESS_TOKEN
// exists in the deploy environment.
export const dynamic = "force-dynamic";

/** Responsive poster grid. Two columns on phones, five on desktop. */
function MediaGrid({ 
  media, 
  voteData = new Map() 
}: { 
  media: CardMedia[];
  voteData?: Map<number, {
    score: number;
    myVote: VoteValue | null;
    breakdown: { displayName: string; voteValue: VoteValue }[];
  }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {media.map((item) => {
        const votes = voteData.get(item.id);
        return (
          <MediaCard 
            key={`${item.type}-${item.id}`} 
            media={item}
            voteScore={votes?.score}
            voteControls={votes && (
              <VoteControls
                mediaId={item.id}
                score={votes.score}
                myVote={votes.myVote}
                breakdown={votes.breakdown}
              />
            )}
          />
        );
      })}
    </div>
  );
}

/** Shared empty-state shell for tabs with nothing to show yet. */
function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <div className="text-muted-foreground" aria-hidden>
        {icon}
      </div>
      <div className="space-y-1">
        <p className="font-heading text-base font-medium">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

type VoteWithProfile = {
  media_id: number;
  user_id: string;
  vote_value: VoteValue;
  profiles: { display_name: string | null } | null;
};

export default async function Home(props: PageProps<"/">) {
  const { q } = await props.searchParams;
  const rawQuery = Array.isArray(q) ? q[0] : q;
  const query = rawQuery?.trim() ?? "";

  // Returns [] rather than throwing when TMDB_READ_ACCESS_TOKEN is absent.
  const browseMedia = query ? await searchMedia(query) : await getTrending();
  
  // Get watchlist and voting data
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let watchlistMedia: CardMedia[] = [];
  let watchedMedia: CardMedia[] = [];
  let voteData = new Map<number, {
    score: number;
    myVote: VoteValue | null;
    breakdown: { displayName: string; voteValue: VoteValue }[];
  }>();
  
  try {
    // Get media with watchlist/currently_watching status
    const { data: mediaRows, error: mediaError } = await supabase
      .from('media')
      .select('*')
      .in('status', ['watchlist', 'currently_watching', 'watched']);
    
    if (mediaError) {
      console.warn('Failed to fetch media:', mediaError);
    } else if (mediaRows) {
      // Get votes for these media items with profile joins
      const mediaIds = mediaRows.map(row => row.id);
      const { data: votes } = await supabase
        .from('votes')
        .select(`
          media_id,
          user_id,
          vote_value,
          profiles!inner(
            display_name
          )
        `)
        .in('media_id', mediaIds) as { data: VoteWithProfile[] | null };
      
      // Process vote data
      if (votes) {
        const votesByMedia = new Map<number, VoteWithProfile[]>();
        votes.forEach(vote => {
          if (!votesByMedia.has(vote.media_id)) {
            votesByMedia.set(vote.media_id, []);
          }
          votesByMedia.get(vote.media_id)!.push(vote);
        });
        
        // Calculate scores and breakdowns
        votesByMedia.forEach((mediaVotes, mediaId) => {
          const score = mediaVotes.reduce((sum, vote) => sum + vote.vote_value, 0);
          const myVote = user 
            ? (mediaVotes.find(v => v.user_id === user.id)?.vote_value ?? null)
            : null;
          const breakdown = mediaVotes.map(vote => ({
            displayName: vote.profiles?.display_name || 'Unknown User',
            voteValue: vote.vote_value
          }));
          
          voteData.set(mediaId, { score, myVote, breakdown });
        });
      }
      
      // Separate into watchlist and watched
      const watchlistRows = mediaRows.filter(row => 
        row.status === 'watchlist' || row.status === 'currently_watching'
      );
      const watchedRows = mediaRows.filter(row => row.status === 'watched');
      
      // Convert to CardMedia and sort
      watchlistMedia = watchlistRows.map(fromDbRow);
      watchedMedia = watchedRows.map(fromDbRow);
      
      // Sort watchlist: currently_watching first (pinned), then by score desc, then by title
      watchlistMedia.sort((a, b) => {
        const aStatus = watchlistRows.find(r => r.id === a.id)?.status;
        const bStatus = watchlistRows.find(r => r.id === b.id)?.status;
        
        // Pin currently_watching items
        if (aStatus === 'currently_watching' && bStatus !== 'currently_watching') return -1;
        if (bStatus === 'currently_watching' && aStatus !== 'currently_watching') return 1;
        
        // Sort by score descending
        const aScore = voteData.get(a.id)?.score ?? 0;
        const bScore = voteData.get(b.id)?.score ?? 0;
        if (aScore !== bScore) return bScore - aScore;
        
        // Tie-breaker: title ascending
        return a.title.localeCompare(b.title);
      });
    }
  } catch (error) {
    console.warn('Failed to fetch watchlist data:', error);
  }

  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="h-8" />}>
        <SearchBar />
      </Suspense>

      <Tabs defaultValue="browse" className="gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          <TabsTrigger value="watched">Watched</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
          <div className="space-y-1">
            <h1 className="font-heading text-lg font-semibold tracking-tight">
              {query ? `Results for "${query}"` : "Trending this week"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {query
                ? `${browseMedia.length} result${browseMedia.length === 1 ? "" : "s"} found`
                : "Movies and shows people are watching right now."}
            </p>
          </div>

          {browseMedia.length > 0 ? (
            <MediaGrid media={browseMedia.map(fromTMDB)} />
          ) : query && process.env.TMDB_READ_ACCESS_TOKEN ? (
            <EmptyState
              icon={<SearchX className="size-6" />}
              title={`No results for "${query}"`}
              description="Try a different title or check the spelling."
            />
          ) : (
            <EmptyState
              icon={<TriangleAlert className="size-6" />}
              title="No results from TMDB"
              description="Add TMDB_READ_ACCESS_TOKEN to .env.local and reload. Check the server console for the exact reason."
            />
          )}
        </TabsContent>

        <TabsContent value="watchlist" className="space-y-4">
          <div className="space-y-1">
            <h1 className="font-heading text-lg font-semibold tracking-tight">
              Watchlist
            </h1>
            <p className="text-sm text-muted-foreground">
              Movies and shows you want to watch.
            </p>
          </div>

          {watchlistMedia.length > 0 ? (
            <MediaGrid media={watchlistMedia} voteData={voteData} />
          ) : (
            <EmptyState
              icon={<Bookmark className="size-6" />}
              title="Watchlist is empty"
              description="Add movies and shows from the Browse tab to get started."
            />
          )}
        </TabsContent>

        <TabsContent value="watched" className="space-y-4">
          <div className="space-y-1">
            <h1 className="font-heading text-lg font-semibold tracking-tight">
              Watched
            </h1>
            <p className="text-sm text-muted-foreground">
              Movies and shows you've finished watching.
            </p>
          </div>

          {watchedMedia.length > 0 ? (
            <MediaGrid media={watchedMedia} voteData={voteData} />
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="size-6" />}
              title="Nothing watched yet"
              description="Mark items as watched to track what you've completed."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}