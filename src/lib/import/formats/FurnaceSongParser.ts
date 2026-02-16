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
import pako from 'pako';
import type {
  ParsedInstrument,
  ParsedSample,
  ImportMetadata,
  FurnaceInstrumentData,
} from '../../../types/tracker';
import type { FurnaceConfig, FurnaceOperatorConfig, SynthType } from '../../../types/instrument';
import { DEFAULT_FURNACE } from '../../../types/instrument';

// Format version constants
const DIV_ENGINE_VERSION = 231;

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
  66: 'FurnaceC64',         // DIV_INS_SID3 - SID3
};

/**
 * Map Furnace instrument type to SynthType
 */
function mapFurnaceInstrumentType(furType: number): SynthType {
  return FURNACE_TYPE_MAP[furType] || 'ChipSynth';
}

// Note conversion tables from fur.cpp
const newFormatNotes: number[] = [
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -5
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -4
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -3
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -2
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -1
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  0
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  1
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  2
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  3
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  4
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  5
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  6
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  7
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  8
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11  //  9
];

const newFormatOctaves: number[] = [
  250, 251, 251, 251, 251, 251, 251, 251, 251, 251, 251, 251, // -5
  251, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, // -4
  252, 253, 253, 253, 253, 253, 253, 253, 253, 253, 253, 253, // -3
  253, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, // -2
  254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, // -1
  255,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, //  0
    0,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1, //  1
    1,   2,   2,   2,   2,   2,   2,   2,   2,   2,   2,   2, //  2
    2,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3, //  3
    3,   4,   4,   4,   4,   4,   4,   4,   4,   4,   4,   4, //  4
    4,   5,   5,   5,   5,   5,   5,   5,   5,   5,   5,   5, //  5
    5,   6,   6,   6,   6,   6,   6,   6,   6,   6,   6,   6, //  6
    6,   7,   7,   7,   7,   7,   7,   7,   7,   7,   7,   7, //  7
    7,   8,   8,   8,   8,   8,   8,   8,   8,   8,   8,   8, //  8
    8,   9,   9,   9,   9,   9,   9,   9,   9,   9,   9,   9  //  9
];

// Special note values
const NOTE_OFF = 180;
const NOTE_RELEASE = 181;
const MACRO_RELEASE = 182;

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

/**
 * Chip file ID → FurnaceChipType engine value
 * Maps Furnace file system IDs to the FurnaceChipEngine enum values
 * Used to set the correct chipType when converting instruments
 */
/**
 * Chip synth platform IDs that use native Furnace octave numbering.
 * These do NOT need the -24 octave offset used for Amiga sample playback.
 * The Furnace WASM engine handles their native octave range directly.
 */
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
  0x02: 10,   // Genesis (compound - should be flattened)
  0x03: 4,    // SN76489/SMS
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
  0xa0: 9,    // YM2612 extended
  0xa1: 5,    // SCC
  0xa2: 11,   // OPL drums
  0xa3: 11,   // OPL2 drums
  0xa4: 20,   // OPL3 drums
  0xa5: 14,   // Neo Geo (YM2610)
  0xa6: 17,   // Neo Geo extended
  0xa7: 11,   // OPLL drums
  0xa8: 4,    // Lynx
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

// Pattern cell
export interface FurnacePatternCell {
  note: number;       // 0-179 = note, 180 = off, 181 = release, 182 = macro release
  octave: number;     // -5 to 9 (stored as signed)
  instrument: number; // -1 = none
  volume: number;     // -1 = none
  effects: Array<{ type: number; value: number }>;
}

// Pattern
export interface FurnacePattern {
  subsong: number;
  channel: number;
  index: number;
  name: string;
  rows: FurnacePatternCell[];
}

// SubSong
export interface FurnaceSubSong {
  name: string;
  comment: string;
  timeBase: number;
  speed1: number;
  speed2: number;
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

// Chip-specific configs parsed from feature blocks
export interface FurnaceGBData {
  envVol: number; envDir: number; envLen: number; soundLen: number;
  softEnv: boolean; alwaysInit: boolean; doubleWave: boolean;
  hwSeqLen: number; hwSeq: Array<{ cmd: number; data: number }>;
}
export interface FurnaceC64Data {
  triOn: boolean; sawOn: boolean; pulseOn: boolean; noiseOn: boolean;
  toFilter: boolean; initFilter: boolean; dutyIsAbs: boolean;
  lp: boolean; bp: boolean; hp: boolean; ch3off: boolean;
  filterIsAbs: boolean; noTest: boolean; ringMod: boolean; oscSync: boolean;
  resetDuty: boolean;
  a: number; d: number; s: number; r: number;
  duty: number; cut: number; res: number;
}
export interface FurnaceSNESData {
  a: number; d: number; s: number; r: number;
  useEnv: boolean; sus: number; gainMode: number; gain: number; d2: number;
}
export interface FurnaceN163Data {
  wave: number; wavePos: number; waveLen: number; waveMode: number; perChanPos?: boolean;
}
export interface FurnaceFDSData {
  modSpeed: number; modDepth: number; initModTableWithFirstWave: boolean;
  modTable: number[];
}

// Instrument
export interface FurnaceInstrument {
  name: string;
  type: number;
  fm?: FurnaceConfig;
  macros: FurnaceMacro[];
  samples: number[];
  wavetables: number[];
  rawBinaryData?: Uint8Array;  // Raw binary instrument data for upload to WASM
  gb?: FurnaceGBData;
  c64?: FurnaceC64Data;
  snes?: FurnaceSNESData;
  n163?: FurnaceN163Data;
  fds?: FurnaceFDSData;
  amiga?: {
    initSample: number;
    useNoteMap: boolean;
    useSample: boolean;
    useWave: boolean;
    waveLen: number;
    noteMap?: Array<{ freq: number; map: number }>;
  };
}

// Macro
export interface FurnaceMacro {
  code: number;
  length: number;
  loop: number;
  release: number;
  mode: number;
  type: number;
  delay: number;
  speed: number;
  data: number[];
}

// Sample
export interface FurnaceSample {
  name: string;
  length: number;
  compatRate: number;
  c4Rate: number;
  depth: number;
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

// Compatibility flags (50+ boolean flags for legacy behavior)
export interface FurnaceCompatFlags {
  limitSlides: boolean;
  linearPitch: number;  // 0=off, 1=full, 2=partial
  pitchSlideSpeed: number;
  loopModality: number;  // 0=reset, 1=fake reset, 2=no reset
  delayBehavior: number; // 0=strict, 1=broken, 2=lax
  jumpTreatment: number; // 0=normal, 1=old Furnace, 2=DefleMask
  properNoiseLayout: boolean;
  waveDutyIsVol: boolean;
  resetMacroOnPorta: boolean;
  legacyVolumeSlides: boolean;
  compatibleArpeggio: boolean;
  noteOffResetsSlides: boolean;
  targetResetsSlides: boolean;
  arpNonPorta: boolean;
  algMacroBehavior: boolean;
  brokenShortcutSlides: boolean;
  ignoreDuplicateSlides: boolean;
  stopPortaOnNoteOff: boolean;
  continuousVibrato: boolean;
  brokenDACMode: boolean;
  oneTickCut: boolean;
  newInsTriggersInPorta: boolean;
  arp0Reset: boolean;
  brokenSpeedSel: boolean;
  noSlidesOnFirstTick: boolean;
  rowResetsArpPos: boolean;
  ignoreJumpAtEnd: boolean;
  buggyPortaAfterSlide: boolean;
  gbInsAffectsEnvelope: boolean;
  sharedExtStat: boolean;
  ignoreDACModeOutsideIntendedChannel: boolean;
  e1e2AlsoTakePriority: boolean;
  newSegaPCM: boolean;
  fbPortaPause: boolean;
  snDutyReset: boolean;
  pitchMacroIsLinear: boolean;
  oldOctaveBoundary: boolean;
  noOPN2Vol: boolean;
  newVolumeScaling: boolean;
  volMacroLinger: boolean;
  brokenOutVol: boolean;
  brokenOutVol2: boolean;
  e1e2StopOnSameNote: boolean;
  brokenPortaArp: boolean;
  snNoLowPeriods: boolean;
  disableSampleMacro: boolean;
  oldArpStrategy: boolean;
  brokenPortaLegato: boolean;
  brokenFMOff: boolean;
  preNoteNoEffect: boolean;
  oldSampleOffset: boolean;
}

// Groove pattern (custom tick sequences for swing/shuffle)
export interface FurnaceGroove {
  len: number;
  val: number[];  // Up to 16 tick values
}

// Patchbay connection (inter-chip routing)
export interface FurnacePatchbayConnection {
  portA: number;  // Source port
  portB: number;  // Destination port
  level: number;  // Mix level (0-255)
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

  // Compatibility flags (for legacy .fur file behavior)
  compatFlags?: FurnaceCompatFlags;

  // Grooves (custom tick patterns for swing/shuffle)
  grooves: FurnaceGroove[];

