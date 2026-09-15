import { Bookmark, CheckCircle2, TriangleAlert } from "lucide-react";

import { MediaCard } from "@/components/media/MediaCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTrending, type TMDBMedia } from "@/lib/tmdb";

// TMDB is fetched per request. Without this, Next.js would try to run the
// fetch while prerendering at build time — before TMDB_READ_ACCESS_TOKEN
// exists in the deploy environment.
export const dynamic = "force-dynamic";

/** Responsive poster grid. Two columns on phones, five on desktop. */
function MediaGrid({ media }: { media: TMDBMedia[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {media.map((item) => (
        <MediaCard key={`${item.media_type}-${item.id}`} media={item} />
      ))}
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

export default async function Home() {
  // Returns [] rather than throwing when TMDB_READ_ACCESS_TOKEN is absent.
  const trending = await getTrending();

  return (
    <Tabs defaultValue="browse" className="gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="browse">Browse</TabsTrigger>
        <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
        <TabsTrigger value="watched">Watched</TabsTrigger>
      </TabsList>

      <TabsContent value="browse" className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-heading text-lg font-semibold tracking-tight">
            Trending this week
          </h1>
          <p className="text-sm text-muted-foreground">
            Movies and shows people are watching right now.
          </p>
        </div>

        {trending.length > 0 ? (
          <MediaGrid media={trending} />
        ) : (
          <EmptyState
            icon={<TriangleAlert className="size-6" />}
            title="No results from TMDB"
            description="Add TMDB_READ_ACCESS_TOKEN to .env.local and reload. Check the server console for the exact reason."
          />
        )}
      </TabsContent>

      <TabsContent value="watchlist">
        <EmptyState
          icon={<Bookmark className="size-6" />}
          title="Watchlist is empty"
          description="Saved titles will appear here once Supabase is connected in the next phase."
        />
      </TabsContent>

      <TabsContent value="watched">
        <EmptyState
          icon={<CheckCircle2 className="size-6" />}
          title="Nothing watched yet"
          description="Finished titles and household reviews will appear here once Supabase is connected."
        />
      </TabsContent>
    </Tabs>
  );
}
