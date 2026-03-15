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
export interface FurnaceES5506Data {
  filter: { mode: number; k1: number; k2: number };
  envelope: { ecount: number; lVRamp: number; rVRamp: number; k1Ramp: number; k2Ramp: number; k1Slow: boolean; k2Slow: boolean };
}
export interface FurnaceMultiPCMData {
  ar: number; d1r: number; dl: number; d2r: number; rr: number; rc: number;
  lfo: number; vib: number; am: number;
  damp: boolean; pseudoReverb: boolean; lfoReset: boolean; levelDirect: boolean;
}
export interface FurnaceSoundUnitData {
  switchRoles: boolean;
  hwSeqLen: number;
  hwSeq: Array<{ cmd: number; bound: number; val: number; speed: number }>;
}
export interface FurnaceESFMData {
  noise: number;
  operators: Array<{ delay: number; outLvl: number; modIn: number; left: number; right: number; fixed: number; ct: number; dt: number }>;
}
export interface FurnacePowerNoiseData {
  octave: number;
}
export interface FurnaceSID2Data {
  volume: number; mixMode: number; noiseMode: number;
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
  es5506?: FurnaceES5506Data;
  multipcm?: FurnaceMultiPCMData;
  soundUnit?: FurnaceSoundUnitData;
  esfm?: FurnaceESFMData;
  powerNoise?: FurnacePowerNoiseData;
  sid2?: FurnaceSID2Data;
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
        case 'MP': {
          // MultiPCM — Reference: instrument.cpp:2558-2580
          const mpAr = reader.readUint8();
          const mpD1r = reader.readUint8();
          const mpDl = reader.readUint8();
          const mpD2r = reader.readUint8();
          const mpRr = reader.readUint8();
          const mpRc = reader.readUint8();
          const mpLfo = reader.readUint8();
          const mpVib = reader.readUint8();
          const mpAm = reader.readUint8();
          let mpDamp = false, mpPseudoReverb = false, mpLfoReset = false, mpLevelDirect = true;
          if (reader.getOffset() < featEnd) {
            const mpFlags = reader.readUint8();
            mpDamp = !!(mpFlags & 1);
            mpPseudoReverb = !!(mpFlags & 2);
            mpLfoReset = !!(mpFlags & 4);
            mpLevelDirect = !!(mpFlags & 8);
          }
          inst.multipcm = {
            ar: mpAr, d1r: mpD1r, dl: mpDl, d2r: mpD2r, rr: mpRr, rc: mpRc,
            lfo: mpLfo, vib: mpVib, am: mpAm,
            damp: mpDamp, pseudoReverb: mpPseudoReverb, lfoReset: mpLfoReset, levelDirect: mpLevelDirect,
          };
          break;
        }
        case 'SU': {
          // Sound Unit — Reference: instrument.cpp:2582-2598
          const suSwitch = reader.readUint8() !== 0;
          const suHwSeqLen = reader.getOffset() < featEnd ? reader.readUint8() : 0;
          const suHwSeq: Array<{ cmd: number; bound: number; val: number; speed: number }> = [];
          for (let i = 0; i < suHwSeqLen && reader.getOffset() < featEnd; i++) {
            suHwSeq.push({
              cmd: reader.readUint8(),
              bound: reader.readUint8(),
              val: reader.readUint8(),
              speed: reader.readInt16(),
            });
          }
          inst.soundUnit = { switchRoles: suSwitch, hwSeqLen: suHwSeqLen, hwSeq: suHwSeq };
          break;
        }
        case 'ES': {
          // ES5506 — Reference: instrument.cpp:2600-2614
          const esFilterMode = reader.readUint8();
          const esK1 = reader.readUint16();
          const esK2 = reader.readUint16();
          const esEcount = reader.readUint16();
          const esLVRamp = reader.readInt8();
          const esRVRamp = reader.readInt8();
          const esK1Ramp = reader.readInt8();
          const esK2Ramp = reader.readInt8();
          const esK1Slow = reader.readUint8() !== 0;
          const esK2Slow = reader.readUint8() !== 0;
          inst.es5506 = {
            filter: { mode: esFilterMode, k1: esK1, k2: esK2 },
            envelope: { ecount: esEcount, lVRamp: esLVRamp, rVRamp: esRVRamp, k1Ramp: esK1Ramp, k2Ramp: esK2Ramp, k1Slow: esK1Slow, k2Slow: esK2Slow },
          };
          break;
        }
        case 'EF': {
          // ESFM — Reference: instrument.cpp:2640-2664
          const efNoiseByte = reader.readUint8();
          const efNoise = efNoiseByte & 3;
          const efOps: Array<{ delay: number; outLvl: number; modIn: number; left: number; right: number; fixed: number; ct: number; dt: number }> = [];
          for (let i = 0; i < 4; i++) {
            const efByte1 = reader.readUint8();
            const efByte2 = reader.readUint8();
            efOps.push({
              delay: (efByte1 >> 5) & 7,
              outLvl: (efByte1 >> 2) & 7,
              right: (efByte1 >> 1) & 1,
              left: efByte1 & 1,
              modIn: efByte2 & 7,
              fixed: (efByte2 >> 3) & 1,
              ct: reader.readInt8(),
              dt: reader.readInt8(),
            });
          }
          inst.esfm = { noise: efNoise, operators: efOps };
          break;
        }
        case 'PN': {
          // PowerNoise — Reference: instrument.cpp:2666-2672
          inst.powerNoise = { octave: reader.readUint8() };
          break;
        }
        case 'S2': {
          // SID2 — Reference: instrument.cpp:2674-2684
          const s2Byte = reader.readUint8();
          inst.sid2 = {
            volume: s2Byte & 0x0F,
            mixMode: (s2Byte >> 4) & 0x03,
            noiseMode: (s2Byte >> 6) & 0x03,
          };
          break;
        }
        case 'LD': // OPL drums (fixedDrums, kickFreq, snareHatFreq, tomTopFreq)
        case 'WS': // WaveSynth
        case 'X1': // X1-010 bank slot
        case 'NE': // NES DPCM note map
        case 'S3': // SID3 (enhanced C64 SID)
          // Preserved in rawBinaryData; no TS parsing needed yet.
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

