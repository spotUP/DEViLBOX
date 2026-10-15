/**
 * klysInstrumentFields.ts - the ONE table of klystrack instrument fields.
 *
 * Mirrors the C struct MusInstrument (klystrack-wasm/common/music.h) and the `klys_set_instrument_param` switch
 * in KlysWrapper.c. The instrument editor, the MIDI/NKS parameter map, KlysSynth and the edit module all read
 * this table: ranges are the ORIGINAL editor's clamps (klystrack src/event.c instrument_add_param), not the C
 * types, because the wrapper setters do not clamp.
 *
 * Instrument index = InstrumentConfig.id - 1 (the parser's own numbering): klysInstrumentIndex / klysInstrumentId.
 */
import type { KlysNativeInstrument } from '@/types/tracker';
import { NKSSection } from '@/midi/performance/types';

/** WASM paramId values for `klys_set_instrument_param`. Must stay in sync with KlysWrapper.c. */
export const KLYS_PARAM_IDS = {
  'adsr.a': 0, 'adsr.d': 1, 'adsr.s': 2, 'adsr.r': 3,
  flags: 4, cydflags: 5, baseNote: 6, finetune: 7, slideSpeed: 8, pw: 9, volume: 10, progPeriod: 11,
  vibratoSpeed: 12, vibratoDepth: 13, pwmSpeed: 14, pwmDepth: 15, cutoff: 16, resonance: 17, flttype: 18,
  fxBus: 19, buzzOffset: 20, ringMod: 21, syncSource: 22, wavetableEntry: 23,
  'fm.modulation': 24, 'fm.feedback': 25, 'fm.harmonic': 26,
  'fm.adsr.a': 27, 'fm.adsr.d': 28, 'fm.adsr.s': 29, 'fm.adsr.r': 30,
  ymEnvShape: 31, vibShape: 32, vibDelay: 33, pwmShape: 34, lfsrType: 35,
  'fm.flags': 36, 'fm.wave': 37, 'fm.attackStart': 38,
} as const;

/** One scalar member of the instrument as the wrapper sees it (a paramId). */
export type KlysMemberKey = keyof typeof KLYS_PARAM_IDS;

export const KLYS_EMPTY_STEP = 0xFFFE;
export const KLYS_PROGRAM_LENGTH = 32;
export const KLYS_NAME_LENGTH = 32;

/** Instrument index (what the engine and `klysNative.instruments` use) of an InstrumentConfig id. */
export const klysInstrumentIndex = (id: number): number => id - 1;

/**
 * The klystrack note number (C-0 = 0, 0..95, the grid's own naming: klysAdapter noteToString) that carries the same
 * note name as a MIDI note: MIDI 60 (C4) is klystrack 48, which the grid prints as C-4.
 */
export const klysNoteFromMidi = (midi: number): number => Math.max(0, Math.min(95, Math.round(midi) - 12));
/** InstrumentConfig id of an instrument index. */
/** The instrument index the engine's voice and program reports give the standalone preview copy (KlysWrapper.c). */
export const KLYS_PREVIEW_INSTRUMENT_INDEX = 0xfe;

export const klysInstrumentId = (index: number): number => index + 1;

type Inst = KlysNativeInstrument;
type Patch = Partial<Inst>;
interface Raw { get(i: Inst): number; patch(i: Inst, v: number): Patch }

const top = (k: keyof Inst & string): Raw => ({
  get: (i) => i[k] as number,
  patch: (_i, v) => ({ [k]: v } as Patch),
});
const adsr = (k: 'a' | 'd' | 's' | 'r'): Raw => ({
  get: (i) => i.adsr[k],
  patch: (i, v) => ({ adsr: { ...i.adsr, [k]: v } }),
});
const fm = (k: 'flags' | 'modulation' | 'feedback' | 'wave' | 'harmonic' | 'attackStart'): Raw => ({
  get: (i) => i.fm[k],
  patch: (i, v) => ({ fm: { ...i.fm, [k]: v } }),
});
const fmAdsr = (k: 'a' | 'd' | 's' | 'r'): Raw => ({
  get: (i) => i.fm.adsr[k],
  patch: (i, v) => ({ fm: { ...i.fm, adsr: { ...i.fm.adsr, [k]: v } } }),
});

