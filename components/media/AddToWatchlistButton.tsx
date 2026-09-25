"use client";
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import type { CardMedia } from '@/lib/media-model';
import { addToWatchlist } from '@/app/actions/watchlist';

export function AddToWatchlistButton({ 
  media,
  disabled 
}: { 
  media: CardMedia; 
  disabled?: boolean 
}) {
  const [isPending, startTransition] = useTransition();
  const [isInWatchlist, setIsInWatchlist] = useState<'loading' | 'yes' | 'no'>('loading');

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('media').select('id').eq('id', media.id).maybeSingle();
      setIsInWatchlist(data ? 'yes' : 'no');
    };
    check();
  }, [media.id]);

  const handleClick = () => {
    startTransition(async () => {
      const result = await addToWatchlist(media);
      if (result.ok) {
        toast.success(`${media.title} added to watchlist`);
        setIsInWatchlist('yes');
      } else {
        toast.error(result.error);
      }
    });
 };

  if (isInWatchlist === 'loading') {
    return <Button disabled>Checking…</Button>;
  }

  if (isInWatchlist === 'yes') {
    return <Button disabled>Already in watchlist</Button>;
  }

  return (
    <Button 
      onClick={handleClick} 
      disabled={disabled || isPending}
    >
      {isPending ? 'Adding...' : 'Add to Watchlist'}
    </Button>
  );
}