    // Amiga data — ALWAYS read (16 bytes)
    // Reference: instrument.cpp:2972-2982
    const amigaInitSample = reader.readInt16();
    const amigaUseWave = instVersion >= 82 ? !!reader.readUint8() : (reader.readUint8(), false);
    const amigaWaveLen = instVersion >= 82 ? reader.readUint8() : (reader.readUint8(), 0);
    reader.skip(12); // reserved

    if (amigaInitSample >= 0) {
      inst.samples.push(amigaInitSample);
    }
    // useSample: only infer from initSample for Amiga type (14). For all other types
    // (e.g. SU=30), useSample defaults false here; version>=104 SU block overrides it.
    const isAmigaType = inst.type === 14; /* DIV_INS_AMIGA */
    inst.amiga = {
      initSample: amigaInitSample,
      useNoteMap: false,
      useSample: isAmigaType && amigaInitSample >= 0,
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

    // AY/AY8930 wave macro correction for pre-v193 files (upstream instrument.cpp:3596-3601)
    if (instVersion < 193 && (inst.type === 6 /* DIV_INS_AY */ || inst.type === 7 /* DIV_INS_AY8930 */)) {
      for (let j = 0; j < waveMacroVals.length; j++) {
        waveMacroVals[j]++;
      }
    }

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
      // Version < 112: convert old fixed-arp format — XOR values with 0x40000000, reset mode
      // Reference: instrument.cpp:4155-4165
      let finalArpMode = arpMode;
      const finalArpVals = [...arpMacroVals];
      if (instVersion < 112 && arpMode) {
        finalArpMode = 0;
        for (let j = 0; j < arpMacroLen; j++) {
          finalArpVals[j] = (finalArpVals[j] ^ 0x40000000) | 0;
        }
        // Add trailing zero if loop/release go past end
        if ((arpMacroLoop >= arpMacroLen) && arpMacroLen < 255) {
          finalArpVals.push(0);
        }
      }
      inst.macros.push({ code: 1, length: finalArpVals.length, loop: arpMacroLoop, release: -1, mode: finalArpMode, type: 0, delay: 0, speed: 1, data: finalArpVals });
    }
    if (dutyMacroLen > 0) {
      inst.macros.push({ code: 2, length: dutyMacroLen, loop: dutyMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: dutyMacroVals });
    }
    if (waveMacroLen > 0) {
      inst.macros.push({ code: 3, length: waveMacroLen, loop: waveMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: waveMacroVals });
    }

    // ========================================================================
    // FM macros (v29+) — Reference: instrument.cpp:3050-3161
    // ========================================================================
    if (instVersion >= 29) {
      const algMacroLen = reader.readInt32();
      const fbMacroLen = reader.readInt32();
      const fmsMacroLen = reader.readInt32();
      const amsMacroLen = reader.readInt32();

      const algMacroLoop = reader.readInt32();
      const fbMacroLoop = reader.readInt32();
      const fmsMacroLoop = reader.readInt32();
      const amsMacroLoop = reader.readInt32();

      // Open flags for all macros (vol, arp, duty, wave, pitch, ex1-3, alg, fb, fms, ams)
      // We read them but only use open flags for FM macros (alg/fb/fms/ams)
      reader.readUint8(); // volMacro.open
      reader.readUint8(); // arpMacro.open
      reader.readUint8(); // dutyMacro.open
      reader.readUint8(); // waveMacro.open
      reader.readUint8(); // pitchMacro.open
      reader.readUint8(); // ex1Macro.open
      reader.readUint8(); // ex2Macro.open
      reader.readUint8(); // ex3Macro.open
      reader.readUint8(); // algMacro.open
      reader.readUint8(); // fbMacro.open
      reader.readUint8(); // fmsMacro.open
      reader.readUint8(); // amsMacro.open

      // FM macro values (int32 each)
      const algMacroVals = readMacroVals(algMacroLen);
      const fbMacroVals = readMacroVals(fbMacroLen);
      const fmsMacroVals = readMacroVals(fmsMacroLen);
      const amsMacroVals = readMacroVals(amsMacroLen);

      if (algMacroLen > 0) {
        inst.macros.push({ code: 8, length: algMacroLen, loop: algMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: algMacroVals });
      }
      if (fbMacroLen > 0) {
        inst.macros.push({ code: 9, length: fbMacroLen, loop: fbMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: fbMacroVals });
      }
      if (fmsMacroLen > 0) {
        inst.macros.push({ code: 10, length: fmsMacroLen, loop: fmsMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: fmsMacroVals });
      }
      if (amsMacroLen > 0) {
        inst.macros.push({ code: 11, length: amsMacroLen, loop: amsMacroLoop, release: -1, mode: 0, type: 0, delay: 0, speed: 1, data: amsMacroVals });
      }

      // Per-operator macros: 4 operators × 12 macro types (AM, AR, DR, MULT, RR, SL, TL, DT2, RS, DT, D2R, SSG)
      // Reference: instrument.cpp:3078-3160
      // OP_MACRO_NAMES: am, ar, dr, mult, rr, sl, tl, dt2, rs, dt, d2r, ssg
      if (!inst.opMacroArrays) inst.opMacroArrays = [[], [], [], []];

      // Upstream reads per-operator: 12 lens, 12 loops, 12 opens (interleaved)
      // Reference: instrument.cpp:3648-3692
      const opMacroLens: number[][] = [];
      const opMacroLoops: number[][] = [];
      for (let op = 0; op < 4; op++) {
        const lens: number[] = [];
        for (let m = 0; m < 12; m++) lens.push(reader.readInt32());
        const loops: number[] = [];
        for (let m = 0; m < 12; m++) loops.push(reader.readInt32());
        // Open flags (12 bytes per operator)
        for (let m = 0; m < 12; m++) reader.readUint8();
        opMacroLens.push(lens);
        opMacroLoops.push(loops);
      }

      // Read values (low 8 bits, unsigned char) for all 4 operators
      // Reference: instrument.cpp:3121-3160
      for (let op = 0; op < 4; op++) {
        for (let m = 0; m < 12; m++) {
          const len = opMacroLens[op][m];
          const vals: number[] = [];
          for (let j = 0; j < len; j++) vals.push(reader.readUint8());
          if (len > 0) {
            inst.opMacroArrays[op].push({
              code: m, length: len, loop: opMacroLoops[op][m], release: -1,
              mode: 0, type: 0, delay: 0, speed: 1, data: vals,
            });
          }
        }
      }
    }

