/**
 * Audio Store - Tone.js Engine & Audio Context State
 * Includes master effects chain management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type * as Tone from 'tone';
import type { EffectConfig, EffectType } from '@typedefs/instrument';
import { idGenerator } from '../utils/idGenerator';

interface AudioStore {
  // State
  initialized: boolean;
  contextState: 'suspended' | 'running' | 'closed';
  masterVolume: number; // -60 to 0 dB
  masterMuted: boolean;
  analyserNode: Tone.Analyser | null;
  fftNode: Tone.FFT | null;
  toneEngineInstance: any | null; // eslint-disable-line @typescript-eslint/no-explicit-any

  // Master Effects Chain
  masterEffects: EffectConfig[];

  // Actions
  setInitialized: (initialized: boolean) => void;
  setContextState: (state: 'suspended' | 'running' | 'closed') => void;
  setMasterVolume: (volume: number) => void;
  setMasterMuted: (muted: boolean) => void;
  toggleMasterMute: () => void;
  setAnalyserNode: (node: Tone.Analyser | null) => void;
  setFFTNode: (node: Tone.FFT | null) => void;
  setToneEngineInstance: (instance: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

  // Master Effects Actions
  addMasterEffect: (effectType: EffectType) => void;
  removeMasterEffect: (effectId: string) => void;
  updateMasterEffect: (effectId: string, updates: Partial<EffectConfig>) => void;
  reorderMasterEffects: (fromIndex: number, toIndex: number) => void;
  setMasterEffects: (effects: EffectConfig[]) => void;
}

export const useAudioStore = create<AudioStore>()(
  immer((set, get) => ({
    // Initial state
    initialized: false,
    contextState: 'suspended',
    masterVolume: 0,
    masterMuted: false,
    analyserNode: null,
    fftNode: null,
    toneEngineInstance: null,
    masterEffects: [],

    // Actions
    setInitialized: (initialized) =>
      set((state) => {
        state.initialized = initialized;
      }),

    setContextState: (contextState) =>
      set((state) => {
        state.contextState = contextState;
      }),

    setMasterVolume: (volume) =>
      set((state) => {
        // Clamp between -60 and 0 dB
        state.masterVolume = Math.max(-60, Math.min(0, volume));

        // Apply to ToneEngine
        const engine = get().toneEngineInstance;
        if (engine) {
          engine.setMasterVolume(state.masterVolume);
        }
      }),

    setMasterMuted: (muted) =>
      set((state) => {
        state.masterMuted = muted;

        // Apply to ToneEngine
        const engine = get().toneEngineInstance;
        if (engine) {
          engine.setMasterMute(muted);
        }
      }),

    toggleMasterMute: () =>
      set((state) => {
        state.masterMuted = !state.masterMuted;

        // Apply to ToneEngine
        const engine = get().toneEngineInstance;
        if (engine) {
          engine.setMasterMute(state.masterMuted);
        }
      }),

    setAnalyserNode: (node) =>
      set((state) => {
        state.analyserNode = node;
      }),

    setFFTNode: (node) =>
      set((state) => {
        state.fftNode = node;
      }),

    setToneEngineInstance: (instance) =>
      set((state) => {
        state.toneEngineInstance = instance;
      }),

    // Master Effects Actions
    addMasterEffect: (effectType) =>
      set((state) => {
        const newEffect: EffectConfig = {
          id: idGenerator.generate('effect'),
          type: effectType,
          enabled: true,
          wet: 50,
          parameters: {},
        };
        state.masterEffects.push(newEffect);

        // Notify ToneEngine to rebuild master effects chain
        const engine = get().toneEngineInstance;
        if (engine) {
          engine.rebuildMasterEffects(state.masterEffects);
        }
      }),

    removeMasterEffect: (effectId) =>
      set((state) => {
        const index = state.masterEffects.findIndex((e) => e.id === effectId);
        if (index !== -1) {
          state.masterEffects.splice(index, 1);

          // Notify ToneEngine to rebuild master effects chain
          const engine = get().toneEngineInstance;
          if (engine) {
            engine.rebuildMasterEffects(state.masterEffects);
          }
        }
      }),

    updateMasterEffect: (effectId, updates) =>
      set((state) => {
        const effect = state.masterEffects.find((e) => e.id === effectId);
        if (effect) {
          Object.assign(effect, updates);

          // Notify ToneEngine to update effect
          const engine = get().toneEngineInstance;
          if (engine) {
            engine.updateMasterEffectParams(effectId, effect);
          }
        }
      }),

    reorderMasterEffects: (fromIndex, toIndex) =>
      set((state) => {
        const [removed] = state.masterEffects.splice(fromIndex, 1);
        state.masterEffects.splice(toIndex, 0, removed);

        // Notify ToneEngine to rebuild master effects chain
        const engine = get().toneEngineInstance;
        if (engine) {
          engine.rebuildMasterEffects(state.masterEffects);
        }
      }),

    setMasterEffects: (effects) =>
      set((state) => {
        state.masterEffects = effects;

        // Notify ToneEngine to rebuild master effects chain
        const engine = get().toneEngineInstance;
        if (engine) {
          engine.rebuildMasterEffects(effects);
        }
      }),
  }))
);
