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
 * - Magic: ".DelekDefleMask." (16 bytes, DIV_DMF_MAGIC in Furnace)
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
      if (!magic.startsWith('.DelekDefleMask.')) throw new Error('Invalid DMF magic');
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
  private static parseDMF(reader: BinaryReader, _magic: string): DMFModule {
    // Version byte immediately follows the 16-byte magic (offset 16)
    const version = reader.readUint8();
    // System byte follows version (offset 17) — for version >= 9
    const systemId = version >= 9 ? reader.readUint8() : 0x01; // YMU759 for ancient versions
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

    // Song info — name and author (all versions >= 9 read these)
    module.name = reader.readPrefixedString();
    module.author = reader.readPrefixedString();

    // Highlight bytes (version > 0x0c = 12)
    if (version > 12) {
      reader.readUint8(); // highlightA
      reader.readUint8(); // highlightB
    }

    // Timing — matches Furnace dmf.cpp exactly
    module.timeBase = reader.readUint8(); // oldTimeBase
    module.ticksPerRow[0] = reader.readUint8(); // speed1
    if (version > 7) {
      module.ticksPerRow[1] = reader.readUint8(); // speed2
      reader.readUint8(); // pal (0=NTSC/60Hz, 1=PAL/50Hz)
      const customTempo = reader.readUint8();
      if (version > 10) {
        // 3-byte Hz string (e.g. "060")
        const hzStr = reader.readString(3);
        if (customTempo) {
          const hz = parseInt(hzStr, 10);
          if (!isNaN(hz) && hz > 0) module.framesPerTick = hz;
        }
      }
    }

    // Pattern length — int32 for version > 0x17 (23), else uint8
    if (version > 23) {
      module.patternRows = reader.readInt32();
    } else {
      module.patternRows = reader.readUint8();
    }
    module.matrixRows = reader.readUint8();

    // Arpeggio tick speed — only for version < 20 and version > 3
    if (version < 20 && version > 3) {
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

    // Patterns — matches Furnace dmf.cpp pattern read order:
    // note(i16), octave(i16), volume(i16), effects[](i16 pairs), instrument(i16)
    for (let ch = 0; ch < module.channelCount; ch++) {
      const channelEffectCount = reader.readUint8();

      for (let patIdx = 0; patIdx < module.matrixRows; patIdx++) {
        const pattern: DMFPattern = { rows: [] };

        for (let row = 0; row < module.patternRows; row++) {
          const note: DMFNote = {
            note: reader.readInt16(),
            octave: reader.readInt16(),
            volume: reader.readInt16(),
            instrument: -1,
            effects: []
          };

          // Effects come BEFORE instrument in the DMF format
          for (let fx = 0; fx < channelEffectCount; fx++) {
            const code = reader.readInt16();
            const value = reader.readInt16();
            if (code >= 0) {
              note.effects.push({ code, value });
            }
          }

          // Instrument is the LAST field per row
          note.instrument = reader.readInt16();

          if (!pattern.rows[row]) pattern.rows[row] = [];
          pattern.rows[row][ch] = note;
        }

        module.patterns.push(pattern);
      }
    }

    return module;
  }

  // Version is read as a byte at offset 16 in parseDMF(), not extracted from magic string.

  /**
   * Parse single instrument from DMF
   */
  private static parseInstrument(
    reader: BinaryReader,
    version: number,
    system: SystemDef
  ): { name: string; config: FurnaceConfig } {
    const name = version > 5 ? reader.readPrefixedString() : `Instrument ${reader.getOffset()}`;
    // mode: 1 = FM, 0 = STD (matches Furnace: mode?DIV_INS_FM:DIV_INS_STD)
    const mode = version >= 11 ? reader.readUint8() : 1; // ancient versions = all FM

    const config: FurnaceConfig = {
      ...DEFAULT_FURNACE,
      chipType: this.SYSTEM_MAP[system.id] ?? 0,
      operators: [],
      macros: [],
      opMacros: [],
      wavetables: []
    };

    if (mode === 1) {
      // FM Instrument — matches Furnace dmf.cpp
      config.algorithm = reader.readUint8();
      if (version < 19) reader.readUint8(); // padding byte in old format
      config.feedback = reader.readUint8();
      if (version < 19) reader.readUint8(); // padding byte in old format

      let opCount = 4;
      if (version >= 19) {
        reader.readUint8(); // fms
        // ops = 4 for version >= 19
      } else {
        reader.readUint8(); // fms
        reader.readUint8(); // padding
        opCount = 2 + reader.readUint8() * 2;
        if (opCount !== 2 && opCount !== 4) opCount = 4;
      }
      reader.readUint8(); // ams

      const isOPLL = system.id === 0x0B || system.id === 0x0C;

      for (let i = 0; i < opCount; i++) {
        const op = this.parseOperator(reader, version, isOPLL);
        config.operators.push(op);
      }
    } else {
      // Standard Instrument (PSG/Wavetable)
      this.readMacros(reader, config, version, system);
    }

    return { name, config };
  }

  /**
   * Parse FM operator — matches Furnace dmf.cpp operator read order
   */
  private static parseOperator(reader: BinaryReader, version: number, isOPLL: boolean = false): FurnaceOperatorConfig {
    const op: FurnaceOperatorConfig = {
      enabled: true,
      am: false, ar: 0, dr: 0, d2r: 0, mult: 0, rr: 0, sl: 0, tl: 0,
      dt: 0, dt2: 0, rs: 0, ksr: false, ksl: 0, sus: false, vib: false, ws: 0, ssg: 0
    };

    // Field order matches Furnace dmf.cpp exactly
    op.am = reader.readUint8() !== 0;
    op.ar = reader.readUint8();
    if (version < 19) reader.readUint8(); // dam (old format)
    op.dr = reader.readUint8();
    if (version < 19) {
      reader.readUint8(); // dvb
      reader.readUint8(); // egt
      op.ksl = reader.readUint8();
      if (version < 17) op.ksr = reader.readUint8() !== 0;
    }
    op.mult = reader.readUint8();
    op.rr = reader.readUint8();
    op.sl = reader.readUint8();
    if (version < 19) {
      op.sus = reader.readUint8() !== 0;
    }
    op.tl = reader.readUint8();
    if (version < 19) {
      op.vib = reader.readUint8() !== 0;
      op.ws = reader.readUint8();
    } else {
      if (isOPLL) {
        reader.readUint8(); // opllPreset (first op) or padding
      } else {
        op.dt2 = reader.readUint8();
      }
    }
    if (version > 5) {
      if (isOPLL) {
        op.ksr = reader.readUint8() !== 0;
        op.vib = reader.readUint8() !== 0;
        op.ksl = reader.readUint8();
        op.ssg = reader.readUint8();
      } else {
        op.rs = reader.readUint8();
        op.dt = reader.readUint8();
        op.d2r = reader.readUint8();
        op.ssg = reader.readUint8();
      }
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
      // FM Instrument (DMP format uses different field order from DMF)
      config.algorithm = reader.readUint8();
      config.feedback = reader.readUint8();

      for (let i = 0; i < 4; i++) {
        const op: FurnaceOperatorConfig = {
          enabled: true,
          mult: reader.readUint8(),
          tl: reader.readUint8(),
          ar: reader.readUint8(),
          dr: reader.readUint8(),
          d2r: 0,
          sl: reader.readUint8(),
          rr: reader.readUint8(),
          dt: reader.readInt8(),
          dt2: 0,
          rs: reader.readUint8(),
          am: false,
          ksr: false,
          ksl: 0,
          sus: false,
          vib: false,
          ws: 0,
          ssg: 0
        };
        config.operators.push(op);
      }
    } else {
      // STD Instrument (PSG/Wavetable) — DMP uses simplified macro format
      const defaultSystem: SystemDef = { id: systemId, name: '', chipType: 0, fmChannels: 0, psgChannels: 0, totalChannels: 0 };
      this.readMacros(reader, config, 24, defaultSystem);
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

  /**
   * Read STD instrument macros — matches Furnace dmf.cpp macro reading
   */
  private static readMacros(reader: BinaryReader, config: FurnaceConfig, version: number, system: SystemDef): void {
    const isGB = system.id === 0x04;

    // Helper to read one macro (len, data[], loop if len>0)
    const readMacro = (typeIdx: number, useInt32: boolean): void => {
      const len = reader.readUint8();
      const macroData: number[] = [];
      for (let j = 0; j < len; j++) {
        macroData.push(useInt32 ? reader.readInt32() : reader.readUint8());
      }
      let loop = -1;
      if (len > 0) {
        loop = reader.readUint8();
      }
      if (len > 0) {
        config.macros.push({ type: typeIdx, data: macroData, loop, release: -1, mode: 0 });
      }
    };

    const useInt32 = version >= 14; // version >= 0x0e

    // Volume macro (skip for GB on version >= 0x12/18)
    if (!(isGB && version >= 18)) {
      readMacro(0, useInt32);
    }

    // Arp macro
    const arpLen = reader.readUint8();
    const arpData: number[] = [];
    for (let j = 0; j < arpLen; j++) {
      arpData.push(useInt32 ? reader.readInt32() : reader.readUint8());
    }
    let arpLoop = -1;
    if (arpLen > 0) {
      arpLoop = reader.readUint8();
    }
    let arpMode = 0;
    if (version > 15) {
      arpMode = reader.readUint8();
    }
    if (arpLen > 0) {
      config.macros.push({ type: 1, data: arpData, loop: arpLoop, release: -1, mode: arpMode });
    }

    // Duty macro
    readMacro(2, useInt32);

    // Wave macro
    readMacro(3, useInt32);

    // C64-specific extra data (system 0x07) — skip to advance reader position
    if (system.id === 0x07) {
      // triOn, sawOn, pulseOn, noiseOn
      reader.readUint8(); reader.readUint8(); reader.readUint8(); reader.readUint8();
      // attack, decay, sustain, release
      reader.readUint8(); reader.readUint8(); reader.readUint8(); reader.readUint8();
      // cutoff, resonance, filterOn, volIsCutoff (or char for version >= 17)
      reader.readUint8(); reader.readUint8(); reader.readUint8();
      if (version < 17) {
        reader.readUint8(); // volIsCutoff (int in old versions, but stored as byte)
      } else {
        reader.readUint8(); // volIsCutoff (char)
      }
      // channel3off
      reader.readUint8();
      // initial duty cycle (2 bytes or 4 bytes depending on version)
      if (useInt32) { reader.readInt32(); } else { reader.readUint8(); reader.readUint8(); }
      // ringMod, oscSync
      reader.readUint8(); reader.readUint8();
      // various flags
      if (version >= 17) {
        reader.readUint8(); // toFilter
        // 3 filter mode bools
        reader.readUint8(); reader.readUint8(); reader.readUint8();
      }
    }

    // GB-specific envelope data (version >= 18)
    if (isGB && version >= 18) {
      reader.readUint8(); // envVol
      reader.readUint8(); // envDir
      reader.readUint8(); // envLen
      reader.readUint8(); // soundLen
    }
  }
}
