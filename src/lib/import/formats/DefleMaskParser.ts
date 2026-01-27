import { BinaryReader } from '../../../utils/BinaryReader';
import type {
  FurnaceConfig,
  FurnaceOperatorConfig
} from '../../../types/instrument';
import { DEFAULT_FURNACE } from '../../../types/instrument';

/**
 * DefleMask Module (.dmf) / Patch (.dmp) / Wavetable (.dmw) Parser
 * Clean-room implementation supporting versions 3-27.
 *
 * DefleMask Format Overview:
 * - Magic: ".DeFleMask." (16 bytes with version suffix)
 * - System: Defines the target chip (Genesis, GB, NES, etc.)
 * - Song Info: Name, Author, BPM, etc.
 * - Instruments: FM or Standard (PSG/Wavetable)
 * - Wavetables: Custom waveforms
 * - Patterns: Channel data with notes, instruments, volume, effects
 */

// System definitions with channel counts
interface SystemDef {
  id: number;
  name: string;
  chipType: number;
  fmChannels: number;
  psgChannels: number;
  totalChannels: number;
}

const DEFLMASK_SYSTEMS: Record<number, SystemDef> = {
  0x01: { id: 0x01, name: 'YMU759', chipType: 19, fmChannels: 17, psgChannels: 0, totalChannels: 17 },
  0x02: { id: 0x02, name: 'Genesis', chipType: 0, fmChannels: 6, psgChannels: 4, totalChannels: 10 },
  0x03: { id: 0x03, name: 'SMS', chipType: 3, fmChannels: 0, psgChannels: 4, totalChannels: 4 },
  0x04: { id: 0x04, name: 'Game Boy', chipType: 5, fmChannels: 0, psgChannels: 4, totalChannels: 4 },
  0x05: { id: 0x05, name: 'PC Engine', chipType: 6, fmChannels: 0, psgChannels: 6, totalChannels: 6 },
  0x06: { id: 0x06, name: 'NES', chipType: 4, fmChannels: 0, psgChannels: 5, totalChannels: 5 },
  0x07: { id: 0x07, name: 'C64', chipType: 10, fmChannels: 0, psgChannels: 3, totalChannels: 3 },
  0x08: { id: 0x08, name: 'Arcade', chipType: 1, fmChannels: 13, psgChannels: 0, totalChannels: 13 },
  0x09: { id: 0x09, name: 'Neo Geo', chipType: 14, fmChannels: 4, psgChannels: 7, totalChannels: 13 },
  0x0A: { id: 0x0A, name: 'Genesis Ext', chipType: 0, fmChannels: 9, psgChannels: 4, totalChannels: 13 },
  0x0B: { id: 0x0B, name: 'SMS + OPLL', chipType: 11, fmChannels: 9, psgChannels: 4, totalChannels: 13 },
  0x0C: { id: 0x0C, name: 'NES + VRC7', chipType: 4, fmChannels: 6, psgChannels: 5, totalChannels: 11 },
  0x0D: { id: 0x0D, name: 'NES + FDS', chipType: 16, fmChannels: 0, psgChannels: 6, totalChannels: 6 },
};

export interface DMFNote {
  note: number;        // 0-11 (C-B), 100 = note off, 0 = none
  octave: number;      // 0-7
  volume: number;      // -1 = none, 0-15
  instrument: number;  // -1 = none
  effects: Array<{ code: number; value: number }>;
}

export interface DMFPattern {
  rows: DMFNote[][];   // [row][channel]
}

export interface DMFModule {
  version: number;
  system: SystemDef;
  name: string;
  author: string;
  timeBase: number;
  ticksPerRow: [number, number]; // speed 1 & 2
  framesPerTick: number;
  patternRows: number;
  matrixRows: number;
  arpeggioTickSpeed: number;
  instruments: Array<{ name: string; config: FurnaceConfig }>;
  wavetables: number[][];
  patterns: DMFPattern[];
  patternMatrix: number[][]; // [channel][position]
  channelCount: number;
}

export class DefleMaskParser {
  /**
   * System ID Mapping (DefleMask -> Internal Furnace ChipType)
   */
  private static SYSTEM_MAP: Record<number, number> = {
    0x01: 19, // YMU759 -> OPZ/Fallback
    0x02: 0,  // Genesis -> OPN2
    0x03: 3,  // SMS -> PSG
    0x04: 5,  // Game Boy -> GB
    0x05: 6,  // PCE
    0x06: 4,  // NES
    0x07: 10, // C64 -> SID
    0x08: 1,  // Arcade -> OPM
    0x09: 14, // Neo Geo -> OPNB
    0x0A: 0,  // Genesis Ext -> OPN2
    0x0B: 11, // SMS + OPLL -> OPLL
    0x0C: 4,  // NES + VRC7 -> NES
    0x0D: 16, // NES + FDS -> FDS
  };

