/**
 * Furnace Tracker Song (.fur) Exporter
 *
 * Exports DEViLBOX songs to Furnace format for roundtrip workflow.
 * Based on Furnace format specification: https://github.com/tildearrow/furnace/blob/master/papers/format.md
 *
 * Supports:
 * - Modern format (version 228+)
 * - New pattern format (PATN)
 * - New sample format (SMP2)
 * - All instrument types with macros
 * - Wavetables and samples
 */

import { BinaryWriter } from '../../utils/BinaryWriter';
import pako from 'pako';
import type { Pattern, TrackerCell, ParsedInstrument, ParsedSample, FurnaceMacroData, FurnaceWavetableData } from '../../types/tracker';
import type { InstrumentConfig, FurnaceConfig } from '../../types/instrument';
import { cellToFile, trackerArpStopAt, type FileCell, type FurnaceModuleSong } from './FurnaceModuleExporter';
import { effectNotationOf } from '../tracker/effectNotation';
import {
  encodeInstrumentAsINS2,
  type FurnaceInstrument as FileInstrument,
  type FurnaceMacro as FileMacro,
} from '../import/formats/furnace/FurnaceInstrumentParser';
import { DIV_INS_AY } from './FurnaceInstrumentEncoder';

// Format constants
const DIV_ENGINE_VERSION = 228;
const FILE_MAGIC = '-Furnace module-';
const INFO_MAGIC = 'INFO';
const PATN_MAGIC = 'PATN';
const INST_MAGIC = 'INST';
const WAVE_MAGIC = 'WAVE';
const SMP2_MAGIC = 'SMP2';
const GROV_MAGIC = 'GROV';
const CFLG_MAGIC = 'CFLG';

// Special note values
const NOTE_OFF = 180;
// NOTE_RELEASE = 181 and MACRO_RELEASE = 182 are reserved for future use

// DEViLBOX SynthType to Furnace instrument type mapping
const SYNTHTYPE_TO_FURNACE: Record<string, number> = {
  'ChipSynth': 0,          // DIV_INS_STD
  'FurnaceOPN': 1,         // DIV_INS_FM
  'FurnaceGB': 2,          // DIV_INS_GB
  'FurnaceC64': 3,         // DIV_INS_C64
  'Sampler': 4,            // DIV_INS_AMIGA
  'FurnacePCE': 5,         // DIV_INS_PCE
  'FurnaceAY': 6,          // DIV_INS_AY
  'FurnaceTIA': 8,         // DIV_INS_TIA
  'FurnaceSAA': 9,         // DIV_INS_SAA1099
  'FurnaceVIC': 10,        // DIV_INS_VIC
  'FurnaceVRC6': 12,       // DIV_INS_VRC6
  'FurnaceOPLL': 13,       // DIV_INS_OPLL
  'FurnaceOPL': 14,        // DIV_INS_OPL
  'FurnaceFDS': 15,        // DIV_INS_FDS
  'FurnaceVB': 16,         // DIV_INS_VBOY
  'FurnaceN163': 17,       // DIV_INS_N163
  'FurnaceSCC': 18,        // DIV_INS_SCC
  'FurnaceOPZ': 19,        // DIV_INS_OPZ
  'FurnaceSWAN': 22,       // DIV_INS_SWAN
  'FurnaceLynx': 23,       // DIV_INS_MIKEY
  'FurnaceVERA': 24,       // DIV_INS_VERA
  'FurnaceX1_010': 25,     // DIV_INS_X1_010
  'FurnaceES5506': 27,     // DIV_INS_ES5506
  'FurnaceSNES': 29,       // DIV_INS_SNES
  'FurnaceOPM': 33,        // DIV_INS_OPM
  'FurnaceNES': 34,        // DIV_INS_NES
  'FurnaceOKI': 36,        // DIV_INS_MSM6295
  'FurnaceSEGAPCM': 39,    // DIV_INS_SEGAPCM
  'FurnaceQSOUND': 40,     // DIV_INS_QSOUND
  'FurnaceYMZ280B': 41,    // DIV_INS_YMZ280B
  'FurnaceRF5C68': 42,     // DIV_INS_RF5C68
  'FurnaceT6W28': 44,      // DIV_INS_T6W28
  'FurnaceK007232': 45,    // DIV_INS_K007232
  'FurnaceGA20': 46,       // DIV_INS_GA20
  'FurnaceSM8521': 48,     // DIV_INS_SM8521
  'FurnaceK053260': 50,    // DIV_INS_K053260
  'FurnaceTED': 52,        // DIV_INS_TED
  'FurnaceC140': 53,       // DIV_INS_C140
  'FurnaceESFM': 55,       // DIV_INS_ESFM
};

// Chip ID mapping for systems
const CHIP_IDS: Record<string, number> = {
  'gb': 0x04,
  'nes': 0x06,
  'sms': 0x03,
  'pce': 0x05,
  'c64': 0x07,
  'ay': 0x80,
  'amiga': 0x81,
  'ym2151': 0x82,
  'ym2612': 0x83,
  'snes': 0x87,
  'opll': 0x89,
  'fds': 0x8a,
  'n163': 0x8c,
  'opl': 0x8f,
  'opl2': 0x90,
  'opl3': 0x91,
};

export interface FurnaceExportOptions {
  name?: string;
  author?: string;
  comment?: string;
  compress?: boolean;
  systems?: string[]; // Chip types (e.g., ['gb', 'nes'])
  tickRate?: number;  // Hz (default 60)
}

/**
 * Groove pattern: sequence of tick speeds per row
 * Used by 09xx command to switch groove patterns
 * @see furnace-master/doc/8-advanced/grooves.md
 */
export interface GroovePattern {
  /** Number of values in the groove (1-16) */
  len: number;
  /** Array of tick speed values for each step */
  val: number[];
}

/**
 * Furnace compatibility flags - ALL 57 flags from Furnace tracker
 * Controls various playback behaviors for tracker compatibility
 * @see furnace-master/src/engine/song.h DivCompatFlags
 * @see furnace-master/src/engine/song.cpp DivCompatFlags::setDefaults()
 */
export interface CompatFlags {
  // === Pitch/Slide Behavior ===
  limitSlides?: boolean;           // Default: false - Limit slides
  linearPitch?: number;            // 0=off, 1=only pitch changes, 2=full (default: 1)
  pitchSlideSpeed?: number;        // 1-16 (default: 4) - Pitch slide speed multiplier

  // === Loop and Playback ===
  loopModality?: number;           // 0=reset, 1=row, 2=ordered (default: 2)
  delayBehavior?: number;          // 0=old, 1=row on next tick, 2=row (default: 2)
  jumpTreatment?: number;          // 0=none, 1=first, 2=second (default: 0)
  ignoreJumpAtEnd?: boolean;       // Default: false - Ignore 0Bxx at end of pattern

  // === Chip-Specific Behavior ===
  properNoiseLayout?: boolean;     // Default: true - Proper noise layout on SegaPCM
  waveDutyIsVol?: boolean;         // Default: false - Wave channel duty is volume
  gbInsAffectsEnvelope?: boolean;  // Default: true - GB ins affects envelope
  newSegaPCM?: boolean;            // Default: true - New SegaPCM behavior
  ignoreDACModeOutsideIntendedChannel?: boolean; // Default: false
  snDutyReset?: boolean;           // Default: false - SN duty reset on new note
  snNoLowPeriods?: boolean;        // Default: false - SN no low periods
  noOPN2Vol?: boolean;             // Default: false - No OPN2 volume control

  // === DAC/Sample Behavior ===
  brokenDACMode?: boolean;         // Default: false - Broken DAC mode
  disableSampleMacro?: boolean;    // Default: false - Disable sample macros
  oldDPCM?: boolean;               // Default: false - Old DPCM behavior (NES)
  oldSampleOffset?: boolean;       // Default: false - Old sample offset behavior
  oldCenterRate?: boolean;         // Default: true - Old center rate calculation

  // === Macro/Effect Behavior ===
  resetMacroOnPorta?: boolean;     // Default: false - Reset macro on portamento
  legacyVolumeSlides?: boolean;    // Default: false - Legacy volume slides
  compatibleArpeggio?: boolean;    // Default: false - Compatible arpeggio
  noteOffResetsSlides?: boolean;   // Default: true - Note off resets slides
  targetResetsSlides?: boolean;    // Default: true - Target resets slides
  arpNonPorta?: boolean;           // Default: false - Arp doesn't affect porta
  algMacroBehavior?: boolean;      // Default: false - Algorithm macro behavior
  continuousVibrato?: boolean;     // Default: false - Continuous vibrato

