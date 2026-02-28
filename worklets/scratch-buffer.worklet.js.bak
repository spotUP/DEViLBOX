/**
 * scratch-buffer.worklet.js
 *
 * Two AudioWorklet processors sharing module-level ring buffers (one per deck).
 * Deck A → bufferId 0, Deck B → bufferId 1.
 *
 * ScratchCaptureProcessor: taps the audio chain and writes to the ring buffer.
 *   Supports freeze/unfreeze — when frozen, writing stops and the buffer becomes
 *   a fixed "record" that the playback processor can scrub through freely.
 *
 * ScratchPlaybackProcessor: reads the ring buffer at a signed rate with LINEAR
 *   INTERPOLATION (ported from SoundRenderer.cpp reference implementation).
 *   Positive rate = forward, negative rate = backward, 0 = stopped.
 *
 * RATE SMOOTHING: 2ms exponential smoothing on rate changes prevents clicks at
 *   direction/speed transitions while keeping scratch response tight.
 *
 * Ring buffer size: 45 s × sampleRate × 2 ch interleaved (L/R)
 */

const BUFFER_SECONDS = 45;

/** Rate smoothing time constant in seconds. 2ms is fast enough for scratch
 *  responsiveness while preventing audible clicks at rate transitions. */
const RATE_SMOOTH_SEC = 0.002;

// Module-level shared state (one AudioWorkletGlobalScope per context)
const rings     = [];      // Float32Array per bufferId, lazy-initialized
const writePoss = [0, 0];  // Current write position per bufferId
const frozen    = [false, false]; // Per-buffer freeze state

function getOrCreateRing(bufferId, sr) {
  if (!rings[bufferId]) {
    const frames = Math.round(sr * BUFFER_SECONDS);
    rings[bufferId] = new Float32Array(frames * 2); // interleaved L/R
  }
  return rings[bufferId];
}

