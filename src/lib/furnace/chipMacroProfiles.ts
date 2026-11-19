/**
 * Per-chip macro profiles for the native-player targets.
 *
 * A profile lists only the macros the target's driver plays, with the value
 * range the driver keeps and plain-English names for enumerated values. The
 * instrument editor passes it to MacroListEditor so the editor never offers a
 * macro the exported song would drop.
 *
 * NES: FamiStudio sound engine (src/lib/export/nes/famistudioSong.ts) reads
 * four envelopes per instrument: volume, arpeggio, duty and pitch. Pitch steps
 * are clamped to +-63 period units; envelopes stop at 240 frames.
 *
 * Game Boy: hUGEDriver (src/lib/export/gb/hugeSong.ts) turns volume, arpeggio,
 * duty and the first wave value into instrument tables; pitch, pan and phase
 * reset are dropped.
 *
 * Neo Geo: nullsound via ngdevkit furtool (src/lib/export/neogeo/neoGeoCompose.ts
 * lints the same rules). FM voices play no macros at all. SSG voices play
 * volume, arpeggio, mixer, envelope shape and auto-envelope, as plain sequences
 * with one shared loop, no release, no speed. ADPCM-B keeps a one-step
 * arpeggio; ADPCM-A is for sound effects and keeps a one-step volume.
 *
 * AY (ZX Spectrum PT3 in src/lib/export/zx/pt3Song.ts, Vectrex register
 * capture): PT3 samples and ornaments carry volume, arpeggio, noise and mixer
 * per tick with loop, speed and delay but no release; envelope macros keep
 * their first value per note. Pitch only reaches the Vectrex capture.
 */
import { FurnaceMacroType, type FurnaceMacro } from '@/types/instrument/furnace';

export interface MacroRange {
  min: number;
  max: number;
  bipolar: boolean;
}

export interface ChipMacroProfile {
  /** Name per macro code; also the only codes offered by Add Macro. */
  labels: Readonly<Record<number, string>>;
  ranges: Readonly<Partial<Record<number, MacroRange>>>;
  /** Names for enumerated values, indexed by value. */
  valueNames?: Readonly<Partial<Record<number, readonly string[]>>>;
  /** Most steps the driver keeps, per macro code. */
  maxSteps?: Readonly<Partial<Record<number, number>>>;
  /** False when the driver drops release points. Default true. */
  allowRelease?: boolean;
  /** False when the driver drops macro speed. Default true. */
  allowSpeed?: boolean;
  /** One line shown above the macros: what the driver does with them. */
  note?: string;
}

/** Pulse duty cycles of the 2A03 and the Game Boy pulse channels, by duty value. */
export const PULSE_DUTY_NAMES = ['12.5%', '25%', '50%', '75%'] as const;

/** Fraction of the period the pulse is high, by duty value. */
export const PULSE_DUTY_FRACTIONS = [0.125, 0.25, 0.5, 0.75] as const;

export const NES_MACRO_PROFILE: ChipMacroProfile = {
  labels: {
    [FurnaceMacroType.VOL]: 'Volume',
    [FurnaceMacroType.ARP]: 'Arpeggio',
    [FurnaceMacroType.DUTY]: 'Duty Cycle / Noise Mode',
    [FurnaceMacroType.PITCH]: 'Pitch',
  },
  ranges: {
    [FurnaceMacroType.VOL]: { min: 0, max: 15, bipolar: false },
    [FurnaceMacroType.ARP]: { min: -24, max: 24, bipolar: true },
    [FurnaceMacroType.DUTY]: { min: 0, max: 3, bipolar: false },
    [FurnaceMacroType.PITCH]: { min: -63, max: 63, bipolar: true },
  },
  valueNames: {
    // On the noise channel only bit 0 counts: 0 long noise, 1 short (looped) noise.
    [FurnaceMacroType.DUTY]: ['12.5% (noise: long)', '25% (noise: short)', '50% (noise: long)', '75% (noise: short)'],
  },
};

