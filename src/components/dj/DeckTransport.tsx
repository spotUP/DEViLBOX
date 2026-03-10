/**
 * DeckTransport - Transport control buttons for one DJ deck
 *
 * Play/Pause, Cue, and Sync buttons styled as rubberized hardware buttons.
 */

import React, { useCallback, useState } from 'react';
import { Play, Pause, Disc3, Link, Lock } from 'lucide-react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { DJBeatSync } from '@/engine/dj/DJBeatSync';
import { syncBPMToOther, phaseAlign, quantizedPlay } from '@/engine/dj/DJAutoSync';
import { getQuantizeMode, setQuantizeMode, type QuantizeMode } from '@/engine/dj/DJQuantizedFX';

interface DeckTransportProps {
  deckId: 'A' | 'B' | 'C';
}

export const DeckTransport: React.FC<DeckTransportProps> = ({ deckId }) => {
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const cuePoint = useDJStore((s) => s.decks[deckId].cuePoint);
  const keyLockEnabled = useDJStore((s) => s.decks[deckId].keyLockEnabled);
  const setDeckPlaying = useDJStore((s) => s.setDeckPlaying);
  const otherDeckId = deckId === 'A' ? 'B' : 'A';
  const thisBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const otherBPM = useDJStore((s) => s.decks[otherDeckId].effectiveBPM);
  const otherIsPlaying = useDJStore((s) => s.decks[otherDeckId].isPlaying);
  const isSynced = Math.abs(thisBPM - otherBPM) < 0.5;

  const [qMode, setQMode] = useState<QuantizeMode>(getQuantizeMode);
  const [isPending, setIsPending] = useState(false);

  const handlePlayPause = useCallback(async () => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);

    if (isPlaying) {
      deck.pause();
      setDeckPlaying(deckId, false);
    } else {
      // Use quantized play if:
      // 1. Quantize mode is 'beat' or 'bar'
      // 2. The other deck is currently playing
      const currentQMode = getQuantizeMode();
      if (currentQMode !== 'off' && otherIsPlaying) {
        setIsPending(true);
        await quantizedPlay(deckId, currentQMode);
        setIsPending(false);
      } else {
        await deck.play();
        setDeckPlaying(deckId, true);
      }
    }
  }, [deckId, isPlaying, otherIsPlaying, setDeckPlaying]);

  const handleCue = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    deck.cue(cuePoint);
  }, [deckId, cuePoint]);

  const handleQuantizeCycle = useCallback(() => {
    const modes: QuantizeMode[] = ['off', 'beat', 'bar'];
    const nextIdx = (modes.indexOf(qMode) + 1) % modes.length;
    const next = modes[nextIdx];
    setQuantizeMode(next);
    setQMode(next);
  }, [qMode]);

  const handleKeyLock = useCallback(() => {
    const next = !keyLockEnabled;
    useDJStore.getState().setDeckKeyLock(deckId, next);
    try {
      getDJEngine().getDeck(deckId).setKeyLock(next);
    } catch {
      // Engine not ready
    }
  }, [deckId, keyLockEnabled]);

  const handleSync = useCallback(() => {
    try {
      const engine = getDJEngine();
      const thisDeck = engine.getDeck(deckId);
      const otherDeck = engine.getDeck(otherDeckId);
      const store = useDJStore.getState();
      const otherState = store.decks[otherDeckId];
      const thisState = store.decks[deckId];

      // Check if other deck has a track loaded (either mode)
      if (!otherState.fileName) return;

      // Ensure crossfader is fully on the OTHER deck so no audio leaks
      // crossfader: 0 = deck A, 1 = deck B
      const cf = store.crossfaderPosition;
      if (deckId === 'A' && cf < 1) store.setCrossfader(1);
      else if (deckId === 'B' && cf > 0) store.setCrossfader(0);

      // If both decks have analysis beat grids, use precise BPM sync + phase align
      if (thisState.beatGrid && otherState.beatGrid) {
        const semitones = syncBPMToOther(deckId, otherDeckId);
        store.setDeckPitch(deckId, semitones);
        phaseAlign(deckId, otherDeckId);
      } else if (otherDeck.playbackMode === 'audio' || thisDeck.playbackMode === 'audio') {
        // For audio mode, match BPM via the detected values in the store
        const targetBPM = otherState.detectedBPM;
        const thisBPMBase = thisState.detectedBPM;
        if (targetBPM > 0 && thisBPMBase > 0) {
          const ratio = targetBPM / thisBPMBase;
          const semitones = 12 * Math.log2(ratio);
          store.setDeckPitch(deckId, semitones);
        }
      } else {
        if (!otherDeck.replayer.getSong()) return;
        const semitones = DJBeatSync.syncBPM(otherDeck, thisDeck);
        store.setDeckPitch(deckId, semitones);
      }

      // Auto-play if this deck isn't playing yet
      if (!thisState.isPlaying) {
        thisDeck.play().then(() => {
          useDJStore.getState().setDeckPlaying(deckId, true);
        });
      }
    } catch {
      // Engine might not be initialized yet
    }
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
              ? 'bg-yellow-600 text-white animate-pulse'
              : isPlaying
                ? 'bg-green-600 text-white'
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

      {/* Key Lock (master tempo) */}
      <button
        onClick={handleKeyLock}
        className={`
          flex items-center justify-center w-10 h-10 rounded-lg
          border border-dark-border
          active:translate-y-[1px]
          transition-all duration-100
          ${
            keyLockEnabled
              ? 'bg-amber-600/30 text-amber-300 border-amber-500/40'
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
