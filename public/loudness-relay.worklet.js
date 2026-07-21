/**
 * loudness-relay.worklet — sample-contiguous frame relay for the loudness meter.
 *
 * Deliberately does NO DSP: it posts copies of every 128-frame render quantum
 * to the main thread, where the tested BS.1770-4 LoudnessMeter core
 * (src/lib/audio/loudnessMeter.ts) does the measurement. This keeps a single
 * source of truth for the standards-critical math while guaranteeing the
 * contiguity that gated Integrated/LRA measurement requires (an AnalyserNode
 * cannot provide that).
 *
 * Batches ~8 quanta (1024 frames) per postMessage to keep message rate ~43/s.
 */
class LoudnessRelayProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufL = new Float32Array(1024);
    this._bufR = new Float32Array(1024);
    this._fill = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const l = input[0];
    const r = input[1] ?? input[0];
    const n = l.length;

    if (this._fill + n > 1024) this._flush();
    this._bufL.set(l, this._fill);
    this._bufR.set(r, this._fill);
    this._fill += n;
    if (this._fill >= 1024) this._flush();
    return true;
  }

  _flush() {
    if (this._fill === 0) return;
    const outL = this._bufL.slice(0, this._fill);
    const outR = this._bufR.slice(0, this._fill);
    this.port.postMessage({ l: outL, r: outR }, [outL.buffer, outR.buffer]);
    this._fill = 0;
  }
}

registerProcessor('loudness-relay', LoudnessRelayProcessor);
