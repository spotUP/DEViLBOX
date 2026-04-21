/**
 * Furnace Tracker Song (.fur) Parser
 *
 * 1:1 implementation based on:
 * - Official format specification: https://github.com/tildearrow/furnace/blob/master/papers/format.md
 * - Reference implementation: furnace-master/src/engine/fileOps/fur.cpp
 *
 * Supports:
 * - Format versions 12-228+ (Furnace 0.2 to 0.6.8.1)
 * - Both old (INFO) and new (INF2) song info headers
 * - Old (PATR) and new (PATN) pattern formats
 * - Old (SMPL) and new (SMP2) sample formats
 * - All chip types and configurations
 *
 * TIMING FORMULA (CRITICAL):
 * Furnace uses hz (ticks per second, typically 50 or 60) and speed (ticks per row).
 * Our replayer uses ProTracker timing: tickInterval = 2.5 / BPM
 * Conversion: BPM = 2.5 * hz / speed * (virtualTempo / virtualTempoD)
 * 
 * PATTERN NOTE FORMAT:
 * - New format (PATN): 0=C-(-5), 179=B-9, 180=note off, 181=note release, 182=macro release
 * - Old format (PATR): 1=C#, 2=D, ..., 11=B, 12=C (next octave, legacy), 100=off, 101=release, 102=macro release
 *   Octave is signed byte (255=-1, 254=-2, etc.)
 */

import { BinaryReader } from '../../../utils/BinaryReader';
import type {
  ParsedInstrument,
  ParsedSample,
  ImportMetadata,
  FurnaceInstrumentData,
  FurnaceNativeData,
  FurnaceSubsong,
  FurnaceChannelData,
  FurnacePatternData,
  FurnaceRow,
} from '../../../types/tracker';
import type { FurnaceOperatorConfig, SynthType } from '../../../types/instrument';

// Sub-parser modules
import { decompressFur, readString } from './furnace/FurnaceBinaryReader';
import {
  parsePattern,
  convertFurnaceCell,
  convertFurnaceNoteValue,
} from './furnace/FurnacePatternParser';
import { parseInstrument, encodeInstrumentAsINS2 } from './furnace/FurnaceInstrumentParser';

// Re-export sub-parser types so existing consumers keep working
export type {
  FurnacePatternCell,
  FurnacePattern,
  ConvertedPatternCell,
} from './furnace/FurnacePatternParser';
export type {
  FurnaceInstrument,
  FurnaceMacro,
  FurnaceGBData,
  FurnaceC64Data,
  FurnaceSNESData,
  FurnaceN163Data,
  FurnaceFDSData,
} from './furnace/FurnaceInstrumentParser';

// Format version constants
const DIV_ENGINE_VERSION = 245;

/**
 * Furnace instrument type (DIV_INS_*) to DEViLBOX SynthType mapping
 * Based on furnace-master/src/engine/instrument.h
 */
const FURNACE_TYPE_MAP: Record<number, SynthType> = {
  0: 'ChipSynth',           // DIV_INS_STD - Standard
  1: 'FurnaceOPN',          // DIV_INS_FM - FM synthesis (Genesis/Megadrive)
  2: 'FurnaceGB',           // DIV_INS_GB - Game Boy
  3: 'FurnaceC64',          // DIV_INS_C64 - Commodore 64 SID
  4: 'Sampler',             // DIV_INS_AMIGA - Amiga samples
  5: 'FurnacePCE',          // DIV_INS_PCE - PC Engine / TurboGrafx-16
  6: 'FurnaceAY',           // DIV_INS_AY - AY-3-8910 (ZX Spectrum, MSX)
  7: 'FurnaceAY',           // DIV_INS_AY8930 - AY8930 (enhanced AY)
  8: 'FurnaceTIA',          // DIV_INS_TIA - Atari 2600
  9: 'FurnaceSAA',          // DIV_INS_SAA1099 - Philips SAA1099
  10: 'FurnaceVIC',         // DIV_INS_VIC - VIC-20
  11: 'ChipSynth',          // DIV_INS_PET - Commodore PET
  12: 'FurnaceVRC6',        // DIV_INS_VRC6 - Konami VRC6
  13: 'FurnaceOPLL',        // DIV_INS_OPLL - Yamaha YM2413
  14: 'FurnaceOPL',         // DIV_INS_OPL - Yamaha YM3526/YM3812/YMF262
  15: 'FurnaceFDS',         // DIV_INS_FDS - Famicom Disk System
  16: 'FurnaceVB',          // DIV_INS_VBOY - Virtual Boy
  17: 'FurnaceN163',        // DIV_INS_N163 - Namco 163
  18: 'FurnaceSCC',         // DIV_INS_SCC - Konami SCC
  19: 'FurnaceOPZ',         // DIV_INS_OPZ - Yamaha YM2414
  20: 'ChipSynth',          // DIV_INS_POKEY - Atari POKEY
  21: 'ChipSynth',          // DIV_INS_BEEPER - PC Speaker
  22: 'FurnaceSWAN',        // DIV_INS_SWAN - WonderSwan
  23: 'FurnaceLynx',        // DIV_INS_MIKEY - Atari Lynx
  24: 'FurnaceVERA',        // DIV_INS_VERA - Commander X16
  25: 'FurnaceX1_010',      // DIV_INS_X1_010 - Seta X1-010
  26: 'FurnaceVRC6',        // DIV_INS_VRC6_SAW - VRC6 Sawtooth
  27: 'FurnaceES5506',      // DIV_INS_ES5506 - Ensoniq ES5506
  28: 'Sampler',            // DIV_INS_MULTIPCM - Sega MultiPCM
  29: 'FurnaceSNES',        // DIV_INS_SNES - Super Nintendo
  30: 'ChipSynth',          // DIV_INS_SU - Sound Unit
  31: 'ChipSynth',          // DIV_INS_NAMCO - Namco WSG
  32: 'FurnaceOPL',         // DIV_INS_OPL_DRUMS - OPL Drums
  33: 'FurnaceOPM',         // DIV_INS_OPM - Yamaha YM2151
  34: 'FurnaceNES',         // DIV_INS_NES - Nintendo NES
  35: 'Sampler',            // DIV_INS_MSM6258 - OKI MSM6258
  36: 'FurnaceOKI',         // DIV_INS_MSM6295 - OKI MSM6295
  37: 'Sampler',            // DIV_INS_ADPCMA - YM2610 ADPCM-A
  38: 'Sampler',            // DIV_INS_ADPCMB - YM2610 ADPCM-B
  39: 'FurnaceSEGAPCM',     // DIV_INS_SEGAPCM - Sega PCM
  40: 'FurnaceQSOUND',      // DIV_INS_QSOUND - Capcom QSound
  41: 'FurnaceYMZ280B',     // DIV_INS_YMZ280B - Yamaha YMZ280B
  42: 'FurnaceRF5C68',      // DIV_INS_RF5C68 - Ricoh RF5C68
  43: 'ChipSynth',          // DIV_INS_MSM5232 - OKI MSM5232
  44: 'FurnaceT6W28',       // DIV_INS_T6W28 - NEC T6W28
  45: 'FurnaceK007232',     // DIV_INS_K007232 - Konami K007232
  46: 'FurnaceGA20',        // DIV_INS_GA20 - Irem GA20
  47: 'ChipSynth',          // DIV_INS_POKEMINI - Pokemon Mini
  48: 'FurnaceSM8521',      // DIV_INS_SM8521 - Sharp SM8521
  49: 'ChipSynth',          // DIV_INS_PV1000 - Casio PV-1000
  50: 'FurnaceK053260',     // DIV_INS_K053260 - Konami K053260
  52: 'FurnaceTED',         // DIV_INS_TED - Commodore Plus/4
  53: 'FurnaceC140',        // DIV_INS_C140 - Namco C140
  54: 'Sampler',            // DIV_INS_C219 - Namco C219
  55: 'FurnaceESFM',        // DIV_INS_ESFM - ESS ESFM
  56: 'ChipSynth',          // DIV_INS_POWERNOISE - Power Noise
  57: 'ChipSynth',          // DIV_INS_POWERNOISE_SLOPE - Power Noise Slope
  58: 'ChipSynth',          // DIV_INS_DAVE - Enterprise DAVE
  59: 'Sampler',            // DIV_INS_NDS - Nintendo DS
  60: 'Sampler',            // DIV_INS_GBA_DMA - Game Boy Advance DMA
  61: 'Sampler',            // DIV_INS_GBA_MINMOD - Game Boy Advance MinMod
  62: 'ChipSynth',          // DIV_INS_BIFURCATOR - Bifurcator
  63: 'FurnaceC64',         // DIV_INS_SID2 - SID2
  64: 'FurnaceSUPERVISION', // DIV_INS_SUPERVISION - Watara Supervision
  65: 'FurnaceUPD1771',     // DIV_INS_UPD1771C - NEC μPD1771C
  66: 'FurnaceSID3',         // DIV_INS_SID3 - SID3
};

/**
 * Map Furnace instrument type to SynthType
 */
export function mapFurnaceInstrumentType(furType: number): SynthType {
  return FURNACE_TYPE_MAP[furType] || 'ChipSynth';
}

// Import types from sub-parser for internal use
import type {
  FurnaceInstrument,
} from './furnace/FurnaceInstrumentParser';
import type { FurnacePattern, ConvertedPatternCell } from './furnace/FurnacePatternParser';

// Element types for new format
const DIV_ELEMENT_END = 0x00;
const DIV_ELEMENT_SUBSONG = 0x01;
const DIV_ELEMENT_CHIP_FLAGS = 0x02;
const DIV_ELEMENT_ASSET_DIR = 0x03;
const DIV_ELEMENT_INSTRUMENT = 0x04;
const DIV_ELEMENT_WAVETABLE = 0x05;
const DIV_ELEMENT_SAMPLE = 0x06;
const DIV_ELEMENT_PATTERN = 0x07;
const DIV_ELEMENT_COMPAT_FLAGS = 0x08;
const DIV_ELEMENT_COMMENTS = 0x09;
const DIV_ELEMENT_GROOVE = 0x0a;
const CHIP_SYNTH_IDS = new Set([
  0x03,       // SN76489/SMS/PSG
  0x04,       // Game Boy
  0x05,       // PC Engine
  0x06,       // NES
  0x07,       // C64 8580
  0x47,       // C64 6581
  0xf0,       // SID2
  0x80,       // AY-3-8910
  0x82,       // YM2151/OPM
  0x83,       // YM2612/OPN2
  0x84,       // TIA
  0x87,       // SNES
  0x88,       // VRC6
  0x89,       // OPLL
  0x8a,       // FDS
  0x8d,       // YM2203/OPN
  0x8e,       // YM2608/OPNA
  0x8f,       // OPL
  0x90,       // OPL2
  0x91,       // OPL3
  0x97,       // SAA1099
  0x98,       // OPZ
  0xa0,       // YM2612 ext
  0x02,       // Genesis (compound)
]);

const CHIP_ID_TO_ENGINE_CHIP: Record<number, number> = {
  0x02: 0,    // Genesis (compound) → OPN2
  0x03: 3,    // SN76489/SMS → PSG
  0x04: 5,    // Game Boy → GB
  0x05: 6,    // PC Engine → PCE
  0x06: 4,    // NES → NES
  0x07: 10,   // C64 (8580) → SID
  0x47: 10,   // C64 (6581) → SID
  0xf0: 10,   // SID2 → SID
  0x80: 12,   // AY-3-8910 → AY
  0x81: 0,    // Amiga → OPN2 (placeholder, sample-based)
  0x82: 1,    // YM2151 → OPM
  0x83: 0,    // YM2612 → OPN2
  0x84: 15,   // TIA → TIA
  0x87: 24,   // SNES → SNES
  0x88: 9,    // VRC6 → VRC6
  0x89: 11,   // OPLL → OPLL
  0x8a: 16,   // FDS → FDS
  0x8d: 47,   // YM2203 → OPN
  0x8e: 13,   // YM2608 → OPNA
  0x8f: 2,    // OPL → OPL3
  0x90: 2,    // OPL2 → OPL3
  0x91: 2,    // OPL3 → OPL3
  0x97: 18,   // SAA1099 → SAA
  0x98: 22,   // OPZ → OPZ
  0xa0: 0,    // YM2612 ext → OPN2
};

/**
 * Convert old-format uint32 chip flags to key=value string.
 * 1:1 port of Furnace fur.cpp::convertOldFlags().
 * Takes file-format chip ID, converts to DivSystem enum internally.
 */
