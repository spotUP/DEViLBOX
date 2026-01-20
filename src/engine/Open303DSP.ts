/**
 * Open303DSP - TypeScript port of the Open303 DSP algorithms
 * Based on Open303 by rosic (Christian Budde)
 */

export const PI = Math.PI;
export const SQRT2 = Math.sqrt(2);
export const ONE_OVER_SQRT2 = 1 / Math.sqrt(2);
export const TINY = 1e-20;

export function clip(x: number, min: number, max: number): number {
  if (x > max) return max;
  if (x < min) return min;
  return x;
}

export function dB2amp(dB: number): number {
  return Math.pow(10, dB / 20);
}

export function amp2dB(amp: number): number {
  return 20 * Math.log10(amp + TINY);
}

export function pitchToFreq(pitch: number, tuning: number = 440.0): number {
  return tuning * Math.pow(2, (pitch - 69) / 12);
}

/**
 * EllipticQuarterBandFilter port
 * 12th order elliptic filter for decimation
 */
export class EllipticQuarterBandFilter {
  private w = new Float64Array(12);

  reset() {
    this.w.fill(0);
  }

  getSample(inVal: number): number {
    const a01 = -9.1891604652189471;
    const a02 = 40.177553696870497;
    const a03 = -110.11636661771178;
    const a04 = 210.18506612078195;
    const a05 = -293.84744771903240;
    const a06 = 308.16345558359234;
    const a07 = -244.06786780384243;
    const a08 = 144.81877911392738;
    const a09 = -62.770692151724198;
    const a10 = 18.867762095902137;
    const a11 = -3.5327094230551848;
    const a12 = 0.31183189275203149;

    const b00 = 0.00013671732099945628;
    const b01 = -0.00055538501265606384;
    const b02 = 0.0013681887636296387;
    const b03 = -0.0022158566490711852;
    const b04 = 0.0028320091007278322;
    const b05 = -0.0029776933151090413;
    const b06 = 0.0030283628243514991;
    const b07 = -0.0029776933151090413;
    const b08 = 0.0028320091007278331;
    const b09 = -0.0022158566490711861;
    const b10 = 0.0013681887636296393;
    const b11 = -0.00055538501265606384;
    const b12 = 0.00013671732099945636;

    const tmp = (inVal + TINY)
      - ((a01 * this.w[0] + a02 * this.w[1]) + (a03 * this.w[2] + a04 * this.w[3]))
      - ((a05 * this.w[4] + a06 * this.w[5]) + (a07 * this.w[6] + a08 * this.w[7]))
      - ((a09 * this.w[8] + a10 * this.w[9]) + (a11 * this.w[10] + a12 * this.w[11]));

    const y = b00 * tmp
      + ((b01 * this.w[0] + b02 * this.w[1]) + (b03 * this.w[2] + b04 * this.w[3]))
      + ((b05 * this.w[4] + b06 * this.w[5]) + (b07 * this.w[6] + b08 * this.w[7]))
      + ((b09 * this.w[8] + b10 * this.w[9]) + (b11 * this.w[10] + b12 * this.w[11]));

    // Shift state
    for (let i = 11; i > 0; i--) {
      this.w[i] = this.w[i - 1];
    }
    this.w[0] = tmp;

    return y;
  }
}

/**
 * OnePoleFilter port
 */
export class OnePoleFilter {
  private x1 = 0;
  private y1 = 0;
  private b0 = 1;
  private b1 = 0;
  private a1 = 0;
  private cutoff = 1000;
  private sampleRate = 44100;
  private mode = 1; // LOWPASS

  static MODES = {
    BYPASS: 0,
    LOWPASS: 1,
    HIGHPASS: 2,
    ALLPASS: 5
  };

  constructor(mode: number = 1) {
    this.mode = mode;
  }

  setSampleRate(sr: number) {
    this.sampleRate = sr;
    this.calcCoeffs();
  }

  setMode(m: number) {
    this.mode = m;
    this.calcCoeffs();
  }

  setCutoff(c: number) {
    this.cutoff = c;
    this.calcCoeffs();
  }