export const GB_MACRO_PROFILE: ChipMacroProfile = {
  labels: {
    [FurnaceMacroType.VOL]: 'Volume',
    [FurnaceMacroType.ARP]: 'Arpeggio',
    [FurnaceMacroType.DUTY]: 'Duty Cycle / Noise Length',
    [FurnaceMacroType.WAVE]: 'Waveform',
  },
  ranges: {
    [FurnaceMacroType.VOL]: { min: 0, max: 15, bipolar: false },
    [FurnaceMacroType.ARP]: { min: -24, max: 24, bipolar: true },
    [FurnaceMacroType.DUTY]: { min: 0, max: 3, bipolar: false },
    // hUGEDriver holds 16 waves.
    [FurnaceMacroType.WAVE]: { min: 0, max: 15, bipolar: false },
  },
  valueNames: {
    [FurnaceMacroType.DUTY]: PULSE_DUTY_NAMES,
  },
};

/** AY / YM2149 / YM2610 SSG mixer macro (bit 0 tone, bit 1 noise, bit 2 envelope), by value. */
export const AY_MIXER_NAMES = [
  'Off', 'Tone', 'Noise', 'Tone + Noise',
  'Envelope', 'Tone + Envelope', 'Noise + Envelope', 'Tone + Noise + Envelope',
] as const;

/** AY register 13 envelope shapes, by value. Bits: 0 hold, 1 alternate, 2 attack, 3 continue. */
export const AY_ENVELOPE_SHAPE_NAMES = [
  'Decay, Off', 'Decay, Off', 'Decay, Off', 'Decay, Off',
  'Attack, Off', 'Attack, Off', 'Attack, Off', 'Attack, Off',
  'Saw Down', 'Decay, Off', 'Triangle Down', 'Decay, Hold High',
  'Saw Up', 'Attack, Hold High', 'Triangle Up', 'Attack, Off',
] as const;

const SSG_RANGES = {
  [FurnaceMacroType.VOL]: { min: 0, max: 15, bipolar: false },
  [FurnaceMacroType.ARP]: { min: -24, max: 24, bipolar: true },
  [FurnaceMacroType.DUTY]: { min: 0, max: 31, bipolar: false },
  [FurnaceMacroType.WAVE]: { min: 0, max: 7, bipolar: false },
  [FurnaceMacroType.PITCH]: { min: -128, max: 127, bipolar: true },
  [FurnaceMacroType.EX2]: { min: 0, max: 15, bipolar: false },
  [FurnaceMacroType.EX3]: { min: 0, max: 15, bipolar: false },
  [FurnaceMacroType.ALG]: { min: 0, max: 15, bipolar: false },
  [FurnaceMacroType.EX5]: { min: 0, max: 65535, bipolar: false },
} as const;

const SSG_VALUE_NAMES = {
  [FurnaceMacroType.WAVE]: AY_MIXER_NAMES,
  [FurnaceMacroType.EX2]: AY_ENVELOPE_SHAPE_NAMES,
} as const;

/** YM2610 SSG voice on nullsound. */
export const SSG_NEOGEO_MACRO_PROFILE: ChipMacroProfile = {
  labels: {
    [FurnaceMacroType.VOL]: 'Volume',
    [FurnaceMacroType.ARP]: 'Arpeggio',
    [FurnaceMacroType.WAVE]: 'Tone, Noise and Envelope',
    [FurnaceMacroType.EX2]: 'Envelope Shape',
    [FurnaceMacroType.EX3]: 'Auto Envelope Numerator',
    [FurnaceMacroType.ALG]: 'Auto Envelope Denominator',
  },
  ranges: SSG_RANGES,
  valueNames: SSG_VALUE_NAMES,
  allowRelease: false,
  allowSpeed: false,
  note: 'nullsound plays these as plain sequences: one loop point shared by all macros, no release, speed 1.',
};

/** YM2610 FM voice on nullsound: the patch is exported, macros are not. */
export const FM_NEOGEO_MACRO_PROFILE: ChipMacroProfile = {
  labels: {},
  ranges: {},
  note: 'nullsound plays no FM macros. Macros listed here are dropped on Neo Geo export.',
};

