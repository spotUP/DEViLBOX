/**
 * VL1.worklet.js — AudioWorklet processor for Casio VL-Tone emulation
 * Pure JS DSP — no WASM needed.
 *
 * Ported 1:1 from the VL1-emulator-v2006-src C++ code.
 * All DSP runs at 16x internal oversampling, matching the original.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const WAVETABLE_SIZE = 32;
const DEFAULT_OVERSAMPLING = 16;
const ASIC_CLOCK = 200000.0;
const ENVELOPE_DIVISOR = 2400.0;
const ENVELOPE_TIME_UNIT = ENVELOPE_DIVISOR / ASIC_CLOCK; // ~0.012 sec
const ENVELOPE_LEVELS = 15.0;
const ENVELOPE_STEP = 1.0 / ENVELOPE_LEVELS;
const PI = Math.PI;
const TWO_PI = 2.0 * Math.PI;
const LFO_BASE_FREQ = 35.0;
const EPSILON = 1.0e-15;

// Note durations in trigger counts
const WHOLE = 32;
const HALF = 16;
const QUARTER = 8;
// const EIGHTH = 4;

// Rhythm sounds
const POCK = 0;
const PEEK = 1;
const NOISE = 2;

// ADSR phases
const ADSR_IDLE = 0;
const ADSR_ATTACK = 1;
const ADSR_DECAY = 2;
const ADSR_SUSTAIN = 3;
const ADSR_RELEASE = 4;

// ─── Envelope Lookup Tables (from VL1defs.h) ────────────────────────────────

// Each entry: [lBegin, lEnd, tUnits]
const gAttack = [
  [15,15,  0], [11,15,  1], [ 7,15,  4], [ 5,15,  7], [ 4,15, 10],
  [ 4,15, 13], [ 3,15, 16], [ 3,15, 19], [ 3,15, 22], [ 3,15, 25], [ 2,15, 28],
];
const gDecay = [
  [15,0,  0], [15,0,  9], [15,0, 18], [15,0, 27], [15,0, 39],
  [15,0, 48], [15,0, 58], [15,0, 67], [15,0, 78], [15,0, 87], [15,0, 98],
];
const gSustainLevel = [
  [15, 1,0], [15, 2,0], [15, 4,0], [15, 6,0], [15, 8,0],
  [15,10,0], [15,12,0], [15,13,0], [15,14,0], [15,15,0], [15,15,0],
];
const gSustainSlope = [
  [15,0,   0], [15,0,  79], [15,0, 154], [15,0, 231], [15,0, 312],
  [15,0, 389], [15,0, 467], [15,0, 543], [15,0, 615], [15,0,  -1], [15,0,  -1],
];
const gRelease = [
  [14,0,   0], [14,0,  26], [14,0,  48], [14,0,  73], [14,0,  96],
  [14,0, 116], [14,0, 142], [14,0, 167], [14,0, 193], [14,0, 217], [14,0, 242],
];

// ─── Factory preset ADSR values (from VL1defs.h) ────────────────────────────
// [sound, A, D, Sl, St, R, V, T]
const VL1_PRESETS = [
  [0.0, 0.0, 0.4, 0.5, 0.3, 0.2, 0.0, 0.0], // Piano
  [0.1, 0.0, 0.0, 0.9, 0.9, 0.6, 0.3, 0.0], // Fantasy
  [0.2, 0.3, 0.0, 0.9, 0.9, 0.1, 0.3, 0.0], // Violin
  [0.3, 0.3, 0.0, 0.9, 0.9, 0.1, 0.3, 0.0], // Flute
  [0.4, 0.1, 0.0, 0.7, 0.1, 0.2, 0.0, 0.0], // Guitar
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], // ADSR (custom)
];

// ─── MIDI note to frequency table ────────────────────────────────────────────

function buildFreqTable() {
  const table = new Float32Array(128);
  const k = 1.059463094359; // 12th root of 2
  let freq = 6.875 * k * k * k; // A0 → C0 area
  for (let i = 0; i < 128; i++) {
    table[i] = freq;
    freq *= k;
  }
  return table;
}

// ─── LineInTime (staircase-quantized linear ramp) ────────────────────────────

class LineInTime {
  constructor() {
    this.tRes = 0; this.yRes = 0;
    this.s = 0; this.ds = 1; this.sStep = 0;
    this.y = 0; this.dy = 0; this.y0 = 0; this.y1 = 0;
    this.yAcc = 0; this.bUp = true; this.bDone = false;
  }

  setResolution(tRes, yRes) { this.tRes = tRes; this.yRes = yRes; }

  loadAccumulator(acc) { this.y = this.yAcc = acc; }

  initialize(t0, y0, t1, y1, bReset, sr, os) {
    this._t0 = Math.min(t0, t1);
    this._t1 = Math.max(t0, t1);
    this.ds = 1.0;
    this.s = 0;
    this.sStep = 0.001 * this.tRes * sr * os;

    this.y0 = Math.min(y0, y1);
    this.y1 = Math.max(y0, y1);
    const dt = 0.001 * (this._t1 - this._t0) * sr * os;
    this.dy = dt > 0 ? (this.y1 - this.y0) / dt : 0;

    this.bUp = (y1 >= y0);
    if (bReset) this.yAcc = this.bUp ? this.y0 : this.y1;
    this.y = this.yAcc;
  }

  start() { this.bDone = false; }
  isFinished() { return this.bDone; }

  clock(sr, os) {
    if (this.bDone) return this.yAcc;

    this.s += this.ds;

    if (this.bUp) {
      if (this.y < this.y1) {
        this.y += this.dy;
        if (this.sStep > 0) this.sStep -= this.ds;
        else {
          this.sStep = 0.001 * this.tRes * sr * os;
          if (this.yAcc < this.y) {
            while (this.yAcc < this.y) this.yAcc += this.yRes;
          }
        }
      } else {
        this.yAcc = this.y1;
        this.bDone = true;
      }
    } else {
      if (this.y > this.y0) {
        this.y -= this.dy;
        if (this.sStep > 0) this.sStep -= this.ds;
        else {
          this.sStep = 0.001 * this.tRes * sr * os;
          if (this.yAcc > this.y) {
            while (this.yAcc > this.y) this.yAcc -= this.yRes;
          }
        }
      } else {
        this.yAcc = this.y0;
        this.bDone = true;
      }
    }

    return this.yAcc;
  }
}

// ─── ADSR Envelope ───────────────────────────────────────────────────────────

class ADSR {
  constructor(sr, os) {
    this.sr = sr; this.os = os;
    this.adsrMin = 0.000001; this.adsrMax = 1.0;
    this.attack = 0; this.decay = 0;
    this.sustainLevel = 1; this.sustainSlope = 9;
    this.release = 4;
    this.phase = ADSR_IDLE; this.adsr = 0;
    this.bGate = false; this.bScheduleRelease = false;
    this.envelope = new LineInTime();
    this.envelope.setResolution(1000.0 * ENVELOPE_TIME_UNIT, 1.0);
  }

  reset() { this.adsr = 0; this.phase = ADSR_IDLE; this.bGate = false; this.bScheduleRelease = false; }
  isIdle() { return this.phase === ADSR_IDLE; }

  setAttack(v) { this.attack = v; }
  setDecay(v) { this.decay = v; }
  setSustainLevel(v) { this.sustainLevel = v; }
  setSustainSlope(v) { this.sustainSlope = v; }
  setRelease(v) { this.release = v; }

  _initPhase(phase, info, info2) {
    this.phase = phase;
    this.bScheduleRelease = false;

    let t0 = 0;
    let t1 = phase === ADSR_SUSTAIN ? info2[2] : info[2];
    if (t1 < 0 && phase === ADSR_SUSTAIN) {
      t1 = 9999999.0; // infinite sustain
    } else {
      t1 *= 1000.0 * ENVELOPE_TIME_UNIT;
    }
    if (t1 <= t0) {
      if (phase === ADSR_ATTACK) t1 = 18.0;
    }

    const y0 = phase === ADSR_SUSTAIN ? info2[0] : info[0];
    const y1 = phase === ADSR_SUSTAIN ? info2[1] : info[1];
    const bRestart = phase === ADSR_ATTACK;

    this.envelope.initialize(t0, y0, t1, y1, bRestart, this.sr, this.os);
    this.envelope.start();
  }

  gate(bGate) {
    this.bGate = bGate;
    if (bGate) {
      this._initPhase(ADSR_ATTACK, gAttack[this.attack | 0]);
    } else if (this.phase !== ADSR_IDLE) {
      if (this.phase === ADSR_ATTACK) {
        this.bScheduleRelease = true;
      } else {
        this._initPhase(ADSR_RELEASE, gRelease[this.release | 0]);
      }
    }
  }

  clock() {
    this.adsr = this.envelope.clock(this.sr, this.os) * ENVELOPE_STEP;

    if (this.adsr >= this.adsrMax) this.adsr = 1.0;
    else if (this.adsr <= this.adsrMin) {
      this.adsr = 0;
      this.phase = ADSR_IDLE;
    }

    switch (this.phase) {
      case ADSR_ATTACK:
        if (this.envelope.isFinished()) {
          if (this.bScheduleRelease) {
            this._initPhase(ADSR_RELEASE, gRelease[this.release | 0]);
          } else {
            const d = this.decay | 0;
            if (d) {
              this._initPhase(ADSR_DECAY, gDecay[d]);
            } else {
              this._initPhase(ADSR_SUSTAIN, gSustainLevel[this.sustainLevel | 0], gSustainSlope[this.sustainSlope | 0]);
              this.envelope.loadAccumulator(gSustainLevel[this.sustainLevel | 0][1]);
            }
          }
        }
        break;

      case ADSR_DECAY: {
        const s = ENVELOPE_STEP * gSustainLevel[this.sustainLevel | 0][1];
        if (this.adsr <= s) {
          this._initPhase(ADSR_SUSTAIN, gSustainLevel[this.sustainLevel | 0], gSustainSlope[this.sustainSlope | 0]);
        }
        break;
      }
    }

    return this.adsr;
  }
}

// ─── LFO ─────────────────────────────────────────────────────────────────────

class LFO {
  constructor(sr, os) {
    this.sr = sr; this.os = os;
    this.enabled = false;
    this.dc = 0;
    this.frequency = LFO_BASE_FREQ;
    this.sin = 1; this.cos = 0; this.a = 0;
    this._resetSine();
  }

  setFrequency(freq) { this.frequency = freq; this._resetSine(); }
  setDcLevel(dc) { this.dc = dc; }
  enable(on) { this.enabled = on; }
  reset() { this._resetSine(); }

  _resetSine() {
    this.a = 2.0 * Math.sin(PI * this.frequency / (this.sr * this.os));
    this.sin = 1.0; this.cos = 0.0;
  }

  clock() {
    if (!this.enabled) return this.dc;
    const scale = 1.5 - 0.5 * (this.sin * this.sin + this.cos * this.cos);
    this.sin = (this.sin - this.a * this.cos) * scale;
    this.cos = (this.cos + this.a * this.sin) * scale;
    return this.sin;
  }
}

// ─── Envelope Shaper (analog RC circuit simulation) ──────────────────────────

class EnvelopeShaper {
  constructor(sr, os) {
    this.sr = sr; this.os = os;
    this.cap = 3.3e-6;
    this.rCharge = 1.0 / 600.0;
    this.rDischarge = 1.0 / 33000.0;
    this.vCap = 0;
  }

  clock(input) {
    const vIn = input * 5.0 - 0.6;
    let iCharge;
    if (vIn > this.vCap) {
      iCharge = (vIn - this.vCap) * this.rCharge;
    } else {
      iCharge = -this.vCap * this.rDischarge;
    }
    this.vCap += iCharge / (this.sr * this.os * this.cap);

    // Quadratic approximation of measured transfer curve
    let vOut = 0.131033183 * this.vCap * this.vCap + 0.246632173 * this.vCap - 0.219399434;
    if (vOut < 0) vOut = 0;
    return vOut;
  }
}

// ─── Biquad Low-Pass Filter ──────────────────────────────────────────────────

class BiquadLPF {
  constructor() {
    this.a1 = 0; this.a2 = 0;
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.xn1 = 0; this.xn2 = 0;
    this.yn1 = 0; this.yn2 = 0;
  }

  setCutoff(fc, sampleRate, Q) {
    const w0 = TWO_PI * fc / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2.0 * Q);
    const oneOverA0 = 1.0 / (1.0 + alpha);
    this.a1 = oneOverA0 * (-2.0 * cosw0);
    this.a2 = oneOverA0 * (1.0 - alpha);
    this.b1 = oneOverA0 * (1.0 - cosw0);
    this.b0 = 0.5 * this.b1;
    this.b2 = this.b0;
  }

  clock(input) {
    let out = this.b0 * input + this.b1 * this.xn1 + this.b2 * this.xn2 - this.a1 * this.yn1 - this.a2 * this.yn2;
    if (Math.abs(out) < EPSILON) out = 0;
    this.xn2 = this.xn1; this.xn1 = input;
    this.yn2 = this.yn1; this.yn1 = out;
    return out;
  }
}

// ─── IIR1 (1st order LPF for output filtering) ──────────────────────────────

class IIR1 {
  constructor() { this.k = 1; this.l = 0; this.delay = 0; }

  setCutoff(fc, sampleRate) {
    this.k = 1.0 - Math.exp(-TWO_PI * fc / sampleRate);
    this.l = 1.0 - this.k;
  }

  clock(sample) {
    this.delay = this.l * this.delay + this.k * sample;
    if (Math.abs(this.delay) < 1e-24) this.delay = 0;
    return this.delay;
  }
}

// ─── Wavetable Generator ─────────────────────────────────────────────────────

function makeWavetables(oversampling) {
  const size = WAVETABLE_SIZE * oversampling;

  function makePulse(dutyCycle) {
    const data = new Float32Array(size);
    const h = (dutyCycle * size) | 0;
    for (let i = 0; i < h; i++) data[i] = 1.0;
    return data;
  }

  // Piano: duty 11/16, pitchScale 1
  const piano = { data: makePulse(11.0 / 16.0), pitchScale: 1.0 };

  // Fantasy: duty 50%, pitchScale 2
  const fantasy = { data: makePulse(0.5), pitchScale: 2.0 };

  // Violin: complex pulse train, pitchScale 1
  const violinData = new Float32Array(size);
  let i = 0;
  for (; i < (4 * size) / 16; i++) violinData[i] = 1.0;
  for (; i < (5 * size) / 16; i++) violinData[i] = 0.0;
  for (; i < (8 * size) / 16; i++) violinData[i] = 1.0;
  for (; i < (9 * size) / 16; i++) violinData[i] = 0.0;
  for (; i < (11 * size) / 16; i++) violinData[i] = 1.0;
  for (; i < (12 * size) / 16; i++) violinData[i] = 0.0;
  for (; i < (13 * size) / 16; i++) violinData[i] = 1.0;
  for (; i < (14 * size) / 16; i++) violinData[i] = 0.0;
  for (; i < (15 * size) / 16; i++) violinData[i] = 1.0;
  for (; i < size; i++) violinData[i] = 0.0;
  const violin = { data: violinData, pitchScale: 1.0 };

  // Flute: duty 50%, pitchScale 1
  const flute = { data: makePulse(0.5), pitchScale: 1.0 };

  // Guitar1: sparse pulse, pitchScale 0.5
  const g1Data = new Float32Array(size);
  i = 0;
  for (; i < size / 16; i++) g1Data[i] = 1.0;
  for (; i < (7 * size) / 16; i++) g1Data[i] = 0.0;
  for (; i < (8 * size) / 16; i++) g1Data[i] = 1.0;
  for (; i < size; i++) g1Data[i] = 0.0;
  const guitar1 = { data: g1Data, pitchScale: 0.5 };

  // Guitar2: different sparse pulse, pitchScale 0.5
  const g2Data = new Float32Array(size);
  i = 0;
  for (; i < size / 16; i++) g2Data[i] = 1.0;
  for (; i < (2 * size) / 16; i++) g2Data[i] = 0.0;
  for (; i < (6 * size) / 16; i++) g2Data[i] = 1.0;
  for (; i < (8 * size) / 16; i++) g2Data[i] = 0.0;
  for (; i < (10 * size) / 16; i++) g2Data[i] = 1.0;
  for (; i < size; i++) g2Data[i] = 0.0;
  const guitar2 = { data: g2Data, pitchScale: 0.5 };

  // English Horn: duty 1/7, pitchScale 0.5
  const englishHorn = { data: makePulse(1.0 / 7.0), pitchScale: 0.5 };

  return [piano, fantasy, violin, flute, guitar1, guitar2, englishHorn];
}

// ─── Noise Generator (LFSR) ─────────────────────────────────────────────────

class NoiseGen {
  constructor() { this.shiftRegister = 0; }

  clock() {
    let newBit = (this.shiftRegister & 0x8000) ? 1 : 0;
    newBit ^= (this.shiftRegister & 0x4000) ? 1 : 0;
    newBit ^= (this.shiftRegister & 0x1000) ? 1 : 0;
    newBit ^= (this.shiftRegister & 0x0008) ? 1 : 0;
    newBit = newBit ? 0 : 1;
    this.shiftRegister = ((this.shiftRegister << 1) | newBit) & 0xffff;
    return (this.shiftRegister & 0x8000) ? 1 : 0;
  }
}

// ─── Rhythm Engine ───────────────────────────────────────────────────────────

const RHYTHM_PATTERNS = [
  // March
  [{ sound: POCK, length: WHOLE }, { sound: NOISE, length: WHOLE }],
  // Waltz
  [{ sound: POCK, length: WHOLE }, { sound: NOISE, length: WHOLE }, { sound: NOISE, length: WHOLE }],
  // 4-Beat
  [{ sound: POCK, length: WHOLE }, { sound: NOISE, length: WHOLE }, { sound: NOISE, length: WHOLE }, { sound: NOISE, length: WHOLE }],
  // Swing
  [{ sound: PEEK, length: WHOLE }, { sound: NOISE, length: 3 * QUARTER }, { sound: PEEK, length: QUARTER }],
  // Rock1
  [{ sound: POCK, length: HALF }, { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: NOISE, length: HALF },
   { sound: POCK, length: HALF }, { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF }],
  // Rock2
  [{ sound: POCK, length: HALF }, { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: QUARTER }, { sound: POCK, length: QUARTER },
   { sound: POCK, length: HALF }, { sound: POCK, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF }],
  // Bossanova
  [{ sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF },
   { sound: POCK, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF },
   { sound: POCK, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF }, { sound: POCK, length: HALF },
   { sound: POCK, length: HALF }, { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: POCK, length: HALF }],
  // Samba
  [{ sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF },
   { sound: POCK, length: HALF }, { sound: POCK, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF },
   { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF },
   { sound: POCK, length: HALF }, { sound: POCK, length: HALF }, { sound: POCK, length: HALF }, { sound: NOISE, length: HALF }],
  // Rhumba
  [{ sound: PEEK, length: HALF }, { sound: NOISE, length: QUARTER }, { sound: NOISE, length: QUARTER }, { sound: NOISE, length: HALF },
   { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF },
   { sound: NOISE, length: HALF }, { sound: NOISE, length: HALF }, { sound: NOISE, length: QUARTER }, { sound: NOISE, length: QUARTER },
   { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF },
   { sound: POCK, length: HALF }, { sound: POCK, length: HALF }],
  // Beguine
  [{ sound: POCK, length: HALF }, { sound: NOISE, length: QUARTER }, { sound: NOISE, length: QUARTER }, { sound: NOISE, length: HALF },
   { sound: NOISE, length: HALF }, { sound: PEEK, length: HALF }, { sound: NOISE, length: HALF }, { sound: POCK, length: HALF },
   { sound: NOISE, length: HALF }],
];

class Rhythm {
  constructor(sr) {
    this.sr = sr;
    this.rhythm = 0;
    this.sound = POCK;
    this.time = 0;
    this.beat = 0;
    this.isPlaying = false;
    this.scheduleStop = false;
    this.trigger = false;
    this.triggerCounter = 0;
    this.blip = null;
    this.noise = null;
    this._makeBlip(780, 30);
    this._makeNoise(50000.0 / sr);
  }

  _makeBlip(frequency, periods) {
    const halfPeriod = ((this.sr / frequency + 1) | 0) >> 1;
    const blipSize = periods * 2 * halfPeriod;
    this.blip = new Float32Array(blipSize);
    let level = 1.0;
    let idx = 0;
    for (let p = 0; p < periods / 2; p++) {
      for (let r = 0; r < 2; r++) {
        for (let j = 0; j < halfPeriod; j++) this.blip[idx++] = level;
        for (let j = 0; j < halfPeriod; j++) this.blip[idx++] = 0;
      }
      level -= 1.0 / 15.0;
    }
  }

  _makeNoise(oversampling) {
    const l1 = 8 * 0.005;
    const l2 = 6 * 0.020;
    const s1 = (this.sr * oversampling * l1) | 0;
    const s2 = (this.sr * oversampling * l2) | 0;
    const noiseSize = s1 + s2 + 1;
    this.noise = new Float32Array(noiseSize);

    let level = 1.0;
    const noiseGen = new NoiseGen();
    let idx = 0;

    // First section: 8 levels of 5ms each
    const len1 = (this.sr * oversampling * 0.005 + 0.5) | 0;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < len1; j++) {
        if (idx < noiseSize) this.noise[idx++] = level * noiseGen.clock();
      }
      level -= 1.0 / 15.0;
    }

    // Second section: 6 levels of 20ms each
    const len2 = (this.sr * oversampling * 0.020 + 0.5) | 0;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < len2; j++) {
        const pos = s1 + i * len2 + j;
        if (pos < noiseSize) this.noise[pos] = level * noiseGen.clock();
      }
      level -= 1.0 / 15.0;
    }
  }

  selectRhythm(r) { this.rhythm = r; }

  play(startBeat) {
    const pattern = RHYTHM_PATTERNS[this.rhythm];
    this.beat = startBeat >= pattern.length ? 0 : startBeat;
    this.triggerCounter = 1;
    this.scheduleStop = false;
    this.isPlaying = true;
  }

  stop() { this.scheduleStop = true; }

  doTrigger() { this.trigger = true; }

  reset() {
    this.time = 0; this.beat = 0;
    this.isPlaying = false; this.scheduleStop = false;
    this.trigger = false; this.triggerCounter = 0;
  }

  clock() {
    if (!this.isPlaying) return 0;
    this.time++;

    if (this.trigger) {
      this.trigger = false;
      this.triggerCounter--;
      if (this.triggerCounter <= 0) {
        const pattern = RHYTHM_PATTERNS[this.rhythm];
        const ev = pattern[this.beat];
        this.sound = ev.sound;
        this.triggerCounter = ev.length;
        this.beat++;
        if (this.beat >= pattern.length) this.beat = 0;
        this.time = 0;
      }
    }

    let sample = 0;
    switch (this.sound) {
      case POCK:
        if (this.time < this.blip.length) sample = this.blip[this.time];
        else if (this.scheduleStop) this.reset();
        break;
      case PEEK:
        if (this.time < (this.blip.length >> 1)) sample = this.blip[2 * this.time];
        else if (this.scheduleStop) this.reset();
        break;
      case NOISE:
        if (this.time < this.noise.length) sample = this.noise[this.time];
        else if (this.scheduleStop) this.reset();
        break;
    }
    return sample;
  }
}

// ─── Voice ───────────────────────────────────────────────────────────────────

class Voice {
  constructor(sr, os, wavetables) {
    this.sr = sr;
    this.os = os;
    this.wavetables = wavetables;
    this.wave = wavetables[0]; // Piano default
    this.bModulate = false;
    this.modulation = 1.0;
    this.tune = 1.0;
    this.octave = 1.0;
    this.velocity = 0;
    this.phase = 0;
    this.phaseInc = 0;
    this.vibratoScale = 0.0002;

    this.vca = new ADSR(sr, os);
    this.lfoVibrato = new LFO(sr, os);
    this.lfoTremolo = new LFO(sr, os);
    this.lfoTremolo.setDcLevel(1.0);
    this.envelopeShaper = new EnvelopeShaper(sr, os);
    this.lpf = new BiquadLPF();
    this.lpf.setCutoff(0.95 * sr / os, sr, 4.0);
  }

  reset() {
    this.vca.reset();
    this.lfoVibrato.reset();
    this.lfoTremolo.reset();
    this.lpf.setCutoff(0.95 * this.sr / this.os, this.sr, 4.0);
  }

  setSound(value) {
    if (value < 0.1) this.wave = this.wavetables[0]; // Piano
    else if (value < 0.2) this.wave = this.wavetables[1]; // Fantasy
    else if (value < 0.3) this.wave = this.wavetables[2]; // Violin
    else if (value < 0.4) this.wave = this.wavetables[3]; // Flute
    else if (value < 0.5) this.wave = this.wavetables[4]; // Guitar1
    else if (value < 0.6) this.wave = this.wavetables[5]; // Guitar2
    else if (value < 0.7) this.wave = this.wavetables[6]; // English Horn
    else if (value < 0.8) this.wave = this.wavetables[0]; // Electro1 (Piano+mod)
    else if (value < 0.9) this.wave = this.wavetables[1]; // Electro2 (Fantasy+mod)
    else this.wave = this.wavetables[2]; // Electro3 (Violin+mod)

    this.bModulate = value >= 0.7;
    this.modulation = 1.0;
  }

  noteOn(frequency, velocity) {
    const oct = Math.floor(2.0 * this.octave);
    const octave = oct === 0 ? 1.0 : oct === 1 ? 2.0 : 4.0;
    this.phaseInc = this.wave.pitchScale * this.tune * octave * frequency * (this.wave.data.length / (this.sr * this.os));
    this.phase = 0;
    this.velocity = velocity;
    this.vca.gate(true);
    this.lfoTremolo.reset();
    this.lfoVibrato.reset();
    this.vibratoScale = 0.000001 * this.phaseInc;
  }

  noteOff() { this.vca.gate(false); }

  isIdle() { return this.vca.isIdle(); }

  triggerModulation() {
    if (this.bModulate) {
      this.modulation = this.modulation > 0.5 ? 0.5 : 1.0;
    }
  }

  clock() {
    if (this.vca.isIdle()) return 0;

    const waveData = this.wave.data;
    const waveSize = waveData.length;
    let sample = 0;

    for (let i = 0; i < this.os; i++) {
      const p1 = this.phase | 0;
      const p2 = (p1 + 1) % waveSize;
      const frac = this.phase - p1;
      let s = (1.0 - frac) * waveData[p1] + frac * waveData[p2];

      // Tremolo
      s *= (0.5 + 0.5 * this.lfoTremolo.clock());
      // VCA envelope
      s *= this.vca.clock();
      // Envelope shaper (skip if nearly zero)
      const gate = s > 1.0e-15 ? 1.0 : 0.0;
      s = gate * this.envelopeShaper.clock(s);
      // Anti-alias filter
      sample += this.lpf.clock(s);

      // Vibrato modulates phase increment
      this.phaseInc += this.vibratoScale * this.lfoVibrato.clock();
      // Advance phase
      this.phase += this.modulation * this.phaseInc;
      if (this.phase >= waveSize) this.phase -= waveSize;
    }

    return sample * this.velocity / this.os;
  }
}

// ─── VL1 Processor ───────────────────────────────────────────────────────────

class VL1Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const sr = options.processorOptions?.sampleRate || sampleRate;
    const os = DEFAULT_OVERSAMPLING;

    this.sr = sr;
    this.os = os;
    this.volume = 0.7;
    this.balance = 0.5;

    // Build wavetables
    this.wavetables = makeWavetables(os);
    this.freqTable = buildFreqTable();

    // Voice
    this.voice = new Voice(sr, os, this.wavetables);

    // Rhythm
    this.rhythm = new Rhythm(sr);

    // Output filters (bandpass: 800Hz LP - 65Hz LP)
    this.lp1 = new IIR1();
    this.lp1.setCutoff(800, sr);
    this.lp2 = new IIR1();
    this.lp2.setCutoff(65, sr);

    // Tempo clock
    this.tempoUnit = 0.034; // sec
    this.minTempoPeriod = 0.170; // sec
    this.tempoPeriod = this.minTempoPeriod;
    this.tempoCounter = 0;
    this.tempoSamples = Math.round(this.tempoPeriod * sr);

    // Current note for monophonic tracking
    this.currentNote = -1;

    this.port.onmessage = this.handleMessage.bind(this);
    this.port.postMessage({ type: 'ready' });
  }

  handleMessage(event) {
    const { type, ...data } = event.data;
    switch (type) {
      case 'noteOn': {
        const note = Math.max(0, Math.min(127, data.note));
        const vel = (data.velocity ?? 100) / 127.0;
        this.currentNote = note;
        this.voice.noteOn(this.freqTable[note], vel);
        break;
      }
      case 'noteOff':
        if (data.note === undefined || data.note === this.currentNote) {
          this.voice.noteOff();
          this.currentNote = -1;
        }
        break;
      case 'allNotesOff':
        this.voice.noteOff();
        this.currentNote = -1;
        break;
      case 'setParam':
        this.setParam(data.index, data.value);
        break;
      case 'dispose':
        break;
    }
  }

  setParam(index, value) {
    value = Math.max(0, Math.min(1, value));
    switch (index) {
      case 0: // sound
        this.voice.setSound(value);
        break;
      case 1: // attack
        this.voice.vca.setAttack(10.0 * value);
        break;
      case 2: // decay
        this.voice.vca.setDecay(10.0 * value);
        break;
      case 3: // sustainLevel
        this.voice.vca.setSustainLevel(10.0 * value);
        break;
      case 4: // sustainTime
        this.voice.vca.setSustainSlope(10.0 * value);
        break;
      case 5: // release
        this.voice.vca.setRelease(10.0 * value);
        break;
      case 6: // vibrato
        {
          const v = value * 10.0;
          if (v > 0) this.voice.lfoVibrato.setFrequency(15.0 / v);
          this.voice.lfoVibrato.enable(v !== 0);
        }
        break;
      case 7: // tremolo
        {
          const t = value * 10.0;
          if (t > 0) this.voice.lfoTremolo.setFrequency(35.0 / t);
          this.voice.lfoTremolo.enable(t !== 0);
        }
        break;
      case 8: // octave (0-1 → 0/1/2)
        this.voice.octave = value;
        break;
      case 9: // tune
        this.voice.tune = value;
        break;
      case 10: // volume
        this.volume = value;
        break;
      case 11: // balance
        this.balance = value;
        break;
      case 12: // tempo (-9 to +9 mapped from 0-1)
        {
          const tempo = Math.round((value - 0.5) * 18); // -9..+9
          this.tempoPeriod = this.minTempoPeriod + this.tempoUnit * Math.abs(tempo);
          this.tempoSamples = Math.round(this.tempoPeriod * this.sr);
        }
        break;
      case 13: // rhythm select (0-1 → 0-9)
        this.rhythm.selectRhythm(Math.min(9, Math.round(value * 9)));
        break;
      case 14: // rhythm on/off
        if (value > 0.5) this.rhythm.play(0);
        else this.rhythm.stop();
        break;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const outL = output[0];
    const outR = output[1] || outL;

    for (let i = 0; i < outL.length; i++) {
      // Tempo clock
      this.tempoCounter++;
      if (this.tempoCounter >= this.tempoSamples) {
        this.tempoCounter = 0;
        this.rhythm.doTrigger();
        this.voice.triggerModulation();
      }

      // Balance mix
      const bal = 0.5 * (this.balance - 0.5);

      // Voice
      let synth = (0.5 + bal) * this.voice.clock();
      // Bandpass filter: LP@800Hz - LP@65Hz
      synth = this.lp1.clock(synth);
      synth -= this.lp2.clock(synth);

      // Rhythm
      const rhythmSample = this.rhythm.clock();
      synth += (0.5 - bal) * rhythmSample;

      const out = this.volume * synth;
      outL[i] = out;
      outR[i] = out;
    }

    return true;
  }
}

registerProcessor('vl1-processor', VL1Processor);