function convertOldChipFlags(oldFlags: number, fileChipId: number): string {
  const sys = FILE_ID_TO_ENUM[fileChipId] ?? 0;
  const parts: string[] = [];
  const set = (key: string, val: number | boolean | string) => {
    parts.push(`${key}=${typeof val === 'boolean' ? (val ? 'true' : 'false') : val}`);
  };

  switch (sys) {
    case 4: // DIV_SYSTEM_SMS
      switch (oldFlags & 0xff03) {
        case 0x0000: set('clockSel', 0); break;
        case 0x0001: set('clockSel', 1); break;
        case 0x0002: set('clockSel', 2); break;
        case 0x0003: set('clockSel', 3); break;
        case 0x0100: set('clockSel', 4); break;
        case 0x0101: set('clockSel', 5); break;
        case 0x0102: set('clockSel', 6); break;
      }
      switch (oldFlags & 0xcc) {
        case 0x00: set('chipType', 0); break;
        case 0x04: set('chipType', 1); break;
        case 0x08: set('chipType', 2); break;
        case 0x0c: set('chipType', 3); break;
        case 0x40: set('chipType', 4); break;
        case 0x44: set('chipType', 5); break;
        case 0x48: set('chipType', 6); break;
        case 0x4c: set('chipType', 7); break;
        case 0x80: set('chipType', 8); break;
        case 0x84: set('chipType', 9); break;
      }
      if (oldFlags & 16) set('noPhaseReset', true);
      break;

    case 6: // DIV_SYSTEM_GB
      set('chipType', oldFlags & 3);
      if (oldFlags & 8) set('noAntiClick', true);
      break;

    case 7: // DIV_SYSTEM_PCE
      set('clockSel', oldFlags & 1);
      set('chipType', (oldFlags & 4) ? 1 : 0);
      if (oldFlags & 8) set('noAntiClick', true);
      break;

    case 8:  // DIV_SYSTEM_NES
    case 27: // DIV_SYSTEM_VRC6
    case 29: // DIV_SYSTEM_FDS
    case 30: // DIV_SYSTEM_MMC5
    case 22: // DIV_SYSTEM_SAA1099
    case 44: // DIV_SYSTEM_OPZ
      switch (oldFlags) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
      }
      break;

    case 11: // DIV_SYSTEM_C64_6581
    case 12: // DIV_SYSTEM_C64_8580
      switch (oldFlags & 15) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
      }
      break;

    case 15: // DIV_SYSTEM_YM2610_CRAP
    case 16: // DIV_SYSTEM_YM2610_CRAP_EXT
    case 57: // DIV_SYSTEM_YM2610_FULL
    case 58: // DIV_SYSTEM_YM2610_FULL_EXT
    case 49: // DIV_SYSTEM_YM2610B
    case 63: // DIV_SYSTEM_YM2610B_EXT
    case 90: // DIV_SYSTEM_YM2610_CSM
    case 91: // DIV_SYSTEM_YM2610B_CSM
      switch (oldFlags & 0xff) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
      }
      break;

    case 17: // DIV_SYSTEM_AY8910
    case 23: // DIV_SYSTEM_AY8930
      switch (oldFlags & 15) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
        case 4: set('clockSel', 4); break;
        case 5: set('clockSel', 5); break;
        case 6: set('clockSel', 6); break;
        case 7: set('clockSel', 7); break;
        case 8: set('clockSel', 8); break;
        case 9: set('clockSel', 9); break;
        case 10: set('clockSel', 10); break;
        case 11: set('clockSel', 11); break;
        case 12: set('clockSel', 12); break;
        case 13: if (sys === 17) set('clockSel', 13); break;
        case 14: if (sys === 17) set('clockSel', 14); break;
      }
      if (sys === 17) {
        switch ((oldFlags >> 4) & 3) {
          case 0: set('chipType', 0); break;
          case 1: set('chipType', 1); break;
          case 2: set('chipType', 2); break;
          case 3: set('chipType', 3); break;
        }
      }
      if (oldFlags & 64) set('stereo', true);
      if (oldFlags & 128) set('halfClock', true);
      set('stereoSep', (oldFlags >> 8) & 255);
      break;

    case 18: // DIV_SYSTEM_AMIGA
      if (oldFlags & 1) set('clockSel', 1);
      if (oldFlags & 2) set('chipType', 1);
      if (oldFlags & 4) set('bypassLimits', true);
      set('stereoSep', (oldFlags >> 8) & 127);
      break;

    case 19: // DIV_SYSTEM_YM2151
      switch (oldFlags & 255) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
      }
      break;

    case 20: // DIV_SYSTEM_YM2612
    case 52: // DIV_SYSTEM_YM2612_EXT
    case 80: // DIV_SYSTEM_YM2612_DUALPCM
    case 81: // DIV_SYSTEM_YM2612_DUALPCM_EXT
    case 89: // DIV_SYSTEM_YM2612_CSM
      switch (oldFlags & 0x7fffffff) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
        case 4: set('clockSel', 4); break;
      }
      if (oldFlags & 0x80000000) set('ladderEffect', true);
      break;

    case 21: // DIV_SYSTEM_TIA
      set('clockSel', oldFlags & 1);
      switch ((oldFlags >> 1) & 3) {
        case 0: set('mixingType', 0); break;
        case 1: set('mixingType', 1); break;
        case 2: set('mixingType', 2); break;
      }
      break;

    case 24: // DIV_SYSTEM_VIC20
      set('clockSel', oldFlags & 1);
      break;

    case 26: // DIV_SYSTEM_SNES
      set('volScaleL', oldFlags & 127);
      set('volScaleR', (oldFlags >> 8) & 127);
      break;

    case 28: // DIV_SYSTEM_OPLL
    case 59: // DIV_SYSTEM_OPLL_DRUMS
      switch (oldFlags & 15) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
      }
      switch (oldFlags >> 4) {
        case 0: set('patchSet', 0); break;
        case 1: set('patchSet', 1); break;
        case 2: set('patchSet', 2); break;
        case 3: set('patchSet', 3); break;
      }
      break;

    case 31: // DIV_SYSTEM_N163
      switch (oldFlags & 15) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
      }
      set('channels', (oldFlags >> 4) & 7);
      if (oldFlags & 128) set('multiplex', true);
      break;

    case 32: // DIV_SYSTEM_YM2203
    case 33: // DIV_SYSTEM_YM2203_EXT
    case 92: // DIV_SYSTEM_YM2203_CSM
      switch (oldFlags & 31) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
        case 4: set('clockSel', 4); break;
        case 5: set('clockSel', 5); break;
      }
      switch ((oldFlags >> 5) & 3) {
        case 0: set('prescale', 0); break;
        case 1: set('prescale', 1); break;
        case 2: set('prescale', 2); break;
      }
      break;

    case 34: // DIV_SYSTEM_YM2608
    case 35: // DIV_SYSTEM_YM2608_EXT
    case 93: // DIV_SYSTEM_YM2608_CSM
      switch (oldFlags & 31) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
      }
      switch ((oldFlags >> 5) & 3) {
        case 0: set('prescale', 0); break;
        case 1: set('prescale', 1); break;
        case 2: set('prescale', 2); break;
      }
      break;

    case 36: // DIV_SYSTEM_OPL
    case 37: // DIV_SYSTEM_OPL2
    case 70: // DIV_SYSTEM_Y8950
    case 54: // DIV_SYSTEM_OPL_DRUMS
    case 55: // DIV_SYSTEM_OPL2_DRUMS
    case 71: // DIV_SYSTEM_Y8950_DRUMS
    case 76: // DIV_SYSTEM_YMZ280B
      switch (oldFlags & 0xff) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
        case 4: set('clockSel', 4); break;
        case 5: set('clockSel', 5); break;
      }
      break;

    case 38: // DIV_SYSTEM_OPL3
    case 56: // DIV_SYSTEM_OPL3_DRUMS
      switch (oldFlags & 0xff) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
        case 4: set('clockSel', 4); break;
      }
      break;

    case 40: // DIV_SYSTEM_PCSPKR
      set('speakerType', oldFlags & 3);
      break;

    case 42: // DIV_SYSTEM_RF5C68
      switch (oldFlags & 15) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
      }
      switch (oldFlags >> 4) {
        case 0: set('chipType', 0); break;
        case 1: set('chipType', 1); break;
      }
      break;

    case 48: // DIV_SYSTEM_VRC7
      switch (oldFlags & 15) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
      }
      break;

    case 50: // DIV_SYSTEM_SFX_BEEPER
    case 51: // DIV_SYSTEM_SFX_BEEPER_QUADTONE
      set('clockSel', oldFlags & 1);
      break;

    case 53: // DIV_SYSTEM_SCC
    case 72: // DIV_SYSTEM_SCC_PLUS
      switch (oldFlags & 63) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
      }
      break;

    case 61: // DIV_SYSTEM_QSOUND
      set('echoDelay', oldFlags & 0xfff);
      set('echoFeedback', (oldFlags >> 12) & 255);
      break;

    case 65: // DIV_SYSTEM_X1_010
      switch (oldFlags & 15) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
      }
      if (oldFlags & 16) set('stereo', true);
      break;

    case 67: // DIV_SYSTEM_OPL4
    case 68: // DIV_SYSTEM_OPL4_DRUMS
      switch (oldFlags & 0xff) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
      }
      break;

    case 73: // DIV_SYSTEM_SOUND_UNIT
      set('clockSel', oldFlags & 1);
      if (oldFlags & 4) set('echo', true);
      if (oldFlags & 8) set('swapEcho', true);
      set('sampleMemSize', (oldFlags >> 4) & 1);
      if (oldFlags & 32) set('pdm', true);
      set('echoDelay', (oldFlags >> 8) & 63);
      set('echoFeedback', (oldFlags >> 16) & 15);
      set('echoResolution', (oldFlags >> 20) & 15);
      set('echoVol', (oldFlags >> 24) & 255);
      break;

    case 74: // DIV_SYSTEM_MSM6295
      switch (oldFlags & 63) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
        case 4: set('clockSel', 4); break;
        case 5: set('clockSel', 5); break;
        case 6: set('clockSel', 6); break;
        case 7: set('clockSel', 7); break;
        case 8: set('clockSel', 8); break;
        case 9: set('clockSel', 9); break;
        case 10: set('clockSel', 10); break;
        case 11: set('clockSel', 11); break;
        case 12: set('clockSel', 12); break;
        case 13: set('clockSel', 13); break;
        case 14: set('clockSel', 14); break;
      }
      if (oldFlags & 128) set('rateSel', true);
      break;

    case 75: // DIV_SYSTEM_MSM6258
      switch (oldFlags) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
        case 3: set('clockSel', 3); break;
      }
      break;

    case 86: // DIV_SYSTEM_PCM_DAC
      {
        const flags = oldFlags || (0x1f0000 | 44099);
        set('rate', (flags & 0xffff) + 1);
        set('outDepth', (flags >> 16) & 15);
        if (flags & 0x100000) set('stereo', true);
      }
      break;

    case 41: // DIV_SYSTEM_POKEY
      switch (oldFlags & 15) {
        case 0: set('clockSel', 0); break;
        case 1: set('clockSel', 1); break;
        case 2: set('clockSel', 2); break;
      }
      break;

    default:
      break;
  }

  return parts.join('\n');
}

/**
 * Apply version-specific compat flags to chip flags.
 * Matches Furnace fur.cpp:2150-2400 — after convertOldFlags, additional flags
 * are set on systemFlags[] based on the file format version number.
 *
 * @param version - .fur file format version
 * @param systems - array of file-format chip IDs (e.g. 0x83 = YM2612)
 * @param chipFlags - mutable array of key=value\n flag strings per chip
 */
function applyVersionCompatFlags(version: number, systems: number[], chipFlags: string[]): void {
  // Helper: append a flag to a chip's flag string.
  // Ensures a newline separator between existing flags and the new flag,
  // since FLAG blocks from .fur files may not end with '\n'.
  const setFlag = (i: number, key: string, value: string | number | boolean) => {
    const existing = chipFlags[i] || '';
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    chipFlags[i] = existing + prefix + `${key}=${value}\n`;
  };

  // Helper: check if a flag is already set in a chip's flag string
  const hasFlag = (i: number, key: string): boolean => {
    const str = chipFlags[i] || '';
    return str.includes(`${key}=`);
  };

  // Convert file IDs to DivSystem enum values for matching
  const sysEnums = systems.map(id => FILE_ID_TO_ENUM[id] ?? id);

  for (let i = 0; i < systems.length; i++) {
    const sys = sysEnums[i];

    // ExtCh compat flags (fur.cpp:2150-2170)
    if (sys === 52 || // YM2612_EXT
        sys === 81 || // YM2612_DUALPCM_EXT
        sys === 58 || // YM2610_FULL_EXT
        sys === 63 || // YM2610B_EXT
        sys === 33 || // YM2203_EXT
        sys === 35 || // YM2608_EXT
        sys === 89 || // YM2612_CSM
        sys === 92 || // YM2203_CSM
        sys === 93 || // YM2608_CSM
        sys === 90 || // YM2610_CSM
        sys === 91) { // YM2610B_CSM
      if (version < 125) {
        setFlag(i, 'noExtMacros', true);
      }
      if (version < 133) {
        setFlag(i, 'fbAllOps', true);
      }
    }

    // SN noise compat (fur.cpp:2172-2180)
    if (version < 128) {
      if (sys === 4 || // SMS
          sys === 83) { // T6W28
        setFlag(i, 'noEasyNoise', true);
      }
    }

    // OPL3 pan compat (fur.cpp:2182-2190)
    if (version < 134) {
      if (sys === 38 || // OPL3
          sys === 56) { // OPL3_DRUMS
        setFlag(i, 'compatPan', true);
      }
    }

    // Namco C30 noise compat (fur.cpp:2218-2225)
    if (version < 145) {
      if (sys === 79) { // NAMCO_CUS30
        setFlag(i, 'newNoise', false);
      }
    }

    // SegaPCM slide compat (fur.cpp:2227-2234)
    if (version < 153) {
      if (sys === 46) { // SEGAPCM
        setFlag(i, 'oldSlides', true);
      }
    }

    // NES PCM compat (fur.cpp:2236-2243)
    if (version < 154) {
      if (sys === 8) { // NES
        setFlag(i, 'dpcmMode', false);
      }
    }

    // C64 key priority compat (fur.cpp:2245-2252)
    if (version < 160) {
      if (sys === 12 || // C64_8580
          sys === 11) { // C64_6581
        setFlag(i, 'keyPriority', false);
      }
    }

    // Namco 163 pitch compensation compat (fur.cpp:2254-2261)
    if (version < 165) {
      if (sys === 31) { // N163
        setFlag(i, 'lenCompensate', true);
      }
    }

    // OPM/OPZ slide compat (fur.cpp:2263-2271)
    if (version < 176) {
      if (sys === 19 || // YM2151
          sys === 44) { // OPZ
        setFlag(i, 'brokenPitch', true);
      }
    }

    // C64 1Exy compat (fur.cpp:2273-2280)
    if (version < 186) {
      if (sys === 12 || // C64_8580
          sys === 11) { // C64_6581
        setFlag(i, 'no1EUpdate', true);
      }
    }

    // C64 original reset time and multiply relative (fur.cpp:2282-2290)
    if (version < 187) {
      if (sys === 12 || // C64_8580
          sys === 11) { // C64_6581
        setFlag(i, 'initResetTime', 1);
        setFlag(i, 'multiplyRel', true);
      }
    }

    // OPLL fixedAll compat (fur.cpp:2292-2302)
    if (version < 194) {
      if (sys === 28 || // OPLL
          sys === 59) { // OPLL_DRUMS
        if (!hasFlag(i, 'fixedAll')) {
          setFlag(i, 'fixedAll', false);
        }
      }
    }

    // C64 macro race (fur.cpp:2304-2311)
    if (version < 195) {
      if (sys === 12 || // C64_8580
          sys === 11) { // C64_6581
        setFlag(i, 'macroRace', true);
      }
    }

    // VERA old chip revision / TIA old tuning (fur.cpp:2313-2336)
    if (version < 213) {
      if (sys === 62) { // VERA
        setFlag(i, 'chipType', 0);
      }
      if (sys === 21) { // TIA
        setFlag(i, 'oldPitch', true);
      }
    } else if (version < 217) {
      if (sys === 62) { // VERA
        setFlag(i, 'chipType', 1);
      }
    } else if (version < 229) {
      if (sys === 62) { // VERA
        setFlag(i, 'chipType', 2);
      }
    }

    // SNES no anti-click (fur.cpp:2338-2345)
    if (version < 220) {
      if (sys === 26) { // SNES
        setFlag(i, 'antiClick', false);
      }
    }

    // Y8950 broken ADPCM pitch (fur.cpp:2347-2354)
    if (version < 223) {
      if (sys === 70 || // Y8950
          sys === 71) { // Y8950_DRUMS
        setFlag(i, 'compatYPitch', true);
      }
    }

    // YM2612 chip type (fur.cpp:2356-2370)
    if (version < 231) {
      if (sys === 20 || // YM2612
          sys === 52 || // YM2612_EXT
          sys === 80 || // YM2612_DUALPCM
          sys === 81 || // YM2612_DUALPCM_EXT
          sys === 89) { // YM2612_CSM
        if (!hasFlag(i, 'chipType') && !hasFlag(i, 'ladderEffect')) {
          setFlag(i, 'chipType', 0);
        }
      }
    }

    // OPL4 default mix levels (fur.cpp:2403-2413)
    if (version < 242) {
      if (sys === 72 || // OPL4
          sys === 73) { // OPL4_DRUMS
        setFlag(i, 'fmMixL', 7);
        setFlag(i, 'fmMixR', 7);
        setFlag(i, 'pcmMixL', 7);
        setFlag(i, 'pcmMixR', 7);
      }
    }

    // Namco 163 no wave pos latch (fur.cpp:2415-2422)
    if (version < 244) {
      if (sys === 31) { // N163
        setFlag(i, 'posLatch', false);
      }
    }
  }
}

/**
 * Chip file ID → default instrument type (DIV_INS_*)
 * From Furnace sysDef.cpp channel definitions
 */
