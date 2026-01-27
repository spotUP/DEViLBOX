import { BinaryReader } from '../../../utils/BinaryReader';
import type { 
  FurnaceConfig,
  FurnaceOperatorConfig
} from '../../../types/instrument';
import { DEFAULT_FURNACE } from '../../../types/instrument';

/**
 * Furnace Tracker Instrument (.fui) Parser
 * Handles parsing of Furnace's feature-based binary format (new) 
 * and fixed-block format (old).
 */
export class FurnaceParser {
  /**
   * Parse a Furnace instrument file from an ArrayBuffer
   */
  public static parse(buffer: ArrayBuffer): { name: string; config: FurnaceConfig } {
    const reader = new BinaryReader(buffer);
    const magic = reader.readMagic(16);

    if (magic.startsWith('-Furnace instr.')) {
      return this.parseOldFormat(reader);
    }

    // Reset reader for new format check
    reader.seek(0);
    const newMagic = reader.readMagic(4);
    if (newMagic === 'FINS' || newMagic === 'INS2' || newMagic === 'INST') {
      return this.parseNewFormat(reader, newMagic);
    }

    throw new Error(`Invalid Furnace instrument header: ${newMagic}`);
  }

  private static parseNewFormat(reader: BinaryReader, magic: string): { name: string; config: FurnaceConfig } {
    if (magic === 'INS2') reader.skip(4);
    reader.skip(2); // version

    const chipType = reader.readUint8();
    const config: FurnaceConfig = {
      ...DEFAULT_FURNACE,
      chipType,
      operators: Array.from({ length: 4 }, () => ({ ...DEFAULT_FURNACE.operators[0] })),
      macros: [],
      opMacros: Array.from({ length: 4 }, () => ({})),
      wavetables: [],
    };

    let name = 'Furnace Instrument';
    const wavePointers: number[] = [];

    while (!reader.isEOF()) {
      try {
        if (reader.getOffset() + 4 > reader.getSize()) break;
        const featCodeRaw = reader.readMagic(2);
        if (featCodeRaw === 'EN' || featCodeRaw === '\0\0') break;

        const featSize = reader.readUint16();
        const featEnd = reader.getOffset() + featSize;
        if (featEnd > reader.getSize()) break;

        switch (featCodeRaw) {
          case 'NA':
          case 'NM':
            name = reader.readString(featSize);
            break;
          case 'FM':
            this.readFMFeature(reader, config);
            break;
          case 'WV':
          case 'WL':
          case 'LW':
            this.readWavePointers(reader, wavePointers);
            break;
        }
        reader.seek(featEnd);
      } catch (e) {
        break;
      }
    }

    this.loadWavetables(reader, wavePointers, config);
    return { name, config };
  }

  private static parseOldFormat(reader: BinaryReader): { name: string; config: FurnaceConfig } {
    reader.seek(16);
    reader.skip(4); // Skip version (2 bytes) + reserved (2 bytes)
    const dataPtr = reader.readUint32();
    const waveCount = reader.readUint16();
    const sampleCount = reader.readUint16();
    reader.skip(4);

    const wavePointers: number[] = [];
    for (let i = 0; i < waveCount; i++) wavePointers.push(reader.readUint32());
    reader.skip(sampleCount * 4);

    if (dataPtr >= reader.getSize()) throw new Error('Invalid data pointer');
    reader.seek(dataPtr);
    
    if (reader.readMagic(4) !== 'INST') throw new Error('Invalid INST block');
    reader.skip(4); // size
    reader.skip(2); // version
    const chipType = reader.readUint8();
    reader.skip(1); // reserved
    
    const name = reader.readNullTerminatedString();

    const config: FurnaceConfig = {
      ...DEFAULT_FURNACE,
      chipType,
      operators: [],
      macros: [],
      opMacros: [],
      wavetables: []
    };

    if (reader.getOffset() + 8 <= reader.getSize()) {
      config.algorithm = reader.readUint8();
      config.feedback = reader.readUint8();
      reader.skip(2); // fms, ams
      const opCount = reader.readUint8();
      reader.skip(3); // OPLL, reserved

      for (let i = 0; i < 4; i++) {
        if (reader.getOffset() + 12 > reader.getSize()) break;
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
          ksl: 0, ksr: false, sus: false, vib: false, ws: 0
        };
        if (reader.getOffset() + 10 <= reader.getSize()) reader.skip(10);
        config.operators.push(op);
      }
    }

    if (config.operators.length === 0) {
      config.operators = Array.from({ length: 4 }, () => ({ ...DEFAULT_FURNACE.operators[0] }));
    }

    this.loadWavetables(reader, wavePointers, config);
    return { name, config };
  }

  private static readFMFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const flags = reader.readUint8();
    const opCount = flags & 0x0F;
    const opEnabled = (flags >> 4) & 0x0F;
    config.algorithm = reader.readUint8() & 0x07;
    config.feedback = reader.readUint8() & 0x07;
    reader.skip(2);
    config.operators = [];
    for (let i = 0; i < opCount; i++) {
      const op: FurnaceOperatorConfig = {
        enabled: ((opEnabled >> i) & 1) !== 0,
        mult: reader.readUint8() & 0x0F,
        dt: (reader.readUint8() >> 4) & 0x07,
        dt2: 0,
        tl: reader.readUint8(),
        ar: reader.readUint8() & 0x1F,
        dr: reader.readUint8() & 0x1F,
        d2r: 0,
        sl: (reader.readUint8() >> 4) & 0x0F,
        rr: reader.readUint8() & 0x0F,
        rs: 0,
        ssg: reader.readUint8() & 0x0F,
        am: false, ksl: 0, ksr: false, sus: false, vib: false, ws: 0
      };
      config.operators.push(op);
    }
  }

  private static readWavePointers(reader: BinaryReader, pointers: number[]): void {
    const waveCount = reader.readUint16();
    reader.skip(waveCount * 2);
    for (let i = 0; i < waveCount; i++) pointers.push(reader.readUint32());
  }

  private static loadWavetables(reader: BinaryReader, pointers: number[], config: FurnaceConfig): void {
    for (const ptr of pointers) {
      if (ptr > 0 && ptr < reader.getSize()) {
        reader.seek(ptr);
        const wave = this.readWaveBlock(reader);
        if (wave) config.wavetables.push(wave);
      }
    }
  }

  private static readWaveBlock(reader: BinaryReader): { id: number; data: number[] } | null {
    if (reader.getOffset() + 4 > reader.getSize()) return null;
    if (reader.readMagic(4) !== 'WAVE') return null;
    reader.skip(20);
    const len = reader.readUint32();
    reader.skip(8);
    const data: number[] = [];
    for (let i = 0; i < len; i++) {
      if (reader.getOffset() + 4 > reader.getSize()) break;
      data.push(reader.readInt32());
    }
    return { id: 0, data };
  }
}