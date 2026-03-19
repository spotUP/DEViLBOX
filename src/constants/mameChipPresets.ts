/**
 * MAME Chip Synth Factory Presets
 * Hardware-accurate presets for MAME-emulated sound chips.
 * Uses _program parameter for built-in WASM preset selection.
 */

import type { InstrumentPreset } from '@typedefs/instrument';

export const MAME_CHIP_PRESETS: InstrumentPreset['config'][] = [
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
  // MEA8000 - Philips 4-Formant LPC Speech
  // ============================================
  {
    type: 'synth',
    name: 'MEA Choir Pad',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 0, mode: 1, sing_mode: 1, volume: 0.85, speechText: 'AAAH' },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MEA Robot Voice',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 1, mode: 1, sing_mode: 0, volume: 0.9, speechText: 'I AM A ROBOT' },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MEA Bright Vowel',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 1, mode: 0, volume: 0.8, noise_mode: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MEA Nasal Drone',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 5, mode: 0, volume: 0.7, f1_index: 4, f2_index: 2, bw_index: 2 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MEA Whisper Noise',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 7, mode: 0, volume: 0.6, noise_mode: 1 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MEA Wide Formant',
    synthType: 'MAMEMEA8000',
    parameters: { _program: 3, mode: 0, volume: 0.85, f1_index: 2, f2_index: 6, bw_index: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // SP0250 - GI LPC Speech (Q*bert era)
  // ============================================
  {
    type: 'synth',
    name: 'SP0 Singing AH',
    synthType: 'MAMESP0250',
    parameters: { _program: 0, mode: 1, sing_mode: 1, volume: 0.85, vowel: 0, voiced: 1, brightness: 0.5, speechText: 'AAAH' },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SP0 Robot Talk',
    synthType: 'MAMESP0250',
    parameters: { _program: 0, mode: 1, sing_mode: 0, volume: 0.9, brightness: 0.6, speechText: 'HELLO WORLD' },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SP0 Bright EE',
    synthType: 'MAMESP0250',
    parameters: { _program: 1, mode: 0, volume: 0.8, vowel: 1, voiced: 1, brightness: 0.9, stereo_width: 0.6 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SP0 Dark OO',
    synthType: 'MAMESP0250',
    parameters: { _program: 4, mode: 0, volume: 0.8, vowel: 4, voiced: 1, brightness: 0.2, stereo_width: 0.3 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SP0 Buzz Noise',
    synthType: 'MAMESP0250',
    parameters: { _program: 6, mode: 0, volume: 0.7, vowel: 6, voiced: 0, brightness: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SP0 Nasal Hum',
    synthType: 'MAMESP0250',
    parameters: { _program: 5, mode: 0, volume: 0.75, vowel: 5, voiced: 1, brightness: 0.3, stereo_width: 0.5 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // VOTRAX SC-01 - 64-Phoneme Formant Speech
  // ============================================
  {
    type: 'synth',
    name: 'Votrax Singing',
    synthType: 'MAMEVotrax',
    parameters: { _program: 0, mode: 1, sing_mode: 1, volume: 0.85, speechText: 'OOOH AAAH' },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Votrax Q*bert',
    synthType: 'MAMEVotrax',
    parameters: { _program: 0, mode: 1, sing_mode: 0, volume: 0.9, speechText: 'HELLO I AM QBERT' },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Votrax Phoneme EH',
    synthType: 'MAMEVotrax',
    parameters: { _program: 0, mode: 0, volume: 0.8, phoneme: 7, inflection: 0 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Votrax Rising OO',
    synthType: 'MAMEVotrax',
    parameters: { _program: 3, mode: 0, volume: 0.8, phoneme: 22, inflection: 1 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Votrax Emphasis',
    synthType: 'MAMEVotrax',
    parameters: { _program: 2, mode: 0, volume: 0.85, phoneme: 10, inflection: 3 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Votrax Wide Stereo',
    synthType: 'MAMEVotrax',
    parameters: { _program: 1, mode: 0, volume: 0.8, phoneme: 15, inflection: 2, stereo_width: 0.9 },
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
  // UPD931 - NEC Speech/Keyboard Voice
  // ============================================
  {
    type: 'synth',
    name: 'uPD931 Speech',
    synthType: 'MAMEUPD931',
    parameters: { _program: 0, mode: 1, sing_mode: 1, volume: 0.85, speechText: 'HELLO' },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'uPD931 Robot',
    synthType: 'MAMEUPD931',
    parameters: { _program: 0, mode: 1, sing_mode: 0, volume: 0.9, speechText: 'I AM A MACHINE' },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'uPD931 Tone',
    synthType: 'MAMEUPD931',
    parameters: { _program: 2, mode: 0, volume: 0.8 },
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
    name: 'TMS Spell It',
    synthType: 'MAMETMS5220',
    parameters: { _program: 0, mode: 1, sing_mode: 1, volume: 0.85, speechText: 'SPELL IT' },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'TMS Robot Voice',
    synthType: 'MAMETMS5220',
    parameters: { _program: 0, mode: 1, sing_mode: 0, volume: 0.9, speechText: 'THAT IS CORRECT' },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'TMS Bright Chirp',
    synthType: 'MAMETMS5220',
    parameters: { _program: 0, mode: 0, volume: 0.8, chirp_type: 0, k1_index: 25, k2_index: 20, energy_index: 12, pitch_index: 40 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'TMS Deep Drone',
    synthType: 'MAMETMS5220',
    parameters: { _program: 3, mode: 0, volume: 0.8, chirp_type: 1, k1_index: 8, k2_index: 5, energy_index: 14, pitch_index: 55 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'TMS TI99 Mode',
    synthType: 'MAMETMS5220',
    parameters: { _program: 0, mode: 0, volume: 0.85, chirp_type: 2, energy_index: 10, pitch_index: 32, stereo_width: 0.5 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'TMS Whisper',
    synthType: 'MAMETMS5220',
    parameters: { _program: 7, mode: 0, volume: 0.6, energy_index: 5, pitch_index: 0, brightness: 0.3 },
    effects: [],
    volume: -6,
    pan: 0,
  },

  // ============================================
  // S14001A - SSi TSI Berzerk Speech (Delta Mod)
  // ============================================
  {
    type: 'synth',
    name: 'S14 Berzerk Talk',
    synthType: 'MAMES14001A',
    parameters: { _program: 0, mode: 1, sing_mode: 0, volume: 0.9, speechText: 'INTRUDER ALERT' },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'S14 Singing',
    synthType: 'MAMES14001A',
    parameters: { _program: 0, mode: 1, sing_mode: 1, volume: 0.85, speechText: 'AAAH OOOH' },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'S14 Open AH',
    synthType: 'MAMES14001A',
    parameters: { _program: 0, mode: 0, preset: 0, voiced: 1, brightness: 0.5, delta_depth: 1.0, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'S14 Bright EE',
    synthType: 'MAMES14001A',
    parameters: { _program: 1, mode: 0, preset: 1, voiced: 1, brightness: 0.9, delta_depth: 1.0, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'S14 Deep OO',
    synthType: 'MAMES14001A',
    parameters: { _program: 4, mode: 0, preset: 4, voiced: 1, brightness: 0.2, delta_depth: 0.8, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'S14 Soft Delta',
    synthType: 'MAMES14001A',
    parameters: { _program: 0, mode: 0, preset: 0, voiced: 1, brightness: 0.3, delta_depth: 0.4, volume: 0.7, stereo_width: 0.6 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'S14 Noise Burst',
    synthType: 'MAMES14001A',
    parameters: { _program: 6, mode: 0, preset: 6, voiced: 0, brightness: 0.8, delta_depth: 1.0, volume: 0.7 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'S14 Wide Stereo',
    synthType: 'MAMES14001A',
    parameters: { _program: 3, mode: 0, preset: 3, voiced: 1, brightness: 0.5, delta_depth: 0.9, stereo_width: 1.0, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // VLM5030 - Sanyo Konami LPC Speech
  // ============================================
  {
    type: 'synth',
    name: 'VLM Konami Talk',
    synthType: 'MAMEVLM5030',
    parameters: { _program: 0, mode: 1, sing_mode: 0, volume: 0.9, speechText: 'READY SET GO' },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VLM Singing',
    synthType: 'MAMEVLM5030',
    parameters: { _program: 0, mode: 1, sing_mode: 1, volume: 0.85, speechText: 'LA LA LA' },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VLM Open AH',
    synthType: 'MAMEVLM5030',
    parameters: { _program: 0, mode: 0, vowel: 0, voiced: 1, brightness: 0.5, formant_shift: 0, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VLM High Formant',
    synthType: 'MAMEVLM5030',
    parameters: { _program: 1, mode: 0, vowel: 1, voiced: 1, brightness: 0.8, formant_shift: 0.5, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VLM Low Formant',
    synthType: 'MAMEVLM5030',
    parameters: { _program: 4, mode: 0, vowel: 4, voiced: 1, brightness: 0.3, formant_shift: -0.5, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VLM Nasal',
    synthType: 'MAMEVLM5030',
    parameters: { _program: 5, mode: 0, vowel: 5, voiced: 1, brightness: 0.4, formant_shift: 0.2, stereo_width: 0.5, volume: 0.75 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VLM Hiss',
    synthType: 'MAMEVLM5030',
    parameters: { _program: 6, mode: 0, vowel: 6, voiced: 0, brightness: 0.9, volume: 0.65 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'VLM Breathy Wide',
    synthType: 'MAMEVLM5030',
    parameters: { _program: 7, mode: 0, vowel: 7, voiced: 0, brightness: 0.4, formant_shift: -0.3, stereo_width: 0.8, volume: 0.6 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // HC55516 - Harris CVSD (Williams/Bally)
  // ============================================
  {
    type: 'synth',
    name: 'HC5 Sinistar',
    synthType: 'MAMEHC55516',
    parameters: { _program: 0, mode: 1, sing_mode: 0, volume: 0.9, speechText: 'I HUNGER', grittiness: 0.9 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'HC5 Singing',
    synthType: 'MAMEHC55516',
    parameters: { _program: 0, mode: 1, sing_mode: 1, volume: 0.85, speechText: 'RUN COWARD', grittiness: 0.7 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'HC5 Clean AH',
    synthType: 'MAMEHC55516',
    parameters: { _program: 0, mode: 0, preset: 0, voiced: 1, brightness: 0.5, grittiness: 0.5, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'HC5 Gritty EE',
    synthType: 'MAMEHC55516',
    parameters: { _program: 1, mode: 0, preset: 1, voiced: 1, brightness: 0.8, grittiness: 1.0, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'HC5 Deep OO',
    synthType: 'MAMEHC55516',
    parameters: { _program: 4, mode: 0, preset: 4, voiced: 1, brightness: 0.2, grittiness: 0.8, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'HC5 Lo-Fi Nasal',
    synthType: 'MAMEHC55516',
    parameters: { _program: 5, mode: 0, preset: 5, voiced: 1, brightness: 0.4, grittiness: 0.6, stereo_width: 0.5, volume: 0.75 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'HC5 Static Noise',
    synthType: 'MAMEHC55516',
    parameters: { _program: 6, mode: 0, preset: 6, voiced: 0, brightness: 0.9, grittiness: 1.0, volume: 0.7 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'HC5 Smooth Low',
    synthType: 'MAMEHC55516',
    parameters: { _program: 3, mode: 0, preset: 3, voiced: 1, brightness: 0.3, grittiness: 0.3, stereo_width: 0.7, volume: 0.7 },
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

  // ============================================
  // CEM3394 - Curtis Electromusic Analog Voice
  // ============================================
  {
    type: 'synth',
    name: 'CEM3394 Bass',
    synthType: 'CEM3394',
    parameters: { _program: 0, volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'CEM3394 Lead',
    synthType: 'CEM3394',
    parameters: { _program: 1, volume: 0.8 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'CEM3394 Pad',
    synthType: 'CEM3394',
    parameters: { _program: 2, volume: 0.8 },
    effects: [],
    volume: -12,
    pan: 0,
  },

  // ============================================
  // SCSP - Sega Saturn 32-voice sound processor
  // ============================================
  {
    type: 'synth',
    name: 'SCSP Synth Bass',
    synthType: 'SCSP',
    parameters: { _program: 0, volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SCSP Poly Pad',
    synthType: 'SCSP',
    parameters: { _program: 1, volume: 0.8 },
    effects: [],
    volume: -12,
    pan: 0,
  },

  // ============================================
  // MAMECMI - Fairlight CMI IIx 8-Voice Sampler
  // 8-bit offset-binary wave RAM, each voice has unique waveform
  // ============================================
  {
    type: 'synth',
    name: 'CMI Sine Voice',
    synthType: 'MAMECMI',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'CMI Sawtooth Lead',
    synthType: 'MAMECMI',
    parameters: { volume: 0.7 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'CMI Square Bass',
    synthType: 'MAMECMI',
    parameters: { volume: 0.6 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'CMI Organ',
    synthType: 'MAMECMI',
    parameters: { volume: 0.75 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'CMI Soft Square',
    synthType: 'MAMECMI',
    parameters: { volume: 0.65 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'CMI Harmonic Pad',
    synthType: 'MAMECMI',
    parameters: { volume: 0.55 },
    effects: [],
    volume: -12,
    pan: 0,
  },

  // ============================================
  // MAMEFZPCM - Casio FZ-1 8-Voice 16-bit Sampler
  // Shared 2MB wave RAM; each voice has a distinct waveform
  // ============================================
  {
    type: 'synth',
    name: 'FZ Sine Tone',
    synthType: 'MAMEFZPCM',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'FZ Sawtooth Lead',
    synthType: 'MAMEFZPCM',
    parameters: { volume: 0.7 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'FZ Square Buzz',
    synthType: 'MAMEFZPCM',
    parameters: { volume: 0.65 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'FZ Triangle Bass',
    synthType: 'MAMEFZPCM',
    parameters: { volume: 0.75 },
    effects: [],
    volume: -9,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'FZ Organ Stack',
    synthType: 'MAMEFZPCM',
    parameters: { volume: 0.7 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'FZ Pulse 25%',
    synthType: 'MAMEFZPCM',
    parameters: { volume: 0.6 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'FZ Soft Clip Lead',
    synthType: 'MAMEFZPCM',
    parameters: { volume: 0.7 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'FZ Rich Harmonic',
    synthType: 'MAMEFZPCM',
    parameters: { volume: 0.65 },
    effects: [],
    volume: -12,
    pan: 0,
  },

  // ============================================
  // MAMEPS1SPU - PlayStation 1 SPU 24-Voice ADPCM
  // ADSR envelopes; fallback sine until ADPCM loaded
  // ============================================
  {
    type: 'synth',
    name: 'PS1 SPU Lead',
    synthType: 'MAMEPS1SPU',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'PS1 SPU Pad',
    synthType: 'MAMEPS1SPU',
    parameters: { volume: 0.6 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'PS1 SPU Bass',
    synthType: 'MAMEPS1SPU',
    parameters: { volume: 0.9 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'PS1 SPU Pluck',
    synthType: 'MAMEPS1SPU',
    parameters: { volume: 0.75 },
    effects: [],
    volume: -9,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'PS1 SPU Strings',
    synthType: 'MAMEPS1SPU',
    parameters: { volume: 0.55 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'PS1 SPU Choir',
    synthType: 'MAMEPS1SPU',
    parameters: { volume: 0.5 },
    effects: [],
    volume: -14,
    pan: 0,
  },

  // ============================================
  // MAMEZSG2 - ZOOM ZSG-2 48-Channel ROM PCM
  // ADPCM 2:1 compressed; 32552Hz native rate
  // ============================================
  {
    type: 'synth',
    name: 'ZSG-2 Lead',
    synthType: 'MAMEZSG2',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'ZSG-2 Pad',
    synthType: 'MAMEZSG2',
    parameters: { volume: 0.6 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'ZSG-2 Bass',
    synthType: 'MAMEZSG2',
    parameters: { volume: 0.9 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'ZSG-2 Pluck',
    synthType: 'MAMEZSG2',
    parameters: { volume: 0.75 },
    effects: [],
    volume: -9,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'ZSG-2 FX Tone',
    synthType: 'MAMEZSG2',
    parameters: { volume: 0.7 },
    effects: [],
    volume: -10,
    pan: 0,
  },

  // ============================================
  // MAMEKS0164 - Samsung KS0164 32-Voice Wavetable GM
  // Roland SC-88 Pro compatible; 8-bit decode table
  // ============================================
  {
    type: 'synth',
    name: 'KS0164 GM Piano',
    synthType: 'MAMEKS0164',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'KS0164 GM Strings',
    synthType: 'MAMEKS0164',
    parameters: { volume: 0.65 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'KS0164 GM Bass',
    synthType: 'MAMEKS0164',
    parameters: { volume: 0.85 },
    effects: [],
    volume: -7,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'KS0164 GM Pad',
    synthType: 'MAMEKS0164',
    parameters: { volume: 0.55 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'KS0164 GM Lead',
    synthType: 'MAMEKS0164',
    parameters: { volume: 0.75 },
    effects: [],
    volume: -9,
    pan: 0,
  },

  // ============================================
  // MAMESWP00 - Yamaha SWP00 AWM2 32-Voice (MU50/XG)
  // Chamberlin SVF + LFO; full AWM2 streaming
  // ============================================
  {
    type: 'synth',
    name: 'SWP00 XG Piano',
    synthType: 'MAMESWP00',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SWP00 XG Strings',
    synthType: 'MAMESWP00',
    parameters: { volume: 0.65 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SWP00 XG Bass',
    synthType: 'MAMESWP00',
    parameters: { volume: 0.9 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SWP00 XG Pad',
    synthType: 'MAMESWP00',
    parameters: { volume: 0.55 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SWP00 XG Lead',
    synthType: 'MAMESWP00',
    parameters: { volume: 0.75 },
    effects: [],
    volume: -9,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SWP00 XG Brass',
    synthType: 'MAMESWP00',
    parameters: { volume: 0.7 },
    effects: [],
    volume: -9,
    pan: 0,
  },

  // ============================================
  // MAMESWP20 - Yamaha SWP20 AWM2 32-Voice (MU50/MU80)
  // Same AWM2 family as SWP00; MAME stub implementation
  // ============================================
  {
    type: 'synth',
    name: 'SWP20 Piano',
    synthType: 'MAMESWP20',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SWP20 Strings',
    synthType: 'MAMESWP20',
    parameters: { volume: 0.65 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SWP20 Bass',
    synthType: 'MAMESWP20',
    parameters: { volume: 0.9 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SWP20 Pad',
    synthType: 'MAMESWP20',
    parameters: { volume: 0.55 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'SWP20 Lead',
    synthType: 'MAMESWP20',
    parameters: { volume: 0.75 },
    effects: [],
    volume: -9,
    pan: 0,
  },

  // ============================================
  // MAMERolandGP - Roland TC6116 28-Channel PCM
  // SC-88 / JV-XP series; dual volume envelopes + filter
  // ============================================
  {
    type: 'synth',
    name: 'Roland GP Piano',
    synthType: 'MAMERolandGP',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Roland GP Strings',
    synthType: 'MAMERolandGP',
    parameters: { volume: 0.65 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Roland GP Bass',
    synthType: 'MAMERolandGP',
    parameters: { volume: 0.9 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Roland GP Pad',
    synthType: 'MAMERolandGP',
    parameters: { volume: 0.5 },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Roland GP Choir',
    synthType: 'MAMERolandGP',
    parameters: { volume: 0.6 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'Roland GP Lead',
    synthType: 'MAMERolandGP',
    parameters: { volume: 0.75 },
    effects: [],
    volume: -9,
    pan: 0,
  },

];