/** The stored value of every wrapper member: what is sent to the engine after an edit. */
export const KLYS_MEMBERS: Record<KlysMemberKey, Raw> = {
  'adsr.a': adsr('a'), 'adsr.d': adsr('d'), 'adsr.s': adsr('s'), 'adsr.r': adsr('r'),
  flags: top('flags'), cydflags: top('cydflags'), baseNote: top('baseNote'), finetune: top('finetune'),
  slideSpeed: top('slideSpeed'), pw: top('pw'), volume: top('volume'), progPeriod: top('progPeriod'),
  vibratoSpeed: top('vibratoSpeed'), vibratoDepth: top('vibratoDepth'), pwmSpeed: top('pwmSpeed'),
  pwmDepth: top('pwmDepth'), cutoff: top('cutoff'), resonance: top('resonance'), flttype: top('flttype'),
  fxBus: top('fxBus'), buzzOffset: top('buzzOffset'), ringMod: top('ringMod'), syncSource: top('syncSource'),
  wavetableEntry: top('wavetableEntry'),
  'fm.modulation': fm('modulation'), 'fm.feedback': fm('feedback'), 'fm.harmonic': fm('harmonic'),
  'fm.adsr.a': fmAdsr('a'), 'fm.adsr.d': fmAdsr('d'), 'fm.adsr.s': fmAdsr('s'), 'fm.adsr.r': fmAdsr('r'),
  ymEnvShape: top('ymEnvShape'), vibShape: top('vibShape'), vibDelay: top('vibDelay'), pwmShape: top('pwmShape'),
  lfsrType: top('lfsrType'), 'fm.flags': fm('flags'), 'fm.wave': fm('wave'), 'fm.attackStart': fm('attackStart'),
};

/** Where a continuous field appears on the NKS / MIDI parameter pages. */
export interface KlysNksMeta {
  name: string;
  section: NKSSection;
  defaultValue: number;
  page: number;
  index: number;
  accessibilityName: string;
}

export interface KlysField {
  /** The wrapper member this field is stored in (and sent to the engine as). */
  member: KlysMemberKey;
  /** `klys_set_instrument_param` id of `member`. */
  paramId: number;
  min: number;
  max: number;
  label: string;
  group: string;
  /** MIDI/NKS id suffix: the parameter id is `klystrack.<nksId>`. Continuous fields only. */
  nksId?: string;
  nks?: KlysNksMeta;
  /** Clamp to the original editor's range (default: round and clamp to min..max). */
  clamp(v: number): number;
  get(inst: Inst): number;
  /** The patch that stores `v` (already clamped) in `inst`. */
  set(inst: Inst, v: number): Patch;
}

interface FieldMeta {
  min: number; max: number; label: string; group: string;
  nksId?: string; nks?: KlysNksMeta; clamp?: (v: number) => number;
}

const rangeClamp = (min: number, max: number) => (v: number): number =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));

function direct(member: KlysMemberKey, meta: FieldMeta): KlysField {
  const raw = KLYS_MEMBERS[member];
  return { ...meta, member, paramId: KLYS_PARAM_IDS[member], clamp: meta.clamp ?? rangeClamp(meta.min, meta.max), get: raw.get, set: raw.patch };
}

/** A field stored as part of a packed member (buzz offset bytes, FM multiplier nibbles). */
function packed(member: KlysMemberKey, meta: FieldMeta, get: (raw: number) => number, put: (raw: number, v: number) => number): KlysField {
  const raw = KLYS_MEMBERS[member];
  return {
    ...meta, member, paramId: KLYS_PARAM_IDS[member], clamp: meta.clamp ?? rangeClamp(meta.min, meta.max),
    get: (i) => get(raw.get(i)),
    set: (i, v) => raw.patch(i, put(raw.get(i), v)),
  };
}