  // === Portamento Behavior ===
  stopPortaOnNoteOff?: boolean;    // Default: false - Stop porta on note off
  newInsTriggersInPorta?: boolean; // Default: true - New ins triggers in porta
  buggyPortaAfterSlide?: boolean;  // Default: false - Buggy porta after slide
  fbPortaPause?: boolean;          // Default: false - FB porta pause
  brokenPortaArp?: boolean;        // Default: false - Broken porta arp
  brokenPortaLegato?: boolean;     // Default: false - Broken porta legato

  // === Arpeggio Behavior ===
  arp0Reset?: boolean;             // Default: true - Arp 0 resets
  rowResetsArpPos?: boolean;       // Default: false - Row resets arp position
  oldArpStrategy?: boolean;        // Default: false - Old arpeggio strategy
  resetArpPhaseOnNewNote?: boolean; // Default: false - Reset arp phase on new note

  // === Slide/Shortcut Behavior ===
  brokenShortcutSlides?: boolean;  // Default: false - Broken shortcut slides
  ignoreDuplicateSlides?: boolean; // Default: false - Ignore duplicate slides
  noSlidesOnFirstTick?: boolean;   // Default: false - No slides on first tick

  // === Speed Selection ===
  brokenSpeedSel?: boolean;        // Default: false - Broken speed selection

  // === Volume/Output Behavior ===
  newVolumeScaling?: boolean;      // Default: true - New volume scaling
  volMacroLinger?: boolean;        // Default: true - Volume macro lingers
  brokenOutVol?: boolean;          // Default: false - Broken output volume
  brokenOutVol2?: boolean;         // Default: false - Broken output volume 2
  pitchMacroIsLinear?: boolean;    // Default: true - Pitch macro is linear
  oldOctaveBoundary?: boolean;     // Default: false - Old octave boundary
  ceilVolumeScaling?: boolean;     // Default: false - Ceiling volume scaling
  oldAlwaysSetVolume?: boolean;    // Default: false - Old always set volume
  noVolSlideReset?: boolean;       // Default: false - No volume slide reset

  // === One Tick Cut ===
  oneTickCut?: boolean;            // Default: false - One tick cut (ECx effect)

  // === E1/E2 Effect Behavior ===
  e1e2AlsoTakePriority?: boolean;  // Default: false - E1/E2 also take priority
  e1e2StopOnSameNote?: boolean;    // Default: false - E1/E2 stop on same note

  // === Shared/External State ===
  sharedExtStat?: boolean;         // Default: true - Shared extended status

  // === FM-Specific ===
  brokenFMOff?: boolean;           // Default: false - Broken FM note off

  // === Pre-Note Effects ===
  preNoteNoEffect?: boolean;       // Default: false - Pre-note no effect
}

export interface FurnaceExportData {
  patterns: Pattern[];
  instruments: ParsedInstrument[];
  samples?: ParsedSample[];
  wavetables?: FurnaceWavetableData[];
  grooves?: GroovePattern[];  // Groove patterns for variable speed
  compatFlags?: CompatFlags;  // Compatibility flags (optional, defaults used if not specified)
  orderList: number[][]; // [channel][order] = pattern index
  bpm: number;
  speed: number;
  patternLength: number;
}

/**
 * Export a song to Furnace .fur format.
 * Call bakeAutomationForFurnace() first to bake automation curves into patterns.
 */
export function exportToFurnace(data: FurnaceExportData, options: FurnaceExportOptions = {}): Uint8Array {
  const exporter = new FurnaceExporter(data, options);
  return exporter.export();
}

/**
 * Bake automation curves into Furnace chip-specific effect commands.
 * Call before exportToFurnace() to embed automation as native effects.
 *
 * @param patterns  Original patterns
 * @param primaryChip  Primary chip type ('c64', 'ay', 'gb', etc.)
 * @returns Baked patterns + stats (import BakeResult from AutomationBaker)
 */
export async function bakeAutomationForFurnace(
  patterns: Pattern[],
  primaryChip: string,
): Promise<{ patterns: Pattern[]; bakedCount: number; overflowRows: number; warnings: string[] }> {
  const { useAutomationStore } = await import('@stores/useAutomationStore');
  const { bakeAutomationForExport } = await import('./AutomationBaker');
  const { FORMAT_LIMITS } = await import('@/lib/formatCompatibility');

  const curves = useAutomationStore.getState().curves;
  if (curves.length === 0) {
    return { patterns, bakedCount: 0, overflowRows: 0, warnings: [] };
  }

  // Look up chip-specific format: FUR_C64, FUR_OPN2, FUR_SNES, etc.
  const formatKey = `FUR_${primaryChip.toUpperCase()}`;
  const format = FORMAT_LIMITS[formatKey] || FORMAT_LIMITS['FUR_GENERIC'];
  return bakeAutomationForExport(patterns, curves, format);
}

class FurnaceExporter {
  private writer: BinaryWriter;
  private data: FurnaceExportData;
  private options: FurnaceExportOptions;

  constructor(data: FurnaceExportData, options: FurnaceExportOptions) {
    this.writer = new BinaryWriter(4 * 1024 * 1024); // 4MB initial
    this.data = data;
    this.options = {
      name: options.name || 'Untitled',
      author: options.author || 'DEViLBOX',
      comment: options.comment || 'Exported from DEViLBOX',
      compress: options.compress ?? true,
      systems: options.systems || ['gb'],
      tickRate: options.tickRate || 60,
    };
  }

  export(): Uint8Array {
    // Write uncompressed content first
    this.writeHeader();
    this.writeInfoBlock();
    this.writeCompatFlagsBlock();
    this.writeInstruments();
    this.writeWavetables();
    this.writeSamples();
    this.writeGrooves();
    this.writePatterns();

    const uncompressed = this.writer.getBuffer();

    if (this.options.compress) {
      // Compress with zlib
      return pako.deflate(uncompressed);
    }

    return uncompressed;
  }

  private writeHeader(): void {
    // File magic
    this.writer.writeMagic(FILE_MAGIC);

    // Version (2 bytes)
    this.writer.writeUint16(DIV_ENGINE_VERSION);

    // Reserved (2 bytes)
    this.writer.writeUint16(0);
  }

  private writeInfoBlock(): void {
    const blockStart = this.writer.getOffset();

    // Block magic
    this.writer.writeMagic(INFO_MAGIC);

    // Block size placeholder (will be filled in later)
    const sizeOffset = this.writer.getOffset();
    this.writer.writeUint32(0);

    // Time base (1 byte) - usually 0 or 1
    this.writer.writeUint8(0);

    // Speed 1 (1 byte)
    this.writer.writeUint8(Math.min(255, Math.max(1, this.data.speed || 6)));

    // Speed 2 (1 byte)
    this.writer.writeUint8(Math.min(255, Math.max(1, this.data.speed || 6)));

    // Arpeggio tick speed (1 byte)
    this.writer.writeUint8(1);

    // Tick rate (4 bytes float)
    this.writer.writeFloat32(this.options.tickRate || 60.0);

    // Pattern length (2 bytes)
    this.writer.writeUint16(this.data.patternLength || 64);

    // Order list length (2 bytes)
    const ordersLen = this.data.orderList.length > 0 ? this.data.orderList[0].length : 1;
    this.writer.writeUint16(ordersLen);

    // Highlight A (1 byte) - default 4
    this.writer.writeUint8(4);

    // Highlight B (1 byte) - default 16
    this.writer.writeUint8(16);

    // Instrument count (2 bytes)
    this.writer.writeUint16(this.data.instruments.length);

    // Wavetable count (2 bytes)
    this.writer.writeUint16(this.data.wavetables?.length || 0);

    // Sample count (2 bytes)
    this.writer.writeUint16(this.data.samples?.length || 0);

    // Pattern count (4 bytes)
    this.writer.writeUint32(this.data.patterns.length);

    // System count (1 byte)
    const systems = this.options.systems || ['gb'];
    this.writer.writeUint8(systems.length);

    // System IDs (32 bytes max, padded)
    for (let i = 0; i < 32; i++) {
      if (i < systems.length) {
        const chipId = CHIP_IDS[systems[i]] || 0x04; // Default to GB
        this.writer.writeUint8(chipId);
      } else {
        this.writer.writeUint8(0);
      }
    }

    // System volumes (32 bytes, signed)
    for (let i = 0; i < 32; i++) {
      this.writer.writeInt8(i < systems.length ? 64 : 0); // Default volume
    }

    // System panning (32 bytes, signed)
    for (let i = 0; i < 32; i++) {
      this.writer.writeInt8(0); // Center pan
    }

    // System flags (32 x 4 bytes = 128 bytes)
    for (let i = 0; i < 32; i++) {
      this.writer.writeUint32(0);
    }

    // Song name
    this.writer.writeNullTerminatedString(this.options.name || 'Untitled');

    // Song author
    this.writer.writeNullTerminatedString(this.options.author || 'DEViLBOX');

    // Tuning (4 bytes float)
    this.writer.writeFloat32(440.0);

    // Compatibility flags (placeholder - write default values)
    this.writeCompatFlags();

    // Order list for each channel
    const numChannels = this.getChannelCount();
    for (let ch = 0; ch < numChannels; ch++) {
      for (let ord = 0; ord < ordersLen; ord++) {
        const patIdx = this.data.orderList[ch]?.[ord] ?? 0;
        this.writer.writeUint8(patIdx);
      }
    }

    // Effect columns per channel
    for (let ch = 0; ch < numChannels; ch++) {
      this.writer.writeUint8(2); // 2 effect columns per channel
    }

    // Channel hide/collapse status
    for (let ch = 0; ch < numChannels; ch++) {
      this.writer.writeUint8(0); // Not hidden/collapsed
    }

    // Channel names (null-terminated strings)
    for (let ch = 0; ch < numChannels; ch++) {
      this.writer.writeNullTerminatedString(`Channel ${ch + 1}`);
    }

    // Channel short names
    for (let ch = 0; ch < numChannels; ch++) {
      this.writer.writeNullTerminatedString(`CH${ch + 1}`);
    }

    // Song comment
    this.writer.writeNullTerminatedString(this.options.comment || '');

    // Master volume (4 bytes float)
    this.writer.writeFloat32(1.0);

    // Virtual tempo (2 bytes each)
    this.writer.writeUint16(150); // Virtual tempo numerator
    this.writer.writeUint16(1);   // Virtual tempo denominator

    // Update block size
    const blockEnd = this.writer.getOffset();
    this.writer.writeUint32At(sizeOffset, blockEnd - blockStart - 8);
  }

