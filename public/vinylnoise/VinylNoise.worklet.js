// public/vinylnoise/VinylNoise.worklet.js
// Vinyl noise synthesizer — ported from viator-rust (MIT, Landon Viator)
// All DSP classes are binary-compatible with the original C++ plugin.
// Expanded with Patina-inspired vinyl emulation (RIAA, stylus, warp, echo, dropout).

// ─── Ramper (exact port from PluginProcessor.h) ──────────────────────────────
class Ramper {
  constructor() {
    this.targetValue = 0;
    this.stepDelta = 0;
  }
  /** currentValue, newTarget, numberOfSteps */
  setTarget(currentValue, newTarget, numSteps) {
    this.stepDelta = (newTarget - currentValue) / numSteps;
    this.targetValue = newTarget;
  }
  /** Advances ref[0] by stepDelta. Returns true while still ramping. */
  ramp(ref) {
    ref[0] += this.stepDelta;
    return Math.abs(this.targetValue - ref[0]) > 0.001;
  }
}

// ─── Biquad filter (direct form II transposed) ───────────────────────────────
class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  /** 2nd-order Butterworth lowpass */
  setLowpass(fc, sr) {
    const wc = Math.tan(Math.PI * fc / sr);
    const wc2 = wc * wc;
    const k = 1 / (1 + Math.SQRT2 * wc + wc2);
    this.b0 = wc2 * k; this.b1 = 2 * wc2 * k; this.b2 = wc2 * k;
    this.a1 = 2 * (wc2 - 1) * k; this.a2 = (1 - Math.SQRT2 * wc + wc2) * k;
  }
  /** 2nd-order Butterworth highpass */
  setHighpass(fc, sr) {
    const wc = Math.tan(Math.PI * fc / sr);
    const wc2 = wc * wc;
    const k = 1 / (1 + Math.SQRT2 * wc + wc2);
    this.b0 = k; this.b1 = -2 * k; this.b2 = k;
    this.a1 = 2 * (wc2 - 1) * k; this.a2 = (1 - Math.SQRT2 * wc + wc2) * k;
  }
  reset() { this.z1 = 0; this.z2 = 0; }

  /** Audio EQ Cookbook peaking EQ */
  setPeakingEQ(fc, Q, dBgain, sr) {
    const A = Math.pow(10, dBgain / 40);
    const w0 = 2 * Math.PI * fc / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const a0inv = 1 / (1 + alpha / A);
    this.b0 = (1 + alpha * A) * a0inv;
    this.b1 = (-2 * Math.cos(w0)) * a0inv;
    this.b2 = (1 - alpha * A) * a0inv;
    this.a1 = (-2 * Math.cos(w0)) * a0inv;
    this.a2 = (1 - alpha / A) * a0inv;
  }

  /** Audio EQ Cookbook high shelf (S=1) */
  setHighShelf(fc, dBgain, sr) {
    const A = Math.pow(10, dBgain / 40);
    const w0 = 2 * Math.PI * fc / sr;
    const cosW = Math.cos(w0);
    const sinW = Math.sin(w0);
    const alpha = sinW / Math.SQRT2;
    const sqA2 = 2 * Math.sqrt(A) * alpha;
    const a0inv = 1 / ((A+1) - (A-1)*cosW + sqA2);
    this.b0 =  A * ((A+1) + (A-1)*cosW + sqA2) * a0inv;
    this.b1 = -2 * A * ((A-1) + (A+1)*cosW) * a0inv;
    this.b2 =  A * ((A+1) + (A-1)*cosW - sqA2) * a0inv;
    this.a1 =  2 * ((A-1) - (A+1)*cosW) * a0inv;
    this.a2 =  ((A+1) - (A-1)*cosW - sqA2) * a0inv;
  }

  /** BPF constant-0dB-peak — for echo tap coloring */
  setBandpass(fc, Q, sr) {
    const w0 = 2 * Math.PI * fc / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const a0inv = 1 / (1 + alpha);
    this.b0 =  (Math.sin(w0) / 2) * a0inv;
    this.b1 =  0;
    this.b2 = -(Math.sin(w0) / 2) * a0inv;
    this.a1 = (-2 * Math.cos(w0)) * a0inv;
    this.a2 =  (1 - alpha) * a0inv;
  }

  /** 1st-order allpass for worn stylus phase smear */
  setAllpass1(fc, sr) {
    const c = (Math.tan(Math.PI * fc / sr) - 1) / (Math.tan(Math.PI * fc / sr) + 1);
    this.b0 = c; this.b1 = 1; this.b2 = 0;
    this.a1 = c; this.a2 = 0;
  }
}

