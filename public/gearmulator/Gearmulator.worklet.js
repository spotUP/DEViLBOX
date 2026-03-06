/**
 * Gearmulator AudioWorklet Processor
 * DSP56300-based VA synth emulator (Access Virus, Waldorf, Nord, etc.)
 *
 * Processes audio via WASM DSP56300 interpreter.
 * MIDI is sent via port.postMessage from the main thread.
 */

class GearmulatorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.handle = -1;
    this.module = null;
    this.initialized = false;
    this.initializing = false;
    this.pendingMessages = [];
    this.bufferSize = 128;
    this.outputPtrL = 0;
    this.outputPtrR = 0;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    if (this.initializing && data.type !== 'init') {
      this.pendingMessages.push(data);
      return;
    }

    switch (data.type) {
      case 'init':
        if (!this.initialized && !this.initializing) {
          this.initializing = true;
          try {
            await this.initSynth(data);
          } catch (e) {
            console.error('[Gearmulator Worklet] Init failed:', e);
            this.port.postMessage({ type: 'error', message: String(e) });
          }
          this.initializing = false;
        }
        break;

      case 'noteOn':
        if (this.handle >= 0 && this.module) {
          const status = 0x90 | ((data.channel || 0) & 0x0F);
          this.module._gm_sendMidi(this.handle, status, data.note & 0x7F, (data.velocity || 100) & 0x7F);
        }
        break;

      case 'noteOff':
        if (this.handle >= 0 && this.module) {
          const status = 0x80 | ((data.channel || 0) & 0x0F);
          this.module._gm_sendMidi(this.handle, status, data.note & 0x7F, 0);
        }
        break;

      case 'cc':
        if (this.handle >= 0 && this.module) {
          const status = 0xB0 | ((data.channel || 0) & 0x0F);
          this.module._gm_sendMidi(this.handle, status, data.cc & 0x7F, data.value & 0x7F);
        }
        break;

      case 'programChange':
        if (this.handle >= 0 && this.module) {
          const status = 0xC0 | ((data.channel || 0) & 0x0F);
          this.module._gm_sendMidi(this.handle, status, data.program & 0x7F, 0);
        }
        break;

      case 'sysex':
        if (this.handle >= 0 && this.module && data.data) {
          const buf = new Uint8Array(data.data);
          const ptr = this.module._malloc(buf.length);
          this.module.HEAPU8.set(buf, ptr);
          this.module._gm_sendSysex(this.handle, ptr, buf.length);
          this.module._free(ptr);
        }
        break;

      case 'setClockPercent':
        if (this.handle >= 0 && this.module) {
          this.module._gm_setDspClockPercent(this.handle, data.percent || 100);
        }
        break;

      case 'getState':
        if (this.handle >= 0 && this.module) {
          const size = this.module._gm_getState(this.handle, 0, 0);
          if (size > 0) {
            const ptr = this.module._malloc(size);
            this.module._gm_getState(this.handle, ptr, size);
            const state = new Uint8Array(this.module.HEAPU8.buffer, ptr, size).slice();
            this.module._free(ptr);
            this.port.postMessage({ type: 'state', data: state.buffer }, [state.buffer]);
          }
        }
        break;

      case 'setState':
        if (this.handle >= 0 && this.module && data.data) {
          const buf = new Uint8Array(data.data);
          const ptr = this.module._malloc(buf.length);
          this.module.HEAPU8.set(buf, ptr);
          this.module._gm_setState(this.handle, ptr, buf.length);
          this.module._free(ptr);
        }
        break;

      case 'dispose':
        this.dispose();
        break;
    }
  }

  async initSynth(data) {
    const { sampleRate: sr, wasmBinary, jsCode, romData, synthType } = data;

    if (!jsCode || !wasmBinary || !romData) {
      throw new Error('Missing jsCode, wasmBinary, or romData');
    }

    // Execute the Emscripten module factory in worklet scope
    const wrappedCode = `return (function() { ${jsCode}\n return createGearmulator; })();`;
    const factory = new Function(wrappedCode);
    const createModule = factory();

    // Configure and instantiate the WASM module
    const config = { wasmBinary };
    this.module = await createModule(config);

    // Allocate output buffers in WASM heap
    this.outputPtrL = this.module._malloc(this.bufferSize * 4);
    this.outputPtrR = this.module._malloc(this.bufferSize * 4);

    // Load ROM and create device
    const rom = new Uint8Array(romData);
    const romPtr = this.module._malloc(rom.length);
    this.module.HEAPU8.set(rom, romPtr);

    this.handle = this.module._gm_create(romPtr, rom.length, synthType || 0, sr || sampleRate);
    this.module._free(romPtr);

    if (this.handle < 0) {
      throw new Error(`Failed to create synth device (type=${synthType})`);
    }

    const valid = this.module._gm_isValid(this.handle);
    if (!valid) {
      throw new Error('Device created but not valid — check ROM data');
    }

    const actualRate = this.module._gm_getSamplerate(this.handle);
    console.log(`[Gearmulator Worklet] Device ready — handle=${this.handle}, sampleRate=${actualRate}, type=${synthType}`);

    this.initialized = true;
    this.port.postMessage({ type: 'ready', sampleRate: actualRate, handle: this.handle });

    // Process pending messages
    for (const msg of this.pendingMessages) {
      this.handleMessage(msg);
    }
    this.pendingMessages = [];
  }

  dispose() {
    if (this.handle >= 0 && this.module) {
      this.module._gm_destroy(this.handle);
      this.handle = -1;
    }
    if (this.outputPtrL) {
      this.module._free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (this.outputPtrR) {
      this.module._free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    this.initialized = false;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || this.handle < 0 || !this.module) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0];
    const outR = output[1];
    const numSamples = outL.length;

    try {
      this.module._gm_process(this.handle, this.outputPtrL, this.outputPtrR, numSamples);

      // Read output from WASM heap
      const heapF32 = this.module.HEAPF32;
      const offsetL = this.outputPtrL >> 2;
      const offsetR = this.outputPtrR >> 2;

      outL.set(heapF32.subarray(offsetL, offsetL + numSamples));
      outR.set(heapF32.subarray(offsetR, offsetR + numSamples));
    } catch (e) {
      // Fill with silence on error
      outL.fill(0);
      outR.fill(0);
    }

    return true;
  }
}

registerProcessor('gearmulator-processor', GearmulatorProcessor);
