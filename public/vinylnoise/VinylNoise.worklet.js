// public/vinylnoise/VinylNoise.worklet.js
// Vinyl noise synthesizer — ported from viator-rust (MIT, Landon Viator)
// All DSP classes are binary-compatible with the original C++ plugin.

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
  }

  _updateBpFilter() {
    // Resonance mapped from age: jmap(driveDB, 0,30, 0.05,0.95)
    const driveDB = this._age * 30;
    const reso = 0.05 + (driveDB / 30) * 0.9;  // 0.05..0.95
    const Q = 1 / (2 * reso);
    this._bpFilter.setParams(600, Q, sampleRate);
  }

  _handleMessage(data) {
    switch (data.param) {
      case 'hiss':    this._hissVolume = data.value; break;
      case 'dust':    this._dustVolume = data.value; break;
      case 'age':     this._age = data.value; this._updateBpFilter(); break;
      case 'speed':   this._speed = data.value; break;
      case 'sourceMode': this._sourceMode = !!data.value; break;
    }
  }

  /** dB gain (linear) */
  static _dBToGain(db) { return Math.pow(10, db / 20); }

  /**
   * Exact port of ViatorrustAudioProcessor::synthesizeRandomCrackle()
   * Generates crackle+hiss into outL/outR (same signal both channels).
   */
  _synthesizeCrackle(outL, outR, numSamples) {
    // map 0-1 params to dB, matching viator-rust formula
    const hissDB   = this._hissVolume * 60 - 30; // -30..+30 dB
    const dustDB   = this._dustVolume * 60 - 30;
    const hissGain = VinylNoiseProcessor._dBToGain(hissDB + 5.0);
    const dustGain = VinylNoiseProcessor._dBToGain(dustDB - 6.0);
    const lfoFreqMax = this._speed * 10; // 0..10 Hz

    for (let i = 0; i < numSamples; i++) {
      // LFO (sine, frequency randomly modulated each sample like viator-rust)
      const lfoFreq = Math.random() * lfoFreqMax;
      this._lfoPhase += (2 * Math.PI * lfoFreq) / sampleRate;
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

        let output;
        if (lfoFreq > 0) {
          output = hiss * hissGain * lfoOut + dust * dustGain;
        } else {
          output = hiss * hissGain + dust * dustGain;
        }

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

  process(inputs, outputs) {
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const numSamples = outL ? outL.length : 128;

    // Synthesize crackle+hiss into a temp buffer
    const dustL = new Float32Array(numSamples);
    const dustR = new Float32Array(numSamples);
    this._synthesizeCrackle(dustL, dustR, numSamples);

    // Mix with input signal
    const input = inputs[0];
    const inL = input && input[0] ? input[0] : null;
    const inR = input && input[1] ? input[1] : (inL || null);

    for (let i = 0; i < numSamples; i++) {
      if (this._sourceMode && inL) {
        // Add noise to input (default mode, matches viator-rust sourceTrack=true)
        outL[i] = (inL[i] || 0) + dustL[i];
        outR[i] = ((inR && inR[i]) || 0) + dustR[i];
      } else {
        // Replace output with noise only
        outL[i] = dustL[i];
        outR[i] = dustR[i];
      }
    }

    // Apply age distortion to output
    this._distortMidRange(outL, outR, numSamples);

    return true;
  }
}

registerProcessor('vinyl-noise-processor', VinylNoiseProcessor);