  /**
   * Write inline compatibility flags (for INFO block)
   * These are the legacy inline flags format, with modern defaults
   * @see furnace-master/src/engine/song.cpp DivCompatFlags::setDefaults()
   */
  private writeCompatFlags(): void {
    const flags = this.data.compatFlags || {};

    // Byte 0: limitSlides (bool)
    this.writer.writeUint8(flags.limitSlides ? 1 : 0);
    // Byte 1: linearPitch (0=off, 1=pitch only, 2=full)
    this.writer.writeUint8(flags.linearPitch ?? 1);
    // Byte 2: loopModality (0=reset, 1=row, 2=ordered)
    this.writer.writeUint8(flags.loopModality ?? 2);
    // Byte 3: properNoiseLayout
    this.writer.writeUint8(flags.properNoiseLayout !== false ? 1 : 0);
    // Byte 4: waveDutyIsVol
    this.writer.writeUint8(flags.waveDutyIsVol ? 1 : 0);
    // Byte 5: resetMacroOnPorta
    this.writer.writeUint8(flags.resetMacroOnPorta ? 1 : 0);
    // Byte 6: legacyVolumeSlides
    this.writer.writeUint8(flags.legacyVolumeSlides ? 1 : 0);
    // Byte 7: compatibleArpeggio
    this.writer.writeUint8(flags.compatibleArpeggio ? 1 : 0);
    // Byte 8: noteOffResetsSlides
    this.writer.writeUint8(flags.noteOffResetsSlides !== false ? 1 : 0);
    // Byte 9: targetResetsSlides
    this.writer.writeUint8(flags.targetResetsSlides !== false ? 1 : 0);
    // Byte 10: arpNonPorta
    this.writer.writeUint8(flags.arpNonPorta ? 1 : 0);
    // Byte 11: algMacroBehavior
    this.writer.writeUint8(flags.algMacroBehavior ? 1 : 0);
    // Byte 12: brokenShortcutSlides
    this.writer.writeUint8(flags.brokenShortcutSlides ? 1 : 0);
    // Byte 13: ignoreDuplicateSlides
    this.writer.writeUint8(flags.ignoreDuplicateSlides ? 1 : 0);
    // Byte 14: stopPortaOnNoteOff
    this.writer.writeUint8(flags.stopPortaOnNoteOff ? 1 : 0);
    // Byte 15: continuousVibrato
    this.writer.writeUint8(flags.continuousVibrato ? 1 : 0);
    // Byte 16: brokenDACMode
    this.writer.writeUint8(flags.brokenDACMode ? 1 : 0);
    // Byte 17: oneTickCut
    this.writer.writeUint8(flags.oneTickCut ? 1 : 0);
    // Byte 18: newInsTriggersInPorta
    this.writer.writeUint8(flags.newInsTriggersInPorta !== false ? 1 : 0);
    // Byte 19: arp0Reset
    this.writer.writeUint8(flags.arp0Reset !== false ? 1 : 0);
    // Byte 20: brokenSpeedSel
    this.writer.writeUint8(flags.brokenSpeedSel ? 1 : 0);
    // Byte 21: noSlidesOnFirstTick
    this.writer.writeUint8(flags.noSlidesOnFirstTick ? 1 : 0);
    // Byte 22: rowResetsArpPos
    this.writer.writeUint8(flags.rowResetsArpPos ? 1 : 0);
    // Byte 23: ignoreJumpAtEnd
    this.writer.writeUint8(flags.ignoreJumpAtEnd ? 1 : 0);
    // Byte 24: buggyPortaAfterSlide
    this.writer.writeUint8(flags.buggyPortaAfterSlide ? 1 : 0);
    // Byte 25: gbInsAffectsEnvelope
    this.writer.writeUint8(flags.gbInsAffectsEnvelope !== false ? 1 : 0);
    // Byte 26: sharedExtStat (default true)
    this.writer.writeUint8(flags.sharedExtStat !== false ? 1 : 0);
    // Byte 27: ignoreDACModeOutsideIntendedChannel
    this.writer.writeUint8(flags.ignoreDACModeOutsideIntendedChannel ? 1 : 0);
    // Byte 28: e1e2AlsoTakePriority
    this.writer.writeUint8(flags.e1e2AlsoTakePriority ? 1 : 0);
    // Byte 29: newSegaPCM
    this.writer.writeUint8(flags.newSegaPCM !== false ? 1 : 0);
    // Byte 30: fbPortaPause
    this.writer.writeUint8(flags.fbPortaPause ? 1 : 0);
    // Byte 31: snDutyReset
    this.writer.writeUint8(flags.snDutyReset ? 1 : 0);
    // Byte 32: pitchMacroIsLinear
    this.writer.writeUint8(flags.pitchMacroIsLinear !== false ? 1 : 0);
    // Byte 33: oldOctaveBoundary
    this.writer.writeUint8(flags.oldOctaveBoundary ? 1 : 0);
    // Byte 34: noOPN2Vol
    this.writer.writeUint8(flags.noOPN2Vol ? 1 : 0);
    // Byte 35: newVolumeScaling
    this.writer.writeUint8(flags.newVolumeScaling !== false ? 1 : 0);
    // Byte 36: volMacroLinger
    this.writer.writeUint8(flags.volMacroLinger !== false ? 1 : 0);
    // Byte 37: brokenOutVol
    this.writer.writeUint8(flags.brokenOutVol ? 1 : 0);
    // Byte 38: brokenOutVol2
    this.writer.writeUint8(flags.brokenOutVol2 ? 1 : 0);
    // Byte 39: e1e2StopOnSameNote
    this.writer.writeUint8(flags.e1e2StopOnSameNote ? 1 : 0);
    // Byte 40: brokenPortaArp
    this.writer.writeUint8(flags.brokenPortaArp ? 1 : 0);
    // Byte 41: snNoLowPeriods
    this.writer.writeUint8(flags.snNoLowPeriods ? 1 : 0);
    // Byte 42: disableSampleMacro
    this.writer.writeUint8(flags.disableSampleMacro ? 1 : 0);
    // Byte 43: oldArpStrategy
    this.writer.writeUint8(flags.oldArpStrategy ? 1 : 0);
    // Byte 44: brokenPortaLegato
    this.writer.writeUint8(flags.brokenPortaLegato ? 1 : 0);
    // Byte 45: brokenFMOff
    this.writer.writeUint8(flags.brokenFMOff ? 1 : 0);
    // Byte 46: preNoteNoEffect
    this.writer.writeUint8(flags.preNoteNoEffect ? 1 : 0);
    // Byte 47: oldDPCM
    this.writer.writeUint8(flags.oldDPCM ? 1 : 0);
    // Byte 48: resetArpPhaseOnNewNote
    this.writer.writeUint8(flags.resetArpPhaseOnNewNote ? 1 : 0);
    // Byte 49: ceilVolumeScaling
    this.writer.writeUint8(flags.ceilVolumeScaling ? 1 : 0);
    // Byte 50: oldAlwaysSetVolume
    this.writer.writeUint8(flags.oldAlwaysSetVolume ? 1 : 0);
    // Byte 51: oldSampleOffset
    this.writer.writeUint8(flags.oldSampleOffset ? 1 : 0);
    // Byte 52: pitchSlideSpeed
    this.writer.writeUint8(flags.pitchSlideSpeed ?? 4);
    // Byte 53: delayBehavior
    this.writer.writeUint8(flags.delayBehavior ?? 2);
    // Byte 54: jumpTreatment
    this.writer.writeUint8(flags.jumpTreatment ?? 0);
    // Byte 55: oldCenterRate (default true)
    this.writer.writeUint8(flags.oldCenterRate !== false ? 1 : 0);
    // Byte 56: noVolSlideReset
    this.writer.writeUint8(flags.noVolSlideReset ? 1 : 0);
    // Bytes 57-63: Reserved (7 bytes)
    for (let i = 57; i < 64; i++) {
      this.writer.writeUint8(0);
    }
  }

