/**
 * useDisplaySync - React hook for fixed-rate display updates
 *
 * This hook provides playback position state that updates at a fixed rate
 * (50Hz by default, like Amiga PAL) regardless of actual browser frame rate
 * or React re-render timing.
 *
 * This gives the classic "tight" tracker feel where the display updates
 * are perfectly consistent and predictable.
 *
 * Usage:
 *   const { row, pattern, isPlaying } = useDisplaySync();
 *   // 'row' updates at exactly 50Hz during playback
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDisplaySync, type DisplayState, type DisplayRate, DISPLAY_RATES } from '@engine/DisplaySync';

interface UseDisplaySyncOptions {
  /** Display refresh rate - 'PAL' (50Hz), 'NTSC' (60Hz), or custom number */
  rate?: DisplayRate | number;
  /** Only update when playing (reduces unnecessary re-renders when stopped) */
  onlyWhenPlaying?: boolean;
}

interface UseDisplaySyncResult extends DisplayState {
  /** Measured FPS (for debugging) */
  measuredFps: number;
  /** Force an immediate update */
  forceUpdate: () => void;
}

/**
 * Hook for fixed-rate display synchronization
 */
export function useDisplaySync(options: UseDisplaySyncOptions = {}): UseDisplaySyncResult {
  const { rate = 'PAL', onlyWhenPlaying = false } = options;

  const [state, setState] = useState<DisplayState>(() => getDisplaySync().getState());
  const [measuredFps, setMeasuredFps] = useState(0);
  const lastStateRef = useRef(state);

  // Set rate on mount and when it changes
  useEffect(() => {
    const sync = getDisplaySync();
    sync.setRate(rate);
  }, [rate]);

  // Subscribe to display sync
  useEffect(() => {
    const sync = getDisplaySync();

    const handleUpdate = (newState: DisplayState) => {
      // Skip update if onlyWhenPlaying and not playing
      if (onlyWhenPlaying && !newState.isPlaying && !lastStateRef.current.isPlaying) {
        // But still update if we just stopped (need to show final position)
        if (lastStateRef.current.row === newState.row &&
            lastStateRef.current.pattern === newState.pattern) {
          return;
        }
      }

      lastStateRef.current = newState;
      setState(newState);
      setMeasuredFps(sync.getMeasuredFps());
    };

    const unsubscribe = sync.subscribe(handleUpdate);
    return unsubscribe;
  }, [onlyWhenPlaying]);

  const forceUpdate = useCallback(() => {
    getDisplaySync().forceUpdate();
  }, []);

  return {
    ...state,
    measuredFps,
    forceUpdate,
  };
}

/**
 * Hook that only returns the playback row at fixed rate
 * Lighter weight than full useDisplaySync if you only need the row
 */
export function useDisplayRow(rate: DisplayRate | number = 'PAL'): number {
  const [row, setRow] = useState(0);

  useEffect(() => {
    const sync = getDisplaySync();
    sync.setRate(rate);

    const handleUpdate = (state: DisplayState) => {
      setRow(state.row);
    };

    return sync.subscribe(handleUpdate);
  }, [rate]);

  return row;
}

/**
 * Hook that provides a stable callback ref that fires at fixed rate
 * Use this when you need to do something every frame at fixed rate
 * without causing React re-renders
 */
export function useDisplayCallback(
  callback: (state: DisplayState) => void,
  deps: React.DependencyList = [],
  rate: DisplayRate | number = 'PAL'
): void {
  const callbackRef = useRef(callback);

  // Update ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback, ...deps]);

  useEffect(() => {
    const sync = getDisplaySync();
    sync.setRate(rate);

    const handleUpdate = (state: DisplayState) => {
      callbackRef.current(state);
    };

    return sync.subscribe(handleUpdate);
  }, [rate]);
}

// Re-export types and constants
export { type DisplayState, type DisplayRate, DISPLAY_RATES };
