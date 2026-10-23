// Shared by the MAME chip worklets. A chip file imports this, subclasses MameChipProcessor and registers it.
import { TimedEventQueue } from '../shared/timedEventQueue.js';

// Inline init function (self-contained worklet support)
if (!globalThis.initMAMEWasmModule) {
  globalThis.initMAMEWasmModule = async function(wasmBinary, jsCode, factoryName) {
    if (!wasmBinary || !jsCode) throw new Error('Missing wasmBinary or jsCode');
    // Provide URL polyfill if not available (worklet scope)
    if (typeof URL === 'undefined') globalThis.URL = class URL { constructor() { this.href = ''; } };
    // Replace import.meta.url and strip ES module exports (not usable in new Function())
    const processedCode = jsCode.replace(/import\.meta\.url/g, '""').replace(/export\s+default\s+\w+;?/g, '');
    let createModule;
    try {
      const wrappedCode = `${processedCode}; return typeof ${factoryName} !== 'undefined' ? ${factoryName} : (typeof Module !== 'undefined' ? Module : null);`;
      createModule = new Function(wrappedCode)();
    } catch (e) { throw new Error(`Could not evaluate ${factoryName}: ${e.message}`); }
    if (!createModule) throw new Error(`Could not find factory function ${factoryName}`);
    let capturedMemory = null;
    const origInstantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = async function(...args) {
      const result = await origInstantiate.apply(this, args);
      const inst = result.instance || result;
      if (inst.exports) for (const v of Object.values(inst.exports)) if (v instanceof WebAssembly.Memory) { capturedMemory = v; break; }
      return result;
    };
    let Module;
    try { Module = await createModule({ wasmBinary }); } finally { WebAssembly.instantiate = origInstantiate; }
    if (capturedMemory && !Module.wasmMemory) Module.wasmMemory = capturedMemory;
    return Module;
  };
}
// Inline OscilloscopeMixin if not present
if (!globalThis.OscilloscopeMixin) {
  globalThis.OscilloscopeMixin = {
    OSC_BUFFER_SIZE: 256, OSC_SEND_INTERVAL: 3,
    init(p) { p.oscEnabled = false; p.oscBuffer = new Float32Array(256); p.oscFill = 0; p.oscFrameCount = 0; },
    capture(p, buf) {
      if (!p.oscEnabled) return;
      // Accumulate across render quanta: a quantum is 128 samples but the
      // scope buffer is 256, so copying one quantum and zero-filling the rest
      // hardwired the right half of every MAME oscilloscope to silence.
      if (p.oscFill === undefined) p.oscFill = 0;
      let i = 0;
      while (i < buf.length) {
        const n = Math.min(buf.length - i, 256 - p.oscFill);
        p.oscBuffer.set(buf.subarray(i, i + n), p.oscFill);
        p.oscFill += n; i += n;
        if (p.oscFill >= 256) {
          p.oscFill = 0;
          if (++p.oscFrameCount >= 3) {
            p.oscFrameCount = 0;
            const copy = p.oscBuffer.slice().buffer;
            p.port.postMessage({ type: 'oscData', buffer: copy }, [copy]);
          }
        }
      }
    }
  };
}


/**
 * Base of every MAME chip AudioWorklet processor: WASM loading, the common message set, output buffers,
 * oscilloscope and rendering. Note events (noteOn, noteOff, allNotesOff) that carry a future `time`
 * (AudioContext seconds) wait in a TimedEventQueue and key the chip at their own frame inside the block.
 *
 * A chip subclass sets `chip` (the WASM module is `create<chip>Module`, the embind class `<chip>Synth`; set
 * `synthClass` when the class is named differently) and may:
 *  - set `deleteSynthOnCleanup = true` when the embind object must be deleted on cleanup,
 *  - override `handleChipMessage(data)`: called first for every message, return true when it handled it
 *    (chip-only messages, or chip-specific replacements of a common one),
 *  - override `cleanupChip()` to free chip-owned WASM allocations.
 */
