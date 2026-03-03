/**
 * Furnace instrument parsing — FM operators, ADSR, macros, chip-specific data.
 *
 * Handles both INS2/FINS (new) and INST (old) instrument formats.
 */

import { BinaryReader } from '../../../../utils/BinaryReader';
import type { FurnaceConfig, FurnaceOperatorConfig } from '../../../../types/instrument';
import { DEFAULT_FURNACE } from '../../../../types/instrument';
import { readString } from './FurnaceBinaryReader';

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

// Instrument
export interface FurnaceInstrument {
  name: string;
  type: number;
  fm?: FurnaceConfig;
  macros: FurnaceMacro[];
  samples: number[];
  wavetables: number[];
  rawBinaryData?: Uint8Array;  // Raw binary instrument data for upload to WASM
  opMacroArrays?: FurnaceMacro[][];  // Per-operator macros [4 operators][N macros each]
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

/**
 * Parse instrument
 */
export function parseInstrument(reader: BinaryReader): FurnaceInstrument {
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
          // Values are signed bytes (-4 to +3); use readInt8 to preserve sign
          for (let i = 0; i < 32; i++) modTable.push(reader.readInt8());
          inst.fds = { modSpeed, modDepth, initModTableWithFirstWave: initMod, modTable };
          break;
        }
        case 'O1':
        case 'O2':
        case 'O3':
        case 'O4': {
          // Operator macros (O1-O4) — Reference: instrument.cpp:2059-2193
          // Same format as MA macros but for per-operator params (AM, AR, DR, MULT, etc.)
          const opIndex = featCode.charCodeAt(1) - '1'.charCodeAt(0); // 0-3
          if (!inst.opMacroArrays) inst.opMacroArrays = [[], [], [], []];
          parseOperatorMacroData(reader, inst.opMacroArrays[opIndex], featEnd);
          console.log(`[FurnaceParser] Parsed ${featCode} (operator ${opIndex} macros): ${inst.opMacroArrays[opIndex].length} macros`);
          break;
        }
        case 'LD': // OPL drums (fixedDrums, kickFreq, snareHatFreq, tomTopFreq)
        case 'WS': // WaveSynth
        case 'MP': // MultiPCM
        case 'SU': // Sound Unit
        case 'ES': // ES5506 filter/envelope
        case 'X1': // X1-010 bank slot
        case 'NE': // NES DPCM note map
        case 'EF': // ESFM per-operator extras
        case 'PN': // PowerNoise octave
        case 'S2': // SID2
        case 'S3': // SID3 (enhanced C64 SID)
          // All chip-specific feature blocks are preserved in rawBinaryData.
          // The FurnaceInsEdHardware WASM reads them natively; no TS parsing needed.
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
    // Reference: instrument.cpp:2887-2940 (readInsDataOld)
    const fmAlg = reader.readUint8();
    const fmFb = reader.readUint8();
    const fmFms = reader.readUint8();
    const fmAms = reader.readUint8();
    const fmOps = reader.readUint8();
    const fmOpllPreset = instVersion >= 60 ? reader.readUint8() : (reader.readUint8(), 0);
    reader.skip(2); // reserved

    // 4 operators, each 32 bytes
    const fmOperators: FurnaceOperatorConfig[] = [];
    for (let j = 0; j < 4; j++) {
      // Reference: instrument.cpp:2901-2939
      const am = reader.readUint8();
      const ar = reader.readUint8();
      const dr = reader.readUint8();
      const mult = reader.readUint8();
      const rr = reader.readUint8();
      const sl = reader.readUint8();
      const tl = reader.readUint8();
      const dt2 = reader.readUint8();
      const rs = reader.readUint8();
      const dt = reader.readUint8();
      const d2r = reader.readUint8();
      const ssg = reader.readUint8();

      const dam = reader.readUint8();
      const dvb = reader.readUint8();
      const egt = reader.readUint8();
      const ksl = reader.readUint8();
      const sus = reader.readUint8();
      const vib = reader.readUint8();
      const ws = reader.readUint8();
      const ksr = reader.readUint8();

      // enable (v114+) + kvs (v115+) + 10 reserved = 12 bytes
      const enable = instVersion >= 114 ? reader.readUint8() : (reader.readUint8(), 1);
      const kvs = instVersion >= 115 ? reader.readUint8() : (reader.readUint8(), 2);
      reader.skip(10); // reserved

      fmOperators.push({
        enabled: !!enable,
        mult, tl, ar, dr, d2r, sl, rr, dt, dt2, rs,
        am: !!am, ksr: !!ksr, ksl, sus: !!sus, vib: !!vib, ws, ssg,
        dam, dvb, egt: !!egt, kvs,
      });
    }

