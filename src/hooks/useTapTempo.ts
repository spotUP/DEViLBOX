/**
 * useTapTempo - Hook for calculating BPM from tap intervals
 *
 * Based on OpenMPT's tap tempo feature:
 * - Supports 2-8 taps for averaging
 * - Auto-resets after 2 seconds of inactivity
 * - Clamps BPM to valid range (20-999)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface TapTempoResult {
  bpm: number | null;
  tapCount: number;
  isActive: boolean;
  tap: () => void;
  reset: () => void;
}

const MIN_BPM = 20;
const MAX_BPM = 999;
const MAX_TAPS = 8;
const RESET_TIMEOUT_MS = 2000;

export function useTapTempo(onBPMChange?: (bpm: number) => void): TapTempoResult {
  const [tapCount, setTapCount] = useState(0);
  const [calculatedBPM, setCalculatedBPM] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  const tapTimesRef = useRef<number[]>([]);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    tapTimesRef.current = [];
    setTapCount(0);
    setCalculatedBPM(null);
    setIsActive(false);
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  // Cleanup timeout on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const tap = useCallback(() => {
    const now = performance.now();

    // Clear any existing reset timer
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    // Check if we should reset (too long since last tap)
    const lastTap = tapTimesRef.current[tapTimesRef.current.length - 1];
    if (lastTap && (now - lastTap) > RESET_TIMEOUT_MS) {
      tapTimesRef.current = [];
    }

    // Add new tap
    tapTimesRef.current.push(now);
    setIsActive(true);

    // Keep only the last MAX_TAPS
    if (tapTimesRef.current.length > MAX_TAPS) {
      tapTimesRef.current = tapTimesRef.current.slice(-MAX_TAPS);
    }

    const taps = tapTimesRef.current;
    setTapCount(taps.length);

    // Need at least 2 taps to calculate BPM
    if (taps.length >= 2) {
      // Calculate intervals between consecutive taps
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }

      // Calculate average interval
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      // Convert to BPM (60000ms / interval = BPM)
      let bpm = Math.round(60000 / avgInterval);

      // Clamp to valid range
      bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));

      setCalculatedBPM(bpm);

      // Notify callback
      if (onBPMChange) {
        onBPMChange(bpm);
      }
    }

    // Set auto-reset timer
    resetTimerRef.current = setTimeout(() => {
      setIsActive(false);
    }, RESET_TIMEOUT_MS);
  }, [onBPMChange]);

  return {
    bpm: calculatedBPM,
    tapCount,
    isActive,
    tap,
    reset,
  };
}
