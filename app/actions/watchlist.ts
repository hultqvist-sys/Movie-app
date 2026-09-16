"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CardMedia } from "@/lib/media-model";
import type { Media, MediaStatus } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return { ok: false as const, error: "Not authenticated" };
  }
  
  return { ok: true as const, user };
}

export async function addToWatchlist(media: CardMedia): Promise<ActionResult> {
  const supabase = await createClient();
  const authResult = await requireUser(supabase);
  if (!authResult.ok) return authResult;

  try {
    const { error } = await supabase
      .from("media")
      .upsert(
        {
          id: media.id,
          title: media.title,
          type: media.type,
          poster_path: media.posterPath,
          status: "watchlist" as MediaStatus,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );

    if (error) {
      if (error.code === "23505") {
        // Ignore duplicate key errors due to ignoreDuplicates
        return { ok: true };
      }
      return { ok: false, error: error.message };
    }

    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    console.error("Failed to add to watchlist:", err);
    return { ok: false, error: "Failed to add to watchlist" };
  }
}

export async function markCurrentlyWatching(mediaId: number): Promise<ActionResult> {
  const supabase = await createClient();
  const authResult = await requireUser(supabase);
  if (!authResult.ok) return authResult;

  try {
    const { error } = await supabase
      .from("media")
      .update({ status: "currently_watching" as MediaStatus })
      .eq("id", mediaId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    console.error("Failed to mark as currently watching:", err);
    return { ok: false, error: "Failed to update status" };
  }
}

export async function removeFromWatchlist(
  mediaId: number,
  force = false
): Promise<ActionResult> {
  const supabase = await createClient();
  const authResult = await requireUser(supabase);
  if (!authResult.ok) return authResult;

  try {
    // Check for dependent votes and reviews
    if (!force) {
      const { count: voteCount } = await supabase
        .from("votes")
        .select("*", { count: "exact" })
        .eq("media_id", mediaId);

      const { count: reviewCount } = await supabase
        .from("reviews")
        .select("*", { count: "exact" })
        .eq("media_id", mediaId);

      if ((voteCount || 0) > 0 || (reviewCount || 0) > 0) {
        return {
          ok: false,
          error: `This item has ${voteCount} votes and ${reviewCount} reviews. Deleting it will permanently remove all associated data.`,
        };
      }
    }

    // Delete the media row (cascades to votes, reviews, notifications)
    const { error } = await supabase
      .from("media")
      .delete()
      .eq("id", mediaId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    console.error("Failed to remove from watchlist:", err);
    return { ok: false, error: "Failed to remove from watchlist" };
  }
}