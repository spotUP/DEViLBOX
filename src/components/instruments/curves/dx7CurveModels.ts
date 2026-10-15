/**
 * dx7CurveModels.ts - what the DX7 voice parameters do, with the math of the VDX7 firmware build that plays them
 * (juce-wasm/dx7 = third-party/retromulator dx7Lib: HD6303 firmware + EGS envelope chip + OPS operator chip).
 *
 *  - Operator envelope: port of dx7Emu::Envelope (EGS.h) - the rate-to-time law is the chip's, one step per
 *    output sample at 49096.354 Hz. The VCED value -> hardware register maps (rate x41/64, level and output level
 *    through the DX7 level table, rate scaling, key level scaling) were read back from the firmware's EGS registers
 *    (dx7GetEgsRegisters) and are checked against it in dx7CurveModels.test.ts.
 *  - Algorithm: the OPS.h algoROM table walked symbolically (which operator signals reach the output = carriers,
 *    which feed which operator, where the feedback loop is).
 *  - Spectrum: the OPS operator pipeline (log-sine and exp tables, phase modulation, feedback, algorithm ROM)
 *    run for 4096 samples and Fourier transformed, so the lines are the engine's own sidebands, not Bessel
 *    approximations.
 *  - LFO rate table and pitch EG law: Dexed/msfa tables (measured from real DX7 hardware), compared with the
 *    firmware's pitch registers in the test.
 */

import { spectrumLines, type SpectrumLine } from './spectrumMath';

// ---------------------------------------------------------------------------------------------------------
// 1. VCED access
// ---------------------------------------------------------------------------------------------------------

/** VCED offsets: operator blocks of 21 bytes, OP6 first; OP n starts at (6 - n) * 21. */
export const vcedOpBase = (opNum: number): number => (6 - opNum) * 21;

export const VCED = {
  pitchEgRate: 126, pitchEgLevel: 130, algorithm: 134, feedback: 135, oscSync: 136,
  lfoSpeed: 137, lfoDelay: 138, lfoPmd: 139, lfoAmd: 140, lfoSync: 141, lfoWave: 142, lfoPms: 143, transpose: 144,
} as const;

export interface Dx7OpParams {
  rates: [number, number, number, number];
  levels: [number, number, number, number];
  breakPoint: number; leftDepth: number; rightDepth: number; leftCurve: number; rightCurve: number;
  rateScaling: number; ampModSens: number; velocitySens: number;
  outputLevel: number; fixed: boolean; coarse: number; fine: number; detune: number;
}

/** One operator's parameters from a `vced.N` reader (the layout key space). */
export function readOp(vced: (n: number) => number, opNum: number): Dx7OpParams {
  const b = vcedOpBase(opNum);
  const v = (i: number) => vced(b + i);
  return {
    rates: [v(0), v(1), v(2), v(3)], levels: [v(4), v(5), v(6), v(7)],
    breakPoint: v(8), leftDepth: v(9), rightDepth: v(10), leftCurve: v(11), rightCurve: v(12),
    rateScaling: v(13), ampModSens: v(14), velocitySens: v(15),
    outputLevel: v(16), fixed: v(17) > 0, coarse: v(18), fine: v(19), detune: v(20),
  };
}

// ---------------------------------------------------------------------------------------------------------
// 2. VCED -> EGS hardware registers
// ---------------------------------------------------------------------------------------------------------

/** Output level 0..19 -> hardware level units (msfa levellut; the firmware's table is the same: dx7CurveModels.test). */
const LEVEL_LUT = [0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46] as const;
/** 0..99 -> 0..127 hardware loudness steps (0.75 dB each). */
export const scaleOutLevel = (v: number): number => (v >= 20 ? 28 + v : LEVEL_LUT[Math.max(0, v)]);

/** EG rate register: 0..99 -> 0..63. */
export const rateRegister = (rate: number): number => (rate * 41) >> 6;
/** EG level register (an attenuation, 63 = silent, 0 = full): 0..99 -> 63..0. */
export const levelRegister = (level: number): number => 63 - (scaleOutLevel(level) >> 1);
/** Operator output level register: attenuation in 1/16 EG steps, 255 = silent. `scaledOutLevel` is 0..127 loudness steps. */
export const outputRegister = (scaledOutLevel: number): number => Math.max(0, Math.min(255, 269 - 2 * scaledOutLevel));

/** The firmware's voice pitch register for a MIDI note (+1024 per octave, 7424 at middle C = 0x1D00 with the DX7 transpose of C3; read from EGS 0x00..). */
export const voicePitchRegister = (note: number): number => Math.round(7424 + ((note - 60) * 1024) / 12);

