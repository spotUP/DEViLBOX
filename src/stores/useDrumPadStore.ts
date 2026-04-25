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
  PadBank,
} from '../types/drumpad';
import { createEmptyProgram, createEmptyPad, getBankPads, MPK_SLOT_COUNT, mpkSlotId, mpkSlotName } from '../types/drumpad';
import type { DubBusSettings } from '../types/dub';
import { DEFAULT_DUB_BUS, DUB_CHARACTER_PRESETS } from '../types/dub';

/** Build the 8 default MPK-linked program slots. */
function buildMpkSlots(): Map<string, ReturnType<typeof createEmptyProgram>> {
  const programs = new Map<string, ReturnType<typeof createEmptyProgram>>();
  for (let n = 1; n <= MPK_SLOT_COUNT; n++) {
    const id = mpkSlotId(n);
    programs.set(id, createEmptyProgram(id, mpkSlotName(n)));
  }
  return programs;
}
import {
  saveAllPrograms,
  loadAllPrograms,
  exportConfig,
  importConfig,
  clearDatabase,
} from '../lib/drumpad/drumpadDB';
import { mpcResample, MODEL_CONFIGS } from '../engine/mpc-resampler/MpcResamplerDSP';
import type { MpcResampleOptions } from '../engine/mpc-resampler/MpcResamplerDSP';

interface DrumPadStore extends DrumPadState {
  // Controller-detected pad count (8, 16, etc.) — drives grid layout
  controllerPadCount: number;
  setControllerPadCount: (count: number) => void;

  // FX tracking
  activeFxPads: Set<number>;
  setFxPadActive: (padId: number, active: boolean) => void;

  // Bank management
  currentBank: PadBank;
  setBank: (bank: PadBank) => void;
  getCurrentBankPads: () => DrumPad[];

  // Clipboard
  clipboardPad: DrumPad | null;
  copyPad: (padId: number) => void;
  pastePad: (targetPadId: number) => void;
  swapPad: (padId: number) => void;

  // Note repeat
  noteRepeatEnabled: boolean;
  noteRepeatRate: string;
  setNoteRepeatEnabled: (enabled: boolean) => void;
  setNoteRepeatRate: (rate: string) => void;

  // Program management
  loadProgram: (id: string) => void;
  saveProgram: (program: DrumProgram) => void;
  createProgram: (id: string, name: string) => void;
  renameProgram: (id: string, name: string) => void;
  deleteProgram: (id: string) => void;
  copyProgram: (fromId: string, toId: string) => void;

  // Pad editing
  updatePad: (padId: number, updates: Partial<DrumPad>) => void;
  loadSampleToPad: (padId: number, sample: SampleData) => Promise<void>;
  clearPad: (padId: number) => void;
  clearBankPads: (bank: PadBank) => void;

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

  // Dub Bus — shared send FX for all pads (one SpringReverb + one SpaceEcho).
  // Settings live at store level so they persist with the program.
  dubBus: DubBusSettings;
  setDubBus: (patch: Partial<DubBusSettings>) => void;
  setPadDubSend: (padId: number, value: number) => void;

  /**
   * A/B compare stash. Holds the dub-bus settings from the moment the user
   * most recently loaded a character preset — so they can flip between the
   * preset and whatever they had dialled in before. Runtime-only; not
   * serialized with the project (matches hardware desk A/B buttons that
   * reset on power cycle). null until the first preset load.
   */
  dubBusStash: DubBusSettings | null;
  /** Swap the live dub-bus with the stash. No-op if stash is null. */
  swapDubBusStash: () => void;
  /** Apply the "Sound System" one-click: enables bus + sets dubSend=0.4 on
   *  every non-empty pad in the current bank. */
  applySoundSystemToBank: () => void;

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
  showAdvanced: false,
};

/**
 * Keys of DubBusSettings that are part of the engineer-character voicing
 * (i.e. they appear in at least one preset's `overrides`). When the user
 * edits one of these via `setDubBus` WITHOUT explicitly passing
 * `characterPreset`, and the current preset isn't already 'custom', the
 * preset name auto-flips to 'custom'. Fixes G16 ("why does the VOICE
 * dropdown still say Tubby after I nudged one knob").
 *
 * Computed from the presets so it self-maintains: adding a new field to a
 * preset's overrides automatically adds it to this set.
 */
