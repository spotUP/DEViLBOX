/**
 * Zustand Store Subscription Utilities for PixiJS
 *
 * Two patterns:
 * 1. Declarative (React): @pixi/react components use standard useStore() hooks.
 *    Works because @pixi/react components are React components with a render cycle.
 *
 * 2. Direct (imperative): For real-time views (pattern grid, waveforms, VU meters)
 *    that need to push data into PixiJS display objects at 60fps without React re-renders.
 *    Use store.subscribe() to imperatively update PixiJS objects via refs.
 */

import { useRef, useEffect } from 'react';
import type { StoreApi } from 'zustand';
import type { Container } from 'pixi.js';

/**
 * Subscribe to a Zustand store slice and imperatively update a PixiJS display object.
 * Bypasses React's render cycle for real-time performance.
 *
 * @param store - Zustand store
 * @param selector - Extract the slice of state you need
 * @param updater - Imperatively apply state to the PixiJS display object
 * @param targetRef - Ref to the PixiJS display object
 *
 * @example
 * ```tsx
 * const graphicsRef = useRef<Graphics>(null);
 * usePixiStoreSubscription(
 *   useAudioStore,
 *   state => state.masterVolume,
 *   (volume, graphics) => {
 *     graphics.clear();
 *     graphics.rect(0, 0, volume * 100, 10);
 *     graphics.fill(0x00d4aa);
 *   },
 *   graphicsRef
 * );
 * ```
 */
export function usePixiStoreSubscription<
  TState,
  TSlice,
  TTarget extends Container,
>(
  store: StoreApi<TState>,
  selector: (state: TState) => TSlice,
  updater: (slice: TSlice, target: TTarget) => void,
  targetRef: React.RefObject<TTarget | null>,
): void {
  const prevSliceRef = useRef<TSlice | undefined>(undefined);

  useEffect(() => {
    // Initial update
    const initial = selector(store.getState());
    if (targetRef.current) {
      updater(initial, targetRef.current);
    }
    prevSliceRef.current = initial;

    // Subscribe to changes
    const unsub = store.subscribe((state) => {
      const slice = selector(state);
      // Only update if the slice actually changed (shallow equality)
      if (slice !== prevSliceRef.current) {
        prevSliceRef.current = slice;
        if (targetRef.current) {
          updater(slice, targetRef.current);
        }
      }
    });

    return unsub;
  }, [store, selector, updater, targetRef]);
}

/**
 * Subscribe to a Zustand store slice and call an updater function on change.
 * Similar to usePixiStoreSubscription but without a target ref — useful when
 * you need to update multiple objects or handle complex state transitions.
 *
 * @example
 * ```tsx
 * usePixiStoreEffect(
 *   useTransportStore,
 *   state => ({ bpm: state.bpm, isPlaying: state.isPlaying }),
 *   ({ bpm, isPlaying }) => {
 *     bpmText.current?.setText(`${bpm} BPM`);
 *     playButton.current?.setActive(isPlaying);
 *   }
 * );
 * ```
 */
export function usePixiStoreEffect<TState, TSlice>(
  store: StoreApi<TState>,
  selector: (state: TState) => TSlice,
  effect: (slice: TSlice) => void,
): void {
  const prevSliceRef = useRef<TSlice | undefined>(undefined);

  useEffect(() => {
    // Initial effect
    const initial = selector(store.getState());
    effect(initial);
    prevSliceRef.current = initial;

    const unsub = store.subscribe((state) => {
      const slice = selector(state);
      if (slice !== prevSliceRef.current) {
        prevSliceRef.current = slice;
        effect(slice);
      }
    });

    return unsub;
  }, [store, selector, effect]);
}
