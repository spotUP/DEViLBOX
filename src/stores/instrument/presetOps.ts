/**
 * Pure helper functions for preset management.
 * Called by useInstrumentStore — the store remains the single Zustand store.
 */

import type {
  InstrumentConfig,
  InstrumentPreset,
  SynthType,
} from '@typedefs/instrument';
import {
  DEFAULT_OSCILLATOR,
  DEFAULT_ENVELOPE,
  DEFAULT_FILTER,
  DEFAULT_TB303,
  DEFAULT_DUB_SIREN,
  DEFAULT_SPACE_LASER,
  DEFAULT_V2,
  DEFAULT_SAM,
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

// ---------------------------------------------------------------------------
// Factory / initial config
// ---------------------------------------------------------------------------

/** Get the initial configuration for a given synth type (with factory preset auto-applied). */
export function getInitialConfig(synthType: string): Partial<InstrumentConfig> {
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
        },
      };
      break;
    case 'Buzzmachine':
      base.buzzmachine = { ...DEFAULT_BUZZMACHINE };
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
      base.isLive = true;
      break;
  }

  // Auto-apply first factory preset so new instruments produce useful sound.
  const firstPreset = getFirstPresetForSynthType(synthType);
  if (firstPreset) {
    const presetObj = firstPreset as Record<string, unknown>;
    const presetConfig = Object.fromEntries(
      Object.entries(presetObj).filter(([k]) => k !== 'name' && k !== 'type' && k !== 'synthType'),
    );
    Object.assign(base, presetConfig);
    base.synthType = synthType as SynthType;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Preset building
// ---------------------------------------------------------------------------

/** Build a user preset from a live instrument config. */
export function buildPreset(
  instrument: InstrumentConfig,
  name: string,
  category: InstrumentPreset['category'],
): InstrumentPreset {
  return {
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
}

/** Create a default instrument config. */
export function createDefaultInstrument(id: number): InstrumentConfig {
  return {
    id,
    name: `Instrument ${String(id).padStart(2, '0')}`,
    type: 'synth',
    synthType: 'Sampler',
    oscillator: { ...DEFAULT_OSCILLATOR },
    envelope: { ...DEFAULT_ENVELOPE },
    filter: { ...DEFAULT_FILTER },
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig;
}
