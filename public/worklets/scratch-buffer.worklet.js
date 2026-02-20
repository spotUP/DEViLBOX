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
 *   Rate is controlled via both AudioParam (sample-accurate) and postMessage
 *   (fallback). AudioParam takes priority when non-default.
 *
 * Ring buffer size: 45 s × sampleRate × 2 ch interleaved (L/R)
 */

const BUFFER_SECONDS = 45;

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

    for (let i = 0; i < frames; i++) {
      const L = (inp[0] && inp[0][i] !== undefined) ? inp[0][i] : 0;
      const R = (inp[1] && inp[1][i] !== undefined) ? inp[1][i] : 0;

      if (!isFrozen) {
        ring[wp * 2]     = L;
        ring[wp * 2 + 1] = R;
        wp = (wp + 1) % bf;
      }

      // Pass through to output (output not connected, but harmless)
      if (out[0]) out[0][i] = L;
      if (out[1]) out[1][i] = R;
    }

    if (!isFrozen) {
      writePoss[this.bufferId] = wp;
    }

    this._framesSinceReport += frames;
    if (this._framesSinceReport >= this._reportEvery) {
      this._framesSinceReport = 0;
      this.port.postMessage({ type: 'writePos', pos: writePoss[this.bufferId] });
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// ScratchPlaybackProcessor — reads ring buffer at a signed rate
//
// LINEAR INTERPOLATION ported from DJ-Scratch-Sample SoundRenderer.cpp:
//   pos1 = floor(position), pos2 = pos1+1
//   output = sample[pos1] + (sample[pos2] - sample[pos1]) * frac
//
// DUAL RATE CONTROL:
//   - AudioParam 'rate' (a-rate): sample-accurate, zero latency, smooth ramps.
//     Main thread sets via linearRampToValueAtTime. (Inspired by reference's
//     InterlockedExchange for lock-free atomic speed updates.)
//   - postMessage 'setRate': fallback for compatibility / cached worklets.
//   - process() uses AudioParam when available & non-zero, else message rate.
// ---------------------------------------------------------------------------
class ScratchReverseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'rate',
        defaultValue: 0,
        minValue: -8,
        maxValue: 8,
        automationRate: 'a-rate',
      },
    ];
  }

  constructor(options) {
    super();
    this.bufferId     = (options.processorOptions && options.processorOptions.bufferId) ?? 0;
    this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
    this.ring         = getOrCreateRing(this.bufferId, sampleRate);

    this.active    = false;
    this.readPosF  = 0;   // float — sub-frame precision for interpolation
    this.rate      = 0;   // message-based rate (fallback when AudioParam unavailable)
    this.startPos  = 0;   // position snapshot when playback started

    // Report read position every ~100ms
    this._reportEvery       = Math.round(sampleRate * 0.1);
    this._framesSinceReport = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      switch (d.type) {
        case 'start':
          // Re-grab the ring in case it was initialized after construction
          this.ring         = getOrCreateRing(this.bufferId, sampleRate);
          this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
          this.startPos     = d.startPos;
          this.readPosF     = d.startPos;
          this.rate         = d.rate ?? this.rate;
          this.active       = true;
          break;

        case 'setRate':
          this.rate = d.rate;
          break;

        case 'stop': {
          this.active = false;
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

  process(_inputs, outputs, parameters) {
    const out    = outputs[0];
    const frames = (out[0] && out[0].length) ? out[0].length : 128;

    if (!this.active) {
      if (out[0]) out[0].fill(0);
      if (out[1]) out[1].fill(0);
      return true;
    }

    const ring = this.ring;
    const bf   = this.bufferFrames;

    // Determine rate source: AudioParam (sample-accurate) or message-based fallback.
    // AudioParam 'rate' defaults to 0; if it's been driven to a non-zero value
    // by the main thread, use it. Otherwise fall back to the message-based rate.
    const rateArr = parameters.rate;
    const hasAudioParam = rateArr && rateArr.length > 0;
    // Check if AudioParam is being actively driven (non-zero or multi-sample)
    const audioParamActive = hasAudioParam && (rateArr.length > 1 || rateArr[0] !== 0);
    const rateConst = hasAudioParam && rateArr.length === 1;

    for (let i = 0; i < frames; i++) {
      // Get rate: prefer AudioParam, fall back to message-based this.rate
      let r;
      if (audioParamActive) {
        r = rateConst ? rateArr[0] : rateArr[i];
      } else {
        r = this.rate;
      }

      // Advance read position by signed rate
      this.readPosF += r;

      // Wrap around the circular buffer (while loops for extreme rates)
      while (this.readPosF < 0) this.readPosF += bf;
      while (this.readPosF >= bf) this.readPosF -= bf;

      // ── LINEAR INTERPOLATION (from SoundRenderer.cpp DoRenderThread) ──
      const pos1 = Math.floor(this.readPosF);
      const pos2 = (pos1 + 1) % bf;
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
    }

    this._framesSinceReport += frames;
    if (this._framesSinceReport >= this._reportEvery) {
      this._framesSinceReport = 0;
      this.port.postMessage({ type: 'readPos', pos: this.readPosF });
    }

    return true;
  }
}

registerProcessor('scratch-capture', ScratchCaptureProcessor);
registerProcessor('scratch-reverse', ScratchReverseProcessor);
