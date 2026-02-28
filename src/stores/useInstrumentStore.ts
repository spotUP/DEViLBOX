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
  DeepPartial,
  SynthType,
} from '@typedefs/instrument';
import type { BeatSlice, BeatSliceConfig } from '@typedefs/beatSlicer';
import {
  DEFAULT_OSCILLATOR,
  DEFAULT_ENVELOPE,
  DEFAULT_FILTER,
  DEFAULT_TB303,
  DEFAULT_DUB_SIREN,
  DEFAULT_SPACE_LASER,
  DEFAULT_V2,
  DEFAULT_SAM,
  DEFAULT_V2_SPEECH,
  DEFAULT_SYNARE,
  DEFAULT_BUZZMACHINE,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_CHIP_SYNTH,
  DEFAULT_PWM_SYNTH,
  DEFAULT_WAVETABLE,
  DEFAULT_GRANULAR,
  DEFAULT_SUPERSAW,
  DEFAULT_POLYSYNTH,
  DEFAULT_ORGAN,
  DEFAULT_STRING_MACHINE,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_DEXED,
  DEFAULT_OBXD,
  DEFAULT_DRUMKIT,
  DEFAULT_MAME_VFX,
  DEFAULT_MAME_DOC,
  DEFAULT_MAME_SWP30,
  DEFAULT_RDPIANO,
  DEFAULT_CHIPTUNE_MODULE,
  DEFAULT_WAM,
  DEFAULT_SUPERCOLLIDER,
} from '@typedefs/instrument';

import { getFirstPresetForSynthType } from '@constants/factoryPresets';
import { getDefaultFurnaceConfig, getDefaultEffectParameters } from '@engine/InstrumentFactory';
import { getToneEngine } from '@engine/ToneEngine';
import { FurnaceParser } from '@/lib/import/formats/FurnaceParser';
import { DefleMaskParser } from '@/lib/import/formats/DefleMaskParser';
import { deepMerge, ensureCompleteInstrumentConfig } from '@/lib/migration';
import { WaveformProcessor } from '@/lib/audio/WaveformProcessor';

/**
 * Revoke blob URLs from an instrument's sample to prevent memory leaks.
 * Must be called before deleting, unbaking, or re-baking an instrument.
 */
function revokeInstrumentSampleUrls(sample: InstrumentConfig['sample']) {
  if (!sample) return;
  if (sample.url) {
    URL.revokeObjectURL(sample.url);
  }
  if (sample.multiMap) {
    Object.values(sample.multiMap).forEach(url => URL.revokeObjectURL(url));
  }
}

/**
 * Track instruments currently being baked to prevent concurrent bakes.
 */
const bakingInstruments = new Set<number>();

/**
 * Get initial configuration for a synth type
 */
function getInitialConfig(synthType: string): Partial<InstrumentConfig> {
  const base: Partial<InstrumentConfig> = {
    synthType: synthType as SynthType,
    effects: [],
    volume: -12,
    pan: 0,
  };

  switch (synthType) {
    case 'TB303':
      base.tb303 = { ...DEFAULT_TB303 };
      break;
    case 'DrumMachine':
      base.drumMachine = { ...DEFAULT_DRUM_MACHINE };
      break;
    case 'ChipSynth':
      base.chipSynth = { ...DEFAULT_CHIP_SYNTH };
      break;
    case 'PWMSynth':
      base.pwmSynth = { ...DEFAULT_PWM_SYNTH };
      break;
    case 'Wavetable':
      base.wavetable = { ...DEFAULT_WAVETABLE };
      break;
    case 'GranularSynth':
      base.granular = { ...DEFAULT_GRANULAR };
      break;
    case 'SuperSaw':
      base.superSaw = { ...DEFAULT_SUPERSAW };
      break;
    case 'PolySynth':
      base.polySynth = { ...DEFAULT_POLYSYNTH };
      break;
    case 'Organ':
      base.organ = { ...DEFAULT_ORGAN };
      break;
    case 'StringMachine':
      base.stringMachine = { ...DEFAULT_STRING_MACHINE };
      break;
    case 'FormantSynth':
      base.formantSynth = { ...DEFAULT_FORMANT_SYNTH };
      break;
    case 'WobbleBass':
      base.wobbleBass = { ...DEFAULT_WOBBLE_BASS };
      break;
    case 'DubSiren':
      base.dubSiren = { ...DEFAULT_DUB_SIREN };
      break;
    case 'SpaceLaser':
      base.spaceLaser = { ...DEFAULT_SPACE_LASER };
      break;
    case 'V2':
      base.v2 = { ...DEFAULT_V2 };
      break;
    case 'Sam':
      base.sam = { ...DEFAULT_SAM };
      break;
    case 'Synare':
      base.synare = { ...DEFAULT_SYNARE };
      break;
    case 'WAMOBXd':
    case 'WAMSynth101':
    case 'WAMTinySynth':
    case 'WAMFaustFlute':
      base.wam = { ...DEFAULT_WAM };
      break;
    case 'WAM':
      base.wam = { ...DEFAULT_WAM };
      break;
    case 'Buzz3o3':
      base.tb303 = { ...DEFAULT_TB303 };
      base.buzzmachine = {
        ...DEFAULT_BUZZMACHINE,
        machineType: 'OomekAggressor',
        parameters: {
          0: 0,    // SAW
          1: 0x78, // Cutoff
          2: 0x40, // Reso
          3: 0x40, // EnvMod
          4: 0x40, // Decay
          5: 0x40, // Accent
          6: 100,  // Tuning
          7: 100,  // Vol
        }
      };
      break;
    case 'Buzzmachine':
      base.buzzmachine = { ...DEFAULT_BUZZMACHINE };
      break;
    case 'Dexed':
      base.dexed = { ...DEFAULT_DEXED };
      break;
    case 'OBXd':
      base.obxd = { ...DEFAULT_OBXD };
      break;
    case 'DrumKit':
      base.drumKit = { ...DEFAULT_DRUMKIT };
      break;
    case 'ChiptuneModule':
      base.chiptuneModule = { ...DEFAULT_CHIPTUNE_MODULE };
      break;
    case 'MAMEVFX':
      base.mame = { ...DEFAULT_MAME_VFX };
      break;
    case 'MAMEDOC':
      base.mame = { ...DEFAULT_MAME_DOC };
      break;
    case 'MAMERSA':
      base.rdpiano = { ...DEFAULT_RDPIANO };
      break;
    case 'MAMESWP30':
      base.mame = { ...DEFAULT_MAME_SWP30 };
      break;
    case 'SuperCollider':
      base.superCollider = { ...DEFAULT_SUPERCOLLIDER };
      // SC ignores the time parameter in triggerAttack, so always use immediate time.
      base.isLive = true;
      break;
  }

  // Auto-apply first factory preset so new instruments produce useful sound out of the box.
  // This is critical for synths like V2 (needs patch data) and MAME chips (need _program).
  const firstPreset = getFirstPresetForSynthType(synthType);
  if (firstPreset) {
    const presetObj = firstPreset as Record<string, unknown>;
    const presetConfig = Object.fromEntries(
      Object.entries(presetObj).filter(([k]) => k !== 'name' && k !== 'type' && k !== 'synthType')
    );
    Object.assign(base, presetConfig);
    base.synthType = synthType as SynthType; // Preserve the requested synthType
  }

  return base;
}

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
  updateInstrument: (id: number, updates: DeepPartial<InstrumentConfig>) => void;
  createInstrument: (config?: DeepPartial<InstrumentConfig>) => number;
  addInstrument: (config: InstrumentConfig) => void;
  deleteInstrument: (id: number) => void;
  cloneInstrument: (id: number) => number;
    resetInstrument: (id: number) => void;
    bakeInstrument: (id: number, bakeType?: 'lite' | 'pro') => Promise<void>;
    unbakeInstrument: (id: number) => void;
    autoBakeInstruments: () => Promise<void>;
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
  createDrumKitFromSlices: (sourceId: number, slices: BeatSlice[], namePrefix?: string) => Promise<number | null>;

  // Reset to initial state
  reset: () => void;
}