/** Rate scaling added to every EG rate register of an operator (EGS::updateRateScaling). */
export function rateScalingDelta(note: number, sensitivity: number): number {
  const q = Math.min(27, Math.max(0, (voicePitchRegister(note) >> 8) - 16));
  return Math.trunc((q * sensitivity) / 7 + 0.5);
}

const EXP_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 16, 19, 23, 27, 33, 39, 47, 56, 66, 80, 94, 110, 126, 142, 158, 174, 190, 206, 222, 238, 250];

function scaleCurve(group: number, depth: number, curve: number): number {
  let scale: number;
  if (curve === 0 || curve === 3) scale = (group * depth * 329) >> 12;
  else scale = (EXP_SCALE[Math.min(group, EXP_SCALE.length - 1)] * depth * 329) >> 15;
  return curve < 2 ? -scale : scale;
}

/** Keyboard level scaling in 0.75 dB loudness steps for a MIDI note (msfa ScaleLevel; checked against the firmware). */
export function levelScaling(note: number, o: Pick<Dx7OpParams, 'breakPoint' | 'leftDepth' | 'rightDepth' | 'leftCurve' | 'rightCurve'>): number {
  const offset = note - o.breakPoint - 17;
  if (offset >= 0) return scaleCurve(Math.trunc((offset + 1) / 3), o.rightDepth, o.rightCurve);
  return scaleCurve(Math.trunc(-(offset - 1) / 3), o.leftDepth, o.leftCurve);
}

/**
 * The bridge (juce-wasm/dx7/dx7_bridge.cpp) hands the firmware key `note - 36`, the DX7 keyboard's numbering, so the
 * engine scales note n like msfa scales n (measured against the firmware's output level register, test). It was 2
 * while the bridge used `note - 34`; the constant stays so a numbering drift shows up as a test failure.
 */
export const FIRMWARE_KEY_OFFSET = 0;

/** Level scaling the engine applies at a MIDI note, in 0.75 dB loudness steps. */
export const engineLevelScaling = (note: number, o: Pick<Dx7OpParams, 'breakPoint' | 'leftDepth' | 'rightDepth' | 'leftCurve' | 'rightCurve'>): number =>
  levelScaling(note + FIRMWARE_KEY_OFFSET, o);

/** Operator output level register for a note: output level plus key level scaling (velocity sensitivity not applied). */
export function operatorOutputRegister(o: Dx7OpParams, note: number): number {
  const scaled = Math.max(0, Math.min(127, scaleOutLevel(o.outputLevel) + engineLevelScaling(note, o)));
  return outputRegister(scaled);
}

// ---------------------------------------------------------------------------------------------------------
// 3. The EGS envelope generator (dx7Emu::Envelope), one step per output sample
// ---------------------------------------------------------------------------------------------------------

export const DX7_SAMPLE_RATE = 49096.354;
/** Envelope level units: 1/256 octave of amplitude; 0 = full scale, 0xFF0 = silent (about -96 dB). */
export const EG_SILENT = 0xff0;
const OUT_MASK = [0xaa, 0xea, 0xee, 0xfe] as const;

export interface EgParams {
  /** Rate registers 0..63 (rate scaling not yet added). */
  rateRegs: readonly [number, number, number, number];
  /** Level registers 0..63. */
  levelRegs: readonly [number, number, number, number];
  /** Operator output level register (EGS opLevels). */
  outputReg: number;
  /** Rate scaling delta added to every rate register. */
  rateScaling: number;
}

/** Port of dx7Emu::Envelope. Stage 0..2 = EG segments 1..3, 3 = segment 4 (release); idle in stage 3. */
export class Dx7Envelope {
  level = EG_SILENT;
  target = EG_SILENT;
  stage = 3;
  keyoff = true;
  private rising = false;
  private compress = true;
  private nshift = 0; private pshift = 0; private small = 0; private mask = 0;

  private readonly p: EgParams;
  constructor(p: EgParams) { this.p = p; this.advance(); }

  keyOn(): void { this.keyoff = false; this.advance(); }
  keyOff(): void { this.keyoff = true; this.advance(); }

  /** True when no further change can happen until the key goes up. */
  get settled(): boolean { return this.stage > 1 && this.level === this.target; }
  /** True when the clock value runs an update (otherwise the sample is a no-op). */
  runsAt(clock: number): boolean { return (clock & this.small) === 0 && (this.mask & (1 << ((clock >> this.nshift) & 7))) !== 0; }
  /** Samples between candidate clocks. */
  get period(): number { return this.small + 1; }