export class MameChipProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Notes sent ahead with a `time` wait here for their frame (see shared/timedEventQueue.js)
    this.noteEvents = new TimedEventQueue();
    this.synth = null;
    this.module = null;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.deleteSynthOnCleanup = false;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // Initialize oscilloscope support
    OscilloscopeMixin.init(this);
  }

  /** Chip-specific messages. Return true when handled. */
  handleChipMessage(_data) {
    return false;
  }

  /** Free chip-owned WASM allocations. */
  cleanupChip() {}

  async handleMessage(data) {
    if (this.handleChipMessage(data)) return;
    switch (data.type) {
      case 'enableOsc':
        this.oscEnabled = data.enabled;
        break;
      case 'init':
        await this.initSynth(data);
        break;
      case 'noteOn':
      case 'noteOff':
        if (this.synth && this.noteEvents.push(data, currentTime)) this.applyNoteEvent(data);
        break;
      case 'allNotesOff':
        if (this.synth) {
          // A panic cancels the notes scheduled at or after it: on Stop the replayer has already sent the coming rows.
          // A gate release (`release: true`, chips whose key-off is All Notes Off) must not drop later notes.
          if (!data.release) this.noteEvents.cancelFrom(data.time ?? currentTime);
          if (this.noteEvents.push(data, currentTime)) this.applyNoteEvent(data);
        }
        break;
      case 'setParameter':
        if (this.synth) this.synth.setParameter(data.paramId, data.value);
        break;
      case 'controlChange':
        if (this.synth) this.synth.controlChange(data.cc, data.value);
        break;
      case 'pitchBend':
        if (this.synth) this.synth.pitchBend(data.value);
        break;
      case 'programChange':
        if (this.synth) this.synth.programChange(data.program);
        break;
      // Convenience setters
      case 'setVolume':
        if (this.synth && this.synth.setVolume) this.synth.setVolume(data.value);
        break;
      case 'setMode':
        if (this.synth && this.synth.setMode) this.synth.setMode(data.value);
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  applyNoteEvent(ev) {
    if (!this.synth) return;
    switch (ev.type) {
      case 'noteOn': this.synth.noteOn(ev.note, ev.velocity); break;
      case 'noteOff': this.synth.noteOff(ev.note); break;
      case 'allNotesOff': this.synth.allNotesOff(); break;
    }
  }

  createSynth() {
    return new this.module[this.synthClass || this.chip + 'Synth']();
  }

  async initSynth(data) {
    try {
      this.cleanup();

      this.module = await globalThis.initMAMEWasmModule(data.wasmBinary, data.jsCode, 'create' + this.chip + 'Module');

      this.synth = this.createSynth();
      this.synth.initialize(data.sampleRate);

      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error(this.chip + ' init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.outputPtrL) return;

    const mem = this.module.wasmMemory || (this.module.HEAPF32 ? { buffer: this.module.HEAPF32.buffer } : null);
    if (!mem) return;

    if (this.lastHeapBuffer !== mem.buffer) {
      this.outputBufferL = new Float32Array(mem.buffer, this.outputPtrL, this.bufferSize);
      this.outputBufferR = new Float32Array(mem.buffer, this.outputPtrR, this.bufferSize);
      this.lastHeapBuffer = mem.buffer;
    }
  }

  cleanup() {
    this.cleanupChip();
    this.noteEvents.events = [];
    if (this.module && this.outputPtrL) {
      this.module._free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (this.module && this.outputPtrR) {
      this.module._free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    if (this.deleteSynthOnCleanup && this.synth) this.synth.delete();
    this.synth = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.synth) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = Math.min(outputL.length, this.bufferSize);

    this.updateBufferViews();

    if (!this.outputBufferL || !this.outputBufferR) {
      return true;
    }

    // Render in segments so a queued note event keys the chip at its own frame, not at the block start
    let done = 0;
    while (done < numSamples) {
      const now = currentTime + done / sampleRate;
      this.noteEvents.drain(now, (ev) => this.applyNoteEvent(ev));
      const off = this.noteEvents.nextOffset(now, numSamples - done, sampleRate);
      const len = off > 0 ? off : numSamples - done;
      this.synth.process(this.outputPtrL + done * 4, this.outputPtrR + done * 4, len);
      done += len;
    }

    for (let i = 0; i < numSamples; i++) {
      outputL[i] = this.outputBufferL[i];
      outputR[i] = this.outputBufferR[i];
    }

    // Capture oscilloscope data
    OscilloscopeMixin.capture(this, outputL);

    return true;
  }
}