  private calcCoeffs() {
    const x = Math.exp(-2 * PI * this.cutoff / this.sampleRate);
    switch (this.mode) {
      case OnePoleFilter.MODES.LOWPASS:
        this.b0 = 1 - x;
        this.b1 = 0;
        this.a1 = x;
        break;
      case OnePoleFilter.MODES.HIGHPASS:
        this.b0 = (1 + x) / 2;
        this.b1 = -(1 + x) / 2;
        this.a1 = x;
        break;
      case OnePoleFilter.MODES.ALLPASS:
        this.b0 = -x;
        this.b1 = 1;
        this.a1 = x;
        break;
      default:
        this.b0 = 1;
        this.b1 = 0;
        this.a1 = 0;
    }
  }

  getSample(inVal: number): number {
    this.y1 = this.b0 * inVal + this.b1 * this.x1 + this.a1 * this.y1 + TINY;
    this.x1 = inVal;
    return this.y1;
  }

  reset() {
    this.x1 = 0;
    this.y1 = 0;
  }
}

/**
 * TeeBeeFilter port
 */
export class TeeBeeFilter {
  private b0 = 0;
  private y1 = 0;
  private y2 = 0;
  private y3 = 0;
  private y4 = 0;
  private k = 0;
  private g = 1;
  private cutoff = 1000;
  private resonanceRaw = 0;
  private resonanceSkewed = 0;
  private sampleRate = 44100;
  private feedbackHighpass = new OnePoleFilter(OnePoleFilter.MODES.HIGHPASS);

  constructor() {
    this.feedbackHighpass.setCutoff(150.0);
  }

  setSampleRate(sr: number) {
    this.sampleRate = sr;
    this.feedbackHighpass.setSampleRate(sr);
    this.calculateCoefficientsApprox4();
  }

  setCutoff(c: number) {
    this.cutoff = clip(c, 200, 20000);
    this.calculateCoefficientsApprox4();
  }

  setResonance(r: number) {
    this.resonanceRaw = 0.01 * r;
    this.resonanceSkewed = (1.0 - Math.exp(-3.0 * this.resonanceRaw)) / (1.0 - Math.exp(-3.0));
    this.calculateCoefficientsApprox4();
  }

  private calculateCoefficientsApprox4() {
    const wc = (2.0 * PI * this.cutoff) / this.sampleRate;
    const r = this.resonanceSkewed;

    const fx = wc * ONE_OVER_SQRT2 / (2 * PI);
    this.b0 = (0.00045522346 + 6.1922189 * fx) / (1.0 + 12.358354 * fx + 4.4156345 * (fx * fx));
    this.k = fx * (fx * (fx * (fx * (fx * (fx + 7198.6997) - 5837.7917) - 476.47308) + 614.95611) + 213.87126) + 16.998792;
    this.g = this.k * 0.0588235294117647; // 17 reciprocal
    this.g = (this.g - 1.0) * r + 1.0;
    this.g = this.g * (1.0 + r);
    this.k = this.k * r;
  }

  getSample(inVal: number): number {
    const y0 = inVal - this.feedbackHighpass.getSample(this.k * this.y4);
    this.y1 += 2 * this.b0 * (y0 - this.y1 + this.y2);
    this.y2 += this.b0 * (this.y1 - 2 * this.y2 + this.y3);
    this.y3 += this.b0 * (this.y2 - 2 * this.y3 + this.y4);
    this.y4 += this.b0 * (this.y3 - 2 * this.y4);
    return 2 * this.g * this.y4;
  }

  reset() {
    this.y1 = 0;
    this.y2 = 0;
    this.y3 = 0;
    this.y4 = 0;
    this.feedbackHighpass.reset();
  }
}

/**
 * DecayEnvelope port
 */
export class DecayEnvelope {
  private c = 0;
  private y = 0;
  private tau = 1000;
  private sampleRate = 44100;

  setSampleRate(sr: number) {
    this.sampleRate = sr;
    this.calculateCoefficient();
  }

  setDecayTimeConstant(t: number) {
    this.tau = t;
    this.calculateCoefficient();
  }

