/**
 * Instrument Store - Instrument Bank & Preset Management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  InstrumentConfig,
  InstrumentPreset,
  EffectConfig,
} from '@typedefs/instrument';
import {
  DEFAULT_OSCILLATOR,
  DEFAULT_ENVELOPE,
  DEFAULT_FILTER,
  DEFAULT_TB303,
} from '@typedefs/instrument';
import { TB303_PRESETS } from '@constants/tb303Presets';
import { getToneEngine } from '@engine/ToneEngine';

interface InstrumentStore {
  // State
  instruments: InstrumentConfig[];
  currentInstrumentId: number | null;
  currentInstrument: InstrumentConfig | null;
  previewInstrument: InstrumentConfig | null; // For modal previews (EditInstrumentModal)
  presets: InstrumentPreset[];

  // Actions
  setCurrentInstrument: (id: number) => void;
  setPreviewInstrument: (instrument: InstrumentConfig | null) => void;
  getInstrument: (id: number) => InstrumentConfig | undefined;
  updateInstrument: (id: number, updates: Partial<InstrumentConfig>) => void;
  createInstrument: (config?: Partial<InstrumentConfig>) => number;
  addInstrument: (config: InstrumentConfig) => void;
  deleteInstrument: (id: number) => void;
  cloneInstrument: (id: number) => number;
  resetInstrument: (id: number) => void;

  // Effects
  addEffect: (instrumentId: number, effectType: EffectConfig['type']) => void;
  addEffectConfig: (instrumentId: number, effect: Omit<EffectConfig, 'id'>) => void;  // For unified effects system
  removeEffect: (instrumentId: number, effectId: string) => void;
  updateEffect: (instrumentId: number, effectId: string, updates: Partial<EffectConfig>) => void;
  reorderEffects: (instrumentId: number, fromIndex: number, toIndex: number) => void;

  // Presets
  loadPreset: (preset: InstrumentPreset, targetInstrumentId: number) => void;
  saveAsPreset: (instrumentId: number, name: string, category: InstrumentPreset['category']) => void;

  // Import
  loadInstruments: (instruments: InstrumentConfig[]) => void;

  // Transformation (MOD/XM import)
  transformInstrument: (
    instrumentId: number,
    targetSynthType: InstrumentConfig['synthType'],
    mappingStrategy: 'analyze' | 'default'
  ) => void;
  revertToSample: (instrumentId: number) => void;

  // Reset to initial state
  reset: () => void;
}

const createDefaultInstrument = (id: number): InstrumentConfig => ({
  id,
  name: `TB303 ${String(id).padStart(2, '0')}`,
  type: 'synth', // DEViLBOX synth instrument
  synthType: 'TB303',
  tb303: { ...DEFAULT_TB303 },
  oscillator: { ...DEFAULT_OSCILLATOR },
  envelope: { ...DEFAULT_ENVELOPE },
  filter: { ...DEFAULT_FILTER },
  effects: [],
  volume: -6,
  pan: 0,
});

/**
 * Find next available instrument ID (1-128, XM-compatible range)
 * IDs are 1-indexed: 1-128 for valid instruments, 0 = no instrument
 */
const findNextId = (existingIds: number[]): number => {
  for (let id = 1; id <= 128; id++) {
    if (!existingIds.includes(id)) {
      return id;
    }
  }
  console.warn('Maximum number of instruments reached (128)');
  return 1; // Return 1 as fallback (not 0, which means "no instrument")
};

