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
import * as Tone from 'tone';
import { heardDeckRow, trackerRowFrom } from './heardDeckRow';
import { heardAnchorMs, type ClockAnchor, type OutputClockSource } from '@/engine/audioLatency';

export function useDeckStateSync(deckId: DeckId): void {
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    let running = true;
    let lastPoll = 0;
    const POLL_INTERVAL = 50; // 50ms = 20fps — sufficient for position display

    const poll = () => {
      // Perf: skip work while the tab is hidden; loop stays armed.
      if (document.hidden) { animFrameRef.current = requestAnimationFrame(poll); return; }
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
          // A moving anchor on a deck whose player is stopped (a load's
          // silent scratch-buffer priming plays ~150 ms) is written once
          // more at rate 0 - otherwise the turntables keep turning.
          const anchorMoving = store.decks[deckId].positionAnchor.rate !== 0;
          if ((isEngPlaying || isStorePlaying || anchorMoving) && !isSeekActive(deckId)) {
            // The HEARD position (DeckEngine.getHeardPosition): what the listener hears now, not where
            // the player has rendered to. Every DJ visual reads this field.
            const pos = deck.getHeardPosition();
            const dur = deck.audioPlayer.getDuration();
            // The clock anchor: the heard position, when it reaches the ear and
            // how fast it moves - per-frame visuals extrapolate it between polls.
            const positionAnchor: ClockAnchor = {
              positionSec: pos,
              rate: isEngPlaying ? deck.audioPlayer.getPlaybackRate() : 0,
              anchorMs: heardAnchorMs(Tone.getContext().rawContext as unknown as OutputClockSource),
            };
            const update: Record<string, unknown> = {
              audioPosition: pos,
              elapsedMs: pos * 1000,
              durationMs: dur * 1000,
              positionAnchor,
            };
            // Derive pattern position from audio time for pre-rendered modules
            const tp = heardDeckRow(deck, positionAnchor, positionAnchor.anchorMs);
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
            // The HEARD row from the replayer's display ring (scheduled rows run up to the lookahead
            // ahead of the ear); the replayer's own counters only when the ring has nothing yet.
            const heard = deck.getHeardTrackerState();
            const row = trackerRowFrom(heard, replayer);
            const deckUpdate: Record<string, unknown> = { songPos: row.songPos, pattPos: row.pattPos };

            if (deck.isPatternActive()) {
              // Push scratch velocity + fader gain to store so UI reacts
              const { velocity, faderGain } = deck.getScratchState();
              const prevV = store.decks[deckId].scratchVelocity;
              const prevF = store.decks[deckId].scratchFaderGain;
              if (Math.abs(velocity - prevV) > 0.05) deckUpdate.scratchVelocity = velocity;
              if (faderGain !== prevF) deckUpdate.scratchFaderGain = faderGain;
            } else {
              const liveBPM = Math.round(replayer.getBPM() * replayer.getTempoMultiplier() * 100) / 100;
              const elapsedMs = heard?.elapsedMs ?? replayer.getElapsedMs();
              deckUpdate.elapsedMs = elapsedMs;
              // Song time advances at the tempo multiplier; anchored where it is heard.
              deckUpdate.positionAnchor = {
                positionSec: elapsedMs / 1000,
                rate: replayer.getTempoMultiplier(),
                anchorMs: heardAnchorMs(Tone.getContext().rawContext as unknown as OutputClockSource),
              } satisfies ClockAnchor;
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
