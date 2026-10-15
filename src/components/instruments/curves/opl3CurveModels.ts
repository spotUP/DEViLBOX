/**
 * opl3CurveModels.ts - the OPL3 (YMF262) operator envelope, as the Nuked OPL3 core in public/opl3/OPL3.wasm plays it.
 *
 * Port of OPL3_EnvelopeCalc / OPL3_EnvelopeUpdateKSL and the chip's envelope timer
 * (third-party/retromulator/source/opl3Lib/opl3.c: kslrom, kslshift, eg_incstep, OPL3_EnvelopeCalc, the eg_timer
 * block at the end of OPL3_Generate4Ch). The chip runs one envelope step per chip sample, 49716 Hz; this module
 * steps the same state machine, so the curve is the engine's own rate table and not a textbook ADSR. The test
 * (opl3CurveModels.test.ts) compares it with the attenuation the WASM reports for a sounding voice.
 *
 * Units: `rout` is Nuked's eg_rout, 0 (full volume) .. 0x1FF (silent), 1/32 octave of amplitude per unit
 * (the exp table is fed `envelope << 3` in 1/256 octave steps). Total attenuation adds the operator's total level
 * (reg_tl << 2) and the key scale level.
 */
import { spectrumLines, type SpectrumLine } from './spectrumMath';

export const OPL_CHIP_RATE = 49716;
/** Envelope stages, Nuked's envelope_gen_num. */
export const OplStage = { Attack: 0, Decay: 1, Sustain: 2, Release: 3 } as const;
export type OplStageValue = (typeof OplStage)[keyof typeof OplStage];

const KSL_ROM = [0, 32, 40, 45, 48, 51, 53, 55, 56, 58, 59, 60, 61, 62, 63, 64] as const;
const KSL_SHIFT = [8, 1, 2, 0] as const;
const EG_INC_STEP = [[0, 0, 0, 0], [1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 0]] as const;
const ROUT_MAX = 0x1ff;

export interface OplSlotParams {
  /** Register values: attack rate, decay rate, release rate 0..15 and sustain level 0..15. */
  attack: number;
  decay: number;
  sustainLevel: number;
  release: number;
  /** Key scale rate bit (reg_ksr) and the sustain-hold bit (reg_type, 1 = hold while the key is down). */
  ksr: number;
  sustainHold: number;
  /** Total level register, 0 (loud) .. 63 (quiet): the attenuation, NOT the layout's inverted Level knob. */
  totalLevel: number;
  /** Key scale level register 0..3. */
  ksl: number;
}

export interface OplPitch { fnum: number; block: number; nts?: number }

/** The F-number and block the bridge writes for a MIDI note (noteToFnumBlock in juce-wasm/opl3/opl3_bridge.cpp). */
export function oplFnumBlock(note: number, semitones = 0): OplPitch {
  const freq = 440 * 2 ** ((note - 69 + semitones) / 12);
  let block = 4;
  let fnum = (freq * (1 << (20 - block))) / 49716;
  while (fnum > 1023 && block < 7) { block++; fnum /= 2; }
  while (fnum < 0.5 && block > 0) { block--; fnum *= 2; }
  return { fnum: Math.min(1023, Math.max(0, Math.trunc(fnum + 0.5))), block };
}

/** Channel key scale value (channel->ksv). */
export const oplKsv = (p: OplPitch): number => (p.block << 1) | ((p.fnum >> (9 - (p.nts ?? 0))) & 1);

/** The key scale level attenuation in rout units for a slot (eg_ksl >> kslshift[reg_ksl]). */
export function oplKslAttenuation(p: OplPitch, ksl: number): number {
  const raw = (KSL_ROM[p.fnum >> 6] << 2) - ((8 - p.block) << 5);
  return (raw < 0 ? 0 : raw & 0xff) >> KSL_SHIFT[ksl & 3];
}

/** Amplitude 0..1 of an attenuation in rout units (1/32 octave per unit). */
export const oplAmplitude = (attenuation: number): number => 2 ** (-attenuation / 32);

/** One slot's envelope generator with the chip-wide envelope timer, stepped one chip sample at a time. */
export class OplEnvelopeSim {
  rout = ROUT_MAX;
  stage: OplStageValue = OplStage.Release;
  key = false;
  // chip-wide envelope timer state (opl3_chip eg_*), identical for every slot
  private egTimer = 0;
  private egState = 0;
  private egAdd = 0;
  private egTimerLo = 0;
  private egTimerRem = 0;
  private readonly ksv: number;
  private readonly p: OplSlotParams;

