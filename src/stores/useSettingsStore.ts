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
  stereoSeparation: number;  // 0-100% stereo separation (20 = Amiga default, 100 = full)
  stereoSeparationMode: 'pt2' | 'modplug';
  modplugSeparation: number;    // 0–200% (OpenMPT scale; 0=mono, 100=normal, 200=enhanced)

  // MIDI Settings
  midiPolyphonic: boolean;   // Enable polyphonic MIDI playback (multiple simultaneous notes)

  // Visual Settings
  trackerVisualBg: boolean;  // Enable WebGL visual background behind tracker pattern
  trackerVisualMode: number; // Current visualizer mode index (0-5)

  // Render Mode
  renderMode: 'dom' | 'webgl';  // UI rendering: 'dom' = React/Tailwind, 'webgl' = PixiJS

  // Actions
  setAmigaLimits: (enabled: boolean) => void;
  setLinearInterpolation: (enabled: boolean) => void;
  setMasterTuning: (hz: number) => void;
  setPerformanceQuality: (quality: 'high' | 'medium' | 'low') => void;
  setUseBLEP: (enabled: boolean) => void;
  setStereoSeparation: (percent: number) => void;
  setStereoSeparationMode: (mode: 'pt2' | 'modplug') => void;
  setModplugSeparation: (percent: number) => void;
  setMidiPolyphonic: (enabled: boolean) => void;
  setTrackerVisualBg: (enabled: boolean) => void;
  setTrackerVisualMode: (mode: number) => void;
  setRenderMode: (mode: 'dom' | 'webgl') => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      // Initial state
      amigaLimits: false,
      linearInterpolation: true,
      masterTuning: 440,
      performanceQuality: 'high',
      useBLEP: false,  // Default: BLEP disabled (enable in Settings for band-limited synthesis)
      stereoSeparation: 20,  // Default: 20% (classic Amiga-style narrow separation)
      stereoSeparationMode: 'pt2' as const,
      modplugSeparation: 0,         // Default: 0% = mono
      midiPolyphonic: true,  // Default: polyphonic enabled for better jamming
      trackerVisualBg: false,  // Default: off
      trackerVisualMode: 0,    // Default: spectrum bars
      renderMode: 'dom' as const,  // Default: DOM rendering

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

      setStereoSeparation: (stereoSeparation) =>
        set((state) => {
          state.stereoSeparation = Math.max(0, Math.min(100, stereoSeparation));
        }),

      setStereoSeparationMode: (stereoSeparationMode) =>
        set((state) => {
          state.stereoSeparationMode = stereoSeparationMode;
        }),

      setModplugSeparation: (modplugSeparation) =>
        set((state) => {
          state.modplugSeparation = Math.max(0, Math.min(200, modplugSeparation));
        }),

      setMidiPolyphonic: (midiPolyphonic) =>
        set((state) => {
          state.midiPolyphonic = midiPolyphonic;
        }),

      setTrackerVisualBg: (trackerVisualBg) =>
        set((state) => {
          state.trackerVisualBg = trackerVisualBg;
        }),

      setTrackerVisualMode: (trackerVisualMode) =>
        set((state) => {
          state.trackerVisualMode = trackerVisualMode;
        }),

      setRenderMode: (renderMode) =>
        set((state) => {
          state.renderMode = renderMode;
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
        stereoSeparation: state.stereoSeparation,
        stereoSeparationMode: state.stereoSeparationMode,
        modplugSeparation: state.modplugSeparation,
        midiPolyphonic: state.midiPolyphonic,
        trackerVisualBg: state.trackerVisualBg,
        trackerVisualMode: state.trackerVisualMode,
        renderMode: state.renderMode,
      }),
    }
  )
);
