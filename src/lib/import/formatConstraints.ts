/**
 * formatConstraints.ts — Per-format editing constraints for the pattern editor.
 *
 * Defines channel limits, note ranges, effect column counts, and other
 * hardware/format restrictions so the UI can warn users when edits fall
 * outside what a format's exporter can represent.
 */
import type { TrackerFormat } from '@/engine/TrackerReplayer';

export interface FormatConstraints {
  /** Maximum channel count the format supports */
  maxChannels: number;
  /** Minimum channel count (some formats are fixed) */
  minChannels: number;
  /** Highest valid XM note number (1-96, where 1=C-0, 96=B-7) */
  maxNote: number;
  /** Lowest valid XM note number */
  minNote: number;
  /** Maximum effect columns per channel */
  maxEffectCols: number;
  /** Maximum instrument count */
  maxInstruments: number;
  /** Default pattern length (rows) */
  defaultPatternRows: number;
  /** Maximum pattern length */
  maxPatternRows: number;
  /** Supported XM effect types (null = all supported) */
  supportedEffects?: number[] | null;
  /** Human-readable format note */
  note?: string;
}

/** Default XM constraints (permissive) */
const XM_DEFAULTS: FormatConstraints = {
  maxChannels: 32,
  minChannels: 1,
  maxNote: 96,
  minNote: 1,
  maxEffectCols: 2,
  maxInstruments: 128,
  defaultPatternRows: 64,
  maxPatternRows: 256,
  supportedEffects: null,
};

const FORMAT_CONSTRAINTS_MAP: Partial<Record<TrackerFormat, FormatConstraints>> = {
  // ── Standard tracker formats ──
  MOD: { ...XM_DEFAULTS, maxChannels: 32, maxEffectCols: 1, maxInstruments: 31, maxPatternRows: 64, defaultPatternRows: 64 },
  XM:  { ...XM_DEFAULTS },
  IT:  { ...XM_DEFAULTS, maxChannels: 64, maxEffectCols: 2, maxInstruments: 99, maxPatternRows: 200 },
  S3M: { ...XM_DEFAULTS, maxChannels: 32, maxEffectCols: 1, maxInstruments: 99, maxPatternRows: 64 },
  HVL: { ...XM_DEFAULTS, maxChannels: 4, maxEffectCols: 2, maxInstruments: 63 },
  AHX: { ...XM_DEFAULTS, maxChannels: 4, maxEffectCols: 2, maxInstruments: 63 },

  // ── Exotic Amiga ──
  OKT:  { ...XM_DEFAULTS, maxChannels: 8, maxEffectCols: 1, maxInstruments: 36, maxPatternRows: 128 },
  MED:  { ...XM_DEFAULTS, maxChannels: 16, maxEffectCols: 2, maxInstruments: 63 },
  DIGI: { ...XM_DEFAULTS, maxChannels: 8, maxEffectCols: 1, maxInstruments: 31 },
  DBM:  { ...XM_DEFAULTS, maxChannels: 128, maxEffectCols: 2, maxInstruments: 128 },
  FC:   { ...XM_DEFAULTS, maxChannels: 4, maxEffectCols: 2, maxInstruments: 10, note: 'Future Composer: 4 voices, 10 instruments max' },

  // ── Chip-dump / CPU-code formats ──
  GBS:  { ...XM_DEFAULTS, maxChannels: 4, minChannels: 4, maxEffectCols: 2, maxInstruments: 4, note: 'Game Boy: 4 fixed channels (2 pulse + wave + noise)' },
  HES:  { ...XM_DEFAULTS, maxChannels: 6, minChannels: 6, maxEffectCols: 2, maxInstruments: 6, note: 'PC Engine: 6 fixed HuC6280 channels' },
  KSS:  { ...XM_DEFAULTS, maxChannels: 15, maxEffectCols: 2, maxInstruments: 16, note: 'MSX: AY(3) + SCC(5) + OPLL(9) channels' },
  SPC:  { ...XM_DEFAULTS, maxChannels: 8, minChannels: 8, maxEffectCols: 2, maxInstruments: 64, note: 'SNES: 8 fixed SPC700 voices' },
  MDX:  { ...XM_DEFAULTS, maxChannels: 9, maxEffectCols: 2, maxInstruments: 256, note: 'X68000: 8 FM (OPM) + 1 ADPCM' },
  SNDH: { ...XM_DEFAULTS, maxChannels: 4, maxEffectCols: 2, maxInstruments: 16, note: 'Atari ST: 3 YM2149 + 1 timer channel' },
  PMD:  { ...XM_DEFAULTS, maxChannels: 13, maxEffectCols: 2, maxInstruments: 128, note: 'PC-98: 6 FM + 3 SSG + 1 Rhythm + 3 ADPCM' },
  AdPlug: { ...XM_DEFAULTS, maxChannels: 18, maxEffectCols: 2, maxInstruments: 128, note: 'AdLib: up to 18 OPL3 channels (9 OPL2)' },
  S98:  { ...XM_DEFAULTS, maxChannels: 18, maxEffectCols: 2, maxInstruments: 16, note: 'S98: register dump, channel count varies by chip' },

  // ── Other chip formats ──
  VGM: { ...XM_DEFAULTS, maxChannels: 24, maxEffectCols: 2, maxInstruments: 16 },
  YM:  { ...XM_DEFAULTS, maxChannels: 3, minChannels: 3, maxEffectCols: 1, maxInstruments: 1 },
  NSF: { ...XM_DEFAULTS, maxChannels: 5, maxEffectCols: 2, maxInstruments: 8 },
  SID: { ...XM_DEFAULTS, maxChannels: 3, minChannels: 3, maxEffectCols: 2, maxInstruments: 3, note: 'C64: 3 SID voices' },
  SAP: { ...XM_DEFAULTS, maxChannels: 4, maxEffectCols: 1, maxInstruments: 4 },
  AY:  { ...XM_DEFAULTS, maxChannels: 3, minChannels: 3, maxEffectCols: 1, maxInstruments: 3 },
};

/**
 * Get editing constraints for a tracker format.
 * Returns XM defaults if format has no specific constraints.
 */
export function getFormatConstraints(format: TrackerFormat): FormatConstraints {
  return FORMAT_CONSTRAINTS_MAP[format] ?? XM_DEFAULTS;
}

/**
 * Validate a cell edit against format constraints.
 * Returns an array of warning messages (empty = valid).
 */
export function validateEdit(
  format: TrackerFormat,
  channelIndex: number,
  note: number | undefined,
  instrument: number | undefined,
  effectCol: number,
): string[] {
  const c = getFormatConstraints(format);
  const warnings: string[] = [];

  if (channelIndex >= c.maxChannels) {
    warnings.push(`Channel ${channelIndex + 1} exceeds ${format} limit of ${c.maxChannels}`);
  }
  if (note !== undefined && note > 0 && note < 97) {
    if (note > c.maxNote) warnings.push(`Note too high for ${format} (max ${c.maxNote})`);
    if (note < c.minNote) warnings.push(`Note too low for ${format} (min ${c.minNote})`);
  }
  if (instrument !== undefined && instrument > c.maxInstruments) {
    warnings.push(`Instrument ${instrument} exceeds ${format} limit of ${c.maxInstruments}`);
  }
  if (effectCol >= c.maxEffectCols) {
    warnings.push(`Effect column ${effectCol + 1} exceeds ${format} limit of ${c.maxEffectCols}`);
  }

  return warnings;
}
