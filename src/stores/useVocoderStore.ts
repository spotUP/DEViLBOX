/**
 * useVocoderStore — state management for the vocoder effect.
 *
 * Tracks active state, current amplitude (for Kraftwerk head lip-sync),
 * and user-configurable parameters.
 */

import { create } from 'zustand';

export type CarrierType = 'saw' | 'square' | 'noise' | 'chord';

export interface VocoderParams {
  bands: number;           // 12-64, default 48
  filtersPerBand: number;  // 1-8, default 6
  reactionTime: number;    // 0.002-2.0 seconds, default 0.03
  formantShift: number;    // 0.25-4.0 octaves, default 1.0
  carrierType: CarrierType;
  carrierFreq: number;     // 20-2000 Hz, default 130.81 (C3)
  wet: number;             // 0-1, default 1.0
}

export interface VocoderPreset {
  name: string;
  params: VocoderParams;
}

export const VOCODER_PRESETS: VocoderPreset[] = [
  {
    name: 'Kraftwerk',
    params: {
      bands: 32, filtersPerBand: 6, reactionTime: 0.015,
      formantShift: 1.0, carrierType: 'saw', carrierFreq: 130.81, wet: 0.85,
    },
  },
  {
    name: 'Daft Punk',
    params: {
      bands: 48, filtersPerBand: 6, reactionTime: 0.01,
      formantShift: 1.2, carrierType: 'square', carrierFreq: 174.61, wet: 0.9,
    },
  },
  {
    name: 'Deep Robot',
    params: {
      bands: 24, filtersPerBand: 4, reactionTime: 0.025,
      formantShift: 0.6, carrierType: 'saw', carrierFreq: 65.41, wet: 1.0,
    },
  },
  {
    name: 'Chipmunk',
    params: {
      bands: 48, filtersPerBand: 6, reactionTime: 0.008,
      formantShift: 2.0, carrierType: 'saw', carrierFreq: 261.63, wet: 0.9,
    },
  },
  {
    name: 'Whisper',
    params: {
      bands: 16, filtersPerBand: 4, reactionTime: 0.04,
      formantShift: 1.0, carrierType: 'noise', carrierFreq: 130.81, wet: 0.7,
    },
  },
  {
    name: 'Chord Pad',
    params: {
      bands: 24, filtersPerBand: 4, reactionTime: 0.03,
      formantShift: 1.0, carrierType: 'chord', carrierFreq: 130.81, wet: 1.0,
    },
  },
  {
    name: 'Talkbox',
    params: {
      bands: 64, filtersPerBand: 8, reactionTime: 0.005,
      formantShift: 1.0, carrierType: 'saw', carrierFreq: 196.0, wet: 0.75,
    },
  },
  {
    name: 'Alien',
    params: {
      bands: 32, filtersPerBand: 4, reactionTime: 0.02,
      formantShift: 3.0, carrierType: 'square', carrierFreq: 82.41, wet: 1.0,
    },
  },
];

export const DEFAULT_VOCODER_PARAMS: VocoderParams = { ...VOCODER_PRESETS[0].params };

interface VocoderState {
  /** Whether the vocoder is currently active and processing */
  isActive: boolean;
  /** Current RMS amplitude of vocoded output (0-1), updated ~20x/sec */
  amplitude: number;
  /** User-configurable parameters */
  params: VocoderParams;
  /** Currently selected preset name (null if tweaked away from preset) */
  presetName: string | null;

  setActive: (active: boolean) => void;
  setAmplitude: (amp: number) => void;
  setParam: <K extends keyof VocoderParams>(key: K, value: VocoderParams[K]) => void;
  setParams: (params: Partial<VocoderParams>) => void;
  loadPreset: (name: string) => void;
}

export const useVocoderStore = create<VocoderState>((set) => ({
  isActive: false,
  amplitude: 0,
  params: { ...DEFAULT_VOCODER_PARAMS },
  presetName: VOCODER_PRESETS[0].name,

  setActive: (active) => set({ isActive: active }),
  setAmplitude: (amp) => set({ amplitude: amp }),
  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value }, presetName: null })),
  setParams: (partial) =>
    set((s) => ({ params: { ...s.params, ...partial }, presetName: null })),
  loadPreset: (name) => {
    const preset = VOCODER_PRESETS.find(p => p.name === name);
    if (preset) set({ params: { ...preset.params }, presetName: name });
  },
}));
