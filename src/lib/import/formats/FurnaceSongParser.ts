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
import { parseInstrument } from './furnace/FurnaceInstrumentParser';

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

// Import types from sub-parser for internal use
import type {
  FurnaceInstrument,
  FurnaceGBData,
  FurnaceC64Data,
  FurnaceSNESData,
  FurnaceN163Data,
  FurnaceFDSData,
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

// SubSong (kept here — used by orchestrator and module type)
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
        reader.readUint32(); // Pointer (skip)
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

  // System output config
  // Reference: fur.cpp:1582-1596
  if (version >= 135) {
    for (let i = 0; i < module.systems.length; i++) {
      reader.skip(12); // systemVol(f32) + systemPan(f32) + systemPanFR(f32)
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

    // Named groove patterns (1-byte values per entry)
    const grooveCount = reader.readUint8();
    for (let i = 0; i < grooveCount; i++) {
      const len = reader.readUint8();
      const val: number[] = [];
      for (let j = 0; j < 16; j++) val.push(reader.readUint8());
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
  samples: Array<{ data: Int16Array | Int8Array; rate: number; depth: number;
    loopStart: number; loopEnd: number; loopMode: number; name: string }>;
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

  // Convert patterns - flatten the selected subsong's patterns
  const patterns: ConvertedPatternCell[][][] = [];
  const subsong = module.subsongs[subsongIndex] || module.subsongs[0];
  if (!subsong) {
    return { instruments, patterns: [], metadata: createMetadata(module, subsongIndex), wavetables: [], samples: [], furnaceNative: { subsongs: [], activeSubsong: subsongIndex } };
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
          const converted = convertFurnaceCell(cell, isChipSynth, module.grooves);
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
  
  // Debug: Show first pattern's raw channel data BEFORE conversion
  if (patterns.length > 0) {
    const pat0 = patterns[0];
    console.log(`[FurnaceParser] DEBUG Pattern 0 RAW: ${pat0.length} rows, first row has ${pat0[0]?.length} channels`);
    console.log(`[FurnaceParser] DEBUG Pattern 0 row 0:`, pat0[0]?.map((c,i) => `ch${i}:note=${c.note}`).join(' '));
    console.log(`[FurnaceParser] DEBUG Pattern 0 row 2:`, pat0[2]?.map((c,i) => `ch${i}:note=${c.note}`).join(' '));
    console.log(`[FurnaceParser] DEBUG Pattern 0 row 4:`, pat0[4]?.map((c,i) => `ch${i}:note=${c.note}`).join(' '));
  }

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
      data: s.data as Int16Array | Int8Array,
      rate: s.c4Rate,
      depth: s.depth,
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
function buildFurnaceNativeData(module: FurnaceModule): FurnaceNativeData {
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

    return {
      name: sub.name || `Subsong ${subIdx}`,
      patLen: sub.patLen,
      ordersLen: sub.ordersLen,
      orders: sub.orders,
      channels,
      speed1: sub.speed1,
      speed2: sub.speed2,
      hz: sub.hz,
      virtualTempoN: sub.virtualTempo,
      virtualTempoD: sub.virtualTempoD,
    };
  });

  return {
    subsongs,
    activeSubsong: 0,
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
          rowCells.push(convertFurnaceCell(pattern.rows[row], isChipSynth, module.grooves));
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
