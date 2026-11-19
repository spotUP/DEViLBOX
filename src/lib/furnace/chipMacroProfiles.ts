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
 */
import { FurnaceMacroType } from '@/types/instrument/furnace';

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

/** Profile for a Furnace synth type, or null when the chip has no native-player profile. */
export function chipMacroProfile(synthType: string | undefined): ChipMacroProfile | null {
  if (synthType === 'FurnaceNES') return NES_MACRO_PROFILE;
  if (synthType === 'FurnaceGB') return GB_MACRO_PROFILE;
  return null;
}
