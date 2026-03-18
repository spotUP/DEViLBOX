/**
 * SunVox.worklet.js — AudioWorklet SAB ring buffer reader
 *
 * Does NOT run any WASM. The SunVox WASM lives in SunVox.worker.js
 * (a regular Web Worker). This worklet just reads pre-rendered audio
 * from a SharedArrayBuffer ring buffer written by the worker.
 *
 * This architecture ensures that WASM hangs/crashes never freeze the tab —
 * at worst the ring buffer drains and audio goes silent.
 *
 * SharedArrayBuffer layout (matches SunVox.worker.js):
 *   Int32[0]  = writePos (frames, atomic, worker writes)
 *   Int32[1]  = readPos  (frames, atomic, worklet writes)
 *   Int32[2]  = bufferSize (RING_FRAMES constant)
 *   Int32[3]  = peakx1000 (running peak * 1000, worker writes)
 *   Float32[4..] = interleaved L/R samples
 *
 * Messages from SunVoxEngine (main thread):
 *   { type: 'setSAB', sab: SharedArrayBuffer }
 */

const HEADER_BYTES = 16;
const HEADER_INTS  = HEADER_BYTES / 4;

class SunVoxProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sabInt32   = null;
    this.sabFloat32 = null;
    this.underrunCount = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'setSAB') {
        this.sabInt32   = new Int32Array(data.sab);
        this.sabFloat32 = new Float32Array(data.sab);
        this.underrunCount = 0;
        console.log('[SunVox Worklet] SAB attached, bufSize=' + Atomics.load(this.sabInt32, 2));
      }
    };
  }

  process(_inputs, outputs) {
    if (!this.sabInt32) return true;

    const outL = outputs[0]?.[0];
    const outR = outputs[0]?.[1];
    if (!outL) return true;

    const numSamples = outL.length;
    const bufSize    = Atomics.load(this.sabInt32, 2);
    if (bufSize === 0) return true;

    const writePos = Atomics.load(this.sabInt32, 0);
    let   readPos  = Atomics.load(this.sabInt32, 1);

    let available = writePos - readPos;
    if (available < 0) available += bufSize;

    if (available < numSamples) {
      outL.fill(0);
      if (outR) outR.fill(0);
      this.underrunCount++;
      if (this.underrunCount % 500 === 1) {
        console.warn('[SunVox Worklet] ring buffer underrun #' + this.underrunCount);
      }
      return true;
    }

    const dataOff = HEADER_INTS;
    for (let i = 0; i < numSamples; i++) {
      const base = dataOff + ((readPos + i) % bufSize) * 2;
      outL[i] = this.sabFloat32[base];
      if (outR) outR[i] = this.sabFloat32[base + 1];
    }

    Atomics.store(this.sabInt32, 1, (readPos + numSamples) % bufSize);
    return true;
  }
}

registerProcessor('sunvox-processor', SunVoxProcessor);