  private calculateCoefficient() {
    this.c = Math.exp(-1.0 / (this.sampleRate * 0.001 * this.tau));
  }

  trigger() {
    this.y = 1.0;
  }

  getSample(): number {
    this.y *= this.c;
    return this.y;
  }
}

/**
 * AnalogEnvelope port
 */
export class AnalogEnvelope {
  private sampleRate = 44100;
  private attackTime = 0.003;
  private decayTime = 1.0;
  private sustainLevel = 0;
  private releaseTime = 0.001;
  private peakLevel = 1.0;
  
  private time = 0;
  private increment = 0;
  private attackCoeff = 0;
  private decayCoeff = 0;
  private releaseCoeff = 0;
  private previousOutput = 0;
  public isNoteOn = false;

  private attPlusHld = 0;
  private attPlusHldPlusDec = 0;

  constructor() {
    this.increment = 1.0 / this.sampleRate;
  }

  setSampleRate(sr: number) {
    this.sampleRate = sr;
    this.increment = 1.0 / this.sampleRate;
    this.updateCoeffs();
  }

  setAttack(t: number) { this.attackTime = t * 0.001; this.updateCoeffs(); }
  setDecay(t: number) { this.decayTime = t * 0.001; this.updateCoeffs(); }
  setRelease(t: number) { this.releaseTime = t * 0.001; this.updateCoeffs(); }
  setSustainLevel(s: number) { this.sustainLevel = s; }

  private updateCoeffs() {
    this.attackCoeff = 1.0 - Math.exp(-1.0 / (this.sampleRate * this.attackTime + TINY));
    this.decayCoeff = 1.0 - Math.exp(-1.0 / (this.sampleRate * this.decayTime + TINY));
    this.releaseCoeff = 1.0 - Math.exp(-1.0 / (this.sampleRate * this.releaseTime + TINY));
    this.attPlusHld = this.attackTime;
    this.attPlusHldPlusDec = this.attackTime + this.decayTime;
  }

  noteOn() {
    this.time = 0;
    this.isNoteOn = true;
  }

  noteOff() {
    this.isNoteOn = false;
    if (this.time < this.attPlusHldPlusDec) {
      this.time = this.attPlusHldPlusDec;
    }
  }

  getSample(): number {
    let out = 0;
    if (this.time <= this.attPlusHld) {
      out = this.previousOutput + this.attackCoeff * (this.peakLevel - this.previousOutput);
      this.time += this.increment;
    } else if (this.time <= this.attPlusHldPlusDec) {
      out = this.previousOutput + this.decayCoeff * (this.sustainLevel - this.previousOutput);
      this.time += this.increment;
    } else if (this.isNoteOn) {
      out = this.previousOutput + this.decayCoeff * (this.sustainLevel - this.previousOutput);
    } else {
      out = this.previousOutput + this.releaseCoeff * (0 - this.previousOutput);
      this.time += this.increment;
    }
    this.previousOutput = out;
    return out;
  }
}

/**
 * LeakyIntegrator port (for slide and envelope smoothing)
 */
export class LeakyIntegrator {
  private y1 = 0;
  private coeff = 0;
  private sampleRate = 44100;

  setSampleRate(sr: number) {
    this.sampleRate = sr;
  }

  setTimeConstant(tauMs: number) {
    this.coeff = Math.exp(-1.0 / (this.sampleRate * 0.001 * tauMs + TINY));
  }

  getSample(inVal: number): number {
    this.y1 = inVal + this.coeff * (this.y1 - inVal);
    return this.y1;
  }

  setState(s: number) {
    this.y1 = s;
  }
}

/**
 * MipMappedWaveTable port
 */
export class MipMappedWaveTable {
  static readonly tableLength = 1024;
  static readonly numTables = 10;
  private tableSet: Float32Array[] = [];

  constructor() {
    for (let i = 0; i < MipMappedWaveTable.numTables; i++) {
      this.tableSet.push(new Float32Array(MipMappedWaveTable.tableLength + 4));
    }
  }

