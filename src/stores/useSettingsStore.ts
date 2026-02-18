/**
 * Settings Store - Global engine & audio configuration
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  // Engine Settings
  amigaLimits: boolean;      // Clamp periods to 113-856 (MOD/S3M/IT)
  linearInterpolation: boolean; // Enable linear interpolation for sample playback
  masterTuning: number;      // Master tuning in Hz (default 440)

  // Audio Settings
  performanceQuality: 'high' | 'medium' | 'low';
  useBLEP: boolean;          // Enable BLEP (Band-Limited Step) synthesis to reduce aliasing

  // MIDI Settings
  midiPolyphonic: boolean;   // Enable polyphonic MIDI playback (multiple simultaneous notes)

  // Actions
  setAmigaLimits: (enabled: boolean) => void;
  setLinearInterpolation: (enabled: boolean) => void;
  setMasterTuning: (hz: number) => void;
  setPerformanceQuality: (quality: 'high' | 'medium' | 'low') => void;
  setUseBLEP: (enabled: boolean) => void;
  setMidiPolyphonic: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      // Initial state
      amigaLimits: false,
      linearInterpolation: true,
      masterTuning: 440,
      performanceQuality: 'high',
      useBLEP: true,  // Default: BLEP enabled for better audio quality
      midiPolyphonic: true,  // Default: polyphonic enabled for better jamming

    // Actions
    setAmigaLimits: (amigaLimits) =>
      set((state) => {
        state.amigaLimits = amigaLimits;
      }),

    setLinearInterpolation: (linearInterpolation) =>
      set((state) => {
        state.linearInterpolation = linearInterpolation;
      }),

    setMasterTuning: (masterTuning) =>
      set((state) => {
        state.masterTuning = masterTuning;
      }),

    setPerformanceQuality: (performanceQuality) =>
      set((state) => {
        state.performanceQuality = performanceQuality;
      }),

      setUseBLEP: (useBLEP) =>
        set((state) => {
          state.useBLEP = useBLEP;
        }),

      setMidiPolyphonic: (midiPolyphonic) =>
        set((state) => {
          state.midiPolyphonic = midiPolyphonic;
        }),
    })),
    {
      name: 'devilbox-settings',
      partialize: (state) => ({
        amigaLimits: state.amigaLimits,
        linearInterpolation: state.linearInterpolation,
        masterTuning: state.masterTuning,
        performanceQuality: state.performanceQuality,
        useBLEP: state.useBLEP,
        midiPolyphonic: state.midiPolyphonic,
      }),
    }
  )
);