  sample(clock: number): number {
    if (this.stage > 1 && this.level === this.target) return this.level;
    if (this.runsAt(clock)) {
      if (this.rising) {
        if (this.level > 0x94c) this.level = 0x94c;
        const slope = (this.level >> 8) + 2;
        this.level -= slope << this.pshift;
        if (this.level <= this.target) { this.level = this.target; this.advance(); }
      } else {
        this.level += 1 << this.pshift;
        if (this.level >= this.target) { this.level = this.target; this.advance(); }
      }
    }
    return this.level;
  }

  private advance(): void {
    switch (this.stage) {
      case 0: if (this.keyoff) { this.stage = 3; this.compress = true; } else { this.stage = 1; this.compress = false; } break;
      case 1: this.stage = this.keyoff ? 3 : 2; break;
      case 2: if (this.keyoff) this.stage = 3; else return; break;
      default: if (!this.keyoff) this.stage = 0; else return; break;
    }
    this.updateLevel();
    this.updateRate();
  }

  private updateLevel(): void {
    const { levelRegs, outputReg } = this.p;
    this.target = Math.min(EG_SILENT, (levelRegs[this.stage] << 6) + (outputReg << 4));
    const prev = (this.stage + 3) & 3;
    if (this.stage < 2 && levelRegs[this.stage] >= 40 && levelRegs[prev] >= 40) {
      const delay = this.stage === 0 && this.compress ? 15 : 479;
      this.target = this.level + delay;
      if (this.target > EG_SILENT) { this.level = EG_SILENT - delay; this.target = EG_SILENT; }
    }
    this.rising = this.target < this.level;
  }

  private updateRate(): void {
    const qrate = Math.min(63, this.p.rateRegs[this.stage] + this.p.rateScaling);
    this.pshift = 0; this.nshift = 0; this.small = 0;
    if (qrate < 44) { this.nshift = 11 - (qrate >> 2); this.small = (1 << this.nshift) - 1; } else this.pshift = (qrate >> 2) - 11;
    this.mask = OUT_MASK[qrate & 3];
  }
}

/** Hardware parameters of an operator at a note. */
export function egParams(o: Dx7OpParams, note: number): EgParams {
  return {
    rateRegs: o.rates.map(rateRegister) as [number, number, number, number],
    levelRegs: o.levels.map(levelRegister) as [number, number, number, number],
    outputReg: operatorOutputRegister(o, note),
    rateScaling: rateScalingDelta(note, o.rateScaling),
  };
}

/** Amplitude 0..1 of an envelope level (1/256 octave steps). */
export const egAmplitude = (level: number): number => 2 ** (-level / 256);

export interface Dx7EnvelopePoint { x: number; level: number; stage: number }
export interface Dx7EnvelopeRun {
  points: Dx7EnvelopePoint[];
  /** Seconds at which segment 3 (sustain) was reached, or the cap when it never is. */
  sustainReachedSeconds: number;
  releaseAtSeconds: number;
  totalSeconds: number;
}

const MAX_SECONDS = 24;
const MAX_HOLD_SECONDS = 12;

/**
 * One operator's note: key down until segment 3 is reached (then held for a while), key up, until silent.
 * `releaseAtSeconds` forces a common key-up time so the operators of one voice can be drawn together.
 */
export function dx7EnvelopeRun(p: EgParams, releaseAtSeconds?: number): Dx7EnvelopeRun {
  const env = new Dx7Envelope(p);
  env.keyOn();
  const maxSamples = Math.round(MAX_SECONDS * DX7_SAMPLE_RATE);
  const points: Dx7EnvelopePoint[] = [{ x: 0, level: env.level, stage: env.stage }];
  let lastX = 0; let lastLevel = env.level; let lastStage = env.stage;
  const record = (n: number, force: boolean) => {
    const x = n / DX7_SAMPLE_RATE;
    if (force || env.stage !== lastStage || x - lastX >= 0.004 || Math.abs(env.level - lastLevel) >= 48) {
      points.push({ x, level: env.level, stage: env.stage });
      lastX = x; lastLevel = env.level; lastStage = env.stage;
    }
  };
  let n = 0;
  let sustainAt = -1;
  let releaseAt = releaseAtSeconds === undefined ? -1 : Math.round(releaseAtSeconds * DX7_SAMPLE_RATE);
  let keyUp = false;
  while (n < maxSamples) {
    if (!keyUp && releaseAt >= 0 && n >= releaseAt) { record(n, true); env.keyOff(); keyUp = true; record(n, true); }
    if (env.settled) {
      if (keyUp) break;
      if (sustainAt < 0) {
        sustainAt = n;
        if (releaseAt < 0) releaseAt = n + Math.round(Math.min(MAX_HOLD_SECONDS, Math.max(0.15, 0.35 * (n / DX7_SAMPLE_RATE))) * DX7_SAMPLE_RATE);
        record(n, true);
      }
      n = Math.max(n + 1, releaseAt);
      continue;
    }
    const clock = n & 0xffff;
    if (env.runsAt(clock)) { env.sample(clock); record(n, false); n++; continue; }
    const per = env.period;
    let next = (Math.floor(n / per) + 1) * per;
    if (!keyUp && releaseAt >= 0) next = Math.min(next, releaseAt);
    n = Math.max(n + 1, next);
  }
  if (!keyUp) releaseAt = n;
  record(n, true);
  return {
    points,
    sustainReachedSeconds: (sustainAt < 0 ? n : sustainAt) / DX7_SAMPLE_RATE,
    releaseAtSeconds: releaseAt / DX7_SAMPLE_RATE,
    totalSeconds: n / DX7_SAMPLE_RATE,
  };
}

