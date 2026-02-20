/**
 * scratch-buffer.worklet.js
 *
 * Two AudioWorklet processors sharing module-level ring buffers (one per deck).
 * Deck A → bufferId 0, Deck B → bufferId 1.
 *
 * ScratchCaptureProcessor: taps the audio chain and writes to the ring buffer
 * ScratchReverseProcessor: reads the ring buffer backward at a given rate
 *
 * Ring buffer size: 45 s × sampleRate × 2 ch interleaved (L/R)
 */

const BUFFER_SECONDS = 45;

// Module-level shared state (one AudioWorkletGlobalScope per context)
const rings     = [];      // Float32Array per bufferId, lazy-initialized
const writePoss = [0, 0];  // Current write position per bufferId

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
  }

  process(inputs, outputs) {
    const inp    = inputs[0];
    const out    = outputs[0];
    const frames = (out[0] && out[0].length) ? out[0].length : 128;
    const ring   = this.ring;
    const bf     = this.bufferFrames;
    let   wp     = writePoss[this.bufferId];

    for (let i = 0; i < frames; i++) {
      const L = (inp[0] && inp[0][i] !== undefined) ? inp[0][i] : 0;
      const R = (inp[1] && inp[1][i] !== undefined) ? inp[1][i] : 0;
      ring[wp * 2]     = L;
      ring[wp * 2 + 1] = R;
      // Pass through to output (output not connected in the plan, but harmless)
      if (out[0]) out[0][i] = L;
      if (out[1]) out[1][i] = R;
      wp = (wp + 1) % bf;
    }

    writePoss[this.bufferId] = wp;

    this._framesSinceReport += frames;
    if (this._framesSinceReport >= this._reportEvery) {
      this._framesSinceReport = 0;
      this.port.postMessage({ type: 'writePos', pos: wp });
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// ScratchReverseProcessor — reads ring buffer backward
// ---------------------------------------------------------------------------
class ScratchReverseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferId     = (options.processorOptions && options.processorOptions.bufferId) ?? 0;
    this.bufferFrames = Math.round(sampleRate * BUFFER_SECONDS);
    this.ring         = getOrCreateRing(this.bufferId, sampleRate);

    this.active    = false;
    this.readPosF  = 0;   // float — sub-frame precision
    this.rate      = 1.0; // always positive; direction is always backward
    this.startPos  = 0;   // writePos snapshot when backward started

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
          this.rate         = Math.max(0.02, d.rate);
          this.active       = true;
          break;

        case 'setRate':
          this.rate = Math.max(0.02, d.rate);
          break;

        case 'stop': {
          this.active = false;
          const bf        = this.bufferFrames;
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

    const ring = this.ring;
    const bf   = this.bufferFrames;

    for (let i = 0; i < frames; i++) {
      this.readPosF -= this.rate;
      if (this.readPosF < 0) this.readPosF += bf;
      const idx = Math.floor(this.readPosF);
      if (out[0]) out[0][i] = ring[idx * 2];
      if (out[1]) out[1][i] = ring[idx * 2 + 1];
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
