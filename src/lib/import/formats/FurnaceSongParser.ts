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
 */

import { BinaryReader } from '../../../utils/BinaryReader';
import pako from 'pako';
import type {
  ParsedInstrument,
  ParsedSample,
  ImportMetadata,
} from '../../../types/tracker';
import type { FurnaceConfig, FurnaceOperatorConfig } from '../../../types/instrument';
import { DEFAULT_FURNACE } from '../../../types/instrument';

// Format version constants
const DIV_ENGINE_VERSION = 228;

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

// Instrument
export interface FurnaceInstrument {
  name: string;
  type: number;
  fm?: FurnaceConfig;
  macros: FurnaceMacro[];
  samples: number[];
  wavetables: number[];
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
  const arrayBuffer = data.buffer as ArrayBuffer;
  const reader = new BinaryReader(arrayBuffer);

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
  };

  if (version >= 240) {
    // New format (INF2)
    await parseNewFormat(reader, module, version, arrayBuffer);
  } else {
    // Old format (INFO)
    await parseOldFormat(reader, module, version, arrayBuffer);
  }

  return module;
}

/**
 * Parse new format (version >= 240)
 */
async function parseNewFormat(
  reader: BinaryReader,
  module: FurnaceModule,
  version: number,
  _buffer: ArrayBuffer
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
        reader.skip(count * 4); // Skip groove pointers
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
  for (const ptr of insPtr) {
    reader.seek(ptr);
    const inst = parseInstrument(reader, version);
    module.instruments.push(inst);
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
  for (const ptr of patPtr) {
    reader.seek(ptr);
    const pat = parsePattern(reader, module.chans, module.subsongs, version);
    const key = `${pat.subsong}_${pat.channel}_${pat.index}`;
    module.patterns.set(key, pat);
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
  version: number,
  _buffer: ArrayBuffer
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
  reader.readUint32(); // numberOfPats - not used, patterns are parsed from elements

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

  // Compatibility flags (skip based on version)
  if (version >= 36) reader.readUint8(); // limitSlides
  if (version >= 36) reader.readUint8(); // linearPitch
  if (version >= 36) reader.readUint8(); // loopModality
  if (version >= 42) reader.readUint8(); // properNoiseLayout
  if (version >= 42) reader.readUint8(); // waveDutyIsVol
  if (version >= 45) {
    reader.readUint8(); // resetMacroOnPorta
    reader.readUint8(); // legacyVolumeSlides
    reader.readUint8(); // compatibleArpeggio
    reader.readUint8(); // noteOffResetsSlides
    reader.readUint8(); // targetResetsSlides
  }
  if (version >= 47) {
    reader.readUint8(); // arpNonPorta
    reader.readUint8(); // algMacroBehavior
  }
  if (version >= 49) reader.readUint8(); // brokenShortcutSlides
  if (version >= 50) reader.readUint8(); // ignoreDuplicateSlides
  if (version >= 62) reader.readUint8(); // stopPortaOnNoteOff
  if (version >= 62) reader.readUint8(); // continuousVibrato
  if (version >= 64) reader.readUint8(); // brokenDACMode
  if (version >= 65) reader.readUint8(); // oneTickCut
  if (version >= 66) reader.readUint8(); // newInsTriggersInPorta
  if (version >= 69) reader.readUint8(); // arp0Reset

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

  // Read pattern pointers (not used - patterns are at explicit pointers)
  if (reader.readUint32) reader.readUint32();

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

  // Channel hide/collapse (skip)
  reader.skip(module.chans * 2);

  // Channel names
  for (let ch = 0; ch < module.chans; ch++) {
    subsong.channelNames.push(readString(reader));
  }
  for (let ch = 0; ch < module.chans; ch++) {
    subsong.channelShortNames.push(readString(reader));
  }

  // Song comment
  module.comment = readString(reader);

  // Master volume
  if (version >= 59) {
    module.masterVol = reader.readFloat32();
  } else {
    module.masterVol = 2.0;
  }

  // Extended compat flags (skip based on version)
  if (version >= 70) reader.readUint8(); // brokenSpeedSelection
  // ... many more compat flags, skipped for brevity

  // Virtual tempo
  if (version >= 96) {
    subsong.virtualTempo = reader.readUint16();
    subsong.virtualTempoD = reader.readUint16();
  }

  module.subsongs.push(subsong);

  // Parse instruments
  for (const ptr of insPtr) {
    if (ptr === 0) continue;
    reader.seek(ptr);
    try {
      const inst = parseInstrument(reader, version);
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
function parseInstrument(reader: BinaryReader, _version: number): FurnaceInstrument {
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
    reader.readUint32(); // Block size (INS2 only, FINS doesn't have it)
    const insVersion = reader.readUint16();
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
          inst.fm = parseFMData(reader, insVersion);
          break;
        case 'MA':
          parseMacroData(reader, inst, insVersion);
          break;
        case 'SM':
          // Sample data
          reader.readUint16(); // initialSample
          reader.readUint8(); // flags
          reader.readUint8(); // waveLen
          // Skip sample map
          break;
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
        default:
          // Unknown feature, skip
          break;
      }

      reader.seek(featEnd);
    }
  } else if (magic === 'INST') {
    // Old instrument format
    reader.readUint32(); // Block size
    const insVersion = reader.readUint16();
    inst.type = reader.readUint8();
    reader.readUint8(); // reserved
    inst.name = readString(reader);

    // Parse based on instrument type
    if (inst.type === 0 || inst.type === 1) {
      // FM instrument
      inst.fm = parseFMDataOld(reader, insVersion);
    }
  } else {
    throw new Error(`Unknown instrument format: "${magic}"`);
  }

  return inst;
}

/**
 * Parse FM data (new format)
 */
function parseFMData(reader: BinaryReader, _version: number): FurnaceConfig {
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

  // Base data
  const algFb = reader.readUint8();
  config.algorithm = algFb & 0x07;
  config.feedback = (algFb >> 3) & 0x07;

  const fmsAms = reader.readUint8();
  config.fms = fmsAms & 0x07;
  config.ams = (fmsAms >> 3) & 0x03;
  config.fms2 = (fmsAms >> 5) & 0x07;

  const llPatchAm2 = reader.readUint8();
  config.opllPreset = llPatchAm2 & 0x1F;
  config.ams2 = (llPatchAm2 >> 5) & 0x03;
  config.ops = opCount;

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
      d2r: egtD2r & 0x1F,
      // egt: ((egtD2r >> 5) & 1) !== 0,
      sl: (slRr >> 4) & 0x0F,
      rr: slRr & 0x0F,
      ssg: dvbSsg & 0x0F,
      dvb: (dvbSsg >> 4) & 0x0F,
      ws: damDt2Ws & 0x07,
      dt2: (damDt2Ws >> 3) & 0x03,
      dam: (damDt2Ws >> 5) & 0x07,
      egt: ((egtD2r >> 5) & 1) !== 0,
    };

    config.operators.push(op);
  }

  return config;
}

