/**
 * useDeckVisualizationData — Polls audio visualization data once per rAF frame.
 *
 * Instead of 7 independent rAF loops each calling getWaveform/getFFT/getLevel/
 * getBeatPhase independently, this hook runs ONE loop per deck and caches the
 * results in a module-level Map. Consumers read from the cache via getter functions.
 *
 * Multiple hook instances for the same deckId share a single rAF loop (refCounted).
 */

import { useEffect, useCallback, useRef } from 'react';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { getBeatPhaseInfo, type PhaseInfo } from '@/engine/dj/DJAutoSync';
import type { DeckId } from '@/engine/dj/DeckEngine';
import { DECK_SCOPE_CHANNELS } from '@/engine/dj/channelScopeTrack';
import { useDJStore } from '@/stores/useDJStore';
import { isSounding, subscribeSounding } from '@/engine/audio/signalPresence';
import { useViewActive } from '@/hooks/useFrameGate';

export interface DeckVizData {
  waveform: Float32Array | null;
  channelWaveforms: Float32Array[] | null;
  fft: Float32Array | null;
  level: number;
  beatPhase: PhaseInfo | null;
}

interface DeckCacheEntry {
  data: DeckVizData;
  refCount: number;
  rafId: number;
  /** Stops the loop and its wake subscriptions. */
  stop: () => void;
}

// Module-level cache: one entry per active deckId
const deckCaches = new Map<string, DeckCacheEntry>();

function sample(deckId: DeckId, entry: DeckCacheEntry): void {
  try {
    const deck = getDJEngine().getDeck(deckId);
    entry.data.waveform = deck.getWaveform();
    entry.data.channelWaveforms = deck.getChannelWaveforms(DECK_SCOPE_CHANNELS);
    entry.data.fft = deck.getFFT();
    entry.data.level = deck.getLevel();
  } catch {
    // Engine not ready — leave previous values (or nulls)
  }

  try {
    entry.data.beatPhase = getBeatPhaseInfo(deckId);
  } catch {
    entry.data.beatPhase = null;
  }
}

/**
 * The loop reads the deck's analysers every frame while their picture can
 * change: the deck plays (its beat phase moves even through a silent bar) or
 * the app sounds (a scratch, a cue, an effect tail on a stopped deck). Else
 * it takes one last reading and sleeps until either wakes it
 * (hooks/useFrameGate.ts) - no analyser is read in an idle app.
 */
function startLoop(deckId: DeckId, entry: DeckCacheEntry): void {
  let asleep = false;
  const live = () => isSounding() || useDJStore.getState().decks[deckId].isPlaying;
  const tick = () => {
    // Perf: skip work while the tab is hidden; loop stays armed.
    if (document.hidden) { entry.rafId = requestAnimationFrame(tick); return; }
    if (entry.refCount <= 0) return;
    sample(deckId, entry);
    if (live()) entry.rafId = requestAnimationFrame(tick);
    else asleep = true;
  };
  // Wakes for one reading at least (a seek moves the beat phase while
  // stopped); the tick decides whether to keep going.
  const wake = () => {
    if (!asleep) return;
    asleep = false;
    entry.rafId = requestAnimationFrame(tick);
  };
  const unsubs = [
    subscribeSounding(wake),
    useDJStore.subscribe((s) => s.decks[deckId].isPlaying, wake),
    useDJStore.subscribe((s) => s.decks[deckId].positionAnchor, wake),
  ];
  entry.stop = () => {
    cancelAnimationFrame(entry.rafId);
    unsubs.forEach((u) => u());
  };
  entry.rafId = requestAnimationFrame(tick);
}

export function useDeckVisualizationData(deckId: DeckId): {
  /** Read cached waveform (updated every rAF frame) */
  getWaveform: () => Float32Array | null;
  /** Read cached per-channel waveforms (updated every rAF frame) */
  getChannelWaveforms: () => Float32Array[] | null;
  /** Read cached FFT (updated every rAF frame) */
  getFFT: () => Float32Array | null;
  /** Read cached level in dB (updated every rAF frame) */
  getLevel: () => number;
  /** Read cached beat phase info (updated every rAF frame) */
  getBeatPhase: () => PhaseInfo | null;
} {
  // Keep deckId in a ref so getters always read the current one
  const deckIdRef = useRef(deckId);
  deckIdRef.current = deckId;

  // A DJ view kept mounted behind another view reads nothing.
  const viewActive = useViewActive();

  useEffect(() => {
    if (!viewActive) return;
    let existing = deckCaches.get(deckId);
    if (!existing) {
      existing = {
        data: {
          waveform: null,
          channelWaveforms: null,
          fft: null,
          level: -Infinity,
          beatPhase: null,
        },
        refCount: 0,
        rafId: 0,
        stop: () => {},
      };
      deckCaches.set(deckId, existing);
    }

    existing.refCount++;

    // Start the loop if this is the first subscriber
    if (existing.refCount === 1) {
      startLoop(deckId, existing);
    }

    return () => {
      const entry = deckCaches.get(deckId);
      if (!entry) return;
      entry.refCount--;
      if (entry.refCount <= 0) {
        entry.stop();
        deckCaches.delete(deckId);
      }
    };
  }, [deckId, viewActive]);

  const getWaveform = useCallback(
    () => deckCaches.get(deckIdRef.current)?.data.waveform ?? null,
    [],
  );
  const getChannelWaveforms = useCallback(
    () => deckCaches.get(deckIdRef.current)?.data.channelWaveforms ?? null,
    [],
  );
  const getFFT = useCallback(
    () => deckCaches.get(deckIdRef.current)?.data.fft ?? null,
    [],
  );
  const getLevel = useCallback(
    () => deckCaches.get(deckIdRef.current)?.data.level ?? -Infinity,
    [],
  );
  const getBeatPhase = useCallback(
    () => deckCaches.get(deckIdRef.current)?.data.beatPhase ?? null,
    [],
  );

  return { getWaveform, getChannelWaveforms, getFFT, getLevel, getBeatPhase };
}
