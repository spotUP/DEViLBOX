// Tunefish 4 Synth AudioWorklet
// Wraps Tunefish synth from WASM

// Polyfill performance.now() for AudioWorklet context
if (typeof performance === 'undefined') {
  globalThis.performance = {
    now: () => Date.now()
  };
}

import { TimedEventQueue } from '../shared/timedEventQueue.js';

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
let tunefish_get_voices = null;

// Audio buffers in WASM memory
let outputPtrL = 0;
let outputPtrR = 0;
const BUFFER_SIZE = 128;

// Live voice report for the editor curves (src/engine/voiceStatus/wasmVoiceStatus.ts): 12 floats per voice
const VOICE_STRIDE = 12;
const MAX_VOICES = 16;
let watchVoices = false;
let voiceCounter = 0;
let voicePtr = 0;

class TunefishProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Notes sent ahead with a `time` wait here for their frame (see shared/timedEventQueue.js)
    this.noteEvents = new TimedEventQueue();

    this.port.onmessage = (e) => {
      const { type, data } = e.data;
      
      switch (type) {
        case 'watchVoices':
          watchVoices = !!e.data.on;
          break;
        case 'init':
          this.initWasm(data.wasmBytes);
          break;
        case 'noteOn':
          if (ready && tunefish_note_on && this.noteEvents.push({ type, ...data }, currentTime)) {
            tunefish_note_on(synth, data.note, data.velocity);
          }
          break;
        case 'noteOff':
          if (ready && tunefish_note_off && this.noteEvents.push({ type, ...data }, currentTime)) {
            tunefish_note_off(synth, data.note);
          }
          break;
        case 'allNotesOff':
          if (ready && tunefish_all_notes_off) {
            this.noteEvents.cancelFrom((data && data.time) ?? currentTime);
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
      tunefish_get_voices = Module.cwrap('tunefish_get_voices', 'number', ['number', 'number', 'number']);
      
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

    // Render in segments so a queued note event keys the synth at its own frame, not at the block start
    let done = 0;
    while (done < blockSize) {
      const now = currentTime + done / sampleRate;
      this.noteEvents.drain(now, (ev) => {
        if (ev.type === 'noteOn') tunefish_note_on(synth, ev.note, ev.velocity);
        else tunefish_note_off(synth, ev.note);
      });
      const off = this.noteEvents.nextOffset(now, blockSize - done, sampleRate);
      const len = off > 0 ? off : blockSize - done;
      tunefish_render(synth, outputPtrL + done * 4, outputPtrR + done * 4, len);

      // Copy from WASM memory to output (heap view re-read: render may grow memory)
      const heapF32 = Module.HEAPF32;
      const offsetL = (outputPtrL + done * 4) / 4;
      const offsetR = (outputPtrR + done * 4) / 4;
      for (let i = 0; i < len; i++) {
        left[done + i] = heapF32[offsetL + i];
        right[done + i] = heapF32[offsetR + i];
      }
      done += len;
    }

    if (watchVoices && tunefish_get_voices && ++voiceCounter >= 6) {
      voiceCounter = 0;
      if (!voicePtr) voicePtr = Module._malloc(MAX_VOICES * VOICE_STRIDE * 4);
      const n = tunefish_get_voices(synth, voicePtr, MAX_VOICES);
      const at = voicePtr >> 2;
      this.port.postMessage({ type: 'voiceStatus', stride: VOICE_STRIDE, voices: Module.HEAPF32.slice(at, at + n * VOICE_STRIDE) });
    }

    return true;
  }
}

registerProcessor('tunefish-processor', TunefishProcessor);