  fillWithSaw303() {
    const N = MipMappedWaveTable.tableLength;
    const proto = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      proto[n] = (2 * n / (N - 1)) - 1;
    }
    this.generateMipMap(proto);
  }

  fillWithSquare303() {
    const N = MipMappedWaveTable.tableLength;
    const proto = new Float32Array(N);
    const tanhShaperFactor = dB2amp(36.9);
    const tanhShaperOffset = 4.37;
    for (let n = 0; n < N; n++) {
      const saw = (2 * n / (N - 1)) - 1;
      proto[n] = -Math.tanh(tanhShaperFactor * saw + tanhShaperOffset);
    }
    // Circular shift 180 degrees
    const shifted = new Float32Array(N);
    const nShift = Math.round(N * 180 / 360);
    for (let n = 0; n < N; n++) {
      shifted[(n + nShift) % N] = proto[n];
    }
    this.generateMipMap(shifted);
  }

  private generateMipMap(proto: Float32Array) {
    for (let t = 0; t < MipMappedWaveTable.numTables; t++) {
      for (let n = 0; n < MipMappedWaveTable.tableLength; n++) {
        this.tableSet[t][n] = proto[n];
      }
      for (let i = 0; i < 4; i++) {
        this.tableSet[t][MipMappedWaveTable.tableLength + i] = this.tableSet[t][i];
      }
    }
  }

  getValueLinear(index: number, frac: number, table: number): number {
    const t = clip(table, 0, MipMappedWaveTable.numTables - 1);
    const data = this.tableSet[t];
    return data[index] + frac * (data[index + 1] - data[index]);
  }
}

/**
 * BlendOscillator port
 */
export class BlendOscillator {
  private phaseIndex = 0;
  private freq = 440;
  private increment = 0;
  private blend = 0; // 0 = saw, 1 = square
  private sampleRate = 44100;
  private waveTable1 = new MipMappedWaveTable();
  private waveTable2 = new MipMappedWaveTable();

  constructor() {
    this.waveTable1.fillWithSaw303();
    this.waveTable2.fillWithSquare303();
  }

  setSampleRate(sr: number) {
    this.sampleRate = sr;
    this.calculateIncrement();
  }

  setFrequency(f: number) {
    this.freq = f;
    this.calculateIncrement();
  }

  setBlendFactor(b: number) {
    this.blend = b;
  }

  calculateIncrement() {
    this.increment = MipMappedWaveTable.tableLength * this.freq / this.sampleRate;
  }

  getSample(): number {
    while (this.phaseIndex >= MipMappedWaveTable.tableLength) {
      this.phaseIndex -= MipMappedWaveTable.tableLength;
    }

    const intIndex = Math.floor(this.phaseIndex);
    const frac = this.phaseIndex - intIndex;
    const tableNumber = Math.floor(Math.log2(this.increment)) + 2;

    const out1 = (1.0 - this.blend) * this.waveTable1.getValueLinear(intIndex, frac, tableNumber);
    const out2 = this.blend * this.waveTable2.getValueLinear(intIndex, frac, tableNumber);
    
    this.phaseIndex += this.increment;
    return out1 + 0.5 * out2;
  }

  resetPhase() {
    this.phaseIndex = 0;
  }
}

/**
 * BiquadFilter port
 */
export class BiquadFilter {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private freq = 1000; private gain = 0; private bw = 1; private sr = 44100; private mode = 0;

  static MODES = {
    BYPASS: 0,
    LOWPASS6: 1,
    LOWPASS12: 2,
    HIGHPASS6: 3,
    HIGHPASS12: 4,
    BANDPASS: 5,
    BANDREJECT: 6,
    PEAK: 7,
    LOW_SHELF: 8
  };

  setSampleRate(sr: number) { this.sr = sr; this.calcCoeffs(); }
  setMode(m: number) { this.mode = m; this.calcCoeffs(); }
  setFrequency(f: number) { this.freq = f; this.calcCoeffs(); }
  setGain(g: number) { this.gain = g; this.calcCoeffs(); }
  setBandwidth(b: number) { this.bw = b; this.calcCoeffs(); }

