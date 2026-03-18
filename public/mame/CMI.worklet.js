/**
 * CMI AudioWorklet Processor — Fairlight CMI IIx 8-Voice Sampler
 *
 * Hosts the CMIEngine.c WASM module.
 * Handles noteOn/noteOff/setFrequency/setVolume/setPanning/loadSample messages
 * from CMISynth.ts (via MAMEBaseSynth).
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

class CMIProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mod = null;
    this.isInitialized = false;
    this.pendingMsgs = [];

    // Oscilloscope support (optional)
    this.oscEnabled = false;
    this.oscBuffer = null;
    this.oscSampleRate = sampleRate;

    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const msg = event.data;

    switch (msg.type) {
      case 'init':
        await this.initWasm(msg.wasmBinary, msg.jsCode);
        break;

      case 'enableOsc':
        this.oscEnabled = msg.enabled;
        break;

      case 'dispose':
        this.isInitialized = false;
        this.mod = null;
        break;

      default:
        if (!this.isInitialized) {
          this.pendingMsgs.push(msg);
        } else {
          this.processMessage(msg);
        }
        break;
    }
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      this.mod = await globalThis.initMAMEWasmModule(wasmBinary, jsCode, 'CMIEngine');
      this.mod._cmi_init();
      this.isInitialized = true;
      this.port.postMessage({ type: 'ready' });
      console.log('[CMI.worklet] WASM initialized');
      for (const m of this.pendingMsgs) this.processMessage(m);
      this.pendingMsgs = [];
    } catch (err) {
      console.error('[CMI.worklet] Init error:', err);
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  processMessage(msg) {
    if (!this.mod) return;
    const m = this.mod;

    switch (msg.type) {
      case 'noteOn': {
        const voice = (msg.voice !== undefined) ? msg.voice : 0;
        const freq = midiNoteToFreq(msg.note);
        const vel = (msg.velocity !== undefined) ? msg.velocity / 127.0 : 1.0;
        m._cmi_note_on(voice, freq, vel);
        break;
      }

      case 'noteOff': {
        const voice = (msg.voice !== undefined) ? msg.voice : 0;
        m._cmi_note_off(voice);
        break;
      }

      case 'setFrequency': {
        const voice = (msg.voice !== undefined) ? msg.voice : 0;
        if (msg.freq > 0) m._cmi_set_frequency(voice, msg.freq);
        break;
      }

      case 'setVolume': {
        const voice = (msg.voice !== undefined) ? msg.voice : 0;
        // value arrives as 0-255 from CMISynth.writeVolume
        const vol01 = (msg.value !== undefined) ? msg.value / 255.0 : 1.0;
        m._cmi_set_volume(voice, vol01);
        break;
      }

      case 'setPanning': {
        const voice = (msg.voice !== undefined) ? msg.voice : 0;
        // pan arrives as 0-255 from CMISynth.writePanning; convert to -1..+1
        const pan = (msg.pan !== undefined) ? (msg.pan - 128) / 128.0 : 0.0;
        m._cmi_set_pan(voice, pan);
        break;
      }

      case 'loadSample': {
        const voice = (msg.voice !== undefined) ? msg.voice : 0;
        const data = new Uint8Array(msg.data);
        const size = msg.size || data.length;
        const ptr = m._malloc(size);
        if (ptr) {
          const heap = new Uint8Array(m.HEAPU8 ? m.HEAPU8.buffer : (m.wasmMemory ? m.wasmMemory.buffer : null));
          heap.set(data.subarray(0, size), ptr);
          m._cmi_load_sample(voice, ptr, size);
          m._free(ptr);
        }
        break;
      }

      case 'setFilter': {
        const voice = (msg.voice !== undefined) ? msg.voice : 0;
        m._cmi_set_filter(voice, msg.value || 200);
        break;
      }

      case 'setLoop': {
        const voice = (msg.voice !== undefined) ? msg.voice : 0;
        m._cmi_set_loop(voice, msg.start || 0, msg.end || 0);
        break;
      }

      case 'allNotesOff': {
        const numVoices = m._cmi_get_num_voices();
        for (let v = 0; v < numVoices; v++) m._cmi_note_off(v);
        break;
      }

      case 'setParam': m._cmi_set_param(msg.paramId, msg.value); break;
      // Ignored gracefully
      case 'writeRegister':
      case 'setParameter':
        break;
    }
  }

  process(_inputs, outputs) {
    if (!this.isInitialized || !this.mod) return true;

    const out = outputs[0];
    if (!out || out.length < 2) return true;

    const outL = out[0];
    const outR = out[1];
    const numSamples = outL.length; // typically 128

    const m = this.mod;

    // Render into WASM internal buffers; returns pointer to outL buffer
    const ptrL = m._cmi_render(numSamples);
    const ptrR = m._cmi_get_outR();

    // Read from WASM heap (HEAPF32 or fallback to Float32Array view)
    const heapBuffer = m.HEAPF32
      ? m.HEAPF32.buffer
      : (m.wasmMemory ? m.wasmMemory.buffer : null);

    if (!heapBuffer) return true;

    const heapF32 = new Float32Array(heapBuffer);
    const offsetL = ptrL >> 2;   // byte ptr → float32 index
    const offsetR = ptrR >> 2;

    for (let i = 0; i < numSamples; i++) {
      outL[i] = heapF32[offsetL + i];
      outR[i] = heapF32[offsetR + i];
    }

    // Oscilloscope feed (optional)
    if (this.oscEnabled && outL.length > 0) {
      this.port.postMessage({ type: 'oscData', data: outL.slice() });
    }

    return true;
  }
}

registerProcessor('cmi-processor', CMIProcessor);