// ─── LR4 filter = two cascaded 2nd-order Butterworths ────────────────────────
// Matches juce::dsp::LinkwitzRileyFilter (4th-order, -24dB/oct)
class LR4Filter {
  constructor() { this.a = new Biquad(); this.b = new Biquad(); }
  setLowpass(fc, sr)  { this.a.setLowpass(fc, sr);  this.b.setLowpass(fc, sr);  }
  setHighpass(fc, sr) { this.a.setHighpass(fc, sr); this.b.setHighpass(fc, sr); }
  process(x) { return this.b.process(this.a.process(x)); }
  reset() { this.a.reset(); this.b.reset(); }
}

// ─── Topology-Preserving Transform State Variable Filter ─────────────────────
// Matches juce::dsp::StateVariableTPTFilter (bandpass mode)
class TPTSVFilter {
  constructor() {
    this.s1 = 0; this.s2 = 0;
    this.g = 0; this.R2 = 0; this.h = 0;
  }
  /** fc = cutoff Hz, Q = quality factor, sr = sample rate */
  setParams(fc, Q, sr) {
    this.g = Math.tan(Math.PI * fc / sr);
    this.R2 = 1 / Q;
    this.h = 1 / (1 + this.R2 * this.g + this.g * this.g);
  }
  processBandpass(x) {
    const { g, R2, h, s1, s2 } = this;
    const hp = (x - (R2 + g) * s1 - s2) * h;
    const bp = g * hp + s1;
    this.s1 = 2 * g * hp + s1;
    const lp = g * bp + s2;
    this.s2 = 2 * g * bp + s2;
    return bp;
  }
  reset() { this.s1 = 0; this.s2 = 0; }
}

// ─── Ring buffer for delay-based effects (warp, eccentricity, ghost echo) ─────
class RingBuffer {
  constructor(size) { this.buf = new Float32Array(size); this.size = size; this.write = 0; }
  push(x) { this.buf[this.write % this.size] = x; this.write++; }
  readAt(d) {
    return this.buf[(this.write - 1 - Math.round(d) + this.size * 4) % this.size];
  }
  readFrac(d) {
    const i = Math.floor(d), f = d - i;
    return this.readAt(i) + f * (this.readAt(i + 1) - this.readAt(i));
  }
  reset() { this.buf.fill(0); this.write = 0; }
}

// ─── Dropout generator — state-machine amplitude dip ─────────────────────────
class DropoutGenerator {
  constructor() { this._phase = 0; this._gain = 1.0; this._counter = 0; this._targetGain = 1.0; }
  process(intensity, sr) {
    if (this._phase === 0) {
      if (Math.random() < intensity * 0.3 / sr) {
        const isScratch = Math.random() < 0.4;
        this._targetGain  = isScratch ? 0.03 : 0.3;
        this._counter = Math.round(sr * (0.001 + Math.random() * 0.004)); // 1-5ms attack
        this._phase = 1;
      }
    } else if (this._phase === 1) {
      this._gain += (this._targetGain - this._gain) * 0.15;
      if (--this._counter <= 0) { this._counter = Math.round(sr * (0.005 + Math.random() * 0.02)); this._phase = 2; }
    } else if (this._phase === 2) {
      if (--this._counter <= 0) { this._counter = Math.round(sr * (0.01 + Math.random() * 0.04)); this._phase = 3; }
    } else if (this._phase === 3) {
      this._gain += (1.0 - this._gain) * 0.08;
      if (--this._counter <= 0 || this._gain > 0.995) { this._gain = 1.0; this._phase = 0; }
    }
    return this._gain;
  }
  reset() { this._phase = 0; this._gain = 1.0; }
}

