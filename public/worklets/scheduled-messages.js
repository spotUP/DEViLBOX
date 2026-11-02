/**
 * scheduled-messages.js - lets any engine worklet act on a port message at an audio-clock time.
 *
 * A message whose data carries a numeric `atTime` (seconds on the AudioContext clock, the `time` Tone passes to
 * triggerAttack/triggerRelease) is held in the worklet and handed to the processor's own onmessage handler at the
 * first render quantum whose start is >= atTime. A message with no `atTime` (or one already due) goes straight through,
 * unless timed messages are waiting: then it queues behind them, so the order the main thread sent is kept.
 *
 * This is why notes land on their scheduled time even when the main thread stalls between scheduling and delivery:
 * the message arrives early, the worklet applies it on the audio clock.
 *
 * Mechanism: wraps globalThis.registerProcessor so every processor registered AFTER this module is wrapped once.
 * Loaded before the engine worklet (WASMSingletonBase.loadWASMAssets), like channel-outputs.js.
 */
if (!globalThis.__devilboxScheduledMessages) {
  globalThis.__devilboxScheduledMessages = true;
  const origRegister = globalThis.registerProcessor;

  const install = (proc) => {
    const port = proc.port;
    const queue = [];
    // The processor's constructor (the wrapped class) has already set port.onmessage: take it over.
    let handler = port.onmessage || null;
    const deliver = (ev) => { if (handler) handler(ev); };
    const route = (ev) => {
      const d = ev && ev.data;
      const t = d && typeof d.atTime === 'number' ? d.atTime : null;
      if (queue.length === 0 && (t === null || t <= currentTime)) { deliver(ev); return; }
      queue.push({ t: t === null ? queue[queue.length - 1].t : Math.max(t, queue.length ? queue[queue.length - 1].t : 0), ev });
    };
    Object.defineProperty(port, 'onmessage', {
      configurable: true,
      get() { return handler; },
      set(fn) { handler = fn; },
    });
    // The real port delivers to its internal onmessage slot; route everything through ours.
    const nativeSet = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(port), 'onmessage');
    if (nativeSet && nativeSet.set) nativeSet.set.call(port, route);
    proc.__flushScheduled = () => {
      while (queue.length && queue[0].t <= currentTime) deliver(queue.shift().ev);
    };
  };

  globalThis.registerProcessor = (name, cls) => {
    class Scheduled extends cls {
      constructor(...args) {
        super(...args);
        install(this);
      }
      process(inputs, outputs, parameters) {
        if (this.__flushScheduled) this.__flushScheduled();
        return super.process(inputs, outputs, parameters);
      }
    }
    return origRegister.call(globalThis, name, Scheduled);
  };
}
