import { BinaryReader } from '../../../utils/BinaryReader';
import type { FurnaceConfig, FurnaceMacro } from '../../../types/instrument';
import { DEFAULT_FURNACE } from '../../../types/instrument';

/**
 * Furnace Tracker Instrument (.fui) Parser
 * Handles parsing of Furnace's feature-based binary format (new)
 * and fixed-block format (old).
 *
 * All 27 feature blocks are supported with correct signed/unsigned types
 * matching the upstream Furnace instrument.h / instrument.cpp.
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

  // ---------------------------------------------------------------------------
  // New (feature-block) format
  // ---------------------------------------------------------------------------

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
          case 'MA':
            this.readMAFeature(reader, config);
            break;
          case 'O1':
          case 'O2':
          case 'O3':
          case 'O4':
            this.readOxFeature(reader, config, featCodeRaw.charCodeAt(1) - 0x31);
            break;
          case '64':
            this.read64Feature(reader, config);
            break;
          case 'GB':
            this.readGBFeature(reader, config);
            break;
          case 'SM':
            this.readSMFeature(reader, config);
            break;
          case 'SN':
            this.readSNFeature(reader, config, featEnd);
            break;
          case 'N1':
            this.readN1Feature(reader, config, featEnd);
            break;
          case 'FD':
            this.readFDFeature(reader, config);
            break;
          case 'WS':
            this.readWSFeature(reader, config);
            break;
          case 'LD':
            this.readLDFeature(reader, config);
            break;
          case 'MP':
            this.readMPFeature(reader, config);
            break;
          case 'SU':
            this.readSUFeature(reader, config);
            break;
          case 'ES':
            this.readESFeature(reader, config);
            break;
          case 'X1':
            config.x1BankSlot = reader.readInt32();
            break;
          case 'NE':
            this.readNEFeature(reader, config);
            break;
          case 'EF':
            this.readEFFeature(reader, config);
            break;
          case 'PN':
            config.powerNoiseOctave = reader.readUint8();
            break;
          case 'S2':
            this.readS2Feature(reader, config);
            break;
          case 'S3':
            this.readS3Feature(reader, config);
            break;
          case 'SL':
          case 'LS':
          case 'WV':
          case 'WL':
          case 'LW':
            this.readWavePointers(reader, wavePointers);
            break;
          default:
            // Unknown feature block — skip
            break;
        }
        reader.seek(featEnd);
      } catch {
        break;
      }
    }

    this.loadWavetables(reader, wavePointers, config);
    return { name, config };
  }

  // ---------------------------------------------------------------------------
  // FM feature (byte-packed operator data)
  // ---------------------------------------------------------------------------

  private static readFMFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const flags = reader.readUint8();
    const opCount = flags & 0x0F;
    const opEnabled = (flags >> 4) & 0x0F;

    const algFb = reader.readUint8();
    config.algorithm = (algFb >> 4) & 7;
    config.feedback = algFb & 7;

    const modByte = reader.readUint8();
    config.fms = modByte & 7;
    config.ams = (modByte >> 3) & 3;
    config.fms2 = (modByte >> 5) & 7;

    const presetByte = reader.readUint8();
    config.ams2 = (presetByte >> 6) & 3;
    config.ops = (presetByte & 32) ? 4 : 2;
    config.opllPreset = presetByte & 31;

    // Block byte — always read in new format
    const blockByte = reader.readUint8();
    config.block = blockByte & 0x0F;

    config.operators = [];
    for (let i = 0; i < opCount; i++) {
      const b0 = reader.readUint8();
      const b1 = reader.readUint8();
      const b2 = reader.readUint8();
      const b3 = reader.readUint8();
      const b4 = reader.readUint8();
      const b5 = reader.readUint8();
      const b6 = reader.readUint8();
      const b7 = reader.readUint8();

      config.operators.push({
        enabled: ((opEnabled >> i) & 1) !== 0,
        ksr: (b0 & 0x80) !== 0,
        dt: (b0 >> 4) & 0x07,
        mult: b0 & 0x0F,
        sus: (b1 & 0x80) !== 0,
        tl: b1 & 0x7F,
        rs: (b2 >> 6) & 3,
        vib: (b2 & 0x20) !== 0,
        ar: b2 & 0x1F,
        am: (b3 & 0x80) !== 0,
        ksl: (b3 >> 5) & 3,
        dr: b3 & 0x1F,
        egt: (b4 & 0x80) !== 0,
        kvs: (b4 >> 5) & 3,
        d2r: b4 & 0x1F,
        sl: (b5 >> 4) & 0x0F,
        rr: b5 & 0x0F,
        dvb: (b6 >> 4) & 0x0F,
        ssg: b6 & 0x0F,
        dam: (b7 >> 5) & 0x07,
        dt2: (b7 >> 3) & 3,
        ws: b7 & 0x07,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // MA — instrument macros
  // ---------------------------------------------------------------------------

  private static readMAFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const macros = this.readMacroBlock(reader);
    config.macros = macros;
  }

  // ---------------------------------------------------------------------------
  // O1-O4 — per-operator macros
  // ---------------------------------------------------------------------------

  private static readOxFeature(reader: BinaryReader, config: FurnaceConfig, opIndex: number): void {
    const macros = this.readMacroBlock(reader);
    if (!config.opMacroArrays) config.opMacroArrays = [[], [], [], []];
    config.opMacroArrays[opIndex] = macros;
  }

  // ---------------------------------------------------------------------------
  // Shared macro block reader (used by MA and O1-O4)
  // ---------------------------------------------------------------------------

  private static readMacroBlock(reader: BinaryReader): FurnaceMacro[] {
    const macroHeaderLen = reader.readUint16();
    const headerStart = reader.getOffset();

    const headers: Array<{
      code: number; len: number; loop: number; rel: number;
      mode: number; wordSize: number; delay: number; speed: number;
    }> = [];

    // Read macro headers until 0xFF terminator
    while (true) {
      const macroCode = reader.readUint8();
      if (macroCode === 255) break;

      const len = reader.readUint8();
      const loop = reader.readUint8();
      const rel = reader.readUint8();
      const mode = reader.readUint8();
      const wordSizeByte = reader.readUint8();
      const wordSize = (wordSizeByte >> 6) & 3;
      const delay = reader.readUint8();
      const speed = reader.readUint8();

      headers.push({ code: macroCode, len, loop, rel, mode, wordSize, delay, speed });
    }

    // Seek to data section (past header)
    reader.seek(headerStart + macroHeaderLen);

    const macros: FurnaceMacro[] = [];
    for (const h of headers) {
      const data: number[] = [];
      for (let i = 0; i < h.len; i++) {
        switch (h.wordSize) {
          case 0: data.push(reader.readUint8()); break;
          case 1: data.push(reader.readInt8()); break;
          case 2: data.push(reader.readInt16()); break;
          case 3: data.push(reader.readInt32()); break;
        }
      }
      macros.push({
        code: h.code,
        type: h.wordSize,
        data,
        loop: h.loop === 255 ? -1 : h.loop,
        release: h.rel === 255 ? -1 : h.rel,
        mode: h.mode,
        delay: h.delay,
        speed: h.speed,
      });
    }
    return macros;
  }

  // ---------------------------------------------------------------------------
  // 64 — C64/SID
  // ---------------------------------------------------------------------------

  private static read64Feature(reader: BinaryReader, config: FurnaceConfig): void {
    const byte1 = reader.readUint8();
    const byte2 = reader.readUint8();
    const byte3 = reader.readUint8();
    const byte4 = reader.readUint8();
    const duty = reader.readInt16();
    const cutRes = reader.readInt16();

    config.c64 = {
      triOn: (byte1 & 1) !== 0,
      sawOn: (byte1 & 2) !== 0,
      pulseOn: (byte1 & 4) !== 0,
      noiseOn: (byte1 & 8) !== 0,
      a: (byte1 >> 4) & 0x0F,
      d: byte2 & 0x0F,
      s: (byte2 >> 4) & 0x0F,
      r: byte3 & 0x0F,
      duty,
      ringMod: (byte3 & 0x10) !== 0,
      oscSync: (byte3 & 0x20) !== 0,
      toFilter: (byte3 & 0x40) !== 0,
      initFilter: (byte3 & 0x80) !== 0,
      filterRes: (cutRes >> 4) & 0x0F,
      filterResonance: (cutRes >> 4) & 0x0F,
      filterCutoff: ((cutRes & 0x0F) << 8) | (byte4 & 0xFF),
      filterLP: (byte4 & 0x10) !== 0,
      filterBP: (byte4 & 0x20) !== 0,
      filterHP: (byte4 & 0x40) !== 0,
      filterCh3Off: (byte4 & 0x80) !== 0,
      dutyIsAbs: (byte3 & 0x04) !== 0,
      filterIsAbs: (byte3 & 0x08) !== 0,
    };
  }

  // ---------------------------------------------------------------------------
  // GB — Game Boy
  // ---------------------------------------------------------------------------

  private static readGBFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const packed = reader.readUint8();
    const envLen = packed & 7;
    const envDir = (packed >> 3) & 1;
    const envVol = (packed >> 4) & 0x0F;

    const soundLen = reader.readUint8();
    const flags = reader.readUint8();
    const hwSeqLen = reader.readUint8();

    const hwSeq: Array<{ cmd: number; data: number }> = [];
    for (let i = 0; i < hwSeqLen; i++) {
      const cmd = reader.readUint8();
      const data = reader.readInt16();
      hwSeq.push({ cmd, data });
    }

    config.gb = {
      envVol,
      envDir,
      envLen,
      soundLen,
      softEnv: (flags & 1) !== 0,
      alwaysInit: (flags & 2) !== 0,
      doubleWave: (flags & 4) !== 0,
      hwSeqEnabled: hwSeqLen > 0,
      hwSeqLen,
      hwSeq,
    };
  }

  // ---------------------------------------------------------------------------
  // SM — Sample/Amiga
  // ---------------------------------------------------------------------------

  private static readSMFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const initSample = reader.readUint16();
    const flags = reader.readUint8();
    const waveLen = reader.readUint8();

    const useNoteMap = (flags & 2) !== 0;
    const useWave = (flags & 4) !== 0;
    const useSample = (flags & 1) !== 0;

    const noteMap: Array<{ note: number; sample: number; frequency: number }> = [];
    if (useNoteMap) {
      for (let i = 0; i < 120; i++) {
        const frequency = reader.readUint16();
        const sample = reader.readUint16();
        noteMap.push({ note: i, sample, frequency });
      }
    }

    config.amiga = {
      initSample,
      useNoteMap,
      useWave,
      useSample,
      waveLen,
      noteMap,
    };
  }

  // ---------------------------------------------------------------------------
  // SN — SNES
  // ---------------------------------------------------------------------------

  private static readSNFeature(reader: BinaryReader, config: FurnaceConfig, featEnd: number): void {
    const byte1 = reader.readUint8();
    const byte2 = reader.readUint8();
    const byte3 = reader.readUint8();
    const byte4 = reader.readUint8();

    const useEnv = (byte1 & 0x80) !== 0;
    config.snes = {
      useEnv,
      gainMode: useEnv ? 0 : (byte1 >> 5) & 3,
      gain: byte1 & 0x1F,
      a: (byte2 >> 4) & 0x0F,
      d: byte2 & 0x07,
      s: (byte3 >> 5) & 7,
      r: byte3 & 0x1F,
      sus: (byte4 >> 5) & 3,
    };

    // v131+: d2 extra byte
    if (reader.getOffset() < featEnd) {
      const d2Byte = reader.readUint8();
      config.snes.d2 = d2Byte & 0x07;
    }
  }

  // ---------------------------------------------------------------------------
  // N1 — Namco 163
  // ---------------------------------------------------------------------------

  private static readN1Feature(reader: BinaryReader, config: FurnaceConfig, featEnd: number): void {
    const wave = reader.readInt32();
    const wavePos = reader.readUint8();
    const waveLen = reader.readUint8();
    const waveMode = reader.readUint8();

    let perChPos = false;
    let chPos: number[] | undefined;
    let chLen: number[] | undefined;

    if (reader.getOffset() < featEnd) {
      const perChByte = reader.readUint8();
      perChPos = perChByte !== 0;
      if (perChPos) {
        chPos = [];
        for (let i = 0; i < 8; i++) chPos.push(reader.readUint8());
        chLen = [];
        for (let i = 0; i < 8; i++) chLen.push(reader.readUint8());
      }
    }

    config.n163 = {
      wave,
      wavePos,
      waveLen,
      waveMode,
      perChPos,
      chPos,
      chLen,
    };
  }

  // ---------------------------------------------------------------------------
  // FD — FDS
  // ---------------------------------------------------------------------------

  private static readFDFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const modSpeed = reader.readInt32();
    const modDepth = reader.readInt32();
    const initModTableWithFirstWave = reader.readUint8() !== 0;

    const modTable: number[] = [];
    for (let i = 0; i < 32; i++) {
      modTable.push(reader.readInt8());
    }

    config.fds = {
      modSpeed,
      modDepth,
      initModTableWithFirstWave,
      modTable,
    };
  }

  // ---------------------------------------------------------------------------
  // WS — Wavetable Synth
  // ---------------------------------------------------------------------------

  private static readWSFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const wave1 = reader.readInt32();
    const wave2 = reader.readInt32();
    const rateDivider = reader.readUint8();
    const effect = reader.readUint8();
    const enabled = reader.readUint8();
    const global = reader.readUint8();
    const speed = reader.readUint8();
    const param1 = reader.readUint8();
    const param2 = reader.readUint8();
    const param3 = reader.readUint8();
    const param4 = reader.readUint8();

    config.ws = {
      wave1,
      wave2,
      rateDivider,
      effect,
      enabled: enabled !== 0,
      oneShot: false,
      global: global !== 0,
      speed,
      param1,
      param2,
      param3,
      param4,
    };
  }

  // ---------------------------------------------------------------------------
  // LD — OPL drums
  // ---------------------------------------------------------------------------

  private static readLDFeature(reader: BinaryReader, config: FurnaceConfig): void {
    config.fixedDrums = reader.readUint8() !== 0;
    config.kickFreq = reader.readUint16();
    config.snareHatFreq = reader.readUint16();
    config.tomTopFreq = reader.readUint16();
  }

  // ---------------------------------------------------------------------------
  // MP — MultiPCM
  // ---------------------------------------------------------------------------

  private static readMPFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const ar = reader.readUint8();
    const d1r = reader.readUint8();
    const dl = reader.readUint8();
    const d2r = reader.readUint8();
    const rr = reader.readUint8();
    const rc = reader.readUint8();
    const lfo = reader.readUint8();
    const vib = reader.readUint8();
    const am = reader.readUint8();

    let damp = false;
    let pseudoReverb = false;
    let lfoReset = false;
    let levelDirect = false;

    // Try reading the optional flags byte
    try {
      const flagsByte = reader.readUint8();
      damp = (flagsByte & 1) !== 0;
      pseudoReverb = (flagsByte & 2) !== 0;
      lfoReset = (flagsByte & 4) !== 0;
      levelDirect = (flagsByte & 8) !== 0;
    } catch {
      // flags byte not present in older versions
    }

    config.multipcm = {
      ar, d1r, dl, d2r, rr, rc, lfo, vib, am,
      damp, pseudoReverb, lfoReset, levelDirect,
    };
  }

  // ---------------------------------------------------------------------------
  // SU — Sound Unit
  // ---------------------------------------------------------------------------

  private static readSUFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const switchRoles = reader.readUint8() !== 0;
    const hwSeqLen = reader.readUint8();

    const hwSeq: Array<{ cmd: number; bound: number; val: number; speed: number }> = [];
    for (let i = 0; i < hwSeqLen; i++) {
      const cmd = reader.readUint8();
      const bound = reader.readUint8();
      const val = reader.readUint8();
      const speed = reader.readInt16();
      hwSeq.push({ cmd, bound, val, speed });
    }

    config.soundUnit = { switchRoles, hwSeqLen, hwSeq };
  }

  // ---------------------------------------------------------------------------
  // ES — ES5506
  // ---------------------------------------------------------------------------

  private static readESFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const mode = reader.readUint8();
    const k1 = reader.readInt16();
    const k2 = reader.readInt16();
    const ecount = reader.readInt16();
    const lVRamp = reader.readUint8();
    const rVRamp = reader.readUint8();
    const k1Ramp = reader.readUint8();
    const k2Ramp = reader.readUint8();
    const k1Slow = reader.readUint8() !== 0;
    const k2Slow = reader.readUint8() !== 0;

    config.es5506 = {
      filter: { mode, k1, k2 },
      envelope: { ecount, lVRamp, rVRamp, k1Ramp, k2Ramp, k1Slow, k2Slow },
    };
  }

  // ---------------------------------------------------------------------------
  // NE — NES DPCM note map
  // ---------------------------------------------------------------------------

  private static readNEFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const useNoteMap = reader.readUint8() !== 0;
    if (useNoteMap) {
      // Initialize amiga noteMap structure to store NES DPCM mapping
      if (!config.amiga) {
        config.amiga = {
          initSample: -1,
          useNoteMap: true,
          useSample: true,
          useWave: false,
          waveLen: 0,
          noteMap: [],
        };
      }
      config.amiga.useNoteMap = true;
      config.amiga.noteMap = [];
      for (let i = 0; i < 120; i++) {
        const freq = reader.readUint8();
        const delta = reader.readUint8();
        config.amiga.noteMap.push({ note: i, frequency: freq, sample: delta });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // EF — ESFM
  // ---------------------------------------------------------------------------

  private static readEFFeature(reader: BinaryReader, config: FurnaceConfig): void {
    const noiseByte = reader.readUint8();
    const noise = noiseByte & 3;

    const operators: Array<{
      enabled: boolean; delay: number; outLvl: number; modIn: number;
      left: boolean; right: boolean; ct: number; dt: number; fixed: boolean;
      fixedFreq: number; mult: number; tl: number; ar: number; dr: number;
      d2r: number; sl: number; rr: number; ksr: boolean; ksl: number;
      sus: boolean; vib: boolean; ws: number; ssg: number; am: boolean;
      rs: number; dam: number; dvb: number; egt: boolean; kvs: number;
    }> = [];

    for (let i = 0; i < 4; i++) {
      const b1 = reader.readUint8();
      const b2 = reader.readUint8();
      const ct = reader.readUint8();
      const dtVal = reader.readUint8();

      const delay = b1 & 7;
      const outLvl = (b1 >> 3) & 7;
      const right = (b1 & 0x40) !== 0;
      const left = (b1 & 0x80) !== 0;
      const modIn = b2 & 7;
      const fixed = (b2 & 0x08) !== 0;

      operators.push({
        enabled: true,
        delay,
        outLvl,
        modIn,
        left,
        right,
        ct,
        dt: dtVal,
        fixed,
        fixedFreq: 0,
        // Stub FM defaults — the FM block provides the actual operator params
        mult: 0, tl: 0, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0,
        ksr: false, ksl: 0, sus: false, vib: false, ws: 0, ssg: 0,
        am: false, rs: 0, dam: 0, dvb: 0, egt: false, kvs: 0,
      });
    }

    config.esfm = { operators, noise };
  }

  // ---------------------------------------------------------------------------
  // S2 — SID2
  // ---------------------------------------------------------------------------

  private static readS2Feature(reader: BinaryReader, config: FurnaceConfig): void {
    const b = reader.readUint8();
    config.sid2 = {
      volume: b & 3,
      mixMode: (b >> 4) & 3,
      noiseMode: (b >> 6) & 3,
    };
  }

  // ---------------------------------------------------------------------------
  // S3 — SID3
  // ---------------------------------------------------------------------------

  private static readS3Feature(reader: BinaryReader, config: FurnaceConfig): void {
    const oscFlags = reader.readUint8();
    const a = reader.readUint8();
    const d = reader.readUint8();
    const s = reader.readUint8();
    const sr = reader.readUint8();
    const r = reader.readUint8();
    const mixMode = reader.readUint8();
    const duty = reader.readInt16();
    const oscFlags2 = reader.readUint8();

    const phaseModSource = reader.readUint8();
    const ringModSource = reader.readUint8();
    const syncSource = reader.readUint8();
    const specialWave = reader.readUint8();
    const phaseInv = reader.readUint8();
    const feedback = reader.readUint8();

    const numFilters = reader.readUint8();
    const filters: Array<{
      enabled: boolean; init: boolean; absoluteCutoff: boolean;
      bindCutoffToNote: boolean; bindCutoffToNoteDir: boolean; bindCutoffOnNote: boolean;
      bindResonanceToNote: boolean; bindResonanceToNoteDir: boolean; bindResonanceOnNote: boolean;
      cutoff: number; resonance: number; outputVolume: number; distortion: number;
      mode: number; filterMatrix: number;
      bindCutoffToNoteStrength: number; bindCutoffToNoteCenter: number;
      bindResonanceToNoteStrength: number; bindResonanceToNoteCenter: number;
    }> = [];

    for (let i = 0; i < numFilters; i++) {
      const ff1 = reader.readUint8();
      const ff2 = reader.readUint8();
      const cutoff = reader.readUint16();
      const resonance = reader.readUint8();
      const outputVolume = reader.readUint8();
      const distortion = reader.readUint8();
      const mode = reader.readUint8();
      const filterMatrix = reader.readUint8();
      const bindCutoffToNoteStrength = reader.readUint8();
      const bindCutoffToNoteCenter = reader.readUint8();
      const bindResonanceToNoteStrength = reader.readUint8();
      const bindResonanceToNoteCenter = reader.readUint8();

      filters.push({
        enabled: (ff1 & 1) !== 0,
        init: (ff1 & 2) !== 0,
        absoluteCutoff: (ff1 & 4) !== 0,
        bindCutoffToNote: (ff1 & 8) !== 0,
        bindCutoffToNoteDir: (ff1 & 0x10) !== 0,
        bindCutoffOnNote: (ff1 & 0x20) !== 0,
        bindResonanceToNote: (ff1 & 0x40) !== 0,
        bindResonanceToNoteDir: (ff1 & 0x80) !== 0,
        bindResonanceOnNote: (ff2 & 1) !== 0,
        cutoff,
        resonance,
        outputVolume,
        distortion,
        mode,
        filterMatrix,
        bindCutoffToNoteStrength,
        bindCutoffToNoteCenter,
        bindResonanceToNoteStrength,
        bindResonanceToNoteCenter,
      });
    }

    config.sid3 = {
      triOn: (oscFlags & 1) !== 0,
      sawOn: (oscFlags & 2) !== 0,
      pulseOn: (oscFlags & 4) !== 0,
      noiseOn: (oscFlags & 8) !== 0,
      dutyIsAbs: (oscFlags & 0x10) !== 0,
      a, d, s, sr, r,
      mixMode,
      duty,
      ringMod: (oscFlags2 & 1) !== 0,
      oscSync: (oscFlags2 & 2) !== 0,
      phaseMod: (oscFlags2 & 4) !== 0,
      specialWaveOn: (oscFlags2 & 8) !== 0,
      oneBitNoise: (oscFlags2 & 0x10) !== 0,
      separateNoisePitch: (oscFlags2 & 0x20) !== 0,
      doWavetable: (oscFlags2 & 0x40) !== 0,
      resetDuty: (oscFlags2 & 0x80) !== 0,
      phaseModSource,
      ringModSource,
      syncSource,
      specialWave,
      phaseInv,
      feedback,
      filters,
    };
  }

  // ---------------------------------------------------------------------------
  // Wave pointers (SL/LS/WV/WL/LW)
  // ---------------------------------------------------------------------------

  private static readWavePointers(reader: BinaryReader, pointers: number[]): void {
    const waveCount = reader.readUint16();
    reader.skip(waveCount * 2);
    for (let i = 0; i < waveCount; i++) pointers.push(reader.readUint32());
  }

  // ---------------------------------------------------------------------------
  // Wavetable loading
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Old (fixed-block) format
  // ---------------------------------------------------------------------------

  private static parseOldFormat(reader: BinaryReader): { name: string; config: FurnaceConfig } {
    reader.seek(16);
    reader.skip(4); // version (2 bytes) + reserved (2 bytes)
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
    const version = reader.readUint16();
    const chipType = reader.readUint8();
    reader.skip(1); // reserved

    const name = reader.readNullTerminatedString();

    const config: FurnaceConfig = {
      ...DEFAULT_FURNACE,
      chipType,
      operators: [],
      macros: [],
      opMacros: [],
      wavetables: [],
    };

    const safe = <T>(fn: () => T): T | undefined => {
      try { return fn(); } catch { return undefined; }
    };

    // --- FM section ---
    safe(() => {
      config.algorithm = reader.readUint8();
      config.feedback = reader.readUint8();
      config.fms = reader.readUint8();
      config.ams = reader.readUint8();
      const opCount = reader.readUint8();
      reader.skip(1); // reserved

      if (version >= 60) {
        config.opllPreset = reader.readUint8();
      } else {
        reader.skip(1);
      }
      reader.skip(1); // reserved

      for (let i = 0; i < 4; i++) {
        const am = reader.readUint8() !== 0;
        const ar = reader.readUint8();
        const dr = reader.readUint8();
        const mult = reader.readUint8();
        const rr = reader.readUint8();
        const sl = reader.readUint8();
        const tl = reader.readUint8();
        const dt2 = reader.readUint8();
        const rs = reader.readUint8();
        const dt = reader.readInt8(); // SIGNED
        const d2r = reader.readUint8();
        const ssg = reader.readUint8() & 0x0F;

        const dam = reader.readUint8();
        const dvb = reader.readUint8();
        const egt = reader.readUint8() !== 0;
        const ksl = reader.readUint8();
        const sus = reader.readUint8() !== 0;
        const vib = reader.readUint8() !== 0;
        const ws = reader.readUint8();
        const ksr = reader.readUint8() !== 0;

        let enabled = i < opCount;
        let kvs = 0;

        if (version >= 114) {
          enabled = reader.readUint8() !== 0;
        } else {
          reader.skip(1);
        }
        if (version >= 115) {
          kvs = reader.readUint8();
        } else {
          reader.skip(1);
        }

        // Skip 10 reserved bytes
        reader.skip(10);

        config.operators.push({
          enabled, am, ar, dr, mult, rr, sl, tl, dt2, rs, dt, d2r, ssg,
          dam, dvb, egt, ksl, sus, vib, ws, ksr, kvs,
        });
      }
    });

    // --- GB section ---
    safe(() => {
      const envVol = reader.readUint8();
      const envDir = reader.readUint8();
      const envLen = reader.readUint8();
      const soundLen = reader.readUint8();
      config.gb = { envVol, envDir, envLen, soundLen };
    });

    // --- C64 section ---
    safe(() => {
      const tri = reader.readUint8() !== 0;
      const saw = reader.readUint8() !== 0;
      const pulse = reader.readUint8() !== 0;
      const noise = reader.readUint8() !== 0;
      const cA = reader.readUint8();
      const cD = reader.readUint8();
      const cS = reader.readUint8();
      const cR = reader.readUint8();
      const cDuty = reader.readInt16(); // SIGNED
      const ringMod = reader.readUint8() !== 0;
      const oscSync = reader.readUint8() !== 0;
      const toFilter = reader.readUint8() !== 0;
      const initFilter = reader.readUint8() !== 0;
      reader.skip(1); // volIsCutoff
      const res = reader.readUint8();
      const lp = reader.readUint8() !== 0;
      const bp = reader.readUint8() !== 0;
      const hp = reader.readUint8() !== 0;
      const ch3off = reader.readUint8() !== 0;
      const cutoff = reader.readInt16(); // SIGNED
      const dutyIsAbs = reader.readUint8() !== 0;
      const filterIsAbs = reader.readUint8() !== 0;

      config.c64 = {
        triOn: tri, sawOn: saw, pulseOn: pulse, noiseOn: noise,
        a: cA, d: cD, s: cS, r: cR, duty: cDuty,
        ringMod, oscSync, toFilter, initFilter,
        filterRes: res, filterResonance: res,
        filterLP: lp, filterBP: bp, filterHP: hp, filterCh3Off: ch3off,
        filterCutoff: cutoff, dutyIsAbs, filterIsAbs,
      };
    });

    // --- Amiga section ---
    safe(() => {
      const initSample = reader.readUint16();
      const useWave = reader.readUint8() !== 0;
      const waveLen = reader.readUint8();
      reader.skip(12); // reserved
      config.amiga = {
        initSample,
        useNoteMap: false,
        useSample: !useWave,
        useWave,
        waveLen,
        noteMap: [],
      };
    });

    // --- Standard macros (vol, arp, duty, wave + v17+ pitch, ex1-3) ---
    safe(() => {
      const readMacroVals = (len: number): number[] => {
        const vals: number[] = [];
        for (let i = 0; i < len; i++) vals.push(reader.readInt32());
        return vals;
      };
      const makeMacro = (code: number, len: number, loop: number, data: number[], mode = 0): FurnaceMacro => ({
        code, type: code, data, loop: loop < 0 || loop >= len ? -1 : loop, release: -1, mode,
      });

      // Base: vol(0), arp(1), duty(2), wave(3) lengths + loops
      const volLen = reader.readInt32(), arpLen = reader.readInt32(), dutyLen = reader.readInt32(), waveLen = reader.readInt32();
      const volLoop = reader.readInt32(), arpLoop = reader.readInt32(), dutyLoop = reader.readInt32(), waveLoop = reader.readInt32();
      const arpMode = reader.readUint8();
      reader.skip(3); // deprecated heights

      // v17+: pitch(4), ex1(5), ex2(6), ex3(7) lengths + loops
      let pitchLen = 0, ex1Len = 0, ex2Len = 0, ex3Len = 0;
      let pitchLoop = -1, ex1Loop = -1, ex2Loop = -1, ex3Loop = -1;
      if (version >= 17) {
        pitchLen = reader.readInt32(); ex1Len = reader.readInt32(); ex2Len = reader.readInt32(); ex3Len = reader.readInt32();
        pitchLoop = reader.readInt32(); ex1Loop = reader.readInt32(); ex2Loop = reader.readInt32(); ex3Loop = reader.readInt32();
      }

      // Read values
      const volData = readMacroVals(volLen), arpData = readMacroVals(arpLen);
      const dutyData = readMacroVals(dutyLen), waveData = readMacroVals(waveLen);

      config.macros = [];
      if (volLen > 0) config.macros.push(makeMacro(0, volLen, volLoop, volData));
      if (arpLen > 0) config.macros.push(makeMacro(1, arpLen, arpLoop, arpData, arpMode));
      if (dutyLen > 0) config.macros.push(makeMacro(2, dutyLen, dutyLoop, dutyData));
      if (waveLen > 0) config.macros.push(makeMacro(3, waveLen, waveLoop, waveData));

      if (version >= 17) {
        const pitchData = readMacroVals(pitchLen), ex1Data = readMacroVals(ex1Len);
        const ex2Data = readMacroVals(ex2Len), ex3Data = readMacroVals(ex3Len);
        if (pitchLen > 0) config.macros.push(makeMacro(4, pitchLen, pitchLoop, pitchData));
        if (ex1Len > 0) config.macros.push(makeMacro(5, ex1Len, ex1Loop, ex1Data));
        if (ex2Len > 0) config.macros.push(makeMacro(6, ex2Len, ex2Loop, ex2Data));
        if (ex3Len > 0) config.macros.push(makeMacro(7, ex3Len, ex3Loop, ex3Data));
      }

      // v29+: FM macros (alg, fb, fms, ams) + open flags + operator macros
      if (version >= 29) {
        const algLen = reader.readInt32(), fbLen = reader.readInt32(), fmsLen = reader.readInt32(), amsLen = reader.readInt32();
        const algLoop = reader.readInt32(), fbLoop = reader.readInt32(), fmsLoop = reader.readInt32(), amsLoop = reader.readInt32();
        reader.skip(8); // standard open flags
        reader.skip(4); // fm open flags

        const algData = readMacroVals(algLen), fbData = readMacroVals(fbLen);
        const fmsData = readMacroVals(fmsLen), amsData = readMacroVals(amsLen);
        if (algLen > 0) config.macros.push(makeMacro(8, algLen, algLoop, algData));
        if (fbLen > 0) config.macros.push(makeMacro(9, fbLen, fbLoop, fbData));
        if (fmsLen > 0) config.macros.push(makeMacro(10, fmsLen, fmsLoop, fmsData));
        if (amsLen > 0) config.macros.push(makeMacro(11, amsLen, amsLoop, amsData));

        // Operator macros: 4 ops × 12 macros each (lengths, loops, open flags, then int8 values)
        if (!config.opMacroArrays) config.opMacroArrays = [[], [], [], []];
        const opCodes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // am,ar,dr,mult,rr,sl,tl,dt2,rs,dt,d2r,ssg
        for (let op = 0; op < 4; op++) {
          const lens: number[] = [], loops: number[] = [];
          for (let m = 0; m < 12; m++) lens.push(reader.readInt32());
          for (let m = 0; m < 12; m++) loops.push(reader.readInt32());
          reader.skip(12); // open flags
          for (let m = 0; m < 12; m++) {
            const data: number[] = [];
            for (let v = 0; v < lens[m]; v++) data.push(reader.readUint8());
            if (lens[m] > 0) {
              config.opMacroArrays[op].push(makeMacro(opCodes[m], lens[m], loops[m], data));
            }
          }
        }
      }
    });

    if (config.operators.length === 0) {
      config.operators = Array.from({ length: 4 }, () => ({ ...DEFAULT_FURNACE.operators[0] }));
    }

    this.loadWavetables(reader, wavePointers, config);
    return { name, config };
  }
}
