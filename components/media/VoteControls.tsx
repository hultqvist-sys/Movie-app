'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { VoteValue } from '@/types/database.types';
import { castVote, clearVote } from '@/app/actions/votes';

interface VoteControlsProps {
  mediaId: number;
  score: number;
  myVote: VoteValue | null;
  breakdown: { displayName: string; voteValue: VoteValue }[];
  isGuest?: boolean;
}

type OptimisticState = {
  score: number;
  myVote: VoteValue | null;
};

export function VoteControls({ 
  mediaId, 
  score, 
  myVote, 
  breakdown,
  isGuest = false 
}: VoteControlsProps) {
  const [isPending, startTransition] = useTransition();
  
  const [optimisticState, addOptimisticVote] = useOptimistic(
    { score, myVote },
    (state: OptimisticState, newVote: VoteValue | null): OptimisticState => {
      let scoreDelta = 0;
      
      // Remove old vote contribution
      if (state.myVote !== null) {
        scoreDelta -= state.myVote;
      }
      
      // Add new vote contribution
      if (newVote !== null) {
        scoreDelta += newVote;
      }
      
      return {
        score: state.score + scoreDelta,
        myVote: newVote
      };
    }
  );

  const handleVote = (voteValue: VoteValue) => {
    if (isGuest) return;

    const newVote = optimisticState.myVote === voteValue ? null : voteValue;
    addOptimisticVote(newVote);

    startTransition(async () => {
      const result = newVote === null 
        ? await clearVote(mediaId)
        : await castVote(mediaId, voteValue);

      if (!result.ok) {
        toast.error(result.error);
        // Optimistic state will be reverted automatically on next render
      }
    });
  };

  const voteButtons = [
    { value: 2 as VoteValue, label: '+2', variant: 'default' as const },
    { value: 1 as VoteValue, label: '+1', variant: 'secondary' as const },
    { value: -1 as VoteValue, label: '−1', variant: 'destructive' as const }
  ];

  const ScoreDisplay = () => (
    <span className="tabular-nums font-medium">
      {optimisticState.score > 0 ? '+' : ''}{optimisticState.score}
    </span>
  );

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {!isGuest && (
        <div className="flex gap-1">
          {voteButtons.map(({ value, label, variant }) => (
            <Button
              key={value}
              size="sm"
              variant={optimisticState.myVote === value ? variant : 'outline'}
              onClick={() => handleVote(value)}
              disabled={isPending}
              className="h-8 min-w-[2.5rem] text-xs"
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      
      <div className="ml-auto">
        {isGuest ? (
          <ScoreDisplay />
        ) : (
          <Dialog>
            <DialogTrigger 
              render={<Button variant="ghost" size="sm" className="h-8 px-2" />} 
                >
                  <ScoreDisplay />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Vote Breakdown</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {breakdown.length > 0 ? (
                  breakdown.map((vote, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span>{vote.displayName}</span>
                      <span className="font-medium tabular-nums">
                        {vote.voteValue > 0 ? '+' : ''}{vote.voteValue}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No votes yet</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}