// ---------------------------------------------------------------------------------------------------------
// 4. Algorithms (OPS.h algoROM, walked symbolically)
// ---------------------------------------------------------------------------------------------------------

/** algoROM entry: sel (what feeds the next operator), A (store for feedback), C, D (sum terms), COM (carrier-count attenuation index). */
type AlgoCell = readonly [sel: number, a: number, c: number, d: number, com: number];
export const ALGO_ROM: ReadonlyArray<readonly AlgoCell[]> = [
  [[1,1,0,0,0],[1,0,0,0,0],[1,0,0,0,1],[0,0,0,1,0],[1,0,1,0,1],[5,0,1,1,0]],
  [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,1],[5,0,0,1,0],[1,1,1,0,1],[0,0,1,1,0]],
  [[1,1,0,0,0],[1,0,0,0,1],[0,0,0,1,0],[1,0,1,0,0],[1,0,1,0,1],[5,0,1,1,0]],
  [[1,0,0,0,0],[1,0,0,0,1],[0,1,0,1,0],[1,0,1,0,0],[1,0,1,0,1],[5,0,1,1,0]],
  [[1,1,0,0,2],[0,0,0,1,0],[1,0,1,0,2],[0,0,1,1,0],[1,0,1,0,2],[5,0,1,1,0]],
  [[1,0,0,0,2],[0,1,0,1,0],[1,0,1,0,2],[0,0,1,1,0],[1,0,1,0,2],[5,0,1,1,0]],
  [[1,1,0,0,0],[0,0,0,1,0],[2,0,1,1,1],[0,0,0,1,0],[1,0,1,0,1],[5,0,1,1,0]],
  [[1,0,0,0,0],[5,0,0,1,0],[2,1,1,1,1],[0,0,0,1,0],[1,0,1,0,1],[0,0,1,1,0]],
  [[1,0,0,0,0],[0,0,0,1,0],[2,0,1,1,1],[5,0,0,1,0],[1,1,1,0,1],[0,0,1,1,0]],
  [[0,0,0,1,0],[2,0,1,1,1],[5,0,0,1,0],[1,1,1,0,0],[1,0,1,0,1],[0,0,1,1,0]],
  [[0,1,0,1,0],[2,0,1,1,1],[0,0,0,1,0],[1,0,1,0,0],[1,0,1,0,1],[5,0,1,1,0]],
  [[0,0,0,1,0],[0,0,1,1,0],[2,0,1,1,1],[5,0,0,1,0],[1,1,1,0,1],[0,0,1,1,0]],
  [[0,1,0,1,0],[0,0,1,1,0],[2,0,1,1,1],[0,0,0,1,0],[1,0,1,0,1],[5,0,1,1,0]],
  [[0,1,0,1,0],[2,0,1,1,0],[1,0,0,0,1],[0,0,0,1,0],[1,0,1,0,1],[5,0,1,1,0]],
  [[0,0,0,1,0],[2,0,1,1,0],[1,0,0,0,1],[5,0,0,1,0],[1,1,1,0,1],[0,0,1,1,0]],
  [[1,1,0,0,0],[0,0,0,1,0],[1,0,1,0,0],[0,0,1,1,0],[2,0,1,1,0],[5,0,0,1,0]],
  [[1,0,0,0,0],[0,0,0,1,0],[1,0,1,0,0],[5,0,1,1,0],[2,1,1,1,0],[0,0,0,1,0]],
  [[1,0,0,0,0],[1,0,0,0,0],[5,0,0,1,0],[0,1,1,1,0],[2,0,1,1,0],[0,0,0,1,0]],
  [[1,1,0,0,2],[4,0,0,1,2],[0,0,1,1,0],[1,0,1,0,0],[1,0,1,0,2],[5,0,1,1,0]],
  [[0,0,0,1,0],[2,0,1,1,2],[5,0,0,1,0],[1,1,1,0,2],[4,0,1,1,2],[0,0,1,1,0]],
  [[1,0,0,1,3],[3,0,0,1,3],[5,0,1,1,0],[1,1,1,0,3],[4,0,1,1,3],[0,0,1,1,0]],
  [[1,1,0,0,3],[4,0,0,1,3],[4,0,1,1,3],[0,0,1,1,0],[1,0,1,0,3],[5,0,1,1,0]],
  [[1,1,0,0,3],[4,0,0,1,3],[0,0,1,1,0],[1,0,1,0,3],[0,0,1,1,3],[5,0,1,1,0]],
  [[1,1,0,0,4],[4,0,0,1,4],[4,0,1,1,4],[0,0,1,1,4],[0,0,1,1,4],[5,0,1,1,0]],
  [[1,1,0,0,4],[4,0,0,1,4],[0,0,1,1,4],[0,0,1,1,4],[0,0,1,1,4],[5,0,1,1,0]],
  [[0,1,0,1,0],[2,0,1,1,2],[0,0,0,1,0],[1,0,1,0,2],[0,0,1,1,2],[5,0,1,1,0]],
  [[0,0,0,1,0],[2,0,1,1,2],[5,0,0,1,0],[1,1,1,0,2],[0,0,1,1,2],[0,0,1,1,0]],
  [[5,0,0,1,0],[1,1,1,0,0],[1,0,1,0,2],[0,0,1,1,0],[1,0,1,0,2],[0,0,1,1,2]],
  [[1,1,0,0,3],[0,0,0,1,0],[1,0,1,0,3],[0,0,1,1,3],[0,0,1,1,3],[5,0,1,1,0]],
  [[5,0,0,1,0],[1,1,1,0,0],[1,0,1,0,3],[0,0,1,1,3],[0,0,1,1,3],[0,0,1,1,3]],
  [[1,1,0,0,4],[0,0,0,1,4],[0,0,1,1,4],[0,0,1,1,4],[0,0,1,1,4],[5,0,1,1,0]],
  [[0,1,0,1,5],[0,0,1,1,5],[0,0,1,1,5],[0,0,1,1,5],[0,0,1,1,5],[5,0,1,1,5]],
];

