/**
 * UADE / Amiga Starter Instrument Presets
 *
 * Provides named starter instrument configs for each Amiga/UADE system preset.
 * These are loaded when the user picks "Preset Instruments" in the New Song Wizard.
 *
 * All values use createInstrument-compatible partial configs (name + synthType
 * + optional synth-specific sub-config).
 */

import type { DeepPartial, InstrumentConfig, SoundMonConfig, SidMonConfig, SynthType } from '@typedefs/instrument';
import { DEFAULT_SOUNDMON, DEFAULT_SIDMON } from '@typedefs/instrument';

type PresetPartial = DeepPartial<InstrumentConfig>;

/** Map system preset ID → Furnace SynthType for auto-generating starter instruments */
const PRESET_SYNTH_MAP: Record<string, SynthType> = {
  // Yamaha FM
  ymu759: 'Furnace', ym2151: 'FurnaceOPM', ym2612: 'FurnaceOPN', ym2612_ext: 'FurnaceOPN',
  ym2612_dualpcm: 'FurnaceOPN', ym2612_csm: 'FurnaceOPN',
  ym2203: 'FurnaceOPN', ym2203_ext: 'FurnaceOPN',
  ym2608: 'FurnaceOPNA', ym2610_full: 'FurnaceOPNB', ym2610b: 'FurnaceOPNB',
  opz: 'FurnaceOPZ',
  // Yamaha OPL
  opl: 'FurnaceOPL', opl2: 'FurnaceOPL', opl3: 'FurnaceOPL',
  opl_drums: 'FurnaceOPL', opl2_drums: 'FurnaceOPL', opl3_drums: 'FurnaceOPL',
  opl4: 'FurnaceOPL4', opll: 'FurnaceOPLL', opll_drums: 'FurnaceOPLL',
  esfm: 'FurnaceESFM', y8950: 'FurnaceY8950', y8950_drums: 'FurnaceY8950',
  vrc7: 'FurnaceOPLL',
  // Console
  nes: 'FurnaceNES', gb: 'FurnaceGB', sms: 'FurnacePSG', pce: 'FurnacePCE',
  snes: 'FurnaceSNES', gba_dma: 'FurnaceGB', gba_minmod: 'FurnaceGB',
  nds: 'FurnaceGB', lynx: 'FurnaceLynx', swan: 'FurnaceSWAN',
  vboy: 'FurnaceVB', pokemini: 'FurnacePSG',
  // Commodore
  c64_6581: 'FurnaceSID6581', c64_8580: 'FurnaceSID8580',
  // Atari
  pokey: 'FurnacePOKEY', tia: 'FurnacePSG',
  // AY/PSG
  ay8910: 'FurnaceAY', ay8930: 'FurnaceAY',
  // Famicom Expansion
  vrc6: 'FurnaceVRC6', fds: 'FurnaceFDS', mmc5: 'FurnaceNES', n163: 'FurnaceN163',
  '5e01': 'FurnaceNES',
  // Konami
  scc: 'FurnaceSCC', 
  // Other
  dave: 'FurnacePSG', saa1099: 'FurnacePSG', pet: 'FurnacePSG', vic20: 'FurnacePSG',
  ted: 'FurnacePSG', pcspkr: 'FurnacePSG', pv1000: 'FurnacePSG',
  sm8521: 'FurnacePSG', supervision: 'FurnacePSG',
  // PCM / sample-based
  amiga: 'Sampler', segapcm: 'Sampler', qsound: 'Sampler', rf5c68: 'Sampler',
  multipcm: 'Sampler', pcm_dac: 'Sampler', c140: 'Sampler', c219: 'Sampler',
  es5506: 'Sampler', k007232: 'Sampler', k053260: 'Sampler', ga20: 'Sampler',
  msm6258: 'Sampler', msm6295: 'Sampler', ymz280b: 'Sampler', x1_010: 'Sampler',
};

/** Generate generic starter instruments for a chip preset */
function genStarter(synthType: SynthType, count: number): PresetPartial[] {
  const names = ['Lead', 'Bass', 'Chord', 'Arp', 'Pad', 'FX', 'Perc', 'Drone'];
  const result: PresetPartial[] = [];
  const n = Math.min(count, names.length);
  for (let i = 0; i < n; i++) {
    result.push(synthType === 'Sampler'
      ? { name: names[i], synthType: 'Sampler' }
      : { name: names[i], synthType });
  }
  return result;
}

/**
 * Get starter instrument presets for any system preset.
 * Returns hand-crafted presets for UADE formats, and auto-generated ones for Furnace chips.
 */
export function getInstrumentPresetsForSystem(presetId: string): PresetPartial[] {
  // Hand-crafted presets take priority
  if (UADE_INSTRUMENT_PRESETS[presetId]) return UADE_INSTRUMENT_PRESETS[presetId];
  // Auto-generate for known Furnace chips
  const synthType = PRESET_SYNTH_MAP[presetId];
  if (synthType) return genStarter(synthType, 4);
  return [];
}

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
