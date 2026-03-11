// Oidos Synth AudioWorklet
// Wraps the WASM Oidos additive synth for real-time audio

let wasm = null;
let synth = null;
let ready = false;

// Inline the WASM bindings for worklet context (no ES modules)
let cachedUint8Memory0 = new Uint8Array();
let cachedFloat32Memory0 = new Float32Array();
let WASM_VECTOR_LEN = 0;

function getUint8Memory0() {
  if (cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
}

function getFloat32Memory0() {
  if (cachedFloat32Memory0.byteLength === 0) {
    cachedFloat32Memory0 = new Float32Array(wasm.memory.buffer);
  }
  return cachedFloat32Memory0;
}

function passArrayF32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4);
  getFloat32Memory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}

// OidosSynth wrapper class for worklet
class OidosSynthWrapper {
  constructor(sampleRate) {
    this.ptr = wasm.oidossynth_new(sampleRate);
  }

  setParameter(index, value) {
    wasm.oidossynth_set_parameter(this.ptr, index, value);
  }

  noteOn(note, velocity) {
    wasm.oidossynth_note_on(this.ptr, note, velocity);
  }

  noteOff(note) {
    wasm.oidossynth_note_off(this.ptr, note);
  }

  process(output) {
    const ptr0 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.oidossynth_process(this.ptr, ptr0, len0);
    output.set(getFloat32Memory0().subarray(ptr0 / 4, ptr0 / 4 + len0));
    wasm.__wbindgen_free(ptr0, len0 * 4);
  }

  getActiveVoices() {
    return wasm.oidossynth_get_active_voices(this.ptr) >>> 0;
  }

  free() {
    wasm.__wbg_oidossynth_free(this.ptr);
    this.ptr = 0;
  }
}

class OidosProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.outputBuffer = new Float32Array(128);
    
    this.port.onmessage = (e) => {
      const { type, data } = e.data;
      
      switch (type) {
        case 'init':
          console.log('[Oidos] init received, wasmBytes length:', data.wasmBytes?.byteLength);
          this.initWasm(data.wasmBytes);
          break;
        case 'noteOn':
          console.log('[Oidos] noteOn:', data.note, 'vel:', data.velocity, 'synth:', !!synth);
          if (synth) synth.noteOn(data.note, data.velocity);
          break;
        case 'noteOff':
          console.log('[Oidos] noteOff:', data.note);
          if (synth) synth.noteOff(data.note);
          break;
        case 'setParameter':
          if (synth) synth.setParameter(data.index, data.value);
          break;
        case 'setParameters':
          if (synth && data.params) {
            for (const [index, value] of Object.entries(data.params)) {
              synth.setParameter(parseInt(index), value);
            }
          }
          break;
      }
    };
  }

  async initWasm(wasmBytes) {
    try {
      const imports = {
        wbg: {
          __wbindgen_throw: (arg0, arg1) => {
            // TextDecoder may not be available in worklet - use fallback
            let message;
            try {
              const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
              message = decoder.decode(getUint8Memory0().subarray(arg0, arg0 + arg1));
            } catch (e) {
              // Fallback: just report the error without decoding
              message = 'WASM error (TextDecoder unavailable)';
            }
            throw new Error(message);
          }
        }
      };

      const module = new WebAssembly.Module(wasmBytes);
      const instance = new WebAssembly.Instance(module, imports);
      wasm = instance.exports;
      
      // Reset memory caches
      cachedUint8Memory0 = new Uint8Array();
      cachedFloat32Memory0 = new Float32Array();
      
      synth = new OidosSynthWrapper(sampleRate);
      ready = true;
      
      this.port.postMessage({ type: 'ready' });
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

    // Ensure output buffer is correct size
    if (this.outputBuffer.length !== blockSize) {
      this.outputBuffer = new Float32Array(blockSize);
    }

    // Generate mono audio
    synth.process(this.outputBuffer);

    // Copy to stereo output
    for (let i = 0; i < blockSize; i++) {
      left[i] = this.outputBuffer[i];
      right[i] = this.outputBuffer[i];
    }

    return true;
  }
}

registerProcessor('oidos-processor', OidosProcessor);