  /**
   * Write standalone CFLG block with key=value string format
   * @see furnace-master/src/engine/song.cpp DivCompatFlags::putData()
   *
   * Format:
   * - Magic: "CFLG" (4 bytes)
   * - Block size (4 bytes)
   * - Config string: key=value\n pairs (null-terminated)
   */
  private writeCompatFlagsBlock(): void {
    const flags = this.data.compatFlags || {};

    // Build config string with only non-default values
    // Default values from DivCompatFlags::setDefaults()
    const configPairs: string[] = [];

    // === Pitch/Slide Behavior ===
    if (flags.limitSlides === true) configPairs.push('limitSlides=1');
    if (flags.linearPitch !== undefined && flags.linearPitch !== 1) {
      configPairs.push(`linearPitch=${flags.linearPitch}`);
    }
    if (flags.pitchSlideSpeed !== undefined && flags.pitchSlideSpeed !== 4) {
      configPairs.push(`pitchSlideSpeed=${flags.pitchSlideSpeed}`);
    }

    // === Loop and Playback ===
    if (flags.loopModality !== undefined && flags.loopModality !== 2) {
      configPairs.push(`loopModality=${flags.loopModality}`);
    }
    if (flags.delayBehavior !== undefined && flags.delayBehavior !== 2) {
      configPairs.push(`delayBehavior=${flags.delayBehavior}`);
    }
    if (flags.jumpTreatment !== undefined && flags.jumpTreatment !== 0) {
      configPairs.push(`jumpTreatment=${flags.jumpTreatment}`);
    }
    if (flags.ignoreJumpAtEnd === true) configPairs.push('ignoreJumpAtEnd=1');

    // === Chip-Specific Behavior ===
    if (flags.properNoiseLayout === false) configPairs.push('properNoiseLayout=0');
    if (flags.waveDutyIsVol === true) configPairs.push('waveDutyIsVol=1');
    if (flags.gbInsAffectsEnvelope === false) configPairs.push('gbInsAffectsEnvelope=0');
    if (flags.newSegaPCM === false) configPairs.push('newSegaPCM=0');
    if (flags.ignoreDACModeOutsideIntendedChannel === true) configPairs.push('ignoreDACModeOutsideIntendedChannel=1');
    if (flags.snDutyReset === true) configPairs.push('snDutyReset=1');
    if (flags.snNoLowPeriods === true) configPairs.push('snNoLowPeriods=1');
    if (flags.noOPN2Vol === true) configPairs.push('noOPN2Vol=1');

    // === DAC/Sample Behavior ===
    if (flags.brokenDACMode === true) configPairs.push('brokenDACMode=1');
    if (flags.disableSampleMacro === true) configPairs.push('disableSampleMacro=1');
    if (flags.oldDPCM === true) configPairs.push('oldDPCM=1');
    if (flags.oldSampleOffset === true) configPairs.push('oldSampleOffset=1');
    if (flags.oldCenterRate === false) configPairs.push('oldCenterRate=0');

    // === Macro/Effect Behavior ===
    if (flags.resetMacroOnPorta === true) configPairs.push('resetMacroOnPorta=1');
    if (flags.legacyVolumeSlides === true) configPairs.push('legacyVolumeSlides=1');
    if (flags.compatibleArpeggio === true) configPairs.push('compatibleArpeggio=1');
    if (flags.noteOffResetsSlides === false) configPairs.push('noteOffResetsSlides=0');
    if (flags.targetResetsSlides === false) configPairs.push('targetResetsSlides=0');
    if (flags.arpNonPorta === true) configPairs.push('arpNonPorta=1');
    if (flags.algMacroBehavior === true) configPairs.push('algMacroBehavior=1');
    if (flags.continuousVibrato === true) configPairs.push('continuousVibrato=1');

    // === Portamento Behavior ===
    if (flags.stopPortaOnNoteOff === true) configPairs.push('stopPortaOnNoteOff=1');
    if (flags.newInsTriggersInPorta === false) configPairs.push('newInsTriggersInPorta=0');
    if (flags.buggyPortaAfterSlide === true) configPairs.push('buggyPortaAfterSlide=1');
    if (flags.fbPortaPause === true) configPairs.push('fbPortaPause=1');
    if (flags.brokenPortaArp === true) configPairs.push('brokenPortaArp=1');
    if (flags.brokenPortaLegato === true) configPairs.push('brokenPortaLegato=1');

    // === Arpeggio Behavior ===
    if (flags.arp0Reset === false) configPairs.push('arp0Reset=0');
    if (flags.rowResetsArpPos === true) configPairs.push('rowResetsArpPos=1');
    if (flags.oldArpStrategy === true) configPairs.push('oldArpStrategy=1');
    if (flags.resetArpPhaseOnNewNote === true) configPairs.push('resetArpPhaseOnNewNote=1');

    // === Slide/Shortcut Behavior ===
    if (flags.brokenShortcutSlides === true) configPairs.push('brokenShortcutSlides=1');
    if (flags.ignoreDuplicateSlides === true) configPairs.push('ignoreDuplicateSlides=1');
    if (flags.noSlidesOnFirstTick === true) configPairs.push('noSlidesOnFirstTick=1');

    // === Speed Selection ===
    if (flags.brokenSpeedSel === true) configPairs.push('brokenSpeedSel=1');

    // === Volume/Output Behavior ===
    if (flags.newVolumeScaling === false) configPairs.push('newVolumeScaling=0');
    if (flags.volMacroLinger === false) configPairs.push('volMacroLinger=0');
    if (flags.brokenOutVol === true) configPairs.push('brokenOutVol=1');
    if (flags.brokenOutVol2 === true) configPairs.push('brokenOutVol2=1');
    if (flags.pitchMacroIsLinear === false) configPairs.push('pitchMacroIsLinear=0');
    if (flags.oldOctaveBoundary === true) configPairs.push('oldOctaveBoundary=1');
    if (flags.ceilVolumeScaling === true) configPairs.push('ceilVolumeScaling=1');
    if (flags.oldAlwaysSetVolume === true) configPairs.push('oldAlwaysSetVolume=1');
    if (flags.noVolSlideReset === true) configPairs.push('noVolSlideReset=1');

    // === One Tick Cut ===
    if (flags.oneTickCut === true) configPairs.push('oneTickCut=1');

    // === E1/E2 Effect Behavior ===
    if (flags.e1e2AlsoTakePriority === true) configPairs.push('e1e2AlsoTakePriority=1');
    if (flags.e1e2StopOnSameNote === true) configPairs.push('e1e2StopOnSameNote=1');

    // === Shared/External State ===
    if (flags.sharedExtStat === false) configPairs.push('sharedExtStat=0');

    // === FM-Specific ===
    if (flags.brokenFMOff === true) configPairs.push('brokenFMOff=1');

    // === Pre-Note Effects ===
    if (flags.preNoteNoEffect === true) configPairs.push('preNoteNoEffect=1');

    // Only write block if there are non-default values
    if (configPairs.length === 0) {
      return; // All defaults, no need to write CFLG block
    }

    const blockStart = this.writer.getOffset();

    // Block magic
    this.writer.writeMagic(CFLG_MAGIC);

    // Block size placeholder
    const sizeOffset = this.writer.getOffset();
    this.writer.writeUint32(0);

    // Write config string (key=value\n pairs)
    const configString = configPairs.join('\n') + '\n';
    this.writer.writeNullTerminatedString(configString);

    // Update block size
    const blockEnd = this.writer.getOffset();
    this.writer.writeUint32At(sizeOffset, blockEnd - blockStart - 8);
  }

  private writeInstruments(): void {
    for (let i = 0; i < this.data.instruments.length; i++) {
      this.writeInstrument(this.data.instruments[i], i);
    }
  }

