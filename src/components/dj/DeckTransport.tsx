/**
 * DeckTransport - Transport control buttons for one DJ deck
 *
 * Play/Pause, Cue, and Sync buttons styled as rubberized hardware buttons.
 */

import React, { useCallback, useState } from 'react';
import { Play, Pause, Disc3, Link } from 'lucide-react';
import { useDJStore } from '@/stores/useDJStore';
import { getQuantizeMode, setQuantizeMode, type QuantizeMode } from '@/engine/dj/DJQuantizedFX';
import * as DJActions from '@/engine/dj/DJActions';

interface DeckTransportProps {
  deckId: 'A' | 'B' | 'C';
}

export const DeckTransport: React.FC<DeckTransportProps> = ({ deckId }) => {
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const cuePoint = useDJStore((s) => s.decks[deckId].cuePoint);
  const pendingAction = useDJStore((s) => s.decks[deckId].pendingAction);
  const otherDeckId = deckId === 'A' ? 'B' : 'A';
  const thisBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const otherBPM = useDJStore((s) => s.decks[otherDeckId].effectiveBPM);
  const isSynced = Math.abs(thisBPM - otherBPM) < 0.5;

  const [qMode, setQMode] = useState<QuantizeMode>(getQuantizeMode);
  const [isStartingPlay, setIsStartingPlay] = useState(false);

  // The play button shows pending only while waiting for a deferred PLAY.
  // The cue button shows pending only while waiting for a deferred CUE.
  const playPending = pendingAction?.kind === 'play';
  const cuePending = pendingAction?.kind === 'cue';
  const isPending = isStartingPlay || playPending;

  const handlePlayPause = useCallback(async () => {
    if (!isPlaying) setIsStartingPlay(true);
    await DJActions.togglePlay(deckId);
    setIsStartingPlay(false);
  }, [deckId, isPlaying]);

  const handleCue = useCallback(() => {
    DJActions.cueDeck(deckId, cuePoint);
  }, [deckId, cuePoint]);

  const handleQuantizeCycle = useCallback(() => {
    const modes: QuantizeMode[] = ['off', 'beat', 'bar'];
    const nextIdx = (modes.indexOf(qMode) + 1) % modes.length;
    const next = modes[nextIdx];
    setQuantizeMode(next);
    setQMode(next);
  }, [qMode]);

  const handleSync = useCallback(() => {
    DJActions.syncDeckBPM(deckId, otherDeckId);
  }, [deckId, otherDeckId]);

  return (
    <div className="flex items-center gap-2">
      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        disabled={isPending}
        className={`
          flex items-center justify-center w-10 h-10 rounded-lg
          transition-all duration-100 border border-dark-border
          active:translate-y-[1px]
          ${
            isPending
              ? 'bg-yellow-600 text-text-primary animate-pulse'
              : isPlaying
                ? 'bg-green-600 text-text-primary'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
          }
        `}
        title={isPending ? 'Waiting for beat...' : isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>

      {/* Cue */}
      <button
        onClick={handleCue}
        className={`
          flex items-center justify-center w-10 h-10 rounded-lg
          border border-dark-border
          active:translate-y-[1px]
          transition-all duration-100
          ${cuePending
            ? 'bg-accent-primary/30 text-accent-primary animate-pulse'
            : 'bg-dark-bgTertiary text-accent-warning hover:bg-dark-bgHover'}
        `}
        title={cuePending ? 'Waiting for beat...' : 'Cue'}
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
              ? 'bg-accent-highlight/30 text-accent-highlight'
              : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary'
          }
        `}
        title="Sync"
      >
        <Link size={16} />
      </button>

      {/* Quantize */}
      <button
        onClick={handleQuantizeCycle}
        className={`
          flex items-center justify-center h-10 px-2.5 rounded-lg
          border text-[11px] font-bold tracking-wide
          active:translate-y-[1px]
          transition-all duration-100
          ${
            qMode === 'off'
              ? 'bg-dark-bgTertiary text-text-muted border-dark-border hover:bg-dark-bgHover'
              : qMode === 'beat'
                ? 'bg-violet-600/40 text-violet-200 border-violet-400/60 shadow-[0_0_6px_rgba(139,92,246,0.3)]'
                : 'bg-fuchsia-600/40 text-fuchsia-200 border-fuchsia-400/60 shadow-[0_0_6px_rgba(217,70,239,0.3)]'
          }
        `}
        title={`Quantize: ${qMode.toUpperCase()}\nOFF = free play\nBEAT = snap to beat\nBAR = snap to bar\n(click to cycle)`}
      >
        {qMode === 'off' ? 'Q' : qMode === 'beat' ? 'Q:BT' : 'Q:BR'}
      </button>

    </div>
  );
};
