/**
 * Synth-type defaults applied when an instrument's synthType changes.
 * Called by useInstrumentStore.updateInstrument and by the synth tester, so a
 * test instrument is configured exactly like one the user just switched.
 */

import { getFirstPresetForSynthType } from '@constants/factoryPresets';
import { catalogSynthConfig } from '@constants/synthCategories';
import { getDefaultFurnaceConfig } from '@engine/InstrumentFactory';
import { cinter4ParamsToSampleName } from '@lib/import/formats/cinter4Params';
import {
  DEFAULT_DUB_SIREN,
  DEFAULT_SPACE_LASER,
  DEFAULT_V2,
  DEFAULT_SAM,
  DEFAULT_V2_SPEECH,
  DEFAULT_SYNARE,
  DEFAULT_OPENWURLI,
  DEFAULT_OPL3,
  DEFAULT_DX7,
} from '@typedefs/instrument';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import { DEFAULT_TUNEFISH } from '@typedefs/tunefishInstrument';
import { DEFAULT_OIDOS_INSTRUMENT } from '@typedefs/oidosInstrument';
import { DEFAULT_WAVESABRE_INSTRUMENT } from '@typedefs/wavesabreInstrument';

/** Mutates `instrument` (an immer draft or a plain config) as a switch to `newType` does. */
export function applySynthTypeDefaults(instrument: InstrumentConfig, pickedType: SynthType, isPresetLoad: boolean): void {
  // A catalog variant key (WaveSabreSlaughter) becomes its engine type plus the variant marker
  const catalog = catalogSynthConfig(pickedType);
  Object.assign(instrument, catalog);
  const newType = catalog.synthType;

  // Auto-initialize furnace config when synthType changes to a Furnace type
  // BUT skip this when loading a preset — the preset already provides
  // the correct furnace config with its unique c64/gb/etc. chip data.
  // Without this guard, preset configs (waveform, ADSR, filter, duty)
  // get overwritten with generic defaults, making all presets sound identical.
  if (!isPresetLoad && newType.startsWith('Furnace')) {
    const furnaceConfig = getDefaultFurnaceConfig(newType);
    if (furnaceConfig) {
      // Always update/reset furnace config when changing Furnace synth type
      // This ensures chipType matches the selected synthType (e.g. OPN -> OPL)
      instrument.furnace = furnaceConfig;
    }
  }

  // Auto-initialize Dub Siren config when synthType changes to 'DubSiren'
  if (newType === 'DubSiren' && !instrument.dubSiren) {
    instrument.dubSiren = { ...DEFAULT_DUB_SIREN };
  }

  // Auto-initialize Space Laser config when synthType changes to 'SpaceLaser'
  if (newType === 'SpaceLaser' && !instrument.spaceLaser) {
    instrument.spaceLaser = { ...DEFAULT_SPACE_LASER };
  }

  // Auto-initialize Cinter params when synthType changes to Cinter4Synth
  // (fresh add from the synth browser) — without cinter params the voice
  // renders silence and the editor shows "no parameters".
  if (newType === 'Cinter4Synth'
      && (instrument.parameters as Record<string, unknown> | undefined)?.cinter !== 1) {
    const defP = [5, 40, 50, 50, 50, 50, 20, 50, 0, 0, 0, 0];
    instrument.type = 'synth';
    instrument.parameters = {
      cinter: 1, version: 4, lengthWords: 2000, replenWords: 0,
      p0: defP[0], p1: defP[1], p2: defP[2], p3: defP[3], p4: defP[4], p5: defP[5],
      p6: defP[6], p7: defP[7], p8: defP[8], p9: defP[9], p10: defP[10], p11: defP[11],
      sampleName: cinter4ParamsToSampleName(defP),
    } as unknown as Record<string, unknown>;
  }

  // Auto-initialize V2 config when synthType changes to 'V2'
  if (newType === 'V2' && !instrument.v2) {
    instrument.v2 = { ...DEFAULT_V2 };
  }

  // Auto-initialize Synare config when synthType changes to 'Synare'
  if (newType === 'Synare' && !instrument.synare) {
    instrument.synare = { ...DEFAULT_SYNARE };
  }

  // Auto-initialize Sam config when synthType changes to 'Sam'
  if (newType === 'Sam' && !instrument.sam) {
    instrument.sam = { ...DEFAULT_SAM };
  }

  // Auto-initialize V2Speech config when synthType changes to 'V2Speech'
  if (newType === 'V2Speech' && !instrument.v2Speech) {
    instrument.v2Speech = { ...DEFAULT_V2_SPEECH };
  }

  // Auto-initialize Tunefish config
  if (newType === 'TunefishSynth' && !instrument.tunefish) {
    instrument.tunefish = { ...DEFAULT_TUNEFISH };
  }

  // Auto-initialize Oidos config
  if (newType === 'OidosSynth' && !instrument.oidos) {
    instrument.oidos = { ...DEFAULT_OIDOS_INSTRUMENT };
  }

  // Auto-initialize WaveSabre config (Slaughter/Falcon variants)
  if (newType === 'WaveSabreSynth' && !instrument.wavesabre) {
    instrument.wavesabre = { ...DEFAULT_WAVESABRE_INSTRUMENT };
  }

  // Auto-initialize Retromulator synth configs
  if (newType === 'OpenWurli' && !instrument.openWurli) {
    instrument.openWurli = { ...DEFAULT_OPENWURLI };
  }
  if (newType === 'OPL3' && !instrument.opl3) {
    instrument.opl3 = { ...DEFAULT_OPL3 };
  }
  if (newType === 'DX7' && !instrument.dx7) {
    instrument.dx7 = { ...DEFAULT_DX7 };
  }

  // Auto-apply first factory preset when synthType changes (unless this IS a preset load).
  // This ensures synths produce sound immediately (V2 needs patch data, MAME chips need _program).
  // Only applies when switching to a new type — won't affect re-editing existing instruments.
  if (!isPresetLoad) {
    const savedChipType = instrument.furnace?.chipType;
    const savedMachineType = instrument.buzzmachine?.machineType;

    const firstPreset = getFirstPresetForSynthType(newType);
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
      instrument.synthType = newType as SynthType;
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
  if (newType !== 'TB303' && newType !== 'Buzz3o3') {
    delete instrument.tb303;
  }
  if (newType !== 'Sampler' && newType !== 'Player') {
    delete instrument.sample;
  }
}