const createDefaultInstrument = (id: number): InstrumentConfig => ({
  id,
  name: `Instrument ${String(id).padStart(2, '0')}`,
  type: 'synth', // DEViLBOX synth instrument
  synthType: 'Sampler',
  oscillator: { ...DEFAULT_OSCILLATOR },
  envelope: { ...DEFAULT_ENVELOPE },
  filter: { ...DEFAULT_FILTER },
  effects: [],
  volume: 0,
  pan: 0,
});

/**
 * Scan patterns for unique notes used by a specific instrument
 */
function getUniqueNotesForInstrument(patterns: Array<{ channels: Array<{ rows: Array<{ instrument: number; note: number }> }> }>, instrumentId: number): string[] {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notes = new Set<string>();
  patterns.forEach(pattern => {
    pattern.channels.forEach(channel => {
      channel.rows.forEach(cell => {
        if (cell.instrument === instrumentId && cell.note > 0 && cell.note <= 96) {
          const noteIndex = (cell.note - 1) % 12;
          const octave = Math.floor((cell.note - 1) / 12);
          const noteName = noteNames[noteIndex];
          notes.add(noteName.includes('#') ? `${noteName}${octave}` : `${noteName}-${octave}`);
        }
      });
    });
  });
  return Array.from(notes).sort();
}

/**
 * Helper to find next available instrument ID (1-128)
 */
