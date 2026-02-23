/**
 * scratch-buffer.worklet.js — Unified vinyl scratch engine
 *
 * Architecture inspired by terminatorX (Alexander König):
 *   - Single ring buffer continuously captures the master audio
 *   - When scratch is active, a UNIFIED playback processor reads the
 *     ring buffer at a signed rate (positive=forward, negative=backward)
 *   - Fractional-position tracking with CUBIC HERMITE interpolation
 *   - Per-sample rate smoothing with configurable inertia
 *   - Zero-crossing fade (1ms) at direction changes to prevent clicks
 *   - ALL scratch audio comes from the ring buffer (no live/buffer switching)
 *
 * Two processors share module-level ring buffers (one per deck):
 *   ScratchCaptureProcessor: continuously writes audio into ring buffer
 *   ScratchPlaybackProcessor: reads ring buffer at variable rate with interpolation
 *
 * Ring buffer: 45 s × sampleRate × 2 ch interleaved (L/R)
 */

const BUFFER_SECONDS = 45;

/**
 * Rate smoothing time constant in seconds.
 * 5ms balances between responsive feel and click-free transitions.
 * The worklet interpolates per-sample, so even with 60Hz rate updates
 * from the main thread, the audio is smooth.
 */
const RATE_SMOOTH_SEC = 0.005;

/**
 * Zero-crossing fade duration in samples (~1ms at 48kHz).
 * When rate crosses zero (direction change), we apply a short
 * linear crossfade to prevent discontinuities.
 */
const ZERO_FADE_SAMPLES = 48;

// Module-level shared state (one AudioWorkletGlobalScope per context)
const rings     = [];            // Float32Array per bufferId, lazy-initialized
const writePoss = [0, 0];        // Current write position per bufferId
const frozen    = [false, false]; // Per-buffer freeze state

function getOrCreateRing(bufferId, sr) {
  if (!rings[bufferId]) {
    const frames = Math.round(sr * BUFFER_SECONDS);
    rings[bufferId] = new Float32Array(frames * 2); // interleaved L/R
  }
  return rings[bufferId];
}

/**
 * Cubic Hermite interpolation (4-point, 3rd order).
 * Gives smooth, alias-free interpolation for variable-rate playback.
 *
 * @param {number} y0 sample at pos-1
 * @param {number} y1 sample at pos (floor)
 * @param {number} y2 sample at pos+1
 * @param {number} y3 sample at pos+2
 * @param {number} t  fractional position [0..1)
 * @returns {number} interpolated value
 */
