/**
 * worklet-profiler.js — how much of the audio thread each processor uses.
 *
 * Loaded into the AudioWorkletGlobalScope before any other module (see
 * src/engine/audio/workletProfiler.ts). It wraps registerProcessor so that
 * every processor registered afterwards has its process() timed, and adds
 * the time and call count per processor NAME into a SharedArrayBuffer the
 * main thread reads.
 *
 * The scope has no performance.now(), only Date.now() in whole
 * milliseconds. A 128-frame process() call mostly reads 0 and sometimes 1;
 * summed over thousands of calls that is an unbiased estimate of the time
 * spent, which is what a ranking needs.
 */
if (!globalThis.__dbxWorkletProfiler) {
  const names = [];
  let view = null; // Float64Array: [ms, calls] per processor name

  const originalRegister = globalThis.registerProcessor;
  globalThis.registerProcessor = function (name, cls) {
    const idx = names.length;
    names.push(name);
    const proto = cls && cls.prototype;
    const process = proto && proto.process;
    if (typeof process === 'function') {
      proto.process = function (inputs, outputs, parameters) {
        const t0 = Date.now();
        const keep = process.call(this, inputs, outputs, parameters);
        if (view && idx * 2 + 1 < view.length) {
          view[idx * 2] += Date.now() - t0;
          view[idx * 2 + 1] += 1;
        }
        return keep;
      };
    }
    return originalRegister.call(this, name, cls);
  };

  globalThis.__dbxWorkletProfiler = { names };

  /** A node of this type carries the buffer in and the names out. */
  class DbxWorkletProfilerProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.port.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === 'attach' && d.buffer) view = new Float64Array(d.buffer);
        if (d.type === 'names') this.port.postMessage({ type: 'names', names: names.slice() });
      };
    }
    process() { return true; }
  }
  originalRegister.call(globalThis, 'dbx-worklet-profiler', DbxWorkletProfilerProcessor);
}