  private writeInstrument(inst: ParsedInstrument, _index: number): void {
    const blockStart = this.writer.getOffset();

    // Block magic
    this.writer.writeMagic(INST_MAGIC);

    // Block size placeholder
    const sizeOffset = this.writer.getOffset();
    this.writer.writeUint32(0);

    // Format version (2 bytes)
    this.writer.writeUint16(DIV_ENGINE_VERSION);

    // Instrument type (1 byte)
    const furType = this.getFurnaceInstrumentType(inst);
    this.writer.writeUint8(furType);

    // Reserved (1 byte)
    this.writer.writeUint8(0);

    // Instrument name
    this.writer.writeNullTerminatedString(inst.name || '');

    // Write type-specific data
    this.writeInstrumentData(inst, furType);

    // Write macros
    this.writeMacros(inst.furnace?.macros || []);

    // Update block size
    const blockEnd = this.writer.getOffset();
    this.writer.writeUint32At(sizeOffset, blockEnd - blockStart - 8);
  }

  private getFurnaceInstrumentType(inst: ParsedInstrument): number {
    if (inst.furnace?.chipType !== undefined) {
      return inst.furnace.chipType;
    }
    if (inst.furnace?.synthType) {
      return SYNTHTYPE_TO_FURNACE[inst.furnace.synthType] || 0;
    }
    // Default to standard if has samples, FM otherwise
    return inst.samples.length > 0 ? 4 : 0;
  }

  private writeInstrumentData(inst: ParsedInstrument, furType: number): void {
    // FM data (for FM-type instruments)
    if (furType === 1 || furType === 13 || furType === 14 || furType === 33 || furType === 19 || furType === 55) {
      this.writeFMData(inst);
    }

    // GB data
    if (furType === 2) {
      this.writeGBData(inst);
    }

    // C64 data
    if (furType === 3) {
      this.writeC64Data(inst);
    }

    // Amiga/sample data
    if (furType === 4) {
      this.writeAmigaData(inst);
    }

    // Other chip-specific data can be added here
  }

  private writeFMData(inst: ParsedInstrument): void {
    const fm = inst.furnace?.fm;

    // Algorithm (1 byte)
    this.writer.writeUint8(fm?.algorithm ?? 0);

    // Feedback (1 byte)
    this.writer.writeUint8(fm?.feedback ?? 0);

    // FMS (1 byte)
    this.writer.writeUint8(fm?.fms ?? 0);

    // AMS (1 byte)
    this.writer.writeUint8(fm?.ams ?? 0);

    // Operator count (1 byte) - usually 4
    const opCount = fm?.ops ?? 4;
    this.writer.writeUint8(opCount);

    // OPLL preset (1 byte)
    this.writer.writeUint8(fm?.opllPreset ?? 0);

    // Reserved (2 bytes)
    this.writer.writeUint16(0);

    // Write operators
    for (let op = 0; op < 4; op++) {
      const opData = fm?.operators?.[op];

      // AM (1 byte)
      this.writer.writeUint8(opData?.am ? 1 : 0);

      // AR (1 byte)
      this.writer.writeUint8(opData?.ar ?? 31);

      // DR (1 byte)
      this.writer.writeUint8(opData?.dr ?? 0);

      // MULT (1 byte)
      this.writer.writeUint8(opData?.mult ?? 1);

      // RR (1 byte)
      this.writer.writeUint8(opData?.rr ?? 15);

      // SL (1 byte)
      this.writer.writeUint8(opData?.sl ?? 0);

      // TL (1 byte)
      this.writer.writeUint8(opData?.tl ?? 0);

      // DT2 (1 byte)
      this.writer.writeUint8(opData?.dt2 ?? 0);

      // RS (1 byte)
      this.writer.writeUint8(opData?.rs ?? 0);

      // DT (1 byte)
      this.writer.writeUint8(opData?.dt ?? 0);

      // D2R (1 byte)
      this.writer.writeUint8(opData?.d2r ?? 0);

      // SSG-EG (1 byte)
      this.writer.writeUint8(opData?.ssg ?? 0);

      // DAM (1 byte)
      this.writer.writeUint8(0);

      // DVB (1 byte)
      this.writer.writeUint8(0);

      // EGT (1 byte)
      this.writer.writeUint8(0);

      // KSL (1 byte)
      this.writer.writeUint8(opData?.ksl ?? 0);

      // SUS (1 byte)
      this.writer.writeUint8(opData?.sus ? 1 : 0);

      // VIB (1 byte)
      this.writer.writeUint8(opData?.vib ? 1 : 0);

      // WS (1 byte)
      this.writer.writeUint8(opData?.ws ?? 0);

      // KSR (1 byte)
      this.writer.writeUint8(opData?.ksr ? 1 : 0);

      // Reserved (12 bytes)
      this.writer.writeZeros(12);
    }
  }

  private writeGBData(inst: ParsedInstrument): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chipConfig = inst.furnace?.chipConfig as Record<string, any> | undefined;

    // Envelope volume (1 byte)
    this.writer.writeUint8(chipConfig?.envVol ?? 15);

    // Envelope direction (1 byte)
    this.writer.writeUint8(chipConfig?.envDir ?? 0);

    // Envelope length (1 byte)
    this.writer.writeUint8(chipConfig?.envLen ?? 0);

    // Sound length (1 byte)
    this.writer.writeUint8(chipConfig?.soundLen ?? 64);

    // Hardware sequence length (1 byte)
    this.writer.writeUint8(chipConfig?.hwSeqLen ?? 0);

    // Reserved (3 bytes)
    this.writer.writeZeros(3);

