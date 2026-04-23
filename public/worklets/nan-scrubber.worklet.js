/**
 * nan-scrubber.worklet.js — sample-level NaN/Inf guard.
 *
 * Placed in the dub bus feedback tap (echo.output → scrubber → feedback)
 * so upstream non-finite samples (e.g. transient NaN from a freshly
 * initialised WASM worklet, a disposed ToneAudioNode's final block, or
 * runaway denormals) cannot poison the downstream BiquadFilterNodes.
 *
 * Chrome's BiquadFilterNode latches its internal recursive state to NaN
 * on a single bad sample and cannot recover without node recreation —
 * "BiquadFilterNode: state is bad, probably due to unstable filter
 * caused by fast parameter automation". Scrubbing at the source is the
 * only reliable prevention.
 *
 * Also clamps to ±4.0 as a last-ditch runaway guard. Normal program
 * material stays well under ±1.5 after tape saturation.
 */
class NaNScrubberProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output) return true;
    const numCh = Math.min(input.length, output.length);
    for (let ch = 0; ch < numCh; ch++) {
      const src = input[ch];
      const dst = output[ch];
      if (!src || !dst) continue;
      const n = Math.min(src.length, dst.length);
      for (let i = 0; i < n; i++) {
        const s = src[i];
        if (s !== s || s === Infinity || s === -Infinity) {
          dst[i] = 0;
        } else if (s > 4) {
          dst[i] = 4;
        } else if (s < -4) {
          dst[i] = -4;
        } else {
          dst[i] = s;
        }
      }
    }
    return true;
  }
}

registerProcessor('nan-scrubber', NaNScrubberProcessor);