  constructor(p: OplSlotParams, pitch: OplPitch) {
    this.p = p;
    this.ksv = oplKsv(pitch);
  }

  /** One chip sample: OPL3_EnvelopeCalc for the slot, then the chip's envelope timer step. */
  step(): void {
    const p = this.p;
    let regRate = 0;
    let reset = false;
    if (this.key && this.stage === OplStage.Release) {
      reset = true;
      regRate = p.attack;
    } else if (this.stage === OplStage.Attack) regRate = p.attack;
    else if (this.stage === OplStage.Decay) regRate = p.decay;
    else if (this.stage === OplStage.Sustain) { if (!p.sustainHold) regRate = p.release; }
    else regRate = p.release;

    const ks = this.ksv >> ((p.ksr ^ 1) << 1);
    const nonzero = regRate !== 0;
    const rate = ks + (regRate << 2);
    let rateHi = rate >> 2;
    const rateLo = rate & 3;
    if (rateHi & 0x10) rateHi = 0x0f;
    const egShift = rateHi + this.egAdd;
    let shift = 0;
    if (nonzero) {
      if (rateHi < 12) {
        if (this.egState) {
          if (egShift === 12) shift = 1;
          else if (egShift === 13) shift = (rateLo >> 1) & 1;
          else if (egShift === 14) shift = rateLo & 1;
        }
      } else {
        shift = (rateHi & 3) + EG_INC_STEP[rateLo][this.egTimerLo];
        if (shift & 4) shift = 3;
        if (!shift) shift = this.egState;
      }
    }

    let routNext = this.rout;
    let inc = 0;
    let off = false;
    if (reset && rateHi === 0x0f) routNext = 0;
    if ((this.rout & 0x1f8) === 0x1f8) off = true;
    if (this.stage !== OplStage.Attack && !reset && off) routNext = ROUT_MAX;

    if (this.stage === OplStage.Attack) {
      if (!this.rout) this.stage = OplStage.Decay;
      else if (this.key && shift > 0 && rateHi !== 0x0f) inc = ~this.rout >> (4 - shift);
    } else if (this.stage === OplStage.Decay) {
      if (this.rout >> 4 === p.sustainLevel) this.stage = OplStage.Sustain;
      else if (!off && !reset && shift > 0) inc = 1 << (shift - 1);
    } else if (!off && !reset && shift > 0) inc = 1 << (shift - 1);
    this.rout = (routNext + inc) & ROUT_MAX;

    if (reset) this.stage = OplStage.Attack;
    if (!this.key) this.stage = OplStage.Release;

    // chip->eg_* timer, end of OPL3_Generate4Ch
    if (this.egState) {
      let s = 0;
      while (s < 13 && ((this.egTimer >> s) & 1) === 0) s++;
      this.egAdd = s > 12 ? 0 : s + 1;
      this.egTimerLo = this.egTimer & 3;
    }
    if (this.egTimerRem || this.egState) {
      this.egTimer++;
      this.egTimerRem = 0;
    }
    this.egState ^= 1;
  }
}

export interface OplEnvelopeCurve {
  /** Seconds and total attenuation (rout + total level + key scale) at each sample point. */
  points: Array<{ x: number; attenuation: number; rout: number; stage: OplStageValue }>;
  /** Seconds at which the key goes up. */
  releaseAtSeconds: number;
  /** Seconds at which the envelope has decayed to the sustain level (or the end of the hold if it never does). */
  sustainReachedSeconds: number;
  totalSeconds: number;
}

const MAX_SIM_SECONDS = 24;
const POINTS_PER_SECOND = 180;
const MIN_POINT_SPACING_SAMPLES = 24;

/**
 * The full envelope of one note: key down until the envelope has settled (plus a hold so the sustain level is
 * visible), then key up until it is silent or the window ends.
 */