export interface Dx7Algorithm {
  /** Operators (1-based OP numbers) whose signal reaches the output. */
  carriers: number[];
  /** For each operator number, the operator numbers phase-modulating it (feedback sources included). */
  modulators: Record<number, number[]>;
  /** The operator whose own output is fed back (the one with the feedback arc), or null. */
  feedbackOp: number | null;
}

const hwToOp = (hw: number): number => 6 - hw;

/** Walk the algoROM symbolically for three samples so the feedback loops settle, and read off the topology. */
export function dx7Algorithm(index: number): Dx7Algorithm {
  const rom = ALGO_ROM[Math.max(0, Math.min(31, Math.round(index)))];
  let modout = new Set<number>(); let mren = new Set<number>();
  let fren1 = new Set<number>(); let fren2 = new Set<number>();
  const modulators: Record<number, number[]> = {};
  let feedbackOp: number | null = null;
  for (let pass = 0; pass < 3; pass++) {
    for (let hw = 0; hw < 6; hw++) {
      const [sel, a, c, d] = rom[hw];
      if (pass === 2) modulators[hwToOp(hw)] = [...modout].map(hwToOp).sort((x, y) => x - y);
      const msum = new Set<number>();
      if (c) for (const s of mren) msum.add(s);
      if (d) msum.add(hw);
      const prevMren = mren;
      switch (sel) {
        case 0: modout = new Set(); break;
        case 1: modout = new Set([hw]); break;
        case 2: modout = new Set(msum); break;
        case 3: modout = new Set(prevMren); break;
        case 4: modout = new Set(fren1); break;
        default: modout = new Set([...fren1, ...fren2]); break;
      }
      mren = msum;
      if (a) { fren2 = fren1; fren1 = new Set([hw]); if (pass === 2) feedbackOp = hwToOp(hw); }
    }
  }
  // the feedback arc belongs to the operator that receives its own delayed output
  let selfFed: number | null = null;
  for (const [opStr, mods] of Object.entries(modulators)) if (mods.includes(Number(opStr))) selfFed = Number(opStr);
  return {
    carriers: [...mren].map(hwToOp).sort((x, y) => x - y),
    modulators,
    feedbackOp: selfFed ?? feedbackOp,
  };
}

