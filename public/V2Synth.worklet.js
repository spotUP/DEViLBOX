/**
 * V2Synth.worklet.js
 * AudioWorklet for Farbrausch V2 Synth (WASM)
 * 
 * Real-time synthesizer with note-on/off, CC, and patch control.
 */

class V2SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.initialized = false;
    this.renderBuffer = null;
    
    this.port.onmessage = (e) => this.handleMessage(e.data);
  }
  
  async handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        console.log('[V2Synth] init received, sampleRate:', msg.sampleRate, 'wasmBinary length:', msg.wasmBinary?.length || msg.wasmBinary?.byteLength);
        await this.initModule(msg.sampleRate, msg.wasmBinary, msg.jsCode);
        break;
      case 'loadPatch':
        this.loadPatch(msg.channel, msg.patchData);
        break;
      case 'setGlobals':
        this.setGlobals(msg.globalsData);
        break;
      case 'noteOn':
        // console.log('[V2Synth] noteOn ch:', msg.channel, 'note:', msg.note, 'vel:', msg.velocity, 'init:', this.initialized);
        this.noteOn(msg.channel, msg.note, msg.velocity);
        break;
      case 'noteOff':
        this.noteOff(msg.channel, msg.note);
        break;
      case 'controlChange':
        this.controlChange(msg.channel, msg.cc, msg.value);
        break;
      case 'pitchBend':
        this.pitchBend(msg.channel, msg.value);
        break;
      case 'programChange':
        this.programChange(msg.channel, msg.program);
        break;
      case 'allNotesOff':
        this.allNotesOff(msg.channel);
        break;
    }
  }
  
  async initModule(sampleRate, wasmBinary, jsCode) {
    try {
      // Convert Uint8Array back to ArrayBuffer if needed (structured clone from main thread)
      const wasmBuffer = wasmBinary instanceof Uint8Array ? wasmBinary.buffer : wasmBinary;

      // Execute the Emscripten module code - append return statement after the var declaration
      let createFn;
      try {
        createFn = new Function(jsCode + '\nreturn createV2Synth;');
      } catch (syntaxErr) {
        throw new Error('new Function() syntax error: ' + syntaxErr.message + ' | jsCode tail: ' + jsCode.slice(-100));
      }
      let createModule;
      try {
        createModule = createFn();
      } catch (callErr) {
        throw new Error('createFn() call error: ' + callErr.message);
      }

      this.module = await createModule({
        wasmBinary: wasmBuffer,
        print: (text) => console.log('[V2Synth]', text),
        printErr: (text) => console.error('[V2Synth]', text),
      });

      // Initialize the V2 synth
      const result = this.module._v2synth_init(sampleRate);

      if (result === 0 || result === 1) {
        this.initialized = true;
        // Pre-allocate render buffer for 128 stereo samples
        this.renderBuffer = this.module._malloc(128 * 2 * 4);
        this.port.postMessage({ type: 'initialized' });
        console.log('[V2Synth] Initialized at', sampleRate, 'Hz');
      } else {
        this.port.postMessage({ type: 'error', error: 'Failed to initialize V2 synth: _v2synth_init returned ' + result });
      }
    } catch (error) {
      console.error('[V2Synth] Init error:', error.message || error);
      this.port.postMessage({ type: 'error', error: error.message || String(error) });
    }
  }
  
  loadPatch(channel, patchData) {
    if (!this.initialized) return;
    
    try {
      // Allocate memory for patch data
      const ptr = this.module._v2synth_alloc(patchData.length);
      this.module.HEAPU8.set(patchData, ptr);
      
      // Load the patch
      const result = this.module._v2synth_load_patch(channel, ptr, patchData.length);
      
      // Free the input buffer
      this.module._v2synth_free(ptr);
      
      if (result === 0) {
        this.port.postMessage({ type: 'patchLoaded', channel });
      } else {
        this.port.postMessage({ type: 'error', error: `Failed to load patch on channel ${channel}` });
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }
  
  setGlobals(globalsData) {
    if (!this.initialized) return;
    
    try {
      const ptr = this.module._v2synth_alloc(globalsData.length);
      this.module.HEAPU8.set(globalsData, ptr);
      this.module._v2synth_set_globals(ptr);
      this.module._v2synth_free(ptr);
    } catch (error) {
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }
  
  noteOn(channel, note, velocity) {
    if (!this.initialized) return;
    this.module._v2synth_note_on(channel, note, velocity);
  }
  
  noteOff(channel, note) {
    if (!this.initialized) return;
    this.module._v2synth_note_off(channel, note);
  }
  
  controlChange(channel, cc, value) {
    if (!this.initialized) return;
    this.module._v2synth_control_change(channel, cc, value);
  }
  
  pitchBend(channel, value) {
    if (!this.initialized) return;
    this.module._v2synth_pitch_bend(channel, value);
  }
  
  programChange(channel, program) {
    if (!this.initialized) return;
    this.module._v2synth_program_change(channel, program);
  }
  
  allNotesOff(channel) {
    if (!this.initialized) return;
    // Send note-off for all 128 notes
    for (let note = 0; note < 128; note++) {
      this.module._v2synth_note_off(channel, note);
    }
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    
    const left = output[0];
    const right = output[1] || output[0];
    const numSamples = left.length;
    
    if (!this.initialized || !this.renderBuffer) {
      // Fill with silence
      left.fill(0);
      right.fill(0);
      return true;
    }
    
    // Render audio from V2 synth
    this.module._v2synth_render(this.renderBuffer, numSamples);

    // Copy from WASM buffer to output (interleaved stereo F32)
    const heapF32 = this.module.HEAPF32;
    const offset = this.renderBuffer / 4; // F32 offset

    let maxSample = 0;
    for (let i = 0; i < numSamples; i++) {
      left[i] = heapF32[offset + i * 2];
      right[i] = heapF32[offset + i * 2 + 1];
      const abs = Math.abs(left[i]);
      if (abs > maxSample) maxSample = abs;
    }

    // Debug: log first frame that has audio
    if (!this._dbgLogged && maxSample > 0.0001) {
      this._dbgLogged = true;
      // console.log('[V2Synth process] AUDIO DETECTED maxSample=' + maxSample.toFixed(4));
    }
    if (!this._dbgFrames) this._dbgFrames = 0;
    this._dbgFrames++;
    if (this._dbgFrames === 200 && !this._dbgLogged) {
      // console.log('[V2Synth process] 200 frames, maxSample so far=', maxSample, 'initialized=', this.initialized);
    }

    return true;
  }
}

try { registerProcessor('v2-synth-processor', V2SynthProcessor); } catch { /* already registered — harmless on hot reload */ }
