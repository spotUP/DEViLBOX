/**
 * DeckCuePoints - Hot cue button strip for audio files (8 slots, Serato standard)
 *
 * Colored buttons matching Serato cue point colors.
 * Click to jump to the cue point position.
 */

import React, { useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface DeckCuePointsProps {
  deckId: 'A' | 'B';
}

export const DeckCuePoints: React.FC<DeckCuePointsProps> = ({ deckId }) => {
  const cuePoints = useDJStore((s) => s.decks[deckId].seratoCuePoints);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);

  const handleCueClick = useCallback((positionMs: number) => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const seconds = positionMs / 1000;
      if (deck.playbackMode === 'audio') {
        deck.audioPlayer.seek(seconds);
        useDJStore.getState().setDeckState(deckId, {
          audioPosition: seconds,
          elapsedMs: positionMs,
        });
      }
    } catch {
      // Engine not ready
    }
  }, [deckId]);

  if (playbackMode !== 'audio' || cuePoints.length === 0) return null;

  // Build 8 slots (Serato standard), fill with actual cue points
  const slots = Array.from({ length: 8 }, (_, i) =>
    cuePoints.find((c) => c.index === i) ?? null
  );

  return (
    <div className="flex gap-1">
      {slots.map((cue, i) => (
        <button
          key={i}
          onClick={cue ? () => handleCueClick(cue.position) : undefined}
          disabled={!cue}
          className="flex-1 h-6 rounded text-[9px] font-mono font-bold transition-all border border-transparent"
          style={cue ? {
            backgroundColor: `${cue.color}30`,
            borderColor: `${cue.color}80`,
            color: cue.color,
          } : {
            backgroundColor: 'rgba(255,255,255,0.03)',
            color: 'rgba(255,255,255,0.15)',
          }}
          title={cue ? `${cue.name || `Cue ${i + 1}`} — ${formatCueTime(cue.position)}` : `Cue ${i + 1} (empty)`}
        >
          {cue ? (cue.name || (i + 1)) : (i + 1)}
        </button>
      ))}
    </div>
  );
};

function formatCueTime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}:${String(s).padStart(2, '0')}`;
}