    // ========================================================================
    // Release points (v44+) — Reference: instrument.cpp:3163-3194
    // ========================================================================
    if (instVersion >= 44) {
      // Standard macro release points
      const relVol = reader.readInt32();
      const relArp = reader.readInt32();
      const relDuty = reader.readInt32();
      const relWave = reader.readInt32();
      const relPitch = reader.readInt32();
      const relEx1 = reader.readInt32();
      const relEx2 = reader.readInt32();
      const relEx3 = reader.readInt32();
      const relAlg = reader.readInt32();
      const relFb = reader.readInt32();
      const relFms = reader.readInt32();
      const relAms = reader.readInt32();

      // Apply release points to existing macros
      const relMap: Record<number, number> = {
        0: relVol, 1: relArp, 2: relDuty, 3: relWave,
        4: relPitch, 5: relEx1, 6: relEx2, 7: relEx3,
        8: relAlg, 9: relFb, 10: relFms, 11: relAms,
      };
      for (const macro of inst.macros) {
        if (relMap[macro.code] !== undefined) {
          macro.release = relMap[macro.code];
        }
      }

      // Per-operator release points: 4 ops × 12 params
      for (let op = 0; op < 4; op++) {
        const opRels: number[] = [];
        for (let m = 0; m < 12; m++) opRels.push(reader.readInt32());
        if (inst.opMacroArrays && inst.opMacroArrays[op]) {
          for (const opMacro of inst.opMacroArrays[op]) {
            if (opMacro.code < 12 && opRels[opMacro.code] !== undefined) {
              opMacro.release = opRels[opMacro.code];
            }
          }
        }
      }
    }

    // ========================================================================
    // Extended operator macros (v61+) — Reference: instrument.cpp:3196-3265
    // 4 operators × 8 additional macros: DAM, DVB, EGT, KSL, SUS, VIB, WS, KSR
    // ========================================================================
    if (instVersion >= 61) {
      if (!inst.opMacroArrays) inst.opMacroArrays = [[], [], [], []];

      // Upstream reads per-operator: 8 lens, 8 loops, 8 rels, 8 opens
      // Reference: instrument.cpp:3767-3808
      const extOpMacroLens: number[][] = [];
      const extOpMacroLoops: number[][] = [];
      const extOpMacroRels: number[][] = [];

      for (let op = 0; op < 4; op++) {
        const lens: number[] = [];
        for (let m = 0; m < 8; m++) lens.push(reader.readInt32());
        const loops: number[] = [];
        for (let m = 0; m < 8; m++) loops.push(reader.readInt32());
        const rels: number[] = [];
        for (let m = 0; m < 8; m++) rels.push(reader.readInt32());
        // Open flags (8 bytes per operator)
        for (let m = 0; m < 8; m++) reader.readUint8();
        extOpMacroLens.push(lens);
        extOpMacroLoops.push(loops);
        extOpMacroRels.push(rels);
      }

      // Values (unsigned char) — read per-operator, per-macro
      // Reference: instrument.cpp:3810-3845
      for (let op = 0; op < 4; op++) {
        for (let m = 0; m < 8; m++) {
          const len = extOpMacroLens[op][m];
          const vals: number[] = [];
          for (let j = 0; j < len; j++) vals.push(reader.readUint8());
          if (len > 0) {
            inst.opMacroArrays[op].push({
              code: 12 + m, length: len, loop: extOpMacroLoops[op][m],
              release: extOpMacroRels[op][m], mode: 0, type: 0, delay: 0, speed: 1, data: vals,
            });
          }
        }
      }
    }

    // ========================================================================
    // OPL drum data (v63+) — Reference: instrument.cpp:3267-3274
    // ========================================================================
    if (instVersion >= 63) {
      const fixedDrums = reader.readUint8();
      reader.readUint8(); // reserved
      const kickFreq = reader.readInt16();
      const snareHatFreq = reader.readInt16();
      const tomTopFreq = reader.readInt16();
      if (inst.fm) {
        (inst.fm as any).fixedDrums = !!fixedDrums;
        (inst.fm as any).kickFreq = kickFreq;
        (inst.fm as any).snareHatFreq = snareHatFreq;
        (inst.fm as any).tomTopFreq = tomTopFreq;
      }
    }

    // ========================================================================
    // Sample map (v67+) — Reference: instrument.cpp:3290-3307
    // ========================================================================
    if (instVersion >= 67) {
      const useNoteMap = reader.readUint8() !== 0;
      if (inst.amiga) inst.amiga.useNoteMap = useNoteMap;
      if (useNoteMap) {
        const noteFreqs: number[] = [];
        for (let note = 0; note < 120; note++) noteFreqs.push(reader.readInt32());
        const noteMaps: number[] = [];
        for (let note = 0; note < 120; note++) noteMaps.push(reader.readInt16());

        if (inst.amiga) {
          inst.amiga.noteMap = [];
          const seenSamples = new Set(inst.samples);
          for (let note = 0; note < 120; note++) {
            // v152+: noteFreqs are actual freqs; <152: overwritten with note index
            const freq = instVersion < 152 ? note : noteFreqs[note];
            const map = noteMaps[note];
            inst.amiga.noteMap.push({ freq, map });
            if (map >= 0 && !seenSamples.has(map)) {
              seenSamples.add(map);
              inst.samples.push(map);
            }
          }
        }
      }
    }

    // ========================================================================
    // N163 (v73+) — Reference: instrument.cpp:3309-3316
    // ========================================================================
    if (instVersion >= 73) {
      const n163wave = reader.readInt32();
      const n163wavePos = reader.readUint8();
      const n163waveLen = reader.readUint8();
      const n163waveMode = reader.readUint8();
      reader.readUint8(); // reserved
      inst.n163 = { wave: n163wave, wavePos: n163wavePos, waveLen: n163waveLen, waveMode: n163waveMode };
    }

