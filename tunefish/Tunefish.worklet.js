// Tunefish 4 Synth AudioWorklet
// Wraps Tunefish synth from WASM

// Polyfill performance.now() for AudioWorklet context
if (typeof performance === 'undefined') {
  globalThis.performance = {
    now: () => Date.now()
  };
}

let Module = null;
let synth = null;
let ready = false;

// Wrapped WASM functions
let tunefish_create = null;
let tunefish_destroy = null;
let tunefish_set_sample_rate = null;
let tunefish_set_param = null;
let tunefish_get_param = null;
let tunefish_note_on = null;
let tunefish_note_off = null;
let tunefish_all_notes_off = null;
let tunefish_pitch_bend = null;
let tunefish_mod_wheel = null;
let tunefish_render = null;
let tunefish_get_num_params = null;

// Audio buffers in WASM memory
let outputPtrL = 0;
let outputPtrR = 0;
const BUFFER_SIZE = 128;

class TunefishProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.port.onmessage = (e) => {
      const { type, data } = e.data;
      
      switch (type) {
        case 'init':
          this.initWasm(data.wasmBytes);
          break;
        case 'noteOn':
          if (ready && tunefish_note_on) {
            tunefish_note_on(synth, data.note, data.velocity);
          }
          break;
        case 'noteOff':
          if (ready && tunefish_note_off) {
            tunefish_note_off(synth, data.note);
          }
          break;
        case 'allNotesOff':
          if (ready && tunefish_all_notes_off) {
            tunefish_all_notes_off(synth);
          }
          break;
        case 'setParameter':
          if (ready && tunefish_set_param) {
            tunefish_set_param(synth, data.index, data.value);
          }
          break;
        case 'setParameters':
          if (ready && tunefish_set_param && data.params) {
            for (const [index, value] of Object.entries(data.params)) {
              tunefish_set_param(synth, parseInt(index), value);
            }
          }
          break;
        case 'pitchBend':
          if (ready && tunefish_pitch_bend) {
            tunefish_pitch_bend(synth, data.semitones || 0, data.cents || 0);
          }
          break;
        case 'modWheel':
          if (ready && tunefish_mod_wheel) {
            tunefish_mod_wheel(synth, data.amount || 0);
          }
          break;
        case 'getNumParams':
          if (ready && tunefish_get_num_params) {
            const numParams = tunefish_get_num_params();
            this.port.postMessage({ type: 'numParams', count: numParams });
          }
          break;
      }
    };
  }

  async initWasm(wasmBytes) {
    try {
      // Load module using Emscripten factory pattern
      // jsCode is already a string (decoded in main thread since worklet doesn't have TextDecoder)
      // The Emscripten JS defines: var createTunefishSynth = (()=>...)();
      // We wrap it in a function that returns the factory
      const moduleFactory = new Function(wasmBytes.jsCode + '\nreturn createTunefishSynth;')();
      
      Module = await moduleFactory({
        wasmBinary: wasmBytes.wasmBinary
      });
      
      // Wrap functions
      tunefish_create = Module.cwrap('tunefish_create', 'number', ['number']);
      tunefish_destroy = Module.cwrap('tunefish_destroy', null, ['number']);
      tunefish_set_sample_rate = Module.cwrap('tunefish_set_sample_rate', null, ['number', 'number']);
      tunefish_set_param = Module.cwrap('tunefish_set_param', null, ['number', 'number', 'number']);
      tunefish_get_param = Module.cwrap('tunefish_get_param', 'number', ['number', 'number']);
      tunefish_note_on = Module.cwrap('tunefish_note_on', null, ['number', 'number', 'number']);
      tunefish_note_off = Module.cwrap('tunefish_note_off', null, ['number', 'number']);
      tunefish_all_notes_off = Module.cwrap('tunefish_all_notes_off', null, ['number']);
      tunefish_pitch_bend = Module.cwrap('tunefish_pitch_bend', null, ['number', 'number', 'number']);
      tunefish_mod_wheel = Module.cwrap('tunefish_mod_wheel', null, ['number', 'number']);
      tunefish_render = Module.cwrap('tunefish_render', null, ['number', 'number', 'number', 'number']);
      tunefish_get_num_params = Module.cwrap('tunefish_get_num_params', 'number', []);
      
      // Create synth instance
      synth = tunefish_create(sampleRate);
      
      // Allocate output buffers in WASM memory
      outputPtrL = Module._malloc(BUFFER_SIZE * 4);
      outputPtrR = Module._malloc(BUFFER_SIZE * 4);
      
      ready = true;
      
      // Report ready with parameter count
      const numParams = tunefish_get_num_params();
      this.port.postMessage({ type: 'ready', numParams: numParams });
    } catch (err) {
      this.port.postMessage({ type: 'error', error: err.message });
    }
  }

  process(inputs, outputs, parameters) {
    if (!ready || !synth) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output[1] || left;
    const blockSize = left.length;

    // Render audio from Tunefish
    tunefish_render(synth, outputPtrL, outputPtrR, blockSize);

    // Copy from WASM memory to output
    const heapF32 = Module.HEAPF32;
    const offsetL = outputPtrL / 4;
    const offsetR = outputPtrR / 4;
    
    for (let i = 0; i < blockSize; i++) {
      left[i] = heapF32[offsetL + i];
      right[i] = heapF32[offsetR + i];
    }

    return true;
  }
}

registerProcessor('tunefish-processor', TunefishProcessor);
