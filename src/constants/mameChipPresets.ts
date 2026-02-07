/**
 * MAME Chip Synth Factory Presets
 * Hardware-accurate presets for MAME-emulated sound chips.
 * Uses _program parameter for built-in WASM preset selection.
 */

import type { InstrumentConfig } from '@typedefs/instrument';

export const MAME_CHIP_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  // ============================================
  // ASTROCADE - Bally Astrocade custom sound
  // ============================================
  {
    type: 'synth',
    name: 'Astrocade Clean Square',
    synthType: 'MAMEAstrocade',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Astrocade Vibrato Lead',
    synthType: 'MAMEAstrocade',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Astrocade Noise Buzz',
    synthType: 'MAMEAstrocade',
    parameters: { _program: 2 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Astrocade Noise Rumble',
    synthType: 'MAMEAstrocade',
    parameters: { _program: 3 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // SN76477 - TI Complex Sound Generator
  // ============================================
  {
    type: 'synth',
    name: 'SN76477 Laser',
    synthType: 'MAMESN76477',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SN76477 Explosion',
    synthType: 'MAMESN76477',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SN76477 Engine',
    synthType: 'MAMESN76477',
    parameters: { _program: 2 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SN76477 Siren',
    synthType: 'MAMESN76477',
    parameters: { _program: 3 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // MSM5232 - OKI 8-Voice Organ/Synth
  // ============================================
  {
    type: 'synth',
    name: 'MSM5232 Organ',
    synthType: 'MAMEMSM5232',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MSM5232 Full Brass',
    synthType: 'MAMEMSM5232',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MSM5232 Strings',
    synthType: 'MAMEMSM5232',
    parameters: { _program: 2 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MSM5232 Reedy Combo',
    synthType: 'MAMEMSM5232',
    parameters: { _program: 3 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // TMS36XX - TI Electronic Organ
  // ============================================
  {
    type: 'synth',
    name: 'TMS36XX Piano',
    synthType: 'MAMETMS36XX',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'TMS36XX Banjo',
    synthType: 'MAMETMS36XX',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'TMS36XX Organ',
    synthType: 'MAMETMS36XX',
    parameters: { _program: 2 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // SNKWave - SNK Custom Wavetable
  // ============================================
  {
    type: 'synth',
    name: 'SNKWave Sine',
    synthType: 'MAMESNKWave',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SNKWave Square',
    synthType: 'MAMESNKWave',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SNKWave Triangle',
    synthType: 'MAMESNKWave',
    parameters: { _program: 2 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // YMOPQ - Yamaha OPQ (YM3806 FM)
  // ============================================
  {
    type: 'synth',
    name: 'YMOPQ E.Piano',
    synthType: 'MAMEYMOPQ',
    parameters: { _program: 0 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'YMOPQ Brass',
    synthType: 'MAMEYMOPQ',
    parameters: { _program: 1 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'YMOPQ Strings',
    synthType: 'MAMEYMOPQ',
    parameters: { _program: 2 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'YMOPQ Bass',
    synthType: 'MAMEYMOPQ',
    parameters: { _program: 3 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'YMOPQ Organ',
    synthType: 'MAMEYMOPQ',
    parameters: { _program: 4 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'YMOPQ Lead',
    synthType: 'MAMEYMOPQ',
    parameters: { _program: 5 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'YMOPQ Pad',
    synthType: 'MAMEYMOPQ',
    parameters: { _program: 6 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'YMOPQ Bell',
    synthType: 'MAMEYMOPQ',
    parameters: { _program: 7 },
    effects: [],
    volume: -8,
    pan: 0,
  },

  // ============================================
  // MEA8000 - Philips LPC Speech Synthesis
  // ============================================
  {
    type: 'synth',
    name: 'MEA8000 Vowel A',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MEA8000 Vowel E',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MEA8000 Vowel O',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 2 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MEA8000 Nasal',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 3 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // SP0250 - GI Speech Synthesis
  // ============================================
  {
    type: 'synth',
    name: 'SP0250 Vowel AH',
    synthType: 'MAMESP0250',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SP0250 Vowel EE',
    synthType: 'MAMESP0250',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SP0250 Vowel OO',
    synthType: 'MAMESP0250',
    parameters: { _program: 2 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // VOTRAX SC-01 - Classic Speech Synthesis
  // ============================================
  {
    type: 'synth',
    name: 'Votrax EH',
    synthType: 'MAMEVotrax',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Votrax AW',
    synthType: 'MAMEVotrax',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Votrax AH',
    synthType: 'MAMEVotrax',
    parameters: { _program: 2 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Votrax OO',
    synthType: 'MAMEVotrax',
    parameters: { _program: 3 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // ES5503 - Ensoniq 32-Oscillator Wavetable
  // ============================================
  {
    type: 'synth',
    name: 'ES5503 Default',
    synthType: 'MAMEES5503',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // YMF271 - Yamaha OPX (12-Voice FM+PCM)
  // ============================================
  {
    type: 'synth',
    name: 'YMF271 FM Piano',
    synthType: 'MAMEYMF271',
    parameters: { _program: 0 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'YMF271 FM Brass',
    synthType: 'MAMEYMF271',
    parameters: { _program: 1 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'YMF271 FM Strings',
    synthType: 'MAMEYMF271',
    parameters: { _program: 2 },
    effects: [],
    volume: -8,
    pan: 0,
  },

  // ============================================
  // TR-707 - Roland PCM Drum Machine
  // ============================================
  {
    type: 'synth',
    name: 'TR707 Default Kit',
    synthType: 'MAMETR707',
    parameters: { _program: 0 },
    effects: [],
    volume: -8,
    pan: 0,
  },

  // ============================================
  // VASynth - Virtual Analog Modeling
  // ============================================
  {
    type: 'synth',
    name: 'VA Synth Bass',
    synthType: 'MAMEVASynth',
    parameters: { _program: 0 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VA Synth Lead',
    synthType: 'MAMEVASynth',
    parameters: { _program: 1 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VA Synth Pad',
    synthType: 'MAMEVASynth',
    parameters: { _program: 2 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VA Synth Pluck',
    synthType: 'MAMEVASynth',
    parameters: { _program: 5 },
    effects: [],
    volume: -8,
    pan: 0,
  },

  // ============================================
  // TIA - Atari 2600
  // ============================================
  {
    type: 'synth',
    name: 'TIA Square',
    synthType: 'MAMETIA',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'TIA Buzz',
    synthType: 'MAMETIA',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // UPD931 - NEC Speech Synthesis
  // ============================================
  {
    type: 'synth',
    name: 'UPD931 Default',
    synthType: 'MAMEUPD931',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // UPD933 - NEC CZ Phase Distortion
  // ============================================
  {
    type: 'synth',
    name: 'UPD933 Default',
    synthType: 'MAMEUPD933',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // TMS5220 - TI Speak & Spell (LPC Speech)
  // ============================================
  {
    type: 'synth',
    name: 'TMS5220 Speech',
    synthType: 'MAMETMS5220',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // ASC - Apple Sound Chip (IIGS/Mac)
  // ============================================
  {
    type: 'synth',
    name: 'ASC Sine',
    synthType: 'MAMEASC',
    parameters: { _program: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'ASC Square',
    synthType: 'MAMEASC',
    parameters: { _program: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // ============================================
  // PCM Chips - Default presets
  // ============================================
  {
    type: 'synth',
    name: 'AICA Default',
    synthType: 'MAMEAICA',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SCSP Default',
    synthType: 'SCSP',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'C352 Default',
    synthType: 'MAMEC352',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'RF5C400 Default',
    synthType: 'MAMERF5C400',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'ICS2115 Default',
    synthType: 'MAMEICS2115',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'K054539 Default',
    synthType: 'MAMEK054539',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
];