/** YM2610 ADPCM-B voice on nullsound. */
export const ADPCMB_NEOGEO_MACRO_PROFILE: ChipMacroProfile = {
  labels: { [FurnaceMacroType.ARP]: 'Tuning (semitones)' },
  ranges: { [FurnaceMacroType.ARP]: { min: -24, max: 24, bipolar: true } },
  maxSteps: { [FurnaceMacroType.ARP]: 1 },
  allowRelease: false,
  allowSpeed: false,
  note: 'ADPCM-B keeps one tuning step. The sample loop comes from the sample.',
};

/** YM2610 ADPCM-A voice: sound effects only on nullsound. */
export const ADPCMA_NEOGEO_MACRO_PROFILE: ChipMacroProfile = {
  labels: { [FurnaceMacroType.VOL]: 'Volume' },
  ranges: { [FurnaceMacroType.VOL]: { min: 0, max: 31, bipolar: false } },
  maxSteps: { [FurnaceMacroType.VOL]: 1 },
  allowRelease: false,
  allowSpeed: false,
  note: 'ADPCM-A plays sound effects only in nullsound, not song notes. It keeps one volume step (default 31).',
};

export const NEOGEO_MACRO_PROFILES = {
  fm: FM_NEOGEO_MACRO_PROFILE,
  ssg: SSG_NEOGEO_MACRO_PROFILE,
  adpcma: ADPCMA_NEOGEO_MACRO_PROFILE,
  adpcmb: ADPCMB_NEOGEO_MACRO_PROFILE,
} as const satisfies Record<string, ChipMacroProfile>;

/** AY-3-8910 voice: ZX Spectrum PT3 and the Vectrex capture. */
export const AY_MACRO_PROFILE: ChipMacroProfile = {
  labels: {
    [FurnaceMacroType.VOL]: 'Volume',
    [FurnaceMacroType.ARP]: 'Arpeggio',
    [FurnaceMacroType.DUTY]: 'Noise Period',
    [FurnaceMacroType.WAVE]: 'Tone, Noise and Envelope',
    [FurnaceMacroType.PITCH]: 'Pitch (Vectrex only)',
    [FurnaceMacroType.EX2]: 'Envelope Shape (first step on ZX)',
    [FurnaceMacroType.EX3]: 'Auto Envelope Numerator (first step on ZX)',
    [FurnaceMacroType.ALG]: 'Auto Envelope Denominator (first step on ZX)',
    [FurnaceMacroType.EX5]: 'Envelope Period (first step on ZX)',
  },
  ranges: SSG_RANGES,
  valueNames: SSG_VALUE_NAMES,
  // PT3 samples and ornaments hold at most 64 ticks.
  maxSteps: {
    [FurnaceMacroType.VOL]: 64, [FurnaceMacroType.ARP]: 64, [FurnaceMacroType.DUTY]: 64, [FurnaceMacroType.WAVE]: 64,
  },
  allowRelease: false,
  note: 'PT3 keeps loops, speed and delay, not release points. Envelope macros use their first step per note on ZX.',
};

/** Profile for a Furnace synth type, or null when the chip has no native-player profile. */
export function chipMacroProfile(synthType: string | undefined): ChipMacroProfile | null {
  if (synthType === 'FurnaceNES') return NES_MACRO_PROFILE;
  if (synthType === 'FurnaceGB') return GB_MACRO_PROFILE;
  if (synthType === 'FurnaceAY') return AY_MACRO_PROFILE;
  return null;
}

/** Macro slot: imported and preset macros carry `code`, editor-made ones `type` (the encoder reads code first). */
export const macroCode = (m: FurnaceMacro): number => m.code ?? m.type;

/** First step of the macro in slot `code`, or undefined when the instrument has none. */
export function macroFirstStep(macros: readonly FurnaceMacro[], code: number): number | undefined {
  return macros.find((m) => macroCode(m) === code)?.data[0];
}

/** `macros` with the first step of slot `code` set to `value`; adds a one-step macro when the slot is empty. */
export function withMacroFirstStep(macros: readonly FurnaceMacro[], code: number, value: number): FurnaceMacro[] {
  const i = macros.findIndex((m) => macroCode(m) === code);
  if (i < 0) return [...macros, { code, type: code, data: [value], loop: -1, release: -1, mode: 0, speed: 1 }];
  const out = [...macros];
  out[i] = { ...macros[i], data: [value, ...macros[i].data.slice(1)] };
  return out;
}
