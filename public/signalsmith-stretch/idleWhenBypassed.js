/**
 * idleWhenBypassed.js - evaluated in the AudioWorkletGlobalScope BEFORE the
 * vendored SignalsmithStretch.mjs (see DeckKeyLock.worklet.js for the order).
 *
 * The official processor always runs the full STFT, even when it is scheduled
 * inactive (it feeds silence through the stretcher). A DJ deck keeps its Key
 * Lock node alive while bypassed, so three decks would burn the stretch cost
 * with Key Lock off. This wraps the class the vendored file registers: while
 * the only scheduled segment is inactive, the processor writes silence and
 * skips the WASM call. Everything else is the unmodified upstream processor.
 *
 * Coupled to signalsmith-stretch 1.3.2 internals (`wasmReady`, `timeMap`);
 * keyLockKeepsTransientsSharp.test.ts drives this exact file and fails if
 * an upgrade changes them.
 */
const upstreamRegister = globalThis.registerProcessor;

globalThis.registerProcessor = (name, ProcessorClass) => {
  if (name !== 'signalsmith-stretch') return upstreamRegister(name, ProcessorClass);
  class IdleWhenBypassed extends ProcessorClass {
    process(inputs, outputs, parameters) {
      const map = this.timeMap;
      if (this.wasmReady && map && map.length === 1 && !map[0].active) {
        for (const channel of outputs[0] ?? []) channel.fill(0);
        return true;
      }
      return super.process(inputs, outputs, parameters);
    }
  }
  return upstreamRegister(name, IdleWhenBypassed);
};