export const useInstrumentStore = create<InstrumentStore>()(
  immer((set, get) => ({
    // Initial state - Start with TB-303 Classic preset (ID 1, XM-compatible)
    instruments: [{ ...TB303_PRESETS[0], id: 1, type: 'synth' } as InstrumentConfig],
    currentInstrumentId: 1,
    get currentInstrument() {
      const state = get();
      return state.instruments.find((inst) => inst.id === state.currentInstrumentId) || null;
    },
    previewInstrument: null, // For modal previews (MIDI will use this when set)
    presets: [],

    // Actions
    setCurrentInstrument: (id) =>
      set((state) => {
        if (state.instruments.find((inst) => inst.id === id)) {
          state.currentInstrumentId = id;
        }
      }),

    setPreviewInstrument: (instrument) =>
      set((state) => {
        state.previewInstrument = instrument;
      }),

    getInstrument: (id) => {
      return get().instruments.find((inst) => inst.id === id);
    },

    updateInstrument: (id, updates) => {
      const currentInstrument = get().instruments.find((inst) => inst.id === id);

      // Check what's changing
      const synthTypeChanging = currentInstrument && updates.synthType && updates.synthType !== currentInstrument.synthType;
      const isPresetLoad = updates.name && updates.synthType; // Loading a preset has both name and synthType
      const isTB303Update = updates.tb303 && currentInstrument?.synthType === 'TB303' && !synthTypeChanging;

      // Check if any sound-affecting parameters are changing (not just name/volume/pan)
      const soundParamsChanging = !!(
        updates.oscillator ||
        updates.envelope ||
        updates.filter ||
        updates.filterEnvelope ||
        updates.superSaw ||
        updates.polySynth ||
        updates.organ ||
        updates.drumMachine ||
        updates.chipSynth ||
        updates.pwmSynth ||
        updates.stringMachine ||
        updates.formantSynth ||
        updates.wavetable ||
        updates.granular
      );

      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === id);
        if (instrument) {
          // Explicitly exclude 'id' from updates to prevent ID from being changed
          const { id: _ignoredId, ...safeUpdates } = updates as any;

          // Deep merge nested objects to preserve existing fields
          Object.keys(safeUpdates).forEach(key => {
            const value = safeUpdates[key];
            if (value && typeof value === 'object' && !Array.isArray(value) && instrument[key as keyof InstrumentConfig]) {
              // Merge nested objects (oscillator, envelope, filter, etc.)
              Object.assign(instrument[key as keyof InstrumentConfig] as any, value);
            } else {
              // Direct assignment for primitives and new objects
              (instrument as any)[key] = value;
            }
          });
        }
      });

      // Handle TB303 real-time updates specially (without recreating)
      if (isTB303Update && !soundParamsChanging) {
        try {
          const engine = getToneEngine();
          const updatedInstrument = get().instruments.find((inst) => inst.id === id);
          if (updatedInstrument?.tb303) {
            // Update core TB303 parameters
            engine.updateTB303Parameters(id, updatedInstrument.tb303);

            // Overdrive updates are handled by updateTB303Parameters
          }
        } catch (error) {
          console.warn('[InstrumentStore] Could not update TB303 parameters:', error);
        }
        return;
      }

      // Invalidate the cached Tone.js instrument for any sound-affecting changes
      if (synthTypeChanging || isPresetLoad || soundParamsChanging) {
        try {
          const engine = getToneEngine();
          engine.invalidateInstrument(id);
        } catch (error) {
          console.warn('[InstrumentStore] Could not invalidate instrument:', error);
        }
      }
    },

    createInstrument: (config) => {
      const existingIds = get().instruments.map((i) => i.id);
      const newId = findNextId(existingIds);

      set((state) => {
        const newInstrument: InstrumentConfig = {
          ...createDefaultInstrument(newId),
          ...config,
          id: newId,
        };

        state.instruments.push(newInstrument);
        state.currentInstrumentId = newId;
      });

      return newId;
    },

    addInstrument: (config) => {
      set((state) => {
        // Check if instrument with this ID already exists
        const existing = state.instruments.find((i) => i.id === config.id);
        if (existing) {
          // Update existing instrument
          Object.assign(existing, config);
        } else {
          // Add new instrument
          state.instruments.push({ ...config });
        }
        state.currentInstrumentId = config.id;
      });
    },

    deleteInstrument: (id) =>
      set((state) => {
        const index = state.instruments.findIndex((inst) => inst.id === id);
        if (index !== -1 && state.instruments.length > 1) {
          state.instruments.splice(index, 1);
          if (state.currentInstrumentId === id) {
            state.currentInstrumentId = state.instruments[0].id;
          }
        }
      }),

    cloneInstrument: (id) => {
      const original = get().instruments.find((inst) => inst.id === id);
      if (!original) return id;

      const existingIds = get().instruments.map((i) => i.id);
      const newId = findNextId(existingIds);

      set((state) => {
        const cloned: InstrumentConfig = JSON.parse(JSON.stringify(original));
        cloned.id = newId;
        cloned.name = `${original.name} (Copy)`;
        state.instruments.push(cloned);
        state.currentInstrumentId = newId;
      });

      return newId;
    },

    resetInstrument: (id) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === id);
        if (instrument) {
          // Reset to default TB-303 preset
          const defaultInst = createDefaultInstrument(id);
          Object.assign(instrument, defaultInst);
        }
      });

      // Invalidate the cached Tone.js instrument so it gets recreated
      try {
        const engine = getToneEngine();
        engine.invalidateInstrument(id);
      } catch (error) {
        console.warn('[InstrumentStore] Could not invalidate instrument:', error);
      }
    },

    // Effects
    addEffect: (instrumentId, effectType) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          const newEffect: EffectConfig = {
            id: `effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            category: 'tonejs',  // Legacy addEffect creates Tone.js effects
            type: effectType,
            enabled: true,
            wet: 50,
            parameters: {},
          };
          instrument.effects.push(newEffect);
        }
      });

      // Rebuild instrument effect chain in audio engine (async for neural effects)
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);
      if (instrument) {
        (async () => {
          try {
            const engine = getToneEngine();
            await engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
          } catch (error) {
            console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
          }
        })();
      }
    },

    // Add effect with full configuration (for unified effects system)
    addEffectConfig: (instrumentId, effect) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          const newEffect: EffectConfig = {
            ...effect,
            id: `effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          };
          instrument.effects.push(newEffect);
        }
      });

      // Rebuild instrument effect chain in audio engine (async for neural effects)
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);
      if (instrument) {
        (async () => {
          try {
            const engine = getToneEngine();
            await engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
          } catch (error) {
            console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
          }
        })();
      }
    },

    removeEffect: (instrumentId, effectId) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          const index = instrument.effects.findIndex((eff) => eff.id === effectId);
          if (index !== -1) {
            instrument.effects.splice(index, 1);
          }
        }
      });

      // Rebuild instrument effect chain in audio engine (async for neural effects)
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);
      if (instrument) {
        (async () => {
          try {
            const engine = getToneEngine();
            await engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
          } catch (error) {
            console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
          }
        })();
      }
    },

    updateEffect: (instrumentId, effectId, updates) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          const effect = instrument.effects.find((eff) => eff.id === effectId);
          if (effect) {
            Object.assign(effect, updates);
          }
        }
      });

      // Only rebuild if enabled state changed (other params can be updated in-place later)
      if (updates.enabled !== undefined) {
        const instrument = get().instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          (async () => {
            try {
              const engine = getToneEngine();
              await engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
            } catch (error) {
              console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
            }
          })();
        }
      }
    },

    reorderEffects: (instrumentId, fromIndex, toIndex) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          const [removed] = instrument.effects.splice(fromIndex, 1);
          instrument.effects.splice(toIndex, 0, removed);
        }
      });

      // Rebuild instrument effect chain in audio engine (async for neural effects)
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);
      if (instrument) {
        (async () => {
          try {
            const engine = getToneEngine();
            await engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
          } catch (error) {
            console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
          }
        })();
      }
    },

    // Presets
    loadPreset: (preset, targetInstrumentId) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === targetInstrumentId);
        if (instrument) {
          Object.assign(instrument, preset.config);
          instrument.id = targetInstrumentId; // Preserve the ID
        }
      });

      // Invalidate the cached Tone.js instrument so it gets recreated with new config
      try {
        const engine = getToneEngine();
        engine.invalidateInstrument(targetInstrumentId);
      } catch (error) {
        console.warn('[InstrumentStore] Could not invalidate instrument:', error);
      }
    },

    saveAsPreset: (instrumentId, name, category) =>
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          const newPreset: InstrumentPreset = {
            id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name,
            category,
            tags: [],
            author: 'User',
            config: {
              name: instrument.name,
              type: instrument.type,
              synthType: instrument.synthType,
              oscillator: instrument.oscillator,
              envelope: instrument.envelope,
              filter: instrument.filter,
              filterEnvelope: instrument.filterEnvelope,
              tb303: instrument.tb303,
              effects: instrument.effects,
              volume: instrument.volume,
              pan: instrument.pan,
            },
          };
          state.presets.push(newPreset);
        }
      }),

    // Import instruments from song file
    loadInstruments: (newInstruments) => {
      // First invalidate all existing instruments in the engine
      const engine = getToneEngine();
      get().instruments.forEach((inst) => {
        try {
          engine.invalidateInstrument(inst.id);
        } catch (e) {
          // Ignore errors during invalidation
        }
      });

      // Migrate old instruments (backward compatibility)
      const migratedInstruments = newInstruments.map(inst => ({
        ...inst,
        // Add type field if missing (backward compatibility)
        // Sampler = sample, everything else = synth
        type: inst.type || (inst.synthType === 'Sampler' ? 'sample' as const : 'synth' as const),
        // Migrate old effects without category field
        effects: inst.effects?.map(effect => ({
          ...effect,
          // Add category if missing - default to 'tonejs' for old saved songs
          category: effect.category || ('tonejs' as const),
        })) || [],
      }));

      set((state) => {
        state.instruments = migratedInstruments;
        state.currentInstrumentId = migratedInstruments.length > 0 ? migratedInstruments[0].id : null;
      });

    },

    // Transform sample instrument to synth (MOD/XM import feature)
    transformInstrument: (instrumentId, targetSynthType, mappingStrategy) => {
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);

      if (!instrument) {
        console.error('[InstrumentStore] Instrument not found:', instrumentId);
        return;
      }

      if (instrument.synthType !== 'Sampler') {
        console.error('[InstrumentStore] Can only transform Sampler instruments');
        return;
      }

      // Preserve original sample configuration
      const preservedSample = instrument.sample
        ? {
            ...instrument.sample,
            envelope: instrument.envelope || { ...DEFAULT_ENVELOPE },
          }
        : undefined;

      if (!preservedSample) {
        console.error('[InstrumentStore] No sample data to preserve');
        return;
      }

      // Get suggested config based on strategy
      let synthConfig: any;

      if (mappingStrategy === 'analyze') {
        // Import analysis functions (dynamic import to avoid circular dependencies)
        import('@/lib/import/InstrumentConverter').then(({ analyzeSample, suggestSynthConfig }) => {
          // Analyze sample if we have the data
          const analysis = analyzeSample(
            {
              id: instrumentId,
              name: instrument.name,
              pcmData: preservedSample.audioBuffer || new ArrayBuffer(0),
              loopStart: preservedSample.loopStart,
              loopLength: preservedSample.loopEnd - preservedSample.loopStart,
              loopType: preservedSample.loop ? 'forward' : 'none',
              volume: 64,
              finetune: 0,
              relativeNote: 0,
              panning: 128,
              bitDepth: 16,
              sampleRate: 44100,
              length: 1000,
            },
            instrument.metadata?.originalEnvelope
          );

          synthConfig = suggestSynthConfig(targetSynthType, analysis);

          // Update the instrument with analyzed config
          performTransformation(instrumentId, targetSynthType, synthConfig, preservedSample, instrument);
        });
      } else {
        // Use default config
        synthConfig = getDefaultConfigForSynthType(targetSynthType);
        performTransformation(instrumentId, targetSynthType, synthConfig, preservedSample, instrument);
      }

      function performTransformation(
        id: number,
        synthType: InstrumentConfig['synthType'],
        config: any,
        preserved: any,
        _originalInst: InstrumentConfig
      ) {
        set((state) => {
          const inst = state.instruments.find((i) => i.id === id);
          if (!inst) return;

          // Clear synth-specific configs
          delete inst.tb303;
          delete inst.polySynth;
          delete inst.wavetable;
          delete inst.granular;
          delete inst.superSaw;
          delete inst.organ;
          delete inst.drumMachine;
          delete inst.chipSynth;
          delete inst.pwmSynth;
          delete inst.stringMachine;
          delete inst.formantSynth;
          delete inst.sample;

          // Set new synth type and config
          inst.type = 'synth'; // Transformed to synth
          inst.synthType = synthType;

          // Assign synth-specific config
          const synthKey = synthType.toLowerCase();
          (inst as any)[synthKey] = config;

          // Update metadata
          if (!inst.metadata) {
            inst.metadata = {};
          }

          inst.metadata.preservedSample = preserved;

          if (!inst.metadata.transformHistory) {
            inst.metadata.transformHistory = [];
          }

          inst.metadata.transformHistory.push({
            timestamp: new Date().toISOString(),
            fromType: 'Sampler',
            toType: synthType,
          });
        });

        // Invalidate instrument in audio engine
        try {
          const engine = getToneEngine();
          engine.invalidateInstrument(id);
          console.log(
            `[InstrumentStore] Transformed instrument ${id} from Sampler to ${synthType}`
          );
        } catch (error) {
          console.warn('[InstrumentStore] Could not invalidate instrument:', error);
        }
      }

      function getDefaultConfigForSynthType(synthType: InstrumentConfig['synthType']): any {
        switch (synthType) {
          case 'TB303':
            return { ...DEFAULT_TB303 };
          case 'PolySynth':
            return {
              voiceCount: 8,
              voiceType: 'Synth' as const,
              stealMode: 'oldest' as const,
              oscillator: { ...DEFAULT_OSCILLATOR },
              envelope: { ...DEFAULT_ENVELOPE },
              portamento: 0,
            };
          case 'Wavetable':
            return {
              wavetableId: 'basic-saw',
              morphPosition: 0,
              morphModSource: 'none' as const,
              morphModAmount: 50,
              morphLFORate: 2,
              unison: { voices: 1, detune: 10, stereoSpread: 50 },
              envelope: { ...DEFAULT_ENVELOPE },
              filter: { ...DEFAULT_FILTER, cutoff: 8000, resonance: 20, envelopeAmount: 0 },
              filterEnvelope: { ...DEFAULT_ENVELOPE },
            };
          case 'ChipSynth':
            return {
              channel: 'pulse1' as const,
              pulse: { duty: 50 as const },
              bitDepth: 8,
              sampleRate: 22050,
              envelope: { ...DEFAULT_ENVELOPE, attack: 5, decay: 300 },
              vibrato: { speed: 6, depth: 0, delay: 200 },
              arpeggio: { enabled: false, speed: 15, pattern: [0, 4, 7] },
            };
          default:
            return { oscillator: { ...DEFAULT_OSCILLATOR }, envelope: { ...DEFAULT_ENVELOPE } };
        }
      }
    },

    // Revert synth instrument back to original sample
    revertToSample: (instrumentId) => {
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);

      if (!instrument) {
        console.error('[InstrumentStore] Instrument not found:', instrumentId);
        return;
      }

      const preservedSample = instrument.metadata?.preservedSample;

      if (!preservedSample) {
        console.error('[InstrumentStore] No preserved sample data to revert to');
        return;
      }

      set((state) => {
        const inst = state.instruments.find((i) => i.id === instrumentId);
        if (!inst) return;

        // Clear all synth-specific configs
        delete inst.tb303;
        delete inst.polySynth;
        delete inst.wavetable;
        delete inst.granular;
        delete inst.superSaw;
        delete inst.organ;
        delete inst.drumMachine;
        delete inst.chipSynth;
        delete inst.pwmSynth;
        delete inst.stringMachine;
        delete inst.formantSynth;

        // Restore Sampler config
        inst.type = 'sample'; // Reverted to sample
        inst.synthType = 'Sampler';
        inst.sample = {
          audioBuffer: preservedSample.audioBuffer,
          url: preservedSample.url,
          baseNote: preservedSample.baseNote,
          detune: preservedSample.detune,
          loop: preservedSample.loop,
          loopStart: preservedSample.loopStart,
          loopEnd: preservedSample.loopEnd,
          reverse: false,
          playbackRate: 1.0,
        };
        inst.envelope = preservedSample.envelope;
      });

      // Invalidate instrument in audio engine
      try {
        const engine = getToneEngine();
        engine.invalidateInstrument(instrumentId);
      } catch (error) {
        console.warn('[InstrumentStore] Could not invalidate instrument:', error);
      }
    },

    // Reset to initial state (for new project/tab)
    reset: () => {
      // First invalidate all existing instruments in the engine
      const engine = getToneEngine();
      get().instruments.forEach((inst) => {
        try {
          engine.invalidateInstrument(inst.id);
        } catch (e) {
          // Ignore errors during invalidation
        }
      });

      set((state) => {
        state.instruments = [{ ...TB303_PRESETS[0], id: 1, type: 'synth' } as InstrumentConfig];
        state.currentInstrumentId = 1;
        state.presets = [];
      });

    },
  }))
);