// ─── Processor ───────────────────────────────────────────────────────────────
class VinylNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Parameters (0-1 normalized, internal)
    this._hissVolume = 0.5;  // maps to [-30, +30] dB
    this._dustVolume = 0.5;  // maps to [-30, +30] dB
    this._age        = 0.5;  // maps to [0, 30] dB drive
    this._speed      = 0.0;  // maps to [0, 10] Hz LFO freq (0 = no LFO modulation, matches C++ default)
    this._sourceMode = true; // true=add to input, false=replace

    // New emulator params (0-1 normalized)
    this._riaa = 0.3; this._stylusResonance = 0.25; this._wornStylus = 0.0;
    this._pinch = 0.15; this._innerGroove = 0.0; this._ghostEcho = 0.0;
    this._dropout = 0.0; this._warp = 0.0; this._eccentricity = 0.0;

    // ─── Crackle synthesis state ─────────────────────────────────────────────
    this._hissLowpass     = new LR4Filter();  // 1000 Hz LP for noise before speed filter
    this._hissSpeedFilter = new LR4Filter();  // 60 Hz LP — slow modulation gate
    this._hissHighpass    = new LR4Filter();  // 100 Hz HP — dust output filter
    this._noiseLowpass    = new LR4Filter();  // 7000 Hz LP — hiss output filter
    this._ramper          = new Ramper();
    this._rampRef         = new Float32Array(1); // pass-by-ref substitute
    this._rampedValue     = 0.0;
    this._lfoPhase        = 0.0;

    // ─── Age (mid distortion) state ──────────────────────────────────────────
    this._bpFilter = new TPTSVFilter();       // 600 Hz BP — mid-range selector

    // ─── Vinyl emulator filters ───────────────────────────────────────────────
    // RIAA de-emphasis (stereo biquad, coefficients fixed at sample rate)
    this._riaaL = new Biquad(); this._riaaR = new Biquad();
    // Stylus resonance: peaking EQ at 14kHz
    this._stylusResFilter = new Biquad();
    // Worn stylus: HF shelf + allpass phase smear
    this._wornStylusShelf = new Biquad(); this._wornStylusAllpass = new Biquad();
    // Pinch: HPF at 5kHz (per channel for independent state)
    this._pinchHPFL = new Biquad(); this._pinchHPFR = new Biquad();
    // Ghost echo: 3 bandpass filters for tap coloring
    this._echoTapBP = [new Biquad(), new Biquad(), new Biquad()];

    // ─── Ring buffers (one per channel, 150ms covers all delays) ─────────────
    const ringSize = Math.ceil(sampleRate * 0.15);
    this._ringL = new RingBuffer(ringSize); this._ringR = new RingBuffer(ringSize);

    // ─── Dropout generators (independent L/R for stereo realism) ─────────────
    this._dropL = new DropoutGenerator(); this._dropR = new DropoutGenerator();

    // ─── Warp: 3 incommensurate LFOs ─────────────────────────────────────────
    this._warpPhases = [0, 0, 0]; this._warpRates = [0.27, 0.74, 1.81]; // Hz
    // Pre-compute warpInc (constant — _warpRates and sampleRate never change)
    this._warpInc = this._warpRates.map(r => 2 * Math.PI * r / sampleRate);

    // ─── Ghost echo tap delays and gains (constant — pre-computed to avoid GC) ─
    this._tapDelay = [Math.round(sampleRate*0.033), Math.round(sampleRate*0.066), Math.round(sampleRate*0.099)];
    this._tapGain  = [0.12, 0.06, 0.03];

    // ─── Pre-allocated temp buffers (avoid GC churn in process()) ────────────
    this._procL = new Float32Array(128); this._procR = new Float32Array(128);
    this._dustL = new Float32Array(128); this._dustR = new Float32Array(128);

    this._initFilters();

    this.port.onmessage = (e) => this._handleMessage(e.data);

    // Signal to host that we are ready immediately
    this.port.postMessage({ type: 'ready' });
  }

  _initFilters() {
    const sr = sampleRate;
    this._hissLowpass.setLowpass(1000, sr);
    this._hissSpeedFilter.setLowpass(60, sr);
    this._hissHighpass.setHighpass(100, sr);
    this._noiseLowpass.setLowpass(7000, sr);
    this._updateBpFilter();
    // Initialize the crackle ramper: ramp from 0 → 1 over 20ms (matches C++ prepareToPlay).
    // Without this, stepDelta stays 0, rampedValue never reaches 1, and no crackles fire.
    this._ramper.setTarget(0.0, 1.0, Math.round(sr * 0.02));
    this._rampRef[0] = 0.0;
    this._rampedValue = 0.0;
    // Vinyl emulator filters
    this._updateRIAAFilter();
    this._updateStylusResFilter();
    this._updateWornStylusFilters();
    this._updateEchoTapFilters();
    this._pinchHPFL.setHighpass(5000, sr);
    this._pinchHPFR.setHighpass(5000, sr);
  }

  _updateBpFilter() {
    // Resonance mapped from age: jmap(driveDB, 0,30, 0.05,0.95)
    const driveDB = this._age * 30;
    const reso = 0.05 + (driveDB / 30) * 0.9;  // 0.05..0.95
    const Q = 1 / (2 * reso);
    this._bpFilter.setParams(600, Q, sampleRate);
  }

  // ─── RIAA de-emphasis (bilinear transform of analog time constants) ─────────
  _computeRIAACoeffs(sr) {
    const tau1=3180e-6, tau2=318e-6, tau3=75e-6;
    const k = 2 * sr;  // bilinear transform substitution: s → 2/T * (z-1)/(z+1)
    const d1 = [1 + k*tau1, 1 - k*tau1];
    const d2 = [1 + k*tau3, 1 - k*tau3];
    const n  = [1 + k*tau2, 2, 1 - k*tau2];
    // Denominator = convolution of two first-order factors
    const da0 = d1[0]*d2[0], da1 = d1[0]*d2[1]+d1[1]*d2[0], da2 = d1[1]*d2[1];
    const inv = 1 / da0;
    return { b0: n[0]*inv, b1: n[1]*inv, b2: n[2]*inv, a1: da1*inv, a2: da2*inv };
  }

  _updateRIAAFilter() {
    const c = this._computeRIAACoeffs(sampleRate);
    for (const f of [this._riaaL, this._riaaR]) {
      f.b0=c.b0; f.b1=c.b1; f.b2=c.b2; f.a1=c.a1; f.a2=c.a2;
    }
  }

  _updateStylusResFilter() {
    const dB = this._stylusResonance * 8;
    const Q  = 0.7 + this._stylusResonance * 1.3;
    this._stylusResFilter.setPeakingEQ(14000, Q, dB, sampleRate);
  }

  _updateWornStylusFilters() {
    this._wornStylusShelf.setHighShelf(9000, this._wornStylus * -18, sampleRate);
    this._wornStylusAllpass.setAllpass1(6000, sampleRate);
  }

  _updateEchoTapFilters() {
    for (const f of this._echoTapBP) f.setBandpass(2000, 1.5, sampleRate);
  }

  _handleMessage(data) {
    switch (data.param) {
      case 'hiss':    this._hissVolume = data.value; break;
      case 'dust':    this._dustVolume = data.value; break;
      case 'age':     this._age = data.value; this._updateBpFilter(); break;
      case 'speed':   this._speed = data.value; break;
      case 'sourceMode': this._sourceMode = !!data.value; break;
      // Vinyl emulator params
      case 'riaa':            this._riaa = data.value; break;
      case 'stylusResonance': this._stylusResonance = data.value; this._updateStylusResFilter(); break;
      case 'wornStylus':      this._wornStylus = data.value; this._updateWornStylusFilters(); break;
      case 'pinch':           this._pinch = data.value; break;
      case 'innerGroove':     this._innerGroove = data.value; break;
      case 'ghostEcho':       this._ghostEcho = data.value; break;
      case 'dropout':         this._dropout = data.value; break;
      case 'warp':            this._warp = data.value; break;
      case 'eccentricity':    this._eccentricity = data.value; break;
    }
  }

  /** dB gain (linear) */
  static _dBToGain(db) { return Math.pow(10, db / 20); }

  /**
   * Exact port of ViatorrustAudioProcessor::synthesizeRandomCrackle()
   * Generates crackle+hiss into outL/outR (same signal both channels).
   * Side effect: advances _lfoPhase — must run before _processAudio().
   */
  _synthesizeCrackle(outL, outR, numSamples) {
    // map 0-1 params to dB, matching viator-rust formula
    const hissDB   = this._hissVolume * 60 - 30; // -30..+30 dB
    const dustDB   = this._dustVolume * 60 - 30;
    const hissGain = VinylNoiseProcessor._dBToGain(hissDB + 5.0);
    const dustGain = VinylNoiseProcessor._dBToGain(dustDB - 6.0);

    // LFO frequency = exact turntable rotation rate (RPM/60 Hz).
    // At 33 RPM: 0.55 Hz, 45 RPM: 0.75 Hz, 78 RPM: 1.3 Hz.
    // speed param: 0-1 → 0-10 Hz (so speed=0.055 → 0.55 Hz for 33 RPM).
    // Fixed per block (not random) so hiss cycles once per platter revolution.
    const lfoFreq = this._speed * 10; // Hz
    const lfoPhaseInc = (2 * Math.PI * lfoFreq) / sampleRate;

    for (let i = 0; i < numSamples; i++) {
      // Advance LFO phase at turntable rotation rate
      this._lfoPhase += lfoPhaseInc;
      // Wrap phase to [0, 2π] to prevent floating-point precision loss in long sessions
      if (this._lfoPhase > 2 * Math.PI) this._lfoPhase -= 2 * Math.PI;
      const lfoOut = Math.sin(this._lfoPhase);

      // Raw noise
      const noise = (Math.random() * 2.0 - 1.0) * 0.1;

      // Crackle burst: noise → LP1000 → LP60 → square → ×200
      const filteredNoise = this._hissLowpass.process(noise);
      let noiseSpeed = this._hissSpeedFilter.process(filteredNoise);
      noiseSpeed *= 10.0;
      noiseSpeed  = noiseSpeed * noiseSpeed;
      noiseSpeed *= 20.0;
      let signal = noiseSpeed;

      // Ramper envelope — ported from synthesizeRandomCrackle().
      // Note: the C++ uses a while(!_ramper.ramp(v)) loop that advances and multiplies
      // on the same sample as a reset. This JS port advances once per sample and outputs
      // zeros on the exact reset sample. The difference is one sample per crackle cycle
      // — perceptually unnoticeable for vinyl noise.
      if (this._rampedValue >= 1.0) {
        // Reset: start a new fade-in ramp (from current=0.96 to target=1.0 over 3ms)
        this._ramper.setTarget(0.96, 1.0, Math.round(sampleRate * 0.003));
        this._rampedValue = 0.0;
        this._rampRef[0] = 0.0;
      } else {
        signal *= this._rampedValue;
      }

      // Advance ramp one step
      this._ramper.ramp(this._rampRef);
      this._rampedValue = this._rampRef[0];

      // Hiss + dust mix (only when ramp is in progress, i.e. rampedValue < 1.0)
      if (this._rampedValue < 1.0) {
        const hiss = this._noiseLowpass.process(noise) * 0.01;
        const dust = this._hissHighpass.process(signal);

        // Hiss is a constant noise floor (stylus always in groove — no LFO).
        // LFO modulates only the crackle/dust density, not the hiss level.
        const dustMod = lfoFreq > 0 ? Math.max(0, lfoOut) : 1.0;
        const output = hiss * hissGain + dust * dustGain * dustMod;

        outL[i] = output;
        outR[i] = output;
      } else {
        outL[i] = 0;
        outR[i] = 0;
      }
    }
  }

  /**
   * Exact port of ViatorrustAudioProcessor::distortMidRange()
   * Applies arctan mid-range saturation in-place (the "Age" control).
   */
  _distortMidRange(L, R, numSamples) {
    const driveDB = this._age * 30;
    if (driveDB < 0.001) return;

    const drive   = VinylNoiseProcessor._dBToGain(driveDB);
    const mix     = driveDB / 30;
    const compDB  = -6 * mix;                    // jmap(driveDB, 0,30, 0,-6)
    const compGain = VinylNoiseProcessor._dBToGain(compDB);

    for (let i = 0; i < numSamples; i++) {
      // Process both channels but use same BP filter state (mono mid, like original)
      for (const ch of [L, R]) {
        const x   = ch[i];
        const mid  = this._bpFilter.processBandpass(x);
        const rest = x - mid;
        const distMid  = (2 / Math.PI) * Math.atan(mid * drive);
        const compMid  = distMid * compGain;
        ch[i] = (1 - mix) * rest + compMid * mix;
      }
    }
  }

  /**
   * Patina-inspired vinyl emulator signal chain.
   * Processes inL/inR through EQ, distortion, delay, and echo effects.
   * Must be called AFTER _synthesizeCrackle() since eccentricity reads _lfoPhase.
   */
  _processAudio(inL, inR, outL, outR, n) {
    // Pre-compute per-block flags
    const warpActive  = this._warp > 0.001;
    const eccActive   = this._eccentricity > 0.001;
    const ghostActive = this._ghostEcho > 0.001;
    const wornBlend   = this._wornStylus;

    for (let i = 0; i < n; i++) {
      let xL = inL[i], xR = inR[i];

      // 1. RIAA de-emphasis — blend dry with filtered output
      if (this._riaa > 0.001) {
        xL += this._riaa * (this._riaaL.process(xL) - xL);
        xR += this._riaa * (this._riaaR.process(xR) - xR);
      }

      // 2. Stylus resonance — peaking EQ near 14kHz (shared filter state, subtle stereo spread)
      if (this._stylusResonance > 0.001) {
        xL = this._stylusResFilter.process(xL);
        xR = this._stylusResFilter.process(xR);
      }

      // 3. Worn stylus — HF rolloff + allpass phase smear
      if (wornBlend > 0.001) {
        xL = this._wornStylusShelf.process(xL);
        xL += wornBlend * (this._wornStylusAllpass.process(xL) - xL);
        xR = this._wornStylusShelf.process(xR);
        xR += wornBlend * (this._wornStylusAllpass.process(xR) - xR);
      }

      // 4. Pinch — even-harmonic distortion via HF emphasis then tanh
      if (this._pinch > 0.001) {
        const hfL = this._pinchHPFL.process(xL);
        const hfR = this._pinchHPFR.process(xR);
        xL = Math.tanh(xL + Math.tanh(hfL * hfL * 8 * this._pinch));
        xR = Math.tanh(xR + Math.tanh(hfR * hfR * 8 * this._pinch));
      }

      // 5. Inner groove distortion — asymmetric waveshaping
      if (this._innerGroove > 0.001) {
        xL += this._innerGroove * xL * xL;
        xR += this._innerGroove * xR * xR;
        if (this._innerGroove > 0.5) {
          const excess = (this._innerGroove - 0.5) * 2;
          xL = (2 / Math.PI) * Math.atan(xL * (1 + excess * 4));
          xR = (2 / Math.PI) * Math.atan(xR * (1 + excess * 4));
        }
      }

      // 6. Push to ring buffer (after all spectral/harmonic processing)
      this._ringL.push(xL);
      this._ringR.push(xR);

      // 7. Warp + eccentricity — pitch modulation via fractional delay read
      if (warpActive || eccActive) {
        for (let j = 0; j < 3; j++) {
          this._warpPhases[j] += this._warpInc[j];
          if (this._warpPhases[j] > 2 * Math.PI) this._warpPhases[j] -= 2 * Math.PI;
        }
        const warpLFO = (Math.sin(this._warpPhases[0]) +
                         0.5 * Math.sin(this._warpPhases[1]) +
                         0.25 * Math.sin(this._warpPhases[2])) / 1.75;
        // _lfoPhase was advanced by _synthesizeCrackle() — 128-sample offset is inaudible
        const eccLFO = Math.sin(this._lfoPhase);
        const readDelay = Math.max(0.5, 1 + warpLFO * 50 * this._warp + eccLFO * 30 * this._eccentricity);
        xL = this._ringL.readFrac(readDelay);
        xR = this._ringR.readFrac(readDelay);
      } else {
        xL = this._ringL.readAt(1);
        xR = this._ringR.readAt(1);
      }

      // 8. Ghost echo — 3 BPF-colored taps summed, added to signal
      if (ghostActive) {
        let echoSum = 0;
        for (let t = 0; t < 3; t++) {
          // Mono echo (average L+R) processed through shared BPF
          const tapIn = (this._ringL.readAt(this._tapDelay[t]) + this._ringR.readAt(this._tapDelay[t])) * 0.5;
          echoSum += this._echoTapBP[t].process(tapIn) * this._tapGain[t];
        }
        xL += this._ghostEcho * echoSum;
        xR += this._ghostEcho * echoSum;
      }

      // 9. Write output
      outL[i] = xL;
      outR[i] = xR;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const n = outL ? outL.length : 128;

    // Step 1: Synthesize crackle+hiss (side effect: advances _lfoPhase)
    this._synthesizeCrackle(this._dustL, this._dustR, n);

    // Step 2: Build input buffers from source or zeros
    const input = inputs[0];
    const inL = input && input[0] ? input[0] : null;
    const inR = input && input[1] ? input[1] : (inL || null);
    if (this._sourceMode && inL) {
      for (let i = 0; i < n; i++) {
        this._procL[i] = inL[i] || 0;
        this._procR[i] = (inR && inR[i]) || 0;
      }
    } else {
      this._procL.fill(0, 0, n);
      this._procR.fill(0, 0, n);
    }

    // Step 3: Run vinyl emulator signal chain
    this._processAudio(this._procL, this._procR, outL, outR, n);

    // Steps 4 & 5: Add noise, apply dropout
    const dropoutActive = this._dropout > 0.001;
    for (let i = 0; i < n; i++) {
      outL[i] += this._dustL[i];
      outR[i] += this._dustR[i];
      if (dropoutActive) {
        outL[i] *= this._dropL.process(this._dropout, sampleRate);
        outR[i] *= this._dropR.process(this._dropout, sampleRate);
      }
    }

    // Step 6: Age distortion (mid-range arctan saturation)
    this._distortMidRange(outL, outR, n);

    return true;
  }
}

registerProcessor('vinyl-noise-processor', VinylNoiseProcessor);