function findNextId(existingIds: number[]): number {


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
    setCurrentInstrument: (id) => {
      const inst = get().instruments.find((i) => i.id === id);
      if (!inst) return;
      set((state) => {
        state.currentInstrumentId = id;
      });
      // Auto-enable 303 flag columns when selecting a TB-303/Buzz3o3 instrument
      if (inst.synthType === 'TB303' || inst.synthType === 'Buzz3o3') {
        import('./useTrackerStore').then(({ useTrackerStore }) => {
          const vis = useTrackerStore.getState().columnVisibility;
          if (!vis.flag1 || !vis.flag2) {
            useTrackerStore.getState().setColumnVisibility({ flag1: true, flag2: true });
          }
        }).catch(() => { /* ignore if store not ready */ });
      }
    },

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
        updates.furnace ||
        updates.dubSiren ||
        updates.synare ||
        updates.sam ||
        updates.v2Speech ||
        updates.tb303 ||
        updates.buzzmachine ||
        updates.spaceLaser ||
        updates.v2 ||
        updates.wam ||
        updates.parameters ||
        updates.sample ||
        updates.superCollider
      );

      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === id);
        if (instrument) {
          // Explicitly exclude 'id' from updates to prevent ID from being changed
          const safeUpdates = Object.fromEntries(
            Object.entries(updates as Record<string, unknown>).filter(([k]) => k !== 'id')
          );

          // Deep merge nested objects to preserve existing fields
          // IMPORTANT: Create new objects instead of mutating for React/Zustand change detection
          Object.keys(safeUpdates).forEach(key => {
            const value = safeUpdates[key];
            const typedKey = key as keyof InstrumentConfig;
            if (value && typeof value === 'object' && !Array.isArray(value) && instrument[typedKey]) {
              // Merge nested objects - create new object to trigger re-render
              (instrument[typedKey] as Record<string, unknown>) = { ...(instrument[typedKey] as Record<string, unknown>), ...(value as Record<string, unknown>) };
            } else {
              // Direct assignment for primitives and new objects
              (instrument[typedKey] as unknown) = value;
            }
          });

          // When a new sample.url is provided (e.g. from preset), clear stale
          // parameters.sampleUrl so the engine doesn't use the old URL instead
          if (updates.sample && (updates.sample as Record<string, unknown>).url) {
            const params = instrument.parameters as Record<string, unknown> | undefined;
            if (params?.sampleUrl) {
              delete params.sampleUrl;
            }
          }

          // Auto-initialize furnace config when synthType changes to a Furnace type
          // BUT skip this when loading a preset — the preset already provides
          // the correct furnace config with its unique c64/gb/etc. chip data.
          // Without this guard, preset configs (waveform, ADSR, filter, duty)
          // get overwritten with generic defaults, making all presets sound identical.
          if (synthTypeChanging && !isPresetLoad && updates.synthType?.startsWith('Furnace')) {
            const furnaceConfig = getDefaultFurnaceConfig(updates.synthType);
            if (furnaceConfig) {
              // Always update/reset furnace config when changing Furnace synth type
              // This ensures chipType matches the selected synthType (e.g. OPN -> OPL)
              instrument.furnace = furnaceConfig;
            }
          }

          // Auto-initialize Dub Siren config when synthType changes to 'DubSiren'
          if (synthTypeChanging && updates.synthType === 'DubSiren' && !instrument.dubSiren) {
            instrument.dubSiren = { ...DEFAULT_DUB_SIREN };
          }

          // Auto-initialize Space Laser config when synthType changes to 'SpaceLaser'
          if (synthTypeChanging && updates.synthType === 'SpaceLaser' && !instrument.spaceLaser) {
            instrument.spaceLaser = { ...DEFAULT_SPACE_LASER };
          }

          // Auto-initialize V2 config when synthType changes to 'V2'
          if (synthTypeChanging && updates.synthType === 'V2' && !instrument.v2) {
            instrument.v2 = { ...DEFAULT_V2 };
          }

          // Auto-initialize Synare config when synthType changes to 'Synare'
          if (synthTypeChanging && updates.synthType === 'Synare' && !instrument.synare) {
            instrument.synare = { ...DEFAULT_SYNARE };
          }

          // Auto-initialize Sam config when synthType changes to 'Sam'
          if (synthTypeChanging && updates.synthType === 'Sam' && !instrument.sam) {
            instrument.sam = { ...DEFAULT_SAM };
          }

          // Auto-initialize V2Speech config when synthType changes to 'V2Speech'
          if (synthTypeChanging && updates.synthType === 'V2Speech' && !instrument.v2Speech) {
            instrument.v2Speech = { ...DEFAULT_V2_SPEECH };
          }

          // Auto-apply first factory preset when synthType changes (unless this IS a preset load).
          // This ensures synths produce sound immediately (V2 needs patch data, MAME chips need _program).
          // Only applies when switching to a new type — won't affect re-editing existing instruments.
          if (synthTypeChanging && !isPresetLoad && updates.synthType) {
            const savedChipType = instrument.furnace?.chipType;
            const savedMachineType = instrument.buzzmachine?.machineType;

            const firstPreset = getFirstPresetForSynthType(updates.synthType);
            if (firstPreset) {
              const presetObj = firstPreset as Record<string, unknown>;
              const presetConfig = Object.fromEntries(
                Object.entries(presetObj).filter(([k]) => k !== 'name' && k !== 'type' && k !== 'synthType')
              );
              Object.keys(presetConfig).forEach(key => {
                const value = presetConfig[key];
                const typedKey = key as keyof InstrumentConfig;
                if (value && typeof value === 'object' && !Array.isArray(value) && instrument[typedKey]) {
                  Object.assign(instrument[typedKey] as Record<string, unknown>, value as Record<string, unknown>);
                } else {
                  (instrument[typedKey] as unknown) = value;
                }
              });
              // Preserve structural fields
              instrument.synthType = updates.synthType as SynthType;
              if (savedChipType !== undefined && instrument.furnace) {
                instrument.furnace.chipType = savedChipType;
              }
              if (savedMachineType && instrument.buzzmachine) {
                instrument.buzzmachine.machineType = savedMachineType;
              }
            }
          }

          // Clean up stale sub-configs when synthType changes,
          // so persistence doesn't carry irrelevant data that could
          // confuse migration/loading logic
          if (synthTypeChanging && updates.synthType) {
            const newType = updates.synthType;
            if (newType !== 'TB303' && newType !== 'Buzz3o3') {
              delete instrument.tb303;
            }
            if (newType !== 'Sampler' && newType !== 'Player') {
              delete instrument.sample;
            }
          }
        }
      });

      // Handle real-time updates for specialized synths (without recreating)
      if (!synthTypeChanging && !isPresetLoad) {
        try {
          const engine = getToneEngine();
          const updatedInstrument = get().instruments.find((inst) => inst.id === id);
          
          if (updatedInstrument) {
            if ((updatedInstrument.synthType === 'TB303' || updatedInstrument.synthType === 'Buzz3o3') && updatedInstrument.tb303 && updates.tb303) {
              engine.updateTB303Parameters(id, updatedInstrument.tb303);
              return; // Handled
            }
            
            if (updatedInstrument.synthType === 'DubSiren' && updatedInstrument.dubSiren && updates.dubSiren) {
              engine.updateDubSirenParameters(id, updatedInstrument.dubSiren);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'SpaceLaser' && updatedInstrument.spaceLaser && updates.spaceLaser) {
              engine.updateSpaceLaserParameters(id, updatedInstrument.spaceLaser);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'V2' && updatedInstrument.v2 && updates.v2) {
              engine.updateV2Parameters(id, updatedInstrument.v2);
              return; // Handled
            }

            // V2 Speech mode - uses applyConfig pattern
            if ((updatedInstrument.synthType === 'V2' || updatedInstrument.synthType === 'V2Speech') && updatedInstrument.v2Speech && updates.v2Speech) {
              engine.updateComplexSynthParameters(id, updatedInstrument.v2Speech);
              return; // Handled
            }

            // SAM Speech synth - uses applyConfig pattern
            if (updatedInstrument.synthType === 'Sam' && updatedInstrument.sam && updates.sam) {
              engine.updateComplexSynthParameters(id, updatedInstrument.sam);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'Synare' && updatedInstrument.synare && updates.synare) {
              engine.updateSynareParameters(id, updatedInstrument.synare);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'HarmonicSynth' && updatedInstrument.harmonicSynth && updates.harmonicSynth) {
              engine.updateHarmonicSynthParameters(id, updatedInstrument.harmonicSynth);
              return; // Handled
            }

            // Furnace instruments - re-encode and re-upload when parameters change
            if (updatedInstrument.synthType?.startsWith('Furnace') && updatedInstrument.furnace && updates.furnace) {
              engine.updateFurnaceInstrument(id, updatedInstrument);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'Buzz3o3' && updatedInstrument.tb303 && updates.tb303) {
              // Sync TB303 config back to Buzz parameters
              const tb303 = updatedInstrument.tb303;
              const currentBuzz = updatedInstrument.buzzmachine || { machineType: 'OomekAggressor', parameters: {} };
              const newParams = { ...currentBuzz.parameters };
              
              // Mapping (same as UnifiedInstrumentEditor)
              newParams[0] = tb303.oscillator.type === 'square' ? 1 : 0;
              newParams[1] = Math.round((Math.log2(tb303.filter.cutoff / 200) / Math.log2(5000 / 200)) * 240);
              newParams[2] = Math.round((tb303.filter.resonance / 100) * 128);
              newParams[3] = Math.round((tb303.filterEnvelope.envMod / 100) * 128);
              newParams[4] = Math.round((Math.log2(tb303.filterEnvelope.decay / 30) / Math.log2(3000 / 30)) * 128);
              newParams[5] = Math.round((tb303.accent.amount / 100) * 128);
              newParams[6] = Math.round((tb303.tuning || 0) + 100);

              // Update store with synced parameters
              set((state) => {
                const inst = state.instruments.find(i => i.id === id);
                if (inst) inst.buzzmachine = { ...currentBuzz, parameters: newParams };
              });

              // Apply to engine
              engine.updateBuzzmachineParameters(id, { ...currentBuzz, parameters: newParams });
              return; // Handled
            }

            if (updatedInstrument.synthType.startsWith('Buzz') && updatedInstrument.buzzmachine && updates.buzzmachine) {
              engine.updateBuzzmachineParameters(id, updatedInstrument.buzzmachine);
              return; // Handled
            }

            if ((updatedInstrument.synthType === 'Furnace' || updatedInstrument.synthType.startsWith('Furnace')) && updatedInstrument.furnace && updates.furnace) {
              engine.updateFurnaceParameters(id, updatedInstrument.furnace);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'WAM' && updatedInstrument.wam && updates.wam) {
              engine.updateWAMParameters(id, updatedInstrument.wam);
              return; // Handled
            }

            // Handle complex synths with applyConfig pattern
            const complexSynthTypes = ['SuperSaw', 'WobbleBass', 'Organ', 'ChipSynth', 'PWMSynth', 'StringMachine', 'FormantSynth'];
            if (complexSynthTypes.includes(updatedInstrument.synthType)) {
              // Find the config key for this synth type (e.g. 'superSaw' for 'SuperSaw')
              const configKey = updatedInstrument.synthType.charAt(0).toLowerCase() + updatedInstrument.synthType.slice(1);
              const config = (updatedInstrument as unknown as Record<string, unknown>)[configKey];
              if (config && (updates as unknown as Record<string, unknown>)[configKey]) {
                engine.updateComplexSynthParameters(id, config);
                return; // Handled
              }
            }

            // Standard Tone.js synths: update in-place instead of recreating
            const toneJsSynthTypes = ['Synth', 'FMSynth', 'AMSynth', 'MonoSynth', 'DuoSynth', 'PluckSynth',
              'MembraneSynth', 'MetalSynth', 'NoiseSynth'];
            if (toneJsSynthTypes.includes(updatedInstrument.synthType) &&
                (updates.oscillator || updates.envelope || updates.filter || updates.filterEnvelope || updates.volume !== undefined)) {
              engine.updateToneJsSynthInPlace(id, updatedInstrument);
              return; // Handled — no invalidation needed
            }
          }
        } catch (error) {
          // Fall through to full invalidation if update failed or was skipped
          console.warn('[InstrumentStore] Real-time update failed, falling through to invalidation:', error);
        }
      }

      // Invalidate the cached Tone.js instrument for any sound-affecting changes
      // (only if not handled by real-time update path above)
      if (synthTypeChanging || isPresetLoad || soundParamsChanging) {
        try {
          const engine = getToneEngine();
          if (updates.superCollider) {
            console.log('[SC:Store] invalidateInstrument id:', id, 'binary length:', updates.superCollider.binary?.length ?? 0, 'defName:', updates.superCollider.synthDefName);
          }
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
        const defaultInst = createDefaultInstrument(newId);
        // Use deepMerge to properly merge partial config into default
        const newInstrument: InstrumentConfig = config
          ? deepMerge(defaultInst, config as Partial<InstrumentConfig>)
          : defaultInst;

        // Ensure ID is correct (deepMerge might have overwritten it if config had id)
        newInstrument.id = newId;

        // Strip irrelevant synth sub-configs to prevent stale data from
        // interfering with persistence (e.g., tb303 config on a Sampler instrument
        // would cause loadInstruments migration confusion)
        if (newInstrument.synthType && newInstrument.synthType !== 'TB303' && newInstrument.synthType !== 'Buzz3o3') {
          delete newInstrument.tb303;
        }
        // Strip sample config from non-sample instruments
        if (newInstrument.synthType && newInstrument.synthType !== 'Sampler' && newInstrument.synthType !== 'Player') {
          delete newInstrument.sample;
        }

        // Auto-set monophonic flag for synths that are inherently monophonic
        // Only set if not explicitly specified in config
        if (config?.monophonic === undefined) {
          const monoSynthTypes = new Set([
            // Tone.js monophonic synths
            'MonoSynth', 'DuoSynth',
            // Acid/bass synths
            'TB303', 'Buzz3o3', 'DB303',
            // Simple monophonic synths
            'DubSiren', 'SpaceLaser', 'Synare',
            // Speech synthesis chips (single voice)
            'MAMEMEA8000', 'MAMETMS5220', 'MAMESP0250', 'MAMEVotrax',
            'Sam', 'V2Speech',
            // Single-voice generator chips
            'MAMECM3394', 'MAMETMS36XX', 'MAMESN76477',
            'MAMEUPD931', 'MAMEUPD933',
          ]);

          if (newInstrument.synthType && monoSynthTypes.has(newInstrument.synthType)) {
            newInstrument.monophonic = true;
          }
        }

        state.instruments.push(newInstrument);
        state.currentInstrumentId = newId;
      });

      return newId;
    },

    addInstrument: (config) => {
      set((state) => {
        // Auto-set monophonic flag for inherently monophonic synths (same as createInstrument)
        const finalConfig = { ...config };

        // Sanitize out-of-range IDs (e.g. Date.now() timestamps) to valid 1-128 range
        if (finalConfig.id < 1 || finalConfig.id > 128) {
          const existingIds = state.instruments.map(i => i.id);
          finalConfig.id = findNextId(existingIds);
        }
        if (finalConfig.monophonic === undefined) {
          const monoSynthTypes = new Set([
            'MonoSynth', 'DuoSynth',
            'TB303', 'Buzz3o3', 'DB303',
            'DubSiren', 'SpaceLaser', 'Synare',
            'MAMEMEA8000', 'MAMETMS5220', 'MAMESP0250', 'MAMEVotrax',
            'Sam', 'V2Speech',
            'MAMECM3394', 'MAMETMS36XX', 'MAMESN76477',
            'MAMEUPD931', 'MAMEUPD933',
          ]);

          if (finalConfig.synthType && monoSynthTypes.has(finalConfig.synthType)) {
            finalConfig.monophonic = true;
          }
        }

        // Check if instrument with this ID already exists
        const existing = state.instruments.find((i) => i.id === finalConfig.id);
        if (existing) {
          // Update existing instrument
          Object.assign(existing, finalConfig);
        } else {
          // Add new instrument
          state.instruments.push(finalConfig);
        }
        state.currentInstrumentId = finalConfig.id;
      });
    },

    deleteInstrument: (id) =>
      set((state) => {
        const index = state.instruments.findIndex((inst) => inst.id === id);
        if (index !== -1 && state.instruments.length > 1) {
          // Revoke any blob URLs before deleting to prevent memory leaks
          revokeInstrumentSampleUrls(state.instruments[index].sample);
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
        const cloned: InstrumentConfig = structuredClone(original);
        cloned.id = newId;
        cloned.name = `${original.name} (Copy)`;
        state.instruments.push(cloned);
        state.currentInstrumentId = newId;
      });

      return newId;
    },

    resetInstrument: (_id) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === _id);
        if (instrument) {
          const currentSynthType = instrument.synthType;
          const defaultInst = getInitialConfig(currentSynthType);
          
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
            dubSiren: undefined,
            spaceLaser: undefined,
            synare: undefined,
            v2: undefined,
          });

          // Initialize the appropriate config for the synth type
          if (currentSynthType === 'TB303' || currentSynthType === 'Buzz3o3') {
            instrument.tb303 = { ...DEFAULT_TB303 };
            if (currentSynthType === 'Buzz3o3') {
              instrument.buzzmachine = { 
                ...DEFAULT_BUZZMACHINE, 
                machineType: 'OomekAggressor',
                parameters: {
                  0: 0,    // SAW
                  1: 0x78, // Cutoff
                  2: 0x40, // Reso
                  3: 0x40, // EnvMod
                  4: 0x40, // Decay
                  5: 0x40, // Accent
                  6: 100,  // Tuning
                  7: 100,  // Vol
                }
              };
            }
          } else if (currentSynthType === 'DubSiren') {
            instrument.dubSiren = { ...DEFAULT_DUB_SIREN };
          } else if (currentSynthType === 'SpaceLaser') {
            instrument.spaceLaser = { ...DEFAULT_SPACE_LASER };
          } else if (currentSynthType === 'V2') {
            instrument.v2 = { ...DEFAULT_V2 };
          } else if (currentSynthType === 'Synare') {
            instrument.synare = { ...DEFAULT_SYNARE };
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
        engine.invalidateInstrument(_id);
      } catch (error) {
        console.warn('[InstrumentStore] Could not invalidate instrument:', error);
      }
    },

    bakeInstrument: async (id, bakeType = 'lite') => {
      const state = get();
      const instrument = state.instruments.find((inst) => inst.id === id);
      if (!instrument || instrument.synthType === 'Sampler') return;

      // Prevent concurrent bakes on the same instrument
      if (bakingInstruments.has(id)) {
        console.warn(`[InstrumentStore] Instrument ${id} is already being baked, skipping.`);
        return;
      }
      bakingInstruments.add(id);

      try {
        const engine = getToneEngine();

        // Revoke any existing sample URLs before creating new ones (re-baking case)
        if (instrument.sample) {
          revokeInstrumentSampleUrls(instrument.sample);
        }

        // Preservation: Deep clone current config BEFORE switching to Sampler
        // Must use deep clone to avoid nested objects being mutated
        const preservedConfig = structuredClone(instrument);
        delete preservedConfig.metadata; // Avoid recursion

        if (bakeType === 'pro') {
          // PRO BAKE: Scan patterns for used notes and bake each one
          const trackerState = (await import('./useTrackerStore')).useTrackerStore.getState();
          const usedNotes = getUniqueNotesForInstrument(trackerState.patterns, id);
          
          if (usedNotes.length === 0) {
            console.warn(`[InstrumentStore] No notes found for instrument ${id}, falling back to Lite bake.`);
            return get().bakeInstrument(id, 'lite');
          }

          const multiMap: Record<string, string> = {};

          for (const note of usedNotes) {
            // Create a config that forces this specific note for baking
            // (Note: triggerAttack in bakeInstrument will use this frequency)
            const buffer = await engine.bakeInstrument(instrument, 2, note);
            const wavData = await WaveformProcessor.bufferToWav(buffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            multiMap[note] = URL.createObjectURL(blob);
          }

          set((state) => {
            const inst = state.instruments.find((i) => i.id === id);
            if (inst) {
              inst.metadata = {
                ...inst.metadata,
                preservedSynth: {
                  synthType: inst.synthType,
                  config: preservedConfig,
                  bakeType: 'pro'
                }
              };
              inst.synthType = 'Sampler';
              inst.sample = {
                url: '', // Not used in multiMap mode
                multiMap,
                baseNote: 'C4',
                detune: 0,
                loop: false,
                loopStart: 0,
                loopEnd: 0,
                reverse: false,
                playbackRate: 1,
              };
              // Clear configs
              inst.tb303 = undefined; inst.dubSiren = undefined; inst.spaceLaser = undefined;
              inst.synare = undefined; inst.furnace = undefined; inst.chipSynth = undefined;
              inst.pwmSynth = undefined; inst.wobbleBass = undefined;
            }
          });
        } else {
          // LITE BAKE: Standard C-4 render
          const buffer = await engine.bakeInstrument(instrument, 2, "C4");
          const wavData = await WaveformProcessor.bufferToWav(buffer);
          const blob = new Blob([wavData], { type: 'audio/wav' });
          const url = URL.createObjectURL(blob);

          set((state) => {
            const inst = state.instruments.find((i) => i.id === id);
            if (inst) {
              inst.metadata = {
                ...inst.metadata,
                preservedSynth: {
                  synthType: inst.synthType,
                  config: preservedConfig,
                  bakeType: 'lite'
                }
              };
              inst.synthType = 'Sampler';
              inst.sample = {
                url,
                baseNote: 'C4',
                detune: 0,
                loop: false,
                loopStart: 0,
                loopEnd: 0,
                reverse: false,
                playbackRate: 1,
              };
              inst.tb303 = undefined; inst.dubSiren = undefined; inst.spaceLaser = undefined;
              inst.synare = undefined; inst.furnace = undefined; inst.chipSynth = undefined;
              inst.pwmSynth = undefined; inst.wobbleBass = undefined;
            }
          });
        }

        engine.invalidateInstrument(id);
      } catch (error) {
        console.error('[InstrumentStore] Failed to bake instrument:', error);
      } finally {
        // Release the baking lock
        bakingInstruments.delete(id);
      }
    },

    unbakeInstrument: (id) => {
      set((state) => {
        const inst = state.instruments.find((i) => i.id === id);
        if (inst && inst.metadata?.preservedSynth) {
          const { synthType, config } = inst.metadata.preservedSynth;

          // Revoke blob URLs before clearing sample to prevent memory leaks
          revokeInstrumentSampleUrls(inst.sample);

          // Preserve other metadata but remove the synth restoration flag
          const otherMetadata = { ...inst.metadata };
          delete otherMetadata.preservedSynth;

          // Restore original synth configuration and effects
          Object.assign(inst, config);
          inst.synthType = synthType;
          inst.metadata = otherMetadata;

          // Clear sample config
          inst.sample = undefined;
        }
      });

      // Invalidate engine instance and rebuild effects
      try {
        const engine = getToneEngine();
        engine.invalidateInstrument(id);
        const inst = get().instruments.find(i => i.id === id);
        if (inst) {
          engine.rebuildInstrumentEffects(id, inst.effects);
        }
      } catch {
        // Ignored
      }
    },

    autoBakeInstruments: async () => {
      const state = get();
      const instrumentsToBake = state.instruments.filter(
        (inst) => inst.metadata?.preservedSynth && (!inst.sample?.url && !inst.sample?.multiMap)
      );

      if (instrumentsToBake.length === 0) return;


      for (const inst of instrumentsToBake) {
        const preserved = inst.metadata!.preservedSynth!;
        const tempConfig = { ...inst, ...preserved.config, synthType: preserved.synthType };
        const bakeType = preserved.bakeType || 'lite';
        
        try {
          const engine = getToneEngine();
          
          if (bakeType === 'pro') {
            const trackerState = (await import('./useTrackerStore')).useTrackerStore.getState();
            const usedNotes = getUniqueNotesForInstrument(trackerState.patterns, inst.id);
            const multiMap: Record<string, string> = {};

            for (const note of usedNotes) {
              const buffer = await engine.bakeInstrument(tempConfig as InstrumentConfig, 2, note);
              const wavData = await WaveformProcessor.bufferToWav(buffer);
              const blob = new Blob([wavData], { type: 'audio/wav' });
              multiMap[note] = URL.createObjectURL(blob);
            }

            set((state) => {
              const currentInst = state.instruments.find((i) => i.id === inst.id);
              if (currentInst && currentInst.sample) {
                currentInst.sample.multiMap = multiMap;
              }
            });
          } else {
            const buffer = await engine.bakeInstrument(tempConfig as InstrumentConfig, 2, "C4");
            const wavData = await WaveformProcessor.bufferToWav(buffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            set((state) => {
              const currentInst = state.instruments.find((i) => i.id === inst.id);
              if (currentInst && currentInst.sample) {
                currentInst.sample.url = url;
              }
            });
          }
          
          engine.invalidateInstrument(inst.id);
        } catch (error) {
          console.error(`[InstrumentStore] Failed to auto-bake instrument ${inst.id}:`, error);
        }
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
            parameters: getDefaultEffectParameters(effectType),
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
            parameters: { ...getDefaultEffectParameters(effect.type), ...effect.parameters },
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
            // Ensure defaults are populated for effects with sparse parameters
            // (e.g., effects created before default population was added)
            if (updates.parameters && Object.keys(effect.parameters).length < Object.keys(getDefaultEffectParameters(effect.type)).length) {
              effect.parameters = { ...getDefaultEffectParameters(effect.type), ...effect.parameters };
            }
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
      } else {
        // Push parameter/wet changes to the audio engine in real-time
        const instrument = get().instruments.find((inst) => inst.id === instrumentId);
        const effect = instrument?.effects.find((eff) => eff.id === effectId);
        if (effect) {
          try {
            const engine = getToneEngine();
            engine.updateInstrumentEffectParams(effectId, effect);
          } catch {
            // Engine not initialized yet
          }
        }
      }

      // If bpmSync is ON after update, apply synced timing
      const updatedInstrument = get().instruments.find((inst) => inst.id === instrumentId);
      const updatedEffect = updatedInstrument?.effects.find((eff) => eff.id === effectId);
      if (updatedEffect?.parameters.bpmSync === 1) {
        try {
          const engine = getToneEngine();
          const bpm = engine.getBPM();
          engine.updateBpmSyncedEffects(bpm);
        } catch {
          // Engine not initialized yet
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
      // Revoke blob URLs from old instruments to prevent memory leaks
      get().instruments.forEach((inst) => {
        revokeInstrumentSampleUrls(inst.sample);
      });

      // Dispose ALL instruments in the engine (not just matching IDs)
      // This prevents orphaned synths from old songs with different ID ranges
      const engine = getToneEngine();
      engine.disposeAllInstruments();

      // Migrate old instruments (backward compatibility)
      // Also fix any out-of-range IDs (e.g. Date.now() timestamps from older versions)
      const usedIds = new Set<number>();
      const migratedInstruments = newInstruments.map(inst => {
        // Ensure complete config for the synthType
        const completeInst = ensureCompleteInstrumentConfig(inst);

        // Sanitize out-of-range IDs to valid 1-128 range
        if (completeInst.id < 1 || completeInst.id > 128) {
          let newId = 1;
          for (let id = 1; id <= 128; id++) {
            if (!usedIds.has(id)) { newId = id; break; }
          }
          completeInst.id = newId;
        }
        usedIds.add(completeInst.id);

        return {
          ...completeInst,
          // Preserve the saved synthType — never force-override it
          // (Previous migration forced TB303 if inst.tb303 existed, but
          // createInstrument deep-merges with defaults that always include tb303,
          // causing every Sampler/Player/etc. to revert to TB303 on reload)
          synthType: inst.synthType,
          // Add type field if missing (backward compatibility)
          // Sampler = sample, everything else = synth
          type: inst.type || (inst.synthType === 'Sampler' ? 'sample' as const : 'synth' as const),
          // Migrate old effects without category field
          effects: inst.effects?.map(effect => ({
            ...effect,
            // Add category if missing - default to 'tonejs' for old saved songs
            category: effect.category || ('tonejs' as const),
          })) || [],
        };
      });

      set((state) => {
        state.instruments = migratedInstruments;
        state.currentInstrumentId = migratedInstruments.length > 0 ? migratedInstruments[0].id : null;
      });

      // Preload instruments so WASM synths (TB303, Furnace, etc.) are initialized
      // before playback starts. Without this, on-demand creation in getInstrument()
      // returns synths whose AudioWorklet hasn't loaded yet → silent notes.
      getToneEngine().preloadInstruments(migratedInstruments).catch(err => {
        console.warn('[InstrumentStore] Instrument preload failed:', err);
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
      let synthConfig: Record<string, unknown>;

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
          performTransformation(instrumentId, targetSynthType, synthConfig, preservedSample);
        });
      } else {
        // Use default config
        synthConfig = getDefaultConfigForSynthType(targetSynthType);
        performTransformation(instrumentId, targetSynthType, synthConfig, preservedSample);
      }

      function performTransformation(
        id: number,
        synthType: InstrumentConfig['synthType'],
        config: Record<string, unknown>,
        preserved: Record<string, unknown>,
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
          const synthKey = synthType.toLowerCase() as keyof InstrumentConfig;
          (inst[synthKey] as unknown) = config;

          // Update metadata
          if (!inst.metadata) {
            inst.metadata = {};
          }

          inst.metadata.preservedSample = preserved as typeof inst.metadata.preservedSample;

          if (!inst.metadata.transformHistory) {
            inst.metadata.transformHistory = [];
          }

          inst.metadata.transformHistory.push({
            timestamp: new Date().toISOString(),
            fromType: 'Sampler',
            toType: synthType,
          });
          // Cap transform history to prevent unbounded growth
          if (inst.metadata.transformHistory.length > 20) {
            inst.metadata.transformHistory = inst.metadata.transformHistory.slice(-20);
          }
        });

        // Invalidate instrument in audio engine
        try {
          const engine = getToneEngine();
          engine.invalidateInstrument(id);
        } catch (error) {
          console.warn('[InstrumentStore] Could not invalidate instrument:', error);
        }
      }

      function getDefaultConfigForSynthType(synthType: InstrumentConfig['synthType']): Record<string, unknown> {
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

      const rawBuffer = inst.sample.audioBuffer;
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

      const rawBuffer = inst.sample.audioBuffer;
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

      const rawBuffer = inst.sample.audioBuffer;
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
      const existingIds = get().instruments.map((i) => i.id);

      try {
        // Get sample rate from source (fetch only to get metadata, not copy data)
        const engine = getToneEngine();
        const response = await fetch(sourceInstrument.sample.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await engine.decodeAudioData(arrayBuffer);
        const sampleRate = audioBuffer.sampleRate;

        for (let i = 0; i < slices.length; i++) {
          const slice = slices[i];
          const newId = findNextId([...existingIds, ...newInstrumentIds]);
          newInstrumentIds.push(newId);

          const sliceLength = slice.endFrame - slice.startFrame;
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
                // REFERENCE-BASED: Point to source instead of duplicating data
                url: sourceInstrument.sample!.url,
                sourceInstrumentId: sourceId,
                sliceStart: slice.startFrame,
                sliceEnd: slice.endFrame,
                // Inherit sample properties from source
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

        return newInstrumentIds;
      } catch (error) {
        console.error('[InstrumentStore] Failed to create sliced instruments:', error);
        return [];
      }
    },

    createDrumKitFromSlices: async (sourceId, slices, namePrefix = 'Kit') => {
      const sourceInstrument = get().instruments.find((inst) => inst.id === sourceId);
      if (!sourceInstrument?.sample?.url) {
        console.error('[InstrumentStore] Source instrument has no sample');
        return null;
      }

      const engine = getToneEngine();

      try {
        // Fetch and decode the source audio
        const response = await fetch(sourceInstrument.sample.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await engine.decodeAudioData(arrayBuffer);

        const existingIds = get().instruments.map((i) => i.id);
        const newInstrumentIds: number[] = [];
        const keymap: import('@typedefs/instrument').DrumKitKeyMapping[] = [];

        // 1. Create individual sample instruments for each slice (hidden/internal)
        for (let i = 0; i < slices.length; i++) {
          const slice = slices[i];
          const newId = findNextId([...existingIds, ...newInstrumentIds]);
          newInstrumentIds.push(newId);

          const sliceLength = slice.endFrame - slice.startFrame;
          const numChannels = audioBuffer.numberOfChannels;
          const sampleRate = audioBuffer.sampleRate;

          const offlineCtx = new OfflineAudioContext(numChannels, sliceLength, sampleRate);
          const sliceBuffer = offlineCtx.createBuffer(numChannels, sliceLength, sampleRate);

          for (let ch = 0; ch < numChannels; ch++) {
            const sourceData = audioBuffer.getChannelData(ch);
            const destData = sliceBuffer.getChannelData(ch);
            for (let j = 0; j < sliceLength; j++) {
              destData[j] = sourceData[slice.startFrame + j];
            }
          }

          const sliceArrayBuffer = await engine.encodeAudioData(sliceBuffer);
          const blob = new Blob([sliceArrayBuffer], { type: 'audio/wav' });
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          const sliceName = slice.label || `Slice ${i + 1}`;
          
          // Add internal sample instrument
          set((state) => {
            state.instruments.push({
              id: newId,
              name: `(Slice ${i + 1})`.slice(0, 22),
              type: 'sample',
              synthType: 'Sampler',
              sample: {
                url: dataUrl,
                audioBuffer: sliceArrayBuffer,
                baseNote: 'C-4',
                detune: 0,
                loop: false,
                loopStart: 0,
                loopEnd: sliceLength,
                sampleRate: sampleRate,
                reverse: false,
                playbackRate: 1,
              },
              envelope: { ...DEFAULT_ENVELOPE, sustain: 100 },
              effects: [],
              volume: -6,
              pan: 0,
            });
          });

          // Create mapping entry (starting from C-1 = MIDI 36)
          const midiNote = 36 + i;
          if (midiNote <= 127) {
            keymap.push({
              id: `mapping-${newId}`,
              noteStart: midiNote,
              noteEnd: midiNote,
              sampleId: String(newId),
              sampleUrl: dataUrl,
              sampleName: sliceName,
              pitchOffset: 0,
              fineTune: 0,
              volumeOffset: 0,
              panOffset: 0,
              baseNote: 'C-4',
            });
          }
        }

        // 2. Create the DrumKit instrument
        const drumKitId = findNextId([...existingIds, ...newInstrumentIds]);
        const kitName = sourceInstrument.name 
          ? `${sourceInstrument.name} ${namePrefix}`
          : `Sliced ${namePrefix}`;

        set((state) => {
          const drumKit: InstrumentConfig = {
            id: drumKitId,
            name: kitName.slice(0, 22),
            type: 'synth',
            synthType: 'DrumKit',
            drumKit: {
              ...DEFAULT_DRUMKIT,
              keymap,
            },
            envelope: { ...DEFAULT_ENVELOPE, sustain: 100 },
            effects: [],
            volume: 0,
            pan: 0,
          };
          state.instruments.push(drumKit);
          state.currentInstrumentId = drumKitId;
        });

        return drumKitId;
      } catch (error) {
        console.error('[InstrumentStore] Failed to create drum kit from slices:', error);
        return null;
      }
    },

    // Reset to initial state (for new project/tab)
    reset: () => {
      // First invalidate all existing instruments in the engine
      const engine = getToneEngine();
      get().instruments.forEach((inst) => {
        try {
          engine.invalidateInstrument(inst.id);
        } catch {
          // Ignore errors during invalidation
        }
      });

      set((state) => {
        state.instruments = [];
        state.currentInstrumentId = 0;
        state.presets = [];
      });

    },
  }))
);