const CHIP_DEFAULT_INS_TYPE: Record<number, number> = {
  0x02: 1,    // Genesis → DIV_INS_FM
  0x03: 0,    // SN76489/SMS → DIV_INS_STD
  0x04: 2,    // Game Boy → DIV_INS_GB
  0x05: 5,    // PC Engine → DIV_INS_PCE
  0x06: 34,   // NES → DIV_INS_NES
  0x07: 3,    // C64 (8580) → DIV_INS_C64
  0x47: 3,    // C64 (6581) → DIV_INS_C64
  0x80: 6,    // AY-3-8910 → DIV_INS_AY
  0x81: 4,    // Amiga → DIV_INS_AMIGA
  0x82: 33,   // YM2151 → DIV_INS_OPM
  0x83: 1,    // YM2612 → DIV_INS_FM
  0x84: 8,    // TIA → DIV_INS_TIA
  0x85: 10,   // VIC-20 → DIV_INS_VIC
  0x87: 29,   // SNES → DIV_INS_SNES
  0x88: 12,   // VRC6 → DIV_INS_VRC6
  0x89: 13,   // OPLL → DIV_INS_OPLL
  0x8a: 15,   // FDS → DIV_INS_FDS
  0x8d: 1,    // YM2203 → DIV_INS_FM
  0x8e: 1,    // YM2608 → DIV_INS_FM
  0x8f: 14,   // OPL → DIV_INS_OPL
  0x90: 14,   // OPL2 → DIV_INS_OPL
  0x91: 14,   // OPL3 → DIV_INS_OPL
  0x97: 9,    // SAA1099 → DIV_INS_SAA1099
  0x98: 19,   // OPZ → DIV_INS_OPZ
  0x9a: 7,    // AY8930 → DIV_INS_AY8930
  0xa0: 1,    // YM2612 ext → DIV_INS_FM
};

// Chip ID mapping
const CHIP_CHANNELS: Record<number, number> = {
  0x00: 0,    // End of list
  0x01: 17,   // YMU759
  0x02: 10,   // Genesis (compound)
  0x03: 4,    // SN76489/SMS
  // Compound systems (old format < v119 stores these as single system IDs)
  0x08: 13,   // Arcade (compound: YM2151 + SegaPCM)
  0x09: 13,   // YM2610_CRAP (compound)
  0x42: 13,   // Genesis Extended (compound: YM2612_EXT + SMS)
  0x43: 13,   // SMS_OPLL (compound: SMS + OPLL)
  0x46: 11,   // NES_VRC7 (compound: NES + VRC7)
  0x49: 16,   // YM2610_CRAP_EXT (compound)
  0x04: 4,    // Game Boy
  0x05: 6,    // PC Engine
  0x06: 5,    // NES
  0x07: 3,    // C64 (8580)
  0x47: 3,    // C64 (6581)
  0x80: 3,    // AY-3-8910
  0x81: 4,    // Amiga
  0x82: 8,    // YM2151
  0x83: 6,    // YM2612
  0x84: 2,    // TIA
  0x85: 4,    // VIC-20
  0x86: 1,    // PET
  0x87: 8,    // SNES
  0x88: 3,    // VRC6
  0x89: 9,    // OPLL
  0x8a: 1,    // FDS
  0x8b: 3,    // MMC5
  0x8c: 8,    // Namco 163
  0x8d: 6,    // YM2203
  0x8e: 16,   // YM2608
  0x8f: 9,    // OPL
  0x90: 9,    // OPL2
  0x91: 18,   // OPL3
  0x92: 28,   // MultiPCM
  0x93: 1,    // PC Speaker
  0x94: 4,    // POKEY
  0x95: 8,    // RF5C68
  0x96: 4,    // WonderSwan
  0x97: 6,    // SAA1099
  0x98: 8,    // OPZ
  0x99: 1,    // Pokémon Mini
  0x9a: 3,    // AY8930
  0x9b: 16,   // SegaPCM
  0x9c: 6,    // Virtual Boy
  0x9d: 6,    // VRC7
  0x9e: 16,   // YM2610B
  0x9f: 6,    // ZX Beeper SFX
  0xa0: 9,    // YM2612 extended (sysDef says 9; dispatch creates 13 but order table uses 9)
  0xa1: 5,    // SCC
  0xa2: 11,   // OPL drums
  0xa3: 11,   // OPL2 drums
  0xa4: 20,   // OPL3 drums
  0xa5: 14,   // Neo Geo (YM2610)
  0xa6: 17,   // Neo Geo extended
  0xa7: 11,   // OPLL drums
  0xa8: 4,    // Lynx
  0xa9: 5,    // SegaPCM (compat 5ch mode)
  0xaa: 4,    // MSM6295
  0xab: 1,    // MSM6258
  0xac: 17,   // VERA
  0xad: 2,    // Bubble System WSG
  0xae: 42,   // OPL4
  0xaf: 44,   // OPL4 drums
  0xb0: 16,   // X1-010
  0xb1: 32,   // ES5506
  0xb2: 10,   // Y8950
  0xb3: 12,   // Y8950 drums
  0xb4: 5,    // SCC+
  0xb5: 8,    // Sound Unit
  0xb6: 9,    // YM2203 extended
  0xb7: 19,   // YM2608 extended
  0xb8: 8,    // YMZ280B
  0xb9: 3,    // Namco WSG
  0xba: 8,    // Namco C15
  0xbb: 8,    // Namco C30
  0xbc: 8,    // MSM5232
  0xbd: 11,   // YM2612 DualPCM extended
  0xbe: 7,    // YM2612 DualPCM
  0xbf: 4,    // T6W28
  0xc0: 1,    // PCM DAC
  0xc1: 10,   // YM2612 CSM
  0xc2: 18,   // Neo Geo CSM
  0xc3: 10,   // YM2203 CSM
  0xc4: 20,   // YM2608 CSM
  0xc5: 20,   // YM2610B CSM
  0xc6: 2,    // K007232
  0xc7: 4,    // GA20
  0xc8: 3,    // SM8521
  0xca: 5,    // ZX QuadTone
  0xcb: 3,    // PV-1000
  0xcc: 4,    // K053260
  0xcd: 2,    // TED
  0xce: 24,   // C140
  0xcf: 16,   // C219
  0xd1: 18,   // ESFM
  0xd4: 4,    // PowerNoise
  0xd5: 6,    // Dave
  0xd6: 16,   // NDS
  0xd7: 2,    // GBA direct
  0xd8: 16,   // GBA MinMod
  0xd9: 4,    // Bifurcator
  0xde: 19,   // YM2610B extended
  0xe0: 19,   // QSound
  0xe2: 4,    // C64 6581 PCM
  0xe3: 4,    // Supervision
  0xe5: 4,    // µPD1771C
  0xf0: 3,    // SID2
  0xf1: 5,    // 5E01
  0xf5: 7,    // SID3
  0xfc: 1,    // Pong
  0xfd: 8,    // Dummy
};

/**
 * Map Furnace file format IDs → C++ DivSystem enum values.
 * The .fur file stores its own ID scheme (e.g. 0x83 = YM2612),
 * but the WASM dispatch wrapper expects the C++ enum value (e.g. 20 = YM2612).
 * Built from Furnace sysDef.cpp: sysDefs[ENUM]->id = FILE_ID.
 */
const FILE_ID_TO_ENUM: Record<number, number> = {
  0x01: 1,    // YMU759
  0x02: 2,    // GENESIS (compound)
  0x42: 3,    // GENESIS_EXT (compound)
  0x03: 4,    // SMS
  0x43: 5,    // SMS_OPLL (compound)
  0x04: 6,    // GB
  0x05: 7,    // PCE
  0x06: 8,    // NES
  0x46: 9,    // NES_VRC7 (compound)
  0x47: 11,   // C64_6581
  0x07: 12,   // C64_8580
  0x08: 13,   // ARCADE (compound)
  0x09: 15,   // YM2610_CRAP
  0x49: 16,   // YM2610_CRAP_EXT
  0x80: 17,   // AY8910
  0x81: 18,   // AMIGA
  0x82: 19,   // YM2151
  0x83: 20,   // YM2612
  0x84: 21,   // TIA
  0x97: 22,   // SAA1099
  0x9a: 23,   // AY8930
  0x85: 24,   // VIC20
  0x86: 25,   // PET
  0x87: 26,   // SNES
  0x88: 27,   // VRC6
  0x89: 28,   // OPLL
  0x8a: 29,   // FDS
  0x8b: 30,   // MMC5
  0x8c: 31,   // N163
  0x8d: 32,   // YM2203
  0xb6: 33,   // YM2203_EXT
  0x8e: 34,   // YM2608
  0xb7: 35,   // YM2608_EXT
  0x8f: 36,   // OPL
  0x90: 37,   // OPL2
  0x91: 38,   // OPL3
  0x92: 39,   // MULTIPCM
  0x93: 40,   // PCSPKR
  0x94: 41,   // POKEY
  0x95: 42,   // RF5C68
  0x96: 43,   // SWAN
  0x98: 44,   // OPZ
  0x99: 45,   // POKEMINI
  0x9b: 46,   // SEGAPCM
  0x9c: 47,   // VBOY
  0x9d: 48,   // VRC7
  0x9e: 49,   // YM2610B
  0x9f: 50,   // SFX_BEEPER
  0xca: 51,   // SFX_BEEPER_QUADTONE
  0xa0: 52,   // YM2612_EXT
  0xa1: 53,   // SCC
  0xa2: 54,   // OPL_DRUMS
  0xa3: 55,   // OPL2_DRUMS
  0xa4: 56,   // OPL3_DRUMS
  0xa5: 57,   // YM2610_FULL
  0xa6: 58,   // YM2610_FULL_EXT
  0xa7: 59,   // OPLL_DRUMS
  0xa8: 60,   // LYNX
  0xe0: 61,   // QSOUND
  0xac: 62,   // VERA
  0xde: 63,   // YM2610B_EXT
  0xa9: 64,   // SEGAPCM_COMPAT
  0xb0: 65,   // X1_010
  0xad: 66,   // BUBSYS_WSG
  0xae: 67,   // OPL4
  0xaf: 68,   // OPL4_DRUMS
  0xb1: 69,   // ES5506
  0xb2: 70,   // Y8950
  0xb3: 71,   // Y8950_DRUMS
  0xb4: 72,   // SCC_PLUS
  0xb5: 73,   // SOUND_UNIT
  0xaa: 74,   // MSM6295
  0xab: 75,   // MSM6258
  0xb8: 76,   // YMZ280B
  0xb9: 77,   // NAMCO
  0xba: 78,   // NAMCO_15XX
  0xbb: 79,   // NAMCO_CUS30
  0xbe: 80,   // YM2612_DUALPCM
  0xbd: 81,   // YM2612_DUALPCM_EXT
  0xbc: 82,   // MSM5232
  0xbf: 83,   // T6W28
  0xc6: 84,   // K007232
  0xc7: 85,   // GA20
  0xc0: 86,   // PCM_DAC
  0xfc: 87,   // PONG
  0xfd: 88,   // DUMMY
  0xc1: 89,   // YM2612_CSM
  0xc2: 90,   // YM2610_CSM
  0xc5: 91,   // YM2610B_CSM
  0xc3: 92,   // YM2203_CSM
  0xc4: 93,   // YM2608_CSM
  0xc8: 94,   // SM8521
  0xcb: 95,   // PV1000
  0xcc: 96,   // K053260
  0xcd: 97,   // TED
  0xce: 98,   // C140
  0xcf: 99,   // C219
  0xd1: 100,  // ESFM
  0xd4: 101,  // POWERNOISE
  0xd5: 102,  // DAVE
  0xd6: 103,  // NDS
  0xd7: 104,  // GBA_DMA
  0xd8: 105,  // GBA_MINMOD
  0xf1: 106,  // 5E01
  0xd9: 107,  // BIFURCATOR
  0xf0: 108,  // SID2
  0xe3: 109,  // SUPERVISION
  0xe5: 110,  // UPD1771C
  0xf5: 111,  // SID3
  0xe2: 112,  // C64_PCM
};

// SubSong (kept here — used by orchestrator and module type)
export interface FurnaceSubSong {
  name: string;
  comment: string;
  timeBase: number;
  speed1: number;
  speed2: number;
  speedPattern?: number[];   // Full speed pattern (len 1-16), for groove-style initial speeds
  arpLen: number;
  hz: number;
  patLen: number;
  ordersLen: number;
  hilightA: number;
  hilightB: number;
  virtualTempo: number;
  virtualTempoD: number;
  orders: number[][];       // [channel][order] = pattern index
  effectColumns: number[];  // effects per channel
  channelNames: string[];
  channelShortNames: string[];
}

// Sample
export interface FurnaceSample {
  name: string;
  length: number;
  compatRate: number;
  c4Rate: number;
  depth: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  loopDirection: number;
  data: Int16Array | Int8Array | Uint8Array;
}

// Wavetable
export interface FurnaceWavetable {
  name: string;
  width: number;
  height: number;
  data: number[];
}

// Full module
export interface FurnaceModule {
  // Meta
  name: string;
  author: string;
  category: string;
  systemName: string;
  tuning: number;
  masterVol: number;

  // Version
  version: number;

  // Systems/Chips
  systemLen: number;
  systems: number[];
  systemChans: number[];
  systemVol: number[];
  systemPan: number[];
  systemPanFR: number[];

  // Total channels
  chans: number;

  // SubSongs
  subsongs: FurnaceSubSong[];

  // Assets
  instruments: FurnaceInstrument[];
  wavetables: FurnaceWavetable[];
  samples: FurnaceSample[];

  // Patterns - keyed by "subsong_channel_index"
  patterns: Map<string, FurnacePattern>;

  // Song comment
  comment: string;

  // Compatibility flags (parsed from inline bytes)
  compatFlags: Record<string, unknown>;

  // Groove patterns (each entry is an array of speed values, length from groove.len)
  grooves: Array<{ len: number; val: number[] }>;

  // Per-chip flag strings (key=value\n format for clock/model selection)
  chipFlags?: string[];
}

/**
 * Parse the main Furnace song file
 */
export async function parseFurnaceSong(buffer: ArrayBuffer): Promise<FurnaceModule> {
  const rawData = new Uint8Array(buffer);
  const data = decompressFur(rawData);
  const reader = new BinaryReader(data.buffer as ArrayBuffer);

  // Read magic header (16 bytes)
  const magic = reader.readMagic(16);
  if (!magic.startsWith('-Furnace module-')) {
    throw new Error(`Invalid Furnace file header: "${magic}"`);
  }

  // Read version
  const version = reader.readUint16();
  reader.skip(2); // Reserved

  console.log(`[FurnaceSongParser] Format version: ${version}`);

  if (version > DIV_ENGINE_VERSION) {
    console.warn(`[FurnaceSongParser] Module version ${version} is newer than supported ${DIV_ENGINE_VERSION}`);
  }

  // Read song info pointer
  const infoSeek = reader.readUint32();

  // Seek to song info
  reader.seek(infoSeek);

  // Initialize module
  const module: FurnaceModule = {
    name: '',
    author: '',
    category: '',
    systemName: '',
    tuning: 440.0,
    masterVol: 1.0,
    version,
    systemLen: 0,
    systems: [],
    systemChans: [],
    systemVol: [],
    systemPan: [],
    systemPanFR: [],
    chans: 0,
    subsongs: [],
    instruments: [],
    wavetables: [],
    samples: [],
    patterns: new Map(),
    comment: '',
    compatFlags: {},
    grooves: [],
  };

  if (version >= 240) {
    // New format (INF2) — set DivCompatFlags defaults (song.cpp:1111-1161)
    // CFLG block overrides these if present; if absent, defaults are correct
    module.compatFlags = {
      limitSlides: false,
      linearPitch: 1,
      pitchSlideSpeed: 4,
      loopModality: 2,
      delayBehavior: 2,
      jumpTreatment: 0,
      properNoiseLayout: true,
      waveDutyIsVol: false,
      resetMacroOnPorta: false,
      legacyVolumeSlides: false,
      compatibleArpeggio: false,
      noteOffResetsSlides: true,
      targetResetsSlides: true,
      arpNonPorta: false,
      algMacroBehavior: false,
      brokenShortcutSlides: false,
      ignoreDuplicateSlides: false,
      stopPortaOnNoteOff: false,
      continuousVibrato: false,
      brokenDACMode: false,
      oneTickCut: false,
      newInsTriggersInPorta: true,
      arp0Reset: true,
      brokenSpeedSel: false,
      noSlidesOnFirstTick: false,
      rowResetsArpPos: false,
      ignoreJumpAtEnd: false,
      buggyPortaAfterSlide: false,
      gbInsAffectsEnvelope: true,
      sharedExtStat: true,
      ignoreDACModeOutsideChannel: false,
      e1e2AlsoTakePriority: false,
      newSegaPCM: true,
      fbPortaPause: false,
      snDutyReset: false,
      pitchMacroIsLinear: true,
      oldOctaveBoundary: false,
      noOPN2Vol: false,
      newVolumeScaling: true,
      volMacroLinger: true,
      brokenOutVol: false,
      brokenOutVol2: false,
      e1e2StopOnSameNote: false,
      brokenPortaArp: false,
      snNoLowPeriods: false,
      disableSampleMacro: false,
      oldArpStrategy: false,
      brokenPortaLegato: false,
      brokenFMOff: false,
      preNoteNoEffect: false,
      oldDPCM: false,
      resetArpPhaseOnNewNote: false,
      ceilVolumeScaling: false,
      oldAlwaysSetVolume: false,
      oldSampleOffset: false,
    };
    // New format (INF2)
    await parseNewFormat(reader, module, version);
  } else {
    // Old format (INFO)
    await parseOldFormat(reader, module, version);
  }

  return module;
}