  /**
   * Parse a DefleMask file (.dmf, .dmp, or .dmw)
   */
  public static parse(buffer: ArrayBuffer, type: 'dmf' | 'dmp' | 'dmw'): DMFModule | { name: string; config: FurnaceConfig } | number[] {
    const reader = new BinaryReader(buffer);
    const magic = reader.readMagic(16);

    if (type === 'dmf') {
      if (!magic.startsWith('.DeFleMask.')) throw new Error('Invalid DMF magic');
      return this.parseDMF(reader, magic);
    } else if (type === 'dmp') {
      reader.seek(0);
      return this.parseDMP(reader);
    } else if (type === 'dmw') {
      reader.seek(0);
      return this.parseDMW(reader);
    }

    throw new Error(`Unknown format: ${type}`);
  }

  /**
   * Parse full DMF module
   */
  private static parseDMF(reader: BinaryReader, magic: string): DMFModule {
    // Extract version from magic suffix
    const version = this.extractVersion(magic);
    const systemId = reader.readUint8();
    const system = DEFLMASK_SYSTEMS[systemId] ?? DEFLMASK_SYSTEMS[0x02];

    const module: DMFModule = {
      version,
      system,
      name: '',
      author: '',
      timeBase: 0,
      ticksPerRow: [6, 6],
      framesPerTick: 1,
      patternRows: 64,
      matrixRows: 1,
      arpeggioTickSpeed: 1,
      instruments: [],
      wavetables: [],
      patterns: [],
      patternMatrix: [],
      channelCount: system.totalChannels
    };

    // Visual Information (metadata)
    if (version >= 17) {
      module.name = reader.readPrefixedString();
      module.author = reader.readPrefixedString();
      // Read highlight bytes (used in GUI, not needed for playback)
      reader.readUint8(); // highlightA
      reader.readUint8(); // highlightB
    } else if (version >= 10) {
      module.name = reader.readNullTerminatedString();
      module.author = reader.readNullTerminatedString();
    }

    // Timing
    module.timeBase = reader.readUint8();
    module.ticksPerRow = [reader.readUint8(), reader.readUint8()];

    if (version >= 14) {
      module.framesPerTick = reader.readUint8();
    }

    // Speed flags
    if (version >= 19) {
      const customHZ = reader.readUint8();
      if (customHZ) {
        // Custom Hz values (3 bytes) - read to advance position
        reader.readUint8(); // hz1
        reader.readUint8(); // hz2
        reader.readUint8(); // hz3
      }
    }

    // Pattern length
    module.patternRows = reader.readUint32();
    module.matrixRows = reader.readUint8();

    if (version >= 21) {
      module.arpeggioTickSpeed = reader.readUint8();
    }

    // Pattern matrix
    module.patternMatrix = [];
    for (let ch = 0; ch < module.channelCount; ch++) {
      const channelMatrix: number[] = [];
      for (let row = 0; row < module.matrixRows; row++) {
        channelMatrix.push(reader.readUint8());
      }
      module.patternMatrix.push(channelMatrix);
    }

    // Instruments
    const instrumentCount = reader.readUint8();
    for (let i = 0; i < instrumentCount; i++) {
      const inst = this.parseInstrument(reader, version, system);
      module.instruments.push(inst);
    }

    // Wavetables
    const wavetableCount = reader.readUint8();
    for (let i = 0; i < wavetableCount; i++) {
      const waveSize = reader.readUint32();
      const waveData: number[] = [];
      for (let j = 0; j < waveSize; j++) {
        waveData.push(reader.readUint32());
      }
      module.wavetables.push(waveData);
    }

    // Patterns
    for (let ch = 0; ch < module.channelCount; ch++) {
      const channelEffectCount = reader.readUint8();

      for (let patIdx = 0; patIdx < module.matrixRows; patIdx++) {
        const pattern: DMFPattern = { rows: [] };

        for (let row = 0; row < module.patternRows; row++) {
          const note: DMFNote = {
            note: reader.readUint16(),
            octave: reader.readUint16(),
            volume: reader.readInt16(),
            instrument: reader.readInt16(),
            effects: []
          };

          for (let fx = 0; fx < channelEffectCount; fx++) {
            const code = reader.readInt16();
            const value = reader.readInt16();
            if (code >= 0) {
              note.effects.push({ code, value });
            }
          }

          if (!pattern.rows[row]) pattern.rows[row] = [];
          pattern.rows[row][ch] = note;
        }

        module.patterns.push(pattern);
      }
    }

    return module;
  }

  /**
   * Extract version number from magic string
   */
  private static extractVersion(magic: string): number {
    // Magic format: ".DeFleMask." followed by version indicator
    // Version is encoded as characters after the magic
    const versionMatch = magic.match(/\.DeFleMask\.(\d+)/);
    if (versionMatch) {
      return parseInt(versionMatch[1], 10);
    }
    // Default to version 24 (common modern version)
    return 24;
  }

