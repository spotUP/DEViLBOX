/**
 * SWP00 AudioWorklet Processor — Yamaha SWP00 AWM2 32-Voice ROMpler
 * Hosts SWP00Engine.c WASM module.
 */

// Inline init function (self-contained worklet support)
if (!globalThis.initMAMEWasmModule) {
  globalThis.initMAMEWasmModule = async function(wasmBinary, jsCode, factoryName) {
    if (!wasmBinary || !jsCode) throw new Error('Missing wasmBinary or jsCode');
    if (typeof URL === 'undefined') globalThis.URL = class URL { constructor() { this.href = ''; } };
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

function midiNoteToFreq(note) {
  return 440.0 * Math.pow(2.0, (note - 69) / 12.0);
}

class SWP00Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mod = null;
    this.isInitialized = false;
    this.pendingMsgs = [];
    this.oscEnabled = false;
    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const msg = event.data;
    switch (msg.type) {
      case 'init':      await this.initWasm(msg.wasmBinary, msg.jsCode); break;
      case 'enableOsc': this.oscEnabled = msg.enabled; break;
      case 'dispose':   this.isInitialized = false; this.mod = null; break;
      default:
        if (!this.isInitialized) this.pendingMsgs.push(msg);
        else this.processMessage(msg);
    }
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      this.mod = await globalThis.initMAMEWasmModule(wasmBinary, jsCode, 'SWP00Engine');
      this.mod._swp00_init();
      this.isInitialized = true;
      this.port.postMessage({ type: 'ready' });
      for (const m of this.pendingMsgs) this.processMessage(m);
      this.pendingMsgs = [];
    } catch (err) {
      console.error('[SWP00.worklet] Init error:', err);
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  processMessage(msg) {
    if (!this.mod) return;
    const m = this.mod;
    switch (msg.type) {
      case 'noteOn': {
        const voice = msg.voice ?? 0;
        const freq  = midiNoteToFreq(msg.note);
        const vel   = (msg.velocity ?? 127) / 127.0;
        m._swp00_note_on(voice, freq, vel);
        break;
      }
      case 'noteOff':      m._swp00_note_off(msg.voice ?? 0); break;
      case 'setFrequency': if (msg.freq > 0) m._swp00_set_frequency(msg.voice ?? 0, msg.freq); break;
      case 'setVolume':    m._swp00_set_volume(msg.voice ?? 0, (msg.value ?? 255) / 255.0); break;
      case 'setPanning':   m._swp00_set_pan(msg.voice ?? 0, ((msg.pan ?? 128) - 128) / 128.0); break;
      case 'loadRom': {
        const data = new Uint8Array(msg.data);
        const size = msg.size || data.length;
        const ptr  = m._malloc(size);
        if (ptr) {
          const heap = new Uint8Array(m.HEAPU8 ? m.HEAPU8.buffer : (m.wasmMemory ? m.wasmMemory.buffer : null));
          heap.set(data.subarray(0, size), ptr);
          m._swp00_load_rom(ptr, size);
          m._free(ptr);
        }
        break;
      }
      case 'allNotesOff': {
        const n = m._swp00_get_num_voices();
        for (let v = 0; v < n; v++) m._swp00_note_off(v);
        break;
      }
      case 'setParam': m._swp00_set_param(msg.paramId, msg.value); break;
      case 'writeRegister':
      case 'setParameter':
        break;
    }
  }

  process(_inputs, outputs) {
    if (!this.isInitialized || !this.mod) return true;
    const out = outputs[0];
    if (!out || out.length < 2) return true;
    const outL = out[0], outR = out[1];
    const n = outL.length;
    const m = this.mod;
    const ptrL = m._swp00_render(n);
    const ptrR = m._swp00_get_outR();
    const buf  = m.HEAPF32 ? m.HEAPF32.buffer : (m.wasmMemory ? m.wasmMemory.buffer : null);
    if (!buf) return true;
    const f32 = new Float32Array(buf);
    const oL  = ptrL >> 2, oR = ptrR >> 2;
    for (let i = 0; i < n; i++) { outL[i] = f32[oL + i]; outR[i] = f32[oR + i]; }
    if (this.oscEnabled && n > 0) this.port.postMessage({ type: 'oscData', data: outL.slice() });
    return true;
  }
}

registerProcessor('swp00-processor', SWP00Processor);
