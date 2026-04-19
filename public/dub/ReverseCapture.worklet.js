/**
 * ReverseCapture — bus-input circular buffer. Maintains the last 2 s of
 * stereo audio so DubBus.backwardReverb() can snapshot + reverse-play it
 * on demand. Passthrough: input → output is silent (gain 0 downstream),
 * so the node sits as a tap off bus.input without altering the signal
 * path.
 *
 * Message protocol:
 *   → { cmd: 'snapshot', durationSec }     ask for the last N seconds
 *   ← { cmd: 'snapshot', left, right }     reversed Float32Array pair
 */

class ReverseCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    const bufferSec = 2.0;
    const frames = Math.ceil(bufferSec * sampleRate);
    this.ringL = new Float32Array(frames);
    this.ringR = new Float32Array(frames);
    this.ringFrames = frames;
    this.writePos = 0;
    this.port.onmessage = (ev) => {
      const msg = ev.data;
      if (msg?.cmd === 'snapshot') {
        const requested = Math.max(0.01, Math.min(bufferSec, Number(msg.durationSec) || 0.8));
        const n = Math.min(this.ringFrames, Math.ceil(requested * sampleRate));
        const outL = new Float32Array(n);
        const outR = new Float32Array(n);
        // writePos points at the NEXT write slot — most recent sample is
        // at writePos-1. Walk backwards through the ring to time-reverse.
        for (let i = 0; i < n; i++) {
          const src = (this.writePos - 1 - i + this.ringFrames) % this.ringFrames;
          outL[i] = this.ringL[src];
          outR[i] = this.ringR[src];
        }
        this.port.postMessage(
          { cmd: 'snapshot', left: outL, right: outR, frames: n },
          [outL.buffer, outR.buffer],
        );
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const inL = input[0];
    const inR = input[1] || input[0];
    const n = inL.length;

    // Passthrough so downstream listeners don't starve, even though the
    // connected gain is silenced — Web Audio won't call process() on a
    // node whose output is unconnected.
    const out = outputs[0];
    const outL = out?.[0];
    const outR = out?.[1];

    for (let i = 0; i < n; i++) {
      this.ringL[this.writePos] = inL[i];
      this.ringR[this.writePos] = inR[i];
      this.writePos = (this.writePos + 1) % this.ringFrames;
      if (outL) outL[i] = inL[i];
      if (outR) outR[i] = inR[i];
    }
    return true;
  }
}

registerProcessor('reverse-capture', ReverseCapture);
