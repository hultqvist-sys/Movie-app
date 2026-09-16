"use client";
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

  const handleClick = () => {
    startTransition(async () => {
      const result = await addToWatchlist(media);
      if (result.ok) {
        toast.success(`${media.title} added to watchlist`);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Button 
      onClick={handleClick} 
      disabled={disabled || isPending}
    >
      {isPending ? 'Adding...' : 'Add to Watchlist'}
    </Button>
  );
}