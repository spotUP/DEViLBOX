/**
 * SID.worklet.js — AudioWorklet ring-buffer processor for DeepSID backends.
 *
 * Receives float32 stereo sample chunks via port.onmessage and outputs them
 * smoothly from the audio thread.  Pre-buffering on the main-thread side
 * absorbs jank that would otherwise cause clicks with ScriptProcessorNode.
 *
 * Messages IN:
 *   { type: 'samples', left: Float32Array, right: Float32Array }
 *   { type: 'start' }
 *   { type: 'stop' }
 *
 * Messages OUT:
 *   { type: 'underrun' }   — ring buffer drained, silence emitted
 */
class SIDProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Power-of-2 ring buffer — 32768 samples ≈ 743 ms @ 44.1 kHz
    this.size = 32768;
    this.mask = this.size - 1;
    this.ringL = new Float32Array(this.size);
    this.ringR = new Float32Array(this.size);
    this.writeIdx = 0;
    this.readIdx = 0;
    this.active = false;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'samples') {
        const left = msg.left;
        const right = msg.right;
        const len = left.length;
        for (let i = 0; i < len; i++) {
          this.ringL[(this.writeIdx + i) & this.mask] = left[i];
          this.ringR[(this.writeIdx + i) & this.mask] = right[i];
        }
        this.writeIdx += len;
      } else if (msg.type === 'start') {
        this.active = true;
      } else if (msg.type === 'stop') {
        this.active = false;
        this.writeIdx = 0;
        this.readIdx = 0;
      }
    };
  }

  process(_inputs, outputs) {
    if (!this.active) return true;
    const out = outputs[0];
    if (!out || !out.length) return true;

    const outL = out[0];
    const outR = out[1] || outL;
    const frames = outL.length;
    const avail = this.writeIdx - this.readIdx;
    const toRead = Math.min(frames, avail);

    for (let i = 0; i < toRead; i++) {
      outL[i] = this.ringL[(this.readIdx + i) & this.mask];
      outR[i] = this.ringR[(this.readIdx + i) & this.mask];
    }
    this.readIdx += toRead;

    if (toRead < frames) {
      for (let i = toRead; i < frames; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      if (this.active && avail > 0) {
        this.port.postMessage({ type: 'underrun' });
      }
    }

    return true;
  }
}

registerProcessor('sid-processor', SIDProcessor);
