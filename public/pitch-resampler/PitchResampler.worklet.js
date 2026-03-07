/**
 * PitchResampler.worklet.js — Simple real-time pitch shifter via linear-interpolation resampling.
 *
 * Inserted between WASM engine outputs and synthBus so the DJ pitch slider
 * works for all native/WASM engines without per-engine modifications.
 *
 * Messages:
 *   { type: 'set-rate', rate: number }  — playback rate (1.0 = normal, 2.0 = octave up)
 */

class PitchResamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.rate = 1.0;

    // Circular buffer (stereo) — 8192 samples gives ~170ms at 48kHz
    this.bufSize = 8192;
    this.bufL = new Float32Array(this.bufSize);
    this.bufR = new Float32Array(this.bufSize);
    this.writePos = 0;
    this.readPos = 0.0; // fractional for interpolation
    this.available = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'set-rate') {
        this.rate = Math.max(0.25, Math.min(4.0, e.data.rate));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0 || !output || output.length === 0) return true;

    const inL = input[0];
    const inR = input[1] || input[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const numSamples = outL.length;

    // Write input into ring buffer
    const inLen = inL.length;
    for (let i = 0; i < inLen; i++) {
      this.bufL[this.writePos] = inL[i];
      this.bufR[this.writePos] = inR[i];
      this.writePos = (this.writePos + 1) % this.bufSize;
    }
    this.available += inLen;

    // Cap available to buffer size
    if (this.available > this.bufSize) {
      this.available = this.bufSize;
    }

    // If rate is 1.0 (no pitch shift), pass through directly for zero latency
    if (this.rate === 1.0) {
      const toCopy = Math.min(numSamples, this.available);
      const rp = Math.floor(this.readPos) % this.bufSize;
      for (let i = 0; i < toCopy; i++) {
        const idx = (rp + i) % this.bufSize;
        outL[i] = this.bufL[idx];
        outR[i] = this.bufR[idx];
      }
      for (let i = toCopy; i < numSamples; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      this.readPos = (rp + toCopy) % this.bufSize;
      this.available -= toCopy;
      return true;
    }

    // Resampled output with linear interpolation
    for (let i = 0; i < numSamples; i++) {
      if (this.available < 2) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }

      const pos = this.readPos;
      const idx0 = Math.floor(pos) % this.bufSize;
      const idx1 = (idx0 + 1) % this.bufSize;
      const frac = pos - Math.floor(pos);

      outL[i] = this.bufL[idx0] + (this.bufL[idx1] - this.bufL[idx0]) * frac;
      outR[i] = this.bufR[idx0] + (this.bufR[idx1] - this.bufR[idx0]) * frac;

      this.readPos += this.rate;

      // Wrap readPos
      if (this.readPos >= this.bufSize) {
        this.readPos -= this.bufSize;
      }

      // Track consumed samples
      const consumed = Math.floor(this.rate);
      this.available -= consumed;
      if (this.available < 0) this.available = 0;
    }

    return true;
  }
}

registerProcessor('pitch-resampler', PitchResamplerProcessor);