// ---------------------------------------------------------------------------------------------------------
// 5. Operator frequency and spectrum (OPS.h pipeline)
// ---------------------------------------------------------------------------------------------------------

/** Frequency of an operator in Hz for a note: ratio mode (coarse 0 = x0.5) or fixed (10^coarse Hz). */
export function operatorFrequencyHz(o: Pick<Dx7OpParams, 'fixed' | 'coarse' | 'fine'>, noteHz: number): number {
  if (o.fixed) return 10 ** ((o.coarse & 3) + o.fine / 100);
  return noteHz * (o.coarse === 0 ? 0.5 : o.coarse) * (1 + o.fine / 100);
}
export const noteToHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);
/**
 * The frequency the engine really sounds for a MIDI note: FIRMWARE_KEY_OFFSET semitones above the note (0 now: MIDI 69
 * renders 440 Hz, measured in dx7Pitch.test.ts).
 */
export const engineNoteHz = (note: number): number => noteToHz(note + FIRMWARE_KEY_OFFSET);

const SIN_N = 1024;
const SIN_TAB = new Uint16Array(SIN_N);
for (let i = 0; i < SIN_N; i++) SIN_TAB[i] = Math.trunc(0.5002 - (SIN_N * Math.log(Math.sin(((i + 0.5) / SIN_N) * (Math.PI / 2)))) / Math.log(2));
const EXP_TAB = new Uint32Array(16 * SIN_N);
for (let i = 0; i < 16 * SIN_N; i++) {
  const mant = Math.trunc(0.5 + 2 * SIN_N * 2 ** ((i & (SIN_N - 1)) / SIN_N));
  EXP_TAB[i] = Math.floor((mant * 2 ** ((i >> 10) & 0xf)) / 32);
}
const COM_TAB = [0, 8, 13, 16, 19, 21].map((v) => v << 7);

function shiftQuant(v: number): number {
  if (v >= 4096) return v & ~7;
  if (v >= 2048) return v & ~3;
  if (v >= 1024) return v & ~1;
  return v;
}

export const SPECTRUM_SAMPLES = 4096;
const SPECTRUM_WARMUP = 4096;
/** Peak of a full-level carrier in the OPS pipeline (14-bit signal). */
export const OPS_FULL_SCALE = 16376;

export interface SpectrumOp { envelopeLevel: number; frequencyHz: number }

/**
 * Run the OPS pipeline of one voice (algorithm ROM, feedback, log-sine/exp tables) with fixed envelope levels,
 * and return the output samples. Mirrors OPS::clock for one voice.
 */
export function renderOps(algorithm: number, feedback: number, ops: readonly SpectrumOp[], samples: number, warmup = 0): Float64Array {
  const rom = ALGO_ROM[Math.max(0, Math.min(31, Math.round(algorithm)))];
  const phase = new Float64Array(6);
  const inc = ops.map((o) => Math.round((o.frequencyHz / DX7_SAMPLE_RATE) * (1 << 23)));
  let modout = 0; let mren = 0; let fren1 = 0; let fren2 = 0; let com = 0;
  const fb = Math.max(0, Math.min(7, Math.round(feedback)));
  const out = new Float64Array(samples);
  for (let n = 0; n < warmup + samples; n++) {
    for (let op = 0; op < 6; op++) {
      let phi = phase[op];
      phase[op] = (phase[op] + inc[op]) % (1 << 23);
      phi = Math.floor(phi / 2048);
      const v = (phi + modout) >>> 0;
      const idx = (v & (1 << 10)) ? (~v) & (SIN_N - 1) : v & (SIN_N - 1);
      const sign = (v & (1 << 11)) !== 0;
      let logsin = SIN_TAB[idx];
      logsin = (logsin + (ops[op].envelopeLevel << 2)) & 0xffff;
      logsin = (logsin + COM_TAB[com]) & 0xffff;
      if (logsin & 0x4000) logsin = 0x3fff;
      logsin ^= 0x3fff;
      const mag = shiftQuant(EXP_TAB[logsin] >>> 8);
      const signal = sign ? -mag : mag;
      const [sel, a, c, d, comNext] = rom[op];
      let msum = 0;
      if (c) msum += mren;
      if (d) msum += signal;
      switch (sel) {
        case 0: modout = 0; break;
        case 1: modout = signal; break;
        case 2: modout = msum; break;
        case 3: modout = mren; break;
        case 4: modout = fren1; break;
        default: modout = (fren1 + fren2) >> (1 + (7 - fb)); break;
      }
      mren = msum;
      if (a) { fren2 = fren1; fren1 = signal; }
      com = comNext;
      if (op === 5 && n >= warmup) out[n - warmup] = mren;
    }
  }
  return out;
}

