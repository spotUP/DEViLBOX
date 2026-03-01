/**
 * UADE / Amiga Starter Instrument Presets
 *
 * Provides named starter instrument configs for each Amiga/UADE system preset.
 * These are loaded when the user picks "Preset Instruments" in the New Song Wizard.
 *
 * All values use createInstrument-compatible partial configs (name + synthType
 * + optional synth-specific sub-config).
 */

import type { DeepPartial, InstrumentConfig, SoundMonConfig, SidMonConfig } from '@typedefs/instrument';
import { DEFAULT_SOUNDMON, DEFAULT_SIDMON } from '@typedefs/instrument';

type PresetPartial = DeepPartial<InstrumentConfig>;

/** Sampler starter — just a named empty slot */
function samp(name: string): PresetPartial {
  return { name, synthType: 'Sampler' };
}

/** SoundMon wavetable synth starter */
function sm(name: string, overrides: Partial<SoundMonConfig>): PresetPartial {
  return {
    name,
    synthType: 'SoundMonSynth',
    soundMon: { ...DEFAULT_SOUNDMON, ...overrides },
  };
}

/** SIDMon 2.0 SID-style starter */
function sid(name: string, overrides: Partial<SidMonConfig>): PresetPartial {
  return {
    name,
    synthType: 'SidMonSynth',
    sidMon: { ...DEFAULT_SIDMON, ...overrides },
  };
}

export const UADE_INSTRUMENT_PRESETS: Record<string, PresetPartial[]> = {
  // --- ProTracker / generic MOD (Sampler-based) ---
  amiga_protracker: [
    samp('Lead'),
    samp('Bass'),
    samp('Chord'),
    samp('Kick'),
    samp('Snare'),
    samp('Hi-Hat'),
  ],

  // --- TFMX 4-voice (Sampler-based) ---
  uade_tfmx: [
    samp('Lead'),
    samp('Bass'),
    samp('FX 1'),
    samp('FX 2'),
    samp('Kick'),
    samp('Perc'),
  ],

  // --- TFMX 7-voice (Sampler-based) ---
  uade_tfmx7: [
    samp('Lead'),
    samp('Bass'),
    samp('Pad'),
    samp('FX'),
    samp('Kick'),
    samp('Snare'),
    samp('Hi-Hat'),
  ],

  // --- SoundMon (wavetable + ADSR synth) ---
  // waveType: 0=square, 1=sawtooth, 2=triangle, 3=noise (SoundMon mapping)
  uade_soundmon: [
    sm('Lead',  { waveType: 1, attackVolume: 64, decayVolume: 48, sustainVolume: 48 }),
    sm('Bass',  { waveType: 0, attackVolume: 64, decayVolume: 32, sustainVolume: 32 }),
    sm('Arp',   { waveType: 1, arpSpeed: 2, arpTable: [0,3,7,0,3,7,0,3,7,0,3,7,0,3,7,0], attackVolume: 56, decayVolume: 40, sustainVolume: 40 }),
    sm('Kick',  { waveType: 3, attackVolume: 64, decayVolume: 0,  sustainVolume: 0 }),
    sm('Snare', { waveType: 3, attackVolume: 48, decayVolume: 16, sustainVolume: 0 }),
    sm('Hat',   { waveType: 3, waveSpeed: 8, attackVolume: 32, decayVolume: 0, sustainVolume: 0 }),
  ],

  // --- SIDMon 2.0 (SID-style ADSR + filter) ---
  // waveform: 0=triangle, 1=sawtooth, 2=pulse, 3=noise
  uade_sidmon2: [
    sid('Lead',  { waveform: 1, attack: 2, decay: 4,  sustain: 10, release: 4 }),
    sid('Bass',  { waveform: 2, pulseWidth: 128, attack: 0, decay: 2, sustain: 12, release: 2 }),
    sid('Arp',   { waveform: 1, attack: 0, decay: 3, sustain: 8, release: 2,
                   arpTable: [0, 4, 7, 12, 0, 0, 0, 0] }),
    sid('Perc',  { waveform: 3, attack: 0, decay: 1, sustain: 0, release: 0 }),
  ],

  // --- Future Composer (Sampler-based) ---
  uade_futurecomposer: [
    samp('Tone 1'),
    samp('Tone 2'),
    samp('Tone 3'),
    samp('Percussion'),
  ],

  // --- Jochen Hippel CoSo (Sampler-based) ---
  uade_hippelcoso: [
    samp('Lead'),
    samp('Bass'),
    samp('Arp'),
    samp('Perc'),
  ],

  // --- OctaMED 8-channel (Sampler-based) ---
  uade_octamed: [
    samp('Lead'),
    samp('Bass'),
    samp('Chord'),
    samp('Kick'),
    samp('Snare'),
    samp('Hi-Hat'),
    samp('FX'),
    samp('Pad'),
  ],
};

/** Set of Amiga/UADE preset IDs for quick membership checks */
export const AMIGA_UADE_PRESET_IDS = new Set<string>([
  'amiga_protracker',
  'uade_tfmx',
  'uade_tfmx7',
  'uade_soundmon',
  'uade_sidmon2',
  'uade_futurecomposer',
  'uade_hippelcoso',
  'uade_octamed',
]);
