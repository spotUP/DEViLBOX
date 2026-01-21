/**
 * Audio Store - Tone.js Engine & Audio Context State
 * Includes master effects chain management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type * as Tone from 'tone';
import type { EffectConfig, EffectType } from '@typedefs/instrument';

interface AudioStore {
  // State
  initialized: boolean;
  contextState: 'suspended' | 'running' | 'closed';
  masterVolume: number; // -60 to 0 dB
  masterMuted: boolean;
  analyserNode: Tone.Analyser | null;
  fftNode: Tone.FFT | null;
  toneEngineInstance: any | null; // Will be ToneEngine class instance

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
  setToneEngineInstance: (instance: any) => void;

  // Master Effects Actions
  addMasterEffect: (effectType: EffectType) => void;
  addMasterEffectConfig: (effect: Omit<EffectConfig, 'id'>) => void;  // For unified effects system
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
          id: `master-fx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          category: 'tonejs',  // Master effects are Tone.js by default
          type: effectType,
          enabled: true,
          wet: 50,
          parameters: {},
        };
        state.masterEffects.push(newEffect);

        // Notify ToneEngine to rebuild master effects chain (async for neural effects)
        const engine = get().toneEngineInstance;
        if (engine) {
          (async () => {
            try {
              await engine.rebuildMasterEffects(state.masterEffects);
            } catch (error) {
              console.warn('[AudioStore] Could not rebuild master effects:', error);
            }
          })();
        }
      }),

    // Add master effect with full configuration (for unified effects system)
    addMasterEffectConfig: (effect) =>
      set((state) => {
        const newEffect: EffectConfig = {
          ...effect,
          id: `master-fx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };
        state.masterEffects.push(newEffect);

        // Notify ToneEngine to rebuild master effects chain (async for neural effects)
        const engine = get().toneEngineInstance;
        if (engine) {
          (async () => {
            try {
              await engine.rebuildMasterEffects(state.masterEffects);
            } catch (error) {
              console.warn('[AudioStore] Could not rebuild master effects:', error);
            }
          })();
        }
      }),

    removeMasterEffect: (effectId) =>
      set((state) => {
        const index = state.masterEffects.findIndex((e) => e.id === effectId);
        if (index !== -1) {
          state.masterEffects.splice(index, 1);

          // Notify ToneEngine to rebuild master effects chain (async for neural effects)
          const engine = get().toneEngineInstance;
          if (engine) {
            (async () => {
              try {
                await engine.rebuildMasterEffects(state.masterEffects);
              } catch (error) {
                console.warn('[AudioStore] Could not rebuild master effects:', error);
              }
            })();
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

        // Notify ToneEngine to rebuild master effects chain (async for neural effects)
        const engine = get().toneEngineInstance;
        if (engine) {
          (async () => {
            try {
              await engine.rebuildMasterEffects(state.masterEffects);
            } catch (error) {
              console.warn('[AudioStore] Could not rebuild master effects:', error);
            }
          })();
        }
      }),

    setMasterEffects: (effects) =>
      set((state) => {
        // Migrate old effects without category field (backward compatibility)
        const migratedEffects = effects.map(effect => ({
          ...effect,
          // Add category if missing - default to 'tonejs' for old saved songs
          category: effect.category || ('tonejs' as const),
        }));

        state.masterEffects = migratedEffects;

        // Notify ToneEngine to rebuild master effects chain (async for neural effects)
        const engine = get().toneEngineInstance;
        if (engine) {
          (async () => {
            try {
              await engine.rebuildMasterEffects(migratedEffects);
            } catch (error) {
              console.warn('[AudioStore] Could not rebuild master effects:', error);
            }
          })();
        }
      }),
  }))
);