/**
 * Parse new format (version >= 240)
 */
async function parseNewFormat(
  reader: BinaryReader,
  module: FurnaceModule,
  version: number
): Promise<void> {
  // Read header
  const magic = reader.readMagic(4);
  if (magic !== 'INF2') {
    throw new Error(`Expected INF2 block, got: "${magic}"`);
  }
  reader.readUint32(); // Block size

  // Song information
  module.name = readString(reader);
  module.author = readString(reader);
  module.systemName = readString(reader);
  module.category = readString(reader);

  // Japanese names (skip)
  readString(reader); // nameJ
  readString(reader); // authorJ
  readString(reader); // systemNameJ
  readString(reader); // categoryJ

  module.tuning = reader.readFloat32();
  reader.readUint8(); // autoSystem

  // System definition
  module.masterVol = reader.readFloat32();
  module.chans = reader.readUint16();
  module.systemLen = reader.readUint16();

  if (module.systemLen < 1) {
    throw new Error('Zero chips in module!');
  }

  console.log(`[FurnaceSongParser] ${module.systemLen} chips, ${module.chans} channels`);

  // Read chip definitions
  let tchans = 0;
  for (let i = 0; i < module.systemLen; i++) {
    const sysID = reader.readUint16();
    module.systems.push(sysID);

    const chanCount = reader.readUint16();
    module.systemChans.push(chanCount);
    tchans += chanCount;

    module.systemVol.push(reader.readFloat32());
    module.systemPan.push(reader.readFloat32());
    module.systemPanFR.push(reader.readFloat32());

    console.log(`[FurnaceSongParser] Chip ${i}: ID=0x${sysID.toString(16)}, ${chanCount} channels`);
  }

  if (module.chans !== tchans) {
    console.warn(`[FurnaceSongParser] Channel count mismatch: header=${module.chans}, calculated=${tchans}`);
    module.chans = tchans;
  }

  // Patchbay
  const patchbayConns = reader.readUint32();
  reader.skip(patchbayConns * 4); // Skip patchbay connections
  reader.readUint8(); // patchbayAuto

  // Element pointers
  const insPtr: number[] = [];
  const wavePtr: number[] = [];
  const samplePtr: number[] = [];
  const subSongPtr: number[] = [];
  const patPtr: number[] = [];
  let commentPtr = 0;
  const groovePtrs: number[] = [];
  const chipFlagPtrs: number[] = [];

  // Read elements
  let hasElement = true;
  while (hasElement) {
    const elementType = reader.readUint8();

    switch (elementType) {
      case DIV_ELEMENT_END:
        hasElement = false;
        break;
      case DIV_ELEMENT_SUBSONG: {
        const count = reader.readUint32();
        for (let i = 0; i < count; i++) {
          subSongPtr.push(reader.readUint32());
        }
        break;
      }
      case DIV_ELEMENT_CHIP_FLAGS: {
        const count = reader.readUint32();
        for (let i = 0; i < count; i++) {
          chipFlagPtrs.push(reader.readUint32());
        }
        break;
      }
      case DIV_ELEMENT_ASSET_DIR: {
        const count = reader.readUint32();
        reader.skip(count * 4); // Skip asset dir pointers
        break;
      }
      case DIV_ELEMENT_INSTRUMENT: {
        const count = reader.readUint32();
        for (let i = 0; i < count; i++) {
          insPtr.push(reader.readUint32());
        }
        break;
      }
      case DIV_ELEMENT_WAVETABLE: {
        const count = reader.readUint32();
        for (let i = 0; i < count; i++) {
          wavePtr.push(reader.readUint32());
        }
        break;
      }
      case DIV_ELEMENT_SAMPLE: {
        const count = reader.readUint32();
        for (let i = 0; i < count; i++) {
          samplePtr.push(reader.readUint32());
        }
        break;
      }
      case DIV_ELEMENT_PATTERN: {
        const count = reader.readUint32();
        for (let i = 0; i < count; i++) {
          patPtr.push(reader.readUint32());
        }
        break;
      }
      case DIV_ELEMENT_COMPAT_FLAGS: {
        reader.readUint32(); // count (always 1)
        const cfPtr = reader.readUint32();
        if (cfPtr > 0) {
          // Store pointer — we'll parse the CFLG block after the element table
          (module as any)._compatFlagPtr = cfPtr;
        }
        break;
      }
      case DIV_ELEMENT_COMMENTS: {
        reader.readUint32(); // Should be 1
        commentPtr = reader.readUint32();
        break;
      }
      case DIV_ELEMENT_GROOVE: {
        const count = reader.readUint32();
        for (let i = 0; i < count; i++) groovePtrs.push(reader.readUint32());
        break;
      }
      default: {
        // Unknown element, skip
        const count = reader.readUint32();
        reader.skip(count * 4);
        break;
      }
    }
  }

  // Parse GROV blocks — each block: "GROV" magic, size, 1-byte len, 16×uint16 vals
  for (const ptr of groovePtrs) {
    reader.seek(ptr);
    const magic = reader.readMagic(4);
    if (magic === 'GROV') {
      reader.readUint32(); // block size (ignored)
      const len = reader.readUint8();
      const val: number[] = [];
      for (let i = 0; i < 16; i++) val.push(reader.readUint16());
      module.grooves.push({ len, val });
    }
  }

  // Parse chip flags from FLAG blocks (v>=119)
  if (chipFlagPtrs.length > 0) {
    module.chipFlags = [];
    for (let i = 0; i < chipFlagPtrs.length; i++) {
      const ptr = chipFlagPtrs[i];
      if (ptr === 0) {
        module.chipFlags.push('');
        continue;
      }
      reader.seek(ptr);
      const magic = reader.readMagic(4);
      if (magic === 'FLAG') {
        reader.readUint32(); // block size
        const flagStr = readString(reader);
        module.chipFlags.push(flagStr);
      } else {
        module.chipFlags.push('');
      }
    }
  }

  // Parse CFLG (compat flags) block — INF2 format stores compat flags as key=value string
  // Upstream: song.cpp DivCompatFlags::readData reads "CFLG" + size + key=value string
  const compatFlagPtr = (module as any)._compatFlagPtr as number | undefined;
  if (compatFlagPtr && compatFlagPtr > 0) {
    reader.seek(compatFlagPtr);
    const cflgMagic = reader.readMagic(4);
    if (cflgMagic === 'CFLG') {
      reader.readUint32(); // block size
      const flagStr = readString(reader);
      // Parse key=value pairs into compatFlags
      const compatFlags: Record<string, unknown> = {};
      for (const line of flagStr.split('\n')) {
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.substring(0, eq).trim();
        const val = line.substring(eq + 1).trim();
        if (val === 'true') compatFlags[key] = true;
        else if (val === 'false') compatFlags[key] = false;
        else {
          const num = Number(val);
          compatFlags[key] = isNaN(num) ? val : num;
        }
      }
      // Merge CFLG values into defaults (don't replace — CFLG only stores non-default values)
      Object.assign(module.compatFlags, compatFlags);
      console.log(`[FurnaceSongParser] Parsed CFLG block: ${Object.keys(compatFlags).length} overrides merged into defaults`);
    }
  }
  delete (module as any)._compatFlagPtr;

  // Apply version-specific compat flags (fur.cpp:2150-2400)
  if (module.chipFlags && module.chipFlags.length > 0) {
    applyVersionCompatFlags(version, module.systems.slice(0, module.systemLen), module.chipFlags);
  }

  // Parse subsongs
  for (const ptr of subSongPtr) {
    reader.seek(ptr);
    const subsong = parseSubSong(reader, module.chans, version);
    module.subsongs.push(subsong);
  }

  // Parse instruments
  for (let i = 0; i < insPtr.length; i++) {
    const ptr = insPtr[i];
    reader.seek(ptr);
    const startOffset = reader.getOffset();
    const inst = parseInstrument(reader);
    const endOffset = reader.getOffset();
    
    // Fix C64 instruments with no static waveform flags or broken ADSR
    // Reference: furnace-master/src/engine/platform/c64.cpp lines 445-449 & 266-268
    // 
    // When a C64 instrument has all waveform flags false (triOn, sawOn, pulseOn, noiseOn),
    // note-on initializes chan[].wave=0 (silent). Wave macros process LATER on tick(),
    // creating a race condition where notes start silent. Furnace's native playback has
    // the same issue, but it's one tick (very brief). For imported songs, this is worse.
    //
    // Additionally, if sustain=0, the SID voice volume drops to 0 immediately after attack/decay,
    // making the instrument effectively silent even with correct waveform. This happens when
    // instruments rely on pattern effects (20xx/21xx) to set ADSR at runtime.
    //
    // Fix: Initialize waveform flags and provide reasonable ADSR defaults.
    if (inst.c64) {
      const hasAnyWaveform = inst.c64.triOn || inst.c64.sawOn || inst.c64.pulseOn || inst.c64.noiseOn;
      
      if (!hasAnyWaveform) {
        const waveMacro = inst.macros?.find(m => m.code === 3);  // DIV_MACRO_WAVE = 3
        
        if (waveMacro && waveMacro.data && waveMacro.data.length > 0) {
          // Initialize from first wave macro value (Furnace format: 1=tri, 2=saw, 4=pulse, 8=noise)
          const firstWave = waveMacro.data[0];
          console.log(`[FurnaceParser] Inst ${i} "${inst.name}": C64 has no waveform, initializing from wave macro[0]=${firstWave}`);
          
          inst.c64.noiseOn = !!(firstWave & 8);
          inst.c64.pulseOn = !!(firstWave & 4);
          inst.c64.sawOn = !!(firstWave & 2);
          inst.c64.triOn = !!(firstWave & 1);
        } else if (inst.c64.duty && inst.c64.duty !== 2048) {
          // No wave macro, but has non-default duty → must be pulse (duty only affects pulse)
          console.log(`[FurnaceParser] Inst ${i} "${inst.name}": C64 has no waveform but duty=${inst.c64.duty}, setting pulseOn`);
          inst.c64.pulseOn = true;
        } else {
          // No wave macro, no custom duty → default to pulse (Furnace's most common default)
          console.log(`[FurnaceParser] Inst ${i} "${inst.name}": C64 has no waveform and no macro, defaulting to pulse`);
          inst.c64.pulseOn = true;
        }
      }
      
      // NOTE: Furnace allows S=0 (sustain at 0 volume) without validation.
      // Reference: c64.cpp line 447 just copies sustain directly: chan[c.chan].sustain=ins->c64.s;
      // While S=0 produces silence, it's valid SID behavior and we must preserve 1:1 compatibility.
      // DO NOT add ADSR validation - let the WASM handle it exactly like Furnace does.
      
      // DEBUG: Log the final C64 state after fixup
      console.log(`[FurnaceParser] Inst ${i} "${inst.name}" C64 FINAL: tri=${inst.c64.triOn} saw=${inst.c64.sawOn} pulse=${inst.c64.pulseOn} noise=${inst.c64.noiseOn} ADSR=${inst.c64.a}/${inst.c64.d}/${inst.c64.s}/${inst.c64.r}`);
    }
    
    // Capture raw binary data for upload to WASM
    const rawDataSize = endOffset - startOffset;
    console.log(`[FurnaceParser] Inst ${i} "${inst.name}": capturing ${rawDataSize} bytes from offset ${startOffset}`);
    reader.seek(startOffset);
    const rawData = reader.readBytes(rawDataSize);
    inst.rawBinaryData = rawData;
    console.log(`[FurnaceParser] Inst ${i} rawBinaryData captured: ${inst.rawBinaryData?.length ?? 0} bytes`);
    
    module.instruments.push(inst);
  }

  // Create default instrument if none defined (valid in Furnace — chip uses defaults)
  if (module.instruments.length === 0 && module.systems.length > 0) {
    const chipId = module.systems[0];
    const defaultInsType = CHIP_DEFAULT_INS_TYPE[chipId] ?? 0;
    console.log(`[FurnaceSongParser] No instruments in file, creating default for chip 0x${chipId.toString(16)} -> insType=${defaultInsType}`);
    module.instruments.push({
      name: 'Default',
      type: defaultInsType,
      macros: [],
      samples: [],
      wavetables: [],
    });
  }

  // Parse wavetables
  for (const ptr of wavePtr) {
    reader.seek(ptr);
    const wave = parseWavetable(reader);
    module.wavetables.push(wave);
  }

  // Parse samples
  for (const ptr of samplePtr) {
    reader.seek(ptr);
    const sample = parseSample(reader, version);
    module.samples.push(sample);
  }

  // Parse patterns
  console.log(`[FurnaceParser] Parsing ${patPtr.length} pattern pointers...`);
  for (const ptr of patPtr) {
    reader.seek(ptr);
    const pat = parsePattern(reader, module.chans, module.subsongs, version);
    const key = `${pat.subsong}_${pat.channel}_${pat.index}`;
    module.patterns.set(key, pat);
    // Debug: Log first pattern with data
    if (module.patterns.size <= 3) {
      const hasData = pat.rows.some(r => r.note >= 0 || r.instrument >= 0 || r.effects.length > 0);
      console.log(`[FurnaceParser] Stored pattern key="${key}" rows=${pat.rows.length} hasData=${hasData}`);
      if (hasData) {
        const firstDataRow = pat.rows.findIndex(r => r.note >= 0 || r.instrument >= 0);
        if (firstDataRow >= 0) {
          console.log(`[FurnaceParser] First data row ${firstDataRow}:`, pat.rows[firstDataRow]);
        }
      }
    }
  }

  // Parse comment
  if (commentPtr > 0) {
    reader.seek(commentPtr);
    const magic = reader.readMagic(4);
    if (magic === 'CMNT') {
      reader.readUint32(); // size
      module.comment = readString(reader);
    }
  }
}

/**
 * Parse old format (version < 240)
 */