    // Store FM data on the instrument
    inst.fm = {
      ...DEFAULT_FURNACE,
      algorithm: fmAlg,
      feedback: fmFb,
      fms: fmFms,
      ams: fmAms,
      ops: fmOps,
      opllPreset: fmOpllPreset,
      operators: fmOperators,
      macros: [],
      opMacros: [],
      wavetables: [],
    };

    // GB data — ALWAYS read (4 bytes)
    // Reference: instrument.cpp:2942-2946
    const gbEnvVol = reader.readUint8();
    const gbEnvDir = reader.readUint8();
    const gbEnvLen = reader.readUint8();
    const gbSoundLen = reader.readUint8();

    // Store GB data on the instrument
    inst.gb = {
      envVol: gbEnvVol,
      envDir: gbEnvDir,
      envLen: gbEnvLen,
      soundLen: gbSoundLen,
      softEnv: false,
      alwaysInit: false,
      doubleWave: false,
      hwSeqLen: 0,
      hwSeq: [],
    };

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
    // Reference: instrument.cpp:2972-2982
    const amigaInitSample = reader.readInt16();
    const amigaUseWave = instVersion >= 82 ? !!reader.readUint8() : (reader.readUint8(), false);
    const amigaWaveLen = instVersion >= 82 ? reader.readUint8() : (reader.readUint8(), 0);
    reader.skip(12); // reserved

    if (amigaInitSample >= 0) {
      inst.samples.push(amigaInitSample);
    }
    inst.amiga = {
      initSample: amigaInitSample,
      useNoteMap: false,
      useSample: amigaInitSample >= 0,
      useWave: amigaUseWave,
      waveLen: amigaWaveLen,
    };

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
export function parseFMData(reader: BinaryReader): FurnaceConfig {
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
export function parseMacroData(reader: BinaryReader, inst: FurnaceInstrument, featEnd: number): void {
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
 * Parse operator macro data (O1-O4 feature blocks)
 * Same binary format as MA macros, just stored per-operator.
 * Reference: instrument.cpp:2059-2193 readFeatureOx
 */
export function parseOperatorMacroData(reader: BinaryReader, macros: FurnaceMacro[], featEnd: number): void {
  const macroHeaderLen = reader.readUint16();
  if (macroHeaderLen === 0 || macroHeaderLen > 32) {
    console.warn(`[FurnaceParser] Invalid op macro header length: ${macroHeaderLen}`);
    return;
  }

  while (reader.getOffset() < featEnd) {
    const macroStartPos = reader.getOffset();
    const macroCode = reader.readUint8();
    if (macroCode === 255) break;

    const macro: FurnaceMacro = {
      code: macroCode,
      length: reader.readUint8(),
      loop: reader.readUint8(),
      release: reader.readUint8(),
      mode: reader.readUint8(),
      type: reader.readUint8(), // wordSize byte: bits 0-3=open, bits 6-7=wordSize
      delay: reader.readUint8(),
      speed: reader.readUint8(),
      data: [],
    };

    const expectedHeaderEnd = macroStartPos + macroHeaderLen;
    if (reader.getOffset() < expectedHeaderEnd && expectedHeaderEnd <= featEnd) {
      reader.seek(expectedHeaderEnd);
    }

    const wordSize = (macro.type >> 6) & 0x03;
    for (let i = 0; i < macro.length && reader.getOffset() < featEnd; i++) {
      switch (wordSize) {
        case 0: macro.data.push(reader.readUint8()); break;
        case 1: macro.data.push(reader.readInt8()); break;
        case 2: macro.data.push(reader.readInt16()); break;
        case 3: macro.data.push(reader.readInt32()); break;
      }
    }

    macros.push(macro);
  }
}