    // Hardware sequence data (if any)
    // ... can be expanded
  }

  private writeC64Data(inst: ParsedInstrument): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chipConfig = inst.furnace?.chipConfig as Record<string, any> | undefined;

    // Triangle wave (1 byte)
    this.writer.writeUint8(chipConfig?.triOn ? 1 : 0);

    // Saw wave (1 byte)
    this.writer.writeUint8(chipConfig?.sawOn ? 1 : 0);

    // Pulse wave (1 byte)
    this.writer.writeUint8(chipConfig?.pulseOn ? 1 : 0);

    // Noise (1 byte)
    this.writer.writeUint8(chipConfig?.noiseOn ? 1 : 0);

    // Attack (1 byte)
    this.writer.writeUint8(chipConfig?.attack ?? 0);

    // Decay (1 byte)
    this.writer.writeUint8(chipConfig?.decay ?? 0);

    // Sustain (1 byte)
    this.writer.writeUint8(chipConfig?.sustain ?? 15);

    // Release (1 byte)
    this.writer.writeUint8(chipConfig?.release ?? 0);

    // Pulse width (2 bytes)
    this.writer.writeUint16(chipConfig?.pw ?? 2048);

    // Ring mod (1 byte)
    this.writer.writeUint8(chipConfig?.ringMod ? 1 : 0);

    // Sync (1 byte)
    this.writer.writeUint8(chipConfig?.oscSync ? 1 : 0);

    // Filter enable (1 byte)
    this.writer.writeUint8(chipConfig?.toFilter ? 1 : 0);

    // Init filter (1 byte)
    this.writer.writeUint8(chipConfig?.initFilter ? 1 : 0);

    // Vol macro is cutoff (1 byte)
    this.writer.writeUint8(chipConfig?.volIsCutoff ? 1 : 0);

    // Resonance (1 byte)
    this.writer.writeUint8(chipConfig?.res ?? 0);

    // Cutoff (2 bytes)
    this.writer.writeUint16(chipConfig?.cut ?? 0);

    // Highpass (1 byte)
    this.writer.writeUint8(chipConfig?.hp ? 1 : 0);

    // Bandpass (1 byte)
    this.writer.writeUint8(chipConfig?.bp ? 1 : 0);

    // Lowpass (1 byte)
    this.writer.writeUint8(chipConfig?.lp ? 1 : 0);

    // CH3 off (1 byte)
    this.writer.writeUint8(chipConfig?.ch3off ? 1 : 0);
  }

  private writeAmigaData(inst: ParsedInstrument): void {
    void inst;
    // Sample map (120 entries × 2 bytes each = 240 bytes)
    // Maps notes to sample indices
    for (let i = 0; i < 120; i++) {
      this.writer.writeUint16(0); // Default all notes to sample 0
    }

    // Initial sample (2 bytes)
    this.writer.writeUint16(0);

    // Use wavetable (1 byte)
    this.writer.writeUint8(0);

    // Use sample (1 byte)
    this.writer.writeUint8(1);

    // Wavetable length (4 bytes)
    this.writer.writeUint32(32);
  }

  private writeMacros(macros: FurnaceMacroData[]): void {
    // Number of macros (4 bytes)
    this.writer.writeUint32(macros.length);

    for (const macro of macros) {
      // Macro type (1 byte)
      this.writer.writeUint8(macro.type);

      // Length (2 bytes)
      this.writer.writeUint16(macro.data.length);

      // Loop point (2 bytes, signed)
      this.writer.writeInt16(macro.loop ?? -1);

      // Release point (2 bytes, signed)
      this.writer.writeInt16(macro.release ?? -1);

      // Mode (1 byte)
      this.writer.writeUint8(0); // Sequence mode

      // Open flags (1 byte)
      this.writer.writeUint8(1); // Open = true

      // Delay (1 byte)
      this.writer.writeUint8(0);

      // Speed (1 byte)
      this.writer.writeUint8(macro.speed ?? 1);

      // Reserved (4 bytes)
      this.writer.writeZeros(4);

      // Macro values (4 bytes each, signed)
      for (const val of macro.data) {
        this.writer.writeInt32(val);
      }
    }
  }

  private writeWavetables(): void {
    const wavetables = this.data.wavetables || [];

    for (let i = 0; i < wavetables.length; i++) {
      this.writeWavetable(wavetables[i], i);
    }
  }

  private writeWavetable(wt: FurnaceWavetableData, index: number): void {
    const blockStart = this.writer.getOffset();

    // Block magic
    this.writer.writeMagic(WAVE_MAGIC);

    // Block size placeholder
    const sizeOffset = this.writer.getOffset();
    this.writer.writeUint32(0);

    // Wavetable name
    this.writer.writeNullTerminatedString(`Wavetable ${index}`);

    // Width (4 bytes)
    const width = wt.len ?? wt.data.length;
    this.writer.writeUint32(width);

    // Height/max (4 bytes)
    const height = wt.max ?? 255;
    this.writer.writeUint32(height);

    // Reserved (4 bytes)
    this.writer.writeUint32(0);

    // Data (4 bytes per sample)
    for (let i = 0; i < width; i++) {
      this.writer.writeInt32(wt.data[i] ?? 0);
    }

    // Update block size
    const blockEnd = this.writer.getOffset();
    this.writer.writeUint32At(sizeOffset, blockEnd - blockStart - 8);
  }

  private writeSamples(): void {
    const samples = this.data.samples || [];

    for (let i = 0; i < samples.length; i++) {
      this.writeSample(samples[i], i);
    }
  }

  /**
   * Write groove pattern blocks
   * Format per GROV block:
   * - Magic: "GROV" (4 bytes)
   * - Block size (4 bytes)
   * - Length: number of values 1-16 (1 byte)
   * - Values: 16 x int16 (32 bytes total)
   */
  private writeGrooves(): void {
    const grooves = this.data.grooves || [];

    for (const groove of grooves) {
      const blockStart = this.writer.getOffset();

      // Block magic
      this.writer.writeMagic(GROV_MAGIC);

      // Block size placeholder
      const sizeOffset = this.writer.getOffset();
      this.writer.writeUint32(0);

      // Groove length (1 byte, clamped to 1-16)
      const len = Math.max(1, Math.min(16, groove.len));
      this.writer.writeUint8(len);

      // Groove values (16 x int16)
      // Each value is a tick speed for that step in the groove
      for (let i = 0; i < 16; i++) {
        const val = groove.val[i] ?? 6; // Default to 6 if not specified
        this.writer.writeInt16(Math.max(1, Math.min(255, val)));
      }

      // Update block size
      const blockEnd = this.writer.getOffset();
      this.writer.writeUint32At(sizeOffset, blockEnd - blockStart - 8);
    }
  }

  private writeSample(sample: ParsedSample, _index: number): void {
    const blockStart = this.writer.getOffset();

    // Block magic (use new SMP2 format)
    this.writer.writeMagic(SMP2_MAGIC);

    // Block size placeholder
    const sizeOffset = this.writer.getOffset();
    this.writer.writeUint32(0);

    // Sample name
    this.writer.writeNullTerminatedString(sample.name || '');

    // Sample length (4 bytes)
    this.writer.writeUint32(sample.length);

    // Compatibility rate (4 bytes)
    this.writer.writeUint32(sample.sampleRate);

    // C-4 rate (4 bytes)
    this.writer.writeUint32(sample.sampleRate);

    // Depth (1 byte) - 8=8bit, 16=16bit
    this.writer.writeUint8(sample.bitDepth === 16 ? 16 : 8);

    // Loop mode (1 byte) - 0=none, 1=forward, 2=pingpong
    const loopMode = sample.loopType === 'forward' ? 1 : sample.loopType === 'pingpong' ? 2 : 0;
    this.writer.writeUint8(loopMode);

    // BRR emphasis (1 byte)
    this.writer.writeUint8(0);

    // BRR no filter (1 byte)
    this.writer.writeUint8(0);

    // Loop start (4 bytes)
    this.writer.writeUint32(sample.loopStart);

    // Loop end (4 bytes)
    this.writer.writeUint32(sample.loopStart + sample.loopLength);

    // Sample data
    const pcmData = new Uint8Array(sample.pcmData);
    this.writer.writeBytes(pcmData);

    // Update block size
    const blockEnd = this.writer.getOffset();
    this.writer.writeUint32At(sizeOffset, blockEnd - blockStart - 8);
  }

  private writePatterns(): void {
    for (let i = 0; i < this.data.patterns.length; i++) {
      this.writePattern(this.data.patterns[i], i);
    }
  }

  private writePattern(pattern: Pattern, index: number): void {
    const blockStart = this.writer.getOffset();

    // Block magic (use new PATN format)
    this.writer.writeMagic(PATN_MAGIC);

    // Block size placeholder
    const sizeOffset = this.writer.getOffset();
    this.writer.writeUint32(0);

    // Subsong (1 byte)
    this.writer.writeUint8(0);

    // Channel (1 byte) - we write separate blocks per channel
    // Actually for PATN we write all channels in one block
    // Let's write the channel index
    for (let ch = 0; ch < pattern.channels.length; ch++) {
      // Channel index (2 bytes)
      this.writer.writeUint16(ch);

      // Pattern index (2 bytes)
      this.writer.writeUint16(index);

      // Subsong (1 byte)
      this.writer.writeUint8(0);

      // Reserved (1 byte)
      this.writer.writeUint8(0);

      // Pattern name
      this.writer.writeNullTerminatedString(pattern.name || `Pattern ${index}`);

      // Row data for this channel
      const rows = pattern.channels[ch]?.rows || [];
      for (let row = 0; row < pattern.length; row++) {
        this.writePatternRow(rows[row], ch, row);
      }
    }

    // Update block size
    const blockEnd = this.writer.getOffset();
    this.writer.writeUint32At(sizeOffset, blockEnd - blockStart - 8);
  }

  private writePatternRow(cell: TrackerCell | undefined, channel: number, row: number): void {
    void channel; void row;
    if (!cell) {
      // Empty cell: note=0, octave=0, ins=-1, vol=-1, effects empty
      this.writer.writeUint8(0);   // note
      this.writer.writeUint8(0);   // octave
      this.writer.writeInt16(-1);  // instrument
      this.writer.writeInt16(-1);  // volume
      this.writer.writeUint8(0);   // effect count
      return;
    }

    // Convert DEViLBOX note to Furnace format
    let note = 0;
    let octave = 0;

    if (cell.note === 97) {
      // Note off
      note = NOTE_OFF;
      octave = 0;
    } else if (cell.note > 0 && cell.note <= 96) {
      // Normal note: DEViLBOX uses (octave * 12) + semitone + 1
      const midiNote = cell.note - 1;
      note = (midiNote % 12) + 1; // 1-12
      octave = Math.floor(midiNote / 12);
    }

    this.writer.writeUint8(note);
    this.writer.writeUint8(octave);

    // Instrument (-1 = none)
    this.writer.writeInt16(cell.instrument > 0 ? cell.instrument - 1 : -1);

    // Volume (-1 = none)
    // Convert from XM volume column to Furnace volume
    let vol = -1;
    if (cell.volume >= 0x10 && cell.volume <= 0x50) {
      vol = (cell.volume - 0x10) * 2; // Scale 0-64 to 0-128
    }
    this.writer.writeInt16(vol);

    // Effects
    const effects: Array<{ type: number; value: number }> = [];

    if (cell.effTyp !== 0 || cell.eff !== 0) {
      effects.push({ type: cell.effTyp, value: cell.eff });
    }
    if (cell.effTyp2 !== 0 || cell.eff2 !== 0) {
      effects.push({ type: cell.effTyp2, value: cell.eff2 });
    }

    // Effect count
    this.writer.writeUint8(effects.length);

    // Write effects
    for (const fx of effects) {
      this.writer.writeUint8(fx.type);
      this.writer.writeUint8(fx.value);
    }
  }

  private getChannelCount(): number {
    if (this.data.patterns.length === 0) return 4;
    return this.data.patterns[0].channels?.length || 4;
  }
}

/**
 * Export a single instrument to Furnace .fui format
 */
export function exportInstrumentToFurnace(inst: ParsedInstrument): Uint8Array {
  const writer = new BinaryWriter(64 * 1024); // 64KB initial

  // File magic for instrument
  writer.writeMagic('INST');

  // Format version
  writer.writeUint16(DIV_ENGINE_VERSION);

  // Instrument type
  const furType = inst.furnace?.chipType ?? 0;
  writer.writeUint8(furType);

  // Reserved
  writer.writeUint8(0);

  // Instrument name
  writer.writeNullTerminatedString(inst.name || 'Untitled');

  // Write instrument data based on type
  // ... (similar to writeInstrumentData in FurnaceExporter)

  return writer.getBuffer();
}