async function parseOldFormat(
  reader: BinaryReader,
  module: FurnaceModule,
  version: number
): Promise<void> {
  // Read header
  const magic = reader.readMagic(4);
  if (magic !== 'INFO') {
    throw new Error(`Expected INFO block, got: "${magic}"`);
  }
  reader.readUint32(); // Block size

  // Create initial subsong
  const subsong: FurnaceSubSong = {
    name: '',
    comment: '',
    timeBase: 0,
    speed1: 6,
    speed2: 6,
    arpLen: 1,
    hz: 60,
    patLen: 64,
    ordersLen: 1,
    hilightA: 4,
    hilightB: 16,
    virtualTempo: 150,
    virtualTempoD: 150,
    orders: [],
    effectColumns: [],
    channelNames: [],
    channelShortNames: [],
  };

  // Chip flag pointers (populated when reading system props section for v119+)
  const chipFlagPtrs: number[] = [];

  // Timing
  subsong.timeBase = reader.readUint8();
  subsong.speed1 = reader.readUint8();
  subsong.speed2 = reader.readUint8();
  subsong.arpLen = reader.readUint8();
  subsong.hz = reader.readFloat32();

  // Pattern/Order length
  subsong.patLen = reader.readUint16();
  subsong.ordersLen = reader.readUint16();

  // Highlight
  subsong.hilightA = reader.readUint8();
  subsong.hilightB = reader.readUint8();

  // Asset counts
  const insLen = reader.readUint16();
  const waveLen = reader.readUint16();
  const sampleLen = reader.readUint16();
  const numberOfPats = reader.readUint32();
  void numberOfPats; // Pattern count for allocation hints
  console.log(`[FurnaceSongParser] Old format header: insLen=${insLen}, waveLen=${waveLen}, sampleLen=${sampleLen}, numberOfPats=${numberOfPats}, patLen=${subsong.patLen}, ordersLen=${subsong.ordersLen}, hz=${subsong.hz}, speed1=${subsong.speed1}, speed2=${subsong.speed2}`);

  // Sound chips (32 bytes)
  // Reference: fur.cpp:1148-1160 — systemLen = last non-NULL index + 1
  const rawChips: number[] = [];
  let lastNonNull = -1;
  for (let i = 0; i < 32; i++) {
    const chip = reader.readUint8();
    rawChips.push(chip);
    if (chip !== 0) lastNonNull = i;
  }
  module.systemLen = lastNonNull + 1;
  module.systems = rawChips.slice(0, module.systemLen);

  // Chip volumes (32 bytes)
  for (let i = 0; i < 32; i++) {
    const vol = reader.readInt8();
    if (i < module.systemLen) {
      module.systemVol.push(vol / 64.0);
    }
  }

  // Chip panning (32 bytes)
  for (let i = 0; i < 32; i++) {
    const pan = reader.readInt8();
    if (i < module.systemLen) {
      module.systemPan.push(pan / 127.0);
    }
  }

  // Chip flags / system props (128 bytes = 32 × uint32)
  // In old format (version < 240), this section contains either:
  //   - version >= 119: pointers to FLAG blocks (key=value strings)
  //   - version < 119: direct uint32 flag values (converted via convertOldChipFlags)
  // In new format (version >= 240), chipFlagPtrs come from element table instead.
  {
    const sysFlagPtrs: number[] = [];
    for (let i = 0; i < 32; i++) {
      sysFlagPtrs.push(reader.readUint32());
    }

    if (version >= 119 && chipFlagPtrs.length === 0) {
      // Old header format with FLAG block pointers — follow them (fur.cpp:1745-1770)
      // Only do this if the element table didn't already provide chipFlagPtrs
      for (let i = 0; i < module.systemLen; i++) {
        chipFlagPtrs.push(sysFlagPtrs[i]);
      }
    } else if (version < 119) {
      // Pre-119: direct uint32 flag values
      module.chipFlags = [];
      for (let i = 0; i < module.systemLen; i++) {
        module.chipFlags.push(convertOldChipFlags(sysFlagPtrs[i], module.systems[i]));
      }
      applyVersionCompatFlags(version, module.systems.slice(0, module.systemLen), module.chipFlags);
    }
    // chipFlagPtrs will be read as FLAG blocks after the header is fully parsed
  }

  // Song name and author
  module.name = readString(reader);
  module.author = readString(reader);

  // A-4 tuning
  module.tuning = reader.readFloat32();

  // Compatibility flags block 0 (20 bytes)
  // Reference: fur.cpp:1258-1348
  // Always reads exactly 20 bytes for any version.
  const compatFlags: Record<string, unknown> = {};
  if (version >= 37) {
    compatFlags.limitSlides = !!reader.readUint8();           // 0
    compatFlags.linearPitch = reader.readUint8();              // 1
    compatFlags.loopModality = reader.readUint8();             // 2
    compatFlags.properNoiseLayout = version >= 43 ? !!reader.readUint8() : (reader.readUint8(), false);  // 3
    compatFlags.waveDutyIsVol = version >= 43 ? !!reader.readUint8() : (reader.readUint8(), false);      // 4
    compatFlags.resetMacroOnPorta = version >= 45 ? !!reader.readUint8() : (reader.readUint8(), false);  // 5
    compatFlags.legacyVolumeSlides = version >= 45 ? !!reader.readUint8() : (reader.readUint8(), false); // 6
    compatFlags.compatibleArpeggio = version >= 45 ? !!reader.readUint8() : (reader.readUint8(), false); // 7
    compatFlags.noteOffResetsSlides = version >= 45 ? !!reader.readUint8() : (reader.readUint8(), false);// 8
    compatFlags.targetResetsSlides = version >= 45 ? !!reader.readUint8() : (reader.readUint8(), false); // 9
    compatFlags.arpNonPorta = version >= 47 ? !!reader.readUint8() : (reader.readUint8(), false);       // 10
    compatFlags.algMacroBehavior = version >= 47 ? !!reader.readUint8() : (reader.readUint8(), false);  // 11
    compatFlags.brokenShortcutSlides = version >= 49 ? !!reader.readUint8() : (reader.readUint8(), false);// 12
    compatFlags.ignoreDuplicateSlides = version >= 50 ? !!reader.readUint8() : (reader.readUint8(), false);// 13
    compatFlags.stopPortaOnNoteOff = version >= 62 ? !!reader.readUint8() : (reader.readUint8(), false); // 14
    compatFlags.continuousVibrato = version >= 62 ? !!reader.readUint8() : (reader.readUint8(), false);  // 15
    compatFlags.brokenDACMode = version >= 64 ? !!reader.readUint8() : (reader.readUint8(), false);     // 16
    compatFlags.oneTickCut = version >= 65 ? !!reader.readUint8() : (reader.readUint8(), false);         // 17
    compatFlags.newInsTriggersInPorta = version >= 66 ? !!reader.readUint8() : (reader.readUint8(), false);// 18
    compatFlags.arp0Reset = version >= 69 ? !!reader.readUint8() : (reader.readUint8(), false);          // 19
  } else {
    reader.skip(20);
  }

  // Pointers
  const insPtr: number[] = [];
  const wavePtr: number[] = [];
  const samplePtr: number[] = [];
  const patPtr: number[] = [];

  for (let i = 0; i < insLen; i++) {
    insPtr.push(reader.readUint32());
  }
  for (let i = 0; i < waveLen; i++) {
    wavePtr.push(reader.readUint32());
  }
  for (let i = 0; i < sampleLen; i++) {
    samplePtr.push(reader.readUint32());
  }

  // Calculate total channels
  let tchans = 0;
  for (const chipId of module.systems) {
    const chanCount = CHIP_CHANNELS[chipId] || 4;
    module.systemChans.push(chanCount);
    tchans += chanCount;
  }
  module.chans = tchans;

  // Read pattern pointers
  // In old format, patterns come after samples. The number of patterns is already known from numberOfPats.
  // Pattern pointers follow the sample pointers.
  for (let i = 0; i < numberOfPats; i++) {
    patPtr.push(reader.readUint32());
  }
  console.log(`[FurnaceSongParser] Old format: ${numberOfPats} pattern pointers read, offset=${reader.getOffset()}`);

  // Orders — upstream reads ordersLen entries per channel
  // Reference: fur.cpp:1367-1370
  subsong.orders = [];
  for (let ch = 0; ch < module.chans; ch++) {
    const channelOrders: number[] = [];
    for (let ord = 0; ord < subsong.ordersLen; ord++) {
      channelOrders.push(reader.readUint8());
    }
    subsong.orders.push(channelOrders);
  }

  // Effect columns
  subsong.effectColumns = [];
  for (let ch = 0; ch < module.chans; ch++) {
    subsong.effectColumns.push(reader.readUint8());
  }


  // Reference: fur.cpp:1383-1414
  // Channel show, collapse, names, short names, and song notes are gated on v39+
  if (version >= 39) {
    // Channel show + collapse (1 byte each per channel = 2 * tchans)
    reader.skip(module.chans * 2);

    // Channel names
    for (let ch = 0; ch < module.chans; ch++) {
      subsong.channelNames.push(readString(reader));
    }
    for (let ch = 0; ch < module.chans; ch++) {
      subsong.channelShortNames.push(readString(reader));
    }

    // Song notes (ds.notes in reference)
    module.comment = readString(reader);
  }

  // Reference: fur.cpp:1416-1420
  if (version >= 59) {
    module.masterVol = reader.readFloat32();
  } else {
    module.masterVol = 2.0;
  }

  // Extended compat flags block 1 (28 bytes)
  // Reference: fur.cpp:1422-1542
  if (version >= 70) {
    compatFlags.brokenSpeedSel = !!reader.readUint8();                                                  // 0
    compatFlags.noSlidesOnFirstTick = version >= 71 ? !!reader.readUint8() : (reader.readUint8(), false);// 1
    compatFlags.rowResetsArpPos = version >= 71 ? !!reader.readUint8() : (reader.readUint8(), false);   // 2
    compatFlags.ignoreJumpAtEnd = version >= 71 ? !!reader.readUint8() : (reader.readUint8(), false);   // 3
    compatFlags.buggyPortaAfterSlide = version >= 72 ? !!reader.readUint8() : (reader.readUint8(), false);// 4
    compatFlags.gbInsAffectsEnvelope = version >= 72 ? !!reader.readUint8() : (reader.readUint8(), false);// 5
    compatFlags.sharedExtStat = version >= 78 ? !!reader.readUint8() : (reader.readUint8(), false);     // 6
    compatFlags.ignoreDACModeOutsideChannel = version >= 83 ? !!reader.readUint8() : (reader.readUint8(), false);// 7
    compatFlags.e1e2AlsoTakePriority = version >= 83 ? !!reader.readUint8() : (reader.readUint8(), false);// 8
    compatFlags.newSegaPCM = version >= 84 ? !!reader.readUint8() : (reader.readUint8(), false);        // 9
    compatFlags.fbPortaPause = version >= 85 ? !!reader.readUint8() : (reader.readUint8(), false);      // 10
    compatFlags.snDutyReset = version >= 86 ? !!reader.readUint8() : (reader.readUint8(), false);       // 11
    compatFlags.pitchMacroIsLinear = version >= 90 ? !!reader.readUint8() : (reader.readUint8(), false);// 12
    compatFlags.pitchSlideSpeed = version >= 94 ? reader.readUint8() : (reader.readUint8(), 0);         // 13
    compatFlags.oldOctaveBoundary = version >= 97 ? !!reader.readUint8() : (reader.readUint8(), false); // 14
    compatFlags.noOPN2Vol = version >= 98 ? !!reader.readUint8() : (reader.readUint8(), false);         // 15
    compatFlags.newVolumeScaling = version >= 99 ? !!reader.readUint8() : (reader.readUint8(), false);  // 16
    compatFlags.volMacroLinger = version >= 99 ? !!reader.readUint8() : (reader.readUint8(), false);    // 17
    compatFlags.brokenOutVol = version >= 99 ? !!reader.readUint8() : (reader.readUint8(), false);      // 18
    compatFlags.e1e2StopOnSameNote = version >= 100 ? !!reader.readUint8() : (reader.readUint8(), false);// 19
    compatFlags.brokenPortaArp = version >= 101 ? !!reader.readUint8() : (reader.readUint8(), false);   // 20
    compatFlags.snNoLowPeriods = version >= 108 ? !!reader.readUint8() : (reader.readUint8(), false);   // 21
    compatFlags.delayBehavior = version >= 110 ? reader.readUint8() : (reader.readUint8(), 0);          // 22
    compatFlags.jumpTreatment = version >= 113 ? reader.readUint8() : (reader.readUint8(), 0);          // 23
    reader.readUint8(); // 24: autoSystem (NOT a compat flag, song-level field)
    compatFlags.disableSampleMacro = version >= 117 ? !!reader.readUint8() : (reader.readUint8(), false);// 25
    compatFlags.brokenOutVol2 = version >= 121 ? !!reader.readUint8() : (reader.readUint8(), false);    // 26
    compatFlags.oldArpStrategy = version >= 130 ? !!reader.readUint8() : (reader.readUint8(), false);   // 27
  }

  // Virtual tempo
  // Reference: fur.cpp:1544-1553
  // Always reads 4 bytes: either 2×readS (v96+) or 1×readI (else)
  if (version >= 96) {
    subsong.virtualTempo = reader.readUint16();
    subsong.virtualTempoD = reader.readUint16();
  } else {
    reader.skip(4); // readI() placeholder — present for all old format versions
  }

  // Subsongs
  // Reference: fur.cpp:1555-1567
  if (version >= 95) {
    readString(reader); // subSong name
    readString(reader); // subSong notes
    const numberOfSubSongs = reader.readUint8();
    reader.skip(3); // reserved
    for (let i = 0; i < numberOfSubSongs; i++) {
      reader.readUint32(); // subSong pointers (we don't parse additional subsongs)
    }
  }

  // Additional metadata
  // Reference: fur.cpp:1569-1580
  if (version >= 103) {
    readString(reader); // systemName
    readString(reader); // category
    readString(reader); // nameJ
    readString(reader); // authorJ
    readString(reader); // systemNameJ
    readString(reader); // categoryJ
  }

  // System output config — float32 values OVERRIDE the old int8 values
  // Reference: fur.cpp:1582-1596
  if (version >= 135) {
    for (let i = 0; i < module.systemLen; i++) {
      module.systemVol[i] = reader.readFloat32();
      module.systemPan[i] = reader.readFloat32();
      module.systemPanFR[i] = reader.readFloat32();
    }
    // Patchbay connections
    const patchbayConns = reader.readUint32();
    reader.skip(patchbayConns * 4);
  }

  // Reference: fur.cpp:1598
  if (version >= 136) {
    reader.readUint8(); // patchbayAuto
  }

  // Extended compat flags block 2 (8 bytes)
  // Reference: fur.cpp:1600-1637
  if (version >= 138) {
    compatFlags.brokenPortaLegato = !!reader.readUint8();                                                // 0
    compatFlags.brokenFMOff = version >= 155 ? !!reader.readUint8() : (reader.readUint8(), false);       // 1
    compatFlags.preNoteNoEffect = version >= 168 ? !!reader.readUint8() : (reader.readUint8(), false);   // 2
    compatFlags.oldDPCM = version >= 183 ? !!reader.readUint8() : (reader.readUint8(), false);           // 3
    compatFlags.resetArpPhaseOnNewNote = version >= 184 ? !!reader.readUint8() : (reader.readUint8(), false);// 4
    compatFlags.ceilVolumeScaling = version >= 188 ? !!reader.readUint8() : (reader.readUint8(), false); // 5
    compatFlags.oldAlwaysSetVolume = version >= 191 ? !!reader.readUint8() : (reader.readUint8(), false);// 6
    compatFlags.oldSampleOffset = version >= 200 ? !!reader.readUint8() : (reader.readUint8(), false);  // 7
  }

  // Store parsed compat flags on module
  module.compatFlags = compatFlags;

  // Speeds and grooves
  // Reference: fur.cpp:1639-1659
  if (version >= 139) {
    // Initial speeds for subsong[0] (1-byte values)
    const speedsLen = reader.readUint8();
    const speedVals: number[] = [];
    for (let i = 0; i < 16; i++) speedVals.push(reader.readUint8());
    // Override subsong speed with the groove/speed values
    if (speedsLen >= 1) subsong.speed1 = speedVals[0] || subsong.speed1;
    if (speedsLen >= 2) subsong.speed2 = speedVals[1] || subsong.speed2;
    // Store full speed pattern for groove-style initial speeds (len > 2)
    if (speedsLen > 0) subsong.speedPattern = speedVals.slice(0, speedsLen);

    // Named groove patterns (1-byte values per entry)
    const grooveCount = reader.readUint8();
    for (let i = 0; i < grooveCount; i++) {
      const len = reader.readUint8();
      const val: number[] = [];
      for (let j = 0; j < 16; j++) val.push(reader.readUint8());
      module.grooves.push({ len, val });
    }
  }

  // Apply timeBase multiplier to all speed values (fur.cpp:1662)
  // In the old format, timeBase acts as a speed multiplier: effective_speed = speed * (timeBase + 1)
  if (subsong.timeBase > 0) {
    const mult = subsong.timeBase + 1;
    subsong.speed1 *= mult;
    subsong.speed2 *= mult;
    if (subsong.speedPattern) {
      subsong.speedPattern = subsong.speedPattern.map(v => v * mult);
    }
  }

  // Asset directory pointers
  // Reference: fur.cpp:1665-1669
  if (version >= 156) {
    reader.skip(12); // 3 × readI (asset dir pointers)
  }

  module.subsongs.push(subsong);

  // Parse chip flags from FLAG blocks (v119-239)
  if (chipFlagPtrs.length > 0) {
    module.chipFlags = [];
    for (let i = 0; i < chipFlagPtrs.length; i++) {
      const ptr = chipFlagPtrs[i];
      if (ptr === 0) {
        module.chipFlags.push('');
        continue;
      }
      const savedPos = reader.getOffset();
      reader.seek(ptr);
      const flagMagic = reader.readMagic(4);
      if (flagMagic === 'FLAG') {
        reader.readUint32(); // block size
        const flagStr = readString(reader);
        module.chipFlags.push(flagStr);
      } else {
        module.chipFlags.push('');
      }
      reader.seek(savedPos);
    }
    applyVersionCompatFlags(version, module.systems.slice(0, module.systemLen), module.chipFlags);
  }

  // Parse instruments
  for (let i = 0; i < insPtr.length; i++) {
    const ptr = insPtr[i];
    if (ptr === 0) continue;
    reader.seek(ptr);
    const startOffset = reader.getOffset();
    try {
      const inst = parseInstrument(reader);
      const endOffset = reader.getOffset();
      
      // Capture raw binary data for upload to WASM
      const rawDataSize = endOffset - startOffset;
      console.log(`[FurnaceParser OLD] Inst ${i} "${inst.name}": capturing ${rawDataSize} bytes from offset ${startOffset}`);
      console.log(`[FurnaceParser OLD] Inst ${i} parsed ${inst.macros.length} macros`);
      reader.seek(startOffset);
      const rawData = reader.readBytes(rawDataSize);
      inst.rawBinaryData = rawData;

      // If raw data is old INST format, re-encode as INS2 for the WASM loader
      const rawMagic = String.fromCharCode(rawData[0], rawData[1], rawData[2], rawData[3]);
      if (rawMagic === 'INST') {
        const ins2Data = encodeInstrumentAsINS2(inst, version);
        inst.rawBinaryData = ins2Data;
        console.log(`[FurnaceParser OLD] Inst ${i} "${inst.name}": INST→INS2 re-encoded (${rawData.length} → ${ins2Data.length} bytes)`);
      } else {
        console.log(`[FurnaceParser OLD] Inst ${i} rawBinaryData captured: ${inst.rawBinaryData?.length ?? 0} bytes, first 4 bytes: ${rawMagic}`);
      }
      
      module.instruments.push(inst);
    } catch (e) {
      console.warn('[FurnaceSongParser] Error parsing instrument:', e);
      module.instruments.push({
        name: 'Error',
        type: 0,
        macros: [],
        samples: [],
        wavetables: [],
      });
    }
  }

  // Create default instrument if none defined (valid in Furnace — chip uses defaults)
  // Reference: Furnace allows songs with 0 instruments; playback uses default chip params
  if (module.instruments.length === 0 && module.systems.length > 0) {
    const chipId = module.systems[0];
    const defaultInsType = CHIP_DEFAULT_INS_TYPE[chipId] ?? 0; // Fall back to DIV_INS_STD
    console.log(`[FurnaceSongParser] No instruments in file, creating default for chip 0x${chipId.toString(16)} -> insType=${defaultInsType}`);
    module.instruments.push({
      name: 'Default',
      type: defaultInsType,
      macros: [],
      samples: [],
      wavetables: [],
    });
  }

  // Parse wavetables
  for (const ptr of wavePtr) {
    if (ptr === 0) continue;
    reader.seek(ptr);
    try {
      const wave = parseWavetable(reader);
      module.wavetables.push(wave);
    } catch (e) {
      console.warn('[FurnaceSongParser] Error parsing wavetable:', e);
    }
  }

  // Parse samples
  for (const ptr of samplePtr) {
    if (ptr === 0) continue;
    reader.seek(ptr);
    try {
      const sample = parseSample(reader, version);
      module.samples.push(sample);
    } catch (e) {
      console.warn('[FurnaceSongParser] Error parsing sample:', e);
    }
  }

  // Parse patterns from patPtr if available
  for (const ptr of patPtr) {
    if (ptr === 0) continue;
    reader.seek(ptr);
    try {
      const pat = parsePattern(reader, module.chans, module.subsongs, version);
      const key = `${pat.subsong}_${pat.channel}_${pat.index}`;
      module.patterns.set(key, pat);
      // Debug: Log first patterns with data
      if (module.patterns.size <= 3) {
        const hasData = pat.rows.some(r => r.note >= 0 || r.instrument >= 0 || r.effects.length > 0);
        console.log(`[FurnaceParser v2] Stored pattern key="${key}" rows=${pat.rows.length} hasData=${hasData}`);
      }
    } catch (e) {
      console.warn('[FurnaceSongParser] Error parsing pattern:', e);
    }
  }
}

