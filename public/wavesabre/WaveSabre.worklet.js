// WaveSabre Synth AudioWorklet
// Wraps Falcon and Slaughter synths from WaveSabre

// Polyfill performance.now() for AudioWorklet context
if (typeof performance === 'undefined') {
  globalThis.performance = {
    now: () => Date.now()
  };
}

let Module = null;
let synth = null;
let ready = false;

// Synth types
const SYNTH_FALCON = 0;
const SYNTH_SLAUGHTER = 1;
const SYNTH_ADULTERY = 2;

// Wrapped WASM functions
let wavesabre_set_sample_rate = null;
let wavesabre_create_falcon = null;
let wavesabre_create_slaughter = null;
let wavesabre_create_adultery = null;
let wavesabre_set_gmdls_data = null;
let wavesabre_has_gmdls = null;
let wavesabre_destroy = null;
let wavesabre_set_param = null;
let wavesabre_get_param = null;
let wavesabre_set_chunk = null;
let wavesabre_note_on = null;
let wavesabre_note_off = null;
let wavesabre_render = null;

// Audio buffers
let outputPtrL = 0;
let outputPtrR = 0;
const BUFFER_SIZE = 128;

class WaveSabreProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synthType = SYNTH_FALCON; // Default
    
    this.port.onmessage = (e) => {
      const { type, data } = e.data;
      
      switch (type) {
        case 'init':
          console.log('[WaveSabre] init received, synthType:', data.synthType || 'falcon');
          this.initWasm(data.wasmBytes, data.synthType || 'falcon');
          break;
        case 'loadGmDls':
          this.loadGmDls(data.dlsData);
          break;
        case 'noteOn':
          console.log('[WaveSabre] noteOn:', data.note, 'vel:', data.velocity, 'ready:', ready);
          if (ready && wavesabre_note_on) {
            wavesabre_note_on(synth, data.note, data.velocity, 0);
          }
          break;
        case 'noteOff':
          if (ready && wavesabre_note_off) {
            wavesabre_note_off(synth, data.note);
          }
          break;
        case 'setParameter':
          if (ready && wavesabre_set_param) {
            console.log('[WaveSabre] setParameter:', data.index, '=', data.value);
            wavesabre_set_param(synth, data.index, data.value);
          }
          break;
        case 'setParameters':
          if (ready && wavesabre_set_param && data.params) {
            console.log('[WaveSabre] setParameters:', Object.keys(data.params).length, 'params');
            for (const [index, value] of Object.entries(data.params)) {
              wavesabre_set_param(synth, parseInt(index), value);
            }
          }
          break;
        case 'setChunk':
          // Load binary preset chunk (VST state from XRNS)
          if (ready && wavesabre_set_chunk && data.chunk) {
            const chunkBytes = new Uint8Array(data.chunk);
            console.log('[WaveSabre] setChunk:', chunkBytes.length, 'bytes');
            const chunkPtr = Module._malloc(chunkBytes.length);
            Module.HEAPU8.set(chunkBytes, chunkPtr);
            wavesabre_set_chunk(synth, chunkPtr, chunkBytes.length);
            Module._free(chunkPtr);
            // Verify key params after chunk load (Osc volumes at indices 2, 7, 12)
            if (wavesabre_get_param) {
              const osc1Vol = wavesabre_get_param(synth, 2);
              const osc2Vol = wavesabre_get_param(synth, 7);
              const osc3Vol = wavesabre_get_param(synth, 12);
              const masterVol = wavesabre_get_param(synth, 28);
              console.log('[WaveSabre] After chunk: Osc1Vol=' + osc1Vol.toFixed(3) + 
                          ' Osc2Vol=' + osc2Vol.toFixed(3) + 
                          ' Osc3Vol=' + osc3Vol.toFixed(3) +
                          ' Master=' + masterVol.toFixed(3));
              if (osc1Vol === 0 && osc2Vol === 0 && osc3Vol === 0) {
                console.warn('[WaveSabre] ⚠️ All oscillator volumes are 0 - preset may be silent!');
              }
            }
            console.log('[WaveSabre] Chunk loaded successfully');
          }
          break;
      }
    };
  }

  async initWasm(wasmBytes, synthTypeName) {
    try {
      // Determine synth type
      if (synthTypeName === 'slaughter') {
        this.synthType = SYNTH_SLAUGHTER;
      } else if (synthTypeName === 'adultery') {
        this.synthType = SYNTH_ADULTERY;
      } else {
        this.synthType = SYNTH_FALCON;
      }
      
      // Load module using Emscripten factory pattern
      const moduleFactory = new Function(wasmBytes.jsCode + '\nreturn createWaveSabreSynth;')();
      
      Module = await moduleFactory({
        wasmBinary: wasmBytes.wasmBinary
      });
      
      // Wrap functions
      wavesabre_set_sample_rate = Module.cwrap('wavesabre_set_sample_rate', null, ['number']);
      wavesabre_create_falcon = Module.cwrap('wavesabre_create_falcon', 'number', []);
      wavesabre_create_slaughter = Module.cwrap('wavesabre_create_slaughter', 'number', []);
      wavesabre_create_adultery = Module.cwrap('wavesabre_create_adultery', 'number', []);
      wavesabre_set_gmdls_data = Module.cwrap('wavesabre_set_gmdls_data', null, ['number', 'number']);
      wavesabre_has_gmdls = Module.cwrap('wavesabre_has_gmdls', 'number', []);
      wavesabre_destroy = Module.cwrap('wavesabre_destroy', null, ['number']);
      wavesabre_set_param = Module.cwrap('wavesabre_set_param', null, ['number', 'number', 'number']);
      wavesabre_get_param = Module.cwrap('wavesabre_get_param', 'number', ['number', 'number']);
      wavesabre_set_chunk = Module.cwrap('wavesabre_set_chunk', null, ['number', 'number', 'number']);
      wavesabre_note_on = Module.cwrap('wavesabre_note_on', null, ['number', 'number', 'number', 'number']);
      wavesabre_note_off = Module.cwrap('wavesabre_note_off', null, ['number', 'number']);
      wavesabre_render = Module.cwrap('wavesabre_render', null, ['number', 'number', 'number', 'number']);
      
      // Set sample rate
      wavesabre_set_sample_rate(sampleRate);
      
      // Create synth
      if (this.synthType === SYNTH_SLAUGHTER) {
        synth = wavesabre_create_slaughter();
        console.log('[WaveSabre] Created Slaughter synth, ptr:', synth);
      } else if (this.synthType === SYNTH_ADULTERY) {
        synth = wavesabre_create_adultery();
        console.log('[WaveSabre] Created Adultery synth, ptr:', synth);
      } else {
        synth = wavesabre_create_falcon();
        console.log('[WaveSabre] Created Falcon synth, ptr:', synth);
      }
      
      // Allocate output buffers in WASM memory
      outputPtrL = Module._malloc(BUFFER_SIZE * 4);
      outputPtrR = Module._malloc(BUFFER_SIZE * 4);
      console.log('[WaveSabre] Allocated output buffers, L:', outputPtrL, 'R:', outputPtrR);
      
      ready = true;
      this.port.postMessage({ type: 'ready', synthType: synthTypeName });
    } catch (err) {
      this.port.postMessage({ type: 'error', error: err.message });
    }
  }

  loadGmDls(dlsData) {
    if (!Module || !wavesabre_set_gmdls_data) {
      this.port.postMessage({ type: 'error', error: 'WASM not ready for GmDls' });
      return;
    }
    try {
      const dataBytes = new Uint8Array(dlsData);
      const ptr = Module._malloc(dataBytes.length);
      Module.HEAPU8.set(dataBytes, ptr);
      wavesabre_set_gmdls_data(ptr, dataBytes.length);
      Module._free(ptr);
      this.port.postMessage({ type: 'gmdlsLoaded' });
    } catch (err) {
      this.port.postMessage({ type: 'error', error: 'Failed to load GmDls: ' + err.message });
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

    // Render audio
    wavesabre_render(synth, outputPtrL, outputPtrR, blockSize);

    // Copy from WASM memory to output
    const heapF32 = Module.HEAPF32;
    const offsetL = outputPtrL / 4;
    const offsetR = outputPtrR / 4;
    
    // Debug: check if WASM is outputting non-zero samples
    let maxSample = 0;
    for (let i = 0; i < blockSize; i++) {
      left[i] = heapF32[offsetL + i];
      right[i] = heapF32[offsetR + i];
      const absL = Math.abs(left[i]);
      if (absL > maxSample) maxSample = absL;
    }
    
    // Log once per second if we have audio
    if (!this._lastLog || currentTime - this._lastLog > 1) {
      if (maxSample > 0.0001) {
        console.log('[WaveSabre] Audio output detected, max:', maxSample.toFixed(4));
      }
      this._lastLog = currentTime;
    }

    return true;
  }
}

registerProcessor('wavesabre-processor', WaveSabreProcessor);