  /**
   * Parse single instrument from DMF
   */
  private static parseInstrument(
    reader: BinaryReader,
    version: number,
    system: SystemDef
  ): { name: string; config: FurnaceConfig } {
    const name = version >= 17 ? reader.readPrefixedString() : reader.readNullTerminatedString();
    const mode = reader.readUint8(); // 0 = FM, 1 = STD

    const config: FurnaceConfig = {
      ...DEFAULT_FURNACE,
      chipType: this.SYSTEM_MAP[system.id] ?? 0,
      operators: [],
      macros: [],
      opMacros: [],
      wavetables: []
    };

    if (mode === 0) {
      // FM Instrument
      config.algorithm = reader.readUint8();
      config.feedback = reader.readUint8();

      // OPN2/OPM: 4 operators, OPLL: 2 operators
      const opCount = (system.id === 0x0B || system.id === 0x0C) ? 2 : 4;

      if (version >= 19) {
        // FMS/AMS - read to advance position (could be stored in config if needed)
        reader.readUint8(); // fms
        reader.readUint8(); // ams
      }

      for (let i = 0; i < opCount; i++) {
        const op = this.parseOperator(reader, version);
        config.operators.push(op);
      }
    } else {
      // Standard Instrument (PSG/Wavetable)
      this.readMacros(reader, config);
    }

    return { name, config };
  }

  /**
   * Parse FM operator
   */
  private static parseOperator(reader: BinaryReader, version: number): FurnaceOperatorConfig {
    const op: FurnaceOperatorConfig = {
      enabled: true,
      am: reader.readUint8() !== 0,
      ar: reader.readUint8(),
      dr: reader.readUint8(),
      mult: reader.readUint8(),
      rr: reader.readUint8(),
      sl: reader.readUint8(),
      tl: reader.readUint8(),
      dt: 0,
      rs: 0,
      ksr: false,
      ssg: 0
    };

    if (version >= 11) {
      op.dt = reader.readInt8();
      op.rs = reader.readUint8();
    }

    if (version >= 12) {
      // DR2 / D2R - read to advance position (not used in our config)
      reader.readUint8();
    }

    if (version >= 15) {
      // SSG-EG
      op.ssg = reader.readUint8();
    }

    return op;
  }

  /**
   * Parse a DefleMask Patch (.dmp)
   */
  public static parseDMP(reader: BinaryReader): { name: string; config: FurnaceConfig } {
    // Version byte - read to advance position
    reader.readUint8();
    const systemId = reader.readUint8();
    const instrumentType = reader.readUint8(); // 0 = FM, 1 = STD

    const config: FurnaceConfig = {
      ...DEFAULT_FURNACE,
      chipType: this.SYSTEM_MAP[systemId] ?? 0,
      operators: [],
      macros: [],
      opMacros: [],
      wavetables: []
    };

    const name = 'DefleMask Instrument';

    if (instrumentType === 0) {
      // FM Instrument
      config.algorithm = reader.readUint8();
      config.feedback = reader.readUint8();
      
      for (let i = 0; i < 4; i++) {
        const op: FurnaceOperatorConfig = {
          enabled: true,
          mult: reader.readUint8(),
          tl: reader.readUint8(),
          ar: reader.readUint8(),
          dr: reader.readUint8(),
          sl: reader.readUint8(),
          rr: reader.readUint8(),
          dt: reader.readInt8(),
          rs: reader.readUint8(),
          am: false,
          ksr: false,
          ssg: 0
        };
        config.operators.push(op);
      }
    } else {
      // STD Instrument (PSG/Wavetable)
      // Logic for reading macros (Vol, Arp, Duty, etc.)
      this.readMacros(reader, config);
    }

    return { name, config };
  }

  private static parseDMW(reader: BinaryReader): number[] {
    // DefleMask Wavetable (.dmw)
    // 32 or 64 or 128 bytes of 8-bit PCM
    const data: number[] = [];
    while (!reader.isEOF()) {
      data.push(reader.readUint8());
    }
    return data;
  }

  private static readMacros(reader: BinaryReader, config: FurnaceConfig): void {
    // DefleMask Standard Instrument Macros
    const macroTypes = ['volume', 'arp', 'duty', 'wave', 'pitch'];

    for (const type of macroTypes) {
      const exists = reader.readUint8();
      if (exists) {
        const len = reader.readUint8();
        const loop = reader.readUint8();
        const macroData: number[] = [];
        for (let i = 0; i < len; i++) {
          macroData.push(reader.readInt32());
        }
        config.macros.push({
          type: macroTypes.indexOf(type),
          data: macroData,
          loop: loop,
          release: -1, // No release point in DefleMask format
          mode: 0      // Standard mode
        });
      }
    }
  }
}