    // ========================================================================
    // Extended macros (v76+) — Reference: instrument.cpp:3318-3363
    // panL, panR, phaseReset, ex4, ex5, ex6, ex7, ex8
    // ========================================================================
    if (instVersion >= 76) {
      const extMacroNames = [
        { code: 12, name: 'panL' }, { code: 13, name: 'panR' },
        { code: 14, name: 'phaseReset' }, { code: 15, name: 'ex4' },
        { code: 16, name: 'ex5' }, { code: 17, name: 'ex6' },
        { code: 18, name: 'ex7' }, { code: 19, name: 'ex8' },
      ];

      // Lengths
      const extLens: number[] = [];
      for (let i = 0; i < 8; i++) extLens.push(reader.readInt32());
      // Loops
      const extLoops: number[] = [];
      for (let i = 0; i < 8; i++) extLoops.push(reader.readInt32());
      // Release points
      const extRels: number[] = [];
      for (let i = 0; i < 8; i++) extRels.push(reader.readInt32());
      // Open flags
      for (let i = 0; i < 8; i++) reader.readUint8();

      // Values (int32 each, READ_MACRO_VALS)
      for (let i = 0; i < 8; i++) {
        const vals = readMacroVals(extLens[i]);
        if (extLens[i] > 0) {
          inst.macros.push({
            code: extMacroNames[i].code, length: extLens[i], loop: extLoops[i],
            release: extRels[i], mode: 0, type: 0, delay: 0, speed: 1, data: vals,
          });
        }
      }

      // FDS data — Reference: instrument.cpp:3365-3373
      const fdsModSpeed = reader.readInt32();
      const fdsModDepth = reader.readInt32();
      const fdsInitMod = reader.readUint8() !== 0;
      reader.readUint8(); // reserved
      reader.readUint8(); // reserved
      reader.readUint8(); // reserved
      const fdsModTable: number[] = [];
      for (let i = 0; i < 32; i++) fdsModTable.push(reader.readInt8());
      inst.fds = { modSpeed: fdsModSpeed, modDepth: fdsModDepth, initModTableWithFirstWave: fdsInitMod, modTable: fdsModTable };
    }

    // ========================================================================
    // OPZ data (v77+) — Reference: instrument.cpp:3376-3379
    // ========================================================================
    if (instVersion >= 77) {
      const fms2 = reader.readUint8();
      const ams2 = reader.readUint8();
      if (inst.fm) {
        inst.fm.fms2 = fms2;
        inst.fm.ams2 = ams2;
      }
    }

    // ========================================================================
    // Wave Synth (v79+) — Reference: instrument.cpp:3381-3394
    // ========================================================================
    if (instVersion >= 79) {
      reader.readInt32();  // ws.wave1
      reader.readInt32();  // ws.wave2
      reader.readUint8();  // ws.rateDivider
      reader.readUint8();  // ws.effect
      reader.readUint8();  // ws.enabled
      reader.readUint8();  // ws.global
      reader.readUint8();  // ws.speed
      reader.readUint8();  // ws.param1
      reader.readUint8();  // ws.param2
      reader.readUint8();  // ws.param3
      reader.readUint8();  // ws.param4
    }

    // ========================================================================
    // Macro modes (v84+) — Reference: instrument.cpp:3396-3417
    // ========================================================================
    if (instVersion >= 84) {
      // 19 mode bytes: vol, duty, wave, pitch, ex1-3, alg, fb, fms, ams, panL, panR, phaseReset, ex4-8
      const macroModes: { code: number; mode: number }[] = [
        { code: 0, mode: reader.readUint8() },   // vol
        { code: 2, mode: reader.readUint8() },   // duty
        { code: 3, mode: reader.readUint8() },   // wave
        { code: 4, mode: reader.readUint8() },   // pitch
        { code: 5, mode: reader.readUint8() },   // ex1
        { code: 6, mode: reader.readUint8() },   // ex2
        { code: 7, mode: reader.readUint8() },   // ex3
        { code: 8, mode: reader.readUint8() },   // alg
        { code: 9, mode: reader.readUint8() },   // fb
        { code: 10, mode: reader.readUint8() },  // fms
        { code: 11, mode: reader.readUint8() },  // ams
        { code: 12, mode: reader.readUint8() },  // panL
        { code: 13, mode: reader.readUint8() },  // panR
        { code: 14, mode: reader.readUint8() },  // phaseReset
        { code: 15, mode: reader.readUint8() },  // ex4
        { code: 16, mode: reader.readUint8() },  // ex5
        { code: 17, mode: reader.readUint8() },  // ex6
        { code: 18, mode: reader.readUint8() },  // ex7
        { code: 19, mode: reader.readUint8() },  // ex8
      ];
      for (const mm of macroModes) {
        const macro = inst.macros.find(m => m.code === mm.code);
        if (macro) macro.mode = mm.mode;
      }
    }

    // ========================================================================
    // C64 noTest (v89+) — Reference: instrument.cpp:3419-3422
    // ========================================================================
    if (instVersion >= 89) {
      const noTest = reader.readUint8() !== 0;
      if (inst.c64) inst.c64.noTest = noTest;
    }

    // ========================================================================
    // MultiPCM (v93+) — Reference: instrument.cpp:3424-3437
    // ========================================================================
    if (instVersion >= 93) {
      // 9 parameter bytes + 23 reserved = 32 bytes total
      for (let k = 0; k < 32; k++) reader.readUint8();
    }

    // ========================================================================
    // Sound Unit (v104+) — Reference: instrument.cpp:3439-3443
    // ========================================================================
    if (instVersion >= 104) {
      const useSample = reader.readUint8() !== 0;
      reader.readUint8(); // su.switchRoles
      if (inst.amiga) inst.amiga.useSample = useSample;
    }

    // ========================================================================
    // GB hardware sequence (v105+) — Reference: instrument.cpp:3445-3452
    // ========================================================================
    if (instVersion >= 105) {
      const gbHwSeqLen = reader.readUint8();
      const gbHwSeq: Array<{ cmd: number; data: number }> = [];
      for (let i = 0; i < gbHwSeqLen; i++) {
        const cmd = reader.readUint8();
        const data = reader.readInt16();
        gbHwSeq.push({ cmd, data });
      }
      if (inst.gb) {
        inst.gb.hwSeqLen = gbHwSeqLen;
        inst.gb.hwSeq = gbHwSeq;
      }
    }