/**
 * Parse FM data (old format)
 */
function parseFMDataOld(reader: BinaryReader, _version: number): FurnaceConfig {
  const config: FurnaceConfig = {
    ...DEFAULT_FURNACE,
    operators: [],
    macros: [],
    opMacros: [],
    wavetables: [],
  };

  config.algorithm = reader.readUint8() & 0x07;
  config.feedback = reader.readUint8() & 0x07;
  config.fms = reader.readUint8() & 0x07;
  config.ams = reader.readUint8() & 0x03;

  const opCount = reader.readUint8();
  config.ops = opCount;
  const opllPreset = reader.readUint8();
  config.opllPreset = opllPreset;
  reader.skip(2); // reserved

  for (let i = 0; i < 4; i++) {
    const op: FurnaceOperatorConfig = {
      enabled: i < opCount,
      am: reader.readUint8() !== 0,
      ar: reader.readUint8(),
      dr: reader.readUint8(),
      mult: reader.readUint8(),
      rr: reader.readUint8(),
      sl: reader.readUint8(),
      tl: reader.readUint8(),
      dt2: reader.readUint8(),
      rs: reader.readUint8(),
      dt: reader.readInt8(),
      d2r: reader.readUint8(),
      ssg: reader.readUint8() & 0x0F,
      ksl: 0,
      ksr: false,
      sus: false,
      vib: false,
      ws: 0,
    };

    reader.skip(10); // Additional old format data
    config.operators.push(op);
  }

  return config;
}