export type { SpectrumLine };

/** The lines of a rendered block, in dB re a full-scale carrier (OPS_FULL_SCALE). */
const dx7Lines = (samples: Float64Array, floorDb: number, maxHz: number): SpectrumLine[] => spectrumLines(samples, DX7_SAMPLE_RATE, OPS_FULL_SCALE, floorDb, maxHz);

/** Peak envelope level of an operator over segments 1..3 (the loudest it gets while the key is down). */
export function peakEnvelopeLevel(p: EgParams): number {
  let best = EG_SILENT;
  for (let s = 0; s < 3; s++) best = Math.min(best, Math.min(EG_SILENT, (p.levelRegs[s] << 6) + (p.outputReg << 4)));
  return best;
}

export interface Dx7Voice { ops: Dx7OpParams[]; algorithm: number; feedback: number }

/** The voice's spectrum at the loudest point of each operator. */
export function dx7VoiceSpectrum(voice: Dx7Voice, note: number, maxHz = 8000): SpectrumLine[] {
  const noteHz = engineNoteHz(note);
  const ops: SpectrumOp[] = [];
  for (let hw = 0; hw < 6; hw++) {
    const o = voice.ops[hwToOp(hw) - 1];
    ops.push({ envelopeLevel: peakEnvelopeLevel(egParams(o, note)), frequencyHz: operatorFrequencyHz(o, noteHz) });
  }
  return dx7Lines(renderOps(voice.algorithm, voice.feedback, ops, SPECTRUM_SAMPLES, SPECTRUM_WARMUP), -80, maxHz);
}

// ---------------------------------------------------------------------------------------------------------
// 6. LFO and pitch EG
// ---------------------------------------------------------------------------------------------------------

/** LFO speed 0..99 -> Hz (msfa lfo.cc, measured from a DX7). */
const LFO_HZ = [
  0.062541, 0.125031, 0.312393, 0.437120, 0.624610, 0.750694, 0.936330, 1.125302, 1.249609, 1.436782,
  1.560915, 1.752081, 1.875117, 2.062494, 2.247191, 2.374451, 2.560492, 2.686728, 2.873976, 2.998950,
  3.188013, 3.369840, 3.500175, 3.682224, 3.812065, 4.000800, 4.186202, 4.310716, 4.501260, 4.623209,
  4.814636, 4.930480, 5.121901, 5.315191, 5.434783, 5.617346, 5.750431, 5.946717, 6.062811, 6.248438,
  6.431695, 6.564264, 6.749460, 6.868132, 7.052186, 7.250580, 7.375719, 7.556294, 7.687577, 7.877738,
  7.993605, 8.181967, 8.372405, 8.504848, 8.685079, 8.810573, 8.986341, 9.122423, 9.300595, 9.500285,
  9.607994, 9.798158, 9.950249, 10.117361, 11.251125, 11.384335, 12.562814, 13.676149, 13.904338, 15.092062,
  16.366612, 16.638935, 17.869907, 19.193858, 19.425019, 20.833333, 21.034918, 22.502250, 24.003841, 24.260068,
  25.746653, 27.173913, 27.578599, 29.052876, 30.693677, 31.191516, 32.658393, 34.317090, 34.674064, 36.416606,
  38.197097, 38.550501, 40.387722, 40.749796, 42.625746, 44.326241, 44.883303, 46.772685, 48.590865, 49.261084,
] as const;
export const lfoRateHz = (speed: number): number => LFO_HZ[Math.max(0, Math.min(99, Math.round(speed)))];

/** Seconds the LFO delay holds the modulation off, then seconds it takes to fade in (msfa getdelay law). */
export function lfoDelaySeconds(delay: number): { hold: number; fade: number } | null {
  const a0 = 99 - Math.round(delay);
  if (a0 >= 99) return null;
  const a1 = (16 + (a0 & 15)) << (1 + (a0 >> 4));
  const a2 = Math.max(0x80, a1 & 0xff80);
  const perSecond = 25190424;
  return { hold: 2 ** 31 / (perSecond * a1), fade: 2 ** 31 / (perSecond * a2) };
}

