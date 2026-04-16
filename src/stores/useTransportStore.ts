/**
 * Transport Store - BPM, Playback State & Transport Controls
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import * as Tone from 'tone';
import type { TransportState, GrooveTemplate } from '@typedefs/audio';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import { useInstrumentStore } from './useInstrumentStore';
import { checkFormatViolation, getActiveFormatLimits, isViolationConfirmed } from '@/lib/formatCompatibility';
import { unlockIOSAudio } from '@utils/ios-audio-unlock';
import { useUIStore } from './useUIStore';
import { getToneEngine } from '@engine/ToneEngine';

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
  // Tracker timing (for visual sync)
  speed: number; // Ticks per row (1-31, default 6)
  // Loop point for chip export (row where music loops back to)
  loopStartRow: number; // 0 = no loop, >0 = loop back to this row
  // Groove template for timing variations
  grooveTemplateId: string;
  // Groove cycle length (for manual swing and custom grooves)
  grooveSteps: number;
  // Micro-timing jitter (0-100%)
  jitter: number;
  // Use MPC swing scale (50-75%) instead of 0-200%
  useMpcScale: boolean;

  // Arrangement timeline position
  currentGlobalRow: number;

  // Per-channel playback rows (for formats with independent channel speeds, e.g. MusicLine)
  currentRowPerChannel: number[];

  // Global pitch shift (DJ pitch slider / W effect)
  globalPitch: number; // Semitones (-16 to +16)

  // Count-in feature
  countInEnabled: boolean;
  toggleCountIn: () => void;

  // Actions
  setBPM: (bpm: number) => void;
  setGlobalPitch: (pitch: number) => void;
  setTimeSignature: (numerator: number, denominator: number) => void;
  setSwing: (swing: number) => void;
  setJitter: (jitter: number) => void;
  setUseMpcScale: (use: boolean) => void;
  setPosition: (position: string) => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  togglePlayPause: () => Promise<void>;
  setIsLooping: (looping: boolean) => void;
  setCurrentRow: (row: number, patternLength?: number) => void;
  setCurrentRowThrottled: (row: number, patternLength?: number, immediate?: boolean) => void; // NEW: Throttled version for playback
  setCurrentPattern: (index: number) => void;
  setSmoothScrolling: (smooth: boolean) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setMetronomeVolume: (volume: number) => void;
  toggleMetronome: () => void;
  setSpeed: (speed: number) => void;
  setLoopStartRow: (row: number) => void;
  setGrooveTemplate: (templateId: string) => void;
  setGrooveSteps: (steps: number) => void;
  getGrooveTemplate: () => GrooveTemplate;
  setCurrentGlobalRow: (row: number) => void;
  seekToGlobalRow: (row: number) => void;
  setCurrentRowPerChannel: (rows: number[]) => void;
  cancelPendingRowUpdate: () => void; // Clear pending throttle timer on seek

  // Timecode
  getTimecodeString: () => string;

  // Punch in/out
  punchInRow: number | null;
  punchOutRow: number | null;
  setPunchIn: (row: number | null) => void;
  setPunchOut: (row: number | null) => void;
  isPunchEnabled: boolean;
  setPunchEnabled: (enabled: boolean) => void;

  // Count-in (already in state interface above)
  setCountInEnabled: (enabled: boolean) => void;

  reset: () => void;
}

// Throttle state (outside Zustand store to avoid triggering re-renders)
let lastUpdateTime = 0;
let pendingRow: number | null = null;
let pendingPatternLength: number | undefined = undefined;
let throttleTimer: number | null = null;
const THROTTLE_INTERVAL = 250; // Throttle React re-renders during playback (RAF reads position directly)

// Generation counter — incremented by stop() to invalidate in-flight play() calls.
// play() is async (awaits unlockIOSAudio + Tone.start). If the user stops during
// those awaits, the stale play() must NOT set isPlaying=true after stop.
let _playGeneration = 0;

// Cancel pending throttle update (called on seek to prevent old row values reverting)
export function cancelPendingRowUpdate(): void {
  if (throttleTimer !== null) {
    window.clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  pendingRow = null;
  pendingPatternLength = undefined;
}

export const useTransportStore = create<TransportStore>()(
  immer((set, _get) => ({
    // Initial state (125 BPM = ProTracker/Amiga default)
    bpm: 125,
    timeSignature: [4, 4],
    swing: 0, // 0 = no groove (for straight); 100 = 1x template intensity
    position: '0:0:0',
    isPlaying: false,
    isPaused: false,
    isLooping: true,
    currentRow: 0,
    currentPatternIndex: 0,
    continuousRow: 0,
    smoothScrolling: false, // Default to stepped scrolling (classic tracker feel)
    metronomeEnabled: false,
    metronomeVolume: 75, // Default to 75%
    speed: 6, // Default speed (ticks per row) - ProTracker default
    loopStartRow: 0, // 0 = no loop point set
    grooveTemplateId: 'straight', // Default to straight timing (no groove)
    grooveSteps: 2, // Default to 2 steps (standard 16th swing)
    jitter: 0,
    useMpcScale: false,
    currentGlobalRow: 0,
    currentRowPerChannel: [],
    punchInRow: null,
    punchOutRow: null,
    isPunchEnabled: false,
    countInEnabled: false,
    globalPitch: 0, // Default to no pitch shift

    // Actions
    setBPM: (bpm) => {
      const limits = getActiveFormatLimits();
      if (limits && (bpm < limits.bpmRange[0] || bpm > limits.bpmRange[1]) && !isViolationConfirmed('bpmRange')) {
        void checkFormatViolation('bpmRange',
          `BPM ${bpm} is outside ${limits.name} range of ${limits.bpmRange[0]}-${limits.bpmRange[1]}.`,
        ).then((ok) => { if (ok) useTransportStore.getState().setBPM(bpm); });
        return;
      }
      set((state) => {
        // Clamp BPM between MIN and MAX
        state.bpm = Math.max(20, Math.min(999, bpm));
        // Add status message
        try {
          useUIStore.getState().setStatusMessage(`BPM ${state.bpm}`, false, 1500);
        } catch {
          // Ignore errors if store is being cleaned up
        }
      });
    },

    setGlobalPitch: (pitch) =>
      set((state) => {
        state.globalPitch = Math.max(-16, Math.min(16, pitch));
      }),

    setTimeSignature: (numerator, denominator) =>
      set((state) => {
        state.timeSignature = [numerator, denominator];
      }),

    setSwing: (swing) =>
      set((state) => {
        // Clamp based on scale mode
        if (state.useMpcScale) {
          state.swing = Math.max(50, Math.min(75, swing));
        } else {
          state.swing = Math.max(0, Math.min(200, swing));
        }
        
      }),

    setJitter: (jitter) =>
      set((state) => {
        state.jitter = Math.max(0, Math.min(100, jitter));
      }),

    setUseMpcScale: (use) =>
      set((state) => {
        const prevUse = state.useMpcScale;
        if (prevUse === use) return;
        
        state.useMpcScale = use;
        // Convert current swing value to roughly match feel on new scale
        if (use) {
          // 0-200 -> 50-75 (100 -> 62.5)
          state.swing = 50 + (state.swing / 200) * 25;
        } else {
          // 50-75 -> 0-200
          state.swing = ((state.swing - 50) / 25) * 200;
        }
      }),

    setPosition: (position) =>
      set((state) => {
        state.position = position;
      }),

    play: async () => {
      const gen = ++_playGeneration;

      // Auto-bake any instruments that need it before starting playback
      useInstrumentStore.getState().autoBakeInstruments();

      // CRITICAL for iOS: Start audio context synchronously during user gesture
      // Dynamic import creates async delay that breaks iOS gesture chain
      // See: https://github.com/Tonejs/Tone.js/issues/164
      await unlockIOSAudio(); // Play silent MP3 + pump AudioContext for iOS
      await Tone.start();

      // If stop() was called while we were awaiting, abort — don't override
      // isPlaying=false with isPlaying=true. This race happens when play() is
      // called fire-and-forget (e.g. from forcePosition) and the user stops
      // before the awaits resolve.
      if (gen !== _playGeneration) return;

      set((state) => {
        state.isPlaying = true;
        state.isPaused = false;
        // Initialize continuousRow from current position for smooth scrolling
        state.continuousRow = state.currentRow;
      });
      // Connect level meters (idle CPU savings — disconnected when not playing)
      try { getToneEngine().connectMeters(); } catch { /* engine not ready */ }
    },

    pause: () => {
      set((state) => {
        state.isPlaying = false;
        state.isPaused = true;
      });
      try { getToneEngine().disconnectMeters(); } catch { /* engine not ready */ }
    },

    stop: () => {
      // Invalidate any in-flight async play() — it must not set isPlaying=true
      // after stop. play() checks _playGeneration before setting isPlaying.
      ++_playGeneration;
      // Cancel any pending throttled row update — without this, a queued
      // setCurrentRowThrottled timer (up to 250ms) can fire after stop and
      // overwrite the stop-position that TrackerReplayer.stop() just saved.
      cancelPendingRowUpdate();
      set((state) => {
        // Keep currentRow at last playback position (don't reset to 0)
        // so the pattern editor stays where playback stopped.
        state.isPlaying = false;
        state.isPaused = false;
      });
      try { getToneEngine().disconnectMeters(); } catch { /* engine not ready */ }
    },

    togglePlayPause: async () => {
      const isPlaying = _get().isPlaying;
      if (!isPlaying) {
        // Auto-bake before starting
        useInstrumentStore.getState().autoBakeInstruments();
        
        // CRITICAL for iOS: Start audio context synchronously during user gesture
        // iOS requires Tone.start() to be called on the same callstack as the user interaction
        // Calling it in an effect after the gesture ends will fail silently
        // Dynamic import creates async delay that breaks iOS gesture chain
        // See: https://github.com/Tonejs/Tone.js/issues/164
        await unlockIOSAudio(); // Play silent MP3 + pump AudioContext for iOS
        await Tone.start();
      }

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
      });
    },

    setIsLooping: (looping) =>
      set((state) => {
        state.isLooping = looping;
      }),

    setCurrentRow: (row, patternLength) =>
      set((state) => {
        const prevRow = state.currentRow;
        state.currentRow = row;

        // Follow playback: sync cursor to playback row
        if (state.isPlaying) {
          try {
            const { useEditorStore } = require('./useEditorStore');
            const { useCursorStore } = require('./useCursorStore');
            if (useEditorStore.getState().followPlayback) {
              const cursor = useCursorStore.getState().cursor;
              if (cursor.rowIndex !== row) {
                useCursorStore.setState({ cursor: { ...cursor, rowIndex: row } });
              }
            }
          } catch { /* avoid circular import issues at startup */ }
        }

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

    // Throttled version of setCurrentRow for playback - limits to 50Hz for Amiga PAL feel
    setCurrentRowThrottled: (row, patternLength, immediate) => {
      const now = performance.now();

      // Store the latest pending values
      pendingRow = row;
      pendingPatternLength = patternLength;

      // If immediate or enough time has passed, update immediately
      if (immediate || now - lastUpdateTime >= THROTTLE_INTERVAL) {
        lastUpdateTime = now;
        _get().setCurrentRow(row, patternLength);
        pendingRow = null;
        pendingPatternLength = undefined;

        // Clear any pending timer
        if (throttleTimer !== null) {
          window.clearTimeout(throttleTimer);
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

    toggleCountIn: () =>
      set((state) => {
        state.countInEnabled = !state.countInEnabled;
      }),

    setSpeed: (speed) =>
      set((state) => {
        // Clamp speed to valid tracker range (1-31)
        state.speed = Math.max(1, Math.min(31, speed));
      }),

    setLoopStartRow: (row) =>
      set((state) => {
        // 0 = no loop, otherwise must be valid row number
        state.loopStartRow = Math.max(0, row);
      }),

    setGrooveTemplate: (templateId) => {
      if (templateId !== 'straight') {
        const limits = getActiveFormatLimits();
        if (limits && !limits.supportsGroove && !isViolationConfirmed('groove')) {
          void checkFormatViolation('groove',
            `Groove templates are not supported in ${limits.name} format.`,
          ).then((ok) => { if (ok) useTransportStore.getState().setGrooveTemplate(templateId); });
          return;
        }
      }
      set((state) => {
        // Verify template exists
        const template = GROOVE_TEMPLATES.find(t => t.id === templateId);
        if (template) {
          state.grooveTemplateId = templateId;
          // Reset swing to zero when selecting straight (no groove)
          if (templateId === 'straight') {
            state.swing = 0;
          }
        }
      });
    },

    setGrooveSteps: (steps) =>
      set((state) => {
        state.grooveSteps = Math.max(1, Math.min(64, steps));
      }),

    getGrooveTemplate: () => {
      const state = _get();
      return GROOVE_TEMPLATES.find(t => t.id === state.grooveTemplateId) || GROOVE_TEMPLATES[0];
    },

    setCurrentGlobalRow: (row) =>
      set((state) => {
        state.currentGlobalRow = row;
      }),

    seekToGlobalRow: (row) =>
      set((state) => {
        state.currentGlobalRow = Math.max(0, row);
      }),

    setCurrentRowPerChannel: (rows) =>
      set((state) => {
        state.currentRowPerChannel = rows;
      }),

    // Cancel pending throttle timer (call on seek to prevent old row values reverting)
    cancelPendingRowUpdate: () => {
      cancelPendingRowUpdate();
    },

    // Reset to initial state (for new project/tab)
    // Timecode
    getTimecodeString: () => {
      const state = _get();
      const beatsPerRow = 1 / (state.speed || 6); // rows per tick → beats
      const secondsPerRow = (60 / state.bpm) * beatsPerRow;
      const totalSeconds = state.currentGlobalRow * secondsPerRow;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const ms = Math.floor((totalSeconds % 1) * 1000);
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    },

    // Punch in/out
    setPunchIn: (row) => set((state) => { state.punchInRow = row; }),
    setPunchOut: (row) => set((state) => { state.punchOutRow = row; }),
    setPunchEnabled: (enabled) => set((state) => { state.isPunchEnabled = enabled; }),

    // Count-in
    setCountInEnabled: (enabled) => set((state) => { state.countInEnabled = enabled; }),

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
        state.speed = 6;
        state.loopStartRow = 0;
        state.grooveTemplateId = 'straight';
        state.grooveSteps = 2;
        state.jitter = 0;
        state.useMpcScale = false;
        state.currentGlobalRow = 0;
        state.currentRowPerChannel = [];
        state.punchInRow = null;
        state.punchOutRow = null;
        state.isPunchEnabled = false;
        state.countInEnabled = false;
      }),
  }))
);