/**
 * useDeckStateSync — Headless hook that polls playback state from the DJ engine
 * and pushes it to the store at ~20fps.
 *
 * Mounted at the DJView level so it runs regardless of deck view mode (DOM, Vinyl, 3D).
 * This fixes the bug where 3D mode got zero position updates because DJDeck.tsx
 * (which previously owned the polling) is not mounted in 3D mode.
 */

import { useEffect, useRef } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { isSeekActive } from '@/components/dj/seekGuard';
import type { DeckId } from '@/engine/dj/DeckEngine';

export function useDeckStateSync(deckId: DeckId): void {
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    let running = true;
    let lastPoll = 0;
    const POLL_INTERVAL = 50; // 50ms = 20fps — sufficient for position display

    const poll = () => {
      if (!running) return;

      // Throttle: skip frames to reduce store broadcasts
      const now = performance.now();
      if (now - lastPoll < POLL_INTERVAL) {
        animFrameRef.current = requestAnimationFrame(poll);
        return;
      }
      lastPoll = now;

      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        const store = useDJStore.getState();

        if (deck.playbackMode === 'audio') {
          const isEngPlaying = deck.audioPlayer.isCurrentlyPlaying();
          const isStorePlaying = store.decks[deckId].isPlaying;

          // Always update position when either the engine or store says we're playing.
          // This prevents position freezing when the Tone.js Player state briefly flickers
          // or the browser throttles the audio context.
          if ((isEngPlaying || isStorePlaying) && !isSeekActive(deckId)) {
            const pos = deck.audioPlayer.getPosition();
            const dur = deck.audioPlayer.getDuration();
            const update: Record<string, unknown> = {
              audioPosition: pos,
              elapsedMs: pos * 1000,
              durationMs: dur * 1000,
            };
            // Derive pattern position from audio time for pre-rendered modules
            const tp = deck.getPositionAtTime(pos * 1000);
            if (tp) {
              update.songPos = tp.songPos;
              update.pattPos = tp.pattPos;
            }
            store.setDeckState(deckId, update);
          }
          // Detect end of audio playback — but don't interfere with AutoDJ
          // or scratch mode (audioPlayer is paused during backward scratch).
          if (!isEngPlaying && isStorePlaying) {
            const autoDJActive = store.autoDJEnabled && store.autoDJStatus !== 'idle';
            const scratchActive = deck.isScratchActive;
            if (!autoDJActive && !scratchActive) {
              store.setDeckPlaying(deckId, false);
            }
          }
        } else {
          // Tracker module mode — poll replayer position
          const replayer = deck.replayer;
          if (replayer.isPlaying()) {
            // Coalesce all deck state into a single setDeckState call
            // to avoid multiple Immer writes per poll
            const deckUpdate: Record<string, unknown> = {
              songPos: replayer.getSongPos(),
              pattPos: replayer.getPattPos(),
            };

            if (deck.isPatternActive()) {
              // Push scratch velocity + fader gain to store so UI reacts
              const { velocity, faderGain } = deck.getScratchState();
              const prevV = store.decks[deckId].scratchVelocity;
              const prevF = store.decks[deckId].scratchFaderGain;
              if (Math.abs(velocity - prevV) > 0.05) deckUpdate.scratchVelocity = velocity;
              if (faderGain !== prevF) deckUpdate.scratchFaderGain = faderGain;
            } else {
              const liveBPM = Math.round(replayer.getBPM() * replayer.getTempoMultiplier() * 100) / 100;
              deckUpdate.elapsedMs = replayer.getElapsedMs();
              deckUpdate.effectiveBPM = liveBPM;
              // Relay BPM changes to ScratchPlayback for LFO resync
              try { deck.notifyBPMChange(liveBPM); } catch { /* engine not ready */ }

              // Fader LFO without pattern: estimate visual fader state from timing
              const lfoDiv = store.decks[deckId].faderLFODivision;
              if (store.decks[deckId].faderLFOActive && lfoDiv) {
                const divBeats: Record<string, number> = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125 };
                const periodMs = (60000 / liveBPM) * (divBeats[lfoDiv] ?? 1);
                const elapsed = replayer.getElapsedMs();
                const posInPeriod = elapsed % periodMs;
                const lfoFaderGain = posInPeriod < periodMs * 0.5 ? 1 : 0;
                if (lfoFaderGain !== store.decks[deckId].scratchFaderGain) {
                  deckUpdate.scratchFaderGain = lfoFaderGain;
                }
              } else if (store.decks[deckId].scratchVelocity !== 0 || store.decks[deckId].scratchFaderGain !== 1) {
                // Clear scratch state when not scratching
                deckUpdate.scratchVelocity = 0;
                deckUpdate.scratchFaderGain = 1;
              }
            }

            store.setDeckState(deckId, deckUpdate);
          }

          // Auto-clear activePatternName when a one-shot pattern finishes naturally
          if (!deck.isPatternActive() && store.decks[deckId].activePatternName !== null) {
            store.setDeckPattern(deckId, null);
          }
        }
      } catch (err) {
        // Engine might not be initialized yet — log so live-set issues are diagnosable
        console.warn('[useDeckStateSync] poll error:', err);
      }

      animFrameRef.current = requestAnimationFrame(poll);
    };

    animFrameRef.current = requestAnimationFrame(poll);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [deckId]);
}
