/**
 * Drum Pad Store - MPC-inspired drum pad state management
 */

import { create } from 'zustand';
import type {
  DrumPadState,
  DrumProgram,
  DrumPad,
  SampleLayer,
  MIDIMapping,
  SampleData,
} from '../types/drumpad';
import { createEmptyProgram, create808Program, create909Program } from '../types/drumpad';
import {
  saveAllPrograms,
  loadAllPrograms,
  exportConfig,
  importConfig,
} from '../lib/drumpad/drumpadDB';

interface DrumPadStore extends DrumPadState {
  // Program management
  loadProgram: (id: string) => void;
  saveProgram: (program: DrumProgram) => void;
  createProgram: (id: string, name: string) => void;
  deleteProgram: (id: string) => void;
  copyProgram: (fromId: string, toId: string) => void;

  // Pad editing
  updatePad: (padId: number, updates: Partial<DrumPad>) => void;
  loadSampleToPad: (padId: number, sample: SampleData) => void;
  clearPad: (padId: number) => void;

  // Layer management
  addLayerToPad: (padId: number, sample: SampleData, velocityRange: [number, number]) => void;
  removeLayerFromPad: (padId: number, layerIndex: number) => void;
  updateLayerOnPad: (padId: number, layerIndex: number, updates: Partial<SampleLayer>) => void;

  // MIDI mapping
  setMIDIMapping: (padId: string, mapping: MIDIMapping) => void;
  clearMIDIMapping: (padId: string) => void;
  getMIDIMapping: (note: number) => string | null;  // Returns padId

  // Bus levels (synced to engine by PadGrid)
  busLevels: Record<string, number>;
  setBusLevel: (bus: string, level: number) => void;

  // Persistence (localStorage — pad configs, no audio)
  saveToStorage: () => void;
  loadFromStorage: () => void;

  // Persistence (IndexedDB — includes audio samples)
  saveToIndexedDB: () => Promise<void>;
  loadFromIndexedDB: (audioContext: BaseAudioContext) => Promise<void>;
  exportAllConfigs: () => Promise<Blob>;
  importConfigs: (blob: Blob, audioContext: BaseAudioContext) => Promise<void>;

  // Preferences
  setPreference: <K extends keyof DrumPadState['preferences']>(
    key: K,
    value: DrumPadState['preferences'][K]
  ) => void;
}

const DEFAULT_PREFERENCES: DrumPadState['preferences'] = {
  defaultProgram: 'A-01',
  velocitySensitivity: 1.0,
  padColors: {},
};