const nks = (name: string, section: NKSSection, defaultValue: number, page: number, index: number, accessibilityName: string): KlysNksMeta =>
  ({ name, section, defaultValue, page, index, accessibilityName });

/** A channel selector: 0xFF = the instrument's own channel, else a channel 0-31. */
const channelClamp = (v: number): number => (Math.round(v) === 0xFF ? 0xFF : rangeClamp(0, 31)(v));

const int8 = (v: number): number => ((v & 0xFF) << 24) >> 24;
const int16 = (v: number): number => ((v & 0xFFFF) << 16) >> 16;

export const KLYS_FIELDS = {
  baseNote: direct('baseNote', { min: 0, max: 95, label: 'Base Note', group: 'Pitch', nksId: 'baseNote',
    nks: nks('Base Note', NKSSection.SYNTHESIS, 0.5, 2, 0, 'Base Note') }),
  finetune: direct('finetune', { min: -128, max: 127, label: 'Fine Tune', group: 'Pitch', nksId: 'finetune',
    nks: nks('Fine Tune', NKSSection.SYNTHESIS, 0, 0, 6, 'Fine Tuning') }),
  slideSpeed: direct('slideSpeed', { min: 0, max: 255, label: 'Slide Speed', group: 'Pitch', nksId: 'slideSpeed',
    nks: nks('Slide Spd', NKSSection.SYNTHESIS, 0, 0, 7, 'Slide Speed') }),
  pulseWidth: direct('pw', { min: 0, max: 2047, label: 'Pulse Width', group: 'Oscillator', nksId: 'pulseWidth',
    nks: nks('Pulse Width', NKSSection.SYNTHESIS, 0.5, 0, 5, 'Pulse Width') }),
  pokeyNoiseType: direct('lfsrType', { min: 0, max: 15, label: 'POKEY Noise Type', group: 'Oscillator' }),
  wavetableEntry: direct('wavetableEntry', { min: 0, max: 127, label: 'Wavetable Entry', group: 'Wavetable' }),
  volume: direct('volume', { min: 0, max: 255, label: 'Volume', group: 'Volume', nksId: 'volume',
    nks: nks('Volume', NKSSection.OUTPUT, 0.7, 0, 4, 'Instrument Volume') }),
  attack: direct('adsr.a', { min: 0, max: 63, label: 'Attack', group: 'Volume', nksId: 'attack',
    nks: nks('Attack', NKSSection.ENVELOPE, 0.1, 0, 0, 'Envelope Attack') }),
  decay: direct('adsr.d', { min: 0, max: 63, label: 'Decay', group: 'Volume', nksId: 'decay',
    nks: nks('Decay', NKSSection.ENVELOPE, 0.3, 0, 1, 'Envelope Decay') }),
  sustain: direct('adsr.s', { min: 0, max: 31, label: 'Sustain', group: 'Volume', nksId: 'sustain',
    nks: nks('Sustain', NKSSection.ENVELOPE, 0.5, 0, 2, 'Envelope Sustain') }),
  release: direct('adsr.r', { min: 0, max: 63, label: 'Release', group: 'Volume', nksId: 'release',
    nks: nks('Release', NKSSection.ENVELOPE, 0.2, 0, 3, 'Envelope Release') }),
  buzzSemitones: packed('buzzOffset', { min: -99, max: 99, label: 'Buzz Semitones', group: 'Buzz', nksId: 'buzzSemitones',
    nks: nks('Buzz Semi', NKSSection.SYNTHESIS, 0.5, 2, 1, 'Buzz Semitones') },
    (r) => int8(r >> 8), (r, v) => int16(((v & 0xFF) << 8) | (r & 0xFF))),
  buzzFine: packed('buzzOffset', { min: -128, max: 127, label: 'Buzz Fine Tune', group: 'Buzz', nksId: 'buzzFine',
    nks: nks('Buzz Fine', NKSSection.SYNTHESIS, 0.5, 2, 2, 'Buzz Fine Tune') },
    (r) => int8(r), (r, v) => int16((r & 0xFF00) | (v & 0xFF))),
  buzzShape: direct('ymEnvShape', { min: 0, max: 3, label: 'Buzz Shape', group: 'Buzz' }),
  syncSource: direct('syncSource', { min: 0, max: 255, label: 'Sync Source', group: 'Sync and Ring', clamp: channelClamp }),
  ringSource: direct('ringMod', { min: 0, max: 255, label: 'Ring Source', group: 'Sync and Ring', clamp: channelClamp }),
  filterType: direct('flttype', { min: 0, max: 2, label: 'Filter Type', group: 'Filter' }),
  cutoff: direct('cutoff', { min: 0, max: 2047, label: 'Cutoff', group: 'Filter', nksId: 'cutoff',
    nks: nks('Filter Cut', NKSSection.FILTER, 1, 1, 0, 'Filter Cutoff') }),
  resonance: direct('resonance', { min: 0, max: 3, label: 'Resonance', group: 'Filter', nksId: 'resonance',
    nks: nks('Filter Res', NKSSection.FILTER, 0, 1, 1, 'Filter Resonance') }),
  effectsBus: direct('fxBus', { min: 0, max: 7, label: 'Effects Bus', group: 'Effects' }),
  vibratoSpeed: direct('vibratoSpeed', { min: 0, max: 255, label: 'Vibrato Speed', group: 'Vibrato', nksId: 'vibratoSpeed',
    nks: nks('Vib Speed', NKSSection.LFO, 0, 1, 2, 'Vibrato Speed') }),
  vibratoDepth: direct('vibratoDepth', { min: 0, max: 255, label: 'Vibrato Depth', group: 'Vibrato', nksId: 'vibratoDepth',
    nks: nks('Vib Depth', NKSSection.LFO, 0, 1, 3, 'Vibrato Depth') }),
  vibratoDelay: direct('vibDelay', { min: 0, max: 255, label: 'Vibrato Delay', group: 'Vibrato', nksId: 'vibratoDelay',
    nks: nks('Vib Delay', NKSSection.LFO, 0, 2, 3, 'Vibrato Delay') }),
  vibratoShape: direct('vibShape', { min: 0, max: 4, label: 'Vibrato Shape', group: 'Vibrato' }),
  pwmSpeed: direct('pwmSpeed', { min: 0, max: 255, label: 'Pulse Width Modulation Speed', group: 'Pulse Width Modulation', nksId: 'pwmSpeed',
    nks: nks('PWM Speed', NKSSection.LFO, 0, 1, 4, 'PWM Modulation Speed') }),
  pwmDepth: direct('pwmDepth', { min: 0, max: 255, label: 'Pulse Width Modulation Depth', group: 'Pulse Width Modulation', nksId: 'pwmDepth',
    nks: nks('PWM Depth', NKSSection.LFO, 0, 1, 5, 'PWM Modulation Depth') }),
  pwmShape: direct('pwmShape', { min: 0, max: 4, label: 'Pulse Width Modulation Shape', group: 'Pulse Width Modulation' }),
  programPeriod: direct('progPeriod', { min: 0, max: 255, label: 'Program Period', group: 'Program', nksId: 'programPeriod',
    nks: nks('Prog Period', NKSSection.SEQUENCER, 0, 2, 4, 'Program Period') }),
  fmMod: direct('fm.modulation', { min: 0, max: 127, label: 'Modulator Volume', group: 'Frequency Modulation', nksId: 'fmMod',
    nks: nks('FM Mod', NKSSection.SYNTHESIS, 0, 1, 6, 'FM Modulation Depth') }),
  fmFeedback: direct('fm.feedback', { min: 0, max: 7, label: 'Feedback', group: 'Frequency Modulation', nksId: 'fmFeedback',
    nks: nks('FM Fdbk', NKSSection.SYNTHESIS, 0, 1, 7, 'FM Feedback Amount') }),
  fmCarrierMultiplier: packed('fm.harmonic', { min: 0, max: 15, label: 'Carrier Multiplier', group: 'Frequency Modulation', nksId: 'fmCarrierMultiplier',
    nks: nks('FM Carrier', NKSSection.SYNTHESIS, 0, 2, 5, 'FM Carrier Multiplier') },
    (r) => (r >> 4) & 0xF, (r, v) => ((v & 0xF) << 4) | (r & 0xF)),
  fmModulatorMultiplier: packed('fm.harmonic', { min: 0, max: 15, label: 'Modulator Multiplier', group: 'Frequency Modulation', nksId: 'fmModulatorMultiplier',
    nks: nks('FM Modul', NKSSection.SYNTHESIS, 0, 2, 6, 'FM Modulator Multiplier') },
    (r) => r & 0xF, (r, v) => (r & 0xF0) | (v & 0xF)),
  fmAttack: direct('fm.adsr.a', { min: 0, max: 63, label: 'Modulator Attack', group: 'Frequency Modulation', nksId: 'fmAttack',
    nks: nks('FM Attack', NKSSection.ENVELOPE, 0, 2, 7, 'FM Envelope Attack') }),
  fmDecay: direct('fm.adsr.d', { min: 0, max: 63, label: 'Modulator Decay', group: 'Frequency Modulation', nksId: 'fmDecay',
    nks: nks('FM Decay', NKSSection.ENVELOPE, 0, 3, 0, 'FM Envelope Decay') }),
  fmSustain: direct('fm.adsr.s', { min: 0, max: 31, label: 'Modulator Sustain', group: 'Frequency Modulation', nksId: 'fmSustain',
    nks: nks('FM Sustain', NKSSection.ENVELOPE, 0, 3, 1, 'FM Envelope Sustain') }),
  fmRelease: direct('fm.adsr.r', { min: 0, max: 63, label: 'Modulator Release', group: 'Frequency Modulation', nksId: 'fmRelease',
    nks: nks('FM Release', NKSSection.ENVELOPE, 0, 3, 2, 'FM Envelope Release') }),
  fmEnvelopeStart: direct('fm.attackStart', { min: 0, max: 31, label: 'Modulator Envelope Start', group: 'Frequency Modulation', nksId: 'fmEnvelopeStart',
    nks: nks('FM Start', NKSSection.ENVELOPE, 0, 3, 3, 'FM Envelope Start Level') }),
  fmWave: direct('fm.wave', { min: 0, max: 127, label: 'Modulator Wavetable Entry', group: 'Frequency Modulation' }),
} satisfies Record<string, KlysField>;

