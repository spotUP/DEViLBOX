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
}

// Module-level cache: one entry per active deckId
const deckCaches = new Map<string, DeckCacheEntry>();

function startLoop(deckId: DeckId, entry: DeckCacheEntry): void {
  const tick = () => {
    if (entry.refCount <= 0) {
      // Don't schedule another frame — loop is done
      return;
    }

    try {
      const deck = getDJEngine().getDeck(deckId);
      entry.data.waveform = deck.getWaveform();
      entry.data.channelWaveforms = deck.getChannelWaveforms(4);
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

    entry.rafId = requestAnimationFrame(tick);
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

  useEffect(() => {
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
        cancelAnimationFrame(entry.rafId);
        deckCaches.delete(deckId);
      }
    };
  }, [deckId]);

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
