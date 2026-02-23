/**
 * useDJStore - Zustand store for all DJ mode state
 *
 * Single store managing both decks, mixer, and headphone cueing state.
 * Engine state is the source of truth for audio; this store tracks UI state.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { SeratoCuePoint, SeratoLoop, SeratoBeatMarker } from '@/lib/serato/seratoMetadata';

// ============================================================================
// TYPES
// ============================================================================

export interface DeckState {
  // Track info
  fileName: string | null;
  trackName: string;
  detectedBPM: number;

  // Transport
  isPlaying: boolean;
  songPos: number;
  pattPos: number;
  totalPositions: number;
  elapsedMs: number;

  // Pitch / BPM
  pitchOffset: number;         // -16 to +16 semitones
  effectiveBPM: number;
  repitchLock: boolean;

  // EQ
  eqLow: number;              // dB (-24 to +6)
  eqMid: number;
  eqHigh: number;
  eqLowKill: boolean;
  eqMidKill: boolean;
  eqHighKill: boolean;

  // Filter
  filterPosition: number;     // -1 (HPF) to 0 (off) to +1 (LPF)
  filterResonance: number;

  // Volume
  volume: number;              // 0 to 1 (channel fader)

  // Cue
  cuePoint: number;            // Song position for cue point
  pflEnabled: boolean;

  // Loop
  loopActive: boolean;
  lineLoopSize: 1 | 2 | 4 | 8 | 16 | 32;
  patternLoopStart: number;
  patternLoopEnd: number;
  loopMode: 'line' | 'pattern' | 'off';

  // Slip
  slipEnabled: boolean;
  slipSongPos: number;
  slipPattPos: number;

  // Channel mutes (bitmask: bit N = channel N+1 enabled)
  channelMask: number;

  // Scratch
  scratchActive: boolean;
  scratchVelocity: number;  // current scratch velocity for UI feedback (turntable, pattern scroll)
  scratchFaderGain: number; // current scratch fader gain (0-1) for visual feedback on channel strip
  faderLFOActive: boolean;
  faderLFODivision: '1/4' | '1/8' | '1/16' | '1/32' | null;
  activePatternName: string | null;

  // Audio file playback mode
  playbackMode: 'tracker' | 'audio';
  durationMs: number;             // total duration for audio files (ms)
  audioPosition: number;          // current position in seconds
  waveformPeaks: Float32Array | null;  // for waveform display

  // Serato metadata (populated when loading Serato-analyzed tracks)
  seratoCuePoints: SeratoCuePoint[];
  seratoLoops: SeratoLoop[];
  seratoBeatGrid: SeratoBeatMarker[];
  seratoKey: string | null;
}

type DeckId = 'A' | 'B' | 'C';

export type CueMode = 'multi-output' | 'split-stereo' | 'none';
export type CrossfaderCurve = 'linear' | 'cut' | 'smooth';

// ============================================================================
// DEFAULT DECK STATE
// ============================================================================

const defaultDeckState: DeckState = {
  fileName: null,
  trackName: '',
  detectedBPM: 125,
  isPlaying: false,
  songPos: 0,
  pattPos: 0,
  totalPositions: 0,
  elapsedMs: 0,
  pitchOffset: 0,
  effectiveBPM: 125,
  repitchLock: false,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  eqLowKill: false,
  eqMidKill: false,
  eqHighKill: false,
  filterPosition: 0,
  filterResonance: 1,
  volume: 1,
  cuePoint: 0,
  pflEnabled: false,
  loopActive: false,
  lineLoopSize: 4,
  patternLoopStart: 0,
  patternLoopEnd: 0,
  loopMode: 'off',
  slipEnabled: false,
  slipSongPos: 0,
  slipPattPos: 0,
  channelMask: 0xFFFF, // All channels enabled (16 bits)

  // Scratch
  scratchActive: false,
  scratchVelocity: 0,
  scratchFaderGain: 1,
  faderLFOActive: false,
  faderLFODivision: null,
  activePatternName: null,

  // Audio file playback
  playbackMode: 'tracker',
  durationMs: 0,
  audioPosition: 0,
  waveformPeaks: null,

  // Serato metadata
  seratoCuePoints: [],
  seratoLoops: [],
  seratoBeatGrid: [],
  seratoKey: null,
};

// ============================================================================
// STORE
// ============================================================================

export type DeckViewMode = 'visualizer' | 'vinyl' | '3d';

interface DJState {
  // Global
  djModeActive: boolean;
  deckViewMode: DeckViewMode;
  thirdDeckActive: boolean;
  crossfaderPosition: number;
  crossfaderCurve: CrossfaderCurve;
  masterVolume: number;

  // Per-deck
  decks: { A: DeckState; B: DeckState; C: DeckState };

  // Headphone cueing
  cueMode: CueMode;
  cueDeviceId: string | null;
  cueVolume: number;
}

interface DJActions {
  // Global
  setDJModeActive: (active: boolean) => void;
  cycleDeckViewMode: () => void;
  setThirdDeckActive: (active: boolean) => void;
  setCrossfader: (position: number) => void;
  setCrossfaderCurve: (curve: CrossfaderCurve) => void;
  setMasterVolume: (volume: number) => void;

  // Per-deck
  setDeckState: (deck: DeckId, partial: Partial<DeckState>) => void;
  setDeckPlaying: (deck: DeckId, playing: boolean) => void;
  setDeckPosition: (deck: DeckId, songPos: number, pattPos: number) => void;
  setDeckPitch: (deck: DeckId, offset: number) => void;
  setDeckEQ: (deck: DeckId, band: 'low' | 'mid' | 'high', dB: number) => void;
  setDeckEQKill: (deck: DeckId, band: 'low' | 'mid' | 'high', kill: boolean) => void;
  setDeckFilter: (deck: DeckId, position: number) => void;
  setDeckVolume: (deck: DeckId, volume: number) => void;
  setDeckCuePoint: (deck: DeckId, songPos: number) => void;
  setDeckPFL: (deck: DeckId, enabled: boolean) => void;
  setDeckLoop: (deck: DeckId, mode: 'line' | 'pattern' | 'off', active: boolean) => void;
  setDeckLoopSize: (deck: DeckId, size: 1 | 2 | 4 | 8 | 16 | 32) => void;
  setDeckSlip: (deck: DeckId, enabled: boolean) => void;
  toggleDeckChannel: (deck: DeckId, channel: number) => void;
  setAllDeckChannels: (deck: DeckId, enabled: boolean) => void;
  resetDeck: (deck: DeckId) => void;

  // Scratch
  setDeckScratchActive: (deck: DeckId, active: boolean) => void;
  setDeckFaderLFO: (deck: DeckId, active: boolean, division?: '1/4' | '1/8' | '1/16' | '1/32') => void;
  setDeckPattern: (deck: DeckId, name: string | null) => void;

  // Headphone cueing
  setCueMode: (mode: CueMode) => void;
  setCueDevice: (deviceId: string | null) => void;
  setCueVolume: (volume: number) => void;
}

type DJStore = DJState & DJActions;

export const useDJStore = create<DJStore>()(
  subscribeWithSelector(immer((set) => ({
    // Initial state
    djModeActive: false,
    deckViewMode: 'visualizer' as DeckViewMode,
    thirdDeckActive: false,
    crossfaderPosition: 0.5,
    crossfaderCurve: 'smooth' as CrossfaderCurve,
    masterVolume: 1,

    decks: {
      A: { ...defaultDeckState },
      B: { ...defaultDeckState },
      C: { ...defaultDeckState },
    },

    cueMode: 'none' as CueMode,
    cueDeviceId: null,
    cueVolume: 1,

    // ========================================================================
    // ACTIONS
    // ========================================================================

    setDJModeActive: (active) =>
      set((state) => {
        state.djModeActive = active;
      }),

    cycleDeckViewMode: () =>
      set((state) => {
        const order: DeckViewMode[] = ['visualizer', 'vinyl', '3d'];
        const idx = order.indexOf(state.deckViewMode);
        state.deckViewMode = order[(idx + 1) % order.length];
      }),

    setThirdDeckActive: (active) =>
      set((state) => {
        state.thirdDeckActive = active;
      }),

    setCrossfader: (position) =>
      set((state) => {
        state.crossfaderPosition = Math.max(0, Math.min(1, position));
      }),

    setCrossfaderCurve: (curve) =>
      set((state) => {
        state.crossfaderCurve = curve;
      }),

    setMasterVolume: (volume) =>
      set((state) => {
        state.masterVolume = Math.max(0, Math.min(1.5, volume));
      }),

    setDeckState: (deck, partial) =>
      set((state) => {
        Object.assign(state.decks[deck], partial);
      }),

    setDeckPlaying: (deck, playing) =>
      set((state) => {
        state.decks[deck].isPlaying = playing;
      }),

    setDeckPosition: (deck, songPos, pattPos) =>
      set((state) => {
        state.decks[deck].songPos = songPos;
        state.decks[deck].pattPos = pattPos;
      }),

    setDeckPitch: (deck, offset) =>
      set((state) => {
        const clamped = Math.max(-16, Math.min(16, offset));
        state.decks[deck].pitchOffset = clamped;
        const baseBPM = state.decks[deck].detectedBPM;
        state.decks[deck].effectiveBPM = Math.round(baseBPM * Math.pow(2, clamped / 12) * 100) / 100;
      }),

    setDeckEQ: (deck, band, dB) =>
      set((state) => {
        const key = `eq${band.charAt(0).toUpperCase() + band.slice(1)}` as 'eqLow' | 'eqMid' | 'eqHigh';
        state.decks[deck][key] = Math.max(-24, Math.min(6, dB));
      }),

    setDeckEQKill: (deck, band, kill) =>
      set((state) => {
        const key = `eq${band.charAt(0).toUpperCase() + band.slice(1)}Kill` as 'eqLowKill' | 'eqMidKill' | 'eqHighKill';
        state.decks[deck][key] = kill;
      }),

    setDeckFilter: (deck, position) =>
      set((state) => {
        state.decks[deck].filterPosition = Math.max(-1, Math.min(1, position));
      }),

    setDeckVolume: (deck, volume) =>
      set((state) => {
        state.decks[deck].volume = Math.max(0, Math.min(1.5, volume));
      }),

    setDeckCuePoint: (deck, songPos) =>
      set((state) => {
        state.decks[deck].cuePoint = songPos;
      }),

    setDeckPFL: (deck, enabled) =>
      set((state) => {
        state.decks[deck].pflEnabled = enabled;
      }),

    setDeckLoop: (deck, mode, active) =>
      set((state) => {
        state.decks[deck].loopMode = mode;
        state.decks[deck].loopActive = active;
      }),

    setDeckLoopSize: (deck, size) =>
      set((state) => {
        state.decks[deck].lineLoopSize = size;
      }),

    setDeckSlip: (deck, enabled) =>
      set((state) => {
        state.decks[deck].slipEnabled = enabled;
      }),

    toggleDeckChannel: (deck, channel) =>
      set((state) => {
        state.decks[deck].channelMask ^= (1 << channel);
      }),

    setAllDeckChannels: (deck, enabled) =>
      set((state) => {
        state.decks[deck].channelMask = enabled ? 0xFFFF : 0;
      }),

    resetDeck: (deck) =>
      set((state) => {
        state.decks[deck] = { ...defaultDeckState };
      }),

    setDeckScratchActive: (deck, active) =>
      set((state) => {
        state.decks[deck].scratchActive = active;
      }),

    setDeckFaderLFO: (deck, active, division) =>
      set((state) => {
        state.decks[deck].faderLFOActive = active;
        if (division !== undefined) {
          state.decks[deck].faderLFODivision = active ? division : null;
        } else if (!active) {
          state.decks[deck].faderLFODivision = null;
        }
      }),

    setDeckPattern: (deck, name) =>
      set((state) => {
        state.decks[deck].activePatternName = name;
      }),

    setCueMode: (mode) =>
      set((state) => {
        state.cueMode = mode;
      }),

    setCueDevice: (deviceId) =>
      set((state) => {
        state.cueDeviceId = deviceId;
      }),

    setCueVolume: (volume) =>
      set((state) => {
        state.cueVolume = Math.max(0, Math.min(1.5, volume));
      }),
  })))
);

// ============================================================================
// CONVENIENCE SELECTORS
// ============================================================================

export const useDJModeActive = () => useDJStore((s) => s.djModeActive);
export const useDeckViewMode = () => useDJStore((s) => s.deckViewMode);
/** @deprecated Use useDeckViewMode instead */
export const useVinylMode = () => useDJStore((s) => s.deckViewMode !== 'visualizer');
export const useThirdDeckActive = () => useDJStore((s) => s.thirdDeckActive);
export const useDeckState = (deck: DeckId) => useDJStore((s) => s.decks[deck]);
export const useCrossfader = () => useDJStore((s) => s.crossfaderPosition);
export const useCrossfaderCurve = () => useDJStore((s) => s.crossfaderCurve);