export type KlysFieldKey = keyof typeof KLYS_FIELDS;

export const KLYS_FIELD_KEYS = Object.keys(KLYS_FIELDS) as KlysFieldKey[];

/** The field a MIDI/NKS parameter id suffix (`klystrack.<nksId>`) addresses. */
export function klysFieldByNksId(nksId: string): { key: KlysFieldKey; field: KlysField } | null {
  for (const key of KLYS_FIELD_KEYS) {
    const field: KlysField = KLYS_FIELDS[key];
    if (field.nksId === nksId) return { key, field };
  }
  return null;
}

/** A 0..1 knob value (NKS), or -1..1 for a signed field, as the field's stored value. */
export function klysFieldFromNormalized(field: KlysField, normalized: number): number {
  if (field.min < 0) return field.clamp(normalized < 0 ? normalized * -field.min : normalized * field.max);
  return field.clamp(field.min + normalized * (field.max - field.min));
}

/** Which instrument word a bit lives in. */
export type KlysFlagWord = 'flags' | 'cydflags' | 'fmFlags';

export interface KlysBitDef { bit: number; label: string; desc?: string }

/** The member (wrapper paramId) of each flag word. */
export const KLYS_FLAG_MEMBER: Record<KlysFlagWord, KlysMemberKey> = { flags: 'flags', cydflags: 'cydflags', fmFlags: 'fm.flags' };