/** LFO waveform value 0..1 for a phase 0..1 (msfa Lfo::getsample; S&H is shown as eight steps). */
export function lfoWaveform(wave: number, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (Math.round(wave)) {
    case 0: return p < 0.5 ? p * 2 : 2 - p * 2;
    case 1: return 1 - p;
    case 2: return p;
    case 3: return p < 0.5 ? 1 : 0;
    case 4: return 0.5 + 0.5 * Math.sin(2 * Math.PI * p);
    default: { const steps = [0.78, 0.22, 0.55, 0.95, 0.1, 0.62, 0.35, 0.85]; return steps[Math.floor(p * 8) % 8]; }
  }
}

/** Pitch sensitivity table (msfa pitchmodsenstab) and the pitch deviation in cents at full LFO swing. */
const PMS_TAB = [0, 10, 20, 33, 55, 92, 153, 255] as const;

/** Firmware pitch-modulation register units per PMS table step at full depth (peak of 16129 at PMS 7 / 255; measured). */
const LFO_REGISTER_PER_STEP = 63.25;
/** PMD 0..99 as the firmware scales it (msfa: pmd * 165 >> 6, full scale 255). */
const pmdScale = (pmd: number): number => ((Math.round(pmd) * 165) >> 6) / 255;

/** Peak of the firmware's pitch-modulation register for LFO pitch depth `pmd` and sensitivity `pms`. */
export const lfoPeakRegister = (pmd: number, pms: number): number => PMS_TAB[Math.max(0, Math.min(7, Math.round(pms)))] * LFO_REGISTER_PER_STEP * pmdScale(pmd);

/** The register is 1/16 of a 1024-per-octave frequency step: cents = register / 16 * 1200 / 1024. */
export const registerToCents = (register: number): number => (register / 16) * (1200 / 1024);

/** Peak pitch deviation in cents of the LFO (checked against the firmware's register in the test). */
export const lfoPitchCents = (pmd: number, pms: number): number => registerToCents(lfoPeakRegister(pmd, pms));

/** Pitch EG level 0..99 -> 1/32 octave steps (msfa pitchenv_tab). */
const PITCH_ENV_TAB = [
  -128, -116, -104, -95, -85, -76, -68, -61, -56, -52, -49, -46, -43, -41, -39, -37, -35, -33, -32, -31, -30, -29, -28, -27, -26, -25, -24,
  -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 38, 40, 43, 46, 49, 53, 58, 65, 73,
  82, 92, 103, 115, 127,
] as const;
const PITCH_ENV_RATE = [
  1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 16, 16, 17, 18, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 30, 31, 33, 34, 36, 37, 38, 39, 41, 42, 44, 46, 47, 49, 51, 53, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 79, 82,
  85, 88, 91, 94, 98, 102, 106, 110, 115, 120, 125, 130, 135, 141, 147, 153, 159, 165, 171, 178, 185, 193, 202, 211, 232, 243, 254, 255,
] as const;

/** Pitch EG level in semitones. */
export const pitchEgSemitones = (level: number): number => (PITCH_ENV_TAB[Math.max(0, Math.min(99, Math.round(level)))] * 12) / 32;

/** Seconds per 1/32 octave... the msfa law: rate r moves the level by PITCH_ENV_RATE[r] * (2^24 / 21.3) per second in 2^24-per-octave units. */
const PITCH_EG_UNITS_PER_SECOND = (1 << 24) / 21.3;
const OCTAVE_UNITS = 1 << 24;

export interface PitchEgPoint { x: number; semitones: number }

/** The pitch EG of one note: key down through segments 1..3, a hold, then segment 4. */
export function pitchEgRun(rates: readonly number[], levels: readonly number[], holdSeconds = 0.4): PitchEgPoint[] {
  const toUnits = (l: number) => (PITCH_ENV_TAB[Math.max(0, Math.min(99, Math.round(l)))] << 19);
  const pts: PitchEgPoint[] = [];
  let t = 0; let level = toUnits(levels[3]);
  const push = () => pts.push({ x: t, semitones: (level / OCTAVE_UNITS) * 12 });
  push();
  const go = (rate: number, target: number) => {
    const speed = PITCH_ENV_RATE[Math.max(0, Math.min(99, Math.round(rate)))] * PITCH_EG_UNITS_PER_SECOND;
    t += Math.abs(target - level) / speed;
    level = target;
    push();
  };
  for (let i = 0; i < 3; i++) go(rates[i], toUnits(levels[i]));
  t += holdSeconds; push();
  go(rates[3], toUnits(levels[3]));
  return pts;
}