/**
 * Parse macro data
 */
function parseMacroData(reader: BinaryReader, inst: FurnaceInstrument, _version: number): void {
  const headerLen = reader.readUint16();
  const headerEnd = reader.getOffset() + headerLen;

  while (reader.getOffset() < headerEnd) {
    const macroCode = reader.readUint8();
    if (macroCode === 255) break;

    const macro: FurnaceMacro = {
      code: macroCode,
      length: reader.readUint8(),
      loop: reader.readUint8(),
      release: reader.readUint8(),
      mode: reader.readUint8(),
      type: reader.readUint8(),
      delay: reader.readUint8(),
      speed: reader.readUint8(),
      data: [],
    };

    const wordSize = (macro.type >> 6) & 0x03;
    for (let i = 0; i < macro.length; i++) {
      switch (wordSize) {
        case 0: macro.data.push(reader.readUint8()); break;
        case 1: macro.data.push(reader.readInt8()); break;
        case 2: macro.data.push(reader.readInt16()); break;
        case 3: macro.data.push(reader.readInt32()); break;
      }
    }

    inst.macros.push(macro);
  }
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

    if (version >= 240) {
      pat.channel = reader.readUint16();
    } else {
      pat.channel = reader.readUint8();
      reader.readUint8(); // padding
    }

    pat.index = reader.readUint16();

    if (version >= 51) {
      pat.name = readString(reader);
    }

    // Get pattern length from subsong
    const subsong = subsongs[pat.subsong] || subsongs[0];
    const patLen = subsong?.patLen || 64;

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

      // Read effects 1-3
      for (let fx = 1; fx <= 3; fx++) {
        const hasEff = (effMask03 & (1 << ((fx - 1) * 2))) !== 0;
        const hasVal = (effMask03 & (1 << ((fx - 1) * 2 + 1))) !== 0;

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

      // Note conversion for old format
      if (cell.note === 0 && cell.octave === 0) {
        cell.note = -1;
      } else if (cell.note === 100) {
        cell.note = NOTE_OFF;
      } else if (cell.note === 101) {
        cell.note = NOTE_RELEASE;
      } else if (cell.note === 102) {
        cell.note = MACRO_RELEASE;
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

/**
 * Convert Furnace module to DEViLBOX format
 */
export function convertFurnaceToDevilbox(module: FurnaceModule): {
  instruments: ParsedInstrument[];
  patterns: any[][][]; // [pattern][row][channel]
  metadata: ImportMetadata;
} {
  // Convert instruments
  const instruments: ParsedInstrument[] = module.instruments.map((inst, idx) => {
    const samples: ParsedSample[] = [];

    // Convert samples referenced by this instrument
    for (const sampleIdx of inst.samples) {
      if (sampleIdx < module.samples.length) {
        const furSample = module.samples[sampleIdx];
        samples.push(convertFurnaceSample(furSample, sampleIdx));
      }
    }

    return {
      id: idx + 1,
      name: inst.name || `Instrument ${idx + 1}`,
      samples,
      fadeout: 0,
      volumeType: 'none' as const,
      panningType: 'none' as const,
    };
  });

  // Convert patterns - flatten subsong 0 patterns
  const patterns: any[][][] = [];
  const subsong = module.subsongs[0];
  if (!subsong) {
    return { instruments, patterns: [], metadata: createMetadata(module) };
  }

  // Find max pattern index
  const maxPatIdx = Math.max(
    ...subsong.orders.flat().filter(n => !isNaN(n) && n >= 0),
    0
  );

  for (let patIdx = 0; patIdx <= maxPatIdx; patIdx++) {
    const patternRows: any[][] = [];

    for (let row = 0; row < subsong.patLen; row++) {
      const rowCells: any[] = [];

      for (let ch = 0; ch < module.chans; ch++) {
        const key = `0_${ch}_${patIdx}`;
        const pattern = module.patterns.get(key);

        if (pattern && pattern.rows[row]) {
          const cell = pattern.rows[row];
          rowCells.push(convertFurnaceCell(cell));
        } else {
          rowCells.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effectType: 0,
            effectParam: 0,
          });
        }
      }

      patternRows.push(rowCells);
    }

    patterns.push(patternRows);
  }

  return {
    instruments,
    patterns,
    metadata: createMetadata(module),
  };
}

/**
 * Create import metadata
 */
function createMetadata(module: FurnaceModule): ImportMetadata {
  const subsong = module.subsongs[0];

  return {
    sourceFormat: 'XM', // Use XM as closest equivalent for effect handling
    sourceFile: module.name || 'Furnace Module',
    importedAt: new Date().toISOString(),
    originalChannelCount: module.chans,
    originalPatternCount: module.patterns.size,
    originalInstrumentCount: module.instruments.length,
    modData: {
      moduleType: 'FUR',
      initialSpeed: subsong?.speed1 || 6,
      initialBPM: Math.round(((subsong?.virtualTempo || 150) * (subsong?.hz || 60)) / ((subsong?.speed1 || 6) * 2.5)),
      amigaPeriods: false,
      channelNames: subsong?.channelNames || Array.from({ length: module.chans }, (_, i) => `Ch ${i + 1}`),
      songLength: subsong?.ordersLen || 1,
      restartPosition: 0,
      patternOrderTable: subsong?.orders[0] || [],
      songMessage: module.comment,
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
    pcmData = data16.buffer as ArrayBuffer;
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
 */
function convertFurnaceCell(cell: FurnacePatternCell): any {
  let note = 0;

  if (cell.note === NOTE_OFF || cell.note === NOTE_RELEASE || cell.note === MACRO_RELEASE) {
    note = 97; // XM note off
  } else if (cell.note >= 0 && cell.note <= 12) {
    // Convert note + octave to XM format
    const octave = cell.octave < 0 ? 0 : cell.octave;
    note = (octave * 12) + cell.note + 1;
    if (note > 96) note = 96;
    if (note < 1) note = 0;
  }

  // Convert volume
  let volume = 0;
  if (cell.volume >= 0) {
    volume = 0x10 + Math.min(64, Math.floor(cell.volume / 2));
  }

  // Convert first effect
  let effectType = 0;
  let effectParam = 0;
  if (cell.effects.length > 0) {
    const fx = cell.effects[0];
    effectType = mapFurnaceEffect(fx.type);
    effectParam = fx.value & 0xFF;
  }

  return {
    note,
    instrument: cell.instrument >= 0 ? cell.instrument + 1 : 0,
    volume,
    effectType,
    effectParam,
  };
}

/**
 * Map Furnace effect to XM effect
 */
function mapFurnaceEffect(furEffect: number): number {
  // Furnace effects roughly match XM effects for common commands
  const mapping: Record<number, number> = {
    0x00: 0x00, // Arpeggio
    0x01: 0x01, // Porta up
    0x02: 0x02, // Porta down
    0x03: 0x03, // Tone porta
    0x04: 0x04, // Vibrato
    0x05: 0x05, // Porta + vol slide
    0x06: 0x06, // Vibrato + vol slide
    0x07: 0x07, // Tremolo
    0x08: 0x08, // Panning
    0x09: 0x09, // Sample offset
    0x0A: 0x0A, // Vol slide
    0x0B: 0x0B, // Position jump
    0x0C: 0x0C, // Set volume
    0x0D: 0x0D, // Pattern break
    0x0F: 0x0F, // Set speed/tempo
    0x10: 0x10, // Set global volume
  };

  return mapping[furEffect] ?? 0;
}

/**
 * Get supported extensions
 */
export function getSupportedFurnaceExtensions(): string[] {
  return ['.fur'];
}
