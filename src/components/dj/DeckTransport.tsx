/**
 * DeckTransport - Transport control buttons for one DJ deck
 *
 * Play/Pause, Cue, and Sync buttons styled as rubberized hardware buttons.
 */

import React, { useCallback } from 'react';
import { Play, Pause, Disc3, Link } from 'lucide-react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { DJBeatSync } from '@/engine/dj/DJBeatSync';

interface DeckTransportProps {
  deckId: 'A' | 'B';
}

export const DeckTransport: React.FC<DeckTransportProps> = ({ deckId }) => {
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const cuePoint = useDJStore((s) => s.decks[deckId].cuePoint);
  const setDeckPlaying = useDJStore((s) => s.setDeckPlaying);
  const otherDeckId = deckId === 'A' ? 'B' : 'A';
  const thisBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const otherBPM = useDJStore((s) => s.decks[otherDeckId].effectiveBPM);
  const isSynced = Math.abs(thisBPM - otherBPM) < 0.5;

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
    try {
      const engine = getDJEngine();
      const thisDeck = engine.getDeck(deckId);
      const otherDeck = engine.getDeck(otherDeckId);
      if (!otherDeck.replayer.getSong()) return; // Other deck has no song loaded

      const semitones = DJBeatSync.syncBPM(otherDeck, thisDeck);
      useDJStore.getState().setDeckPitch(deckId, semitones);
      // Store subscription in DJDeck.tsx propagates to engine automatically
    } catch {
      // Engine might not be initialized yet
    }
  }, [deckId, otherDeckId]);

  return (
    <div className="flex items-center gap-2">
      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        className={`
          flex items-center justify-center w-10 h-10 rounded-lg
          transition-all duration-100 border border-dark-border
          active:translate-y-[1px]
          ${
            isPlaying
              ? 'bg-green-600 text-white'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
          }
        `}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>

      {/* Cue */}
      <button
        onClick={handleCue}
        className="
          flex items-center justify-center w-10 h-10 rounded-lg
          bg-dark-bgTertiary text-accent-warning border border-dark-border
          hover:bg-dark-bgHover
          active:translate-y-[1px]
          transition-all duration-100
        "
        title="Cue"
      >
        <Disc3 size={18} />
      </button>

      {/* Sync */}
      <button
        onClick={handleSync}
        className={`
          flex items-center justify-center w-10 h-10 rounded-lg
          border border-dark-border
          active:translate-y-[1px]
          transition-all duration-100
          ${
            isSynced
              ? 'bg-cyan-600/30 text-cyan-300'
              : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary'
          }
        `}
        title="Sync"
      >
        <Link size={16} />
      </button>
    </div>
  );
};