/**
 * Parse subsong
 */
function parseSubSong(reader: BinaryReader, chans: number, version: number): FurnaceSubSong {
  const magic = reader.readMagic(4);
  if (magic !== 'SNG2' && magic !== 'SONG') {
    throw new Error(`Expected SNG2/SONG block, got: "${magic}"`);
  }
  reader.readUint32(); // Block size

  const subsong: FurnaceSubSong = {
    name: '',
    comment: '',
    timeBase: 0,
    speed1: 6,
    speed2: 6,
    arpLen: 1,
    hz: 60,
    patLen: 64,
    ordersLen: 1,
    hilightA: 4,
    hilightB: 16,
    virtualTempo: 150,
    virtualTempoD: 150,
    orders: [],
    effectColumns: [],
    channelNames: [],
    channelShortNames: [],
  };

  if (magic === 'SNG2') {
    // New subsong format
    subsong.hz = reader.readFloat32();
    subsong.arpLen = reader.readUint8();
    reader.readUint8(); // effectSpeedDiv
    subsong.patLen = reader.readUint16();
    subsong.ordersLen = reader.readUint16();
    subsong.hilightA = reader.readUint8();
    subsong.hilightB = reader.readUint8();
    subsong.virtualTempo = reader.readUint16();
    subsong.virtualTempoD = reader.readUint16();

    // Speed pattern
    const speedLen = reader.readUint8();
    const speeds: number[] = [];
    for (let i = 0; i < 16; i++) {
      speeds.push(reader.readUint16());
    }
    subsong.speed1 = speeds[0] || 6;
    subsong.speed2 = speedLen > 1 ? speeds[1] : subsong.speed1;
    if (speedLen > 0) subsong.speedPattern = speeds.slice(0, speedLen);

    subsong.name = readString(reader);
    subsong.comment = readString(reader);
  } else {
    // Old subsong format
    subsong.timeBase = reader.readUint8();
    subsong.speed1 = reader.readUint8();
    subsong.speed2 = reader.readUint8();
    subsong.arpLen = reader.readUint8();
    subsong.hz = reader.readFloat32();
    subsong.patLen = reader.readUint16();
    subsong.ordersLen = reader.readUint16();
    subsong.hilightA = reader.readUint8();
    subsong.hilightB = reader.readUint8();
    subsong.virtualTempo = reader.readUint16();
    subsong.virtualTempoD = reader.readUint16();
    subsong.name = readString(reader);
    subsong.comment = readString(reader);
  }

  // Orders
  for (let ch = 0; ch < chans; ch++) {
    const channelOrders: number[] = [];
    for (let ord = 0; ord < subsong.ordersLen; ord++) {
      channelOrders.push(reader.readUint8());
    }
    subsong.orders.push(channelOrders);
  }

  // Effect columns
  for (let ch = 0; ch < chans; ch++) {
    subsong.effectColumns.push(reader.readUint8());
  }

  // Channel hide/collapse (skip)
  reader.skip(chans * 2);

  // Channel names
  for (let ch = 0; ch < chans; ch++) {
    subsong.channelNames.push(readString(reader));
  }
  for (let ch = 0; ch < chans; ch++) {
    subsong.channelShortNames.push(readString(reader));
  }

  // Channel colors (skip)
  if (version >= 240) {
    reader.skip(chans * 4);
  }

  return subsong;
}

/**
 * Parse wavetable
 */
function parseWavetable(reader: BinaryReader): FurnaceWavetable {
  const magic = reader.readMagic(4);
  if (magic !== 'WAVE') {
    throw new Error(`Expected WAVE block, got: "${magic}"`);
  }
  reader.readUint32(); // Block size

  const wave: FurnaceWavetable = {
    name: readString(reader),
    width: reader.readUint32(),
    height: 0,
    data: [],
  };

  reader.readUint32(); // reserved
  wave.height = reader.readUint32();

  for (let i = 0; i < wave.width; i++) {
    wave.data.push(reader.readInt32());
  }

  return wave;
}

/**
 * Parse sample
 */
function parseSample(reader: BinaryReader, version: number): FurnaceSample {
  const magic = reader.readMagic(4);

  const sample: FurnaceSample = {
    name: '',
    length: 0,
    compatRate: 0,
    c4Rate: 0,
    depth: 16,
    loop: false,
    loopStart: -1,
    loopEnd: -1,
    loopDirection: 0,
    data: new Int16Array(0),
  };

  if (magic === 'SMP2') {
    // New sample format
    reader.readUint32(); // Block size
    sample.name = readString(reader);
    sample.length = reader.readUint32();
    sample.compatRate = reader.readUint32();
    sample.c4Rate = reader.readUint32();
    sample.depth = reader.readUint8();
    const rawLoopMode = reader.readUint8(); // always consume the byte
    sample.loopDirection = version >= 123 ? rawLoopMode : 0;
    (sample as any).brrEmphasis = reader.readUint8() !== 0;
    (sample as any).brrNoFilter = reader.readUint8() !== 0;
    sample.loopStart = reader.readInt32(); // = loop ? loopStart : -1
    sample.loopEnd = reader.readInt32();   // = loop ? loopEnd : -1
    // Loop is encoded as loopStart=-1/loopEnd=-1 when not looping (matches Furnace sample.cpp)
    sample.loop = sample.loopStart >= 0 && sample.loopEnd >= 0;
    reader.skip(16); // Sample presence bitfields

    // Read sample data — byte count depends on depth (matches Furnace sample.cpp initInternal)
    if (sample.depth === 16) {
      const data = new Int16Array(sample.length);
      for (let i = 0; i < sample.length; i++) {
        data[i] = reader.readInt16();
      }
      sample.data = data;
    } else if (sample.depth === 8) {
      const data = new Int8Array(sample.length);
      for (let i = 0; i < sample.length; i++) {
        data[i] = reader.readInt8();
      }
      sample.data = data;
    } else {
      // Non-trivial depths: calculate byte count from frame count
      // Must match Furnace sample.cpp initInternal() / getCurBufLen()
      const count = sample.length;
      let byteCount: number;
      switch (sample.depth) {
        case 0:  // DIV_SAMPLE_DEPTH_1BIT
          byteCount = Math.floor((count + 7) / 8);
          break;
        case 1:  // DIV_SAMPLE_DEPTH_1BIT_DPCM (NES DPCM)
          byteCount = count > 0 ? 1 + ((Math.floor((count - 1) / 8) + 15) & ~15) : 0;
          break;
        case 3:  // DIV_SAMPLE_DEPTH_YMZ_ADPCM
        case 4:  // DIV_SAMPLE_DEPTH_QSOUND_ADPCM
        case 5:  // DIV_SAMPLE_DEPTH_ADPCM_A
        case 6:  // DIV_SAMPLE_DEPTH_ADPCM_B
        case 7:  // DIV_SAMPLE_DEPTH_ADPCM_K
        case 10: // DIV_SAMPLE_DEPTH_VOX
        case 15: // DIV_SAMPLE_DEPTH_4BIT
          byteCount = Math.floor((count + 1) / 2);
          break;
        case 9:  // DIV_SAMPLE_DEPTH_BRR (SNES) — 9 bytes per 16 samples
          byteCount = 9 * Math.ceil(count / 16);
          break;
        case 11: // DIV_SAMPLE_DEPTH_MULAW
          byteCount = count;
          break;
        case 12: // DIV_SAMPLE_DEPTH_C219
          byteCount = Math.floor((count + 1) & ~1); // padded to even
          break;
        case 13: // DIV_SAMPLE_DEPTH_IMA_ADPCM
          byteCount = 4 + Math.floor((count + 1) / 2);
          break;
        case 14: // DIV_SAMPLE_DEPTH_12BIT
          byteCount = Math.floor((count * 3 + 1) / 2);
          break;
        default:
          // Unknown depth — assume 1 byte per sample as fallback
          byteCount = count;
          break;
      }
      sample.data = reader.readBytes(byteCount);
    }
  } else if (magic === 'SMPL') {
    // Old sample format
    reader.readUint32(); // Block size
    sample.name = readString(reader);
    sample.length = reader.readUint32();
    sample.compatRate = reader.readUint32();

    if (version < 58) {
      reader.readUint16(); // volume
      reader.readUint16(); // pitch
    } else {
      reader.skip(4);
    }

    sample.depth = reader.readUint8();
    reader.readUint8(); // reserved

    if (version >= 32) {
      sample.c4Rate = reader.readUint16();
    }

    if (version >= 19) {
      sample.loopStart = reader.readInt32();
      // Loop is determined by loopStart >= 0 (matches Furnace sample.cpp lines 117+177)
      sample.loop = (sample.loopStart ?? -1) >= 0;
      sample.loopEnd = sample.loop ? sample.length : 0;
    }

    // Read sample data
    if (sample.depth === 16) {
      const count = version < 58 ? sample.length : sample.length;
      const data = new Int16Array(count);
      for (let i = 0; i < count; i++) {
        data[i] = reader.readInt16();
      }
      sample.data = data;
    } else {
      // Compute exact byte count per depth (same logic as SMP2 format)
      const count = sample.length;
      let byteCount: number;
      if (version < 58) {
        // Pre-v58: byte storage is length*2 for all non-16bit depths
        byteCount = count * 2;
      } else {
        switch (sample.depth) {
          case 0:  // 1-bit
            byteCount = Math.floor((count + 7) / 8);
            break;
          case 1:  // 1-bit DPCM
            byteCount = count > 0 ? 1 + ((Math.floor((count - 1) / 8) + 15) & ~15) : 0;
            break;
          case 3:  // YMZ ADPCM
          case 4:  // QSound ADPCM
          case 5:  // ADPCM-A
          case 6:  // ADPCM-B
          case 7:  // ADPCM-K
          case 10: // VOX
          case 15: // 4-bit
            byteCount = Math.floor((count + 1) / 2);
            break;
          case 9:  // BRR (SNES) — 9 bytes per 16 samples
            byteCount = 9 * Math.ceil(count / 16);
            break;
          case 11: // mu-law
            byteCount = count;
            break;
          case 12: // C219
            byteCount = (count + 1) & ~1;
            break;
          case 13: // IMA ADPCM
            byteCount = 4 + Math.floor((count + 1) / 2);
            break;
          case 14: // 12-bit
            byteCount = Math.floor((count * 3 + 1) / 2);
            break;
          default: // 8-bit and unknown depths: 1 byte per sample
            byteCount = count;
            break;
        }
      }
      sample.data = reader.readBytes(byteCount);
    }
  } else {
    throw new Error(`Unknown sample format: "${magic}"`);
  }

  return sample;
}

