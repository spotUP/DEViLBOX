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
 *
 * Port message handlers run on the same audio thread but outside process(),
 * so a handler that blocks (loading a module, rebuilding state) starves every
 * processor without showing in the process() total. Those are timed too, and
 * the worst single call of each kind is kept: a one-off block that drops
 * audio is invisible in a per-second average.
 */
if (!globalThis.__dbxWorkletProfiler) {
  const names = [];
  // Float64Array, SLOTS per processor name:
  // [processMs, processCalls, worstProcessMs, messageMs, messageCalls, worstMessageMs]
  const SLOTS = 6;
  let view = null;
  const portOnMessage = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
  // Worst single call per processor and message kind (or 'constructor') since
  // the last read: says WHICH message blocked, not only that one did.
  const worst = new Map();
  const noteWorst = (processor, kind, ms) => {
    if (ms <= 0) return;
    const key = processor + '\u0000' + kind;
    if (ms > (worst.get(key) || 0)) worst.set(key, ms);
  };

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
        const base = idx * SLOTS;
        if (view && base + SLOTS <= view.length) {
          const ms = Date.now() - t0;
          view[base] += ms;
          view[base + 1] += 1;
          if (ms > view[base + 2]) view[base + 2] = ms;
        }
        return keep;
      };
    }
    const timed = (handler) => function (e) {
      const t0 = Date.now();
      try { return handler.call(this, e); } finally {
        const base = idx * SLOTS;
        const ms = Date.now() - t0;
        if (view && base + SLOTS <= view.length) {
          view[base + 3] += ms;
          view[base + 4] += 1;
          if (ms > view[base + 5]) view[base + 5] = ms;
        }
        const d = e && e.data;
        const kind = d && typeof d === 'object' ? (d.cmd ?? d.type ?? '?') : typeof d;
        noteWorst(name, String(kind), ms);
      }
    };
    // Wrap the handler the processor installs on its port, now and later.
    const Timed = typeof cls === 'function' ? class extends cls {
      constructor(...args) {
        const t0 = Date.now();
        super(...args);
        noteWorst(name, 'constructor', Date.now() - t0);
        const port = this.port;
        if (!port) return;
        let current = port.onmessage;
        const wrapped = new WeakMap();
        const wrap = (h) => {
          if (typeof h !== 'function') return h;
          if (!wrapped.has(h)) wrapped.set(h, timed(h));
          return wrapped.get(h);
        };
        Object.defineProperty(port, 'onmessage', {
          configurable: true,
          get: () => current,
          set: (h) => { current = h; portOnMessage.set.call(port, wrap(h)); },
        });
        if (typeof current === 'function') port.onmessage = current;
      }
    } : cls;
    return originalRegister.call(this, name, Timed);
  };

  globalThis.__dbxWorkletProfiler = { names };

  /** A node of this type carries the buffer in and the names out. */
  class DbxWorkletProfilerProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.port.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === 'attach' && d.buffer) view = new Float64Array(d.buffer);
        if (d.type === 'names') {
          const calls = [];
          for (const [key, ms] of worst) {
            const [processor, kind] = key.split('\u0000');
            calls.push({ processor, kind, ms });
          }
          if (d.resetWorst) worst.clear();
          this.port.postMessage({ type: 'names', names: names.slice(), worstCalls: calls });
        }
      };
    }
    process() { return true; }
  }
  originalRegister.call(globalThis, 'dbx-worklet-profiler', DbxWorkletProfilerProcessor);
}
