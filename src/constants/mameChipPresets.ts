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
  // MAMEMultiPCM - Yamaha YMW258-F GEW8 28-Slot PCM
  // ROM-based sampler; load ROM to get real audio
  // ============================================
  {
    type: 'synth',
    name: 'MultiPCM Lead',
    synthType: 'MAMEMultiPCM',
    parameters: { volume: 0.8 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MultiPCM Pad',
    synthType: 'MAMEMultiPCM',
    parameters: { volume: 0.6 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MultiPCM Bass',
    synthType: 'MAMEMultiPCM',
    parameters: { volume: 0.9 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MultiPCM Strings',
    synthType: 'MAMEMultiPCM',
    parameters: { volume: 0.65 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth',
    name: 'MultiPCM Brass',
    synthType: 'MAMEMultiPCM',
    parameters: { volume: 0.75 },
    effects: [],
    volume: -9,
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