/**
 * Build a per-channel array of the default instrument type (DIV_INS_*) for each channel.
 * For compound chips like Genesis (0x02), maps sub-channels to their correct type:
 *   channels 0-5 → DIV_INS_FM (1), channel 6 → DIV_INS_AMIGA (4), channels 7-9 → DIV_INS_STD (0)
 */
function buildChannelChipMap(module: FurnaceModule): number[] {
  // Genesis compound chip: FM (6ch) + DAC (1ch) + PSG (3ch + noise)
  const COMPOUND_CHANNEL_TYPES: Record<number, number[]> = {
    0x02: [1, 1, 1, 1, 1, 1,  4,  0, 0, 0, 0],  // Genesis: FM×6, DAC, PSG×4
  };

  const channelInsType: number[] = [];
  let chanOffset = 0;

  for (let i = 0; i < module.systemLen; i++) {
    const chipId = module.systems[i];
    const chanCount = module.systemChans[i] ?? 0;

    const compound = COMPOUND_CHANNEL_TYPES[chipId];
    if (compound) {
      // Compound chip: use per-sub-channel types
      for (let ch = 0; ch < chanCount; ch++) {
        channelInsType[chanOffset + ch] = compound[ch] ?? 0;
      }
    } else {
      // Simple chip: all channels use the same default instrument type
      const defaultType = CHIP_DEFAULT_INS_TYPE[chipId] ?? 0;
      for (let ch = 0; ch < chanCount; ch++) {
        channelInsType[chanOffset + ch] = defaultType;
      }
    }
    chanOffset += chanCount;
  }

  return channelInsType;
}

/**
 * Build a per-channel array of the chip ID for each channel.
 * Used to determine chip-specific variants (e.g., SID 6581 vs 8580).
 */
function buildChannelChipIdMap(module: FurnaceModule): number[] {
  const channelChipId: number[] = [];
  let chanOffset = 0;

  for (let i = 0; i < module.systemLen; i++) {
    const chipId = module.systems[i];
    const chanCount = module.systemChans[i] ?? 0;
    for (let ch = 0; ch < chanCount; ch++) {
      channelChipId[chanOffset + ch] = chipId;
    }
    chanOffset += chanCount;
  }

  return channelChipId;
}

/**
 * Scan pattern data to find which channels each instrument is used on.
 * Returns a map from instrument index (0-based) to the set of channel indices.
 */
function scanInstrumentChannels(module: FurnaceModule): Map<number, Set<number>> {
  const result = new Map<number, Set<number>>();

  // Scan ALL subsongs so DIV_INS_STD instruments in secondary subsongs are correctly typed.
  // Instruments are shared across subsongs (module-level), but a given instrument may only
  // appear in subsong 2 — scanning only subsong 0 would leave its chip type unresolved.
  for (let subIdx = 0; subIdx < module.subsongs.length; subIdx++) {
    const subsong = module.subsongs[subIdx];
    if (!subsong) continue;

    for (let orderPos = 0; orderPos < subsong.ordersLen; orderPos++) {
      for (let ch = 0; ch < module.chans; ch++) {
        const patIdx = subsong.orders[ch]?.[orderPos] ?? 0;
        const key = `${subIdx}_${ch}_${patIdx}`;
        const pattern = module.patterns.get(key);
        if (!pattern) continue;

        for (const row of pattern.rows) {
          if (row.instrument >= 0) {
            let channels = result.get(row.instrument);
            if (!channels) {
              channels = new Set<number>();
              result.set(row.instrument, channels);
            }
            channels.add(ch);
          }
        }
      }
    }
  }

  return result;
}

/**
 * Convert Furnace module to DEViLBOX format
 */
export function convertFurnaceToDevilbox(module: FurnaceModule, subsongIndex = 0): {
  instruments: ParsedInstrument[];
  patterns: ConvertedPatternCell[][][]; // [pattern][row][channel]
  metadata: ImportMetadata;
  /** Module-level wavetables for WASM dispatch upload */
  wavetables: Array<{ data: number[]; width: number; height: number }>;
  /** Module-level samples for WASM dispatch upload */
  samples: Array<{ data: Int16Array | Int8Array | Uint8Array; rate: number; depth: number;
    samples: number; loopStart: number; loopEnd: number; loopMode: number; name: string }>;
  /** Native Furnace data for format-specific editor */
  furnaceNative: FurnaceNativeData;
} {
  // --- Build channel-to-chip mapping for STD instrument remapping ---
  // For compound chips like Genesis (FM + PSG), we need to know which
  // channels are FM vs PSG to correctly remap DIV_INS_STD instruments.
  const channelChipInsType = buildChannelChipMap(module);
  const channelChipId = buildChannelChipIdMap(module);

  // Scan pattern data to find which channels each instrument appears on
  const instrumentChannels = scanInstrumentChannels(module);

  // Convert instruments with full Furnace data preservation
  const instruments: ParsedInstrument[] = module.instruments.map((inst, idx) => {
    const samples: ParsedSample[] = [];

    // Map Furnace instrument type to SynthType
    let synthType = mapFurnaceInstrumentType(inst.type);

    // DIV_INS_STD (type 0) is generic and adapts to the module's chip context.
    // Use the pattern data to determine which channels this instrument plays on,
    // then map to the appropriate synth type based on the channel's chip.
    if (inst.type === 0 && synthType === 'ChipSynth') {
      const channels = instrumentChannels.get(idx);
      if (channels && channels.size > 0) {
        // Find the most common chip instrument type across all channels this instrument is used on
        const typeCounts = new Map<number, number>();
        for (const ch of channels) {
          const insType = channelChipInsType[ch];
          if (insType !== undefined && insType !== 0) {
            typeCounts.set(insType, (typeCounts.get(insType) || 0) + 1);
          }
        }
        // Pick the most-used type
        let bestType = 0;
        let bestCount = 0;
        for (const [t, c] of typeCounts) {
          if (c > bestCount) { bestType = t; bestCount = c; }
        }
        if (bestType > 0) {
          const remapped = FURNACE_TYPE_MAP[bestType];
          if (remapped) {
            console.log(`[FurnaceSongParser] Remapping STD inst ${idx} "${inst.name}": ChipSynth -> ${remapped} (channels=${[...channels].join(',')}, chipInsType=${bestType})`);
            synthType = remapped;
          }
        }
      } else if (module.systems.length > 0) {
        // No pattern usage found — fall back to primary chip's default
        const primaryChip = module.systems[0];
        const defaultInsType = CHIP_DEFAULT_INS_TYPE[primaryChip];
        if (defaultInsType !== undefined && defaultInsType !== 0) {
          const remapped = FURNACE_TYPE_MAP[defaultInsType];
          if (remapped) {
            console.log(`[FurnaceSongParser] Remapping STD inst ${idx} "${inst.name}": ChipSynth -> ${remapped} (fallback, chip=0x${primaryChip.toString(16)})`);
            synthType = remapped;
          }
        }
      }
    }

    // Refine C64 SID variant based on chip ID (6581 vs 8580)
    // DIV_INS_C64 (type 3), DIV_INS_SID2 (63) map to FurnaceC64; DIV_INS_SID3 (66) maps to FurnaceSID3
    // but we can distinguish the hardware variant from the chip ID
    if (synthType === 'FurnaceC64') {
      const channels = instrumentChannels.get(idx);
      let chipId = module.systems.length > 0 ? module.systems[0] : 0; // Default to primary chip

      // If we know which channels this instrument is used on, get the chip ID from those channels
      if (channels && channels.size > 0) {
        const firstCh = channels.values().next().value;
        if (firstCh !== undefined && channelChipId[firstCh] !== undefined) {
          chipId = channelChipId[firstCh];
        }
      }

      if (chipId === 0x47 || chipId === 0xf0) {
        // 0x47 = C64 6581, 0xf0 = SID2 (typically 6581-based)
        synthType = 'FurnaceSID6581';
        console.log(`[FurnaceSongParser] C64 inst ${idx} "${inst.name}": refined to FurnaceSID6581 (chip=0x${chipId.toString(16)})`);
      } else if (chipId === 0x07) {
        // 0x07 = C64 8580
        synthType = 'FurnaceSID8580';
        console.log(`[FurnaceSongParser] C64 inst ${idx} "${inst.name}": refined to FurnaceSID8580 (chip=0x${chipId.toString(16)})`);
      }
    }

    const isSampleBased = synthType === 'Sampler' || synthType === 'Player';

    // Debug: Log instrument type mapping
    console.log(`[FurnaceSongParser] Inst ${idx} "${inst.name}": type=${inst.type} -> synthType="${synthType}" hasFM=${!!inst.fm} samples=${inst.samples.length} wavetables=${inst.wavetables.length}`);

    // Convert samples referenced by this instrument
    if (inst.samples && inst.samples.length > 0) {
      for (const sampleIdx of inst.samples) {
        if (sampleIdx < module.samples.length) {
          const furSample = module.samples[sampleIdx];
          samples.push(convertFurnaceSample(furSample, sampleIdx));
        }
      }
    } else if (isSampleBased && idx < module.samples.length) {
      // Default sample association for Amiga-style instruments
      // When inst.samples is empty, use sample[idx] for instrument[idx]
      const furSample = module.samples[idx];
      samples.push(convertFurnaceSample(furSample, idx));
    }

    // Build FurnaceInstrumentData for chip-accurate playback
    // Use the module's primary chip to determine chipType (not the instrument type)
    const primaryChipId = module.systems.length > 0 ? module.systems[0] : 0;
    const engineChipType = CHIP_ID_TO_ENGINE_CHIP[primaryChipId] ?? inst.type;
    const furnaceData: FurnaceInstrumentData = {
      chipType: engineChipType,
      synthType,
      macros: inst.macros.map(m => ({
        code: m.code,
        type: m.code,  // Downstream code uses 'type' as slot identifier
        data: [...m.data],
        loop: m.loop,
        release: m.release,
        speed: m.speed,
        mode: m.mode,
        delay: m.delay,
      })),
      wavetables: inst.wavetables
        .filter(wIdx => wIdx < module.wavetables.length)
        .map(wIdx => {
          const wt = module.wavetables[wIdx];
          return {
            id: wIdx,
            data: [...wt.data],
            len: wt.width,
            max: wt.height,
          };
        }),
    };

    // Pass through operator macros if present (O1-O4 feature blocks)
    if (inst.opMacroArrays) {
      furnaceData.opMacroArrays = inst.opMacroArrays.map(opMacros =>
        opMacros.map(m => ({
          code: m.code,
          type: m.code,
          data: [...m.data],
          loop: m.loop,
          release: m.release,
          speed: m.speed,
          mode: m.mode,
          delay: m.delay,
        }))
      );
    }

    // Add FM parameters if present
    if (inst.fm) {
      furnaceData.fm = {
        algorithm: inst.fm.algorithm,
        feedback: inst.fm.feedback,
        fms: inst.fm.fms,
        ams: inst.fm.ams,
        fms2: inst.fm.fms2,
        ams2: inst.fm.ams2,
        ops: inst.fm.ops,
        opllPreset: inst.fm.opllPreset,
        block: inst.fm.block,
        fixedDrums: inst.fm.fixedDrums,
        kickFreq: inst.fm.kickFreq,
        snareHatFreq: inst.fm.snareHatFreq,
        tomTopFreq: inst.fm.tomTopFreq,
        x1BankSlot: inst.fm.x1BankSlot,
        powerNoiseOctave: inst.fm.powerNoiseOctave,
        ws: inst.fm.ws,
        sid3: inst.fm.sid3,
        nes: inst.fm.nes,
        operators: inst.fm.operators.map((op: FurnaceOperatorConfig) => ({
          enabled: op.enabled,
          mult: op.mult,
          tl: op.tl,
          ar: op.ar,
          dr: op.dr,
          d2r: op.d2r,
          sl: op.sl,
          rr: op.rr,
          dt: op.dt,
          dt2: op.dt2,
          rs: op.rs,
          am: op.am,
          ksr: op.ksr,
          ksl: op.ksl,
          sus: op.sus,
          vib: op.vib,
          ws: op.ws,
          ssg: op.ssg,
          egt: op.egt,
          kvs: op.kvs,
          dvb: op.dvb,
          dam: op.dam,
        })),
      };
    }

    // Pass through amiga/sample config
    if (inst.amiga) {
      furnaceData.amiga = {
        initSample: inst.amiga.initSample,
        useNoteMap: inst.amiga.useNoteMap,
        useSample: inst.amiga.useSample,
        useWave: inst.amiga.useWave,
        waveLen: inst.amiga.waveLen,
        noteMap: inst.amiga.noteMap,
      };
    }

    // Pass through chip-specific data
    const chipConfig: Record<string, unknown> = {};
    if (inst.gb) chipConfig.gb = inst.gb;
    if (inst.c64) chipConfig.c64 = inst.c64;
    if (inst.snes) chipConfig.snes = inst.snes;
    if (inst.n163) chipConfig.n163 = inst.n163;
    if (inst.fds) chipConfig.fds = inst.fds;
    if (inst.es5506) chipConfig.es5506 = inst.es5506;
    if (inst.multipcm) chipConfig.multipcm = inst.multipcm;
    if (inst.soundUnit) chipConfig.soundUnit = inst.soundUnit;
    if (inst.esfm) chipConfig.esfm = inst.esfm;
    if (inst.powerNoise) chipConfig.powerNoise = inst.powerNoise;
    if (inst.sid2) chipConfig.sid2 = inst.sid2;
    if (Object.keys(chipConfig).length > 0) {
      furnaceData.chipConfig = chipConfig;
    }

    return {
      id: idx + 1,
      name: inst.name || `Instrument ${idx + 1}`,
      samples,
      fadeout: 0,
      volumeType: 'none' as const,
      panningType: 'none' as const,
      furnace: furnaceData,
      rawBinaryData: inst.rawBinaryData,  // Pass through raw binary data
    };
  });

  // Convert patterns - flatten the selected subsong's patterns
  const patterns: ConvertedPatternCell[][][] = [];
  const subsong = module.subsongs[subsongIndex] || module.subsongs[0];
  if (!subsong) {
    return { instruments, patterns: [], metadata: createMetadata(module, subsongIndex), wavetables: [], samples: [], furnaceNative: { subsongs: [], activeSubsong: subsongIndex, chipIds: module.systems.slice(0, module.systemLen).map(id => FILE_ID_TO_ENUM[id] ?? id) } };
  }

  // Debug: Log pattern map keys
  console.log('[FurnaceParser] Pattern map size:', module.patterns.size);
  console.log('[FurnaceParser] Subsong patLen:', subsong.patLen, 'ordersLen:', subsong.ordersLen);
  console.log('[FurnaceParser] Orders (first 3 channels):', subsong.orders?.slice(0, 3)?.map(o => o?.slice(0, 10)));

  // Check if this is a chip synth platform (no -24 octave offset needed)
  const primaryChipId = module.systems[0] || 0;
  const isChipSynth = CHIP_SYNTH_IDS.has(primaryChipId);
  console.log(`[FurnaceParser] Platform chip ID: 0x${primaryChipId.toString(16)}, isChipSynth: ${isChipSynth}`);

  // CRITICAL: Create combined patterns by ORDER POSITION, not by pattern index.
  // Furnace has per-channel order tables: orders[channel][orderPos] = patternIndex
  // Each channel can play a different pattern at each song position.
  // We must look up each channel's pattern from its own order table.
  let totalRawNotes = 0;     // Notes in Furnace data (before conversion)
  let totalConvertedNotes = 0; // Notes that survived conversion
  let totalDroppedNotes = 0;   // Notes lost to octave clamping
  let totalMissedLookups = 0;  // Pattern key lookups that failed
  let totalEffects = 0;
  const droppedExamples: string[] = [];

  for (let orderPos = 0; orderPos < subsong.ordersLen; orderPos++) {
    const patternRows: ConvertedPatternCell[][] = [];

    for (let row = 0; row < subsong.patLen; row++) {
      const rowCells: ConvertedPatternCell[] = [];

      for (let ch = 0; ch < module.chans; ch++) {
        // Look up this channel's pattern index for this order position
        const patIdx = subsong.orders[ch]?.[orderPos] ?? 0;
        const key = `${subsongIndex}_${ch}_${patIdx}`;
        const pattern = module.patterns.get(key);

        if (pattern && pattern.rows[row]) {
          const cell = pattern.rows[row];
          // Track raw note data before conversion
          if (cell.note >= 1 && cell.note <= 12) {
            totalRawNotes++;
          }
          if (cell.effects.length > 0 && cell.effects.some(e => e.type >= 0)) {
            totalEffects++;
          }
          const converted = convertFurnaceCell(cell, isChipSynth);
          if (converted.note > 0 && converted.note < 97) {
            totalConvertedNotes++;
          }
          // Detect dropped notes (raw had a note, converted has 0)
          if (cell.note >= 1 && cell.note <= 12 && converted.note === 0) {
            totalDroppedNotes++;
            if (droppedExamples.length < 5) {
              const noteNames = ['?', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'];
              droppedExamples.push(`${noteNames[cell.note] || '?'}${cell.octave} (ord=${orderPos} ch=${ch} row=${row})`);
            }
          }
          rowCells.push(converted);
        } else {
          if (row === 0 && orderPos === 0) {
            // Log first row lookup failures
            totalMissedLookups++;
            if (totalMissedLookups <= 5) {
              console.log(`[FurnaceParser] Pattern lookup MISS: key="${key}" patternExists=${module.patterns.has(key)}`);
            }
          }
          rowCells.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effectType: 0,
            effectParam: 0,
            effectType2: 0,
            effectParam2: 0,
          } as ConvertedPatternCell);
        }
      }

      patternRows.push(rowCells);
    }

    patterns.push(patternRows);
  }

  // Debug: Log converted patterns summary
  const nonEmptyPatterns = patterns.filter(pat =>
    pat.some(row => row.some(cell => cell.note > 0 || cell.instrument > 0 || cell.effectType > 0))
  );
  console.log(`[FurnaceParser] Converted ${patterns.length} patterns (by order position), ${nonEmptyPatterns.length} have data`);
  console.log(`[FurnaceParser] Note stats: ${totalRawNotes} raw notes → ${totalConvertedNotes} survived, ${totalDroppedNotes} dropped (octave too low), ${totalEffects} effect cells`);
  if (droppedExamples.length > 0) {
    console.log(`[FurnaceParser] Dropped note examples:`, droppedExamples);
  }
  // Log all pattern keys for debugging
  console.log(`[FurnaceParser] Pattern map keys:`, [...module.patterns.keys()].slice(0, 30));
  
  // Build native Furnace data for format-specific editor
  const furnaceNative = buildFurnaceNativeData(module);

  return {
    instruments,
    patterns,
    metadata: createMetadata(module, subsongIndex),
    wavetables: module.wavetables.map(wt => ({
      data: [...wt.data],
      width: wt.width,
      height: wt.height,
    })),
    samples: module.samples.map(s => ({
      data: s.data as Int16Array | Int8Array | Uint8Array,
      rate: s.c4Rate,
      depth: s.depth,
      samples: s.length,
      loopStart: s.loopStart,
      loopEnd: s.loopEnd,
      loopMode: s.loopDirection ?? 0,
      name: s.name,
    })),
    furnaceNative,
  };
}

