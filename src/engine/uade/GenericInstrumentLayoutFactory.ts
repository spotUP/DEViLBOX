/**
 * GenericInstrumentLayoutFactory — Generate UADEInstrumentLayout descriptors
 * from declarative family descriptions. Mirrors GenericEncoderFactory for
 * pattern cell encoders.
 *
 * Most UADE formats fall into a few instrument header families:
 * - ProTracker: 30-byte headers at offset 20 (MOD, SoundFX, Oktalyzer, etc.)
 * - Custom: arbitrary header size/offset/fields
 * - Stub: no live patching, only rebuild+reload
 */

import type {
  UADEInstrumentLayout,
  InstrumentFieldDescriptor,
  SampleLayout,
  SectionEncoder,
} from './UADEInstrumentLayout';
import { registerInstrumentLayout, registerInstrumentLayoutAliases } from './UADEInstrumentLayout';

// ─── ProTracker Family ───────────────────────────────────────────────────────

const PROTRACKER_FIELDS: Record<string, InstrumentFieldDescriptor> = {
  length:    { offset: 22, size: 2, type: 'u16be', unit: 'words' },
  finetune:  { offset: 24, size: 1, type: 'u8', mask: 0x0F },
  volume:    { offset: 25, size: 1, type: 'u8', max: 64 },
  loopStart: { offset: 26, size: 2, type: 'u16be', unit: 'words' },
  loopLen:   { offset: 28, size: 2, type: 'u16be', unit: 'words' },
};

function createProtrackerLayout(
  formatId: string,
  overrides?: {
    instrTableOffset?: number;
    maxInstruments?: number;
    instrHeaderSize?: number;
    fields?: Record<string, InstrumentFieldDescriptor>;
  },
): UADEInstrumentLayout {
  return {
    formatId,
    instrTableOffset: overrides?.instrTableOffset ?? 20,
    instrHeaderSize: overrides?.instrHeaderSize ?? 30,
    maxInstruments: overrides?.maxInstruments ?? 31,
    fields: overrides?.fields ?? PROTRACKER_FIELDS,
    sampleLayout: { type: 'contiguous', startOffset: -1 },
  };
}

// ─── Custom Family ───────────────────────────────────────────────────────────

interface CustomLayoutConfig {
  instrTableOffset: number;
  instrHeaderSize: number;
  maxInstruments: number;
  fields: Record<string, InstrumentFieldDescriptor>;
  sampleLayout: SampleLayout;
  sectionEncoders?: Record<string, SectionEncoder>;
}

function createCustomLayout(formatId: string, config: CustomLayoutConfig): UADEInstrumentLayout {
  return { formatId, ...config };
}

// ─── Stub Family ─────────────────────────────────────────────────────────────

function createStubLayout(formatId: string): UADEInstrumentLayout {
  return {
    formatId,
    instrTableOffset: 0,
    instrHeaderSize: 0,
    maxInstruments: 0,
    fields: {},
    sampleLayout: { type: 'custom', getSampleOffset: () => ({ offset: 0, size: 0 }) },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type InstrumentLayoutFamily =
  | { kind: 'protracker'; instrTableOffset?: number; maxInstruments?: number; instrHeaderSize?: number; fields?: Record<string, InstrumentFieldDescriptor> }
  | { kind: 'custom'; config: CustomLayoutConfig }
  | { kind: 'stub' };

/**
 * Generate and register an instrument layout for a format.
 * @param formatId Primary format identifier
 * @param family Layout family descriptor
 * @param aliases Additional format IDs that share this layout
 */
export function registerGenericInstrumentLayout(
  formatId: string,
  family: InstrumentLayoutFamily,
  aliases?: string[],
): void {
  let layout: UADEInstrumentLayout;

  switch (family.kind) {
    case 'protracker':
      layout = createProtrackerLayout(formatId, family);
      break;
    case 'custom':
      layout = createCustomLayout(formatId, family.config);
      break;
    case 'stub':
      layout = createStubLayout(formatId);
      break;
  }

  registerInstrumentLayout(layout);
  if (aliases?.length) {
    registerInstrumentLayoutAliases(layout, aliases);
  }
}
