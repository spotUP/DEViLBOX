/**
 * DeckTransport - Transport control buttons for one DJ deck
 *
 * Play/Pause, Cue, and Sync buttons styled as rubberized hardware buttons.
 */

import React, { useCallback, useState } from 'react';
import { Play, Pause, Disc3, Link, Lock } from 'lucide-react';
import { useDJStore } from '@/stores/useDJStore';
import { useShallow } from 'zustand/react/shallow';
import * as DJActions from '@/engine/dj/DJActions';

interface DeckTransportProps {
  deckId: 'A' | 'B' | 'C';
}

export const DeckTransport: React.FC<DeckTransportProps> = ({ deckId }) => {
  const { isPlaying, cuePoint, keyLockEnabled, pendingAction, thisBPM } = useDJStore(
    useShallow((s) => ({
      isPlaying: s.decks[deckId].isPlaying,
      cuePoint: s.decks[deckId].cuePoint,
      keyLockEnabled: s.decks[deckId].keyLockEnabled,
      pendingAction: s.decks[deckId].pendingAction,
      // Perf: quantize to 0.1 BPM (sync threshold is 0.5) so per-frame deck-sync
      // writes don't re-render the transport 20×/s in tracker mode.
      thisBPM: Math.round(s.decks[deckId].effectiveBPM * 10) / 10,
    })),
  );
  const otherDeckId = deckId === 'A' ? 'B' : deckId === 'B' ? 'A' : 'A';
  const otherBPM = useDJStore((s) => Math.round(s.decks[otherDeckId].effectiveBPM * 10) / 10);
  const isSynced = Math.abs(thisBPM - otherBPM) < 0.5;

  const [isStartingPlay, setIsStartingPlay] = useState(false);

  // The play button shows pending only while waiting for a deferred PLAY.
  // The cue button shows pending only while waiting for a deferred CUE.
  const playPending = pendingAction?.kind === 'play';
  const cuePending = pendingAction?.kind === 'cue';
  const isPending = isStartingPlay || playPending;

  const handlePlayPause = useCallback(async () => {
    if (!isPlaying) setIsStartingPlay(true);
    try {
      await DJActions.togglePlay(deckId);
    } catch (err) {
      console.error('[DeckTransport] Play failed:', err);
    }
    setIsStartingPlay(false);
  }, [deckId, isPlaying]);

  const handleCue = useCallback(() => {
    DJActions.cueDeck(deckId, cuePoint);
  }, [deckId, cuePoint]);

  const handleKeyLock = useCallback(() => {
    DJActions.setDeckKeyLock(deckId, !keyLockEnabled);
  }, [deckId, keyLockEnabled]);

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
              ? 'bg-accent-primary text-text-inverse animate-pulse'
              : isPlaying
                ? 'bg-accent-primary text-text-inverse'
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
            : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'}
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
              ? 'bg-accent-primary/30 text-accent-primary'
              : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary'
          }
        `}
        title="Sync"
      >
        <Link size={16} />
      </button>

      {/* Key Lock (master tempo) — pitch fader drives tempo only when ON */}
      <button
        onClick={handleKeyLock}
        className={`
          flex items-center justify-center w-10 h-10 rounded-lg
          border border-dark-border
          active:translate-y-[1px]
          transition-all duration-100
          ${
            keyLockEnabled
              ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
              : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary'
          }
        `}
        title={keyLockEnabled ? 'Key Lock ON — pitch slider changes tempo only' : 'Key Lock OFF — pitch and tempo coupled'}
      >
        <Lock size={14} />
      </button>
    </div>
  );
};
