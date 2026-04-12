/**
 * AutoTune.worklet.js — Pitch detection AudioWorkletProcessor.
 *
 * Implements the YIN algorithm (de Cheveigné & Kawahara 2002) on a sliding
 * window of input audio. Posts detected fundamental frequency back to the
 * main thread continuously so the main-thread effect wrapper can drive a
 * Tone.PitchShift to snap to a target scale.
 *
 * Pure passthrough — does NOT modify audio. Pitch correction is applied on
 * the main thread by adjusting Tone.PitchShift.pitch based on the detected
 * Hz received via this worklet's port.
 *
 * Messages out:
 *   { type: 'pitch', hz: number, clarity: number }   continuously
 */

const BUFFER_SIZE = 2048;          // analysis window in samples
const HOP_SIZE = 512;              // analyse every N samples
const YIN_THRESHOLD = 0.15;        // YIN absolute threshold
const MIN_HZ = 65;                 // C2
const MAX_HZ = 1000;               // ~B5

class AutoTuneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.alive = true;
    this.buffer = new Float32Array(BUFFER_SIZE);
    this.bufferPos = 0;
    this.samplesUntilAnalysis = HOP_SIZE;
    this.yinBuffer = new Float32Array(BUFFER_SIZE / 2);

    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'dispose') this.alive = false;
    };
  }

  process(inputs, outputs) {
    if (!this.alive) return false;
    const input = inputs[0];
    const output = outputs[0];
    const inCh = input && input[0];
    const outCh = output && output[0];
    if (!outCh) return true;

    const frames = outCh.length;

    // Passthrough (mono — only first channel needs to flow for analysis,
    // and the main thread routes the actual audio through Tone.PitchShift)
    if (inCh) {
      outCh.set(inCh);
      // Mirror to all output channels if stereo
      for (let c = 1; c < output.length; c++) {
        if (output[c]) output[c].set(inCh);
      }

      // Append into ring buffer
      for (let i = 0; i < frames; i++) {
        this.buffer[this.bufferPos] = inCh[i];
        this.bufferPos = (this.bufferPos + 1) % BUFFER_SIZE;
      }

      this.samplesUntilAnalysis -= frames;
      if (this.samplesUntilAnalysis <= 0) {
        this.samplesUntilAnalysis = HOP_SIZE;
        this.analyse();
      }
    } else {
      outCh.fill(0);
    }

    return true;
  }

  /** Run YIN on the current ring-buffer contents */
  analyse() {
    // Linearize the ring buffer
    const window = new Float32Array(BUFFER_SIZE);
    for (let i = 0; i < BUFFER_SIZE; i++) {
      window[i] = this.buffer[(this.bufferPos + i) % BUFFER_SIZE];
    }

    // Quick energy gate — skip detection on silence
    let energy = 0;
    for (let i = 0; i < BUFFER_SIZE; i++) energy += window[i] * window[i];
    if (energy < 0.0005) {
      this.port.postMessage({ type: 'pitch', hz: 0, clarity: 0 });
      return;
    }

    const result = this.yin(window, sampleRate);
    this.port.postMessage({ type: 'pitch', hz: result.hz, clarity: result.clarity });
  }

  /**
   * YIN pitch detection.
   * Returns { hz, clarity } where clarity is 1 - the YIN d' value at the
   * chosen tau (higher = more confident).
   */
  yin(buf, sr) {
    const halfSize = this.yinBuffer.length;
    const yb = this.yinBuffer;

    // Step 1: difference function
    for (let tau = 0; tau < halfSize; tau++) yb[tau] = 0;
    for (let tau = 1; tau < halfSize; tau++) {
      let sum = 0;
      for (let j = 0; j < halfSize; j++) {
        const delta = buf[j] - buf[j + tau];
        sum += delta * delta;
      }
      yb[tau] = sum;
    }

    // Step 2: cumulative mean normalised difference
    yb[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += yb[tau];
      yb[tau] = (yb[tau] * tau) / runningSum;
    }

    // Step 3: absolute threshold
    const minTau = Math.floor(sr / MAX_HZ);
    const maxTau = Math.floor(sr / MIN_HZ);
    let tauEstimate = -1;
    for (let tau = minTau; tau <= maxTau && tau < halfSize; tau++) {
      if (yb[tau] < YIN_THRESHOLD) {
        // Find the local minimum
        while (tau + 1 < halfSize && yb[tau + 1] < yb[tau]) tau++;
        tauEstimate = tau;
        break;
      }
    }
    if (tauEstimate === -1) {
      // No pitch with sufficient clarity → return the global minimum
      let minVal = Infinity;
      for (let tau = minTau; tau <= maxTau && tau < halfSize; tau++) {
        if (yb[tau] < minVal) {
          minVal = yb[tau];
          tauEstimate = tau;
        }
      }
      if (tauEstimate === -1 || minVal > 0.5) {
        return { hz: 0, clarity: 0 };
      }
    }

    // Step 4: parabolic interpolation around tauEstimate
    const x0 = tauEstimate > 0 ? tauEstimate - 1 : tauEstimate;
    const x2 = tauEstimate + 1 < halfSize ? tauEstimate + 1 : tauEstimate;
    let betterTau;
    if (x0 === tauEstimate) {
      betterTau = yb[tauEstimate] <= yb[x2] ? tauEstimate : x2;
    } else if (x2 === tauEstimate) {
      betterTau = yb[tauEstimate] <= yb[x0] ? tauEstimate : x0;
    } else {
      const s0 = yb[x0];
      const s1 = yb[tauEstimate];
      const s2 = yb[x2];
      const denom = (2 * (2 * s1 - s2 - s0));
      betterTau = denom !== 0 ? tauEstimate + (s2 - s0) / denom : tauEstimate;
    }

    const hz = sr / betterTau;
    const clarity = 1 - yb[tauEstimate];
    return { hz, clarity };
  }
}

registerProcessor('autotune-detector', AutoTuneProcessor);