// =============================================================================
// Furnace AY-3-8910 (Scramble) target
// =============================================================================
//
// Writes a song on AY-3-8910 voices as a version-228 .fur in the old INFO layout, the
// layout Furnace 0.6.x (engine 232) reads, for the BossGame Z80 player (Konami Scramble
// hardware: one AY-3-8910 at 1.789772 MHz, sound tick 58.3 Hz). Every block follows the
// reader in third-party/furnace-master/src/engine/fileOps/fur.cpp (old INFO path,
// version < 240): header with info pointer, INFO with pointer tables, FLAG, ADIR x3,
// INS2, PATN (new pattern format, version >= 157).
//
// Contract of the BossGame player (thoughts/spot/2026-11-13_ay-scramble-export.md):
// one AY-3-8910 (system 0x80), 3 channels, tick 58.3 Hz, instruments with sequence
// macros volume / arpeggio / duty (noise period) / wave (mixer bits) only, one loop
// point, no release; effects 00 01 02 03 04 0A 0B 0D 0F EC ED FF only. Anything else
// is left out of the file and named in the warnings.

export const FUR_AY_SCRAMBLE_VERSION = 228;
export const FUR_AY_SCRAMBLE_TICK_HZ = 58.3;
export const FUR_AY_SCRAMBLE_CHANNELS = 3;
const FUR_SYSTEM_AY8910 = 0x80;
/** ay.cpp setFlags: clockSel 0 = COLOR_NTSC / 2 = 1789772.5 Hz; chipType 0 = AY-3-8910. */
export const FUR_AY_SCRAMBLE_CHIP_FLAGS = 'clockSel=0\nchipType=0\n';
/** Effects the BossGame player runs. */
export const AY_SCRAMBLE_EFFECTS: ReadonlySet<number> = new Set([0x00, 0x01, 0x02, 0x03, 0x04, 0x0a, 0x0b, 0x0d, 0x0f, 0xec, 0xed, 0xff]);
/** Macro codes the BossGame player runs: volume, arpeggio, duty (noise period), wave (mixer bits). */
const AY_SCRAMBLE_MACRO_NAMES: Record<number, string> = { 0: 'volume', 1: 'arpeggio', 2: 'duty', 3: 'wave' };
/** Wave macro bit 2 turns the AY hardware envelope on, outside the contract. */
const AY_WAVE_ENVELOPE_BIT = 4;
const AY_FX_COLUMNS = 8;

export interface FurnaceAyScrambleResult {
  bytes: Uint8Array;
  /** Things left out or changed to fit the contract; the caller shows them to the user. */
  warnings: string[];
}

export function isAyInstrument(inst: InstrumentConfig): boolean {
  return inst.synthType === 'FurnaceAY' && !!inst.furnace;
}

/** Is the Scramble target on offer (at least one AY-3-8910 voice)? */
export function furnaceAyScrambleExportAvailable(instruments: InstrumentConfig[]): boolean {
  return instruments.some(isAyInstrument);
}

function ayFileInstrument(inst: InstrumentConfig, warnings: string[]): FileInstrument {
  const cfg = inst.furnace as FurnaceConfig;
  const label = `Instrument ${inst.id} "${inst.name}"`;
  const macros: FileMacro[] = [];
  for (const m of cfg.macros) {
    if (m.data.length === 0) continue;
    const code = m.code ?? 0;
    const name = AY_SCRAMBLE_MACRO_NAMES[code];
    if (!name) { warnings.push(`${label}: macro ${code} left out, the player runs volume, arpeggio, duty and wave macros only`); continue; }
    if (m.mode !== 0) { warnings.push(`${label}: ${name} macro left out, it is an ADSR or LFO macro, not a sequence`); continue; }
    if (m.release >= 0) warnings.push(`${label}: ${name} macro release point removed, the player has no release`);
    let data = m.data.slice(0, 255);
    if (code === 0 && data.some((v) => v < 0 || v > 15)) {
      warnings.push(`${label}: volume macro values clamped to 0-15`);
      data = data.map((v) => Math.max(0, Math.min(15, v)));
    }
    if (code === 3 && data.some((v) => (v & AY_WAVE_ENVELOPE_BIT) !== 0)) {
      warnings.push(`${label}: wave macro envelope bit removed, the player has no hardware envelope`);
      data = data.map((v) => v & ~AY_WAVE_ENVELOPE_BIT);
    }
    macros.push({
      code, length: data.length, loop: m.loop < 0 || m.loop >= data.length ? 255 : m.loop, release: 255,
      mode: 0, type: 0, delay: m.delay ?? 0, speed: m.speed ?? 1, data,
    });
  }
  if (cfg.opMacroArrays?.some((a) => a.some((m) => m.data.length > 0))) warnings.push(`${label}: per-operator macros left out`);
  return { name: inst.name, type: DIV_INS_AY, macros, samples: [], wavetables: [] };
}

function ayIsEmptyCell(c: FileCell): boolean {
  return c.note < 0 && c.ins < 0 && c.vol < 0 && c.fx.every((f) => f.type < 0 && f.val < 0);
}

/** PATN row data (fur.cpp new pattern format): skip bytes, mask, effect mask, values, 0xff end. */
function ayEncodeRows(rows: FileCell[], w: BinaryWriter): void {
  let i = 0;
  while (i < rows.length) {
    const c = rows[i];
    if (ayIsEmptyCell(c)) {
      let n = 1;
      while (i + n < rows.length && n < 129 && ayIsEmptyCell(rows[i + n])) n++;
      w.writeUint8(n >= 2 ? 128 | (n - 2) : 0);
      i += n;
      continue;
    }
    let mask = 0;
    let effectMask = 0;
    if (c.note >= 0) mask |= 1;
    if (c.ins >= 0) mask |= 2;
    if (c.vol >= 0) mask |= 4;
    if (c.fx[0].type >= 0) mask |= 8;
    if (c.fx[0].val >= 0) mask |= 16;
    for (let k = 1; k < AY_FX_COLUMNS; k++) {
      if (c.fx[k].type >= 0) effectMask |= 1 << (2 * k);
      if (c.fx[k].val >= 0) effectMask |= 1 << (2 * k + 1);
    }
    if (effectMask & 0x00ff) mask |= 32;
    if (effectMask & 0xff00) mask |= 64;
    w.writeUint8(mask);
    if (mask & 32) w.writeUint8(effectMask & 0xff);
    if (mask & 64) w.writeUint8(effectMask >> 8);
    if (c.note >= 0) w.writeUint8(c.note);
    if (c.ins >= 0) w.writeUint8(c.ins);
    if (c.vol >= 0) w.writeUint8(c.vol);
    for (let k = 0; k < AY_FX_COLUMNS; k++) {
      if (c.fx[k].type >= 0) w.writeUint8(c.fx[k].type);
      if (c.fx[k].val >= 0) w.writeUint8(c.fx[k].val);
    }
    i++;
  }
  w.writeUint8(0xff);
}

/** Block: 4-byte tag, u32 size patched after the body. */
function ayBlock(w: BinaryWriter, tag: string, body: () => void): number {
  const start = w.getOffset();
  w.writeMagic(tag);
  w.writeUint32(0);
  body();
  const end = w.getOffset();
  w.setOffset(start + 4);
  w.writeUint32(end - start - 8);
  w.setOffset(end);
  return start;
}

function ayPatch(w: BinaryWriter, at: number, value: number): void {
  const here = w.getOffset();
  w.setOffset(at);
  w.writeUint32(value);
  w.setOffset(here);
}

/**
 * Song on AY-3-8910 voices as a Furnace .fur for the BossGame Scramble player.
 * Throws when the song cannot be written at all; contract breaks that can be left out become warnings.
 */
