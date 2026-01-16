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
  presets: InstrumentPreset[];

  // Actions
  setCurrentInstrument: (id: number) => void;
  getInstrument: (id: number) => InstrumentConfig | undefined;
  updateInstrument: (id: number, updates: Partial<InstrumentConfig>) => void;
  createInstrument: (config?: Partial<InstrumentConfig>) => number;
  addInstrument: (config: InstrumentConfig) => void;
  deleteInstrument: (id: number) => void;
  cloneInstrument: (id: number) => number;

  // Effects
  addEffect: (instrumentId: number, effectType: EffectConfig['type']) => void;
  removeEffect: (instrumentId: number, effectId: string) => void;
  updateEffect: (instrumentId: number, effectId: string, updates: Partial<EffectConfig>) => void;
  reorderEffects: (instrumentId: number, fromIndex: number, toIndex: number) => void;

  // Presets
  loadPreset: (preset: InstrumentPreset, targetInstrumentId: number) => void;
  saveAsPreset: (instrumentId: number, name: string, category: InstrumentPreset['category']) => void;

  // Import
  loadInstruments: (instruments: InstrumentConfig[]) => void;

  // Reset to initial state
  reset: () => void;
}

const createDefaultInstrument = (id: number): InstrumentConfig => ({
  id,
  name: `TB303 ${String(id).padStart(2, '0')}`,
  synthType: 'TB303',
  tb303: { ...DEFAULT_TB303 },
  oscillator: { ...DEFAULT_OSCILLATOR },
  envelope: { ...DEFAULT_ENVELOPE },
  filter: { ...DEFAULT_FILTER },
  effects: [],
  volume: -6,
  pan: 0,
});

// Find next available instrument ID (0-255)
const findNextId = (existingIds: number[]): number => {
  for (let id = 0; id < 256; id++) {
    if (!existingIds.includes(id)) {
      return id;
    }
  }
  console.warn('Maximum number of instruments reached (256)');
  return 0;
};

export const useInstrumentStore = create<InstrumentStore>()(
  immer((set, get) => ({
    // Initial state - Start with TB-303 Classic preset
    instruments: [{ ...TB303_PRESETS[0], id: 0 } as InstrumentConfig],
    currentInstrumentId: 0,
    get currentInstrument() {
      const state = get();
      return state.instruments.find((inst) => inst.id === state.currentInstrumentId) || null;
    },
    presets: [],

    // Actions
    setCurrentInstrument: (id) =>
      set((state) => {
        if (state.instruments.find((inst) => inst.id === id)) {
          state.currentInstrumentId = id;
        }
      }),

    getInstrument: (id) => {
      return get().instruments.find((inst) => inst.id === id);
    },

    updateInstrument: (id, updates) => {
      // Check if synthType is changing - need to invalidate audio engine
      const currentInstrument = get().instruments.find((inst) => inst.id === id);
      const synthTypeChanging = currentInstrument && updates.synthType && updates.synthType !== currentInstrument.synthType;
      const isPresetLoad = updates.name && updates.synthType; // Loading a preset has both name and synthType

      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === id);
        if (instrument) {
          // Explicitly exclude 'id' from updates to prevent ID from being changed
          const { id: _ignoredId, ...safeUpdates } = updates as any;
          Object.assign(instrument, safeUpdates);
        }
      });

      // Invalidate the cached Tone.js instrument so it gets recreated with new config
      if (synthTypeChanging || isPresetLoad) {
        try {
          const engine = getToneEngine();
          engine.invalidateInstrument(id);
          console.log('[InstrumentStore] Invalidated instrument', id, 'synthType changed:', synthTypeChanging, 'preset load:', isPresetLoad);
        } catch (error) {
          console.warn('[InstrumentStore] Could not invalidate instrument:', error);
        }
      } else if (updates.tb303 && currentInstrument?.synthType === 'TB303') {
        // Real-time TB303 parameter update (without recreating the synth)
        try {
          const engine = getToneEngine();
          const updatedInstrument = get().instruments.find((inst) => inst.id === id);
          if (updatedInstrument?.tb303) {
            engine.updateTB303Parameters(id, updatedInstrument.tb303);
          }
        } catch (error) {
          console.warn('[InstrumentStore] Could not update TB303 parameters:', error);
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

    // Effects
    addEffect: (instrumentId, effectType) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          const newEffect: EffectConfig = {
            id: `effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: effectType,
            enabled: true,
            wet: 50,
            parameters: {},
          };
          instrument.effects.push(newEffect);
        }
      });

      // Rebuild instrument effect chain in audio engine
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);
      if (instrument) {
        try {
          const engine = getToneEngine();
          engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
        } catch (error) {
          console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
        }
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

      // Rebuild instrument effect chain in audio engine
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);
      if (instrument) {
        try {
          const engine = getToneEngine();
          engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
        } catch (error) {
          console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
        }
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
          try {
            const engine = getToneEngine();
            engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
          } catch (error) {
            console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
          }
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

      // Rebuild instrument effect chain in audio engine
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);
      if (instrument) {
        try {
          const engine = getToneEngine();
          engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
        } catch (error) {
          console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
        }
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
        console.log('[InstrumentStore] Preset loaded, invalidated instrument', targetInstrumentId);
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

      set((state) => {
        state.instruments = newInstruments;
        state.currentInstrumentId = newInstruments.length > 0 ? newInstruments[0].id : null;
      });

      console.log('[InstrumentStore] Loaded', newInstruments.length, 'instruments');
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
        state.instruments = [{ ...TB303_PRESETS[0], id: 0 } as InstrumentConfig];
        state.currentInstrumentId = 0;
        state.presets = [];
      });

      console.log('[InstrumentStore] Reset to initial state');
    },
  }))
);
