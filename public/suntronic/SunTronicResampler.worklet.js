/**
 * SunTronicResampler.worklet.js — Gate B.2 playback back-end for native SunTronic.
 *
 * This worklet does NOT synthesize. The main thread runs the byte-exact
 * SunTronicPlayer + Paula render core (src/engine/suntronic/SunTronicNativeRender)
 * and posts finished 44100 Hz stereo chunks here with lookahead. The worklet is a
 * ring buffer + linear sample-rate converter (44100 -> AudioContext rate) plus
 * transport. Keeping synthesis on the main thread means there is ONE copy of the
 * Paula/timbre math (single source of truth) — the worklet can never drift from
 * the offline oracle because it re-renders nothing.
 *
 * Protocol (main -> worklet):
 *   { type:'init' }                       -> replies { type:'ready' }
 *   { type:'chunk', left, right }         Float32Array @44100, appended to ring
 *   { type:'play' } / { type:'stop' } / { type:'reset' }
 *   { type:'gain', value }                master gain 0..1
 * Protocol (worklet -> main):
 *   { type:'ready' }
 *   { type:'consumed', samples }          total 44100-samples pulled (for the
 *                                         follow-cursor; ~every 21 ms)
 *   { type:'underrun' }                   ring ran dry mid-block (pump too slow)
 */

const SRC_RATE = 44100;               // the fixed native render rate
const RING_BITS = 19;                 // 524288 samples (~11.9 s @44100) per channel
const RING_SIZE = 1 << RING_BITS;
const RING_MASK = RING_SIZE - 1;
// Per-voice rings for the dub sends: the lookahead is ~350 ms, so 1.5 s is ample.
const VRING_SIZE = 1 << 16;
const VRING_MASK = VRING_SIZE - 1;

class SunTronicResamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ringL = new Float32Array(RING_SIZE);
    this.ringR = new Float32Array(RING_SIZE);
    this.writeTotal = 0;   // absolute count of 44100-samples written
    this.readPos = 0;      // absolute fractional read position (44100 domain)
    this.playing = false;
    this.gain = 1;
    this.ratio = SRC_RATE / sampleRate; // 44100 per output sample
    this._lastConsumedPost = 0;
    this._underrunPosted = false;
    // Per-voice dub sends (worklets/channel-outputs.js).
    this._outs = globalThis.DevilboxChannelOutputs ? new globalThis.DevilboxChannelOutputs() : null;
    this.vring = [0, 1, 2, 3].map(() => new Float32Array(VRING_SIZE));
    this.vbuf = [0, 1, 2, 3].map(() => new Float32Array(128));

    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(msg) {
    if (this._outs && this._outs.handleMessage(msg)) return;
    switch (msg.type) {
      case 'init':
        this.port.postMessage({ type: 'ready' });
        break;
      case 'chunk': {
        const l = msg.left, r = msg.right;
        const n = l.length;
        for (let i = 0; i < n; i++) {
          const w = (this.writeTotal + i) & RING_MASK;
          this.ringL[w] = l[i];
          this.ringR[w] = r[i];
        }
        if (msg.voices) {
          for (let v = 0; v < 4; v++) {
            const src = msg.voices[v], dst = this.vring[v];
            if (!src) continue;
            for (let i = 0; i < n; i++) dst[(this.writeTotal + i) & VRING_MASK] = src[i];
          }
        }
        this.writeTotal += n;
        break;
      }
      case 'play':
        this.playing = true;
        this._underrunPosted = false;
        break;
      case 'stop':
        this.playing = false;
        break;
      case 'reset':
        this.playing = false;
        this.writeTotal = 0;
        this.readPos = 0;
        this._lastConsumedPost = 0;
        this._underrunPosted = false;
        break;
      case 'gain':
        this.gain = Math.max(0, Math.min(1, msg.value));
        break;
      case 'dispose':
        this.playing = false;
        break;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const outL = out[0];
    const outR = out[1] || out[0];
    const frames = outL.length;

    if (!this.playing) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }

    const g = this.gain;
    const o = this._outs;
    const wantVoices = !!o && o.dubEnabled.some(Boolean);
    let voiced = 0;
    for (let i = 0; i < frames; i++) {
      const base = Math.floor(this.readPos);
      // Need base and base+1 available in the ring for interpolation.
      if (base + 1 >= this.writeTotal) {
        // Ring dry — output silence for the rest of the block, hold position.
        for (let k = i; k < frames; k++) { outL[k] = 0; if (outR !== outL) outR[k] = 0; }
        if (!this._underrunPosted) {
          this.port.postMessage({ type: 'underrun' });
          this._underrunPosted = true;
        }
        break;
      }
      this._underrunPosted = false;
      const frac = this.readPos - base;
      const a = base & RING_MASK;
      const b = (base + 1) & RING_MASK;
      outL[i] = (this.ringL[a] + (this.ringL[b] - this.ringL[a]) * frac) * g;
      const rv = (this.ringR[a] + (this.ringR[b] - this.ringR[a]) * frac) * g;
      if (outR !== outL) outR[i] = rv;
      if (wantVoices) {
        const va = base & VRING_MASK, vb = (base + 1) & VRING_MASK;
        for (let v = 0; v < 4; v++) {
          const r = this.vring[v];
          this.vbuf[v][i] = r[va] + (r[vb] - r[va]) * frac;
        }
        voiced = i + 1;
      }
      this.readPos += this.ratio;
    }
    // Each voice's dub send, at the level the mix gives it (L = (v0+v3)×0.5,
    // R = (v1+v2)×0.5 in SunTronicNativeRender) and the master gain.
    if (wantVoices && voiced > 0) o.write(outputs, this.vbuf, voiced, (v) => (v === 1 || v === 2 ? 1 : 0), 0.5 * g);

    // Report consumed 44100-samples ~every 21 ms so the follow-cursor tracks
    // what is AUDIBLE (worklet read progress), not what the pump has queued.
    const consumed = Math.floor(this.readPos);
    if (consumed - this._lastConsumedPost >= 1024) {
      this._lastConsumedPost = consumed;
      this.port.postMessage({ type: 'consumed', samples: consumed });
    }
    return true;
  }
}

registerProcessor('suntronic-resampler', SunTronicResamplerProcessor);
