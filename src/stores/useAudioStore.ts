/**
 * Audio Store - Tone.js Engine & Audio Context State
 * Includes master effects chain management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type * as Tone from 'tone';
import type { EffectConfig, AudioEffectType as EffectType } from '@typedefs/instrument';
import type { ToneEngine } from '@engine/ToneEngine';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';
import { getDefaultEffectWet } from '@engine/factories/EffectFactory';
import { createBatchedSet } from '@/utils/batchedSet';

interface AudioStore {
  // State
  initialized: boolean;
  contextState: 'suspended' | 'running' | 'closed';
  masterVolume: number; // -60 to 0 dB
  masterMuted: boolean;
  sampleBusGain: number; // dB offset on tracker/sample path (masterInput); 0 = unity
  synthBusGain: number;  // dB offset on synth/chip path (synthBus); 0 = unity
  autoGain: boolean;     // Auto-gain: auto-balance sample vs synth bus levels
  masterLimiterEnabled: boolean;  // Safety limiter on master bus
  masterLimiterThreshold: number; // Limiter threshold in dB (-24 to 0)
  analyserNode: Tone.Analyser | null;
  fftNode: Tone.FFT | null;
  toneEngineInstance: ToneEngine | null;

  // Master Effects Chain
  masterEffects: EffectConfig[];
  presetGainCompensationDb: number;

  // Actions
  setInitialized: (initialized: boolean) => void;
  setContextState: (state: 'suspended' | 'running' | 'closed') => void;
  setMasterVolume: (volume: number) => void;
  setMasterMuted: (muted: boolean) => void;
  toggleMasterMute: () => void;
  setSampleBusGain: (db: number) => void;
  setSynthBusGain: (db: number) => void;
  setAutoGain: (enabled: boolean) => void;
  setMasterLimiterEnabled: (enabled: boolean) => void;
  setMasterLimiterThreshold: (db: number) => void;
  setAnalyserNode: (node: Tone.Analyser | null) => void;
  setFFTNode: (node: Tone.FFT | null) => void;
  setToneEngineInstance: (instance: ToneEngine) => void;

  // Master Effects Actions
  addMasterEffect: (effectType: EffectType) => void;
  addMasterEffectConfig: (effect: Omit<EffectConfig, 'id'>) => void;  // For unified effects system
  removeMasterEffect: (effectId: string) => void;
  updateMasterEffect: (effectId: string, updates: Partial<EffectConfig>) => void;
  reorderMasterEffects: (fromIndex: number, toIndex: number) => void;
  setMasterEffects: (effects: EffectConfig[], presetGainCompensationDb?: number) => void;
}

export const useAudioStore = create<AudioStore>()(
  immer((set, get) => {
    const batch = createBatchedSet<AudioStore>(set as any);

    return {
    // Initial state
    initialized: false,
    contextState: 'suspended',
    masterVolume: 0,
    masterMuted: false,
    sampleBusGain: 0,
    synthBusGain: 0,
    // Default OFF — the proportional ±12 dB bus-balancing drives chiptune
    // formats (YM2612, SN76489, Genesis) into clipping distortion because
    // they already peak near 0 dBFS. Users can opt in via the mixer when
    // they're mixing sample-heavy material alongside synths.
    autoGain: false,
    masterLimiterEnabled: true,
    masterLimiterThreshold: -6,  // -6 dB — less aggressive than old -1 dB default
    analyserNode: null,
    fftNode: null,
    toneEngineInstance: null,
    masterEffects: [],
    presetGainCompensationDb: 0,

    // Actions
    setInitialized: (initialized) =>
      set((state) => {
        state.initialized = initialized;
      }),

    setContextState: (contextState) =>
      set((state) => {
        state.contextState = contextState;
      }),

    setMasterVolume: (volume) => {
      const clamped = Math.max(-60, Math.min(0, volume));
      // Immediate engine update
      const engine = get().toneEngineInstance;
      if (engine) engine.setMasterVolume(clamped);
      // Batched store write
      batch('master-vol', (state) => {
        state.masterVolume = clamped;
      });
    },

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
        // Apply autoGain default when engine first becomes available
        if (instance && state.autoGain) {
          instance.setAutoGain(true);
        }
        // Apply limiter settings
        if (instance) {
          instance.setMasterLimiterEnabled(state.masterLimiterEnabled);
          instance.setMasterLimiterThreshold(state.masterLimiterThreshold);
        }
      }),

    setSampleBusGain: (db) => {
      const engine = get().toneEngineInstance;
      if (engine) engine.setSampleBusGain(db);
      batch('sample-bus', (state) => { state.sampleBusGain = db; });
    },

    setSynthBusGain: (db) => {
      const engine = get().toneEngineInstance;
      if (engine) engine.setSynthBusGain(db);
      batch('synth-bus', (state) => { state.synthBusGain = db; });
    },

    setAutoGain: (enabled) =>
      set((state) => {
        state.autoGain = enabled;
        const engine = get().toneEngineInstance;
        if (engine) engine.setAutoGain(enabled);
      }),

    setMasterLimiterEnabled: (enabled) => {
      const engine = get().toneEngineInstance;
      if (engine) engine.setMasterLimiterEnabled(enabled);
      set((state) => { state.masterLimiterEnabled = enabled; });
    },

    setMasterLimiterThreshold: (db) => {
      const clamped = Math.max(-24, Math.min(0, db));
      const engine = get().toneEngineInstance;
      if (engine) engine.setMasterLimiterThreshold(clamped);
      batch('limiter-threshold', (state) => { state.masterLimiterThreshold = clamped; });
    },

    // Master Effects Actions
    addMasterEffect: (effectType) => {
      // Format compat: master effects — deferred to export-time validation
      // (effects still work in DEViLBOX; only matters when exporting to native format)

      // Determine effect category. Buzzmachine effects start with 'Buzz',
      // WAM effects start with 'WAM'. Everything else defaults to 'tonejs'.
      // This avoids importing unifiedEffects (which causes circular deps in prod).
      const category: EffectConfig['category'] = (effectType as string).startsWith('WAM') ? 'wam'
        : 'tonejs';

      set((state) => {
        const newEffect: EffectConfig = {
          id: `master-fx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          category,
          type: effectType,
          enabled: true,
          wet: getDefaultEffectWet(effectType),
          parameters: getDefaultEffectParameters(effectType),
        };
        state.masterEffects.push(newEffect);
        // Engine rebuild handled by usePatternPlayback's useEffect on masterEffectsKey
      });
    },

    // Add master effect with full configuration (for unified effects system)
    addMasterEffectConfig: (effect) =>
      set((state) => {
        const newEffect: EffectConfig = {
          ...effect,
          id: `master-fx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          parameters: { ...getDefaultEffectParameters(effect.type), ...effect.parameters },
        };
        state.masterEffects.push(newEffect);
        // Engine rebuild handled by usePatternPlayback's useEffect on masterEffectsKey
      }),

    removeMasterEffect: (effectId) =>
      set((state) => {
        const index = state.masterEffects.findIndex((e) => e.id === effectId);
        if (index !== -1) {
          state.masterEffects.splice(index, 1);
          // Engine rebuild handled by usePatternPlayback's useEffect on masterEffectsKey
        }
      }),

    updateMasterEffect: (effectId, updates) => {
      // Read current effects to compute merged state
      const effects = get().masterEffects;
      const effect = effects.find((e) => e.id === effectId);
      if (!effect) return;

      // For enable/disable toggles, just write to store (engine rebuild is handled
      // by usePatternPlayback's useEffect on masterEffectsKey).
      if ('enabled' in updates) {
        set((state) => {
          const fx = state.masterEffects.find((e) => e.id === effectId);
          if (fx) Object.assign(fx, updates);
        });
        if (Array.isArray(effect.selectedChannels) && effect.selectedChannels.length > 0) {
          import('./useMixerStore').then(({ scheduleWasmEffectRebuild }) => {
            scheduleWasmEffectRebuild();
          }).catch(() => {});
        }
        return;
      }

      // Compute merged effect BEFORE entering Immer (avoids engine work inside set())
      const mergedParams = updates.parameters
        ? { ...getDefaultEffectParameters(effect.type), ...effect.parameters, ...updates.parameters }
        : effect.parameters;
      const mergedEffect: EffectConfig = { ...effect, ...updates, parameters: mergedParams };

      // Immediate engine update — outside set()
      const engine = get().toneEngineInstance;
      if (engine) {
        engine.updateMasterEffectParams(effectId, mergedEffect);
        if (mergedEffect.parameters.bpmSync === 1) {
          engine.updateBpmSyncedEffects(engine.getBPM());
        }
      }

      // When selectedChannels changes, trigger WASM isolation rebuild
      if ('selectedChannels' in updates) {
        import('./useMixerStore').then(({ scheduleWasmEffectRebuild }) => {
          scheduleWasmEffectRebuild();
        }).catch(() => {});
      }

      // Batched store write
      batch(`fx-${effectId}`, (state) => {
        const fx = state.masterEffects.find((e) => e.id === effectId);
        if (fx) {
          if (updates.parameters) {
            fx.parameters = { ...getDefaultEffectParameters(fx.type), ...fx.parameters, ...updates.parameters };
          }
          Object.assign(fx, updates);
        }
      });
    },

    reorderMasterEffects: (fromIndex, toIndex) =>
      set((state) => {
        const [removed] = state.masterEffects.splice(fromIndex, 1);
        state.masterEffects.splice(toIndex, 0, removed);
        // Engine rebuild handled by usePatternPlayback's useEffect on masterEffectsKey
      }),

    setMasterEffects: (effects, presetGainCompensationDb) =>
      set((state) => {
        // Store preset-level gain compensation (0 = no compensation)
        state.presetGainCompensationDb = presetGainCompensationDb ?? 0;

        // Migrate old effects without category field (backward compatibility)
        const migratedEffects = effects.map(effect => {
          const withCategory = {
            ...effect,
            // Add category if missing - default to 'tonejs' for old saved songs
            category: effect.category || ('tonejs' as const),
          };

          // Migrate Tumult effects: old default had switchBranch=1 (Follow mode),
          // which gates noise to ~10% amplitude and silences brown noise entirely.
          // Detect old data by switchBranch===1 and correlated stale defaults.
          if (withCategory.type === 'Tumult' && Number(withCategory.parameters?.switchBranch) === 1) {
            const p = withCategory.parameters ?? {};
            return {
              ...withCategory,
              parameters: {
                ...p,
                switchBranch: 0,
                ...(Number(p.mix) >= 1.0         ? { mix: 0.5 }            : {}),
                ...(Number(p.peak1Enable) === 1  ? { peak1Enable: 0 }      : {}),
                ...(Number(p.peak2Enable) === 1  ? { peak2Enable: 0 }      : {}),
                ...(Number(p.followRelease) > 20 ? { followRelease: 15.0 } : {}),
              },
            };
          }

          return withCategory;
        });

        state.masterEffects = migratedEffects;
        // Engine rebuild handled by usePatternPlayback's useEffect on masterEffectsKey
      }),
  };
  })
);