export function exportFurnaceAyScramble(song: FurnaceModuleSong): FurnaceAyScrambleResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const nCh = FUR_AY_SCRAMBLE_CHANNELS;

  const ay = song.instruments.filter(isAyInstrument);
  const insIndexById = new Map<number, number>();
  ay.forEach((inst, i) => insIndexById.set(inst.id, i));
  const skipped = song.instruments.filter((i) => !isAyInstrument(i));
  if (skipped.length > 0) {
    warnings.push(`Left out ${skipped.length} instrument(s) that are not AY-3-8910 voices: ${skipped.map((i) => `${i.id} "${i.name}"`).join(', ')}`);
  }
  if (ay.length === 0) problems.push('The song has no AY-3-8910 instrument');

  if (song.patterns.length === 0) problems.push('The song has no patterns');
  if (song.patterns.length > 256) problems.push('A Furnace order table holds at most 256 patterns');
  if (song.songPositions.length === 0) problems.push('The order list is empty');
  if (song.songPositions.length > 256) problems.push('A Furnace order table holds at most 256 entries');
  for (const pos of song.songPositions) {
    if (!song.patterns[pos]) problems.push(`The order list points at pattern ${pos}, which does not exist`);
  }
  const patLen = Math.max(1, ...song.patterns.map((p) => p.length));
  if (patLen > 256) problems.push(`Pattern length ${patLen} is over the 256 rows of the INFO layout`);

  // Cells: one pattern per channel and pattern index, every ordered pattern written.
  const ordered = new Set(song.songPositions);
  const fxColumns = new Array<number>(nCh).fill(1);
  const dropped = new Map<string, number>();
  const pats: { ch: number; index: number; rows: FileCell[] }[] = [];
  for (const [pi, p] of song.patterns.entries()) {
    if (p.length !== patLen) problems.push(`Pattern ${pi} has ${p.length} rows but the song has ${patLen}: a Furnace song has one pattern length`);
    p.channels.slice(nCh).forEach((chan, k) => {
      if (chan.rows.some((c) => c.note > 0 || c.instrument > 0 || c.volume > 0)) {
        problems.push(`Pattern ${pi} channel ${nCh + k + 1} has notes but the AY-3-8910 has ${nCh} channels`);
      }
    });
    for (let ch = 0; ch < nCh; ch++) {
      const src = p.channels[ch];
      const rows: FileCell[] = [];
      for (let r = 0; r < patLen; r++) {
        const cell: TrackerCell | undefined = src?.rows[r];
        if (!cell || !src) {
          rows.push({ note: -1, ins: -1, vol: -1, fx: Array.from({ length: AY_FX_COLUMNS }, () => ({ type: -1, val: -1 })) });
          continue;
        }
        const where = `Pattern ${pi} channel ${ch + 1} row ${r}`;
        if (cell.instrument > 0 && !insIndexById.has(cell.instrument)) problems.push(`${where}: instrument ${cell.instrument} is not an AY-3-8910 instrument`);
        const fc = cellToFile(cell, insIndexById, where, [], effectNotationOf(src.channelMeta), warnings,
          trackerArpStopAt(song.patterns, song.songPositions, pi, ch, r));
        // cellToFile scales the volume column to 0-127; the AY channel volume is 0-15.
        if (fc.vol >= 0) fc.vol = Math.round(fc.vol * 15 / 127);
        for (const f of fc.fx) {
          if (f.type >= 0 && !AY_SCRAMBLE_EFFECTS.has(f.type)) {
            const key = f.type.toString(16).toUpperCase().padStart(2, '0');
            dropped.set(key, (dropped.get(key) ?? 0) + 1);
            f.type = -1; f.val = -1;
          }
        }
        rows.push(fc);
      }
      if (rows.every(ayIsEmptyCell) && !ordered.has(pi)) continue;
      rows.forEach((row) => row.fx.forEach((f, k) => { if (f.type >= 0 || f.val >= 0) fxColumns[ch] = Math.max(fxColumns[ch], k + 1); }));
      pats.push({ ch, index: pi, rows });
    }
  }
  for (const [key, n] of dropped) warnings.push(`Effect ${key} left out ${n} time(s): the Scramble player does not run it`);

  if (problems.length > 0) {
    const shown = problems.slice(0, 8).join('; ');
    throw new Error(`Cannot export for the AY-3-8910 (Scramble): ${shown}${problems.length > 8 ? `; and ${problems.length - 8} more` : ''}`);
  }

  const instruments = ay.map((inst) => ayFileInstrument(inst, warnings));
  const speed = Math.max(1, Math.min(255, song.initialSpeed));
  const w = new BinaryWriter(64 * 1024);

  // Header (fur.cpp: magic, version, reserved, info pointer, 8 reserved bytes)
  w.writeMagic(FILE_MAGIC);
  w.writeUint16(FUR_AY_SCRAMBLE_VERSION);
  w.writeUint16(0);
  w.writeUint32(32);
  w.writeZeros(8);

  let flagPtrAt = 0;
  const insPtrAt: number[] = [];
  const patPtrAt: number[] = [];
  const adirPtrAt: number[] = [];
  ayBlock(w, INFO_MAGIC, () => {
    w.writeUint8(0); // time base
    w.writeUint8(speed);
    w.writeUint8(speed);
    w.writeUint8(1); // arpeggio speed
    w.writeFloat32(FUR_AY_SCRAMBLE_TICK_HZ);
    w.writeUint16(patLen);
    w.writeUint16(song.songPositions.length);
    w.writeUint8(4);
    w.writeUint8(16);
    w.writeUint16(instruments.length);
    w.writeUint16(0); // wavetables
    w.writeUint16(0); // samples
    w.writeUint32(pats.length);
    for (let i = 0; i < 32; i++) w.writeUint8(i === 0 ? FUR_SYSTEM_AY8910 : 0);
    for (let i = 0; i < 32; i++) w.writeInt8(64); // chip volume (64 = 1.0)
    for (let i = 0; i < 32; i++) w.writeInt8(0); // chip panning
    for (let i = 0; i < 32; i++) { if (i === 0) flagPtrAt = w.getOffset(); w.writeUint32(0); }
    w.writeNullTerminatedString(song.name);
    w.writeNullTerminatedString('');
    w.writeFloat32(440);
    // Compat flags, version 37-69 set (Furnace defaults of a new song); fur.cpp reads 20 bytes here at any version.
    for (const v of [0, 1, 2, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]) w.writeUint8(v);
    for (let i = 0; i < instruments.length; i++) { insPtrAt.push(w.getOffset()); w.writeUint32(0); }
    for (let i = 0; i < pats.length; i++) { patPtrAt.push(w.getOffset()); w.writeUint32(0); }
    for (let ch = 0; ch < nCh; ch++) for (const pos of song.songPositions) w.writeUint8(pos);
    for (let ch = 0; ch < nCh; ch++) w.writeUint8(fxColumns[ch]);
    for (let ch = 0; ch < nCh; ch++) w.writeUint8(1); // shown
    for (let ch = 0; ch < nCh; ch++) w.writeUint8(0); // collapsed
    for (let ch = 0; ch < nCh; ch++) w.writeNullTerminatedString('');
    for (let ch = 0; ch < nCh; ch++) w.writeNullTerminatedString('');
    w.writeNullTerminatedString(''); // song notes
    w.writeFloat32(1); // master volume
    // Compat flags, version 70-130 set: brokenSpeedSel .. oldArpStrategy (with autoSystem at 115).
    for (const v of [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 4, 0, 0, 1, 1, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0]) w.writeUint8(v);
    w.writeUint16(150); // virtual tempo
    w.writeUint16(150);
    w.writeNullTerminatedString(''); // subsong name
    w.writeNullTerminatedString(''); // subsong notes
    w.writeUint8(0); // additional subsongs
    w.writeZeros(3);
    for (const s of [`AY-3-8910 (Scramble)`, '', '', '', '', '']) w.writeNullTerminatedString(s);
    w.writeFloat32(1); w.writeFloat32(0); w.writeFloat32(0); // chip volume, panning, front/rear
    w.writeUint32(0); // patchbay connections
    w.writeUint8(1); // automatic patchbay
    // Compat flags, version 138-200 set: brokenPortaLegato .. oldSampleOffset.
    for (let i = 0; i < 8; i++) w.writeUint8(0);
    w.writeUint8(1); // speed pattern length
    for (let i = 0; i < 16; i++) w.writeUint8(i === 0 ? speed : 0);
    w.writeUint8(0); // grooves
    for (let i = 0; i < 3; i++) { adirPtrAt.push(w.getOffset()); w.writeUint32(0); }
  });

  ayPatch(w, flagPtrAt, ayBlock(w, 'FLAG', () => w.writeNullTerminatedString(FUR_AY_SCRAMBLE_CHIP_FLAGS)));
  for (const at of adirPtrAt) ayPatch(w, at, ayBlock(w, 'ADIR', () => { w.writeUint32(0); }));
  instruments.forEach((inst, i) => {
    const at = w.getOffset();
    w.writeBytes(encodeInstrumentAsINS2(inst, FUR_AY_SCRAMBLE_VERSION));
    ayPatch(w, insPtrAt[i], at);
  });
  pats.forEach((p, i) => {
    ayPatch(w, patPtrAt[i], ayBlock(w, PATN_MAGIC, () => {
      w.writeUint8(0); // subsong
      w.writeUint8(p.ch);
      w.writeUint16(p.index);
      w.writeNullTerminatedString('');
      ayEncodeRows(p.rows, w);
    }));
  });

  return { bytes: pako.deflate(w.getBuffer()), warnings };
}