  private calcCoeffs() {
    const w = 2 * PI * this.freq / this.sr;
    const s = Math.sin(w), c = Math.cos(w);
    if (this.mode === BiquadFilter.MODES.LOWPASS12) {
      const q = Math.pow(10, this.gain / 20);
      const alpha = s / (2.0 * q);
      const scale = 1.0 / (1.0 + alpha);
      this.a1 = 2.0 * c * scale;
      this.a2 = (alpha - 1.0) * scale;
      this.b1 = (1.0 - c) * scale;
      this.b0 = 0.5 * this.b1;
      this.b2 = this.b0;
    } else if (this.mode === BiquadFilter.MODES.BANDREJECT) {
      const alpha = s * Math.sinh(0.5 * Math.log(2.0) * this.bw * w / s);
      const scale = 1.0 / (1.0 + alpha);
      this.a1 = 2.0 * c * scale;
      this.a2 = (alpha - 1.0) * scale;
      this.b0 = 1.0 * scale;
      this.b1 = -2.0 * c * scale;
      this.b2 = 1.0 * scale;
    } else {
      this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    }
  }

  getSample(inVal: number): number {
    const y = this.b0 * inVal + this.b1 * this.x1 + this.b2 * this.x2 + this.a1 * this.y1 + this.a2 * this.y2 + TINY;
    this.x2 = this.x1; this.x1 = inVal; this.y2 = this.y1; this.y1 = y;
    return y;
  }

  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
}

/**
 * Open303 Engine port
 */
export class Open303 {
  private tuning = 440.0;
  private oscFreq = 440.0;
  private accent = 0.0;
  private cutoff = 1000.0;
  private envMod = 25.0;
  private normalDecay = 1000.0;
  private accentDecay = 200.0;
  private accentGain = 0.0;
  private envScaler = 1.0;
  private envOffset = 0.0;
  private n1 = 1.0;
  private n2 = 1.0;
  private idle = true;
  private oversampling = 4;

  private oscillator = new BlendOscillator();
  private filter = new TeeBeeFilter();
  private ampEnv = new AnalogEnvelope();
  private mainEnv = new DecayEnvelope();
  private pitchSlewLimiter = new LeakyIntegrator();
  private rc1 = new LeakyIntegrator();
  private rc2 = new LeakyIntegrator();
  private highpass1 = new OnePoleFilter(OnePoleFilter.MODES.HIGHPASS);
  private highpass2 = new OnePoleFilter(OnePoleFilter.MODES.HIGHPASS);
  private allpass = new OnePoleFilter(OnePoleFilter.MODES.ALLPASS);
  private antiAliasFilter = new EllipticQuarterBandFilter();
  private notch = new BiquadFilter();
  private deClicker = new BiquadFilter();

  constructor() {
    this.oscillator.setBlendFactor(0); // Default saw
    this.ampEnv.setAttack(0.01);
    this.ampEnv.setDecay(1230.0);
    this.ampEnv.setSustainLevel(0.0);
    this.ampEnv.setRelease(0.5);

    this.pitchSlewLimiter.setTimeConstant(60.0);
    this.rc1.setTimeConstant(3.0);
    this.rc2.setTimeConstant(3.0);

    this.highpass1.setCutoff(44.486);
    this.highpass2.setCutoff(24.167);
    this.allpass.setCutoff(14.008);

    this.notch.setMode(BiquadFilter.MODES.BANDREJECT);
    this.notch.setFrequency(7.5164);
    this.notch.setBandwidth(4.7);

    this.deClicker.setMode(BiquadFilter.MODES.LOWPASS12);
    this.deClicker.setFrequency(200.0);
    this.deClicker.setGain(-3.01);

    this.calculateEnvModScalerAndOffset();
  }

  setSampleRate(sr: number) {
    const osr = sr * this.oversampling;
    this.oscillator.setSampleRate(osr);
    this.filter.setSampleRate(osr);
    this.highpass1.setSampleRate(osr);
    
    this.ampEnv.setSampleRate(sr);
    this.mainEnv.setSampleRate(sr);
    this.pitchSlewLimiter.setSampleRate(sr);
    this.rc1.setSampleRate(sr);
    this.rc2.setSampleRate(sr);
    this.highpass2.setSampleRate(sr);
    this.allpass.setSampleRate(sr);
    this.notch.setSampleRate(sr);
    this.deClicker.setSampleRate(sr);
  }

