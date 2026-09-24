'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { VoteValue } from '@/types/database.types';

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return { ok: false as const, error: 'Not authenticated' };
  }
  
  return { ok: true as const, user, supabase };
}

export async function castVote(mediaId: number, voteValue: VoteValue): Promise<ActionResult> {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult;

  const { user, supabase } = authResult;

  try {
    const { error } = await supabase
      .from('votes')
      .upsert(
        {
          media_id: mediaId,
          user_id: user.id,
          vote_value: voteValue,
        },
        { onConflict: 'media_id,user_id' }
      );

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath('/');
    return { ok: true };
  } catch (err) {
    console.error('Failed to cast vote:', err);
    return { ok: false, error: 'Failed to cast vote' };
  }
}

export async function clearVote(mediaId: number): Promise<ActionResult> {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult;

  const { user, supabase } = authResult;

  try {
    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('media_id', mediaId)
      .eq('user_id', user.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath('/');
    return { ok: true };
  } catch (err) {
    console.error('Failed to clear vote:', err);
    return { ok: false, error: 'Failed to clear vote' };
  }
}