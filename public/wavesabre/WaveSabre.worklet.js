// WaveSabre Synth AudioWorklet
// Wraps Falcon and Slaughter synths from WaveSabre

import { TimedEventQueue } from '../shared/timedEventQueue.js';

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
let wavesabre_get_voices = null;

// Audio buffers
let outputPtrL = 0;
let outputPtrR = 0;
const BUFFER_SIZE = 128;

// Live voice report for the editor curves (src/engine/voiceStatus/wasmVoiceStatus.ts): 8 floats per sounding voice
const MAX_REPORTED_VOICES = 64;
let watchVoices = false;
let voiceCounter = 0;
let voicePtr = 0;

class WaveSabreProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synthType = SYNTH_FALCON; // Default
    // Notes sent ahead with a `time` wait here for their frame (see shared/timedEventQueue.js)
    this.noteEvents = new TimedEventQueue();
    
    this.port.onmessage = (e) => {
      const { type, data } = e.data;
      
      switch (type) {
        case 'watchVoices':
          watchVoices = !!e.data.on;
          break;
        case 'init':
          console.log('[WaveSabre] init received, synthType:', data.synthType || 'falcon');
          this.initWasm(data.wasmBytes, data.synthType || 'falcon');
          break;
        case 'loadGmDls':
          this.loadGmDls(data.dlsData);
          break;
        case 'noteOn':
          console.log('[WaveSabre] noteOn:', data.note, 'vel:', data.velocity, 'ready:', ready);
          if (ready && wavesabre_note_on && this.noteEvents.push({ type, ...data }, currentTime)) {
            wavesabre_note_on(synth, data.note, data.velocity, 0);
          }
          break;
        case 'noteOff':
          if (ready && wavesabre_note_off && this.noteEvents.push({ type, ...data }, currentTime)) {
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
      wavesabre_get_voices = Module.cwrap('wavesabre_get_voices', 'number', ['number', 'number', 'number']);
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

    // Render in segments so a queued note event keys the synth at its own frame, not at the block start
    const heapF32 = Module.HEAPF32;
    let maxSample = 0;
    let done = 0;
    while (done < blockSize) {
      const now = currentTime + done / sampleRate;
      this.noteEvents.drain(now, (ev) => {
        if (ev.type === 'noteOn') wavesabre_note_on(synth, ev.note, ev.velocity, 0);
        else wavesabre_note_off(synth, ev.note);
      });
      const off = this.noteEvents.nextOffset(now, blockSize - done, sampleRate);
      const len = off > 0 ? off : blockSize - done;
      wavesabre_render(synth, outputPtrL + done * 4, outputPtrR + done * 4, len);

      // Copy from WASM memory to output
      const offsetL = (outputPtrL + done * 4) / 4;
      const offsetR = (outputPtrR + done * 4) / 4;
      for (let i = 0; i < len; i++) {
        left[done + i] = heapF32[offsetL + i];
        right[done + i] = heapF32[offsetR + i];
        const absL = Math.abs(left[done + i]);
        if (absL > maxSample) maxSample = absL;
      }
      done += len;
    }

    if (watchVoices && wavesabre_get_voices && ++voiceCounter >= 6) {
      voiceCounter = 0;
      if (!voicePtr) voicePtr = Module._malloc(MAX_REPORTED_VOICES * 8 * 4);
      const n = wavesabre_get_voices(synth, voicePtr, MAX_REPORTED_VOICES);
      const at = voicePtr >> 2;
      this.port.postMessage({ type: 'voiceStatus', voices: heapF32.slice(at, at + n * 8) });
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