/**
 * Build FurnaceNativeData from parsed module for the format-specific editor.
 * Preserves per-channel pattern pools and 2D order matrix.
 */
export function buildFurnaceNativeData(module: FurnaceModule): FurnaceNativeData {
  const subsongs: FurnaceSubsong[] = module.subsongs.map((sub, subIdx) => {
    const channels: FurnaceChannelData[] = [];

    for (let ch = 0; ch < module.chans; ch++) {
      const patternPool = new Map<number, FurnacePatternData>();

      // Collect all unique pattern indices for this channel from the order table
      const usedPatterns = new Set<number>();
      for (let pos = 0; pos < sub.ordersLen; pos++) {
        const patIdx = sub.orders[ch]?.[pos];
        if (patIdx !== undefined) usedPatterns.add(patIdx);
      }

      // Build pattern data for each used pattern
      for (const patIdx of usedPatterns) {
        const key = `${subIdx}_${ch}_${patIdx}`;
        const pattern = module.patterns.get(key);
        if (pattern) {
          const rows: FurnaceRow[] = pattern.rows.map(cell => ({
            note: convertFurnaceNoteValue(cell),
            ins: cell.instrument,
            vol: cell.volume,
            effects: cell.effects.map(e => ({ cmd: e.type, val: e.value })),
          }));
          patternPool.set(patIdx, { rows });
        }
      }

      channels.push({
        name: sub.channelNames?.[ch] || `CH ${ch}`,
        effectCols: sub.effectColumns?.[ch] || 1,
        patterns: patternPool,
      });
    }

    // YM2151 E5xx range scaling (fur.cpp:2372-2401)
    // For files before version 236, E5xx effect values need range adaptation
    if (module.version < 236) {
      const sysEnums = module.systems.slice(0, module.systemLen).map(id => FILE_ID_TO_ENUM[id] ?? id);
      let chOff = 0;
      for (let si = 0; si < module.systemLen; si++) {
        const chipChans = module.systemChans?.[si] || 0;
        if (sysEnums[si] === 19) { // DIV_SYSTEM_YM2151
          // Scale all E5xx effect values in YM2151 channels
          for (let c = chOff; c < chOff + chipChans && c < channels.length; c++) {
            for (const [, patData] of channels[c].patterns) {
              for (const row of patData.rows) {
                for (const fx of row.effects) {
                  if (fx.cmd === 0xe5 && fx.val !== -1) {
                    let newVal = (2 * ((fx.val & 0xff) - 0x80)) + 0x80;
                    if (newVal < 0) newVal = 0;
                    if (newVal > 0xff) newVal = 0xff;
                    fx.val = newVal;
                  }
                }
              }
            }
          }
        }
        chOff += chipChans;
      }
    }

    return {
      name: sub.name || `Subsong ${subIdx}`,
      patLen: sub.patLen,
      ordersLen: sub.ordersLen,
      orders: sub.orders,
      channels,
      speed1: sub.speed1,
      speed2: sub.speed2,
      speedPattern: sub.speedPattern,
      hz: sub.hz,
      virtualTempoN: sub.virtualTempo,
      virtualTempoD: sub.virtualTempoD,
    };
  });

  // Clamp linearPitch > 1 to 1 (fur.cpp:2424-2429)
  // Partial pitch linearity (value 2) was removed from Furnace
  const lp = module.compatFlags.linearPitch as number | undefined;
  if (lp != null && lp > 1) {
    module.compatFlags.linearPitch = 1;
  }

  return {
    subsongs,
    activeSubsong: 0,
    chipIds: module.systems.slice(0, module.systemLen).map(id => FILE_ID_TO_ENUM[id] ?? id),
    systemChans: module.systemChans?.slice(0, module.systemLen),
    compatFlags: module.compatFlags,
    grooves: module.grooves.length > 0 ? module.grooves : undefined,
    chipFlags: module.chipFlags?.slice(0, module.systemLen),
    tuning: module.tuning !== 440.0 ? module.tuning : undefined,
    masterVol: module.masterVol,
    systemVol: module.systemVol.length > 0 ? module.systemVol : undefined,
    systemPan: module.systemPan.length > 0 ? module.systemPan : undefined,
    systemPanFR: module.systemPanFR.length > 0 ? module.systemPanFR : undefined,
  };
}

/**
 * Convert pattern data and timing for a single subsong.
 *
 * Use this when pre-converting secondary subsongs at import time.
 * Instruments, wavetables, and samples are MODULE-LEVEL in Furnace — shared across
 * all subsongs — so only patterns and timing metadata are subsong-specific.
 * The full convertFurnaceToDevilbox() result already covers those; this function
 * avoids redundant re-conversion of instruments for every additional subsong.
 */
export function convertSubsongForPlayback(module: FurnaceModule, subsongIndex: number): {
  patterns: ConvertedPatternCell[][][];
  metadata: ImportMetadata;
} {
  const primaryChipId = module.systems[0] || 0;
  const isChipSynth = CHIP_SYNTH_IDS.has(primaryChipId);
  const subsong = module.subsongs[subsongIndex] || module.subsongs[0];
  if (!subsong) {
    return { patterns: [], metadata: createMetadata(module, subsongIndex) };
  }

  const patterns: ConvertedPatternCell[][][] = [];
  for (let orderPos = 0; orderPos < subsong.ordersLen; orderPos++) {
    const patternRows: ConvertedPatternCell[][] = [];
    for (let row = 0; row < subsong.patLen; row++) {
      const rowCells: ConvertedPatternCell[] = [];
      for (let ch = 0; ch < module.chans; ch++) {
        const patIdx = subsong.orders[ch]?.[orderPos] ?? 0;
        const key = `${subsongIndex}_${ch}_${patIdx}`;
        const pattern = module.patterns.get(key);
        if (pattern && pattern.rows[row]) {
          rowCells.push(convertFurnaceCell(pattern.rows[row], isChipSynth));
        } else {
          rowCells.push({
            note: 0, instrument: 0, volume: 0,
            effectType: 0, effectParam: 0,
            effectType2: 0, effectParam2: 0,
          } as ConvertedPatternCell);
        }
      }
      patternRows.push(rowCells);
    }
    patterns.push(patternRows);
  }

  return { patterns, metadata: createMetadata(module, subsongIndex) };
}

/**
 * Create import metadata
 */
function createMetadata(module: FurnaceModule, subsongIndex = 0): ImportMetadata {
  const subsong = module.subsongs[subsongIndex] || module.subsongs[0];

  // Calculate BPM from Furnace's timing system
  // 
  // Furnace timing:
  //   - hz = ticks per second (50 PAL, 60 NTSC)
  //   - speed = ticks per row
  //   - Row rate = hz / speed (rows per second)
  //
  // Our replayer timing (ProTracker-style):
  //   - tickInterval = 2.5 / BPM (seconds per tick)
  //   - rowDuration = tickInterval * speed (seconds per row)
  //   - Simplify: rowDuration = (2.5 / BPM) * speed
  //
  // Match Furnace row rate:
  //   - Furnace rowDuration = speed / hz
  //   - Set equal: speed / hz = (2.5 / BPM) * speed
  //   - Simplify: 1 / hz = 2.5 / BPM
  //   - BPM = 2.5 * hz
  //
  // Apply virtual tempo multiplier: BPM = 2.5 * hz * (virtualTempo / virtualTempoD)
  //
  // Example: hz=60, speed=6, virtualTempo=150/150
  //   - BPM = 2.5 * 60 * 1 = 150
  //   - tickInterval = 2.5 / 150 = 0.01667 seconds per tick
  //   - rowDuration = 0.01667 * 6 = 0.1 seconds per row
  //   - Row rate = 10 rows/second (matches Furnace's 60/6 = 10)
  
  const virtualTempo = subsong?.virtualTempo || 150;
  const virtualTempoD = subsong?.virtualTempoD || 150;
  const hz = subsong?.hz || 60;
  const speed = subsong?.speed1 || 6;
  
  // Calculate BPM for ProTracker-compatible playback
  // Note: speed is NOT in the formula because the replayer multiplies by speed in rowDuration
  const bpm = Math.round(2.5 * hz * (virtualTempo / virtualTempoD));
  
  return {
    sourceFormat: 'XM', // Use XM as closest equivalent for effect handling
    sourceFile: module.name || 'Furnace Module',
    importedAt: new Date().toISOString(),
    originalChannelCount: module.chans,
    originalPatternCount: module.patterns.size,
    originalInstrumentCount: module.instruments.length,
    modData: {
      moduleType: 'FUR',
      initialSpeed: speed,
      initialBPM: bpm,
      amigaPeriods: false,
      channelNames: subsong?.channelNames || Array.from({ length: module.chans }, (_, i) => `Ch ${i + 1}`),
      songLength: subsong?.ordersLen || 1,
      restartPosition: 0,
      // Sequential order: patterns are already flattened by order position
      // (each combined pattern contains each channel's correct pattern data for that position)
      patternOrderTable: Array.from({ length: subsong?.ordersLen || 1 }, (_, i) => i),
      songMessage: module.comment,
    },
    furnaceData: {
      speed2: subsong?.speed2,
      hz: subsong?.hz,
      virtualTempoN: subsong?.virtualTempo,
      virtualTempoD: subsong?.virtualTempoD,
      compatFlags: module.compatFlags,
      systems: module.systems,
      systemChans: module.systemChans,
      grooves: module.grooves.length > 0
        ? module.grooves.map(g => g.val.slice(0, g.len))
        : undefined,
      chipFlags: module.chipFlags?.slice(0, module.systemLen),
      tuning: module.tuning !== 440.0 ? module.tuning : undefined,
    },
  };
}

/**
 * Convert Furnace sample to ParsedSample
 */
function convertFurnaceSample(furSample: FurnaceSample, id: number): ParsedSample {
  let pcmData: ArrayBuffer;

  if (furSample.depth === 16 && furSample.data instanceof Int16Array) {
    pcmData = furSample.data.buffer.slice(
      furSample.data.byteOffset,
      furSample.data.byteOffset + furSample.data.byteLength
    ) as ArrayBuffer;
  } else if (furSample.data instanceof Int8Array) {
    // Convert 8-bit to 16-bit
    const data16 = new Int16Array(furSample.length);
    for (let i = 0; i < furSample.length; i++) {
      data16[i] = (furSample.data as Int8Array)[i] * 256;
    }
    pcmData = data16.buffer;
  } else {
    // Other formats - create empty buffer
    pcmData = new ArrayBuffer(furSample.length * 2);
  }

  return {
    id,
    name: furSample.name,
    pcmData,
    loopStart: furSample.loopStart >= 0 ? furSample.loopStart : 0,
    loopLength: furSample.loopEnd > furSample.loopStart
      ? furSample.loopEnd - furSample.loopStart
      : 0,
    loopType: furSample.loopStart < 0 ? 'none' :
              furSample.loopDirection === 2 ? 'pingpong' : 'forward',
    volume: 64,
    finetune: 0,
    relativeNote: 0,
    panning: 128,
    bitDepth: 16,
    sampleRate: furSample.c4Rate || furSample.compatRate || 22050,
    length: furSample.length,
  };
}

/**
 * Get supported extensions
 */
export function getSupportedFurnaceExtensions(): string[] {
  return ['.fur'];
}
