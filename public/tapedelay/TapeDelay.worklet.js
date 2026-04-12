// public/tapedelay/TapeDelay.worklet.js
// Tape delay effect — ported from cyrusasfa/TapeDelay (MIT).
// Original: JUCE-based RE-201 / Echoplex tape delay.
// This version completes the intended design: interpolated delay line,
// feedback, wow/flutter LFO modulation, tape saturation, and tone filter.

class TapeDelayProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Parameters (0–1 normalized unless noted)
    this.delayTime = 0.3;     // 0–2 seconds
    this.feedback  = 0.4;     // 0–0.995
    this.mix       = 0.5;     // 0–1 dry/wet
    this.toneFreq  = 4000;    // Hz, lowpass cutoff on feedback path
    this.drive     = 0.0;     // 0–1 tape saturation amount
    this.wowRate   = 0.5;     // Hz, slow pitch wobble
    this.wowDepth  = 0.0;     // 0–1 wow amount (ms range)
    this.flutterRate = 6.0;   // Hz, fast pitch wobble
    this.flutterDepth = 0.0;  // 0–1 flutter amount

    // Internal state
    this.sr = sampleRate;
    this.maxDelaySamples = Math.ceil(2.5 * this.sr); // 2.5s max
    this.bufL = new Float32Array(this.maxDelaySamples);
    this.bufR = new Float32Array(this.maxDelaySamples);
    this.writePos = 0;

    // Smoothed delay time (in samples)
    this.smoothDelay = this.delayTime * this.sr;
    this.smoothAlpha = 0.9995; // ~50ms ramp at 48kHz

    // LFO phases
    this.wowPhase = 0;
    this.flutterPhase = 0;

    // Tone filter state (one-pole lowpass per channel)
    this.lpL = 0;
    this.lpR = 0;

    this.port.onmessage = (e) => {
      const { param, value } = e.data;
      switch (param) {
        case 'delayTime':    this.delayTime = value; break;
        case 'feedback':     this.feedback = Math.min(value, 0.995); break;
        case 'mix':          this.mix = value; break;
        case 'toneFreq':     this.toneFreq = value; break;
        case 'drive':        this.drive = value; break;
        case 'wowRate':      this.wowRate = value; break;
        case 'wowDepth':     this.wowDepth = value; break;
        case 'flutterRate':  this.flutterRate = value; break;
        case 'flutterDepth': this.flutterDepth = value; break;
      }
    };
  }

  // Soft-clip tape saturation (tanh approximation)
  saturate(x, amount) {
    if (amount < 0.001) return x;
    const gained = x * (1 + amount * 3);
    // Fast tanh approximation
    const x2 = gained * gained;
    return gained * (27 + x2) / (27 + 9 * x2);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0]) return true;

    const inL = input[0];
    const inR = input[1] || input[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const len = inL.length;

    const maxD = this.maxDelaySamples;
    const targetDelay = this.delayTime * this.sr;
    const fb = this.feedback;
    const wet = this.mix;
    const dry = 1 - wet;
    const driveAmt = this.drive;

    // One-pole lowpass coefficient
    const fc = Math.min(this.toneFreq, this.sr * 0.49);
    const lpCoeff = 1 - Math.exp(-2 * Math.PI * fc / this.sr);

    // LFO increments
    const wowInc = (2 * Math.PI * this.wowRate) / this.sr;
    const flutterInc = (2 * Math.PI * this.flutterRate) / this.sr;
    // Max wow deviation in samples (~3ms at full depth)
    const wowMaxSamples = this.wowDepth * 0.003 * this.sr;
    // Max flutter deviation in samples (~0.5ms at full depth)
    const flutterMaxSamples = this.flutterDepth * 0.0005 * this.sr;

    for (let i = 0; i < len; i++) {
      // Smooth delay time
      this.smoothDelay += (targetDelay - this.smoothDelay) * (1 - this.smoothAlpha);

      // LFO modulation
      const wowMod = Math.sin(this.wowPhase) * wowMaxSamples;
      const flutterMod = Math.sin(this.flutterPhase) * flutterMaxSamples;
      this.wowPhase += wowInc;
      this.flutterPhase += flutterInc;
      if (this.wowPhase > 2 * Math.PI) this.wowPhase -= 2 * Math.PI;
      if (this.flutterPhase > 2 * Math.PI) this.flutterPhase -= 2 * Math.PI;

      const modulatedDelay = Math.max(1, this.smoothDelay + wowMod + flutterMod);

      // Read position with linear interpolation
      let readPos = this.writePos - modulatedDelay + maxD;
      const readIdx = Math.floor(readPos);
      const frac = readPos - readIdx;
      const idx0 = readIdx % maxD;
      const idx1 = (readIdx + 1) % maxD;

      const delayedL = (1 - frac) * this.bufL[idx0] + frac * this.bufL[idx1];
      const delayedR = (1 - frac) * this.bufR[idx0] + frac * this.bufR[idx1];

      // Tone filter on feedback path (one-pole lowpass)
      this.lpL += lpCoeff * (delayedL - this.lpL);
      this.lpR += lpCoeff * (delayedR - this.lpR);

      // Tape saturation on feedback signal
      const fbL = this.saturate(this.lpL, driveAmt);
      const fbR = this.saturate(this.lpR, driveAmt);

      // Write to delay buffer: input + filtered/saturated feedback
      this.bufL[this.writePos] = inL[i] + fbL * fb;
      this.bufR[this.writePos] = inR[i] + fbR * fb;

      // Output: dry/wet mix
      outL[i] = dry * inL[i] + wet * delayedL;
      outR[i] = dry * inR[i] + wet * delayedR;

      if (++this.writePos >= maxD) this.writePos = 0;
    }

    return true;
  }
}

registerProcessor('tape-delay-processor', TapeDelayProcessor);