const CHARACTER_FIELDS: ReadonlySet<string> = new Set(
  Object.values(DUB_CHARACTER_PRESETS).flatMap(p => Object.keys(p.overrides)),
);

// Bump this when factory presets or stored schema changes — discards stale data
const DRUMPAD_SCHEMA_VERSION = 28;
const DRUMPAD_SCHEMA_KEY = 'devilbox_drumpad_schema';

// Set when schema migration clears old data — prevents IndexedDB from overwriting factory presets
let _schemaResetPending = false;

export const useDrumPadStore = create<DrumPadStore>((set, get) => ({
  // Controller-detected pad count (default 16 = MPC standard 4×4)
  controllerPadCount: 8,
  setControllerPadCount: (count: number) => set({ controllerPadCount: count }),

  // FX tracking
  activeFxPads: new Set<number>(),
  setFxPadActive: (padId: number, active: boolean) => {
    const prev = get().activeFxPads;
    const next = new Set(prev);
    if (active) next.add(padId); else next.delete(padId);
    set({ activeFxPads: next });
  },

  // Initial state — 8 empty slots mapped to Akai MPK Mini programs 1-8.
  // Extra user programs can live alongside these beyond the slot 8 index.
  programs: buildMpkSlots(),
  currentProgramId: mpkSlotId(1),
  midiMappings: {},
  preferences: DEFAULT_PREFERENCES,
  busLevels: {} as Record<string, number>,

  // Dub Bus state — starts disabled; turning it on via the UI (or
  // applySoundSystemToBank) activates the shared SpringReverb + SpaceEcho.
  dubBus: { ...DEFAULT_DUB_BUS },
  dubBusStash: null,

  // Bank state
  currentBank: 'A' as PadBank,
  setBank: (bank: PadBank) => set({ currentBank: bank }),
  getCurrentBankPads: () => {
    const { programs, currentProgramId, currentBank } = get();
    const program = programs.get(currentProgramId);
    if (!program) return [];
    return getBankPads(program.pads, currentBank);
  },

  // Clipboard
  clipboardPad: null,
  copyPad: (padId: number) => {
    const { programs, currentProgramId } = get();
    const program = programs.get(currentProgramId);
    const pad = program?.pads.find(p => p.id === padId);
    if (pad) {
      set({ 
        clipboardPad: { 
          ...pad, 
          layers: pad.layers.map(l => ({ ...l, sample: { ...l.sample } })),
          // Deep copy synth config if present
          synthConfig: pad.synthConfig ? { ...pad.synthConfig } : undefined,
        } 
      });
    }
  },
  pastePad: (targetPadId: number) => {
    const { clipboardPad } = get();
    if (!clipboardPad) return;
    get().updatePad(targetPadId, {
      sample: clipboardPad.sample ? { ...clipboardPad.sample } : null,
      name: clipboardPad.name,
      level: clipboardPad.level,
      tune: clipboardPad.tune,
      pan: clipboardPad.pan,
      output: clipboardPad.output,
      attack: clipboardPad.attack,
      decay: clipboardPad.decay,
      sustain: clipboardPad.sustain,
      release: clipboardPad.release,
      filterType: clipboardPad.filterType,
      cutoff: clipboardPad.cutoff,
      resonance: clipboardPad.resonance,
      muteGroup: clipboardPad.muteGroup,
      playMode: clipboardPad.playMode,
      sampleStart: clipboardPad.sampleStart,
      sampleEnd: clipboardPad.sampleEnd,
      reverse: clipboardPad.reverse,
      decayMode: clipboardPad.decayMode,
      filterAttack: clipboardPad.filterAttack,
      filterDecay: clipboardPad.filterDecay,
      filterEnvAmount: clipboardPad.filterEnvAmount,
      veloToLevel: clipboardPad.veloToLevel,
      veloToAttack: clipboardPad.veloToAttack,
      veloToStart: clipboardPad.veloToStart,
      veloToFilter: clipboardPad.veloToFilter,
      veloToPitch: clipboardPad.veloToPitch,
      layers: clipboardPad.layers.map(l => ({ ...l, sample: { ...l.sample } })),
      scratchAction: clipboardPad.scratchAction,
      djFxAction: clipboardPad.djFxAction,
      // Copy synth config and instrument ID
      synthConfig: clipboardPad.synthConfig ? { ...clipboardPad.synthConfig } : undefined,
      instrumentId: clipboardPad.instrumentId,
      instrumentNote: clipboardPad.instrumentNote,
    });
    get().saveToIndexedDB();
  },
  swapPad: (padId: number) => {
    const { clipboardPad, programs, currentProgramId } = get();
    if (!clipboardPad) return;
    const program = programs.get(currentProgramId);
    const targetPad = program?.pads.find(p => p.id === padId);
    if (!targetPad) return;
    const targetCopy = { ...targetPad, layers: targetPad.layers.map(l => ({ ...l, sample: { ...l.sample } })) };
    get().pastePad(padId);
    set({ clipboardPad: targetCopy });
  },

  // Note repeat
  noteRepeatEnabled: false,
  noteRepeatRate: '1/16',
  setNoteRepeatEnabled: (enabled: boolean) => set({ noteRepeatEnabled: enabled }),
  setNoteRepeatRate: (rate: string) => set({ noteRepeatRate: rate }),

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

  renameProgram: (id: string, name: string) => {
    set((state) => {
      const programs = new Map(state.programs);
      const program = programs.get(id);
      if (!program) return { programs };
      programs.set(id, { ...program, name });
      return { programs };
    });
    get().saveToStorage();
    get().saveToIndexedDB();
  },

  deleteProgram: (id: string) => {
    set((state) => {
      const programs = new Map(state.programs);
      programs.delete(id);

      // Switch to another program if current was deleted
      let newCurrentId = state.currentProgramId;
      if (id === state.currentProgramId) {
        const firstId = Array.from(programs.keys())[0];
        newCurrentId = firstId || mpkSlotId(1);

        // Create default MPK slot 1 if nothing remains
        if (!programs.has(newCurrentId)) {
          const defaultId = mpkSlotId(1);
          programs.set(defaultId, createEmptyProgram(defaultId, mpkSlotName(1)));
          newCurrentId = defaultId;
        }
      }

      return { programs, currentProgramId: newCurrentId };
    });
    get().saveToStorage();
    get().saveToIndexedDB();
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

  loadSampleToPad: async (padId: number, sample: SampleData) => {
    const { programs, currentProgramId } = get();
    const program = programs.get(currentProgramId);

    // Apply MPC resampling if enabled on this program
    let processedSample = sample;
    if (program?.mpcResample?.enabled) {
      try {
        const modelConfig = MODEL_CONFIGS[program.mpcResample.model];
        const options: MpcResampleOptions = {
          ...modelConfig,
          model: program.mpcResample.model,
        } as MpcResampleOptions;
        const result = await mpcResample(sample.audioBuffer, options);
        processedSample = {
          ...sample,
          audioBuffer: result.buffer,
          originalAudioBuffer: sample.audioBuffer,
          duration: result.buffer.duration,
          sampleRate: result.buffer.sampleRate,
        };
      } catch (err) {
        console.error('[DrumPadStore] MPC resample failed, using original:', err);
      }
    }

    // A sample REPLACES any prior sound source on the pad. Without this,
    // dropping a sample onto a pad that already had a synth left both wired
    // — the pad played the sample AND the synth on every trigger.
    get().updatePad(padId, {
      sample: processedSample,
      name: sample.name,
      synthConfig: undefined,
      instrumentId: undefined,
      presetName: undefined,
    });
    // Audio data changed — persist to IndexedDB (async, fire-and-forget)
    get().saveToIndexedDB();
  },

  clearPad: (padId: number) => {
    // Replace the pad entirely with a fresh empty one so every field — layers,
    // scratchAction, djFxAction, pttAction, effects, color, etc. — is reset.
    // The previous `updatePad({ sample: null, ... })` only nulled the named
    // fields, leaving velocity layers and action assignments playable after
    // "Clear Pad" / "Clear Bank".
    set((state) => {
      const programs = new Map(state.programs);
      const currentProgram = programs.get(state.currentProgramId);
      if (!currentProgram) return { programs };
      const updatedPads = currentProgram.pads.map((pad) =>
        pad.id === padId ? createEmptyPad(padId) : pad,
      );
      programs.set(state.currentProgramId, { ...currentProgram, pads: updatedPads });
      return { programs };
    });
    get().saveToStorage();
    get().saveToIndexedDB();
  },

  clearBankPads: (bank) => {
    // Atomic bulk clear: one set() + one save cycle instead of 16 back-to-back
    // clearPad() calls. The looped version raced on concurrent saveToIndexedDB
    // transactions, occasionally leaving one pad's sample intact in IndexedDB.
    const bankIndex = { A: 0, B: 1 }[bank];
    const bankStart = bankIndex * 8;
    const bankEnd = bankStart + 8;
    set((state) => {
      const programs = new Map(state.programs);
      const currentProgram = programs.get(state.currentProgramId);
      if (!currentProgram) return { programs };
      const updatedPads = currentProgram.pads.map((pad, idx) =>
        idx >= bankStart && idx < bankEnd ? createEmptyPad(pad.id) : pad,
      );
      programs.set(state.currentProgramId, { ...currentProgram, pads: updatedPads });
      return { programs };
    });
    get().saveToStorage();
    get().saveToIndexedDB();
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
    get().saveToStorage();
  },

  // Dub Bus actions — patch + persist. Engine listens via usePadEngineDubBus
  // hook and pushes changes to the live DrumPadEngine.
  setDubBus: (patch: Partial<DubBusSettings>) => {
    const prior = get().dubBus.enabled;
    // Character-preset selection must rewrite the store's dub-bus fields to
    // the preset's overrides — otherwise the store keeps factory values and
    // the mirror effect (engine.setDubBusSettings on every render) re-writes
    // those factory values back to the bus on the next tick, silently
    // clobbering the preset. Apply the preset here so the store IS the
    // truth. Flip `characterPreset` back to 'custom' after so subsequent
    // user edits don't loop through this branch.
    let effective: Partial<DubBusSettings> = patch;
    // A/B compare stash — capture the PRE-preset settings whenever a
    // preset is loaded (including a switch between two different presets).
    // Lets the user flip back to what they had before loading the preset.
    // Stash is NOT captured on plain field edits (no characterPreset in the
    // patch) so dragging a knob doesn't overwrite the stash with each frame.
    const prevSettings = get().dubBus;
    const isLoadingPreset = typeof patch.characterPreset === 'string'
      && patch.characterPreset !== prevSettings.characterPreset;
    if (patch.characterPreset && typeof patch.characterPreset === 'string' && patch.characterPreset !== 'custom') {
      const preset = DUB_CHARACTER_PRESETS[patch.characterPreset];
      if (preset) {
        // Preset overrides first, then the patch (so any explicit fields in
        // the patch still win — caller can override a preset value in the
        // same call), then preserve the preset name so the UI dropdown keeps
        // showing which engineer is active. Knob onChange handlers in the
        // UI pass `characterPreset: 'custom'` when the user manually tweaks
        // a field, flipping us to Custom.
        effective = { ...preset.overrides, ...patch };
      }
    } else if (patch.characterPreset === 'custom' && prevSettings.characterPreset !== 'custom') {
      // Explicitly switching to Custom resets all character-owned fields back
      // to DEFAULT_DUB_BUS. Without this, the previous preset's overrides
      // (e.g. Tubby's returnEqEnabled +8dB Q=3) persist silently under the
      // Custom label — the bus sounds like the old preset even though the UI
      // shows "Custom". User expects Custom to be a neutral starting point.
      const defaults = Object.fromEntries(
        [...CHARACTER_FIELDS].map(k => [k, DEFAULT_DUB_BUS[k as keyof DubBusSettings]])
      );
      effective = { ...defaults, ...patch };
    } else if (patch.characterPreset === undefined && get().dubBus.characterPreset !== 'custom') {
      // G16: auto-flip to 'custom' when a character field is edited without
      // an explicit characterPreset in the patch. Without this, the VOICE
      // dropdown keeps showing "Tubby" after the user nudges a preset-owned
      // knob via a UI path that forgets to pass `characterPreset: 'custom'`
      // — the state is incoherent (preset name doesn't match settings).
      // Non-character fields (`enabled`, `armed`, `returnGain*-excluded*`)
      // don't trigger the flip — they're independent of voicing.
      const touchesCharacter = Object.keys(patch).some(k => CHARACTER_FIELDS.has(k));
      if (touchesCharacter) {
        effective = { ...patch, characterPreset: 'custom' };
      }
    }
    set((state) => ({
      dubBus: { ...state.dubBus, ...effective },
      ...(isLoadingPreset ? { dubBusStash: { ...prevSettings } } : {}),
    }));
    get().saveToStorage();
    // Auto-apply sound system when bus flips OFF → ON and the current bank
    // has no pad-level dubSend configured yet. Skips if any pad already has
    // a dubSend — we never clobber a user's custom send config. This turns
    // the bus button into a true one-click "dub on/off" control: toggle it
    // on, fire pads, hear echo. No "wait, I also have to click Apply" step.
    if (patch.enabled === true && !prior) {
      const { programs, currentProgramId, currentBank } = get();
      const program = programs.get(currentProgramId);
      if (program) {
        const bankPads = getBankPads(program.pads, currentBank);
        const noneConfigured = bankPads.every(p => (p.dubSend ?? 0) === 0);
        if (noneConfigured) get().applySoundSystemToBank();
      }
    }
  },

  setPadDubSend: (padId: number, value: number) => {
    const v = Math.max(0, Math.min(1, value));
    get().updatePad(padId, { dubSend: v });
  },

  swapDubBusStash: () => {
    const { dubBus, dubBusStash } = get();
    if (!dubBusStash) return;
    set({ dubBus: dubBusStash, dubBusStash: { ...dubBus } });
    get().saveToStorage();
  },

  applySoundSystemToBank: () => {
    const { programs, currentProgramId, currentBank } = get();
    const program = programs.get(currentProgramId);
    if (!program) return;
    const bankPads = getBankPads(program.pads, currentBank);
    // Enable the bus and set a musical default send on every non-empty pad.
    // 0.4 is the sweet spot: clearly audible echo on the return, but the
    // dry signal still reads as the primary hit. Kicks get half the send
    // so the low end doesn't fight with the dub tail.
    get().setDubBus({ enabled: true });
    for (const pad of bankPads) {
      const hasContent = !!pad.sample || !!pad.synthConfig;
      if (!hasContent) continue;
      const isKick = /kick|\bbd\b|bass\s*drum/i.test(pad.name);
      get().updatePad(pad.id, { dubSend: isKick ? 0.2 : 0.4 });
    }
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
        version: DRUMPAD_SCHEMA_VERSION,
        programs: programsObj,
        currentProgramId,
        midiMappings,
        preferences,
        busLevels: get().busLevels,
        // Dub Bus settings persist so the user's tuned chain (HPF cutoff,
        // echo intensity, etc.) survives reloads — critical for gig prep
        // where the venue's sweet spot takes a while to dial in.
        dubBus: get().dubBus,
      };

      // NOTE: AudioBuffer is not JSON-serializable — audio data is NOT stored here.
      // Full audio persistence (including samples) is handled by saveToIndexedDB().
      // This localStorage entry only persists pad parameters, names, and MIDI mappings.
      localStorage.setItem('devilbox_drumpad', JSON.stringify(state));
      localStorage.setItem(DRUMPAD_SCHEMA_KEY, String(DRUMPAD_SCHEMA_VERSION));
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
      // Check schema version from separate key (immune to stale data baked-in version)
      const storedVersion = Number(localStorage.getItem(DRUMPAD_SCHEMA_KEY) || '0');
      if (storedVersion < DRUMPAD_SCHEMA_VERSION) {
        console.log('[DrumPadStore] Schema upgraded v' + storedVersion + ' → v' + DRUMPAD_SCHEMA_VERSION + ', resetting to factory presets');
        localStorage.removeItem('devilbox_drumpad');
        localStorage.setItem(DRUMPAD_SCHEMA_KEY, String(DRUMPAD_SCHEMA_VERSION));
        _schemaResetPending = true;
        clearDatabase().catch(() => {}).finally(() => { _schemaResetPending = false; });
        return;
      }

      const stored = localStorage.getItem('devilbox_drumpad');

      if (stored) {
        const state = JSON.parse(stored);

        // Convert Object back to Map with backward-compatible defaults
        const programs = new Map<string, DrumProgram>();
        Object.entries(state.programs || {}).forEach(([id, program]) => {
          const prog = program as DrumProgram;
          // Apply MPC field defaults for pads loaded from older versions
          const migratedPads = (prog.pads || []).map((p: DrumPad) => ({
            ...p,
            // instrumentNote preserved as-authored — the previous C3→C4 rewrite
            // (a keyboard-row migration from years ago) broke DubSiren / Air
            // Horn / Noise Riser presets, because those synths now use C3 as
            // a "preset default, do not override pitch" sentinel. Bumping to
            // C4 forced a pitch override and played every siren at the wrong
            // frequency on reload. Leave the value alone.
            instrumentNote: p.instrumentNote,
            muteGroup: p.muteGroup ?? 0,
            playMode: p.playMode ?? 'oneshot',
            sampleStart: p.sampleStart ?? 0,
            sampleEnd: p.sampleEnd ?? 1,
            reverse: p.reverse ?? false,
            decayMode: p.decayMode ?? 'start',
            filterAttack: p.filterAttack ?? 0,
            filterDecay: p.filterDecay ?? 50,
            filterEnvAmount: p.filterEnvAmount ?? 0,
            veloToLevel: p.veloToLevel ?? 100,
            veloToAttack: p.veloToAttack ?? 0,
            veloToStart: p.veloToStart ?? 0,
            veloToFilter: p.veloToFilter ?? 0,
            veloToPitch: p.veloToPitch ?? 0,
          }));
          // Expand 16-pad programs to 64
          while (migratedPads.length < 64) {
            const ep = createEmptyPad(migratedPads.length + 1);
            migratedPads.push({ ...ep, instrumentNote: ep.instrumentNote });
          }
          programs.set(id, { ...prog, pads: migratedPads });
        });

        set({
          programs,
          currentProgramId: state.currentProgramId || 'A-01',
          midiMappings: state.midiMappings || {},
          preferences: { ...DEFAULT_PREFERENCES, ...state.preferences },
          busLevels: state.busLevels || {},
          // Merge saved dub-bus with defaults so fields added to the schema
          // since the user last saved get sensible values rather than `undefined`.
          // Force `enabled: false` on load — the bus on/off is a performance-
          // time toggle, not a user setting. Persisting it meant every
          // startup reloaded with the bus on if the user had ever clicked
          // it. Tuning (character preset, echo/spring params, HPF, etc.)
          // still restores normally.
          dubBus: { ...DEFAULT_DUB_BUS, ...(state.dubBus || {}), enabled: false },
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
    // Skip if schema was just reset — factory presets are already correct
    if (_schemaResetPending) {
      console.log('[DrumPadStore] Skipping IndexedDB load (schema reset pending)');
      return;
    }
    try {
      const loaded = await loadAllPrograms(audioContext);
      if (loaded && loaded.size > 0) {
        // Ensure the 8 MPK-linked slots always exist. Any user data from
        // previous sessions wins; missing slots get freshly created.
        for (let n = 1; n <= MPK_SLOT_COUNT; n++) {
          const id = mpkSlotId(n);
          if (!loaded.has(id)) {
            loaded.set(id, createEmptyProgram(id, mpkSlotName(n)));
          }
        }
        const state = get();
        const currentId = loaded.has(state.currentProgramId)
          ? state.currentProgramId
          : mpkSlotId(1);
        set({ programs: loaded, currentProgramId: currentId });
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DrumPadStore] Loaded ${loaded.size} programs from IndexedDB`);
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

// Auto-load on store creation (dev: rate-limit to avoid HMR spam)
if (typeof window !== 'undefined') {
  const now = Date.now();
  const lastLoad = Number(sessionStorage.getItem('_dpstore_t') || '0');
  if (now - lastLoad > 500) {
    sessionStorage.setItem('_dpstore_t', String(now));
    useDrumPadStore.getState().loadFromStorage();
  }
}