export const useDrumPadStore = create<DrumPadStore>((set, get) => ({
  // Initial state
  programs: new Map([
    ['A-01', create808Program()],
    ['B-01', create909Program()],
    ['C-01', createEmptyProgram('C-01', 'Empty Kit')],
  ]),
  currentProgramId: 'A-01',
  midiMappings: {},
  preferences: DEFAULT_PREFERENCES,
  busLevels: {} as Record<string, number>,

  // Program management
  loadProgram: (id: string) => {
    const { programs } = get();
    if (programs.has(id)) {
      set({ currentProgramId: id });
      get().saveToStorage();
    }
  },

  saveProgram: (program: DrumProgram) => {
    set((state) => {
      const programs = new Map(state.programs);
      programs.set(program.id, program);
      return { programs };
    });
    get().saveToStorage();
  },

  createProgram: (id: string, name: string) => {
    set((state) => {
      const programs = new Map(state.programs);
      programs.set(id, createEmptyProgram(id, name));
      return { programs, currentProgramId: id };
    });
    get().saveToStorage();
  },

  deleteProgram: (id: string) => {
    set((state) => {
      const programs = new Map(state.programs);
      programs.delete(id);

      // Switch to another program if current was deleted
      let newCurrentId = state.currentProgramId;
      if (id === state.currentProgramId) {
        const firstId = Array.from(programs.keys())[0];
        newCurrentId = firstId || 'A-01';

        // Create default program if none exist
        if (!programs.has(newCurrentId)) {
          programs.set('A-01', create808Program());
          newCurrentId = 'A-01';
        }
      }

      return { programs, currentProgramId: newCurrentId };
    });
    get().saveToStorage();
  },

  copyProgram: (fromId: string, toId: string) => {
    const { programs } = get();
    const sourceProgram = programs.get(fromId);

    if (sourceProgram) {
      // Deep copy to avoid sharing mutable references (especially AudioBuffer)
      const copiedProgram: DrumProgram = {
        ...sourceProgram,
        id: toId,
        name: `${sourceProgram.name} (Copy)`,
        pads: sourceProgram.pads.map(pad => ({
          ...pad,
          sample: pad.sample ? { ...pad.sample } : null,
          layers: pad.layers.map(layer => ({
            ...layer,
            sample: { ...layer.sample },
          })),
        })),
      };

      set((state) => {
        const newPrograms = new Map(state.programs);
        newPrograms.set(toId, copiedProgram);
        return { programs: newPrograms };
      });
      get().saveToStorage();
    }
  },

  // Pad editing
  updatePad: (padId: number, updates: Partial<DrumPad>) => {
    set((state) => {
      const programs = new Map(state.programs);
      const currentProgram = programs.get(state.currentProgramId);

      if (currentProgram) {
        const updatedPads = currentProgram.pads.map(pad =>
          pad.id === padId ? { ...pad, ...updates } : pad
        );

        programs.set(state.currentProgramId, {
          ...currentProgram,
          pads: updatedPads,
        });
      }

      return { programs };
    });
    get().saveToStorage();
  },

  loadSampleToPad: (padId: number, sample: SampleData) => {
    get().updatePad(padId, {
      sample,
      name: sample.name,
    });
    // Audio data changed — persist to IndexedDB (async, fire-and-forget)
    get().saveToIndexedDB();
  },

  clearPad: (padId: number) => {
    get().updatePad(padId, {
      sample: null,
      name: `Pad ${padId}`,
    });
  },

  // Layer management
  addLayerToPad: (padId: number, sample: SampleData, velocityRange: [number, number]) => {
    const { programs, currentProgramId } = get();
    const program = programs.get(currentProgramId);
    const pad = program?.pads.find(p => p.id === padId);
    if (!pad) return;

    const newLayer: SampleLayer = { sample, velocityRange, levelOffset: 0 };
    get().updatePad(padId, { layers: [...pad.layers, newLayer] });
    get().saveToIndexedDB();
  },

  removeLayerFromPad: (padId: number, layerIndex: number) => {
    const { programs, currentProgramId } = get();
    const program = programs.get(currentProgramId);
    const pad = program?.pads.find(p => p.id === padId);
    if (!pad) return;

    const newLayers = pad.layers.filter((_, i) => i !== layerIndex);
    get().updatePad(padId, { layers: newLayers });
    get().saveToIndexedDB();
  },

  updateLayerOnPad: (padId: number, layerIndex: number, updates: Partial<SampleLayer>) => {
    const { programs, currentProgramId } = get();
    const program = programs.get(currentProgramId);
    const pad = program?.pads.find(p => p.id === padId);
    if (!pad || !pad.layers[layerIndex]) return;

    const newLayers = pad.layers.map((layer, i) =>
      i === layerIndex ? { ...layer, ...updates } : layer
    );
    get().updatePad(padId, { layers: newLayers });
  },

  // Bus levels
  setBusLevel: (bus: string, level: number) => {
    set((state) => ({
      busLevels: { ...state.busLevels, [bus]: level },
    }));
  },

  // MIDI mapping
  setMIDIMapping: (padId: string, mapping: MIDIMapping) => {
    set((state) => ({
      midiMappings: {
        ...state.midiMappings,
        [padId]: mapping,
      },
    }));
    get().saveToStorage();
  },

  clearMIDIMapping: (padId: string) => {
    set((state) => {
      const { [padId]: removedMapping, ...rest } = state.midiMappings;
      void removedMapping;
      return { midiMappings: rest };
    });
    get().saveToStorage();
  },

  getMIDIMapping: (note: number): string | null => {
    const { midiMappings } = get();

    for (const [padId, mapping] of Object.entries(midiMappings)) {
      if (mapping.type === 'note' && mapping.note === note) {
        return padId;
      }
    }

    return null;
  },

  // Persistence
  saveToStorage: () => {
    try {
      const { programs, currentProgramId, midiMappings, preferences } = get();

      // Convert Map to Object for JSON serialization
      const programsObj: Record<string, DrumProgram> = {};
      programs.forEach((program, id) => {
        programsObj[id] = program;
      });

      const state = {
        version: 1,
        programs: programsObj,
        currentProgramId,
        midiMappings,
        preferences,
      };

      // NOTE: AudioBuffer is not JSON-serializable and will be lost.
      // Sample data (audioBuffer) needs to be reloaded from original files.
      // Only pad names and parameters persist across page reloads.
      // TODO: Implement sample library with persistent references
      localStorage.setItem('devilbox_drumpad', JSON.stringify(state));
    } catch (error) {
      console.error('[DrumPadStore] Failed to save to storage:', error);
      // Handle quota exceeded errors
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.error('[DrumPadStore] localStorage quota exceeded');
      }
    }
  },

  loadFromStorage: () => {
    try {
      const stored = localStorage.getItem('devilbox_drumpad');

      if (stored) {
        const state = JSON.parse(stored);

        // Convert Object back to Map
        const programs = new Map<string, DrumProgram>();
        Object.entries(state.programs || {}).forEach(([id, program]) => {
          programs.set(id, program as DrumProgram);
        });

        set({
          programs,
          currentProgramId: state.currentProgramId || 'A-01',
          midiMappings: state.midiMappings || {},
          preferences: { ...DEFAULT_PREFERENCES, ...state.preferences },
        });

        if (process.env.NODE_ENV === 'development') {
          console.log('[DrumPadStore] Loaded state from storage');
        }
      }
    } catch (error) {
      console.error('[DrumPadStore] Failed to load from storage:', error);
    }
  },

  // IndexedDB persistence (includes audio samples)
  saveToIndexedDB: async () => {
    try {
      const { programs } = get();
      await saveAllPrograms(programs);
      if (process.env.NODE_ENV === 'development') {
        console.log('[DrumPadStore] Saved to IndexedDB');
      }
    } catch (error) {
      console.error('[DrumPadStore] Failed to save to IndexedDB:', error);
    }
  },

  loadFromIndexedDB: async (audioContext: BaseAudioContext) => {
    try {
      const programs = await loadAllPrograms(audioContext);
      if (programs && programs.size > 0) {
        const state = get();
        // Merge: keep current program ID if it exists in loaded data
        const currentId = programs.has(state.currentProgramId)
          ? state.currentProgramId
          : Array.from(programs.keys())[0] || 'A-01';
        set({ programs, currentProgramId: currentId });
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DrumPadStore] Loaded ${programs.size} programs from IndexedDB`);
        }
      }
    } catch (error) {
      console.error('[DrumPadStore] Failed to load from IndexedDB:', error);
    }
  },

  exportAllConfigs: async () => {
    const { programs } = get();
    return exportConfig(programs);
  },

  importConfigs: async (blob: Blob, audioContext: BaseAudioContext) => {
    try {
      const programs = await importConfig(blob, audioContext);
      set({ programs });
      // Persist the import to both IndexedDB and localStorage
      await saveAllPrograms(programs);
      get().saveToStorage();
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DrumPadStore] Imported ${programs.size} programs`);
      }
    } catch (error) {
      console.error('[DrumPadStore] Failed to import configs:', error);
      throw error;  // Re-throw so UI can show error
    }
  },

  // Preferences
  setPreference: (key, value) => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        [key]: value,
      },
    }));
    get().saveToStorage();
  },
}));

// Auto-load on store creation
if (typeof window !== 'undefined') {
  useDrumPadStore.getState().loadFromStorage();
}
