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

export const DEFAULT_VOCODER_PARAMS: VocoderParams = {
  bands: 16,
  filtersPerBand: 4,
  reactionTime: 0.03,
  formantShift: 1.0,
  carrierType: 'chord',
  carrierFreq: 130.81,
  wet: 1.0,
};

interface VocoderState {
  /** Whether the vocoder is currently active and processing */
  isActive: boolean;
  /** Current RMS amplitude of vocoded output (0-1), updated ~20x/sec */
  amplitude: number;
  /** User-configurable parameters */
  params: VocoderParams;

  setActive: (active: boolean) => void;
  setAmplitude: (amp: number) => void;
  setParam: <K extends keyof VocoderParams>(key: K, value: VocoderParams[K]) => void;
  setParams: (params: Partial<VocoderParams>) => void;
}

export const useVocoderStore = create<VocoderState>((set) => ({
  isActive: false,
  amplitude: 0,
  params: { ...DEFAULT_VOCODER_PARAMS },

  setActive: (active) => set({ isActive: active }),
  setAmplitude: (amp) => set({ amplitude: amp }),
  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value } })),
  setParams: (partial) =>
    set((s) => ({ params: { ...s.params, ...partial } })),
}));
