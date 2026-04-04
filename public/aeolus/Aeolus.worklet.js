// Aeolus.worklet.js — AudioWorklet processor for Aeolus pipe organ
// Processes audio in the audio thread using the WASM engine
//
// Parameter indices (0-31):
//   0-13:  Stop on/off (Great: Principal 8', Octave 4', Fifteenth 2',
//          Mixture III, Flute 8', Bourdon 16', Trumpet 8';
//          Swell: Gedackt 8', Salicional 8', Voix Celeste, Oboe 8';
//          Pedal: Subbass 16', Principalbass 8', Trompete 8')
//   14-16: Expression (Great, Swell, Pedal) 0-1
//   17:    Tremulant Speed 0-1 (maps to 2-8 Hz)
//   18:    Tremulant Depth 0-1 (maps to 0-0.6)
//   19:    Tremulant On/Off
//   20:    Reverb Amount 0-1
//   21:    Reverb Delay 0-1
//   22:    Reverb Time 0-1
//   23:    Reverb Bass Time 0-1
//   24:    Reverb Treble Time 0-1
//   25:    Master Volume 0-1
//   26:    Tuning 0-1 (maps to 392-494 Hz)
//   27:    Temperament 0-1 (11 temperaments)
//   28:    Azimuth 0-1
//   29:    Stereo Width 0-1
//   30:    Direct Level 0-1
//   31:    Reflection Level 0-1

class AeolusProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = null;
    this.isInitialized = false;
    this.pendingMessages = [];
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.Module = null;

    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, ...data } = event.data;

    switch (type) {
      case 'init':
        this.initialize(data);
        break;

      case 'noteOn':
        if (this.synth && this.isInitialized) {
          this.Module._aeolus_note_on(this.synth, data.note, data.velocity || 100);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'noteOff':
        if (this.synth && this.isInitialized) {
          this.Module._aeolus_note_off(this.synth, data.note);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'allNotesOff':
        if (this.synth && this.isInitialized) {
          this.Module._aeolus_all_notes_off(this.synth);
        }
        break;

      case 'setParam':
        if (this.synth && this.isInitialized) {
          this.Module._aeolus_set_param(this.synth, data.index, data.value);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  cleanup() {
    if (this.Module && this.outputPtrL) {
      this.Module._free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (this.Module && this.outputPtrR) {
      this.Module._free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    if (this.Module && this.synth) {
      this.Module._aeolus_destroy(this.synth);
      this.synth = null;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.isInitialized = false;
  }

  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;
      if (!wasmBinary || !jsCode) {
        throw new Error('Missing wasmBinary or jsCode in init message');
      }

      let createModule;
      try {
        const wrappedCode = `${jsCode}; return createAeolus;`;
        createModule = new Function(wrappedCode)();
      } catch (evalErr) {
        console.error('Failed to evaluate Aeolus JS:', evalErr);
        throw new Error('Could not evaluate Aeolus module factory');
      }

      if (!createModule) {
        throw new Error('Could not load Aeolus module factory');
      }

      const Module = await createModule({ wasmBinary });
      this.Module = Module;

      // Create engine at current sample rate
      this.synth = Module._aeolus_create(sampleRate);
      if (!this.synth) {
        throw new Error('aeolus_create returned null');
      }

      // Allocate output buffers (128 frames × 4 bytes)
      this.outputPtrL = Module._malloc(128 * 4);
      this.outputPtrR = Module._malloc(128 * 4);

      this.isInitialized = true;

      // Replay pending messages
      for (const msg of this.pendingMessages) {
        this.handleMessage({ data: msg });
      }
      this.pendingMessages = [];

      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('Aeolus worklet init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0];
    const outR = output[1];
    const frames = outL.length;

    if (!this.isInitialized || !this.synth || !this.Module) {
      outL.fill(0);
      outR.fill(0);
      return true;
    }

    // Process audio through WASM
    this.Module._aeolus_process(this.synth, this.outputPtrL, this.outputPtrR, frames);

    // Copy from WASM heap to output arrays
    const heapF32 = this.Module.HEAPF32 ||
      (this.Module.wasmMemory && new Float32Array(this.Module.wasmMemory.buffer));
    if (!heapF32) return true;
    const offsetL = this.outputPtrL >> 2;
    const offsetR = this.outputPtrR >> 2;
    for (let i = 0; i < frames; i++) {
      outL[i] = heapF32[offsetL + i];
      outR[i] = heapF32[offsetR + i];
    }

    return true;
  }
}

registerProcessor('aeolus-processor', AeolusProcessor);
