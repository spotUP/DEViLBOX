/**
 * UADEInstrumentLayout — Declarative descriptor for where instrument data
 * lives in a UADE module binary, enabling live chip RAM patching of
 * instrument parameters during playback.
 *
 * Mirrors the UADEPatternLayout pattern: each format registers a layout,
 * the patcher uses it to compute chip RAM addresses for field writes.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ─── Field Descriptor ────────────────────────────────────────────────────────

export interface InstrumentFieldDescriptor {
  /** Byte offset from the start of this instrument's header */
  offset: number;
  /** Size in bytes (1, 2, or 4) */
  size: 1 | 2 | 4;
  /** Encoding */
  type: 'u8' | 'u16be' | 'u32be' | 's8' | 's16be';
  /** Scaling — some formats store length in words (multiply by 2 for bytes) */
  unit?: 'bytes' | 'words';
  /** Bitmask for sub-byte fields (e.g., finetune uses lower nibble) */
  mask?: number;
  /** Clamp range */
  max?: number;
}

// ─── Sample Layout ───────────────────────────────────────────────────────────

export type SampleLayout =
  | { type: 'contiguous'; startOffset: number }
  | { type: 'pointer-table'; tableOffset: number; pointerSize: 2 | 4; endian: 'be' | 'le' }
  | { type: 'fixed-slots'; slotSize: number; startOffset: number }
  | { type: 'custom'; getSampleOffset: (instrIndex: number, song: TrackerSong) => { offset: number; size: number } };

// ─── Section Encoder ─────────────────────────────────────────────────────────

export interface SectionEncoder {
  /** Encode the section data into bytes for chip RAM write */
  encode(config: Record<string, unknown>, instrIndex: number): Uint8Array;
  /** Chip RAM offset of this section (relative to module base) */
  getOffset(instrIndex: number, layout: UADEInstrumentLayout): number;
  /** Size of this section in bytes (must match original to avoid overflow) */
  getSize(instrIndex: number): number;
}

// ─── Instrument Layout ───────────────────────────────────────────────────────

export interface UADEInstrumentLayout {
  formatId: string;

  /** File byte offset where the instrument header table begins */
  instrTableOffset: number;
  /** Size of each instrument header in bytes */
  instrHeaderSize: number;
  /** Number of instruments in the module */
  maxInstruments: number;
  /** Field map: parameter name → byte descriptor within the header */
  fields: Record<string, InstrumentFieldDescriptor>;

  /** How sample data is organized */
  sampleLayout: SampleLayout;

  /** Format-specific section encoders for complex instrument data
   *  (FC volume envelopes, SoundMon wavetables, TFMX macros, etc.) */
  sectionEncoders?: Record<string, SectionEncoder>;
}

// ─── Registry ────────────────────────────────────────────────────────────────

const instrumentLayoutRegistry = new Map<string, UADEInstrumentLayout>();

/** Register an instrument layout for a format */
export function registerInstrumentLayout(layout: UADEInstrumentLayout): void {
  instrumentLayoutRegistry.set(layout.formatId, layout);
}

/** Register the same layout under multiple format aliases */
export function registerInstrumentLayoutAliases(layout: UADEInstrumentLayout, aliases: string[]): void {
  for (const alias of aliases) {
    instrumentLayoutRegistry.set(alias, layout);
  }
}

/** Get an instrument layout for a format (returns undefined if not registered) */
export function getInstrumentLayout(formatId: string): UADEInstrumentLayout | undefined {
  return instrumentLayoutRegistry.get(formatId);
}
