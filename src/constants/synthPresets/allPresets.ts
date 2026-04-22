import type { SynthType } from '../../types/instrument';
import type { SynthPreset } from './types';
import { TB303_PRESETS } from './tb303';
import { CHIPSYNTH_PRESETS } from './chipsynth';
import { SUPERSAW_PRESETS } from './supersaw';
import { ORGAN_PRESETS } from './organ';
import { DRUM_MACHINE_PRESETS } from './drumMachine';
import { PWM_SYNTH_PRESETS } from './pwmSynth';
import { STRING_MACHINE_PRESETS } from './stringMachine';
import { FORMANT_SYNTH_PRESETS } from './formantSynth';
import { DUB_SIREN_PRESETS } from './dubSiren';
import { SPACE_LASER_PRESETS } from './spaceLaser';
import { POLYSYNTH_PRESETS } from './polySynth';
import { MONO_SYNTH_PRESETS } from './monoSynth';
import { FM_SYNTH_PRESETS } from './fmSynth';
import { AM_SYNTH_PRESETS } from './amSynth';
import { WOBBLE_BASS_PRESETS } from './wobbleBass';
import { HARMONIC_SYNTH_PRESETS } from './harmonicSynth';
import { SYNARE_PRESETS } from './synare';
import { V2_PRESETS } from './v2';
import { WAVETABLE_PRESETS } from './wavetable';
import { OIDOS_PRESETS } from './oidos';
import { TUNEFISH_PRESETS } from './tunefish';
import { WAVESABRE_SLAUGHTER_PRESETS, WAVESABRE_FALCON_PRESETS } from './wavesabre';
import { GTULTRA_PRESETS } from './gtultra';

export function getPresetsForSynthType(synthType: SynthType): SynthPreset[] {
  switch (synthType) {
    case 'TB303':
      return TB303_PRESETS;
    case 'ChipSynth':
      return CHIPSYNTH_PRESETS;
    case 'SuperSaw':
      return SUPERSAW_PRESETS;
    case 'Organ':
      return ORGAN_PRESETS;
    case 'DrumMachine':
      return DRUM_MACHINE_PRESETS;
    case 'PWMSynth':
      return PWM_SYNTH_PRESETS;
    case 'StringMachine':
      return STRING_MACHINE_PRESETS;
    case 'FormantSynth':
      return FORMANT_SYNTH_PRESETS;
    case 'PolySynth':
      return POLYSYNTH_PRESETS;
    case 'DubSiren':
      return DUB_SIREN_PRESETS;
    case 'SpaceLaser':
      return SPACE_LASER_PRESETS;
    case 'MonoSynth':
      return MONO_SYNTH_PRESETS;
    case 'FMSynth':
      return FM_SYNTH_PRESETS;
    case 'ToneAM':
      return AM_SYNTH_PRESETS;
    case 'WobbleBass':
      return WOBBLE_BASS_PRESETS;
    case 'HarmonicSynth':
      return HARMONIC_SYNTH_PRESETS;
    case 'Synare':
      return SYNARE_PRESETS;
    case 'V2':
      return V2_PRESETS;
    case 'Wavetable':
      return WAVETABLE_PRESETS;
    case 'OidosSynth':
      return OIDOS_PRESETS;
    case 'TunefishSynth':
      return TUNEFISH_PRESETS;
    case 'WaveSabreSynth':
      return [...WAVESABRE_SLAUGHTER_PRESETS, ...WAVESABRE_FALCON_PRESETS];
    case 'GTUltraSynth':
      return GTULTRA_PRESETS;
    default:
      return [];
  }
}

export const ALL_PRESETS: Record<string, SynthPreset[]> = {
  TB303: TB303_PRESETS,
  ChipSynth: CHIPSYNTH_PRESETS,
  SuperSaw: SUPERSAW_PRESETS,
  Organ: ORGAN_PRESETS,
  DrumMachine: DRUM_MACHINE_PRESETS,
  PWMSynth: PWM_SYNTH_PRESETS,
  StringMachine: STRING_MACHINE_PRESETS,
  FormantSynth: FORMANT_SYNTH_PRESETS,
  PolySynth: POLYSYNTH_PRESETS,
  DubSiren: DUB_SIREN_PRESETS,
  SpaceLaser: SPACE_LASER_PRESETS,
  MonoSynth: MONO_SYNTH_PRESETS,
  FMSynth: FM_SYNTH_PRESETS,
  ToneAM: AM_SYNTH_PRESETS,
  WobbleBass: WOBBLE_BASS_PRESETS,
  HarmonicSynth: HARMONIC_SYNTH_PRESETS,
  Synare: SYNARE_PRESETS,
  V2: V2_PRESETS,
  Wavetable: WAVETABLE_PRESETS,
  OidosSynth: OIDOS_PRESETS,
  TunefishSynth: TUNEFISH_PRESETS,
  WaveSabreSlaughter: WAVESABRE_SLAUGHTER_PRESETS,
  WaveSabreFalcon: WAVESABRE_FALCON_PRESETS,
  GTUltraSynth: GTULTRA_PRESETS,
};
