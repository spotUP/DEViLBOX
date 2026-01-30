/**
 * Instrument Store - Instrument Bank & Preset Management
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  InstrumentConfig,
  InstrumentPreset,
  EffectConfig,
  FurnaceConfig,
} from '@typedefs/instrument';
import type { BeatSlice, BeatSliceConfig } from '@typedefs/beatSlicer';
import {
  DEFAULT_OSCILLATOR,
  DEFAULT_ENVELOPE,
  DEFAULT_FILTER,
  DEFAULT_TB303,
} from '@typedefs/instrument';
import { TB303_PRESETS } from '@constants/tb303Presets';
import { getDefaultFurnaceConfig } from '@engine/InstrumentFactory';
import { getToneEngine } from '@engine/ToneEngine';
import { FurnaceParser } from '@/lib/import/formats/FurnaceParser';
import { DefleMaskParser } from '@/lib/import/formats/DefleMaskParser';
import { WaveformProcessor } from '@/lib/audio/WaveformProcessor';

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
  loadFurnaceInstrument: (buffer: ArrayBuffer) => void;
  loadDefleMaskInstrument: (buffer: ArrayBuffer) => void;
  loadDefleMaskWavetable: (buffer: ArrayBuffer) => void;

  // Transformation (MOD/XM import)
  transformInstrument: (
    instrumentId: number,
    targetSynthType: InstrumentConfig['synthType'],
    mappingStrategy: 'analyze' | 'default'
  ) => void;
  revertToSample: (instrumentId: number) => void;

  // Destructive Editing
  reverseSample: (instrumentId: number) => Promise<void>;
  normalizeSample: (instrumentId: number) => Promise<void>;
  invertLoopSample: (instrumentId: number) => Promise<void>;
  updateSampleBuffer: (instrumentId: number, audioBuffer: AudioBuffer) => Promise<void>;

  // Beat Slicer
  updateSlices: (instrumentId: number, slices: BeatSlice[]) => void;
  updateSliceConfig: (instrumentId: number, config: BeatSliceConfig) => void;
  removeSlice: (instrumentId: number, sliceId: string) => void;
  createSlicedInstruments: (sourceId: number, slices: BeatSlice[], namePrefix?: string) => Promise<number[]>;

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
    // Initial state - Start empty, user creates instruments as needed
    instruments: [],
    currentInstrumentId: 0,  // 0 = no instrument selected
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
        updates.granular ||
        updates.furnace
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

          // Auto-initialize furnace config when synthType changes to a Furnace type
          if (synthTypeChanging && updates.synthType?.startsWith('Furnace') && !instrument.furnace) {
            const furnaceConfig = getDefaultFurnaceConfig(updates.synthType);
            if (furnaceConfig) {
              instrument.furnace = furnaceConfig;
            }
          }
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
          // Preserve the current synth type
          const currentSynthType = instrument.synthType;

          // Reset to default for the current synth type
          const defaultInst = createDefaultInstrument(id);

          // Clear all synth-specific configs first
          Object.assign(instrument, {
            ...defaultInst,
            synthType: currentSynthType,
            name: instrument.name, // Keep the name
            tb303: undefined,
            drumMachine: undefined,
            chipSynth: undefined,
            pwmSynth: undefined,
            wavetable: undefined,
            granular: undefined,
            superSaw: undefined,
            polySynth: undefined,
            organ: undefined,
            stringMachine: undefined,
            formantSynth: undefined,
            furnace: undefined,
            chiptuneModule: undefined,
            wobbleBass: undefined,
            drumKit: undefined,
          });

          // Initialize the appropriate config for the synth type
          if (currentSynthType === 'TB303') {
            instrument.tb303 = { ...DEFAULT_TB303 };
          } else if (currentSynthType.startsWith('Furnace')) {
            const furnaceConfig = getDefaultFurnaceConfig(currentSynthType);
            if (furnaceConfig) {
              instrument.furnace = furnaceConfig;
            }
          }
          // Other synth types use the generic oscillator/envelope/filter which are already set
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

    loadFurnaceInstrument: (buffer) => {
      try {
        const { name, config } = FurnaceParser.parse(buffer);
        const existingIds = get().instruments.map((i) => i.id);
        const newId = findNextId(existingIds);

        set((state) => {
          const newInstrument: InstrumentConfig = {
            id: newId,
            name: name || 'Furnace Patch',
            type: 'synth',
            synthType: 'Furnace',
            furnace: config,
            effects: [],
            volume: -6,
            pan: 0,
          };
          state.instruments.push(newInstrument);
          state.currentInstrumentId = newId;
        });
      } catch (error) {
        console.error('[InstrumentStore] Failed to load Furnace instrument:', error);
      }
    },

    loadDefleMaskInstrument: (buffer) => {
      try {
        const result = DefleMaskParser.parse(buffer, 'dmp') as { name: string; config: FurnaceConfig };
        const { name, config } = result;
        const existingIds = get().instruments.map((i) => i.id);
        const newId = findNextId(existingIds);

        set((state) => {
          const newInstrument: InstrumentConfig = {
            id: newId,
            name: name || 'DefleMask Patch',
            type: 'synth',
            synthType: 'Furnace', // We use the Furnace engine for DMF playback
            furnace: config,
            effects: [],
            volume: -6,
            pan: 0,
          };
          state.instruments.push(newInstrument);
          state.currentInstrumentId = newId;
        });
      } catch (error) {
        console.error('[InstrumentStore] Failed to load DefleMask instrument:', error);
      }
    },

    loadDefleMaskWavetable: (buffer) => {
      try {
        const waveData = DefleMaskParser.parse(buffer, 'dmw') as number[];
        const currentId = get().currentInstrumentId;
        if (!currentId) return;

        set((state) => {
          const inst = state.instruments.find((i) => i.id === currentId);
          if (inst?.synthType === 'Furnace' && inst.furnace) {
            inst.furnace.wavetables.push({
              id: inst.furnace.wavetables.length,
              data: waveData,
            });
          }
        });
      } catch (error) {
        console.error('[InstrumentStore] Failed to load DefleMask wavetable:', error);
      }
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

    // Destructive Editing Actions
    reverseSample: async (id) => {
      const inst = get().instruments.find((i) => i.id === id);
      if (!inst?.sample?.audioBuffer) return;

      const rawBuffer = inst.sample.audioBuffer as any;
      const audioBuffer = await getToneEngine().decodeAudioData(rawBuffer);
      const newBuffer = WaveformProcessor.reverse(audioBuffer);
      const arrayBuffer = await getToneEngine().encodeAudioData(newBuffer);

      set((state) => {
        const instrument = state.instruments.find((i) => i.id === id);
        if (instrument?.sample) {
          instrument.sample.audioBuffer = arrayBuffer;
        }
      });

      getToneEngine().invalidateInstrument(id);
    },

    normalizeSample: async (id) => {
      const inst = get().instruments.find((i) => i.id === id);
      if (!inst?.sample?.audioBuffer) return;

      const rawBuffer = inst.sample.audioBuffer as any;
      const audioBuffer = await getToneEngine().decodeAudioData(rawBuffer);
      const newBuffer = WaveformProcessor.normalize(audioBuffer);
      const arrayBuffer = await getToneEngine().encodeAudioData(newBuffer);

      set((state) => {
        const instrument = state.instruments.find((i) => i.id === id);
        if (instrument?.sample) {
          instrument.sample.audioBuffer = arrayBuffer;
        }
      });

      getToneEngine().invalidateInstrument(id);
    },

    invertLoopSample: async (id) => {
      const inst = get().instruments.find((i) => i.id === id);
      if (!inst?.sample?.audioBuffer || !inst.sample.loop) return;

      const rawBuffer = inst.sample.audioBuffer as any;
      const audioBuffer = await getToneEngine().decodeAudioData(rawBuffer);
      const newBuffer = WaveformProcessor.invertLoop(
        audioBuffer, 
        inst.sample.loopStart, 
        inst.sample.loopEnd
      );
      const arrayBuffer = await getToneEngine().encodeAudioData(newBuffer);

      set((state) => {
        const instrument = state.instruments.find((i) => i.id === id);
        if (instrument?.sample) {
          instrument.sample.audioBuffer = arrayBuffer;
        }
      });

      getToneEngine().invalidateInstrument(id);
    },

    updateSampleBuffer: async (id, audioBuffer) => {
      const inst = get().instruments.find((i) => i.id === id);
      if (!inst?.sample) return;

      // Encode the AudioBuffer to ArrayBuffer for storage
      const arrayBuffer = await getToneEngine().encodeAudioData(audioBuffer);

      set((state) => {
        const instrument = state.instruments.find((i) => i.id === id);
        if (instrument?.sample) {
          instrument.sample.audioBuffer = arrayBuffer;
        }
      });

      // Force ToneEngine to reload the instrument with the new buffer
      getToneEngine().invalidateInstrument(id);
    },

    // Beat Slicer Actions
    updateSlices: (instrumentId, slices) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument?.sample) {
          instrument.sample.slices = slices;
        }
      });
    },

    updateSliceConfig: (instrumentId, config) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument?.sample) {
          instrument.sample.sliceConfig = config;
        }
      });
    },

    removeSlice: (instrumentId, sliceId) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument?.sample?.slices) {
          const slices = instrument.sample.slices;
          const idx = slices.findIndex((s) => s.id === sliceId);
          if (idx !== -1 && slices.length > 1) {
            const removedSlice = slices[idx];

            // Merge with previous slice if exists, otherwise extend next slice
            if (idx > 0) {
              slices[idx - 1].endFrame = removedSlice.endFrame;
              slices[idx - 1].endTime = removedSlice.endTime;
            } else if (idx < slices.length - 1) {
              slices[idx + 1].startFrame = removedSlice.startFrame;
              slices[idx + 1].startTime = removedSlice.startTime;
            }

            slices.splice(idx, 1);
          }
        }
      });
    },

    createSlicedInstruments: async (sourceId, slices, namePrefix = 'Slice') => {
      const sourceInstrument = get().instruments.find((inst) => inst.id === sourceId);
      if (!sourceInstrument?.sample?.url) {
        console.error('[InstrumentStore] Source instrument has no sample');
        return [];
      }

      const newInstrumentIds: number[] = [];
      const engine = getToneEngine();

      try {
        // Fetch and decode the source audio
        const response = await fetch(sourceInstrument.sample.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await engine.decodeAudioData(arrayBuffer);

        const existingIds = get().instruments.map((i) => i.id);

        for (let i = 0; i < slices.length; i++) {
          const slice = slices[i];
          const newId = findNextId([...existingIds, ...newInstrumentIds]);
          newInstrumentIds.push(newId);

          // Extract slice audio data
          const sliceLength = slice.endFrame - slice.startFrame;
          const numChannels = audioBuffer.numberOfChannels;
          const sampleRate = audioBuffer.sampleRate;

          // Create offline context to render the slice
          const offlineCtx = new OfflineAudioContext(numChannels, sliceLength, sampleRate);
          const sliceBuffer = offlineCtx.createBuffer(numChannels, sliceLength, sampleRate);

          // Copy audio data for each channel
          for (let ch = 0; ch < numChannels; ch++) {
            const sourceData = audioBuffer.getChannelData(ch);
            const destData = sliceBuffer.getChannelData(ch);
            for (let j = 0; j < sliceLength; j++) {
              destData[j] = sourceData[slice.startFrame + j];
            }
          }

          // Encode slice to ArrayBuffer (WAV)
          const sliceArrayBuffer = await engine.encodeAudioData(sliceBuffer);

          // Create data URL from the array buffer
          const blob = new Blob([sliceArrayBuffer], { type: 'audio/wav' });
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          // Create the new instrument
          const sliceName = slice.label || `${namePrefix} ${i + 1}`;
          const instrumentName = sourceInstrument.name
            ? `${sourceInstrument.name} - ${sliceName}`
            : sliceName;

          set((state) => {
            const newInstrument: InstrumentConfig = {
              id: newId,
              name: instrumentName.slice(0, 22), // XM 22-char limit
              type: 'sample',
              synthType: 'Sampler',
              sample: {
                url: dataUrl,
                audioBuffer: sliceArrayBuffer,
                baseNote: sourceInstrument.sample?.baseNote || 'C-4',
                detune: sourceInstrument.sample?.detune || 0,
                loop: false,
                loopStart: 0,
                loopEnd: sliceLength,
                sampleRate: sampleRate,
                reverse: false,
                playbackRate: 1,
              },
              envelope: sourceInstrument.envelope || { ...DEFAULT_ENVELOPE },
              effects: [],
              volume: sourceInstrument.volume || -6,
              pan: sourceInstrument.pan || 0,
            };
            state.instruments.push(newInstrument);
          });
        }

        // Set the first new instrument as current
        if (newInstrumentIds.length > 0) {
          set((state) => {
            state.currentInstrumentId = newInstrumentIds[0];
          });
        }

        console.log(`[InstrumentStore] Created ${newInstrumentIds.length} sliced instruments`);
        return newInstrumentIds;
      } catch (error) {
        console.error('[InstrumentStore] Failed to create sliced instruments:', error);
        return [];
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
