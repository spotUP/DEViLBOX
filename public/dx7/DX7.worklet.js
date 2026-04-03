/**
 * DX7 AudioWorklet Processor — VDX7 cycle-accurate DX7 emulation
 * WASM JS code passed as string from main thread.
 * Includes linear-interpolation resampler (49096 Hz → host rate).
 */

class DX7Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.module = null;
    this.outPtrL = 0;
    this.outPtrR = 0;

    // Resampler state
    this.nativeRate = 49096.354;
    this.hostRate = 48000;
    this.resampleRatio = 1.0;
    this.resamplePhase = 0.0;
    this.nativeBufSize = 0;
    this.nativeBufL = null;
    this.nativeBufR = null;
    this.nativeBufFilled = 0;
    this.nativeReadIdx = 0;
    this.prevSampleL = 0;
    this.prevSampleR = 0;
    this.curSampleL = 0;
    this.curSampleR = 0;

    // Level monitoring (unused)

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        await this.initWasm(msg.sampleRate, msg.wasmBinary, msg.jsCode);
        break;
      case 'loadFirmware':
        if (this.module) this.loadFirmware(msg.data);
        break;
      case 'loadVoices':
        if (this.ready) this.loadVoices(msg.data);
        break;
      case 'loadSysex':
        if (this.ready) this.loadSysex(msg.data);
        break;
      case 'noteOn':
        if (this.ready) this.module._dx7NoteOn(msg.note, msg.velocity);
        break;
      case 'noteOff':
        if (this.ready) this.module._dx7NoteOff(msg.note);
        break;
      case 'allNotesOff':
        if (this.ready) this.module._dx7AllNotesOff();
        break;
      case 'sustain':
        if (this.ready) this.module._dx7Sustain(msg.value ? 1 : 0);
        break;
      case 'pitchBend':
        if (this.ready) this.module._dx7PitchBend(msg.value);
        break;
      case 'modWheel':
        if (this.ready) this.module._dx7ModWheel(msg.value);
        break;
      case 'setBank':
        if (this.ready) this.module._dx7SetBank(msg.bank);
        break;
      case 'programChange':
        if (this.ready) this.module._dx7ProgramChange(msg.program);
        break;
      case 'setVolume':
        if (this.ready) this.module._dx7SetVolume(msg.volume);
        break;
      case 'getPatchName': {
        if (this.ready) {
          const ptr = this.module._dx7GetPatchName(msg.index);
          const name = this.module.UTF8ToString(ptr);
          this.port.postMessage({ type: 'patchName', index: msg.index, name });
        }
        break;
      }
      case 'destroy':
        if (this.ready) { this.module._dx7Destroy(); this.ready = false; }
        break;
    }
  }

  loadFirmware(arrayBuf) {
    const bytes = new Uint8Array(arrayBuf);
    if (bytes.length !== 16384) {
      this.port.postMessage({ type: 'error', message: `Invalid ROM size: ${bytes.length} (expected 16384)` });
      return;
    }
    const ptr = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, ptr);
    const result = this.module._dx7LoadFirmware(ptr, bytes.length);
    this.module._free(ptr);
    if (result === 0) {
      this.ready = true;
      // Get native sample rate from WASM
      this.nativeRate = this.module._dx7GetNativeSamplerate();
      this.resampleRatio = this.nativeRate / this.hostRate;
      this.port.postMessage({ type: 'ready' });
    } else {
      this.port.postMessage({ type: 'error', message: `ROM load failed: ${result}` });
    }
  }

  loadVoices(arrayBuf) {
    const bytes = new Uint8Array(arrayBuf);
    const ptr = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, ptr);
    const result = this.module._dx7LoadVoices(ptr, bytes.length);
    this.module._free(ptr);
    this.port.postMessage({ type: 'voicesLoaded', success: result === 0, size: bytes.length });
  }

  loadSysex(arrayBuf) {
    const bytes = new Uint8Array(arrayBuf);
    const ptr = this.module._malloc(bytes.length);
    this.module.HEAPU8.set(bytes, ptr);
    this.module._dx7LoadSysex(ptr, bytes.length);
    this.module._free(ptr);
    this.port.postMessage({ type: 'sysexLoaded' });
  }

  async initWasm(sampleRate, wasmBinary, jsCode) {
    this.hostRate = sampleRate;
    try {
      if (jsCode && !globalThis.createDX7Module) {
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV' }),
            getElementById: () => null, querySelector: () => null,
            querySelectorAll: () => [], getElementsByTagName: () => [],
            head: { appendChild: () => {} },
            addEventListener: () => {}, removeEventListener: () => {}
          };
        }
        if (typeof globalThis.window === 'undefined') {
          globalThis.window = {
            addEventListener: () => {}, removeEventListener: () => {},
            location: { href: '', pathname: '' }
          };
        }

        const wrappedCode = jsCode + '\nreturn createDX7Module;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') globalThis.createDX7Module = result;
        else { this.port.postMessage({ type: 'error', message: 'Failed to load DX7 JS' }); return; }
      }

      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) { capturedMemory = value; break; }
          }
        }
        return result;
      };

      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;
      try { this.module = await globalThis.createDX7Module(config); }
      finally { WebAssembly.instantiate = origInstantiate; }

      if (!this.module.wasmMemory && capturedMemory) this.module.wasmMemory = capturedMemory;

      this.module._dx7Init();

      // Allocate native-rate buffer (~2x host buffer for safety)
      this.nativeBufSize = 512;
      this.outPtrL = this.module._malloc(this.nativeBufSize * 4);
      this.outPtrR = this.module._malloc(this.nativeBufSize * 4);
      this.nativeBufL = new Float32Array(this.nativeBufSize);
      this.nativeBufR = new Float32Array(this.nativeBufSize);
      this.nativeBufFilled = 0;

      this.resampleRatio = this.nativeRate / this.hostRate;

      // Tell main thread WASM is loaded (but not ready until ROM is loaded)
      this.port.postMessage({ type: 'wasmLoaded' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: `DX7 init failed: ${err.message || err}` });
    }
  }

  // Generate native-rate samples into internal buffer
  fillNativeBuffer(count) {
    const n = Math.min(count, this.nativeBufSize);
    this.module._dx7Process(this.outPtrL, this.outPtrR, n);
    const heap = this.module.HEAPF32 || new Float32Array(this.module.wasmMemory.buffer);
    const offL = this.outPtrL >> 2;
    const offR = this.outPtrR >> 2;
    for (let i = 0; i < n; i++) {
      this.nativeBufL[i] = heap[offL + i];
      this.nativeBufR[i] = heap[offR + i];
    }
    this.nativeReadIdx = 0;
    this.nativeBufFilled = n;
    return n;
  }

  // Get next native sample, generating more if needed
  nextNativeSample() {
    if (this.nativeReadIdx >= this.nativeBufFilled) {
      // Generate a batch of native samples (128 at a time for efficiency)
      this.fillNativeBuffer(128);
    }
    const idx = this.nativeReadIdx++;
    return { l: this.nativeBufL[idx], r: this.nativeBufR[idx] };
  }

  process(inputs, outputs) {
    if (!this.ready || !this.module) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outL = output[0], outR = output[1];
    const n = outL.length;

    // No worklet gain — VDX7 raw output peaks ~0.3, registry volumeOffsetDb handles boost
    const gain = 1.0;

    // Linear interpolation resampler: native rate → host rate
    for (let i = 0; i < n; i++) {
      this.resamplePhase += this.resampleRatio;

      // Consume native samples as needed
      while (this.resamplePhase >= 1.0) {
        this.resamplePhase -= 1.0;
        this.prevSampleL = this.curSampleL;
        this.prevSampleR = this.curSampleR;
        const s = this.nextNativeSample();
        this.curSampleL = s.l;
        this.curSampleR = s.r;
      }

      // Linear interpolation
      const frac = this.resamplePhase;
      outL[i] = gain * (this.prevSampleL + frac * (this.curSampleL - this.prevSampleL));
      outR[i] = gain * (this.prevSampleR + frac * (this.curSampleR - this.prevSampleR));
    }

    return true;
  }
}

registerProcessor('dx7-processor', DX7Processor);
