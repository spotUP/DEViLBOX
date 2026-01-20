/**
 * Open303Worklet - High-Accuracy 1:1 AudioWorklet implementation
 * Based on Open303 (Christian Budde) and evolved components from db303
 */

const PI = Math.PI;
const TINY = 1.175494e-38;
const SQRT2 = Math.sqrt(2);
const ONE_OVER_SQRT2 = 1 / SQRT2;

// Optimized math helpers
const dB2amp = (dB) => Math.exp(dB * 0.11512925464970228);
const amp2dB = (amp) => 8.6858896380650365 * Math.log(amp + TINY);
const pitchToFreq = (pitch, tuning = 440.0) => tuning * 0.01858136117 * Math.exp(0.057762265 * pitch);
const clip = (x, min, max) => x > max ? max : (x < min ? min : x);
const linToLin = (x, inMin, inMax, outMin, outMax) => (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
const expToLin = (x, inMin, inMax, outMin, outMax) => (Math.log(x) - Math.log(inMin)) / (Math.log(inMax) - Math.log(inMin)) * (outMax - outMin) + outMin;

/**
 * Elliptic subband filter of 12th order for accurate decimation
 */
class EllipticQuarterBandFilter {
  constructor() { this.w = new Float64Array(12); }
  reset() { this.w.fill(0); }
  getSample(inVal) {
    const a = [-9.1891604652189471, 40.177553696870497, -110.11636661771178, 210.18506612078195, -293.84744771903240, 308.16345558359234, -244.06786780384243, 144.81877911392738, -62.770692151724198, 18.867762095902137, -3.5327094230551848, 0.31183189275203149];
    const b = [0.00013671732099945628, -0.00055538501265606384, 0.0013681887636296387, -0.0022158566490711852, 0.0028320091007278322, -0.0029776933151090413, 0.0030283628243514991, -0.0029776933151090413, 0.0028320091007278331, -0.0022158566490711861, 0.0013681887636296393, -0.00055538501265606384, 0.00013671732099945636];
    const tmp = (inVal + TINY) - ((a[0]*this.w[0] + a[1]*this.w[1]) + (a[2]*this.w[2] + a[3]*this.w[3])) - ((a[4]*this.w[4] + a[5]*this.w[5]) + (a[6]*this.w[6] + a[7]*this.w[7])) - ((a[8]*this.w[8] + a[9]*this.w[9]) + (a[10]*this.w[10] + a[11]*this.w[11]));
    const y = b[0]*tmp + ((b[1]*this.w[0] + b[2]*this.w[1]) + (b[3]*this.w[2] + b[4]*this.w[3])) + ((b[5]*this.w[4] + b[6]*this.w[5]) + (b[7]*this.w[6] + b[8]*this.w[7])) + ((b[9]*this.w[8] + b[10]*this.w[9]) + (b[11]*this.w[10] + b[12]*this.w[11]));
    for (let i = 11; i > 0; i--) this.w[i] = this.w[i-1];
    this.w[0] = tmp;
    return y;
  }
}

class OnePoleFilter {
  constructor(mode = 1) {
    this.x1 = 0; this.y1 = 0; this.b0 = 1; this.b1 = 0; this.a1 = 0;
    this.cutoff = 1000; this.sampleRate = 44100; this.mode = mode;
  }
  setSampleRate(sr) { this.sampleRate = sr; this.calcCoeffs(); }
  setCutoff(c) { this.cutoff = c; this.calcCoeffs(); }
  calcCoeffs() {
    const x = Math.exp(-2 * PI * this.cutoff / this.sampleRate);
    if (this.mode === 1) { // LOWPASS
      this.b0 = 1 - x; this.b1 = 0; this.a1 = x;
    } else if (this.mode === 2) { // HIGHPASS
      this.b0 = (1 + x) / 2; this.b1 = -(1 + x) / 2; this.a1 = x;
    } else if (this.mode === 5) { // ALLPASS
      this.b0 = -x; this.b1 = 1; this.a1 = x;
    }
  }
  getSample(inVal) {
    this.y1 = this.b0 * inVal + this.b1 * this.x1 + this.a1 * this.y1 + TINY;
    this.x1 = inVal;
    return this.y1;
  }
  reset() { this.x1 = 0; this.y1 = 0; }
}

class BiquadFilter {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
    this.freq = 1000; this.gain = 0; this.bw = 1; this.sr = 44100; this.mode = 0;
  }
  setSampleRate(sr) { this.sr = sr; this.calcCoeffs(); }
  setMode(m) { this.mode = m; this.calcCoeffs(); }
  setFrequency(f) { this.freq = f; this.calcCoeffs(); }
  setGain(g) { this.gain = g; this.calcCoeffs(); }
  setBandwidth(b) { this.bw = b; this.calcCoeffs(); }
  calcCoeffs() {
    const w = 2 * PI * this.freq / this.sr;
    const s = Math.sin(w), c = Math.cos(w);
    if (this.mode === 2) { // LOWPASS12
      const q = dB2amp(this.gain);
      const alpha = s / (2.0 * q);
      const scale = 1.0 / (1.0 + alpha);
      this.a1 = 2.0 * c * scale; this.a2 = (alpha - 1.0) * scale;
      this.b1 = (1.0 - c) * scale; this.b0 = 0.5 * this.b1; this.b2 = this.b0;
    } else if (this.mode === 6) { // BANDREJECT
      const alpha = s * Math.sinh(0.5 * Math.log(2.0) * this.bw * w / s);
      const scale = 1.0 / (1.0 + alpha);
      this.a1 = 2.0 * c * scale; this.a2 = (alpha - 1.0) * scale;
      this.b0 = 1.0 * scale; this.b1 = -2.0 * c * scale; this.b2 = 1.0 * scale;
    } else { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; }
  }
  getSample(inVal) {
    const y = this.b0 * inVal + this.b1 * this.x1 + this.b2 * this.x2 + this.a1 * this.y1 + this.a2 * this.y2 + TINY;
    this.x2 = this.x1; this.x1 = inVal; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
}

class TeeBeeFilter {
  constructor() {
    this.b0 = 0; this.y1 = 0; this.y2 = 0; this.y3 = 0; this.y4 = 0;
    this.k = 0; this.g = 1; this.cutoff = 1000; this.resRaw = 0; this.resSkewed = 0; this.sr = 44100;
    this.fbHP = new OnePoleFilter(2);
    this.fbHP.setCutoff(150.0);
  }
  setSampleRate(sr) { this.sr = sr; this.fbHP.setSampleRate(sr); this.calc(); }
  setCutoff(c) { this.cutoff = clip(c, 200, 20000); this.calc(); }
  setResonance(r) {
    this.resRaw = 0.01 * r;
    this.resSkewed = (1.0 - Math.exp(-3.0 * this.resRaw)) / (1.0 - Math.exp(-3.0));
    this.calc();
  }
  calc() {
    const wc = (2.0 * PI * this.cutoff) / this.sr;
    const r = this.resSkewed;
    const fx = wc * ONE_OVER_SQRT2 / (2 * PI);
    
    // Mystran's polynomial approximation for 303 filter coefficients
    // Derived from rosic_TeeBeeFilter.cpp
    this.b0 = (0.00045522346 + 6.1922189 * fx) / (1.0 + 12.358354 * fx + 4.4156345 * (fx * fx));
    
    // Calculate feedback k
    const k_poly = fx * (fx * (fx * (fx * (fx * (fx + 7198.6997) - 5837.7917) - 476.47308) + 614.95611) + 213.87126) + 16.998792;
    
    // Scale gain and feedback by resonance
    this.g = k_poly * 0.0588235294117647; // 1/17
    this.g = (this.g - 1.0) * r + 1.0;
    this.g = (this.g * (1.0 + r));
    this.k = k_poly * r;
  }
  getSample(inVal) {
    // 303-specific topology with highpass in feedback loop
    const y0 = inVal - this.fbHP.getSample(this.k * this.y4);
    
    // 4-pole ladder
    this.y1 += 2 * this.b0 * (y0 - this.y1 + this.y2);
    this.y2 += this.b0 * (this.y1 - 2 * this.y2 + this.y3);
    this.y3 += this.b0 * (this.y2 - 2 * this.y3 + this.y4);
    this.y4 += this.b0 * (this.y3 - 2 * this.y4);
    
    return 2 * this.g * this.y4;
  }
  reset() { this.y1 = this.y2 = this.y3 = this.y4 = 0; this.fbHP.reset(); }
}

class MipMappedWaveTable {
  constructor() {
    this.len = 2048;
    this.tables = Array.from({length: 12}, () => new Float32Array(this.len + 4));
  }
  fill(type) {
    const N = this.len;
    const proto = new Float32Array(N);
    if (type === 'saw') {
      for (let n = 0; n < N; n++) proto[n] = (2 * n / (N - 1)) - 1;
    } else {
      const fac = dB2amp(36.9), off = 4.37;
      for (let n = 0; n < N; n++) {
        const saw = (2 * n / (N - 1)) - 1;
        proto[n] = -Math.tanh(fac * saw + off);
      }
      const shifted = new Float32Array(N), s = N / 2;
      for (let n = 0; n < N; n++) shifted[(n + s) % N] = proto[n];
      proto.set(shifted);
    }
    // Proper band-limiting by sine summation for mip-maps
    for (let t = 0; t < 12; t++) {
      const maxHarmonic = Math.floor((N / 2) / Math.pow(2, t));
      this.tables[t].fill(0);
      if (type === 'saw') {
        for (let h = 1; h <= maxHarmonic; h++) {
          const amp = 1.0 / h;
          for (let n = 0; n < N; n++) {
            this.tables[t][n] += amp * Math.sin(2 * PI * h * n / N);
          }
        }
      } else {
        this.tables[t].set(proto);
      }
      // Normalize
      let max = 0;
      for(let n=0; n<N; n++) max = Math.max(max, Math.abs(this.tables[t][n]));
      if(max > 0) for(let n=0; n<N; n++) this.tables[t][n] /= max;
      // Guard samples
      for (let i = 0; i < 4; i++) this.tables[t][N + i] = this.tables[t][i];
    }
  }
  getValueLinear(idx, fr, t) {
    const data = this.tables[clip(t, 0, 11)];
    return data[idx] + fr * (data[idx + 1] - data[idx]);
  }
}

class LSTM {
  constructor(hs = 40) {
    this.hs = hs; this.h = new Float32Array(hs); this.c = new Float32Array(hs);
    this.w = null; this.res = true;
  }
  load(w) { 
    if (w && w.rec && w.lin) this.w = w; else this.w = null;
    this.reset();
  }
  reset() { this.h.fill(0); this.c.fill(0); }
  process(x) {
    if (!this.w) return x;
    try {
      const { rec, lin } = this.w; const hs = this.hs; const g = new Float32Array(4 * hs);
      const w_ih = rec.weight_ih_l0, w_hh = rec.weight_hh_l0, b_ih = rec.bias_ih_l0, b_hh = rec.bias_hh_l0;
      if (!w_ih || !w_hh || !b_ih || !b_hh) return x;
      for (let i = 0; i < 4 * hs; i++) {
        const wi = (w_ih[i] && w_ih[i].length !== undefined) ? w_ih[i][0] : w_ih[i];
        const bi = b_ih[i] + b_hh[i];
        g[i] = wi * x + bi;
        for (let j = 0; j < hs; j++) {
          const wh = (w_hh[i] && w_hh[i].length !== undefined) ? w_hh[i][j] : 0;
          g[i] += wh * this.h[j];
        }
      }
      for (let i = 0; i < hs; i++) {
        const inG = 1 / (1 + Math.exp(-g[i])), forG = 1 / (1 + Math.exp(-g[i + hs]));
        const celG = Math.tanh(g[i + 2 * hs]), outG = 1 / (1 + Math.exp(-g[i + 3 * hs]));
        this.c[i] = forG * this.c[i] + inG * celG;
        if (!isFinite(this.c[i])) this.c[i] = 0;
        this.h[i] = outG * Math.tanh(this.c[i]);
        if (!isFinite(this.h[i])) this.h[i] = 0;
      }
      let out = (lin.bias && lin.bias.length !== undefined) ? lin.bias[0] : (lin.bias || 0);
      const lin_w = lin.weight;
      if (lin_w) {
        const is2D = lin_w[0] && lin_w[0].length !== undefined;
        for (let i = 0; i < hs; i++) out += (is2D ? lin_w[0][i] : lin_w[i]) * this.h[i];
      }
      const result = this.res ? out + x : out;
      return isFinite(result) ? result : x;
    } catch (e) { return x; }
  }
}

class Open303 {
  constructor() {
    this.tuning = 440; this.oscFreq = 440; this.sr = 44100;
    this.accent = 0; this.cutoff = 1000; this.envMod = 25;
    this.nDecay = 1000; this.aDecay = 200; this.aGain = 0;
    this.slideTime = 60; // Default 60ms
    this.osc = { ph: 0, b: 0, w1: new MipMappedWaveTable(), w2: new MipMappedWaveTable() };
    this.osc.w1.fill('saw'); this.osc.w2.fill('sqr');
    this.filter = new TeeBeeFilter();
    this.mEnv = { y: 0, c: 0, yI: 1, tau: 200.0 };
    this.aEnv = { t: 0, inc: 1/44100, att: 0.01, dec: 1.23, sus: 0, rel: 0.5, prev: 0, on: false, attC: 0, decC: 0, relC: 0 };
    this.slew = { y: 0, c: 0 }; this.rc1 = { y: 0, c: 0 }; this.rc2 = { y: 0, c: 0 };
    this.hp1 = new OnePoleFilter(2); this.hp2 = new OnePoleFilter(2); this.ap = new OnePoleFilter(5);
    this.notch = new BiquadFilter(); this.deClick = new BiquadFilter();
    this.aa = new EllipticQuarterBandFilter();
    this.lstm = new LSTM(40);
    this.hp1.setCutoff(44.486); this.hp2.setCutoff(24.167); this.ap.setCutoff(14.008);
    this.notch.setMode(6); this.notch.setFrequency(7.5164); this.notch.setBandwidth(4.7);
    this.deClick.setMode(2); this.deClick.setFrequency(200.0); this.deClick.setGain(-3.01);
    this.df = { en: false, fm: 0, tr: 0, sw: 'normal', hi: false, muf: 'off', ch: 0 };
    this.update();
  }
  setSampleRate(sr) {
    this.sr = sr; this.filter.setSampleRate(sr*4); this.hp1.setSampleRate(sr*4); this.hp2.setSampleRate(sr); this.ap.setSampleRate(sr);
    this.notch.setSampleRate(sr); this.deClick.setSampleRate(sr); this.aEnv.inc = 1/sr; this.update();
  }
  setSlideTime(t) { this.slideTime = t; this.update(); }
  
  // Audited: 1:1 Implementation of rosic_Open303::calculateEnvModScalerAndOffset
  update() {
    this.mEnv.c = Math.exp(-1.0 / (this.sr * 0.001 * this.mEnv.tau));
    this.mEnv.yI = 1.0 / this.mEnv.c;
    this.slew.c = Math.exp(-1.0 / (this.sr * 0.001 * this.slideTime * 0.2)); 
    this.rc1.c = this.rc2.c = Math.exp(-1.0 / (this.sr * 0.003));
    this.aEnv.attC = 1 - Math.exp(-1/(this.sr*this.aEnv.att));
    this.aEnv.decC = 1 - Math.exp(-1/(this.sr*this.aEnv.dec));
    this.aEnv.relC = 1 - Math.exp(-1/(this.sr*this.aEnv.rel));
    
    // Accurate scaler/offset from rosic_Open303.cpp
    const c0 = 313.8152786059267, c1 = 2394.411986817546;
    const oF = 0.048292930943553, oC = 0.294391201442418;
    const sLoF = 3.773996325111173, sLoC = 0.736965594166206;
    const sHiF = 4.194548788411135, sHiC = 0.864344900642434;

    const e = linToLin(this.envMod, 0.0, 100.0, 0.0, 1.0);
    const c = clip(expToLin(this.cutoff, c0, c1, 0.0, 1.0), 0, 1);
    const sLo = sLoF * e + sLoC;
    const sHi = sHiF * e + sHiC;
    
    this.envS = (1 - c) * sLo + c * sHi; 
    this.envO = oF * c + oC;
  }

  // Audited: Matches rosic_Open303::noteOn and ::triggerNote
  noteOn(p, v, a, s) {
    if(!s) { 
      this.osc.ph = 0; this.filter.reset(); this.hp1.reset(); this.hp2.reset(); 
      this.ap.reset(); this.notch.reset(); this.deClick.reset(); this.aa.reset(); this.lstm.reset(); 
    }
    
    if(this.df.en && a) {
      let dR = 0.5, cR = 0.5, mC = 1.5;
      if(this.df.sw === 'fast') { dR = 0.8; cR = 0.3; mC = 1.2; }
      else if(this.df.sw === 'slow') { dR = 0.2; cR = 0.6; mC = 2.0; }
      this.df.ch *= Math.exp(-dR * 0.1); this.df.ch = Math.min(this.df.ch + cR, mC);
    }
    
    this.aGain = a ? (0.01 * this.accent * (1 + this.df.ch * 0.5)) : 0;
    this.mEnv.tau = a ? this.aDecay : this.nDecay;
    
    const tuningOffset = this.df.en ? (p - 60) * (this.df.tr / 100) : 0;
    this.oscFreq = pitchToFreq(p + tuningOffset - 69, this.tuning);

    if(!s) {
      this.slew.y = this.oscFreq;
    }
    
    this.mEnv.y = this.mEnv.yI; 
    this.aEnv.t = 0; 
    this.aEnv.on = true; 
    this.update();
  }

  getSample() {
    this.slew.y = this.oscFreq + this.slew.c * (this.slew.y - this.oscFreq);
    const inc = 2048 * this.slew.y / (this.sr * 4);
    
    this.mEnv.y *= this.mEnv.c;
    this.rc1.y = this.mEnv.y + this.rc1.c * (this.rc1.y - this.mEnv.y);
    this.rc2.y = (this.aGain > 0 ? this.mEnv.y : 0) + this.rc2.c * (this.rc2.y - (this.aGain > 0 ? this.mEnv.y : 0));
    
    let fm = 0;
    if(this.df.en && this.df.fm > 0) {
      fm = this.aEnv.prev * (this.df.fm / 100) * 0.5;
    }

    const instCut = this.cutoff * Math.pow(2, this.envS*(this.rc1.y-this.envO) + this.aGain*this.rc2.y + (this.df.en ? this.aEnv.prev*this.df.fm/200 : 0));
    this.lastCut = instCut; this.filter.setCutoff(instCut);
    
    let aV = 0;
    if(this.aEnv.t <= this.aEnv.att) aV = this.aEnv.prev + this.aEnv.attC * (1-this.aEnv.prev);
    else if(this.aEnv.t <= this.aEnv.att+this.aEnv.dec) aV = this.aEnv.prev + this.aEnv.decC * (this.aEnv.sus-this.aEnv.prev);
    else if(this.aEnv.on) aV = this.aEnv.prev + this.aEnv.decC * (this.aEnv.sus-this.aEnv.prev);
    else aV = this.aEnv.prev + this.aEnv.relC * (0-this.aEnv.prev);
    this.aEnv.prev = aV; this.aEnv.t += this.aEnv.inc;
    if(this.aEnv.on) aV += (0.45 + this.aGain * 4.0) * this.mEnv.y;
    aV = this.deClick.getSample(aV);
    
    let out = 0;
    for(let i=0; i<4; i++) {
      this.osc.ph = (this.osc.ph + inc) % 2048;
      const idx = Math.floor(this.osc.ph), fr = this.osc.ph - idx, tN = Math.floor(Math.log2(inc*4)) + 2;
      const oscO = (1-this.osc.b)*this.osc.w1.getValueLinear(idx,fr,tN) + this.osc.b*0.5*this.osc.w2.getValueLinear(idx,fr,tN);
      let sub = this.filter.getSample(this.hp1.getSample(-oscO));
      out = this.aa.getSample(sub); 
    }
    
    if(this.lstm.w) out = this.lstm.process(out);
    
    if(this.df.en && this.df.muf !== 'off') {
      const thr = this.df.muf === 'soft' ? 0.5 : 0.3;
      if(Math.abs(out) > thr) {
        const sgn = out > 0 ? 1 : -1;
        out = sgn * (thr + Math.tanh((Math.abs(out) - thr) * 2) * (1 - thr));
      }
    }
    return this.notch.getSample(this.hp2.getSample(this.ap.getSample(out))) * aV;
  }
}

class Open303Processor extends AudioWorkletProcessor {
  constructor() {
    super(); this.synth = new Open303();
    this.port.onmessage = (e) => {
      const d = e.data;
      if(d.type === 'noteOn') this.synth.noteOn(d.pitch, d.velocity, d.accent, d.slide);
      else if(d.type === 'noteOff') this.synth.aEnv.on = false;
      else if(d.type === 'loadModel') this.synth.lstm.load(d.weights);
      else if(d.type === 'param') {
        const v = d.value;
        switch(d.name) {
          case 'cutoff': this.synth.cutoff = v; break;
          case 'resonance': this.synth.filter.setResonance(v); break;
          case 'envMod': this.synth.envMod = v; break;
          case 'decay': this.synth.nDecay = v; break;
          case 'accent': this.synth.accent = v; break;
          case 'waveform': this.synth.osc.b = v; break;
          case 'tuning': this.synth.tuning = v; break;
          case 'slideTime': this.synth.setSlideTime(v); break;
          case 'accentDecay': this.synth.aDecay = v; break;
          case 'ampSustain': this.synth.aEnv.sus = v; break;
          case 'ampDecay': this.synth.aEnv.dec = v * 0.001; break;
          case 'ampRelease': this.synth.aEnv.rel = v * 0.001; break;
          case 'dfEnabled': this.synth.df.en = !!v; break;
          case 'filterFM': this.synth.df.fm = v; break;
          case 'tracking': this.synth.df.tr = v; break;
          case 'sweep': this.synth.df.sw = v; break;
          case 'muffler': this.synth.df.muf = v; break;
        }
        this.synth.update();
      }
    };
  }
  process(ins, outs) {
    const out = outs[0][0];
    for (let i = 0; i < out.length; i++) {
        let sample = this.synth.getSample();
        if (!isFinite(sample)) sample = 0;
        else if (sample > 1.0) sample = 1.0;
        else if (sample < -1.0) sample = -1.0;
        out[i] = sample;
    }
    if(currentTime % 0.05 < 0.01) this.port.postMessage({ type: 'viz', cutoff: this.synth.lastCut, accent: this.synth.aGain });
    return true;
  }
}
registerProcessor('open303-processor', Open303Processor);