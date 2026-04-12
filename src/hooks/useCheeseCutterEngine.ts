/**
 * useCheeseCutterEngine.ts
 *
 * React hook that bridges the CheeseCutter Zustand store with the C64SIDEngine.
 * Acquires the engine from TrackerReplayer when a .ct file is loaded
 * and provides the SID engine reference for hardware SID output.
 *
 * Playback position is pushed to the store by the engine itself (same as SF2).
 *
 * Follows the same pattern as useSF2Engine.ts.
 *
 * Usage:
 *   const { engine } = useCheeseCutterEngine();
 */

import { useEffect, useRef, useState } from 'react';
import { useCheeseCutterStore } from '@/stores/useCheeseCutterStore';
import type { C64SIDEngine } from '@/engine/C64SIDEngine';

// Lazy import to avoid circular deps
let _getTrackerReplayer: (() => any) | null = null;
async function getTrackerReplayer(): Promise<any> {
  if (!_getTrackerReplayer) {
    const mod = await import('@/engine/TrackerReplayer');
    _getTrackerReplayer = mod.getTrackerReplayer;
  }
  return _getTrackerReplayer();
}

export interface CheeseCutterEngineState {
  engine: C64SIDEngine | null;
  isPlaying: boolean;
}

/**
 * Hook to access the C64SIDEngine from the TrackerReplayer when CC is loaded.
 */
export function useCheeseCutterEngine(): CheeseCutterEngineState {
  const [engine, setEngine] = useState<C64SIDEngine | null>(null);
  const loaded = useCheeseCutterStore((s) => s.loaded);
  const playing = useCheeseCutterStore((s) => s.playing);

  // Acquire engine reference when CC is loaded
  useEffect(() => {
    if (!loaded) {
      setEngine(null);
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      try {
        const replayer = await getTrackerReplayer();
        // CheeseCutter uses the C64SIDEngine — same as GoatTracker
        const c64 = replayer?.getC64SIDEngine?.() ?? null;
        if (!cancelled) setEngine(c64);
      } catch {
        if (!cancelled) setEngine(null);
      }
    };

    acquire();
    const interval = setInterval(acquire, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loaded]);

  return {
    engine,
    isPlaying: playing,
  };
}

/**
 * Hook that subscribes to CheeseCutter store changes and syncs with the engine.
 * Call this once in the CheeseCutter view component tree.
 */
export function useCheeseCutterLiveSync(): void {
  const engineRef = useRef<C64SIDEngine | null>(null);
  const loaded = useCheeseCutterStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) {
      engineRef.current = null;
      return;
    }
    let cancelled = false;
    const acquire = async () => {
      try {
        const replayer = await getTrackerReplayer();
        const c64 = replayer?.getC64SIDEngine?.() ?? null;
        if (!cancelled) engineRef.current = c64;
      } catch { /* ignore */ }
    };
    acquire();
    const interval = setInterval(acquire, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [loaded]);
}