  setCutoff(c: number) {
    this.cutoff = c;
    this.calculateEnvModScalerAndOffset();
  }

  setResonance(r: number) {
    this.filter.setResonance(r);
  }

  setEnvMod(e: number) {
    this.envMod = e;
    this.calculateEnvModScalerAndOffset();
  }

  setDecay(d: number) {
    this.normalDecay = d;
  }

  setAccent(a: number) {
    this.accent = 0.01 * a;
  }

  setWaveform(w: number) {
    this.oscillator.setBlendFactor(w);
  }

  setSlideTime(s: number) {
    this.pitchSlewLimiter.setTimeConstant(0.2 * s);
  }

  noteOn(pitch: number, _velocity: number, hasAccent: boolean, hasSlide: boolean) {
    this.idle = false;
    if (!hasSlide) {
      this.oscillator.resetPhase();
      this.filter.reset();
      this.highpass1.reset();
      this.highpass2.reset();
      this.allpass.reset();
      this.antiAliasFilter.reset();
      this.notch.reset();
      this.deClicker.reset();
    }

    if (hasAccent) {
      this.accentGain = this.accent;
      this.mainEnv.setDecayTimeConstant(this.accentDecay);
    } else {
      this.accentGain = 0.0;
      this.mainEnv.setDecayTimeConstant(this.normalDecay);
    }

    this.oscFreq = pitchToFreq(pitch, this.tuning);
    if (!hasSlide) {
      this.pitchSlewLimiter.setState(this.oscFreq);
    }
    this.mainEnv.trigger();
    this.ampEnv.noteOn();
  }

  noteOff() {
    this.ampEnv.noteOff();
  }

  private calculateEnvModScalerAndOffset() {
    const c0 = 313.8152786059267e+002;
    const c1 = 2394.411986817546e+003;
    const oF = 0.048292930943553;
    const oC = 0.294391201442418;
    const sLoF = 3.773996325111173;
    const sLoC = 0.736965594166206;
    const sHiF = 4.194548788411135;
    const sHiC = 0.864344900642434;

    const e = this.envMod / 100.0;
    const c = clip((Math.log(this.cutoff) - Math.log(c0)) / (Math.log(c1) - Math.log(c0)), 0, 1);
    const sLo = sLoF * e + sLoC;
    const sHi = sHiF * e + sHiC;
    this.envScaler = (1 - c) * sLo + c * sHi;
    this.envOffset = oF * c + oC;
  }

  getSample(): number {
    if (this.idle) return 0;

    const instFreq = this.pitchSlewLimiter.getSample(this.oscFreq);
    this.oscillator.setFrequency(instFreq);

    const mainEnvOut = this.mainEnv.getSample();
    let tmp1 = this.n1 * this.rc1.getSample(mainEnvOut);
    let tmp2 = 0.0;
    if (this.accentGain > 0.0) tmp2 = mainEnvOut;
    tmp2 = this.n2 * this.rc2.getSample(tmp2);
    tmp1 = this.envScaler * (tmp1 - this.envOffset);
    tmp2 = this.accentGain * tmp2;

    const instCutoff = this.cutoff * Math.pow(2.0, tmp1 + tmp2);
    this.filter.setCutoff(instCutoff);

    let ampEnvOut = this.ampEnv.getSample();
    ampEnvOut += 0.45 * mainEnvOut + this.accentGain * 4.0 * mainEnvOut;
    ampEnvOut = this.deClicker.getSample(ampEnvOut);

    let out = 0;
    // Oversampling loop
    for (let i = 0; i < this.oversampling; i++) {
      let sub = -this.oscillator.getSample();
      sub = this.highpass1.getSample(sub);
      sub = this.filter.getSample(sub);
      out = this.antiAliasFilter.getSample(sub); // Decimation occurs here
    }

    out = this.allpass.getSample(out);
    out = this.highpass2.getSample(out);
    out = this.notch.getSample(out);
    out *= ampEnvOut;

    return out;
  }
}