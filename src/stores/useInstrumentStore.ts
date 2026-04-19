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
import { isDevilboxSynth } from '@typedefs/synth';
import {
  DEFAULT_ENVELOPE,
  DEFAULT_OSCILLATOR,
  DEFAULT_FILTER,
  DEFAULT_TB303,
  DEFAULT_DUB_SIREN,
  DEFAULT_SPACE_LASER,
  DEFAULT_V2,
  DEFAULT_SAM,
  DEFAULT_V2_SPEECH,
  DEFAULT_SYNARE,
  DEFAULT_BUZZMACHINE,
  DEFAULT_OPENWURLI,
  DEFAULT_OPL3,
  DEFAULT_DX7,
} from '@typedefs/instrument';
import { DEFAULT_TUNEFISH } from '@typedefs/tunefishInstrument';
import { DEFAULT_OIDOS_INSTRUMENT } from '@typedefs/oidosInstrument';
import { DEFAULT_WAVESABRE_INSTRUMENT } from '@typedefs/wavesabreInstrument';

import { getFirstPresetForSynthType } from '@constants/factoryPresets';
import { getDefaultFurnaceConfig } from '@engine/InstrumentFactory';
import { getToneEngine } from '@engine/ToneEngine';
import { checkFormatViolation, getActiveFormatLimits, isViolationConfirmed } from '@/lib/formatCompatibility';
import { FurnaceParser } from '@/lib/import/formats/FurnaceParser';
import { DefleMaskParser } from '@/lib/import/formats/DefleMaskParser';
import { deepMerge, ensureCompleteInstrumentConfig } from '@/lib/migration';
import { WaveformProcessor } from '@/lib/audio/WaveformProcessor';

// Extracted helper modules
import {
  processSampleReverse,
  processSampleNormalize,
  processSampleInvertLoop,
  computeSliceRemoval,
  buildSlicedInstruments,
  buildDrumKitFromSlices,
} from './instrument/sampleOperations';
import {
  createEffect,
  createEffectFromConfig,
  removeEffectFromList,
  reorderEffectsList,
  applyEffectUpdates,
} from './instrument/effectsChainOps';
import {
  getInitialConfig,
  buildPreset,
  createDefaultInstrument,
} from './instrument/presetOps';

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
 * Check if adding/changing to a synth instrument breaks native format compatibility.
 * Returns true if the user confirmed (or no warning needed), false if cancelled.
 * Called from ALL store entry points that can change synthType.
 */
/** Re-export for backward compat (called from TrackerReplayer.loadSong) */
export { resetFormatViolations as resetFormatCompatFlag } from '@/lib/formatCompatibility';


