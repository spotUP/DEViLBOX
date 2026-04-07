/**
 * klysParams.ts — Shared constants for the maximized klystrack instrument editor.
 *
 * Mirrors the C struct MusInstrument (klystrack-wasm/common/music.h:42-90) and the
 * `klys_set_instrument_param` switch in KlysWrapper.c. Both the DOM editor
 * (`KlysInstrumentEditor`) and the Pixi editor (`PixiKlysInstrumentEditor`)
 * consume these tables — single source of truth.
 */

/** WASM paramId values for `klys_set_instrument_param`. Must stay in sync with KlysWrapper.c. */
export const KLYS_PARAM_IDS = {
  'adsr.a': 0,
  'adsr.d': 1,
  'adsr.s': 2,
  'adsr.r': 3,
  flags: 4,
  cydflags: 5,
  baseNote: 6,
  finetune: 7,
  slideSpeed: 8,
  pw: 9,
  volume: 10,
  progPeriod: 11,
  vibratoSpeed: 12,
  vibratoDepth: 13,
  pwmSpeed: 14,
  pwmDepth: 15,
  cutoff: 16,
  resonance: 17,
  flttype: 18,
  fxBus: 19,
  buzzOffset: 20,
  ringMod: 21,
  syncSource: 22,
  wavetableEntry: 23,
  'fm.modulation': 24,
  'fm.feedback': 25,
  'fm.harmonic': 26,
  'fm.adsr.a': 27,
  'fm.adsr.d': 28,
  'fm.adsr.s': 29,
  'fm.adsr.r': 30,
  // MAXIMIZED — extended fields
  ymEnvShape: 31,
  vibShape: 32,
  vibDelay: 33,
  pwmShape: 34,
  lfsrType: 35,
  'fm.flags': 36,
  'fm.wave': 37,
  'fm.attackStart': 38,
} as const;

export type KlysParamKey = keyof typeof KLYS_PARAM_IDS;

/** MUS_INST_* flag bits — see klystrack-wasm/common/music.h lines 75-90. */
export interface BitfieldDef {
  bit: number;       // bit value (e.g. 1, 2, 4, 8, 16)
  label: string;     // human readable
  desc?: string;     // optional tooltip
}

export const MUS_INST_FLAGS: BitfieldDef[] = [
  { bit: 1,    label: 'Prog Speed Abs',     desc: 'Program speed in absolute ticks (vs relative to song speed)' },
  { bit: 2,    label: 'Drum',               desc: 'Drum mode — note maps to wavetable entry' },
  { bit: 4,    label: 'Invert Vibrato',     desc: 'Invert vibrato bit polarity' },
  { bit: 8,    label: 'Lock Note',          desc: 'Ignore note value, always play base note' },
  { bit: 16,   label: 'Set Pulse Width',    desc: 'Override channel PW with instrument PW on trigger' },
  { bit: 32,   label: 'Set Cutoff',         desc: 'Override channel cutoff with instrument cutoff on trigger' },
  { bit: 64,   label: 'YM Buzz',            desc: 'Enable YM2149 buzz envelope' },
  { bit: 128,  label: 'Relative Volume',    desc: 'Volume is relative to channel volume' },
  { bit: 256,  label: 'Quarter Freq',       desc: 'Quarter-frequency mode (sub-octave)' },
  { bit: 512,  label: 'Wave Lock Note',     desc: 'Wavetable plays at locked note' },
  { bit: 1024, label: 'No Prog Restart',    desc: 'Do not restart program on retrigger' },
  { bit: 2048, label: 'Multi-Osc',          desc: 'Enable multi-oscillator mode' },
];

/** CYD_CHN_* flag bits — see klystrack-wasm/common/cyd.h lines 84-99. */
export const CYD_CHN_FLAGS: BitfieldDef[] = [
  { bit: 1,     label: 'Noise',          desc: 'Enable noise oscillator' },
  { bit: 2,     label: 'Pulse',          desc: 'Enable pulse oscillator' },
  { bit: 4,     label: 'Triangle',       desc: 'Enable triangle oscillator' },
  { bit: 8,     label: 'Saw',            desc: 'Enable sawtooth oscillator' },
  { bit: 16,    label: 'Sync',           desc: 'Enable hard sync' },
  { bit: 32,    label: 'Gate',           desc: 'Enable gate' },
  { bit: 64,    label: 'Key Sync',       desc: 'Reset oscillator phase on key' },
  { bit: 128,   label: 'Metal',          desc: 'Metallic noise mode' },
  { bit: 256,   label: 'Ring Mod',       desc: 'Enable ring modulation' },
  { bit: 512,   label: 'Filter',         desc: 'Enable filter' },
  { bit: 1024,  label: 'FX Bus',         desc: 'Route through FX bus' },
  { bit: 2048,  label: 'YM Env',         desc: 'Enable YM2149 envelope generator' },
  { bit: 4096,  label: 'Wave',           desc: 'Enable wavetable oscillator' },
  { bit: 8192,  label: 'Wave Override',  desc: 'Wavetable overrides envelope' },
  { bit: 16384, label: 'LFSR',           desc: 'Enable LFSR noise (NES-style)' },
  { bit: 32768, label: 'FM',             desc: 'Enable FM operator' },
];

/** CYD_FM_* flag bits — see klystrack-wasm/common/cyd.h lines 104-107.
 * FM enables alias the lower waveform bits of the channel flags. */
export const CYD_FM_FLAGS: BitfieldDef[] = [
  { bit: 2,    label: 'FM Pulse',     desc: 'FM modulator: pulse' },
  { bit: 4,    label: 'FM Triangle',  desc: 'FM modulator: triangle' },
  { bit: 8,    label: 'FM Saw',       desc: 'FM modulator: sawtooth' },
  { bit: 4096, label: 'FM Wave',      desc: 'FM modulator: wavetable' },
];

/** Filter type names — flttype field. */
export const KLYS_FILTER_TYPES = ['LP', 'HP', 'BP', 'LP+HP'];

/** Vibrato/PWM shape names — MUS_SHAPE_* enum from music.h:316-324. */
export const KLYS_SHAPE_NAMES = ['Sine', 'Ramp Up', 'Ramp Dn', 'Random', 'Square'];
