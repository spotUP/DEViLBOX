/**
 * nan-scrubber.worklet.js — sample-level NaN/Inf guard + feedback runaway limiter.
 *
 * Placed in the dub bus feedback tap (echo.output → feedback → scrubber →
 * feedbackShelfComp) so upstream non-finite samples (e.g. transient NaN from
 * a freshly-initialised WASM worklet, a disposed ToneAudioNode's final block,
 * or runaway denormals) cannot poison the downstream BiquadFilterNodes.
 *
 * Chrome's BiquadFilterNode latches its internal recursive state to NaN on a
 * single bad sample and cannot recover without node recreation — "state is
 * bad, probably due to unstable filter caused by fast parameter automation".
 * Scrubbing at the feedback tap is the only reliable prevention.
 *
 * **Soft-limiter:** also applies a tanh curve at ±0.95. This is what breaks
 * the "growing bass" feedback runaway seen when the King Tubby character
 * preset enables a +9 dB bass shelf in the forward path — if the feedback
 * shelf comp mirror is even slightly out of sync during the 50 ms ramp, or
 * if the echo engine swap produces a transient level spike, the soft-limiter
 * caps the feedback signal at ~0 dBFS and the loop cannot grow past unity.
 * tanh is chosen over hard clipping because it behaves musically in the
 * audible range (compresses smoothly near ±1) while still being a hard
 * mathematical limit (output strictly bounded by ±1).
 */
const LIMIT = 0.95;
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
        /* NaN check (NaN !== NaN) + explicit ±Infinity — flush to zero
           instead of clamp, because a clamp would leak a sustained DC
           level into the feedback loop on a pathological upstream. */
        if (s !== s || s === Infinity || s === -Infinity) {
          dst[i] = 0;
        } else {
          /* tanh(x) approx for |x| < ~2; Math.tanh is accurate and fast
             enough in V8. Scale so the limit sits at LIMIT. */
          dst[i] = LIMIT * Math.tanh(s / LIMIT);
        }
      }
    }
    return true;
  }
}

registerProcessor('nan-scrubber', NaNScrubberProcessor);