  // Patchbay (inter-chip audio routing)
  patchbay: FurnacePatchbayConnection[];
  patchbayAuto: boolean;
}

/**
 * Decompress Furnace file if needed
 */
function decompressFur(data: Uint8Array): Uint8Array {
  // Check for zlib header (0x78)
  if (data[0] === 0x78) {
    try {
      return pako.inflate(data);
    } catch (e) {
      throw new Error('Failed to decompress Furnace file: ' + e);
    }
  }
  return data;
}

/**
 * Read a null-terminated string
 */
function readString(reader: BinaryReader): string {
  let result = '';
  while (!reader.isEOF()) {
    const char = reader.readUint8();
    if (char === 0) break;
    result += String.fromCharCode(char);
  }
  return result;
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
    grooves: [],
    patchbay: [],
    patchbayAuto: false,
  };

  if (version >= 240) {
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
  for (let i = 0; i < patchbayConns; i++) {
    const portA = reader.readUint16();
    const portB = reader.readUint16();
    // Note: Level might be in a different format, this is basic structure
    module.patchbay.push({ portA, portB, level: 255 });
  }
  module.patchbayAuto = reader.readUint8() > 0;

  // Element pointers
  const insPtr: number[] = [];
  const wavePtr: number[] = [];
  const samplePtr: number[] = [];
  const subSongPtr: number[] = [];
  const patPtr: number[] = [];
  const groovePtr: number[] = [];
  let commentPtr = 0;
  let compatFlagsPtr = 0;

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
        reader.skip(count * 4); // Skip flag pointers
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
        reader.readUint32(); // Should be 1
        compatFlagsPtr = reader.readUint32();
        break;
      }
      case DIV_ELEMENT_COMMENTS: {
        reader.readUint32(); // Should be 1
        commentPtr = reader.readUint32();
        break;
      }
      case DIV_ELEMENT_GROOVE: {
        const count = reader.readUint32();
        for (let i = 0; i < count; i++) {
          groovePtr.push(reader.readUint32());
        }
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

  // Parse grooves
  for (const ptr of groovePtr) {
    reader.seek(ptr);
    const groove = parseGroove(reader);
    module.grooves.push(groove);
  }

  // Parse compatFlags
  if (compatFlagsPtr > 0) {
    reader.seek(compatFlagsPtr);
    const compatFlags = parseCompatFlags(reader);
    module.compatFlags = compatFlags;
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
  const chips: number[] = [];
  for (let i = 0; i < 32; i++) {
    const chip = reader.readUint8();
    if (chip !== 0) chips.push(chip);
  }
  module.systems = chips.filter(c => c !== 0);
  module.systemLen = module.systems.length;

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

  // Chip flags (128 bytes) - skip for now
  if (version >= 119) {
    // Pointers to chip flags
    reader.skip(128);
  } else {
    // Direct flags
    reader.skip(128);
  }

  // Song name and author
  module.name = readString(reader);
  module.author = readString(reader);

  // A-4 tuning
  module.tuning = reader.readFloat32();

  // Compatibility flags
  // Reference: fur.cpp:1258-1348
  // This block always reads exactly 20 bytes for any version (v37+ reads
  // flags with else clauses that skip; v<37 reads 20 padding bytes).
  // Our parser doesn't use these flags, so just consume the fixed 20 bytes.
  reader.skip(20);

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
  console.log(`[FurnaceSongParser] Old format: ${numberOfPats} pattern pointers read`);

  // Orders
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

  // Extended compat flags block 1
  // Reference: fur.cpp:1422-1542
  // Every version gate reads the same byte count via else clauses,
  // totaling 28 bytes for any version >= 70.
  if (version >= 70) {
    reader.skip(28); // 28 bytes of compat flags (all with else skip clauses)
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

  // System output config
  // Reference: fur.cpp:1582-1596
  if (version >= 135) {
    for (let i = 0; i < module.systems.length; i++) {
      module.systemVol.push(reader.readFloat32());
      module.systemPan.push(reader.readFloat32());
      module.systemPanFR.push(reader.readFloat32());
    }
    // Patchbay connections
    const patchbayConns = reader.readUint32();
    for (let i = 0; i < patchbayConns; i++) {
      const portA = reader.readUint16();
      const portB = reader.readUint16();
      module.patchbay.push({ portA, portB, level: 255 });
    }
  }

  // Reference: fur.cpp:1598
  if (version >= 136) {
    module.patchbayAuto = reader.readUint8() > 0;
  }

  // Extended compat flags block 2
  // Reference: fur.cpp:1600-1637
  // 8 bytes total (all with else skip clauses)
  if (version >= 138) {
    reader.skip(8); // brokenPortaLegato + 7 more compat flags
  }

  // Speeds and grooves
  // Reference: fur.cpp:1639-1659
  if (version >= 139) {
    reader.skip(17); // speeds.len (1) + speeds.val (16) - handled by subsong
    const grooveCount = reader.readUint8();
    for (let i = 0; i < grooveCount; i++) {
      const len = reader.readUint8();
      const val: number[] = [];
      for (let j = 0; j < 16; j++) {
        val.push(reader.readUint8());
      }
      module.grooves.push({ len, val });
    }
  }

  // Asset directory pointers
  // Reference: fur.cpp:1665-1669
  if (version >= 156) {
    reader.skip(12); // 3 × readI (asset dir pointers)
  }

  module.subsongs.push(subsong);

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
      console.log(`[FurnaceParser OLD] Inst ${i} rawBinaryData captured: ${inst.rawBinaryData?.length ?? 0} bytes, first 4 bytes: ${Array.from(inst.rawBinaryData.slice(0, 4)).map(b => String.fromCharCode(b)).join('')}`);
      
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
 * Parse instrument
 */
function parseInstrument(reader: BinaryReader): FurnaceInstrument {
  const magic = reader.readMagic(4);

  const inst: FurnaceInstrument = {
    name: '',
    type: 0,
    macros: [],
    samples: [],
    wavetables: [],
  };

  if (magic === 'INS2' || magic === 'FINS') {
    // New instrument format
    // INS2 has a block size field; FINS does NOT (reference: fur.cpp readInsData)
    if (magic === 'INS2') {
      reader.readUint32(); // Block size
    }
    reader.readUint16(); // insVersion (consumed, not used)
    inst.type = reader.readUint16();

    // Read features until EN
    while (!reader.isEOF()) {
      const featCode = reader.readMagic(2);
      if (featCode === 'EN' || featCode === '\0\0') break;

      const featLen = reader.readUint16();
      const featEnd = reader.getOffset() + featLen;

      switch (featCode) {
        case 'NA':
          inst.name = readString(reader);
          break;
        case 'FM':
          inst.fm = parseFMData(reader);
          break;
        case 'MA':
          parseMacroData(reader, inst, featEnd);
          break;
        case 'SM': {
          // Sample/Amiga data — Reference: instrument.cpp:2031-2057
          const initSample = reader.readInt16();
          const smFlags = reader.readUint8();
          const smWaveLen = reader.readUint8();
          const smUseNoteMap = (smFlags & 1) !== 0;
          const smUseSample = (smFlags & 2) !== 0;
          const smUseWave = (smFlags & 4) !== 0;

          // Store initSample as a sample reference so the instrument gets its sample data
          if (initSample >= 0) {
            inst.samples.push(initSample);
          }

          // Store amiga/sample config on the instrument
          inst.amiga = {
            initSample,
            useNoteMap: smUseNoteMap,
            useSample: smUseSample,
            useWave: smUseWave,
            waveLen: smWaveLen,
          };

          // Parse note map if present (120 entries × 4 bytes)
          if (smUseNoteMap) {
            inst.amiga.noteMap = [];
            const seenSamples = new Set(inst.samples);
            for (let note = 0; note < 120; note++) {
              const freq = reader.readInt16();
              const map = reader.readInt16();
              inst.amiga.noteMap.push({ freq, map });
              // Collect unique sample indices from the note map
              if (map >= 0 && !seenSamples.has(map)) {
                seenSamples.add(map);
                inst.samples.push(map);
              }
            }
          }
          // reader.seek(featEnd) handles any remaining bytes
          break;
        }
        case 'SL':
        case 'LS': {
          // Sample list
          const count = featCode === 'LS' ? reader.readUint16() : reader.readUint8();
          for (let i = 0; i < count; i++) {
            if (featCode === 'LS') {
              inst.samples.push(reader.readUint16());
            } else {
              inst.samples.push(reader.readUint8());
            }
          }
          break;
        }
        case 'WL':
        case 'LW': {
          // Wavetable list
          const count = featCode === 'LW' ? reader.readUint16() : reader.readUint8();
          for (let i = 0; i < count; i++) {
            if (featCode === 'LW') {
              inst.wavetables.push(reader.readUint16());
            } else {
              inst.wavetables.push(reader.readUint8());
            }
          }
          break;
        }
        case 'GB': {
          // Game Boy instrument — Reference: instrument.cpp:2007-2028
          const gbFlags = reader.readUint8();
          const soundLen = reader.readUint8();
          const gbFlags2 = reader.readUint8();
          const hwSeqLen = reader.readUint8();
          const hwSeq: Array<{ cmd: number; data: number }> = [];
          for (let i = 0; i < hwSeqLen; i++) {
            hwSeq.push({ cmd: reader.readUint8(), data: reader.readInt16() });
          }
          inst.gb = {
            envVol: gbFlags & 0x0F,
            envDir: (gbFlags & 0x10) ? 1 : 0,
            envLen: (gbFlags >> 5) & 0x07,
            soundLen,
            softEnv: !!(gbFlags2 & 1),
            alwaysInit: !!(gbFlags2 & 2),
            doubleWave: !!(gbFlags2 & 4),
            hwSeqLen, hwSeq,
          };
          break;
        }
        case '64': {
          // C64 SID — Reference: instrument.cpp:1958-2004
          const c64f1 = reader.readUint8();
          const c64f2 = reader.readUint8();
          const adsr1 = reader.readUint8();
          const adsr2 = reader.readUint8();
          const duty = reader.readUint16() & 0xFFF;
          const cutRes = reader.readUint16();
          let res = cutRes >> 12;
          let resetDuty = false;
          // v199+: extra byte with high res bits and resetDuty flag
          if (reader.getOffset() < featEnd) {
            const extraByte = reader.readUint8();
            res |= (extraByte & 0x0F) << 4; // high 4 bits of resonance
            resetDuty = !!(extraByte & 0x10); // v222+: resetDuty flag
          }
          inst.c64 = {
            triOn: !!(c64f1 & 1), sawOn: !!(c64f1 & 2), pulseOn: !!(c64f1 & 4),
            noiseOn: !!(c64f1 & 8), toFilter: !!(c64f1 & 16),
            initFilter: !!(c64f1 & 64), dutyIsAbs: !!(c64f1 & 128),
            lp: !!(c64f2 & 1), bp: !!(c64f2 & 4), hp: !!(c64f2 & 2),
            ch3off: !!(c64f2 & 8), filterIsAbs: !!(c64f2 & 16),
            noTest: !!(c64f2 & 32), ringMod: !!(c64f2 & 64), oscSync: !!(c64f2 & 128),
            a: (adsr1 >> 4) & 0x0F, d: adsr1 & 0x0F,
            s: (adsr2 >> 4) & 0x0F, r: adsr2 & 0x0F,
            duty, cut: cutRes & 0xFFF, res, resetDuty,
          };
          // DEBUG: Log raw C64 parse for debugging silent instruments
          console.log(`[FurnaceParser] Inst "${inst.name}" C64 PARSED: c64f1=0x${c64f1.toString(16)} c64f2=0x${c64f2.toString(16)} tri=${inst.c64.triOn} saw=${inst.c64.sawOn} pulse=${inst.c64.pulseOn} noise=${inst.c64.noiseOn} ADSR=${inst.c64.a}/${inst.c64.d}/${inst.c64.s}/${inst.c64.r} duty=${duty}`);
          break;
        }
        case 'SN': {
          // SNES — Reference: instrument.cpp:2208-2234
          const snByte1 = reader.readUint8();
          const snByte2 = reader.readUint8();
          const snByte3 = reader.readUint8();
          const gain = reader.readUint8();
          let sus = (snByte3 & 0x08) ? 1 : 0;
          let d2 = 0;
          // v131+: extra byte with sus (bits 5-6) and d2 (bits 0-4)
          if (reader.getOffset() < featEnd) {
            const snByte4 = reader.readUint8();
            sus = (snByte4 >> 5) & 0x03;
            d2 = snByte4 & 0x1F;
          }
          inst.snes = {
            a: snByte1 & 0x0F, d: (snByte1 >> 4) & 0x07,
            s: (snByte2 >> 5) & 0x07, r: snByte2 & 0x1F,
            useEnv: !!(snByte3 & 0x10), sus, gainMode: snByte3 & 0x07, gain, d2,
          };
          break;
        }
        case 'N1': {
          // Namco 163 — Reference: instrument.cpp:2237-2257
          const n163wave = reader.readInt32();
          const n163wavePos = reader.readUint8();
          const n163waveLen = reader.readUint8();
          const n163waveMode = reader.readUint8();
          let perChanPos = false;
          // v164+: perChanPos flag and optional per-channel wave pos/len arrays
          if (reader.getOffset() < featEnd) {
            perChanPos = reader.readUint8() !== 0;
            if (perChanPos) {
              // Per-channel wave positions (8 channels)
              for (let i = 0; i < 8; i++) reader.readUint8();
              // Per-channel wave lengths (8 channels)
              for (let i = 0; i < 8; i++) reader.readUint8();
            }
          }
          inst.n163 = { wave: n163wave, wavePos: n163wavePos, waveLen: n163waveLen, waveMode: n163waveMode, perChanPos };
          break;
        }
        case 'FD': {
          // FDS / Virtual Boy — Reference: instrument.cpp:2260-2268
          const modSpeed = reader.readInt32();
          const modDepth = reader.readInt32();
          const initMod = reader.readUint8() !== 0;
          const modTable: number[] = [];
          for (let i = 0; i < 32; i++) modTable.push(reader.readUint8());
          inst.fds = { modSpeed, modDepth, initModTableWithFirstWave: initMod, modTable };
          break;
        }
        case 'O1':
        case 'O2':
        case 'O3':
        case 'O4':
          // Operator macros (O1-O4) — Reference: instrument.cpp:2798-2805
          // These are per-operator macro data (AM, AR, DR, MULT, RR, SL, TL, DT2, RS, DT, D2R, SSG)
          // Stored in rawBinaryData for WASM upload, not parsed for TypeScript
          console.log(`[FurnaceParser] Found ${featCode} (operator macros), preserving in rawBinaryData`);
          break;
        case 'LD':
          // OPL drums — Reference: instrument.cpp:2806-2807
          // fixedDrums, kickFreq, snareHatFreq, tomTopFreq
          console.log('[FurnaceParser] Found LD (OPL drums), preserving in rawBinaryData');
          break;
        case 'WS':
          // WaveSynth — Reference: instrument.cpp:2814-2815
          // wavesynth chip-specific data
          console.log('[FurnaceParser] Found WS (WaveSynth), preserving in rawBinaryData');
          break;
        case 'MP':
          // MultiPCM — Reference: instrument.cpp:2824-2825
          // multipcm chip-specific data
          console.log('[FurnaceParser] Found MP (MultiPCM), preserving in rawBinaryData');
          break;
        case 'SU':
          // Sound Unit — Reference: instrument.cpp:2826-2827
          // soundunit chip-specific data
          console.log('[FurnaceParser] Found SU (Sound Unit), preserving in rawBinaryData');
          break;
        case 'ES':
          // ES5506 — Reference: instrument.cpp:2828-2829
          // es5506 filter and envelope data
          console.log('[FurnaceParser] Found ES (ES5506), preserving in rawBinaryData');
          break;
        case 'X1':
          // X1-010 — Reference: instrument.cpp:2830-2831
          // x1_010 chip-specific data
          console.log('[FurnaceParser] Found X1 (X1-010), preserving in rawBinaryData');
          break;
        case 'NE':
          // NES DPCM — Reference: instrument.cpp:2832-2833
          // nes dpcm-specific data
          console.log('[FurnaceParser] Found NE (NES DPCM), preserving in rawBinaryData');
          break;
        case 'EF':
          // ESFM — Reference: instrument.cpp:2834-2835
          // esfm chip-specific data
          console.log('[FurnaceParser] Found EF (ESFM), preserving in rawBinaryData');
          break;
        case 'PN':
          // PowerNoise — Reference: instrument.cpp:2836-2837
          // powernoise chip-specific data
          console.log('[FurnaceParser] Found PN (PowerNoise), preserving in rawBinaryData');
          break;
        case 'S2':
          // SID2 — Reference: instrument.cpp:2838-2839
          // sid2 chip-specific data
          console.log('[FurnaceParser] Found S2 (SID2), preserving in rawBinaryData');
          break;
        case 'S3':
          // SID3 — Reference: instrument.cpp:2840-2841
          // sid3 chip-specific data (enhanced C64 SID)
          console.log('[FurnaceParser] Found S3 (SID3), preserving in rawBinaryData');
          break;
        default:
          // Unknown feature, skip (reader.seek(featEnd) handles it)
          break;
      }

      reader.seek(featEnd);
    }
  } else if (magic === 'INST') {
    // Old instrument format — Reference: instrument.cpp:2878-3200 (readInsDataOld)
    // In the old format, ALL sections are read regardless of instrument type!
    reader.readUint32(); // Block size (unused)
    const instVersion = reader.readUint16(); // insVersion
    inst.type = reader.readUint8();
    reader.readUint8(); // reserved
    inst.name = readString(reader);

    console.log(`[FurnaceParser] INST old format: name="${inst.name}" type=${inst.type} version=${instVersion}`);

    // FM data — ALWAYS read (8 header bytes + 4 operators × 32 bytes = 136 bytes)
    // Read header bytes without storing (we don't use FM data for C64 instruments)
    reader.readUint8(); // fmAlg
    reader.readUint8(); // fmFb
    reader.readUint8(); // fmFms
    reader.readUint8(); // fmAms
    reader.readUint8(); // fmOps
    reader.readUint8(); // fmOpllPreset
    reader.skip(2); // reserved

    // 4 operators, each 32 bytes
    for (let j = 0; j < 4; j++) {
      // am,ar,dr,mult,rr,sl,tl,dt2,rs,dt,d2r,ssgEnv = 12 bytes
      reader.skip(12);
      // dam,dvb,egt,ksl,sus,vib,ws,ksr = 8 bytes
      reader.skip(8);
      // enable (1) + kvs (1) + 10 reserved = 12 bytes
      reader.skip(12);
    }

    // GB data — ALWAYS read (4 bytes)
    reader.readUint8(); // gbEnvVol
    reader.readUint8(); // gbEnvDir
    reader.readUint8(); // gbEnvLen
    reader.readUint8(); // gbSoundLen

    // C64 data — ALWAYS read (24 bytes)  ← THE KEY FIX!
    // Reference: instrument.cpp:2951-2973
    const c64TriOn = reader.readUint8() !== 0;
    const c64SawOn = reader.readUint8() !== 0;
    const c64PulseOn = reader.readUint8() !== 0;
    const c64NoiseOn = reader.readUint8() !== 0;
    const c64A = reader.readUint8();
    const c64D = reader.readUint8();
    const c64S = reader.readUint8();
    const c64R = reader.readUint8();
    const c64Duty = reader.readUint16(); // 2 bytes
    const c64RingMod = reader.readUint8() !== 0;
    const c64OscSync = reader.readUint8() !== 0;
    const c64ToFilter = reader.readUint8() !== 0;
    const c64InitFilter = reader.readUint8() !== 0;
    reader.readUint8(); // c64VolIsCutoff (unused)
    const c64Res = reader.readUint8();
    const c64Lp = reader.readUint8() !== 0;
    const c64Bp = reader.readUint8() !== 0;
    const c64Hp = reader.readUint8() !== 0;
    const c64Ch3Off = reader.readUint8() !== 0;
    const c64Cut = reader.readUint16(); // 2 bytes
    const c64DutyIsAbs = reader.readUint8() !== 0;
    const c64FilterIsAbs = reader.readUint8() !== 0;

    // Store C64 data on the instrument — this was MISSING before!
    inst.c64 = {
      triOn: c64TriOn,
      sawOn: c64SawOn,
      pulseOn: c64PulseOn,
      noiseOn: c64NoiseOn,
      a: c64A,
      d: c64D,
      s: c64S,
      r: c64R,
      duty: c64Duty,
      ringMod: c64RingMod,
      oscSync: c64OscSync,
      toFilter: c64ToFilter,
      initFilter: c64InitFilter,
      res: c64Res,
      lp: c64Lp,
      bp: c64Bp,
      hp: c64Hp,
      ch3off: c64Ch3Off,
      cut: c64Cut,
      dutyIsAbs: c64DutyIsAbs,
      filterIsAbs: c64FilterIsAbs,
      noTest: false,
      resetDuty: false,
    };

    console.log(`[FurnaceParser] INST C64 PARSED: tri=${c64TriOn} saw=${c64SawOn} pulse=${c64PulseOn} noise=${c64NoiseOn} ADSR=${c64A}/${c64D}/${c64S}/${c64R} duty=${c64Duty}`);

    // Amiga data — ALWAYS read (16 bytes)
    // Reference: instrument.cpp:2977-2987
    const amigaInitSample = reader.readInt16();
    reader.readUint8(); // amigaUseWave (unused)
    reader.readUint8(); // amigaWaveLen (unused)
    reader.skip(12); // reserved

    if (amigaInitSample >= 0) {
      inst.samples.push(amigaInitSample);
    }

    // Macro lengths — Reference: instrument.cpp:2990-3000
    const volMacroLen = reader.readInt32();
    const arpMacroLen = reader.readInt32();
    const dutyMacroLen = reader.readInt32();
    const waveMacroLen = reader.readInt32();
    let pitchMacroLen = 0, ex1MacroLen = 0, ex2MacroLen = 0, ex3MacroLen = 0;
    if (instVersion >= 17) {
      pitchMacroLen = reader.readInt32();
      ex1MacroLen = reader.readInt32();
      ex2MacroLen = reader.readInt32();
      ex3MacroLen = reader.readInt32();
    }

    // Macro loops — Reference: instrument.cpp:3002-3012
    const volMacroLoop = reader.readInt32();
    const arpMacroLoop = reader.readInt32();
    const dutyMacroLoop = reader.readInt32();
    const waveMacroLoop = reader.readInt32();
    let pitchMacroLoop = -1, ex1MacroLoop = -1, ex2MacroLoop = -1, ex3MacroLoop = -1;
    if (instVersion >= 17) {
      pitchMacroLoop = reader.readInt32();
      ex1MacroLoop = reader.readInt32();
      ex2MacroLoop = reader.readInt32();
      ex3MacroLoop = reader.readInt32();
    }

    // Arp mode and old heights — Reference: instrument.cpp:3014-3017
    const arpMode = reader.readUint8();
    reader.skip(3); // oldVolHeight, oldDutyHeight, oldWaveHeight

    // Macro values — Reference: instrument.cpp:3018-3025 (READ_MACRO_VALS)
    const readMacroVals = (len: number): number[] => {
      const vals: number[] = [];
      for (let i = 0; i < len; i++) {
        vals.push(reader.readInt32());
      }
      return vals;
    };

    const volMacroVals = readMacroVals(volMacroLen);
    const arpMacroVals = readMacroVals(arpMacroLen);
    const dutyMacroVals = readMacroVals(dutyMacroLen);
    const waveMacroVals = readMacroVals(waveMacroLen);

    if (instVersion >= 17) {
      const pitchMacroVals = readMacroVals(pitchMacroLen);
      const ex1MacroVals = readMacroVals(ex1MacroLen);
      const ex2MacroVals = readMacroVals(ex2MacroLen);
      const ex3MacroVals = readMacroVals(ex3MacroLen);

      // Store extended macros
      if (pitchMacroLen > 0) {
        inst.macros.push({ code: 4, length: pitchMacroLen, loop: pitchMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: pitchMacroVals });
      }
      if (ex1MacroLen > 0) {
        inst.macros.push({ code: 5, length: ex1MacroLen, loop: ex1MacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: ex1MacroVals });
      }
      if (ex2MacroLen > 0) {
        inst.macros.push({ code: 6, length: ex2MacroLen, loop: ex2MacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: ex2MacroVals });
      }
      if (ex3MacroLen > 0) {
        inst.macros.push({ code: 7, length: ex3MacroLen, loop: ex3MacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: ex3MacroVals });
      }
    }

    // Store standard macros
    if (volMacroLen > 0) {
      inst.macros.push({ code: 0, length: volMacroLen, loop: volMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: volMacroVals });
    }
    if (arpMacroLen > 0) {
      inst.macros.push({ code: 1, length: arpMacroLen, loop: arpMacroLoop, release: -1, mode: arpMode, type: 0, delay: 0, speed: 1, data: arpMacroVals });
    }
    if (dutyMacroLen > 0) {
      inst.macros.push({ code: 2, length: dutyMacroLen, loop: dutyMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: dutyMacroVals });
    }
    if (waveMacroLen > 0) {
      inst.macros.push({ code: 3, length: waveMacroLen, loop: waveMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: waveMacroVals });
    }

    console.log(`[FurnaceParser] INST parsed ${inst.macros.length} macros, waveMacro: len=${waveMacroLen} vals=[${waveMacroVals.slice(0, 5).join(',')}${waveMacroLen > 5 ? '...' : ''}]`);
  } else {
    throw new Error(`Unknown instrument format: "${magic}"`);
  }

  return inst;
}

/**
 * Parse FM data (new format)
 */
function parseFMData(reader: BinaryReader): FurnaceConfig {
  const config: FurnaceConfig = {
    ...DEFAULT_FURNACE,
    operators: [],
    macros: [],
    opMacros: [],
    wavetables: [],
  };

  const flags = reader.readUint8();
  const opCount = flags & 0x0F;
  const opEnabled = (flags >> 4) & 0x0F;
  config.ops = opCount;

  // Base data
  const algFb = reader.readUint8();
  // Reference: instrument.cpp:1753 — fm.alg=(next>>4)&7; fm.fb=next&7;
  config.algorithm = (algFb >> 4) & 0x07;
  config.feedback = algFb & 0x07;

  // Reference: instrument.cpp:1756-1758
  const fmsAms = reader.readUint8();
  config.fms2 = (fmsAms >> 5) & 0x07;
  config.ams = (fmsAms >> 3) & 0x03;
  config.fms = fmsAms & 0x07;

  // Reference: instrument.cpp:1762-1764
  const llPatchAm2 = reader.readUint8();
  config.ams2 = (llPatchAm2 >> 6) & 0x03;
  // ops is set from flags byte above (opCount), this byte has a 4/2 mode flag at bit 5
  config.opllPreset = llPatchAm2 & 0x1F;

  // Read operators
  for (let i = 0; i < opCount; i++) {
    const dtMult = reader.readUint8();
    const tlSus = reader.readUint8();
    const rsAr = reader.readUint8();
    const amDr = reader.readUint8();
    const egtD2r = reader.readUint8();
    const slRr = reader.readUint8();
    const dvbSsg = reader.readUint8();
    const damDt2Ws = reader.readUint8();

    // Reference: instrument.cpp:1775-1811
    const op: FurnaceOperatorConfig = {
      enabled: ((opEnabled >> i) & 1) !== 0,
      mult: dtMult & 0x0F,
      dt: (dtMult >> 4) & 0x07,
      ksr: ((dtMult >> 7) & 1) !== 0,
      tl: tlSus & 0x7F,
      sus: ((tlSus >> 7) & 1) !== 0,
      ar: rsAr & 0x1F,
      vib: ((rsAr >> 5) & 1) !== 0,
      rs: (rsAr >> 6) & 0x03,
      dr: amDr & 0x1F,
      ksl: (amDr >> 5) & 0x03,
      am: ((amDr >> 7) & 1) !== 0,
      egt: ((egtD2r >> 7) & 1) !== 0,
      kvs: (egtD2r >> 5) & 0x03,
      d2r: egtD2r & 0x1F,
      sl: (slRr >> 4) & 0x0F,
      rr: slRr & 0x0F,
      dvb: (dvbSsg >> 4) & 0x0F,
      ssg: dvbSsg & 0x0F,
      dam: (damDt2Ws >> 5) & 0x07,
      dt2: (damDt2Ws >> 3) & 0x03,
      ws: damDt2Ws & 0x07,
    };

    config.operators.push(op);
  }

  return config;
}

/**
 * Parse macro data
 * Reference: instrument.cpp:1816 readFeatureMA
 * 
 * macroHeaderLen is the size of each macro entry's HEADER (not counting data).
 * We read macros until featEnd, using macroHeaderLen to skip any extra header bytes.
 */
function parseMacroData(reader: BinaryReader, inst: FurnaceInstrument, featEnd: number): void {
  const macroHeaderLen = reader.readUint16();
  
  if (macroHeaderLen === 0 || macroHeaderLen > 32) {
    console.warn(`[FurnaceParser] Invalid macro header length: ${macroHeaderLen}`);
    return;
  }

  while (reader.getOffset() < featEnd) {
    const macroStartPos = reader.getOffset();
    const macroCode = reader.readUint8();
    
    // macroCode 255 = end of macro list
    if (macroCode === 255) break;

    const macro: FurnaceMacro = {
      code: macroCode,
      length: reader.readUint8(),
      loop: reader.readUint8(),
      release: reader.readUint8(),
      mode: reader.readUint8(),
      type: reader.readUint8(),  // Actually wordSize byte: bits 0-3=open, bits 6-7=wordSize
      delay: reader.readUint8(),
      speed: reader.readUint8(),
      data: [],
    };

    // Seek to end of header in case there are extra fields we don't read
    const expectedHeaderEnd = macroStartPos + macroHeaderLen;
    if (reader.getOffset() < expectedHeaderEnd && expectedHeaderEnd <= featEnd) {
      reader.seek(expectedHeaderEnd);
    }

    // Read macro data values
    const wordSize = (macro.type >> 6) & 0x03;
    for (let i = 0; i < macro.length && reader.getOffset() < featEnd; i++) {
      switch (wordSize) {
        case 0: macro.data.push(reader.readUint8()); break;
        case 1: macro.data.push(reader.readInt8()); break;
        case 2: macro.data.push(reader.readInt16()); break;
        case 3: macro.data.push(reader.readInt32()); break;
      }
    }

    inst.macros.push(macro);
  }
  
  // DEBUG: Log parsed macros
  console.log(`[FurnaceParser] parseMacroData complete: ${inst.macros.length} macros, wave macro: ${inst.macros.find(m => m.code === 3)?.data?.slice(0,4) || 'none'}`);
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
    sample.loopDirection = version >= 123 ? reader.readUint8() : 0;
    reader.readUint8(); // flags
    reader.readUint8(); // flags2
    sample.loopStart = reader.readInt32();
    sample.loopEnd = reader.readInt32();
    reader.skip(16); // Sample presence bitfields

    // Read sample data
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
      // Other depths - read as bytes
      sample.data = reader.readBytes(sample.length);
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
    }

    // Read sample data
    const dataSize = version < 58 ? sample.length * 2 : sample.length;
    if (sample.depth === 16) {
      const data = new Int16Array(sample.length);
      for (let i = 0; i < sample.length; i++) {
        data[i] = reader.readInt16();
      }
      sample.data = data;
    } else {
      const data = new Int8Array(dataSize);
      for (let i = 0; i < dataSize; i++) {
        data[i] = reader.readInt8();
      }
      sample.data = data;
    }
  } else {
    throw new Error(`Unknown sample format: "${magic}"`);
  }

  return sample;
}

/**
 * Parse pattern
 */
function parsePattern(
  reader: BinaryReader,
  _chans: number,
  subsongs: FurnaceSubSong[],
  version: number
): FurnacePattern {
  const magic = reader.readMagic(4);

  const pat: FurnacePattern = {
    subsong: 0,
    channel: 0,
    index: 0,
    name: '',
    rows: [],
  };

  if (magic === 'PATN') {
    // New pattern format
    reader.readUint32(); // Block size
    pat.subsong = reader.readUint8();

    // Channel is always 1 byte (reference: readC() / writeC())
    pat.channel = reader.readUint8();

    pat.index = reader.readUint16();

    if (version >= 51) {
      pat.name = readString(reader);
    }

    // Get pattern length from subsong
    const subsong = subsongs[pat.subsong] || subsongs[0];
    const patLen = subsong?.patLen || 64;
    const effectCols = subsong?.effectColumns[pat.channel] || 1;
    void effectCols; // Effect column count for multi-effect parsing

    // Initialize rows
    for (let i = 0; i < patLen; i++) {
      pat.rows.push({
        note: -1,
        octave: 0,
        instrument: -1,
        volume: -1,
        effects: [],
      });
    }

    // Parse pattern data
    let row = 0;
    while (row < patLen && !reader.isEOF()) {
      const cmd = reader.readUint8();

      if (cmd === 0xff) {
        // End of pattern
        break;
      }

      if (cmd & 0x80) {
        // Skip rows
        const skip = (cmd & 0x7f) + 2;
        row += skip;
        continue;
      }

      if (cmd === 0) {
        // Skip 1 row
        row++;
        continue;
      }

      const cell = pat.rows[row];

      // Determine what's present
      const hasNote = (cmd & 0x01) !== 0;
      const hasIns = (cmd & 0x02) !== 0;
      const hasVol = (cmd & 0x04) !== 0;
      const hasEff0 = (cmd & 0x08) !== 0;
      const hasEffVal0 = (cmd & 0x10) !== 0;
      const hasOtherEffs03 = (cmd & 0x20) !== 0;
      const hasOtherEffs47 = (cmd & 0x40) !== 0;

      let effMask03 = 0;
      let effMask47 = 0;

      if (hasOtherEffs03) {
        effMask03 = reader.readUint8();
      }
      if (hasOtherEffs47) {
        effMask47 = reader.readUint8();
      }

      // Read note
      if (hasNote) {
        const noteVal = reader.readUint8();
        if (noteVal >= 180) {
          // Special notes
          cell.note = noteVal;
          cell.octave = 0;
        } else if (noteVal < 180) {
          cell.note = newFormatNotes[noteVal] || 0;
          cell.octave = newFormatOctaves[noteVal] || 0;
          // Convert signed octave
          if (cell.octave >= 250) {
            cell.octave = cell.octave - 256;
          }
        }
      }

      // Read instrument
      if (hasIns) {
        cell.instrument = reader.readUint8();
      }

      // Read volume
      if (hasVol) {
        cell.volume = reader.readUint8();
      }

      // Read effect 0
      if (hasEff0) {
        const effType = reader.readUint8();
        const effVal = hasEffVal0 ? reader.readUint8() : 0;
        cell.effects.push({ type: effType, value: effVal });
      } else if (hasEffVal0) {
        reader.readUint8(); // Skip orphan value
      }

      // Read effects 1-3 (bits 2-7 of effMask03; bits 0-1 are effect 0, handled above)
      for (let fx = 1; fx <= 3; fx++) {
        const hasEff = (effMask03 & (1 << (fx * 2))) !== 0;
        const hasVal = (effMask03 & (1 << (fx * 2 + 1))) !== 0;

        if (hasEff) {
          const effType = reader.readUint8();
          const effVal = hasVal ? reader.readUint8() : 0;
          cell.effects.push({ type: effType, value: effVal });
        } else if (hasVal) {
          reader.readUint8(); // Skip orphan value
        }
      }

      // Read effects 4-7
      for (let fx = 4; fx <= 7; fx++) {
        const hasEff = (effMask47 & (1 << ((fx - 4) * 2))) !== 0;
        const hasVal = (effMask47 & (1 << ((fx - 4) * 2 + 1))) !== 0;

        if (hasEff) {
          const effType = reader.readUint8();
          const effVal = hasVal ? reader.readUint8() : 0;
          cell.effects.push({ type: effType, value: effVal });
        } else if (hasVal) {
          reader.readUint8(); // Skip orphan value
        }
      }

      row++;
    }
  } else if (magic === 'PATR') {
    // Old pattern format
    reader.readUint32(); // Block size
    pat.channel = reader.readUint16();
    pat.index = reader.readUint16();

    if (version >= 95) {
      pat.subsong = reader.readUint16();
    }
    reader.skip(2); // reserved

    // Get pattern length and effect columns
    const subsong = subsongs[pat.subsong] || subsongs[0];
    const patLen = subsong?.patLen || 64;
    const effectCols = subsong?.effectColumns[pat.channel] || 1;

    // Read pattern data
    for (let row = 0; row < patLen; row++) {
      const cell: FurnacePatternCell = {
        note: reader.readInt16(),
        octave: reader.readInt16(),
        instrument: reader.readInt16(),
        volume: reader.readInt16(),
        effects: [],
      };

      // Note conversion for old format (PATR)
      // According to format.md:
      // - 0: empty/invalid (with octave 0)
      // - 1: C#, 2: D, 3: D#, 4: E, 5: F, 6: F#, 7: G, 8: G#, 9: A, 10: A#, 11: B
      // - 12: C (of next octave) - leftover from .dmf format
      // - 100: note off, 101: note release, 102: macro release
      // - octave is signed char (255 = -1)
      if (cell.note === 0 && cell.octave === 0) {
        // Empty note
        cell.note = -1;
      } else if (cell.note === 100) {
        cell.note = NOTE_OFF;
        cell.octave = 0;
      } else if (cell.note === 101) {
        cell.note = NOTE_RELEASE;
        cell.octave = 0;
      } else if (cell.note === 102) {
        cell.note = MACRO_RELEASE;
        cell.octave = 0;
      } else if (cell.note === 12) {
        // C of next octave (legacy .dmf format)
        cell.note = 12;
        cell.octave++;
      } else if (cell.note >= 1 && cell.note <= 11) {
        // Standard notes: 1=C#, 2=D, etc.
        // Note: cell.note is already correct (1-12 maps to our note system)
        // Just need to handle signed octave
        if (cell.octave >= 128) {
          // Signed char stored as short: 255 = -1, 254 = -2, etc.
          cell.octave = cell.octave - 256;
        }
      }

      // Read effects
      for (let fx = 0; fx < effectCols; fx++) {
        const effType = reader.readInt16();
        const effVal = reader.readInt16();
        if (effType >= 0) {
          cell.effects.push({ type: effType, value: effVal >= 0 ? effVal : 0 });
        }
      }

      pat.rows.push(cell);
    }

    if (version >= 51) {
      pat.name = readString(reader);
    }
  } else {
    throw new Error(`Unknown pattern format: "${magic}"`);
  }

  return pat;
}

/** Converted pattern cell in XM-compatible format */
interface ConvertedPatternCell {
  note: number;
  instrument: number;
  volume: number;
  effectType: number;
  effectParam: number;
  effectType2: number;
  effectParam2: number;
  // All effects (for variable effect columns, 1-8 per channel)
  effects?: { type: number; param: number }[];
}

/**
 * Parse groove (tick pattern for swing/shuffle)
 */
function parseGroove(reader: BinaryReader): FurnaceGroove {
  const magic = reader.readMagic(4);
  if (magic !== 'GROV') {
    throw new Error(`Expected GROV block, got: "${magic}"`);
  }
  reader.readUint32(); // Block size

  const len = reader.readUint8();
  const val: number[] = [];
  for (let i = 0; i < 16; i++) {
    val.push(reader.readUint8());
  }

  return { len, val };
}

/**
 * Parse compatibility flags (50+ boolean flags for legacy behavior)
 * Reference: furnace-master/src/engine/song.h lines 187-250
 */
function parseCompatFlags(reader: BinaryReader): FurnaceCompatFlags {
  const magic = reader.readMagic(4);
  if (magic !== 'FLAG') {
    throw new Error(`Expected FLAG block, got: "${magic}"`);
  }
  const blockSize = reader.readUint32();
  const startPos = reader.getOffset();

  // Initialize with default values
  const flags: FurnaceCompatFlags = {
    limitSlides: true,
    linearPitch: 0,
    pitchSlideSpeed: 4,
    loopModality: 0,
    delayBehavior: 0,
    jumpTreatment: 0,
    properNoiseLayout: true,
    waveDutyIsVol: false,
    resetMacroOnPorta: false,
    legacyVolumeSlides: false,
    compatibleArpeggio: false,
    noteOffResetsSlides: false,
    targetResetsSlides: false,
    arpNonPorta: false,
    algMacroBehavior: false,
    brokenShortcutSlides: false,
    ignoreDuplicateSlides: false,
    stopPortaOnNoteOff: false,
    continuousVibrato: false,
    brokenDACMode: false,
    oneTickCut: false,
    newInsTriggersInPorta: false,
    arp0Reset: false,
    brokenSpeedSel: false,
    noSlidesOnFirstTick: false,
    rowResetsArpPos: false,
    ignoreJumpAtEnd: false,
    buggyPortaAfterSlide: false,
    gbInsAffectsEnvelope: true,
    sharedExtStat: true,
    ignoreDACModeOutsideIntendedChannel: false,
    e1e2AlsoTakePriority: false,
    newSegaPCM: true,
    fbPortaPause: false,
    snDutyReset: true,
    pitchMacroIsLinear: false,
    oldOctaveBoundary: false,
    noOPN2Vol: false,
    newVolumeScaling: true,
    volMacroLinger: false,
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
    oldSampleOffset: true,
  };

  // Parse flags in order (reference: song.cpp DivCompatFlags::readData)
  if (blockSize >= 1) flags.limitSlides = reader.readUint8() > 0;
  if (blockSize >= 2) flags.linearPitch = reader.readUint8();
  if (blockSize >= 3) flags.loopModality = reader.readUint8();
  if (blockSize >= 4) flags.properNoiseLayout = reader.readUint8() > 0;
  if (blockSize >= 5) flags.waveDutyIsVol = reader.readUint8() > 0;
  if (blockSize >= 6) flags.resetMacroOnPorta = reader.readUint8() > 0;
  if (blockSize >= 7) flags.legacyVolumeSlides = reader.readUint8() > 0;
  if (blockSize >= 8) flags.compatibleArpeggio = reader.readUint8() > 0;
  if (blockSize >= 9) flags.noteOffResetsSlides = reader.readUint8() > 0;
  if (blockSize >= 10) flags.targetResetsSlides = reader.readUint8() > 0;
  if (blockSize >= 11) flags.arpNonPorta = reader.readUint8() > 0;
  if (blockSize >= 12) flags.algMacroBehavior = reader.readUint8() > 0;
  if (blockSize >= 13) flags.brokenShortcutSlides = reader.readUint8() > 0;
  if (blockSize >= 14) flags.ignoreDuplicateSlides = reader.readUint8() > 0;
  if (blockSize >= 15) flags.stopPortaOnNoteOff = reader.readUint8() > 0;
  if (blockSize >= 16) flags.continuousVibrato = reader.readUint8() > 0;
  if (blockSize >= 17) flags.brokenDACMode = reader.readUint8() > 0;
  if (blockSize >= 18) flags.oneTickCut = reader.readUint8() > 0;
  if (blockSize >= 19) flags.newInsTriggersInPorta = reader.readUint8() > 0;
  if (blockSize >= 20) flags.arp0Reset = reader.readUint8() > 0;
  if (blockSize >= 21) flags.brokenSpeedSel = reader.readUint8() > 0;
  if (blockSize >= 22) flags.noSlidesOnFirstTick = reader.readUint8() > 0;
  if (blockSize >= 23) flags.rowResetsArpPos = reader.readUint8() > 0;
  if (blockSize >= 24) flags.ignoreJumpAtEnd = reader.readUint8() > 0;
  if (blockSize >= 25) flags.buggyPortaAfterSlide = reader.readUint8() > 0;
  if (blockSize >= 26) flags.gbInsAffectsEnvelope = reader.readUint8() > 0;
  if (blockSize >= 27) flags.sharedExtStat = reader.readUint8() > 0;
  if (blockSize >= 28) flags.ignoreDACModeOutsideIntendedChannel = reader.readUint8() > 0;
  if (blockSize >= 29) flags.e1e2AlsoTakePriority = reader.readUint8() > 0;
  if (blockSize >= 30) flags.newSegaPCM = reader.readUint8() > 0;
  if (blockSize >= 31) flags.fbPortaPause = reader.readUint8() > 0;
  if (blockSize >= 32) flags.snDutyReset = reader.readUint8() > 0;
  if (blockSize >= 33) flags.pitchMacroIsLinear = reader.readUint8() > 0;
  if (blockSize >= 34) flags.pitchSlideSpeed = reader.readUint8();
  if (blockSize >= 35) flags.oldOctaveBoundary = reader.readUint8() > 0;
  if (blockSize >= 36) flags.noOPN2Vol = reader.readUint8() > 0;
  if (blockSize >= 37) flags.newVolumeScaling = reader.readUint8() > 0;
  if (blockSize >= 38) flags.volMacroLinger = reader.readUint8() > 0;
  if (blockSize >= 39) flags.brokenOutVol = reader.readUint8() > 0;
  if (blockSize >= 40) flags.brokenOutVol2 = reader.readUint8() > 0;
  if (blockSize >= 41) flags.e1e2StopOnSameNote = reader.readUint8() > 0;
  if (blockSize >= 42) flags.brokenPortaArp = reader.readUint8() > 0;
  if (blockSize >= 43) flags.snNoLowPeriods = reader.readUint8() > 0;
  if (blockSize >= 44) flags.delayBehavior = reader.readUint8();
  if (blockSize >= 45) flags.jumpTreatment = reader.readUint8();
  if (blockSize >= 46) flags.disableSampleMacro = reader.readUint8() > 0;
  if (blockSize >= 47) flags.oldArpStrategy = reader.readUint8() > 0;
  if (blockSize >= 48) flags.brokenPortaLegato = reader.readUint8() > 0;
  if (blockSize >= 49) flags.brokenFMOff = reader.readUint8() > 0;
  if (blockSize >= 50) flags.preNoteNoEffect = reader.readUint8() > 0;
  if (blockSize >= 51) flags.oldSampleOffset = reader.readUint8() > 0;

  // Skip any remaining bytes (future-proofing)
  const endPos = startPos + blockSize;
  if (reader.getOffset() < endPos) {
    reader.seek(endPos);
  }

  return flags;
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
function scanInstrumentChannels(module: FurnaceModule, subsongIndex = 0): Map<number, Set<number>> {
  const result = new Map<number, Set<number>>();
  const subsong = module.subsongs[subsongIndex];
  if (!subsong) return result;

  for (let orderPos = 0; orderPos < subsong.ordersLen; orderPos++) {
    for (let ch = 0; ch < module.chans; ch++) {
      const patIdx = subsong.orders[ch]?.[orderPos] ?? 0;
      const key = `${subsongIndex}_${ch}_${patIdx}`;
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

  return result;
}

/**
 * Convert a single subsong to pattern data
 */
function convertSubsongPatterns(
  module: FurnaceModule,
  subsongIndex: number,
  isChipSynth: boolean
): ConvertedPatternCell[][][] {
  const subsong = module.subsongs[subsongIndex];
  if (!subsong) {
    console.warn(`[FurnaceParser] Subsong ${subsongIndex} not found`);
    return [];
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
          const cell = pattern.rows[row];
          const converted = convertFurnaceCell(cell, isChipSynth);
          rowCells.push(converted);
        } else {
          rowCells.push({ note: 0, instrument: 0, volume: 0, effectType: 0, effectParam: 0, effectType2: 0, effectParam2: 0 });
        }
      }

      patternRows.push(rowCells);
    }

    patterns.push(patternRows);
  }

  return patterns;
}

/**
 * Convert Furnace module to DEViLBOX format
 * Converts ALL subsongs and stores them in metadata
 * @param module - Parsed Furnace module
 * @param primarySubsongIndex - Index of the subsong to use as primary (default: 0)
 */
export function convertFurnaceToDevilbox(module: FurnaceModule, primarySubsongIndex = 0): {
  instruments: ParsedInstrument[];
  patterns: ConvertedPatternCell[][][]; // [pattern][row][channel]
  metadata: ImportMetadata;
} {
  // Validate primarySubsongIndex
  if (primarySubsongIndex < 0 || primarySubsongIndex >= module.subsongs.length) {
    console.warn(`[FurnaceParser] Invalid primarySubsongIndex ${primarySubsongIndex}, falling back to 0`);
    primarySubsongIndex = 0;
  }
  
  console.log(`[FurnaceParser] Converting ALL ${module.subsongs.length} subsongs (primary: ${primarySubsongIndex})`);
  // --- Build channel-to-chip mapping for STD instrument remapping ---
  // For compound chips like Genesis (FM + PSG), we need to know which
  // channels are FM vs PSG to correctly remap DIV_INS_STD instruments.
  const channelChipInsType = buildChannelChipMap(module);
  const channelChipId = buildChannelChipIdMap(module);

  // Scan pattern data to find which channels each instrument appears on (use primary subsong)
  const instrumentChannels = scanInstrumentChannels(module, primarySubsongIndex);

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
    // DIV_INS_C64 (type 3), DIV_INS_SID2 (63), DIV_INS_SID3 (66) all map to FurnaceC64
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

    // Add FM parameters if present
    if (inst.fm) {
      furnaceData.fm = {
        algorithm: inst.fm.algorithm,
        feedback: inst.fm.feedback,
        fms: inst.fm.fms,
        ams: inst.fm.ams,
        ops: inst.fm.ops,
        opllPreset: inst.fm.opllPreset,
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

    // Pass through chip-specific data
    const chipConfig: Record<string, FurnaceGBData | FurnaceC64Data | FurnaceSNESData | FurnaceN163Data | FurnaceFDSData> = {};
    if (inst.gb) chipConfig.gb = inst.gb;
    if (inst.c64) chipConfig.c64 = inst.c64;
    if (inst.snes) chipConfig.snes = inst.snes;
    if (inst.n163) chipConfig.n163 = inst.n163;
    if (inst.fds) chipConfig.fds = inst.fds;
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

  // Convert patterns for primary subsong
  const primarySubsong = module.subsongs[primarySubsongIndex];
  if (!primarySubsong) {
    return { instruments, patterns: [], metadata: createMetadata(module, primarySubsongIndex, []) };
  }

  // Check if this is a chip synth platform (no -24 octave offset needed)
  const primaryChipId = module.systems[0] || 0;
  const isChipSynth = CHIP_SYNTH_IDS.has(primaryChipId);
  console.log(`[FurnaceParser] Platform chip ID: 0x${primaryChipId.toString(16)}, isChipSynth: ${isChipSynth}`);

  // Convert primary subsong patterns
  const patterns = convertSubsongPatterns(module, primarySubsongIndex, isChipSynth);

  console.log(`[FurnaceParser] Primary subsong ${primarySubsongIndex}: ${patterns.length} patterns`);

  // Convert ALL other subsongs and store them
  const allSubsongsData = module.subsongs.map((subsong, idx) => {
    if (idx === primarySubsongIndex) {
      // Primary subsong is returned as main patterns, skip it here
      return null;
    }

    const subsongPatterns = convertSubsongPatterns(module, idx, isChipSynth);
    
    // Calculate BPM for this subsong
    const virtualTempo = subsong?.virtualTempo || 150;
    const virtualTempoD = subsong?.virtualTempoD || 150;
    const hz = subsong?.hz || 60;
    const speed = subsong?.speed1 || 6;
    const bpm = Math.round(2.5 * hz * (virtualTempo / virtualTempoD));

    console.log(`[FurnaceParser] Subsong ${idx}: "${subsong.name}", ${subsongPatterns.length} patterns, ${subsong.ordersLen} orders, BPM: ${bpm}, Speed: ${speed}`);
    console.log(`[FurnaceParser] Subsong ${idx} Order Table:`, subsong.orders.map((chOrders, chIdx) => `ch${chIdx}:[${chOrders.slice(0, 16).join(',')}${chOrders.length > 16 ? '...' : ''}]`).join(' | '));

    return {
      subsongIndex: idx,
      patterns: subsongPatterns,
      patternOrderTable: Array.from({ length: subsong.ordersLen || 1 }, (_, i) => i),
      ordersLen: subsong.ordersLen || 1,
      initialSpeed: speed,
      initialBPM: bpm,
    };
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  return { 
    instruments, 
    patterns, 
    metadata: createMetadata(module, primarySubsongIndex, allSubsongsData) 
  };
}

/**
 * Create import metadata
 */
function createMetadata(
  module: FurnaceModule, 
  subsongIndex: number, 
  allSubsongsData: NonNullable<NonNullable<ImportMetadata['furnaceData']>['allSubsongs']>
): ImportMetadata {
  const subsong = module.subsongs[subsongIndex];

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
    // Furnace-specific data for applying system presets
    furnaceData: {
      systems: [...module.systems],
      systemChans: [...module.systemChans],
      systemName: module.systemName || 'Unknown',
      channelShortNames: subsong?.channelShortNames,
      effectColumns: subsong?.effectColumns ? [...subsong.effectColumns] : undefined,
      compatFlags: module.compatFlags,
      grooves: module.grooves.length > 0 ? module.grooves : undefined,
      subsongCount: module.subsongs.length,
      subsongNames: module.subsongs.map((s, i) => s.name || `Subsong ${i + 1}`),
      currentSubsong: subsongIndex,
      allSubsongs: allSubsongsData,
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
 * Convert Furnace pattern cell to XM-compatible format
 * @param cell The Furnace pattern cell
 * @param isChipSynth If true, skip the -24 octave offset (chip synths use native Furnace octaves)
 */
function convertFurnaceCell(cell: FurnacePatternCell, isChipSynth: boolean = false): ConvertedPatternCell {
  let note = 0;

  if (cell.note === NOTE_OFF || cell.note === NOTE_RELEASE || cell.note === MACRO_RELEASE) {
    note = 97; // XM note off
  } else if (cell.note >= 1 && cell.note <= 12) {
    // Furnace new format: note 12 = C, 1 = C#, 2 = D, ..., 11 = B
    // XM format: semitone 0 = C, 1 = C#, ..., 11 = B
    // Furnace stores C with octave one less than the actual octave
    const semitone = cell.note === 12 ? 0 : cell.note;
    // Adjust octave for C (note 12) - Furnace stores it one lower
    const adjustedOctave = cell.note === 12 ? cell.octave + 1 : cell.octave;
    const finalOctave = adjustedOctave < 0 ? 0 : adjustedOctave;
    
    // For chip synths (SID, NES, GB, etc.), use native Furnace octave numbering
    // For Amiga/sample-based, apply -24 offset (Furnace C-4 = MOD C-2)
    const octaveOffset = isChipSynth ? 0 : -24;
    note = (finalOctave * 12) + semitone + 1 + octaveOffset;
    
    // Clamp to valid range (1-96 playable, 97 = note off)
    if (note > 96) note = 96;
    if (note < 1) note = 1;
  }

  // Convert volume
  let volume = 0;
  if (cell.volume >= 0) {
    volume = 0x10 + Math.min(64, Math.floor(cell.volume / 2));
  }

  // Convert ALL effects (Furnace supports 1-8 per channel)
  const effects: { type: number; param: number }[] = [];
  for (let i = 0; i < cell.effects.length; i++) {
    const fx = cell.effects[i];
    let effType = mapFurnaceEffect(fx.type);
    let effParam = fx.value & 0xFF;
    // Split composite XM extended effects (E1x, E2x, E9x, EAx, EBx, ECx, EDx, EEx)
    // The mapping returns e.g. 0xE9 for retrigger, but the replayer expects
    // effectType=0x0E with sub-command in param high nibble: param = 0x9y
    if (effType >= 0xE0 && effType <= 0xEF) {
      const subCmd = effType & 0x0F;
      effType = 0x0E;
      effParam = (subCmd << 4) | (effParam & 0x0F);
    }
    effects.push({ type: effType, param: effParam });
  }

  // Legacy fields: first 2 effects for backward compatibility
  const effectType = effects[0]?.type || 0;
  const effectParam = effects[0]?.param || 0;
  const effectType2 = effects[1]?.type || 0;
  const effectParam2 = effects[1]?.param || 0;

  return {
    note,
    instrument: cell.instrument >= 0 ? cell.instrument + 1 : 0,
    volume,
    effectType,
    effectParam,
    effectType2,
    effectParam2,
    effects: effects.length > 0 ? effects : undefined,
  };
}

/**
 * Map Furnace effect to XM/IT effect
 * Returns the mapped effect code, or the original if it's a Furnace-specific effect
 * that needs custom handling in the replayer
 */
function mapFurnaceEffect(furEffect: number): number {
  // Comprehensive Furnace to XM/IT effect mapping
  // Based on Furnace source: src/engine/playback.cpp

  const mapping: Record<number, number> = {
    // === Standard Effects (0x00-0x0F) - mostly 1:1 with XM ===
    0x00: 0x00, // Arpeggio
    0x01: 0x01, // Pitch slide up
    0x02: 0x02, // Pitch slide down
    0x03: 0x03, // Portamento (tone porta)
    0x04: 0x04, // Vibrato
    0x05: 0x06, // Vol slide + vibrato (Furnace swaps 05/06 vs XM)
    0x06: 0x05, // Vol slide + porta
    0x07: 0x07, // Tremolo
    0x08: 0x08, // Panning (4-bit split)
    0x09: 0x0F, // Groove/speed 1 → map to set speed
    0x0A: 0x0A, // Volume slide
    0x0B: 0x0B, // Position jump
    0x0C: 0xE9, // Retrigger → XM extended retrigger (E9x)
    0x0D: 0x0D, // Pattern break
    0x0F: 0x0F, // Set speed/tempo

    // === Global Effects (0x10-0x1F) ===
    0x10: 0x10, // Set global volume (G in IT)
    0x11: 0x11, // Global volume slide (H in IT)

    // === Panning Effects (0x80-0x8F) ===
    0x80: 0x08, // Panning linear → standard panning
    0x81: 0x08, // Panning left → standard panning
    0x82: 0x08, // Panning right → standard panning
    0x83: 0x19, // Pan slide → IT P command
    0x84: 0x19, // Panbrello → approximate with pan slide
    0x88: 0x08, // Panning rear → standard panning
    0x89: 0x08, // Panning left (8-bit) → standard panning
    0x8A: 0x08, // Panning right (8-bit) → standard panning

    // === Sample Position Effects (0x90-0x9F) ===
    0x90: 0x09, // Set sample position → sample offset
    0x91: 0x09,
    0x92: 0x09,
    0x93: 0x09,
    0x94: 0x09,
    0x95: 0x09,
    0x96: 0x09,
    0x97: 0x09,
    0x98: 0x09,
    0x99: 0x09,
    0x9A: 0x09,
    0x9B: 0x09,
    0x9C: 0x09,
    0x9D: 0x09,
    0x9E: 0x09,
    0x9F: 0x09,

    // === Frequency Effects (0xC0-0xC3) ===
    // These set Hz directly - map to speed/tempo as approximation
    0xC0: 0x0F,
    0xC1: 0x0F,
    0xC2: 0x0F,
    0xC3: 0x0F,

    // === Volume Effects (0xD0-0xDF) ===
    0xD3: 0x0A, // Volume portamento → volume slide
    0xD4: 0x0A, // Volume portamento fast → volume slide
    0xDC: 0xEC, // Delayed mute → note cut

    // === Extended Effects (0xE0-0xEF) ===
    0xE0: 0x00, // Arp speed → keep as arpeggio (param changes timing)
    0xE1: 0xE1, // Fine porta up → XM fine porta up
    0xE2: 0xE2, // Fine porta down → XM fine porta down
    0xE3: 0xE4, // Vibrato shape → XM vibrato waveform
    0xE4: 0x04, // Vibrato fine → standard vibrato
    0xE5: 0x00, // Set pitch → custom (no XM equivalent)
    0xE6: 0x03, // Delayed legato → portamento
    0xE7: 0x00, // Delayed macro release → custom
    0xE8: 0x03, // Delayed legato up → portamento
    0xE9: 0x03, // Delayed legato down → portamento
    0xEA: 0x00, // Legato mode → custom
    0xEB: 0x00, // Sample bank → custom
    0xEC: 0xEC, // Note cut → XM note cut
    0xED: 0xED, // Note delay → XM note delay
    0xEE: 0x00, // External command → custom

    // === Fine Control Effects (0xF0-0xFF) ===
    0xF0: 0x0F, // Set Hz by tempo → speed
    0xF1: 0xE1, // Single pitch up → fine porta up
    0xF2: 0xE2, // Single pitch down → fine porta down
    0xF3: 0xEA, // Fine vol up → XM fine vol up
    0xF4: 0xEB, // Fine vol down → XM fine vol down
    0xF5: 0x00, // Disable macro → custom
    0xF6: 0x00, // Enable macro → custom
    0xF7: 0x00, // Restart macro → custom
    0xF8: 0xEA, // Single vol up → fine vol up
    0xF9: 0xEB, // Single vol down → fine vol down
    0xFA: 0x0A, // Fast vol slide → vol slide
    0xFC: 0xEC, // Note release → note cut
    0xFD: 0x0F, // Virtual tempo num → speed
    0xFE: 0x0F, // Virtual tempo den → speed
    0xFF: 0x00, // Stop song → custom
  };

  return mapping[furEffect] ?? furEffect; // Pass through unmapped effects
}

/**
 * Get supported extensions
 */
export function getSupportedFurnaceExtensions(): string[] {
  return ['.fur'];
}
