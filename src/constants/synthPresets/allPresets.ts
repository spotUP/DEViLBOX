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
};