    // ========================================================================
    // GB additional flags (v106+) — Reference: instrument.cpp:3454-3458
    // ========================================================================
    if (instVersion >= 106) {
      const gbSoftEnv = reader.readUint8() !== 0;
      const gbAlwaysInit = reader.readUint8() !== 0;
      if (inst.gb) {
        inst.gb.softEnv = gbSoftEnv;
        inst.gb.alwaysInit = gbAlwaysInit;
      }
    }

    // ========================================================================
    // ES5506 (v107+) — Reference: instrument.cpp:3460-3472
    // ========================================================================
    if (instVersion >= 107) {
      // filter mode(1) + k1(2) + k2(2) + ecount(2) + lVRamp(1) + rVRamp(1) + k1Ramp(1) + k2Ramp(1) + k1Slow(1) + k2Slow(1) = 13 bytes
      for (let k = 0; k < 13; k++) reader.readUint8();
    }

    // ========================================================================
    // SNES (v109+) — Reference: instrument.cpp:3474-3491
    // ========================================================================
    if (instVersion >= 109) {
      const snesUseEnv = reader.readUint8() !== 0;
      if (instVersion < 118) {
        reader.readUint8(); // reserved
        reader.readUint8(); // reserved
      } else {
        const snesGainMode = reader.readUint8();
        const snesGain = reader.readUint8();
        if (inst.snes) {
          inst.snes.gainMode = snesGainMode;
          inst.snes.gain = snesGain;
        }
      }
      const snesA = reader.readUint8();
      const snesD = reader.readUint8();
      const snesS = reader.readUint8();
      const snesSus = (snesS & 8) ? 1 : 0;
      const snesSClean = snesS & 7;
      const snesR = reader.readUint8();
      inst.snes = {
        a: snesA, d: snesD, s: snesSClean, r: snesR,
        useEnv: snesUseEnv, sus: snesSus,
        gainMode: inst.snes?.gainMode ?? 0,
        gain: inst.snes?.gain ?? 0,
        d2: 0,
      };
    }

    // ========================================================================
    // Macro speed/delay (v111+) — Reference: instrument.cpp:3493-3583
    // ========================================================================
    if (instVersion >= 111) {
      // Speed bytes for standard macros (20 bytes)
      const speedCodes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const speeds: number[] = [];
      for (let i = 0; i < 20; i++) speeds.push(reader.readUint8());

      // Delay bytes for standard macros (20 bytes)
      const delays: number[] = [];
      for (let i = 0; i < 20; i++) delays.push(reader.readUint8());

      // Apply speed/delay to existing macros
      for (let i = 0; i < 20; i++) {
        const macro = inst.macros.find(m => m.code === speedCodes[i]);
        if (macro) {
          macro.speed = speeds[i];
          macro.delay = delays[i];
        }
      }

      // Op macro speed/delay: 4 operators × 20 macros each (12 base + 8 extended)
      // Reference: instrument.cpp:3537-3582
      for (let op = 0; op < 4; op++) {
        const opSpeeds: number[] = [];
        for (let m = 0; m < 20; m++) opSpeeds.push(reader.readUint8());
        const opDelays: number[] = [];
        for (let m = 0; m < 20; m++) opDelays.push(reader.readUint8());

        if (inst.opMacroArrays && inst.opMacroArrays[op]) {
          for (const opMacro of inst.opMacroArrays[op]) {
            const idx = opMacro.code;
            if (idx < 20) {
              opMacro.speed = opSpeeds[idx];
              opMacro.delay = opDelays[idx];
            }
          }
        }
      }
    }

    console.log(`[FurnaceParser] INST old format complete: ${inst.macros.length} macros, ${inst.opMacroArrays ? inst.opMacroArrays.map(a => a.length).join('/') : '0/0/0/0'} op macros`);
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

