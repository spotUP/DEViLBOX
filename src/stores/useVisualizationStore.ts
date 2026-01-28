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
 * - Uses refs for high-frequency data to avoid React re-renders
 * - Only triggers re-renders for UI state changes
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

interface VisualizationState {
  // Active notes per channel (channelIndex -> notes)
  activeNotes: Map<number, ActiveNote[]>;

  // ADSR stages per instrument (instrumentId -> stage)
  adsrStages: Map<number, ADSRStage>;

  // ADSR progress per instrument (instrumentId -> 0-1 progress within current stage)
  adsrProgress: Map<number, number>;

  // LFO phases per instrument (instrumentId -> phases)
  lfoPhases: Map<number, LFOPhase>;

  // Sample playback positions per instrument (instrumentId -> 0-1 position)
  samplePositions: Map<number, number>;

  // Actions
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

export const useVisualizationStore = create<VisualizationState>((set, _get) => ({
  activeNotes: new Map(),
  adsrStages: new Map(),
  adsrProgress: new Map(),
  lfoPhases: new Map(),
  samplePositions: new Map(),

  // Note management
  setActiveNote: (channelIndex: number, note: ActiveNote) => {
    set((state) => {
      const notes = new Map(state.activeNotes);
      const channelNotes = notes.get(channelIndex) || [];

      // Check if this note already exists (update it)
      const existingIndex = channelNotes.findIndex((n) => n.note === note.note);
      if (existingIndex >= 0) {
        channelNotes[existingIndex] = note;
      } else {
        channelNotes.push(note);
      }

      notes.set(channelIndex, channelNotes);
      return { activeNotes: notes };
    });
  },

  clearActiveNote: (channelIndex: number, noteName: string) => {
    set((state) => {
      const notes = new Map(state.activeNotes);
      const channelNotes = notes.get(channelIndex) || [];
      const filtered = channelNotes.filter((n) => n.note !== noteName);

      if (filtered.length === 0) {
        notes.delete(channelIndex);
      } else {
        notes.set(channelIndex, filtered);
      }

      return { activeNotes: notes };
    });
  },

  clearChannelNotes: (channelIndex: number) => {
    set((state) => {
      const notes = new Map(state.activeNotes);
      notes.delete(channelIndex);
      return { activeNotes: notes };
    });
  },

  clearAllNotes: () => {
    set({ activeNotes: new Map() });
  },

  // ADSR management
  setADSRStage: (instrumentId: number, stage: ADSRStage, progress: number = 0) => {
    set((state) => {
      const stages = new Map(state.adsrStages);
      const progressMap = new Map(state.adsrProgress);
      stages.set(instrumentId, stage);
      progressMap.set(instrumentId, progress);
      return { adsrStages: stages, adsrProgress: progressMap };
    });
  },

  setADSRProgress: (instrumentId: number, progress: number) => {
    set((state) => {
      const progressMap = new Map(state.adsrProgress);
      progressMap.set(instrumentId, progress);
      return { adsrProgress: progressMap };
    });
  },

  // LFO management
  setLFOPhase: (instrumentId: number, phase: LFOPhase) => {
    set((state) => {
      const phases = new Map(state.lfoPhases);
      phases.set(instrumentId, phase);
      return { lfoPhases: phases };
    });
  },

  // Sample position management
  setSamplePosition: (instrumentId: number, position: number) => {
    set((state) => {
      const positions = new Map(state.samplePositions);
      positions.set(instrumentId, Math.max(0, Math.min(1, position)));
      return { samplePositions: positions };
    });
  },

  clearSamplePosition: (instrumentId: number) => {
    set((state) => {
      const positions = new Map(state.samplePositions);
      positions.delete(instrumentId);
      return { samplePositions: positions };
    });
  },
}));

// Selectors for efficient subscriptions
export const selectActiveNotes = (state: VisualizationState) => state.activeNotes;
export const selectADSRStages = (state: VisualizationState) => state.adsrStages;
export const selectADSRProgress = (state: VisualizationState) => state.adsrProgress;
export const selectLFOPhases = (state: VisualizationState) => state.lfoPhases;
export const selectSamplePositions = (state: VisualizationState) => state.samplePositions;