export function oplEnvelopeCurve(p: OplSlotParams, pitch: OplPitch): OplEnvelopeCurve {
  const sim = new OplEnvelopeSim(p, pitch);
  const biasAttenuation = (p.totalLevel << 2) + oplKslAttenuation(pitch, p.ksl);
  const points: OplEnvelopeCurve['points'] = [];
  const stride = Math.max(MIN_POINT_SPACING_SAMPLES, Math.round(OPL_CHIP_RATE / POINTS_PER_SECOND));
  const record = (n: number) => points.push({ x: n / OPL_CHIP_RATE, attenuation: Math.min(ROUT_MAX + 252 + 127, sim.rout + biasAttenuation), rout: sim.rout, stage: sim.stage });

  sim.key = true;
  let n = 0;
  record(0);
  let sustainReached = -1;
  const maxSamples = MAX_SIM_SECONDS * OPL_CHIP_RATE;
  // key down: until the sustain stage is reached (or 8 s), then a hold of 40% of the time so far, at least 0.12 s
  let releaseAt = -1;
  while (n < maxSamples) {
    sim.step(); n++;
    if (n % stride === 0) record(n);
    if (sustainReached < 0 && (sim.stage === OplStage.Sustain || (sim.stage !== OplStage.Attack && (sim.rout & 0x1f8) === 0x1f8))) {
      sustainReached = n;
      releaseAt = n + Math.max(Math.round(0.12 * OPL_CHIP_RATE), Math.round(0.4 * n));
    }
    if (releaseAt >= 0 && n >= releaseAt) break;
    if (n >= 8 * OPL_CHIP_RATE && releaseAt < 0) { sustainReached = n; releaseAt = n + Math.round(0.12 * OPL_CHIP_RATE); }
  }
  if (releaseAt < 0) releaseAt = n;
  sim.key = false;
  while (n < maxSamples) {
    sim.step(); n++;
    if (n % stride === 0) record(n);
    if ((sim.rout & 0x1f8) === 0x1f8) { record(n); break; }
  }
  return {
    points,
    releaseAtSeconds: releaseAt / OPL_CHIP_RATE,
    sustainReachedSeconds: Math.max(0, sustainReached) / OPL_CHIP_RATE,
    totalSeconds: n / OPL_CHIP_RATE,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Operator waveforms, two-operator FM and its spectrum (OPL3_EnvelopeCalcSin0..7, OPL3_SlotGenerate, PhaseGenerate)
// ---------------------------------------------------------------------------------------------------------

/** logsinrom and exprom of opl3.c, verbatim. */
const LOGSIN_ROM = [
  2137, 1731, 1543, 1419, 1326, 1252, 1190, 1137, 1091, 1050, 1013, 979, 949, 920, 894, 869,
  846, 825, 804, 785, 767, 749, 732, 717, 701, 687, 672, 659, 646, 633, 621, 609,
  598, 587, 576, 566, 556, 546, 536, 527, 518, 509, 501, 492, 484, 476, 468, 461,
  453, 446, 439, 432, 425, 418, 411, 405, 399, 392, 386, 380, 375, 369, 363, 358,
  352, 347, 341, 336, 331, 326, 321, 316, 311, 307, 302, 297, 293, 289, 284, 280,
  276, 271, 267, 263, 259, 255, 251, 248, 244, 240, 236, 233, 229, 226, 222, 219,
  215, 212, 209, 205, 202, 199, 196, 193, 190, 187, 184, 181, 178, 175, 172, 169,
  167, 164, 161, 159, 156, 153, 151, 148, 146, 143, 141, 138, 136, 134, 131, 129,
  127, 125, 122, 120, 118, 116, 114, 112, 110, 108, 106, 104, 102, 100, 98, 96,
  94, 92, 91, 89, 87, 85, 83, 82, 80, 78, 77, 75, 74, 72, 70, 69,
  67, 66, 64, 63, 62, 60, 59, 57, 56, 55, 53, 52, 51, 49, 48, 47,
  46, 45, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30,
  29, 28, 27, 26, 25, 24, 23, 23, 22, 21, 20, 20, 19, 18, 17, 17,
  16, 15, 15, 14, 13, 13, 12, 12, 11, 10, 10, 9, 9, 8, 8, 7,
  7, 7, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2,
  2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
] as const;
const EXP_ROM = [
  2042, 2037, 2031, 2026, 2020, 2015, 2010, 2004, 1999, 1993, 1988, 1983, 1977, 1972, 1966, 1961,
  1956, 1951, 1945, 1940, 1935, 1930, 1924, 1919, 1914, 1909, 1904, 1898, 1893, 1888, 1883, 1878,
  1873, 1868, 1863, 1858, 1853, 1848, 1843, 1838, 1833, 1828, 1823, 1818, 1813, 1808, 1803, 1798,
  1794, 1789, 1784, 1779, 1774, 1769, 1765, 1760, 1755, 1750, 1746, 1741, 1736, 1732, 1727, 1722,
  1717, 1713, 1708, 1704, 1699, 1694, 1690, 1685, 1681, 1676, 1672, 1667, 1663, 1658, 1654, 1649,
  1645, 1640, 1636, 1631, 1627, 1623, 1618, 1614, 1609, 1605, 1601, 1596, 1592, 1588, 1584, 1579,
  1575, 1571, 1566, 1562, 1558, 1554, 1550, 1545, 1541, 1537, 1533, 1529, 1525, 1520, 1516, 1512,
  1508, 1504, 1500, 1496, 1492, 1488, 1484, 1480, 1476, 1472, 1468, 1464, 1460, 1456, 1452, 1448,
  1444, 1440, 1436, 1433, 1429, 1425, 1421, 1417, 1413, 1409, 1406, 1402, 1398, 1394, 1391, 1387,
  1383, 1379, 1376, 1372, 1368, 1364, 1361, 1357, 1353, 1350, 1346, 1342, 1339, 1335, 1332, 1328,
  1324, 1321, 1317, 1314, 1310, 1307, 1303, 1300, 1296, 1292, 1289, 1286, 1282, 1279, 1275, 1272,
  1268, 1265, 1261, 1258, 1255, 1251, 1248, 1244, 1241, 1238, 1234, 1231, 1228, 1224, 1221, 1218,
  1214, 1211, 1208, 1205, 1201, 1198, 1195, 1192, 1188, 1185, 1182, 1179, 1176, 1172, 1169, 1166,
  1163, 1160, 1157, 1154, 1150, 1147, 1144, 1141, 1138, 1135, 1132, 1129, 1126, 1123, 1120, 1117,
  1114, 1111, 1108, 1105, 1102, 1099, 1096, 1093, 1090, 1087, 1084, 1081, 1078, 1075, 1072, 1069,
  1066, 1064, 1061, 1058, 1055, 1052, 1049, 1046, 1044, 1041, 1038, 1035, 1032, 1030, 1027, 1024,
] as const;
const MULT_X2 = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 24, 24, 30, 30] as const;

const calcExp = (level: number): number => {
  const l = level > 0x1fff ? 0x1fff : level;
  return (EXP_ROM[l & 0xff] << 1) >> (l >> 8);
};

/** The signed operator output (about +-4084 at no attenuation) for a 10-bit phase, waveform 0..7 and envelope attenuation in rout units. */
export function oplWaveSample(wave: number, phaseIn: number, envelope: number): number {
  const phase = phaseIn & 0x3ff;
  const e = envelope << 3;
  switch (wave & 7) {
    case 0: {
      const out = phase & 0x100 ? LOGSIN_ROM[(phase & 0xff) ^ 0xff] : LOGSIN_ROM[phase & 0xff];
      const v = calcExp(out + e);
      return phase & 0x200 ? ~v : v;
    }
    case 1: {
      const out = phase & 0x200 ? 0x1000 : phase & 0x100 ? LOGSIN_ROM[(phase & 0xff) ^ 0xff] : LOGSIN_ROM[phase & 0xff];
      return calcExp(out + e);
    }
    case 2: return calcExp((phase & 0x100 ? LOGSIN_ROM[(phase & 0xff) ^ 0xff] : LOGSIN_ROM[phase & 0xff]) + e);
    case 3: return calcExp((phase & 0x100 ? 0x1000 : LOGSIN_ROM[phase & 0xff]) + e);
    case 4: {
      const out = phase & 0x200 ? 0x1000 : phase & 0x80 ? LOGSIN_ROM[((phase ^ 0xff) << 1) & 0xff] : LOGSIN_ROM[(phase << 1) & 0xff];
      const v = calcExp(out + e);
      return (phase & 0x300) === 0x100 ? ~v : v;
    }
    case 5: return calcExp((phase & 0x200 ? 0x1000 : phase & 0x80 ? LOGSIN_ROM[((phase ^ 0xff) << 1) & 0xff] : LOGSIN_ROM[(phase << 1) & 0xff]) + e);
    case 6: { const v = calcExp(e); return phase & 0x200 ? ~v : v; }
    default: {
      let ph = phase; let neg = false;
      if (ph & 0x200) { neg = true; ph = (ph & 0x1ff) ^ 0x1ff; }
      const v = calcExp((ph << 3) + e);
      return neg ? ~v : v;
    }
  }
}

/** Peak output of the operator pipeline with no attenuation (a full-scale carrier). */
export const OPL_FULL_SCALE = 4084;

export interface OplOperatorSim {
  wave: number; multiplier: number;
  /** Attenuation in rout units applied to the operator: envelope + total level + key scale (+ tremolo). */
  attenuation: number;
}

/**
 * Render a two-operator channel at a pitch: feedback on the modulator, FM (modulator into carrier) or additive.
 * Chip-rate samples (49716 Hz). Mirrors OPL3_ProcessSlot for slot 0 (modulator) then slot 3 (carrier).
 */
export function renderOplChannel(mod: OplOperatorSim, car: OplOperatorSim, feedback: number, additive: boolean, pitch: OplPitch, samples: number, warmup = 0): Float64Array {
  let modPhase = 0; let carPhase = 0;
  let modOut = 0; let modProut = 0; let fbmod = 0; let carOut = 0;
  const baseFreq = (pitch.fnum << pitch.block) >> 1;
  const modInc = (baseFreq * MULT_X2[mod.multiplier & 15]) >> 1;
  const carInc = (baseFreq * MULT_X2[car.multiplier & 15]) >> 1;
  const fb = Math.max(0, Math.min(7, Math.round(feedback)));
  const out = new Float64Array(samples);
  for (let n = 0; n < warmup + samples; n++) {
    // modulator slot
    fbmod = fb ? (modProut + modOut) >> (9 - fb) : 0;
    modProut = modOut;
    const mph = (modPhase >>> 9) & 0xffff;
    modPhase = (modPhase + modInc) >>> 0;
    modOut = oplWaveSample(mod.wave, mph + fbmod, mod.attenuation);
    // carrier slot
    const cph = (carPhase >>> 9) & 0xffff;
    carPhase = (carPhase + carInc) >>> 0;
    carOut = oplWaveSample(car.wave, cph + (additive ? 0 : modOut), car.attenuation);
    if (n >= warmup) out[n - warmup] = additive ? modOut + carOut : carOut;
  }
  return out;
}

/** Spectral lines (dB re a full-scale operator) of a two-operator patch at its loudest. */
export function oplSpectrum(mod: OplOperatorSim, car: OplOperatorSim, feedback: number, additive: boolean, pitch: OplPitch, maxHz = 8000): SpectrumLine[] {
  return spectrumLines(renderOplChannel(mod, car, feedback, additive, pitch, 4096, 2048), OPL_CHIP_RATE, OPL_FULL_SCALE, -80, maxHz);
}

/** Frequency of the channel in Hz (the chip's phase generator: fnum << block, 2^20 per sample cycle). */
export const oplChannelHz = (p: OplPitch): number => (p.fnum * 2 ** p.block * OPL_CHIP_RATE) / 2 ** 20;
/** Frequency of an operator: the channel frequency times its multiplier (0 = x0.5). */
export const oplOperatorHz = (p: OplPitch, multiplier: number): number => (oplChannelHz(p) * MULT_X2[multiplier & 15]) / 2;

// ---------------------------------------------------------------------------------------------------------
// Tremolo and vibrato (chip->tremolopos / vibpos, OPL3_PhaseGenerate)
// ---------------------------------------------------------------------------------------------------------

/** Tremolo period in chip samples: 210 positions, one step per 64 samples. */
export const OPL_TREMOLO_PERIOD_SAMPLES = 210 * 64;
/** Vibrato period in chip samples: 8 positions, one step per 1024 samples. */
export const OPL_VIBRATO_PERIOD_SAMPLES = 8 * 1024;
export const oplTremoloHz = (): number => OPL_CHIP_RATE / OPL_TREMOLO_PERIOD_SAMPLES;
export const oplVibratoHz = (): number => OPL_CHIP_RATE / OPL_VIBRATO_PERIOD_SAMPLES;

/** Tremolo attenuation in dB at a tremolo position 0..209 (shift 4 = 1 dB mode, shift 2 = 4.8 dB mode). */
export function oplTremoloDb(position: number, deepMode: boolean): number {
  const shift = deepMode ? 2 : 4;
  const t = position < 105 ? position >> shift : (210 - position) >> shift;
  return t * (6.0206 / 32);
}

/** Vibrato pitch deviation in cents at a vibrato position 0..7 for an F-number (shift 1 = 7 cent mode, 0 = 14 cent mode). */
export function oplVibratoCents(vibPos: number, fnum: number, deepMode: boolean): number {
  let range = (fnum >> 7) & 7;
  if (!(vibPos & 3)) range = 0;
  else if (vibPos & 1) range >>= 1;
  range >>= deepMode ? 0 : 1;
  if (vibPos & 4) range = -range;
  return fnum > 0 ? 1200 * Math.log2((fnum + range) / fnum) : 0;
}
