/**
 * Transport Store - BPM, Playback State & Transport Controls
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { TransportState } from '@typedefs/audio';

interface TransportStore extends TransportState {
  // State
  isPlaying: boolean;
  isPaused: boolean;
  isLooping: boolean;
  currentRow: number;
  currentPatternIndex: number;
  // Loop tracking for smooth scrolling (continuous row counter that doesn't reset on loop)
  continuousRow: number;
  // Smooth scrolling preference (true = smooth like DAW, false = stepped like classic tracker)
  smoothScrolling: boolean;
  // Metronome state
  metronomeEnabled: boolean;
  metronomeVolume: number; // 0-100

  // Actions
  setBPM: (bpm: number) => void;
  setTimeSignature: (numerator: number, denominator: number) => void;
  setSwing: (swing: number) => void;
  setPosition: (position: string) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlayPause: () => void;
  setIsLooping: (looping: boolean) => void;
  setCurrentRow: (row: number, patternLength?: number) => void;
  setCurrentRowThrottled: (row: number, patternLength?: number) => void; // NEW: Throttled version for playback
  setCurrentPattern: (index: number) => void;
  setSmoothScrolling: (smooth: boolean) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setMetronomeVolume: (volume: number) => void;
  toggleMetronome: () => void;
  reset: () => void;
}

// Throttle state (outside Zustand store to avoid triggering re-renders)
let lastUpdateTime = 0;
let pendingRow: number | null = null;
let pendingPatternLength: number | undefined = undefined;
let throttleTimer: number | null = null;
const THROTTLE_INTERVAL = 83; // ~12 updates per second (1000ms / 12 = 83ms)

export const useTransportStore = create<TransportStore>()(
  immer((set, _get) => ({
    // Initial state (125 BPM = ProTracker/Amiga default)
    bpm: 125,
    timeSignature: [4, 4],
    swing: 0,
    position: '0:0:0',
    isPlaying: false,
    isPaused: false,
    isLooping: true,
    currentRow: 0,
    currentPatternIndex: 0,
    continuousRow: 0,
    smoothScrolling: true, // Default to smooth scrolling (can be toggled by user)
    metronomeEnabled: false,
    metronomeVolume: 75, // Default to 75%

    // Actions
    setBPM: (bpm) =>
      set((state) => {
        // Clamp BPM between MIN and MAX
        state.bpm = Math.max(20, Math.min(999, bpm));
      }),

    setTimeSignature: (numerator, denominator) =>
      set((state) => {
        state.timeSignature = [numerator, denominator];
      }),

    setSwing: (swing) =>
      set((state) => {
        state.swing = Math.max(0, Math.min(100, swing));
      }),

    setPosition: (position) =>
      set((state) => {
        state.position = position;
      }),

    play: () =>
      set((state) => {
        state.isPlaying = true;
        state.isPaused = false;
        // Initialize continuousRow from current position for smooth scrolling
        state.continuousRow = state.currentRow;
      }),

    pause: () =>
      set((state) => {
        state.isPlaying = false;
        state.isPaused = true;
      }),

    stop: () =>
      set((state) => {
        state.isPlaying = false;
        state.isPaused = false;
        state.currentRow = 0;
        state.continuousRow = 0;
        state.position = '0:0:0';
      }),

    togglePlayPause: () =>
      set((state) => {
        if (state.isPlaying) {
          state.isPlaying = false;
          state.isPaused = true;
        } else {
          state.isPlaying = true;
          state.isPaused = false;
          // Initialize continuousRow for smooth scrolling when starting playback
          state.continuousRow = state.currentRow;
        }
      }),

    setIsLooping: (looping) =>
      set((state) => {
        state.isLooping = looping;
      }),

    setCurrentRow: (row, patternLength) =>
      set((state) => {
        const prevRow = state.currentRow;
        state.currentRow = row;

        // Track continuous row for smooth scrolling
        if (row > prevRow) {
          // Normal forward movement
          state.continuousRow += row - prevRow;
        } else if (row === prevRow) {
          // Same row, no change needed
        } else if (row < prevRow) {
          // Row went backward - check if it's a loop
          // Use >= to handle edge cases with short patterns (e.g., 2-row pattern)
          const isLoop = patternLength
            ? prevRow - row >= patternLength / 2
            : row === 0 && prevRow > 2; // Fallback heuristic if patternLength not provided

          if (isLoop) {
            // Loop occurred - increment continuous counter past the end
            const effectiveLength = patternLength || (prevRow + 1);
            state.continuousRow += (effectiveLength - prevRow) + row;
          }
          // If not a loop, keep continuousRow stable to prevent jarring visual jumps
          // The play()/stop() actions handle resetting continuousRow when appropriate
        }
      }),

    // Throttled version of setCurrentRow for playback (reduces re-renders from 60/sec to 12/sec)
    setCurrentRowThrottled: (row, patternLength) => {
      const now = performance.now();

      // Store the latest pending values
      pendingRow = row;
      pendingPatternLength = patternLength;

      // If enough time has passed, update immediately
      if (now - lastUpdateTime >= THROTTLE_INTERVAL) {
        lastUpdateTime = now;
        _get().setCurrentRow(row, patternLength);
        pendingRow = null;
        pendingPatternLength = undefined;

        // Clear any pending timer
        if (throttleTimer !== null) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
      } else if (throttleTimer === null) {
        // Schedule an update for the next throttle interval
        throttleTimer = window.setTimeout(() => {
          if (pendingRow !== null) {
            lastUpdateTime = performance.now();
            _get().setCurrentRow(pendingRow, pendingPatternLength);
            pendingRow = null;
            pendingPatternLength = undefined;
          }
          throttleTimer = null;
        }, THROTTLE_INTERVAL - (now - lastUpdateTime));
      }
      // If timer is already scheduled, just update the pending values (already done above)
    },

    setCurrentPattern: (index) =>
      set((state) => {
        state.currentPatternIndex = index;
      }),

    setSmoothScrolling: (smooth) =>
      set((state) => {
        state.smoothScrolling = smooth;
      }),

    setMetronomeEnabled: (enabled) =>
      set((state) => {
        state.metronomeEnabled = enabled;
      }),

    setMetronomeVolume: (volume) =>
      set((state) => {
        state.metronomeVolume = Math.max(0, Math.min(100, volume));
      }),

    toggleMetronome: () =>
      set((state) => {
        state.metronomeEnabled = !state.metronomeEnabled;
      }),

    // Reset to initial state (for new project/tab)
    reset: () =>
      set((state) => {
        state.bpm = 125;
        state.timeSignature = [4, 4];
        state.swing = 0;
        state.position = '0:0:0';
        state.isPlaying = false;
        state.isPaused = false;
        state.isLooping = true;
        state.currentRow = 0;
        state.currentPatternIndex = 0;
        state.continuousRow = 0;
      }),
  }))
);