  // Reference: instrument.cpp:1766-1769 — block field (v224+, always present in new format writer)
  const blockByte = reader.readUint8();
  config.block = blockByte & 0x0F;

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
 * Encode a parsed FurnaceInstrument back into INS2 binary format.
 *
 * The C++ loader at FurnaceDispatchWrapper.cpp::furnace_dispatch_load_ins2() expects:
 *   Magic "INS2" (4 bytes) + blockLen (4 bytes, uint32) + version (2 bytes, uint16)
 *   + insType (1 byte) + reserved (1 byte) + feature blocks + "EN" terminator.
 *
 * Each feature block: 2-char code + 2-byte length + data.
 */
export function encodeInstrumentAsINS2(inst: FurnaceInstrument, formatVersion: number): Uint8Array {
  // Pre-allocate generous buffer; we'll slice at the end
  const buf = new ArrayBuffer(65536);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let pos = 0;

  // Helper: write bytes
  const writeUint8 = (v: number) => { view.setUint8(pos, v & 0xFF); pos += 1; };
  const writeInt8 = (v: number) => { view.setInt8(pos, v); pos += 1; };
  const writeUint16 = (v: number) => { view.setUint16(pos, v & 0xFFFF, true); pos += 2; };
  const writeInt16 = (v: number) => { view.setInt16(pos, v, true); pos += 2; };
  const writeUint32 = (v: number) => { view.setUint32(pos, v >>> 0, true); pos += 4; };
  const writeInt32 = (v: number) => { view.setInt32(pos, v, true); pos += 4; };
  const writeAscii = (s: string) => { for (let i = 0; i < s.length; i++) { u8[pos++] = s.charCodeAt(i); } };

  // Helper: start a feature block, returns position of the length field to patch later
  const startFeature = (code: string): number => {
    writeAscii(code);
    const lenPos = pos;
    writeUint16(0); // placeholder for length
    return lenPos;
  };
  // Helper: finish a feature block by patching its length
  const endFeature = (lenPos: number) => {
    const featDataStart = lenPos + 2;
    const featLen = pos - featDataStart;
    view.setUint16(lenPos, featLen, true);
  };

  // ── Header ──
  // Magic "INS2"
  writeAscii('INS2');
  const blockLenPos = pos;
  writeUint32(0); // placeholder for block length (patched at end)
  // Version — use the provided formatVersion (clamped to uint16)
  const version = Math.min(formatVersion, 65535);
  writeUint16(version);
  // Instrument type
  writeUint8(inst.type & 0xFF);
  // Reserved
  writeUint8(0);

  // ── NA: Name ──
  if (inst.name && inst.name.length > 0) {
    const lenPos = startFeature('NA');
    // Name: uint16 length + string bytes (no null terminator)
    const nameBytes = new TextEncoder().encode(inst.name);
    writeUint16(nameBytes.length);
    u8.set(nameBytes, pos);
    pos += nameBytes.length;
    endFeature(lenPos);
  }

  // ── FM: FM operator data ──
  if (inst.fm) {
    const fm = inst.fm;
    const lenPos = startFeature('FM');

    const opCount = fm.operators.length;
    // Byte 0: opCount (low nibble) + operator enable flags (high nibble)
    let opCountByte = opCount & 0x0F;
    for (let i = 0; i < Math.min(opCount, 4); i++) {
      if (fm.operators[i].enabled) opCountByte |= (1 << (i + 4));
    }
    writeUint8(opCountByte);

    // Byte 1: alg(bits 6-4) + fb(bits 2-0)
    writeUint8(((fm.algorithm & 7) << 4) | (fm.feedback & 7));

    // Byte 2: fms2(bits 7-5) + ams(bits 4-3) + fms(bits 2-0)
    writeUint8((((fm.fms2 ?? 0) & 7) << 5) | (((fm.ams ?? 0) & 3) << 3) | ((fm.fms ?? 0) & 7));

    // Byte 3: ams2(bits 7-6) + ops(bit 5: 4 if set, 2 if clear) + opllPreset(bits 4-0)
    const opsFlag = (fm.ops ?? opCount) >= 4 ? 32 : 0;
    writeUint8((((fm.ams2 ?? 0) & 3) << 6) | opsFlag | ((fm.opllPreset ?? 0) & 31));

    // Byte 4 (version >= 224): block(bits 3-0)
    // Only write if version >= 224, to match what the WASM reader expects.
    // If written for v<224, the WASM skips reading it but operators start there → 1-byte misalignment.
    if (version >= 224) {
      writeUint8((fm.block ?? 0) & 0x0F);
    }

    // Operators: 8 bytes each, bit-packed (matching C++ reader exactly)
    for (let i = 0; i < opCount && i < 4; i++) {
      const op = fm.operators[i];
      // Byte 0: ksr(7) + dt(6-4) + mult(3-0)
      writeUint8(((op.ksr ? 1 : 0) << 7) | (((op.dt ?? 0) & 7) << 4) | ((op.mult ?? 0) & 0x0F));
      // Byte 1: sus(7) + tl(6-0)
      writeUint8(((op.sus ? 1 : 0) << 7) | ((op.tl ?? 0) & 0x7F));
      // Byte 2: rs(7-6) + vib(5) + ar(4-0)
      writeUint8((((op.rs ?? 0) & 3) << 6) | ((op.vib ? 1 : 0) << 5) | ((op.ar ?? 0) & 0x1F));
      // Byte 3: am(7) + ksl(6-5) + dr(4-0)
      writeUint8(((op.am ? 1 : 0) << 7) | (((op.ksl ?? 0) & 3) << 5) | ((op.dr ?? 0) & 0x1F));
      // Byte 4: egt(7) + kvs(6-5) + d2r(4-0)
      writeUint8(((op.egt ? 1 : 0) << 7) | (((op.kvs ?? 0) & 3) << 5) | ((op.d2r ?? 0) & 0x1F));
      // Byte 5: sl(7-4) + rr(3-0)
      writeUint8((((op.sl ?? 0) & 0x0F) << 4) | ((op.rr ?? 0) & 0x0F));
      // Byte 6: dvb(7-4) + ssgEnv(3-0)
      writeUint8((((op.dvb ?? 0) & 0x0F) << 4) | ((op.ssg ?? 0) & 0x0F));
      // Byte 7: dam(7-5) + dt2(4-3) + ws(2-0)
      writeUint8((((op.dam ?? 0) & 7) << 5) | (((op.dt2 ?? 0) & 3) << 3) | ((op.ws ?? 0) & 7));
    }

    endFeature(lenPos);
  }

  // ── MA: Macros ──
  if (inst.macros.length > 0) {
    const lenPos = startFeature('MA');

    // Header length = 8 (code, len, loop, rel, mode, wordSize|open, delay, speed)
    const macroHeaderLen = 8;
    writeUint16(macroHeaderLen);

    for (const macro of inst.macros) {
      // Determine word size for this macro's values
      const wordSize = getWordSizeForMacro(macro);

      // Header: code(1), len(1), loop(1), rel(1), mode(1), (wordSize<<6|open)(1), delay(1), speed(1)
      writeUint8(macro.code);
      writeUint8(Math.min(macro.length, 255));
      writeUint8(macro.loop & 0xFF);
      writeUint8(macro.release & 0xFF);
      writeUint8(macro.mode & 0xFF);
      // The 'type' field from parsing stores raw (wordSize<<6 | open) byte.
      // If we have the original type field, use the open bits from it; otherwise default open=1.
      const openBits = (macro.type & 0x0F) || 1; // open flags (low nibble)
      writeUint8((wordSize << 6) | (openBits & 0x0F));
      writeUint8(macro.delay & 0xFF);
      writeUint8(macro.speed & 0xFF);

      // Values
      const len = Math.min(macro.length, macro.data.length);
      for (let i = 0; i < len; i++) {
        const val = macro.data[i];
        switch (wordSize) {
          case 0: writeUint8(val & 0xFF); break;          // unsigned byte
          case 1: writeInt8(val); break;                    // signed byte
          case 2: writeInt16(val); break;                   // signed short
          default: writeInt32(val); break;                  // signed int
        }
      }
    }

    endFeature(lenPos);
  }

  // ── Ox: Operator macros ──
  if (inst.opMacroArrays) {
    for (let opIdx = 0; opIdx < 4; opIdx++) {
      const opMacros = inst.opMacroArrays[opIdx];
      if (!opMacros || opMacros.length === 0) continue;

      const code = 'O' + String.fromCharCode('1'.charCodeAt(0) + opIdx);
      const lenPos = startFeature(code);

      const macroHeaderLen = 8;
      writeUint16(macroHeaderLen);

      for (const macro of opMacros) {
        const wordSize = getWordSizeForMacro(macro);
        writeUint8(macro.code);
        writeUint8(Math.min(macro.length, 255));
        writeUint8(macro.loop & 0xFF);
        writeUint8(macro.release & 0xFF);
        writeUint8(macro.mode & 0xFF);
        const openBits = (macro.type & 0x0F) || 1;
        writeUint8((wordSize << 6) | (openBits & 0x0F));
        writeUint8(macro.delay & 0xFF);
        writeUint8(macro.speed & 0xFF);

        const len = Math.min(macro.length, macro.data.length);
        for (let i = 0; i < len; i++) {
          const val = macro.data[i];
          switch (wordSize) {
            case 0: writeUint8(val & 0xFF); break;
            case 1: writeInt8(val); break;
            case 2: writeInt16(val); break;
            default: writeInt32(val); break;
          }
        }
      }

      endFeature(lenPos);
    }
  }

  // ── GB: Game Boy ──
  if (inst.gb) {
    const gb = inst.gb;
    const lenPos = startFeature('GB');
    // Byte 0: envLen(7-5) + envDir(4) + envVol(3-0)
    writeUint8(((gb.envLen & 7) << 5) | ((gb.envDir ? 1 : 0) << 4) | (gb.envVol & 0x0F));
    // Byte 1: soundLen
    writeUint8(gb.soundLen & 0xFF);
    // Byte 2: flags — doubleWave(2) + alwaysInit(1) + softEnv(0)
    writeUint8((gb.doubleWave ? 4 : 0) | (gb.alwaysInit ? 2 : 0) | (gb.softEnv ? 1 : 0));
    // Byte 3: hwSeqLen
    writeUint8(gb.hwSeqLen & 0xFF);
    // Hardware sequence: cmd(1) + data(2) per entry
    for (let i = 0; i < gb.hwSeqLen && i < gb.hwSeq.length; i++) {
      writeUint8(gb.hwSeq[i].cmd);
      writeInt16(gb.hwSeq[i].data);
    }
    endFeature(lenPos);
  }

  // ── 64: C64 SID ──
  if (inst.c64) {
    const c = inst.c64;
    const lenPos = startFeature('64');
    // Byte 0: dutyIsAbs(7) + initFilter(6) + 0(5) + toFilter(4) + noiseOn(3) + pulseOn(2) + sawOn(1) + triOn(0)
    writeUint8(
      (c.dutyIsAbs ? 128 : 0) | (c.initFilter ? 64 : 0) |
      (c.toFilter ? 16 : 0) | (c.noiseOn ? 8 : 0) |
      (c.pulseOn ? 4 : 0) | (c.sawOn ? 2 : 0) | (c.triOn ? 1 : 0)
    );
    // Byte 1: oscSync(7) + ringMod(6) + noTest(5) + filterIsAbs(4) + ch3off(3) + bp(2) + hp(1) + lp(0)
    writeUint8(
      (c.oscSync ? 128 : 0) | (c.ringMod ? 64 : 0) | (c.noTest ? 32 : 0) |
      (c.filterIsAbs ? 16 : 0) | (c.ch3off ? 8 : 0) |
      (c.bp ? 4 : 0) | (c.hp ? 2 : 0) | (c.lp ? 1 : 0)
    );
    // Byte 2: A(7-4) + D(3-0)
    writeUint8(((c.a & 0x0F) << 4) | (c.d & 0x0F));
    // Byte 3: S(7-4) + R(3-0)
    writeUint8(((c.s & 0x0F) << 4) | (c.r & 0x0F));
    // Bytes 4-5: duty (16-bit LE, masked to 12 bits)
    writeUint16(c.duty & 0xFFF);
    // Bytes 6-7: cut(11-0) + res(15-12)
    writeUint16((c.cut & 0xFFF) | ((c.res & 0x0F) << 12));
    // Extra byte (v199+): high res bits + resetDuty flag
    writeUint8(((c.res >> 4) & 0x0F) | (c.resetDuty ? 0x10 : 0));
    endFeature(lenPos);
  }

  // ── SN: SNES ──
  if (inst.snes) {
    const s = inst.snes;
    const lenPos = startFeature('SN');
    // Byte 0: d(6-4) + a(3-0)
    writeUint8(((s.d & 7) << 4) | (s.a & 0x0F));
    // Byte 1: s(7-5) + r(4-0)
    writeUint8(((s.s & 7) << 5) | (s.r & 0x1F));
    // Byte 2: useEnv(4) + sus(3) + gainMode(2-0)
    writeUint8((s.useEnv ? 16 : 0) | ((s.sus & 1) << 3) | (s.gainMode & 7));
    // Byte 3: gain
    writeUint8(s.gain & 0xFF);
    // Byte 4 (v131+): sus(6-5) + d2(4-0)
    writeUint8(((s.sus & 3) << 5) | (s.d2 & 0x1F));
    endFeature(lenPos);
  }

  // ── N1: N163 ──
  if (inst.n163) {
    const n = inst.n163;
    const lenPos = startFeature('N1');
    writeInt32(n.wave);
    writeUint8(n.wavePos);
    writeUint8(n.waveLen);
    writeUint8(n.waveMode);
    writeUint8(n.perChanPos ? 1 : 0);
    endFeature(lenPos);
  }

  // ── FD: FDS ──
  if (inst.fds) {
    const f = inst.fds;
    const lenPos = startFeature('FD');
    writeInt32(f.modSpeed);
    writeInt32(f.modDepth);
    writeUint8(f.initModTableWithFirstWave ? 1 : 0);
    for (let i = 0; i < 32; i++) {
      writeInt8(f.modTable[i] ?? 0);
    }
    endFeature(lenPos);
  }

  // ── SM: Sample mapping ──
  if (inst.amiga && (inst.amiga.useSample || inst.amiga.useWave)) {
    const a = inst.amiga;
    const lenPos = startFeature('SM');
    // initSample (int16)
    writeInt16(a.initSample);
    // flags: useWave(2) + useSample(1) + useNoteMap(0)
    writeUint8((a.useWave ? 4 : 0) | (a.useSample ? 2 : 0) | (a.useNoteMap ? 1 : 0));
    // waveLen
    writeUint8(a.waveLen & 0xFF);
    // Note map: 120 entries × (freq:int16 + map:int16)
    if (a.useNoteMap && a.noteMap) {
      for (let note = 0; note < 120; note++) {
        const entry = a.noteMap[note];
        writeInt16(entry?.freq ?? note);
        writeInt16(entry?.map ?? -1);
      }
    }
    endFeature(lenPos);
  }

  // ── ES: ES5506 ──
  if (inst.es5506) {
    const e = inst.es5506;
    const lenPos = startFeature('ES');
    writeUint8(e.filter.mode);
    writeUint16(e.filter.k1);
    writeUint16(e.filter.k2);
    writeUint16(e.envelope.ecount);
    writeInt8(e.envelope.lVRamp);
    writeInt8(e.envelope.rVRamp);
    writeInt8(e.envelope.k1Ramp);
    writeInt8(e.envelope.k2Ramp);
    writeUint8(e.envelope.k1Slow ? 1 : 0);
    writeUint8(e.envelope.k2Slow ? 1 : 0);
    endFeature(lenPos);
  }

  // ── MP: MultiPCM ──
  if (inst.multipcm) {
    const m = inst.multipcm;
    const lenPos = startFeature('MP');
    writeUint8(m.ar); writeUint8(m.d1r); writeUint8(m.dl); writeUint8(m.d2r);
    writeUint8(m.rr); writeUint8(m.rc); writeUint8(m.lfo); writeUint8(m.vib); writeUint8(m.am);
    writeUint8((m.damp ? 1 : 0) | (m.pseudoReverb ? 2 : 0) | (m.lfoReset ? 4 : 0) | (m.levelDirect ? 8 : 0));
    endFeature(lenPos);
  }

  // ── SU: Sound Unit ──
  if (inst.soundUnit) {
    const su = inst.soundUnit;
    const lenPos = startFeature('SU');
    writeUint8(su.switchRoles ? 1 : 0);
    writeUint8(su.hwSeqLen);
    for (let i = 0; i < su.hwSeqLen && i < su.hwSeq.length; i++) {
      writeUint8(su.hwSeq[i].cmd);
      writeUint8(su.hwSeq[i].bound);
      writeUint8(su.hwSeq[i].val);
      writeInt16(su.hwSeq[i].speed);
    }
    endFeature(lenPos);
  }

  // ── EF: ESFM ──
  if (inst.esfm) {
    const ef = inst.esfm;
    const lenPos = startFeature('EF');
    writeUint8(ef.noise & 3);
    for (let i = 0; i < 4 && i < ef.operators.length; i++) {
      const op = ef.operators[i];
      // Byte 0: delay(7-5) + outLvl(4-2) + right(1) + left(0)
      writeUint8(((op.delay & 7) << 5) | ((op.outLvl & 7) << 2) | ((op.right & 1) << 1) | (op.left & 1));
      // Byte 1: fixed(3) + modIn(2-0)
      writeUint8(((op.fixed & 1) << 3) | (op.modIn & 7));
      writeInt8(op.ct);
      writeInt8(op.dt);
    }
    endFeature(lenPos);
  }

  // ── PN: PowerNoise ──
  if (inst.powerNoise) {
    const lenPos = startFeature('PN');
    writeUint8(inst.powerNoise.octave);
    endFeature(lenPos);
  }

  // ── S2: SID2 ──
  if (inst.sid2) {
    const s = inst.sid2;
    const lenPos = startFeature('S2');
    writeUint8((s.volume & 0x0F) | ((s.mixMode & 3) << 4) | ((s.noiseMode & 3) << 6));
    endFeature(lenPos);
  }

  // ── WS: WaveSynth (encode from raw type field if present on fm) ──
  // WaveSynth data is preserved in rawBinaryData for INS2 instruments;
  // for INST instruments it's parsed but not stored on the FurnaceInstrument interface.
  // If needed in the future, add ws?: FurnaceWaveSynthData to the interface.

  // ── EN: End marker ──
  writeAscii('EN');

  // Patch block length: everything after the 8-byte header (magic + blockLen)
  const blockLen = pos - 8;
  view.setUint32(blockLenPos, blockLen >>> 0, true);

  return new Uint8Array(buf, 0, pos);
}

/**
 * Determine the appropriate word size for encoding a macro's values.
 *
 * Word sizes (matching C++ reader):
 *   0 = unsigned byte (0-255)
 *   1 = signed byte (-128 to 127)
 *   2 = signed short (-32768 to 32767)
 *   3 = signed int32
 *
 * For macros parsed from INS2 format, the original word size is stored in macro.type bits 6-7.
 * For macros parsed from old INST format (where values were int32), we need to determine
 * the smallest word size that fits all values.
 *
 * Macro codes that typically need signed values: arp(1), pitch(4).
 */
function getWordSizeForMacro(macro: FurnaceMacro): number {
  // If the type field already has word size bits set from INS2 parsing, use them
  const storedWordSize = (macro.type >> 6) & 3;
  // If storedWordSize is non-zero, it was explicitly set during parsing — trust it
  if (storedWordSize !== 0) return storedWordSize;

  // For macros from old INST format (all values were int32), determine best fit
  if (macro.data.length === 0) return 0;

  let minVal = 0;
  let maxVal = 0;
  for (const v of macro.data) {
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  // Signed macros: arp(1), pitch(4) — these commonly have negative values
  const signedCodes = new Set([1, 4]);
  const needsSigned = signedCodes.has(macro.code) || minVal < 0;

  if (needsSigned) {
    if (minVal >= -128 && maxVal <= 127) return 1;       // signed byte
    if (minVal >= -32768 && maxVal <= 32767) return 2;    // signed short
    return 3;                                              // signed int32
  } else {
    if (maxVal <= 255) return 0;                           // unsigned byte
    if (maxVal <= 32767) return 2;                         // signed short (fits unsigned 0-32767)
    return 3;                                              // signed int32
  }
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