// ---------------------------------------------------------------------------
// ScratchCaptureProcessor — taps audio and writes to ring buffer
// ---------------------------------------------------------------------------
class ScratchCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferId     = (options.processorOptions && options.processorOptions.bufferId) ?? 0;
    this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
    this.ring         = getOrCreateRing(this.bufferId, sampleRate);

    // Report write position to main thread every ~50ms
    this._reportEvery       = Math.round(sampleRate * 0.05);
    this._framesSinceReport = 0;

    // Debug: track peak input level
    this._debugPeak = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'freeze') {
        frozen[this.bufferId] = true;
        // Debug: report buffer state at freeze time
        const wp = writePoss[this.bufferId];
        let nonZero = 0;
        const checkFrames = Math.min(this.bufferFrames, 48000); // check ~1s around write pos
        for (let i = 0; i < checkFrames; i++) {
          const idx = ((wp - checkFrames + i + this.bufferFrames) % this.bufferFrames) * 2;
          if (this.ring[idx] !== 0 || this.ring[idx + 1] !== 0) nonZero++;
        }
        this.port.postMessage({
          type: 'debug-freeze',
          writePos: wp,
          bufferFrames: this.bufferFrames,
          nonZeroInLast1s: nonZero,
          checkedFrames: checkFrames,
          peakBeforeFreeze: this._debugPeak,
        });
        this._debugPeak = 0;
      } else if (d.type === 'unfreeze') {
        frozen[this.bufferId] = false;
      }
    };
  }

  process(inputs, outputs) {
    const inp    = inputs[0];
    const out    = outputs[0];
    const frames = (out[0] && out[0].length) ? out[0].length : 128;
    const ring   = this.ring;
    const bf     = this.bufferFrames;
    const isFrozen = frozen[this.bufferId];
    let   wp     = writePoss[this.bufferId];

    let blockPeak = 0;
    for (let i = 0; i < frames; i++) {
      const L = (inp[0] && inp[0][i] !== undefined) ? inp[0][i] : 0;
      const R = (inp[1] && inp[1][i] !== undefined) ? inp[1][i] : 0;

      const absL = Math.abs(L);
      const absR = Math.abs(R);
      if (absL > blockPeak) blockPeak = absL;
      if (absR > blockPeak) blockPeak = absR;

      if (!isFrozen) {
        ring[wp * 2]     = L;
        ring[wp * 2 + 1] = R;
        wp = (wp + 1) % bf;
      }

      // Pass through to output (output not connected, but harmless)
      if (out[0]) out[0][i] = L;
      if (out[1]) out[1][i] = R;
    }

    if (blockPeak > this._debugPeak) this._debugPeak = blockPeak;

    if (!isFrozen) {
      writePoss[this.bufferId] = wp;
    }

    this._framesSinceReport += frames;
    if (this._framesSinceReport >= this._reportEvery) {
      this._framesSinceReport = 0;
      this.port.postMessage({
        type: 'writePos',
        pos: writePoss[this.bufferId],
        frozen: isFrozen,
        inputPeak: this._debugPeak,
      });
      this._debugPeak = 0;
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// ScratchPlaybackProcessor — reads ring buffer at a signed rate
//
// LINEAR INTERPOLATION ported from DJ-Scratch-Sample SoundRenderer.cpp:
//   pos1 = floor(position), pos2 = pos1+1, frac = position - pos1
//   output = sample[pos1] + (sample[pos2] - sample[pos1]) * frac
//
// RATE SMOOTHING: 1-pole exponential filter on rate prevents clicks at
//   direction changes (e.g. +2.4 → -1.0 in Baby Scratch).
//   Time constant: ~2ms (96 samples at 48kHz).
//
// Rate controlled via postMessage (setRate / start messages).
// ---------------------------------------------------------------------------
class ScratchReverseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferId     = (options.processorOptions && options.processorOptions.bufferId) ?? 0;
    this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
    this.ring         = getOrCreateRing(this.bufferId, sampleRate);

    this.active     = false;
    this.readPosF   = 0;     // float — sub-frame precision for interpolation
    this.targetRate = 0;     // target rate (set by messages, smoothed before use)
    this.smoothRate = 0;     // current smoothed rate (used for position advancement)
    this.startPos   = 0;     // position snapshot when playback started

    // Rate smoothing coefficient: alpha = 1 - exp(-1 / (T * sampleRate))
    // For T = 2ms at 48kHz: alpha ≈ 0.0104
    this.smoothAlpha = 1 - Math.exp(-1 / (RATE_SMOOTH_SEC * sampleRate));

    // Debug: report every ~200ms
    this._reportEvery       = Math.round(sampleRate * 0.2);
    this._framesSinceReport = 0;
    this._debugOutPeak      = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      switch (d.type) {
        case 'start':
          // Re-grab the ring in case it was initialized after construction
          this.ring         = getOrCreateRing(this.bufferId, sampleRate);
          this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
          this.startPos     = d.startPos;
          this.readPosF     = d.startPos;
          this.targetRate   = d.rate ?? this.targetRate;
          this.smoothRate   = d.rate ?? this.targetRate;  // snap to rate on start (no ramp)
          this.active       = true;

          // Debug: check buffer content around start position
          {
            const bf = this.bufferFrames;
            const ring = this.ring;
            let nonZero = 0;
            let peak = 0;
            const checkRange = Math.min(48000, bf); // ~1s
            for (let i = 0; i < checkRange; i++) {
              const idx = ((d.startPos - checkRange / 2 + i + bf) % bf);
              const L = Math.abs(ring[idx * 2]);
              const R = Math.abs(ring[idx * 2 + 1]);
              if (L > 0 || R > 0) nonZero++;
              if (L > peak) peak = L;
              if (R > peak) peak = R;
            }
            this.port.postMessage({
              type: 'debug-start',
              startPos: d.startPos,
              rate: d.rate,
              bufferFrames: bf,
              nonZeroAroundStart: nonZero,
              peakAroundStart: peak,
              checkedFrames: checkRange,
              sampleAt0: { L: ring[d.startPos * 2], R: ring[d.startPos * 2 + 1] },
            });
          }
          break;

        case 'setRate':
          this.targetRate = d.rate;
          break;

        case 'startFromWrite':
          // Start playback from the EXACT current write position (no main-thread staleness).
          // Uses the shared module-level writePoss[] directly.
          this.ring         = getOrCreateRing(this.bufferId, sampleRate);
          this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
          this.startPos     = writePoss[this.bufferId];
          this.readPosF     = writePoss[this.bufferId];
          this.targetRate   = d.rate ?? this.targetRate;
          this.smoothRate   = d.rate ?? this.targetRate;
          this.active       = true;
          {
            const wp = writePoss[this.bufferId];
            const bf = this.bufferFrames;
            const ring = this.ring;
            let nonZero = 0;
            let peak = 0;
            const checkRange = Math.min(48000, bf);
            for (let i = 0; i < checkRange; i++) {
              const idx = ((wp - i + bf) % bf);
              const L = Math.abs(ring[idx * 2]);
              const R = Math.abs(ring[idx * 2 + 1]);
              if (L > 0 || R > 0) nonZero++;
              if (L > peak) peak = L;
              if (R > peak) peak = R;
            }
            this.port.postMessage({
              type: 'debug-start',
              startPos: wp,
              rate: d.rate,
              bufferFrames: bf,
              nonZeroAroundStart: nonZero,
              peakAroundStart: peak,
              checkedFrames: checkRange,
              sampleAt0: { L: ring[wp * 2], R: ring[wp * 2 + 1] },
            });
          }
          break;

        case 'stop': {
          this.active = false;
          this.targetRate = 0;
          this.smoothRate = 0;
          const bf = this.bufferFrames;
          const framesBack = Math.round(
            ((this.startPos - this.readPosF) + bf) % bf
          );
          this.port.postMessage({ type: 'stopped', framesBack });
          break;
        }
      }
    };
  }

  process(_inputs, outputs) {
    const out    = outputs[0];
    const frames = (out[0] && out[0].length) ? out[0].length : 128;

    if (!this.active) {
      if (out[0]) out[0].fill(0);
      if (out[1]) out[1].fill(0);
      return true;
    }

    const ring   = this.ring;
    const bf     = this.bufferFrames;
    const target = this.targetRate;
    const alpha  = this.smoothAlpha;
    let   rate   = this.smoothRate;
    let   outPeak = 0;

    for (let i = 0; i < frames; i++) {
      // Smooth rate toward target (1-pole exponential filter)
      rate += (target - rate) * alpha;

      // Advance read position by smoothed rate
      this.readPosF += rate;

      // Wrap around the circular buffer (while for safety with extreme rates)
      while (this.readPosF < 0) this.readPosF += bf;
      while (this.readPosF >= bf) this.readPosF -= bf;

      // ── LINEAR INTERPOLATION (from SoundRenderer.cpp DoRenderThread) ──
      const pos1 = Math.floor(this.readPosF);
      const pos2 = (pos1 + 1) % bf;  // wrap at buffer boundary
      const frac = this.readPosF - pos1;

      // Interpolate left channel
      const L1 = ring[pos1 * 2];
      const L2 = ring[pos2 * 2];
      const outL = L1 + (L2 - L1) * frac;

      // Interpolate right channel
      const R1 = ring[pos1 * 2 + 1];
      const R2 = ring[pos2 * 2 + 1];
      const outR = R1 + (R2 - R1) * frac;

      if (out[0]) out[0][i] = outL;
      if (out[1]) out[1][i] = outR;

      const absL = Math.abs(outL);
      const absR = Math.abs(outR);
      if (absL > outPeak) outPeak = absL;
      if (absR > outPeak) outPeak = absR;
    }

    this.smoothRate = rate;
    if (outPeak > this._debugOutPeak) this._debugOutPeak = outPeak;

    this._framesSinceReport += frames;
    if (this._framesSinceReport >= this._reportEvery) {
      this._framesSinceReport = 0;

      // Sample a few values around the current read position for debug
      const pos = Math.floor(this.readPosF);
      const sampleValues = [];
      for (let j = -2; j <= 2; j++) {
        const idx = ((pos + j) + bf) % bf;
        sampleValues.push({ L: ring[idx * 2], R: ring[idx * 2 + 1] });
      }

      this.port.postMessage({
        type: 'debug-playback',
        readPos: this.readPosF,
        startPos: this.startPos,
        targetRate: this.targetRate,
        smoothRate: this.smoothRate,
        outPeak: this._debugOutPeak,
        bufferFrames: bf,
        samplesAroundPos: sampleValues,
      });
      this._debugOutPeak = 0;
    }

    return true;
  }
}

registerProcessor('scratch-capture', ScratchCaptureProcessor);
registerProcessor('scratch-reverse', ScratchReverseProcessor);
