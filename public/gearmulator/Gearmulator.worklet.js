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
 *   Int32[3] = peakx1000 (running peak * 1000, atomic, worker writes)
 *   Float32[HEADER_INTS .. HEADER_INTS + bufferSize*2] = interleaved L/R audio
 *
 * Messages from main thread:
 *   { type: 'setSAB', sab: SharedArrayBuffer }
 *   { type: 'setResampleRatio', ratio: number }
 */

const HEADER_BYTES = 16;
const HEADER_INTS = HEADER_BYTES / 4;

class GearmulatorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sabInt32 = null;
    this.sabFloat32 = null;
    this.underrunCount = 0;
    // Channel level tracking
    this.levelsCounter = 0;
    this.peakL = 0;
    this.peakR = 0;
    // Resampling: ratio = dspRate / outputRate. 1.0 = no resampling needed.
    this.resampleRatio = 1.0;
    // Fractional read position for linear interpolation resampling
    this.fracPos = 0.0;

    this.stopped = false;

    // Underrun resilience: hold/fade last good audio instead of hard silence
    this.lastGoodL = null; // Float32Array(128) — last successfully read left channel
    this.lastGoodR = null; // Float32Array(128) — last successfully read right channel
    this.consecutiveUnderruns = 0;
    this.fadeGain = 1.0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'setSAB') {
        this.sabInt32 = new Int32Array(data.sab);
        this.sabFloat32 = new Float32Array(data.sab);
        console.log('[Gearmulator Worklet] SAB attached, bufferSize=' + Atomics.load(this.sabInt32, 2));
      } else if (data.type === 'setResampleRatio') {
        this.resampleRatio = data.ratio;
        if (Math.abs(this.resampleRatio - 1.0) > 0.001) {
          console.log('[Gearmulator Worklet] Resampling ratio=' + this.resampleRatio.toFixed(4));
        }
      } else if (data.type === 'stop') {
        this.stopped = true;
        this.sabInt32 = null;
        this.sabFloat32 = null;
        console.log('[Gearmulator Worklet] Stopped — SAB released');
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (this.stopped) return false;
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

    // How many source frames do we need for this output block?
    const srcFramesNeeded = Math.ceil(numSamples * this.resampleRatio) + 1;

    if (available < srcFramesNeeded) {
      // Underrun — hold/fade last good audio instead of hard silence
      this.consecutiveUnderruns++;
      this.underrunCount++;

      if (this.lastGoodL && this.consecutiveUnderruns <= 10) {
        // Fade the held audio — 0.92 per block gives ~10-block fade to near-silence
        this.fadeGain *= 0.92;
        const g = this.fadeGain;
        const copyLen = Math.min(numSamples, this.lastGoodL.length);
        for (let i = 0; i < copyLen; i++) {
          outL[i] = this.lastGoodL[i] * g;
          outR[i] = this.lastGoodR[i] * g;
        }
        // Fill remainder with silence if output is longer than held buffer
        for (let i = copyLen; i < numSamples; i++) {
          outL[i] = 0;
          outR[i] = 0;
        }
      } else {
        // Too many consecutive underruns or no previous audio — output silence
        outL.fill(0);
        outR.fill(0);
      }

      if (this.underrunCount % 200 === 1) {
        this.port.postMessage({
          type: 'underrun',
          count: this.underrunCount,
          available,
          needed: srcFramesNeeded,
        });
      }
      return true;
    }

    // Successful read — reset underrun tracking
    this.consecutiveUnderruns = 0;
    this.fadeGain = 1.0;

    const audioOffset = HEADER_INTS;

    if (Math.abs(this.resampleRatio - 1.0) < 0.001) {
      // No resampling needed — direct copy (fast path)
      for (let i = 0; i < numSamples; i++) {
        const frameIdx = (readPos + i) % bufSize;
        const idx = audioOffset + frameIdx * 2;
        outL[i] = this.sabFloat32[idx];
        outR[i] = this.sabFloat32[idx + 1];
      }
      readPos = (readPos + numSamples) % bufSize;
    } else {
      // Linear interpolation resampling
      const sabF = this.sabFloat32;
      let srcPos = this.fracPos;
      for (let i = 0; i < numSamples; i++) {
        const srcIdx = Math.floor(srcPos);
        const frac = srcPos - srcIdx;
        const pos0 = (readPos + srcIdx) % bufSize;
        const pos1 = (readPos + srcIdx + 1) % bufSize;
        const idx0 = audioOffset + pos0 * 2;
        const idx1 = audioOffset + pos1 * 2;

        outL[i] = sabF[idx0] * (1 - frac) + sabF[idx1] * frac;
        outR[i] = sabF[idx0 + 1] * (1 - frac) + sabF[idx1 + 1] * frac;

        srcPos += this.resampleRatio;
      }
      const intPos = Math.floor(srcPos);
      this.fracPos = srcPos - intPos;
      readPos = (readPos + intPos) % bufSize;
    }

    // Advance read position
    Atomics.store(this.sabInt32, 1, readPos);

    // Save last good output for underrun resilience
    if (!this.lastGoodL || this.lastGoodL.length !== numSamples) {
      this.lastGoodL = new Float32Array(numSamples);
      this.lastGoodR = new Float32Array(numSamples);
    }
    this.lastGoodL.set(outL);
    this.lastGoodR.set(outR);

    // Track per-channel peaks for VU meters
    for (let i = 0; i < numSamples; i++) {
      const aL = outL[i] < 0 ? -outL[i] : outL[i];
      const aR = outR[i] < 0 ? -outR[i] : outR[i];
      if (aL > this.peakL) this.peakL = aL;
      if (aR > this.peakR) this.peakR = aR;
    }
    if (++this.levelsCounter >= 8) {
      this.levelsCounter = 0;
      this.port.postMessage({ type: 'chLevels', levels: [this.peakL, this.peakR] });
      this.peakL = 0;
      this.peakR = 0;
    }

    return true;
  }
}

registerProcessor('gearmulator-processor', GearmulatorProcessor);