interface InstrumentStore {
  // State
  instruments: InstrumentConfig[];
  currentInstrumentId: number | null;
  currentInstrument: InstrumentConfig | null;
  previewInstrument: InstrumentConfig | null; // For modal previews (EditInstrumentModal)
  presets: InstrumentPreset[];
  /** Monotonically increasing counter — bumps on every loadInstruments() call.
   *  Used by usePatternPlayback to re-fire when a full instrument reload arrives
   *  (deferred via queueMicrotask) without re-firing on individual edits. */
  instrumentLoadVersion: number;

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
  loadInstruments: (instruments: InstrumentConfig[], options?: { skipPreload?: boolean }) => void;
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
    instrumentLoadVersion: 0,
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
      // Eagerly create + initialize the synth so it's ready for instant playback
      import('../engine/ToneEngine').then(({ getToneEngine }) => {
        const engine = getToneEngine();
        engine.ensureInstrumentReady(inst);
      }).catch(() => { /* audio context unavailable (SSR / happy-dom) — safe to skip */ });
      // Apply per-instrument default octave (e.g. bass synths start at octave 2)
      if (inst.defaultOctave !== undefined) {
        import('./useEditorStore').then(({ useEditorStore }) => {
          useEditorStore.getState().setCurrentOctave(inst.defaultOctave!);
        }).catch(() => { /* ignore if store not ready */ });
      }
      // Auto-enable 303 flag columns when selecting a TB-303/Buzz3o3 instrument
      if (inst.synthType === 'TB303' || inst.synthType === 'Buzz3o3') {
        import('./useEditorStore').then(({ useEditorStore }) => {
          const vis = useEditorStore.getState().columnVisibility;
          if (!vis.flag1 || !vis.flag2) {
            useEditorStore.getState().setColumnVisibility({ flag1: true, flag2: true });
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

      // Format compat: synth type change — deferred to export-time validation
      // (synth instruments still work in DEViLBOX; only matters when exporting to native format)

      // Check what's changing
      const synthTypeChanging = currentInstrument && updates.synthType && updates.synthType !== currentInstrument.synthType;
      const isPresetLoad = updates.name && updates.synthType; // Loading a preset has both name and synthType

      // Check if any sound-affecting parameters are changing (not just name/volume/pan)
      const soundParamsChanging = !!(
        updates.oscillator ||
        updates.envelope ||
        updates.filter ||
        updates.filterEnvelope ||
        updates.pitchEnvelope ||
        updates.superSaw ||
        updates.polySynth ||
        updates.organ ||
        updates.drumMachine ||
        updates.chipSynth ||
        updates.pwmSynth ||
        updates.stringMachine ||
        updates.formantSynth ||
        updates.wavetable ||
        updates.harmonicSynth ||
        updates.granular ||
        updates.furnace ||
        updates.dubSiren ||
        updates.synare ||
        updates.sam ||
        updates.v2Speech ||
        updates.tb303 ||
        updates.buzzmachine ||
        updates.spaceLaser ||
        updates.wobbleBass ||
        updates.v2 ||
        updates.wam ||
        updates.mame ||
        updates.rdpiano ||
        updates.drumKit ||
        updates.chiptuneModule ||
        updates.hively ||
        updates.jamCracker ||
        updates.uade ||
        updates.soundMon ||
        updates.sidMon ||
        updates.digMug ||
        updates.fc ||
        updates.deltaMusic1 ||
        updates.deltaMusic2 ||
        updates.sonicArranger ||
        updates.fred ||
        updates.tfmx ||
        updates.hippelCoso ||
        updates.robHubbard ||
        updates.sidmon1 ||
        updates.octamed ||
        updates.davidWhittaker ||
        updates.symphonie ||
        updates.sunvox ||
        updates.modularSynth ||
        updates.parameters ||
        updates.sample ||
        updates.superCollider ||
        updates.gtUltra ||
        updates.mdaEPiano ||
        updates.mdaJX10 ||
        updates.mdaDX10 ||
        updates.amsynth ||
        updates.raffo ||
        updates.calfMono ||
        updates.setbfree ||
        updates.synthv1 ||
        updates.monique ||
        updates.vl1 ||
        updates.talNoizeMaker ||
        updates.aeolus ||
        updates.fluidsynth ||
        updates.sfizz ||
        updates.zynaddsubfx ||
        updates.tunefish ||
        updates.wavesabre ||
        updates.oidos ||
        updates.openWurli ||
        updates.opl3 ||
        updates.dx7 ||
        updates.pinkTrombone ||
        updates.dectalk ||
        updates.lfo ||
        updates.volume !== undefined ||
        updates.pan !== undefined
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

          // Auto-initialize Tunefish config
          if (synthTypeChanging && updates.synthType === 'TunefishSynth' && !instrument.tunefish) {
            instrument.tunefish = { ...DEFAULT_TUNEFISH };
          }

          // Auto-initialize Oidos config
          if (synthTypeChanging && updates.synthType === 'OidosSynth' && !instrument.oidos) {
            instrument.oidos = { ...DEFAULT_OIDOS_INSTRUMENT };
          }

          // Auto-initialize WaveSabre config (Slaughter/Falcon variants)
          if (synthTypeChanging && updates.synthType === 'WaveSabreSynth' && !instrument.wavesabre) {
            instrument.wavesabre = { ...DEFAULT_WAVESABRE_INSTRUMENT };
          }

          // Auto-initialize Retromulator synth configs
          if (synthTypeChanging && updates.synthType === 'OpenWurli' && !instrument.openWurli) {
            instrument.openWurli = { ...DEFAULT_OPENWURLI };
          }
          if (synthTypeChanging && updates.synthType === 'OPL3' && !instrument.opl3) {
            instrument.opl3 = { ...DEFAULT_OPL3 };
          }
          if (synthTypeChanging && updates.synthType === 'DX7' && !instrument.dx7) {
            instrument.dx7 = { ...DEFAULT_DX7 };
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
            // Universal volume/pan handler — adjust output gain directly, never invalidate
            if ((updates.volume !== undefined || updates.pan !== undefined) && !updates.oscillator && !updates.envelope && !updates.filter) {
              const instruments = (engine as any).instruments as Map<number, any>;
              if (instruments) {
                for (const [key, synth] of instruments.entries()) {
                  if ((key >>> 16) === id && synth) {
                    if (updates.volume !== undefined) {
                      // Convert dB to linear gain: 10^(dB/20)
                      const vol = updatedInstrument.volume ?? -6;
                      const linearGain = Math.pow(10, vol / 20);
                      if (synth.output?.gain) {
                        synth.output.gain.value = linearGain;
                      } else if (synth.set && typeof synth.set === 'function') {
                        try { synth.set('volume', vol); } catch { /* */ }
                      }
                    }
                  }
                }
              }
              // If ONLY volume/pan changed, we're done — don't invalidate
              const otherKeys = Object.keys(updates).filter(k => k !== 'volume' && k !== 'pan');
              if (otherKeys.length === 0) return; // Handled
            }

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
              // V2 uses binary patches — applyConfig converts config→bytes→loadPatch.
              // updateV2Parameters calls setParameter() which is a no-op for V2.
              engine.updateComplexSynthParameters(id, updatedInstrument.v2);
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

            // Demoscene WASM synths — use applyConfig pattern
            if (updatedInstrument.synthType === 'TunefishSynth' && updatedInstrument.tunefish && updates.tunefish) {
              engine.updateComplexSynthParameters(id, updatedInstrument.tunefish);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'OidosSynth' && updatedInstrument.oidos && updates.oidos) {
              engine.updateComplexSynthParameters(id, updatedInstrument.oidos);
              return; // Handled
            }

            if (updatedInstrument.wavesabre && updates.wavesabre) {
              // WaveSabre variants — extract the sub-config for the active variant
              const variant = updatedInstrument.wavesabre.slaughter ? updatedInstrument.wavesabre.slaughter
                : updatedInstrument.wavesabre.falcon ? updatedInstrument.wavesabre.falcon : null;
              if (variant) {
                engine.updateComplexSynthParameters(id, variant);
                return; // Handled
              }
            }

            // Retromulator WASM synths
            if (updatedInstrument.synthType === 'OpenWurli' && updatedInstrument.openWurli && updates.openWurli) {
              engine.updateComplexSynthParameters(id, updatedInstrument.openWurli);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'OPL3' && updatedInstrument.opl3 && updates.opl3) {
              engine.updateComplexSynthParameters(id, updatedInstrument.opl3);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'DX7' && updates.dx7) {
              const dx7Updates = updates.dx7 as Record<string, unknown>;
              // Find all DX7 synth instances for this instrument
              const instruments = (engine as any).instruments as Map<number, any>;
              const findDX7 = () => {
                if (!instruments) return null;
                for (const [key, synth] of instruments.entries()) {
                  if ((key >>> 16) === id && synth?.loadSysex) return synth;
                }
                return null;
              };
              const synth = findDX7();

              if (dx7Updates.vcedPreset && synth?.loadVcedPreset) {
                synth.loadVcedPreset(dx7Updates.vcedPreset as string);
              }
              if (dx7Updates.vced && typeof dx7Updates.vced === 'object' && synth?.setVcedParam) {
                for (const [paramStr, value] of Object.entries(dx7Updates.vced as Record<string, number>)) {
                  const paramNum = parseInt(paramStr, 10);
                  if (!isNaN(paramNum)) synth.setVcedParam(paramNum, Math.round(value));
                }
              }
              if (dx7Updates.bank !== undefined && synth?.loadPatchBank) {
                const manifest = (synth.constructor as any).getPatchManifest?.();
                const bankIdx = dx7Updates.bank as number;
                const program = (dx7Updates.program as number) ?? 0;
                if (manifest?.banks?.[bankIdx]) {
                  synth.loadPatchBank(manifest.banks[bankIdx].file, program);
                }
              } else if (dx7Updates.program !== undefined && synth?.selectVoice) {
                synth.selectVoice(dx7Updates.program as number);
              }
              // NEVER invalidate DX7 — all changes go through SysEx, not synth recreation
              return; // Handled
            }

            // Zynthian WASM synths — all use DevilboxSynth.applyConfig() pattern
            const zynthianConfigMap: Record<string, string> = {
              MdaEPiano: 'mdaEPiano', MdaJX10: 'mdaJX10', MdaDX10: 'mdaDX10',
              Amsynth: 'amsynth', RaffoSynth: 'raffo', CalfMono: 'calfMono',
              SetBfree: 'setbfree', SynthV1: 'synthv1', Monique: 'monique', VL1: 'vl1',
              TalNoizeMaker: 'talNoizeMaker', Aeolus: 'aeolus', FluidSynth: 'fluidsynth',
              Sfizz: 'sfizz', ZynAddSubFX: 'zynaddsubfx',
            };
            const zynthConfigKey = zynthianConfigMap[updatedInstrument.synthType];
            if (zynthConfigKey) {
              // ZynAddSubFX XML presets require synth recreation (native XML loading)
              if (zynthConfigKey === 'zynaddsubfx' && (updates as any).zynaddsubfxXmlPreset) {
                engine.invalidateInstrument(id);
                return;
              }
              // Native patch presets — load on running synth if possible, else recreate
              const nativePatchKeyMap: Record<string, string> = {
                synthv1NativePatch: 'loadNativePreset',
                calfMonoNativePatch: 'loadNativePreset',
                talNativePatch: 'loadNativePreset',
                raffoNativePatch: 'loadNativePreset',
                setbfreeNativePatch: 'loadNativePreset',
              };
              for (const [patchKey, method] of Object.entries(nativePatchKeyMap)) {
                const patchName = (updates as any)[patchKey];
                if (patchName) {
                  // Try to load on running instance first
                  const instruments = (engine as any).instruments as Map<number, any>;
                  let loaded = false;
                  if (instruments) {
                    for (const [key, synth] of instruments.entries()) {
                      if ((key >>> 16) === id && synth?.[method]) {
                        console.log(`[InstrumentStore] Native patch: calling ${method}('${patchName}') on ${updatedInstrument.synthType} id=${id}, isInitialized=${synth.isInitialized}`);
                        synth[method](patchName);
                        loaded = true;
                        break;
                      }
                    }
                  }
                  if (!loaded) {
                    console.log(`[InstrumentStore] Native patch: synth not found for id=${id}, invalidating`);
                    engine.invalidateInstrument(id);
                  }
                  return;
                }
              }
              const synthConfig = (updatedInstrument as any)[zynthConfigKey];
              if (synthConfig && (updates as any)[zynthConfigKey]) {
                engine.updateComplexSynthParameters(id, synthConfig);
                return; // Handled
              }
            }

            // PinkTrombone speech synth — uses applyConfig pattern
            if (updatedInstrument.synthType === 'PinkTrombone' && updatedInstrument.pinkTrombone && updates.pinkTrombone) {
              engine.updateComplexSynthParameters(id, updatedInstrument.pinkTrombone);
              return; // Handled
            }

            // DECtalk speech synth — uses applyConfig pattern
            if (updatedInstrument.synthType === 'DECtalk' && updatedInstrument.dectalk && updates.dectalk) {
              engine.updateComplexSynthParameters(id, updatedInstrument.dectalk);
              return; // Handled
            }

            if (updatedInstrument.synthType === 'HivelySynth' && updatedInstrument.hively) {
              const instrument = engine.getInstrument(id, updatedInstrument);
              if (instrument && typeof (instrument as any).setInstrument === 'function') {
                (instrument as any).setInstrument(updatedInstrument.hively).catch(() => {});
              }
              return;
            }

            // WASM singleton engines (Hively, JamCracker, FC, etc.) run autonomously
            // in their worklet — config changes are UI-only state (volume, phase, etc.)
            // and must NOT trigger invalidateInstrument which would kill the audio.
            const wasmSynthTypes = [
              'JamCrackerSynth', 'FCSynth', 'SoundMonSynth', 'SidMonSynth',
              'DigMugSynth', 'DeltaMusic1Synth', 'DeltaMusic2Synth', 'FredSynth', 'TFMXSynth',
              'SonicArrangerSynth', 'HippelCoSoSynth', 'RobHubbardSynth', 'DavidWhittakerSynth',
              'OctaMEDSynth', 'SidMon1Synth', 'MusicLineSynth', 'KlysSynth',
            ];
            if (wasmSynthTypes.includes(updatedInstrument.synthType)) {
              return; // Handled — WASM engine runs independently, no invalidation needed
            }

            // Complex factory synths with applyConfig methods — update in-place
            // to avoid killing active voices. applyConfig covers the most common
            // real-time parameters (filter, envelope, osc levels, LFO rate).
            const complexFactorySynths = [
              'SuperSaw', 'Organ', 'ChipSynth', 'PWMSynth',
              'StringMachine', 'FormantSynth', 'WobbleBass',
            ];
            if (complexFactorySynths.includes(updatedInstrument.synthType)) {
              const configKey = updatedInstrument.synthType === 'WobbleBass' ? 'wobbleBass'
                : updatedInstrument.synthType === 'SuperSaw' ? 'superSaw'
                : updatedInstrument.synthType === 'FormantSynth' ? 'formantSynth'
                : updatedInstrument.synthType === 'StringMachine' ? 'stringMachine'
                : updatedInstrument.synthType === 'PWMSynth' ? 'pwmSynth'
                : updatedInstrument.synthType === 'ChipSynth' ? 'chipSynth'
                : updatedInstrument.synthType === 'Organ' ? 'organ'
                : null;
              const synthConfig = configKey ? (updatedInstrument as any)[configKey] : null;
              if (synthConfig) {
                engine.updateComplexSynthParameters(id, synthConfig);
                return; // Handled — no invalidation needed
              }
            }

            // Standard Tone.js synths: update in-place instead of recreating
            const toneJsSynthTypes = ['Synth', 'FMSynth', 'ToneAM', 'MonoSynth', 'DuoSynth', 'PluckSynth',
              'MembraneSynth', 'MetalSynth', 'NoiseSynth'];
            if (toneJsSynthTypes.includes(updatedInstrument.synthType) &&
                (updates.oscillator || updates.envelope || updates.filter || updates.filterEnvelope || updates.lfo || updates.volume !== undefined)) {
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
        // SAFETY: Zynthian/WASM synths that use applyConfig() must NEVER be invalidated
        // for config-only changes — invalidation kills the audio worklet and forces a
        // full WASM rebuild. Only invalidate when synthType actually changes or preset loads.
        const updatedInst = get().instruments.find((inst) => inst.id === id);
        const applyConfigSynthTypes = [
          'MdaEPiano', 'MdaJX10', 'MdaDX10', 'Amsynth', 'RaffoSynth', 'CalfMono',
          'SetBfree', 'SynthV1', 'Monique', 'VL1', 'TalNoizeMaker', 'Aeolus',
          'FluidSynth', 'Sfizz',
          'TunefishSynth', 'OidosSynth', 'WaveSabreSynth', 'OpenWurli', 'OPL3', 'DX7',
          'PinkTrombone', 'DECtalk', 'Sam', 'V2', 'V2Speech', 'Synare',
          'TB303', 'Buzz3o3', 'DubSiren', 'SpaceLaser',
        ];
        if (updatedInst && applyConfigSynthTypes.includes(updatedInst.synthType) && !synthTypeChanging && !isPresetLoad) {
          // Config-only change for an applyConfig synth — the real-time update path above
          // should have handled this. If it didn't (error/race), log and skip invalidation.
          console.warn(`[InstrumentStore] Skipping invalidation for ${updatedInst.synthType} id=${id} — applyConfig synth, config-only change`);
        } else {
          try {
            const engine = getToneEngine();
            engine.invalidateInstrument(id);
          } catch (error) {
            console.warn('[InstrumentStore] Could not invalidate instrument:', error);
          }
        }
        // Sync updated instrument to the replayer's cached map so playback uses new config
        const updatedConfig = get().instruments.find(i => i.id === id);
        if (updatedConfig) {
          try {
            const { getTrackerReplayer } = require('@engine/TrackerReplayer');
            const replayer = getTrackerReplayer();
            replayer.updateInstrument(updatedConfig);

            // Mark/unmark replaced instruments for hybrid playback
            if (updatedConfig.synthType !== currentInstrument?.synthType) {
              const isNowSynth = updatedConfig.synthType !== 'Sampler' && updatedConfig.synthType !== 'Player';
              if (isNowSynth) {
                replayer.markInstrumentReplaced(id);
              } else {
                replayer.unmarkInstrumentReplaced(id);
              }
            }
          } catch { /* replayer not initialized yet */ }
        }
      }
    },

    createInstrument: (config) => {
      const currentCount = get().instruments.length;
      const limits = getActiveFormatLimits();
      if (limits && currentCount >= limits.maxInstruments && !isViolationConfirmed('instrumentCount')) {
        void checkFormatViolation('instrumentCount',
          `Adding instrument ${currentCount + 1} exceeds ${limits.name} limit of ${limits.maxInstruments} instruments.`,
        ).then((ok) => { if (ok) get().createInstrument(config); });
        return -1;
      }

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

      // Format compat warning is handled by updateInstrument (handleSaveNew calls it next)

      return newId;
    },

    addInstrument: (config) => {
      // Format compat: synth instrument — deferred to export-time validation
      // (synth instruments still work in DEViLBOX; only matters when exporting to native format)
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

      // Eagerly create + initialize the synth so it's ready for instant playback
      const savedConfig = get().instruments.find(i => i.id === get().currentInstrumentId);
      if (savedConfig) {
        import('../engine/ToneEngine').then(({ getToneEngine }) => {
          const engine = getToneEngine();
          engine.ensureInstrumentReady(savedConfig);
        });
      }
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

          // Detect if this is a WASM synth that needs live baking
          const loadedInst = engine.getInstrument(instrument.id, instrument);
          const needsLiveBake = loadedInst && isDevilboxSynth(loadedInst);

          for (const note of usedNotes) {
            // Create a config that forces this specific note for baking
            // (Note: triggerAttack in bakeInstrument will use this frequency)
            const buffer = needsLiveBake
              ? await engine.liveBakeInstrument(instrument.id, instrument, 4, note)
              : await engine.bakeInstrument(instrument, 2, note);
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
          const loadedInst = engine.getInstrument(instrument.id, instrument);
          const needsLiveBake = loadedInst && isDevilboxSynth(loadedInst);
          const buffer = needsLiveBake
            ? await engine.liveBakeInstrument(instrument.id, instrument, 4, 'C4')
            : await engine.bakeInstrument(instrument, 2, 'C4');
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
          instrument.effects.push(createEffect(effectType));
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
      console.log('[InstrumentStore] addEffectConfig called for instrumentId:', instrumentId, 'effect type:', effect.type);
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          instrument.effects.push(createEffectFromConfig(effect));
          console.log('[InstrumentStore] addEffectConfig: effect added, total effects:', instrument.effects.length);
        } else {
          console.warn('[InstrumentStore] addEffectConfig: instrument not found');
        }
      });

      // Rebuild instrument effect chain in audio engine (async for neural effects)
      const instrument = get().instruments.find((inst) => inst.id === instrumentId);
      if (instrument) {
        console.log('[InstrumentStore] addEffectConfig: calling rebuildInstrumentEffects with', instrument.effects.length, 'effects');
        (async () => {
          try {
            const engine = getToneEngine();
            await engine.rebuildInstrumentEffects(instrumentId, instrument.effects);
            console.log('[InstrumentStore] addEffectConfig: rebuildInstrumentEffects completed');
          } catch (error) {
            console.warn('[InstrumentStore] Could not rebuild instrument effects:', error);
          }
        })();
      } else {
        console.warn('[InstrumentStore] addEffectConfig: instrument not found for rebuild');
      }
    },

    removeEffect: (instrumentId, effectId) => {
      set((state) => {
        const instrument = state.instruments.find((inst) => inst.id === instrumentId);
        if (instrument) {
          const updated = removeEffectFromList(instrument.effects, effectId);
          if (updated) instrument.effects = updated;
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
          const idx = instrument.effects.findIndex((eff) => eff.id === effectId);
          if (idx !== -1) {
            instrument.effects[idx] = applyEffectUpdates(instrument.effects[idx], updates);
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
          instrument.effects = reorderEffectsList(instrument.effects, fromIndex, toIndex);
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
          state.presets.push(buildPreset(instrument, name, category));
        }
      }),

    // Import instruments from song file
    loadInstruments: (newInstruments, options) => {
      // DIAGNOSTIC: trace who's calling loadInstruments (debug MIDI silence on loop)
      console.warn('[InstrumentStore] loadInstruments called with', newInstruments.length, 'instruments');
      console.trace('[InstrumentStore] loadInstruments caller');

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
        console.log(`[InstrumentStore] loadInstruments: id=${inst.id} name="${inst.name}" synthType=${inst.synthType} hasXrns=${!!inst.xrns} xrnsChunk=${!!inst.xrns?.parameterChunk}`);
        // Ensure complete config for the synthType
        const completeInst = ensureCompleteInstrumentConfig(inst);

        // Sanitize out-of-range or duplicate IDs to valid 1-128 range
        if (completeInst.id < 1 || completeInst.id > 128 || usedIds.has(completeInst.id)) {
          let newId = -1; // sentinel: no available slot
          for (let id = 1; id <= 128; id++) {
            if (!usedIds.has(id)) { newId = id; break; }
          }
          if (newId === -1) {
            // All 128 slots exhausted — skip this instrument to prevent duplicate key collisions
            return null;
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
          // Preserve XRNS data for demoscene synths (WaveSabre, Oidos, Tunefish)
          xrns: inst.xrns,
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
      }).filter((inst): inst is NonNullable<typeof inst> => inst !== null);

      // Defer state update to avoid synchronous pixi-react reconciler re-render
      // during zustand setState — prevents BindingError: "Expected null or instance of Node"
      queueMicrotask(() => {
        set((state) => {
          state.instruments = migratedInstruments;
          state.currentInstrumentId = migratedInstruments.length > 0 ? migratedInstruments[0].id : null;
          state.instrumentLoadVersion = (state.instrumentLoadVersion ?? 0) + 1;
        });

        // Preload instruments so WASM synths (TB303, Furnace, OPL3, etc.) are initialized
        // before playback starts. Without this, on-demand creation in getInstrument()
        // returns synths whose AudioWorklet hasn't loaded yet → silent notes.
        if (!options?.skipPreload) {
          getToneEngine().preloadInstruments(migratedInstruments).catch(err => {
            console.warn('[InstrumentStore] Instrument preload failed:', err);
          });
        }
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

      const arrayBuffer = await processSampleReverse(inst.sample.audioBuffer, getToneEngine());

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

      const arrayBuffer = await processSampleNormalize(inst.sample.audioBuffer, getToneEngine());

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

      const arrayBuffer = await processSampleInvertLoop(
        inst.sample.audioBuffer,
        inst.sample.loopStart,
        inst.sample.loopEnd,
        getToneEngine(),
      );

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
          const updated = computeSliceRemoval(instrument.sample.slices, sliceId);
          if (updated) instrument.sample.slices = updated;
        }
      });
    },

    createSlicedInstruments: async (sourceId, slices, namePrefix = 'Slice') => {
      const sourceInstrument = get().instruments.find((inst) => inst.id === sourceId);
      if (!sourceInstrument?.sample?.url) {
        console.error('[InstrumentStore] Source instrument has no sample');
        return [];
      }

      const existingIds = get().instruments.map((i) => i.id);

      try {
        const engine = getToneEngine();
        const response = await fetch(sourceInstrument.sample.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await engine.decodeAudioData(arrayBuffer);
        const sampleRate = audioBuffer.sampleRate;

        // Allocate IDs for each slice
        const newInstrumentIds: number[] = [];
        for (let i = 0; i < slices.length; i++) {
          newInstrumentIds.push(findNextId([...existingIds, ...newInstrumentIds]));
        }

        const newInstruments = buildSlicedInstruments(
          sourceInstrument, slices, newInstrumentIds, sampleRate, namePrefix,
        );

        set((state) => {
          for (const inst of newInstruments) {
            state.instruments.push(inst);
          }
          if (newInstrumentIds.length > 0) {
            state.currentInstrumentId = newInstrumentIds[0];
          }
        });

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
        const response = await fetch(sourceInstrument.sample.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await engine.decodeAudioData(arrayBuffer);

        const existingIds = get().instruments.map((i) => i.id);
        const sliceIds: number[] = [];
        for (let i = 0; i < slices.length; i++) {
          sliceIds.push(findNextId([...existingIds, ...sliceIds]));
        }
        const drumKitId = findNextId([...existingIds, ...sliceIds]);

        const { kit, sliceInstruments } = await buildDrumKitFromSlices(
          sourceInstrument, slices, audioBuffer, sliceIds, drumKitId, engine, namePrefix,
        );

        set((state) => {
          for (const inst of sliceInstruments) {
            state.instruments.push(inst);
          }
          state.instruments.push(kit);
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