/** The bits the original editor shows (MUS_INST_*, CYD_CHN_*, CYD_FM_*), with full labels. */
export const KLYS_FLAG_BITS: Record<KlysFlagWord, KlysBitDef[]> = {
  flags: [
    { bit: 2, label: 'Drum', desc: 'Drum mode: the note maps to a wavetable entry' },
    { bit: 4, label: 'Invert Vibrato', desc: 'Invert the vibrato polarity' },
    { bit: 8, label: 'Lock Note', desc: 'Ignore the note value and always play the base note' },
    { bit: 16, label: 'Set Pulse Width on Note', desc: 'Override the channel pulse width with the instrument pulse width on each note' },
    { bit: 32, label: 'Set Cutoff on Note', desc: 'Override the channel cutoff with the instrument cutoff on each note' },
    { bit: 64, label: 'Buzz', desc: 'Enable the YM2149 buzz envelope' },
    { bit: 128, label: 'Relative Volume', desc: 'Volume is relative to the channel volume' },
    { bit: 256, label: 'Quarter Frequency', desc: 'Quarter-frequency mode (two octaves down)' },
    { bit: 512, label: 'Wave Keeps Its Own Pitch', desc: 'The wavetable plays at its own base note' },
    { bit: 1024, label: 'No Program Restart', desc: 'The program keeps running on a new note' },
    { bit: 2048, label: 'Multiple Oscillators', desc: 'Enable multi-oscillator mode' },
  ],
  cydflags: [
    { bit: 1, label: 'Noise' },
    { bit: 2, label: 'Pulse' },
    { bit: 4, label: 'Triangle' },
    { bit: 8, label: 'Saw' },
    { bit: 16, label: 'Hard Sync' },
    { bit: 64, label: 'Key Sync', desc: 'Reset the oscillator phase on each note' },
    { bit: 128, label: 'Metallic Noise' },
    { bit: 256, label: 'Ring Modulation' },
    { bit: 512, label: 'Filter' },
    { bit: 1024, label: 'Effects' },
    { bit: 4096, label: 'Wavetable' },
    { bit: 8192, label: 'Wave Overrides Envelope' },
    { bit: 16384, label: 'POKEY Noise' },
    { bit: 32768, label: 'Frequency Modulation' },
  ],
  fmFlags: [
    { bit: 4096, label: 'Modulator Wavetable' },
  ],
};

/**
 * Bits no control shows. The engine or the original editor owns them; a toggle writes `word ^ bit`, so they ride
 * along unchanged. flags 1 (program speed absolute): nothing in music.c reads it. cydflags 32 (gate) and 2048
 * (YM envelope): the engine sets them at note-on and release. fm_flags 2/4/8: no reader in cydfm.c.
 */
export const KLYS_EXEMPT_BITS: Record<KlysFlagWord, number> = { flags: 1, cydflags: 32 | 2048, fmFlags: 2 | 4 | 8 };

export const KLYS_FILTER_TYPES = ['Low Pass', 'High Pass', 'Band Pass'];
/** Vibrato and pulse width modulation shapes (MUS_SHAPE_*, music.h). */
export const KLYS_SHAPES = ['Sine', 'Ramp Up', 'Ramp Down', 'Random', 'Square'];
/** Buzz envelope shapes: bits CYD_YM_ENV_ATT = 1, CYD_YM_ENV_ALT = 2 (cyd.h). */
export const KLYS_BUZZ_SHAPES = ['Saw Down', 'Saw Up', 'Triangle Down', 'Triangle Up'];
