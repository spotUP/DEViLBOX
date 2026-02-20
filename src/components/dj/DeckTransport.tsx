/**
 * DeckTransport - Transport control buttons for one DJ deck
 *
 * Play/Pause, Cue, and Sync buttons styled as rubberized hardware buttons.
 */

import React, { useCallback } from 'react';
import { Play, Pause, Disc3, Link } from 'lucide-react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface DeckTransportProps {
  deckId: 'A' | 'B';
}

export const DeckTransport: React.FC<DeckTransportProps> = ({ deckId }) => {
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const cuePoint = useDJStore((s) => s.decks[deckId].cuePoint);
  const setDeckPlaying = useDJStore((s) => s.setDeckPlaying);

  const handlePlayPause = useCallback(async () => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);

    if (isPlaying) {
      deck.pause();
      setDeckPlaying(deckId, false);
    } else {
      await deck.play();
      setDeckPlaying(deckId, true);
    }
  }, [deckId, isPlaying, setDeckPlaying]);

  const handleCue = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    deck.cue(cuePoint);
  }, [deckId, cuePoint]);

  const handleSync = useCallback(() => {
    // Sync will be wired in a later phase
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        className={`
          flex items-center justify-center w-12 h-12 rounded-lg
          transition-all duration-100
          shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
          active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] active:translate-y-[1px]
          ${
            isPlaying
              ? 'bg-green-600 text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.4),0_0_12px_rgba(34,197,94,0.5)]'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-borderLight'
          }
        `}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>

      {/* Cue */}
      <button
        onClick={handleCue}
        className="
          flex items-center justify-center w-12 h-12 rounded-lg
          bg-dark-bgTertiary text-amber-400
          shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
          hover:bg-amber-900/30 hover:text-amber-300
          active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] active:translate-y-[1px]
          transition-all duration-100
        "
        title="Cue"
      >
        <Disc3 size={20} />
      </button>

      {/* Sync */}
      <button
        onClick={handleSync}
        className="
          flex items-center justify-center w-10 h-10 rounded-lg
          bg-dark-bgTertiary text-text-muted
          shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
          hover:bg-dark-borderLight hover:text-text-secondary
          active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] active:translate-y-[1px]
          transition-all duration-100
        "
        title="Sync"
      >
        <Link size={16} />
      </button>
    </div>
  );
};
