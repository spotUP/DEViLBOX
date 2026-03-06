/**
 * Gearmulator AudioWorklet Processor — SAB Ring Buffer Reader
 *
 * Reads interleaved L/R audio from a SharedArrayBuffer ring buffer
 * that the DSP Worker writes to. This worklet does NOT run WASM itself.
 *
 * SharedArrayBuffer layout:
 *   Int32[0] = writePos (atomic, worker writes)
 *   Int32[1] = readPos  (atomic, worklet writes)
 *   Int32[2] = bufferSize (in frames, set once during init)
 *   Float32[HEADER_INTS .. HEADER_INTS + bufferSize*2] = interleaved L/R audio
 *
 * Messages from main thread:
 *   { type: 'setSAB', sab: SharedArrayBuffer }
 */

const HEADER_BYTES = 16;
const HEADER_INTS = HEADER_BYTES / 4;

class GearmulatorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sabInt32 = null;
    this.sabFloat32 = null;
    this.underrunCount = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'setSAB') {
        this.sabInt32 = new Int32Array(data.sab);
        this.sabFloat32 = new Float32Array(data.sab);
        console.log('[Gearmulator Worklet] SAB attached, bufferSize=' + Atomics.load(this.sabInt32, 2));
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.sabInt32) return true;

    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0];
    const outR = output[1];
    const numSamples = outL.length;

    const bufSize = Atomics.load(this.sabInt32, 2);
    if (bufSize === 0) return true;

    const writePos = Atomics.load(this.sabInt32, 0);
    let readPos = Atomics.load(this.sabInt32, 1);

    // How many frames are available?
    let available = writePos - readPos;
    if (available < 0) available += bufSize;

    if (available < numSamples) {
      // Underrun — fill with silence
      outL.fill(0);
      outR.fill(0);
      this.underrunCount++;
      if (this.underrunCount % 200 === 1) {
        this.port.postMessage({
          type: 'underrun',
          count: this.underrunCount,
          available,
          needed: numSamples,
        });
      }
      return true;
    }

    // Read interleaved L/R from ring buffer
    const audioOffset = HEADER_INTS;
    for (let i = 0; i < numSamples; i++) {
      const frameIdx = (readPos + i) % bufSize;
      const idx = audioOffset + frameIdx * 2;
      outL[i] = this.sabFloat32[idx];
      outR[i] = this.sabFloat32[idx + 1];
    }

    // Advance read position
    readPos = (readPos + numSamples) % bufSize;
    Atomics.store(this.sabInt32, 1, readPos);

    return true;
  }
}

registerProcessor('gearmulator-processor', GearmulatorProcessor);
