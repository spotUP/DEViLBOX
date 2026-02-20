/**
 * useVisualizationStore - Centralized state for cross-component visualization data
 *
 * Stores:
 * - Active notes per channel (for NoteActivityDisplay)
 * - ADSR stages per instrument (for LiveADSRVisualizer)
 * - LFO phases per instrument (for LFOVisualizer)
 * - Sample playback positions (for SamplePlaybackCursor)
 *
 * PERFORMANCE:
 * - High-frequency audio data is stored in module-level Maps mutated in-place.
 * - A single `version` counter in Zustand state is bumped to notify subscribers.
 * - Visualizer RAF loops read data via getVisualizationData() — no Map cloning.
 * - This eliminates hundreds of Map copies/sec that were causing GC pressure.
 */

import { create } from 'zustand';

// ADSR stage types
export type ADSRStage = 'attack' | 'decay' | 'sustain' | 'release' | 'idle';

// Active note info
export interface ActiveNote {
  note: string;
  velocity: number;
  startTime: number;
  instrumentId: number;
}

// LFO phase info
export interface LFOPhase {
  filter: number;  // 0-1 phase
  pitch: number;   // 0-1 phase
  rate: number;    // Current rate in Hz
}

// ── Module-level mutable data (never cloned, read directly by visualizers) ──
const _activeNotes = new Map<number, ActiveNote[]>();
const _adsrStages = new Map<number, ADSRStage>();
const _adsrProgress = new Map<number, number>();
const _lfoPhases = new Map<number, LFOPhase>();
const _samplePositions = new Map<number, number>();

/** Direct access for RAF loops — no Zustand subscription overhead */
export function getVisualizationData() {
  return {
    activeNotes: _activeNotes,
    adsrStages: _adsrStages,
    adsrProgress: _adsrProgress,
    lfoPhases: _lfoPhases,
    samplePositions: _samplePositions,
  };
}

// Throttle Zustand notifications to max ~30Hz to avoid excessive React re-renders
let _notifyPending = false;
function notifySubscribers() {
  if (_notifyPending) return;
  _notifyPending = true;
  queueMicrotask(() => {
    _notifyPending = false;
    useVisualizationStore.setState((s) => ({ version: s.version + 1 }));
  });
}

interface VisualizationState {
  /** Incremented when data changes — subscribe to this to know when to re-read */
  version: number;

  // Actions (mutate module-level Maps in place, then bump version)
  setActiveNote: (channelIndex: number, note: ActiveNote) => void;
  clearActiveNote: (channelIndex: number, note: string) => void;
  clearChannelNotes: (channelIndex: number) => void;
  clearAllNotes: () => void;

  setADSRStage: (instrumentId: number, stage: ADSRStage, progress?: number) => void;
  setADSRProgress: (instrumentId: number, progress: number) => void;

  setLFOPhase: (instrumentId: number, phase: LFOPhase) => void;

  setSamplePosition: (instrumentId: number, position: number) => void;
  clearSamplePosition: (instrumentId: number) => void;
}

export const useVisualizationStore = create<VisualizationState>(() => ({
  version: 0,

  // Note management — mutate in place, no Map cloning
  setActiveNote: (channelIndex: number, note: ActiveNote) => {
    const channelNotes = _activeNotes.get(channelIndex);
    if (channelNotes) {
      const existingIndex = channelNotes.findIndex((n) => n.note === note.note);
      if (existingIndex >= 0) {
        channelNotes[existingIndex] = note;
      } else {
        channelNotes.push(note);
      }
    } else {
      _activeNotes.set(channelIndex, [note]);
    }
    notifySubscribers();
  },

  clearActiveNote: (channelIndex: number, noteName: string) => {
    const channelNotes = _activeNotes.get(channelIndex);
    if (!channelNotes) return;
    const filtered = channelNotes.filter((n) => n.note !== noteName);
    if (filtered.length === 0) {
      _activeNotes.delete(channelIndex);
    } else {
      _activeNotes.set(channelIndex, filtered);
    }
    notifySubscribers();
  },

  clearChannelNotes: (channelIndex: number) => {
    _activeNotes.delete(channelIndex);
    notifySubscribers();
  },

  clearAllNotes: () => {
    _activeNotes.clear();
    notifySubscribers();
  },

  // ADSR management
  setADSRStage: (instrumentId: number, stage: ADSRStage, progress: number = 0) => {
    _adsrStages.set(instrumentId, stage);
    _adsrProgress.set(instrumentId, progress);
    notifySubscribers();
  },

  setADSRProgress: (instrumentId: number, progress: number) => {
    _adsrProgress.set(instrumentId, progress);
    notifySubscribers();
  },

  // LFO management
  setLFOPhase: (instrumentId: number, phase: LFOPhase) => {
    _lfoPhases.set(instrumentId, phase);
    notifySubscribers();
  },

  // Sample position management
  setSamplePosition: (instrumentId: number, position: number) => {
    _samplePositions.set(instrumentId, Math.max(0, Math.min(1, position)));
    notifySubscribers();
  },

  clearSamplePosition: (instrumentId: number) => {
    _samplePositions.delete(instrumentId);
    notifySubscribers();
  },
}));

// Selectors for efficient subscriptions
export const selectVersion = (state: VisualizationState) => state.version;