function hermite(y0, y1, y2, y3, t) {
  const c0 = y1;
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + c0;
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
    this._debugPeak = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'freeze') {
        frozen[this.bufferId] = true;
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

      // Pass through to output (capture node output usually not connected)
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
// ScratchPlaybackProcessor — unified forward+backward scrub engine
//
// Inspired by terminatorX's render_scratch():
//   - Fractional position (double) into the ring buffer
//   - Per-sample: pos += smoothedRate
//   - Cubic Hermite interpolation (4-point)
//   - Zero-crossing fade at direction changes
//   - Rate smoothing via 1-pole exponential filter
//
// Rate is signed: +1.0 = normal forward, -1.0 = normal backward, 0 = stopped
// Rate controlled via postMessage from main thread.
// ---------------------------------------------------------------------------
class ScratchPlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferId     = (options.processorOptions && options.processorOptions.bufferId) ?? 0;
    this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
    this.ring         = getOrCreateRing(this.bufferId, sampleRate);

    this.active     = false;
    this.readPosF   = 0;     // fractional read position (sub-sample precision)
    this.targetRate = 0;     // target playback rate from main thread
    this.smoothRate = 0;     // smoothed rate (used per-sample for position advance)
    this.startPos   = 0;     // position at scratch start (for framesBack calc)

    // Rate smoothing coefficient
    this.smoothAlpha = 1 - Math.exp(-1 / (RATE_SMOOTH_SEC * sampleRate));

    // Zero-crossing fade state
    this.fadeCounter = 0;    // countdown for fade (0 = no fade active)
    this.prevSign   = 0;     // sign of rate before zero crossing (-1, 0, +1)

    // Debug reporting
    this._reportEvery       = Math.round(sampleRate * 0.5); // every 500ms
    this._framesSinceReport = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      switch (d.type) {
        case 'start':
          this.ring         = getOrCreateRing(this.bufferId, sampleRate);
          this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
          this.startPos     = d.startPos;
          this.readPosF     = d.startPos;
          this.targetRate   = d.rate ?? 0;
          this.smoothRate   = d.rate ?? 0; // snap on start
          this.prevSign     = Math.sign(this.smoothRate);
          this.fadeCounter  = 0;
          this.active       = true;
          break;

        case 'setRate':
          this.targetRate = d.rate;
          break;

        case 'startFromWrite':
          // Start from the EXACT write position (reads shared module state directly)
          this.ring         = getOrCreateRing(this.bufferId, sampleRate);
          this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
          this.startPos     = writePoss[this.bufferId];
          this.readPosF     = writePoss[this.bufferId];
          this.targetRate   = d.rate ?? 0;
          this.smoothRate   = d.rate ?? 0;
          this.prevSign     = Math.sign(this.smoothRate);
          this.fadeCounter  = 0;
          this.active       = true;
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

        case 'snapRate':
          // Snap rate immediately (no smoothing) — used for initial engage
          this.targetRate = d.rate;
          this.smoothRate = d.rate;
          this.prevSign   = Math.sign(d.rate);
          break;
      }
    };
  }

  /**
   * Read a sample from the ring buffer with wrapping.
   * @param {number} idx Integer frame index (may be negative or >= bufferFrames)
   * @param {number} ch  Channel offset (0=L, 1=R)
   * @returns {number} sample value
   */
  getSample(idx, ch) {
    const bf = this.bufferFrames;
    // Modular wrap (handles negative indices)
    let i = idx % bf;
    if (i < 0) i += bf;
    return this.ring[i * 2 + ch];
  }

  process(_inputs, outputs) {
    const out    = outputs[0];
    const frames = (out[0] && out[0].length) ? out[0].length : 128;

    if (!this.active) {
      if (out[0]) out[0].fill(0);
      if (out[1]) out[1].fill(0);
      return true;
    }

    const target = this.targetRate;
    const alpha  = this.smoothAlpha;
    let   rate   = this.smoothRate;
    let   fadeCounter = this.fadeCounter;
    let   prevSign    = this.prevSign;

    for (let i = 0; i < frames; i++) {
      // ── Per-sample rate smoothing ──
      rate += (target - rate) * alpha;

      // ── Zero-crossing detection & fade ──
      const curSign = rate > 0.001 ? 1 : (rate < -0.001 ? -1 : 0);
      if (prevSign !== 0 && curSign !== 0 && curSign !== prevSign) {
        // Direction just reversed — start a fade
        fadeCounter = ZERO_FADE_SAMPLES;
      }
      if (curSign !== 0) prevSign = curSign;

      // Compute fade gain (1.0 normally, ramps 0→1 during fade)
      let fadeGain = 1.0;
      if (fadeCounter > 0) {
        fadeGain = 1.0 - (fadeCounter / ZERO_FADE_SAMPLES);
        fadeCounter--;
      }

      // ── Advance fractional position ──
      this.readPosF += rate;

      // Wrap (ring buffer is circular)
      const bf = this.bufferFrames;
      if (this.readPosF >= bf) this.readPosF -= bf;
      if (this.readPosF < 0)   this.readPosF += bf;

      // ── Cubic Hermite interpolation (4-point) ──
      const posI = Math.floor(this.readPosF);
      const frac = this.readPosF - posI;

      // Get 4 surrounding samples for each channel
      const L0 = this.getSample(posI - 1, 0);
      const L1 = this.getSample(posI,     0);
      const L2 = this.getSample(posI + 1, 0);
      const L3 = this.getSample(posI + 2, 0);

      const R0 = this.getSample(posI - 1, 1);
      const R1 = this.getSample(posI,     1);
      const R2 = this.getSample(posI + 1, 1);
      const R3 = this.getSample(posI + 2, 1);

      let outL = hermite(L0, L1, L2, L3, frac) * fadeGain;
      let outR = hermite(R0, R1, R2, R3, frac) * fadeGain;

      if (out[0]) out[0][i] = outL;
      if (out[1]) out[1][i] = outR;
    }

    this.smoothRate  = rate;
    this.fadeCounter = fadeCounter;
    this.prevSign    = prevSign;

    this._framesSinceReport += frames;
    if (this._framesSinceReport >= this._reportEvery) {
      this._framesSinceReport = 0;
      this.port.postMessage({
        type: 'debug-playback',
        readPos: this.readPosF,
        targetRate: this.targetRate,
        smoothRate: this.smoothRate,
        bufferFrames: this.bufferFrames,
      });
    }

    return true;
  }
}

registerProcessor('scratch-capture', ScratchCaptureProcessor);
registerProcessor('scratch-reverse', ScratchPlaybackProcessor);
