/**
 * FurnaceDispatch AudioWorklet Processor
 * Furnace chip dispatch emulation for DEViLBOX
 *
 * Manages Furnace chip dispatch instances (Game Boy, NES, etc.) with:
 * - Tick-based command processing at engine rate (60Hz default)
 * - Audio rendering via dispatch acquire()
 * - Oscilloscope buffer readback for visualization
 *
 * IMPORTANT: AudioWorklets don't support dynamic import().
 * The WASM module JS is passed as a string and executed via Function constructor.
 */

class FurnaceDispatchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;

    // WASM memory pointers for audio output
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;

    // Dispatch instance handle
    this.dispatchHandle = 0;
    this.numChannels = 0;
    this.platformType = 0;

    // Tick accumulator: advance tick() at engine rate
    this.tickRate = 60.0;
    this.tickAccumulator = 0;
    this.samplesPerTick = 0;

    // Oscilloscope readback
    this.oscSendCounter = 0;
    this.oscSendInterval = 12; // ~30fps at 128-sample frames (12 * 128/48000 ≈ 32ms)
    this.oscSampleCount = 256;
    this.oscPtrOut = 0;
    this.oscBufferOut = null;
    this.lastOscNeedles = [];

    // Pending messages queue (buffer before init completes)
    this.pendingMessages = [];

    // Exported WASM functions (cwrap'd)
    this.wasm = null;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'createChip':
        if (!this.initialized) {
          this.pendingMessages.push(data);
          return;
        }
        this.createChip(data.platformType, data.sampleRate || sampleRate);
        break;

      case 'destroyChip':
        if (this.dispatchHandle && this.wasm) {
          this.wasm.destroy(this.dispatchHandle);
          this.dispatchHandle = 0;
          this.numChannels = 0;
        }
        break;

      case 'dispatch':
        // Forward a DivCommand to the dispatch
        if (this.dispatchHandle && this.wasm) {
          this.wasm.cmd(this.dispatchHandle, data.cmd, data.chan, data.val1 || 0, data.val2 || 0);
        }
        break;

      case 'setInstrument':
        if (this.dispatchHandle && this.wasm) {
          // DIV_CMD_INSTRUMENT = 4
          this.wasm.cmd(this.dispatchHandle, 4, data.chan || 0, data.instrument || 0, 0);
        }
        break;

      case 'setVolume':
        if (this.dispatchHandle && this.wasm) {
          // DIV_CMD_VOLUME = 5
          this.wasm.cmd(this.dispatchHandle, 5, data.chan || 0, data.volume || 0, 0);
        }
        break;

      case 'setGBInstrument':
        if (this.initialized && this.module) {
          this.setGBInstrument(data.insIndex, data.insData);
        }
        break;

      case 'setWavetable':
        if (this.initialized && this.module) {
          this.setWavetable(data.waveIndex, data.waveData);
        }
        break;

      case 'setTickRate':
        this.tickRate = data.hz || 60.0;
        this.samplesPerTick = sampleRate / this.tickRate;
        if (this.dispatchHandle && this.wasm) {
          this.wasm.setTickRate(this.dispatchHandle, this.tickRate);
        }
        break;

      case 'setCompatFlag':
        if (this.dispatchHandle && this.wasm) {
          this.wasm.setCompatFlag(this.dispatchHandle, data.flagId, data.value);
        }
        break;

      case 'mute':
        if (this.dispatchHandle && this.wasm) {
          this.wasm.mute(this.dispatchHandle, data.chan, data.mute ? 1 : 0);
        }
        break;

      case 'reset':
        if (this.dispatchHandle && this.wasm) {
          this.wasm.reset(this.dispatchHandle);
        }
        break;

      case 'forceIns':
        if (this.dispatchHandle && this.wasm) {
          this.wasm.forceIns(this.dispatchHandle);
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(sr, wasmBinary, jsCode) {
    try {
      this.cleanup();

      // Load JS module via Function constructor
      if (jsCode && !globalThis.createFurnaceDispatch) {
        console.log('[FurnaceDispatch Worklet] Loading JS module...');

        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class URL {
            constructor(path) { this.href = path; }
          };
        }

        const wrappedCode = jsCode + '\nreturn createFurnaceDispatch;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.createFurnaceDispatch = result;
          console.log('[FurnaceDispatch Worklet] JS module loaded');
        } else {
          throw new Error('Failed to load JS module: got ' + typeof result);
        }
      }

      if (typeof globalThis.createFurnaceDispatch !== 'function') {
        throw new Error('createFurnaceDispatch factory not available');
      }

      // Intercept WebAssembly.instantiate to capture WASM memory
      // (Emscripten doesn't export HEAPF32/wasmMemory on Module)
      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) {
              capturedMemory = value;
              break;
            }
          }
        }
        return result;
      };

      // Initialize WASM module
      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }
      // Prevent Emscripten from using URL() to locate files (not available in WorkletGlobalScope)
      config.locateFile = (path) => path;

      try {
        this.module = await globalThis.createFurnaceDispatch(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Store captured WASM memory for HEAPF32 access
      if (!this.module.HEAPF32 && !this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      console.log('[FurnaceDispatch Worklet] WASM loaded, HEAPF32:', !!this.module.HEAPF32,
        'wasmMemory:', !!this.module.wasmMemory, 'captured:', !!capturedMemory);

      // Call global init
      this.module._furnace_init(sr || sampleRate);

      // Wrap exported functions for convenience
      this.wasm = {
        create: this.module._furnace_dispatch_create,
        destroy: this.module._furnace_dispatch_destroy,
        reset: this.module._furnace_dispatch_reset,
        cmd: this.module._furnace_dispatch_cmd,
        tick: this.module._furnace_dispatch_tick,
        render: this.module._furnace_dispatch_render,
        getNumChannels: this.module._furnace_dispatch_get_num_channels,
        getOscNeedle: this.module._furnace_dispatch_get_osc_needle,
        getOscData: this.module._furnace_dispatch_get_osc_data,
        mute: this.module._furnace_dispatch_mute,
        setCompatFlag: this.module._furnace_dispatch_set_compat_flag,
        setTickRate: this.module._furnace_dispatch_set_tick_rate,
        setTuning: this.module._furnace_dispatch_set_tuning,
        setGBInstrument: this.module._furnace_dispatch_set_gb_instrument,
        setWavetable: this.module._furnace_dispatch_set_wavetable,
        forceIns: this.module._furnace_dispatch_force_ins,
        poke: this.module._furnace_dispatch_poke,
      };

      // Allocate audio output buffers in WASM memory
      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      // Allocate oscilloscope readback buffer (int16 = 2 bytes)
      this.oscPtrOut = this.module._malloc(this.oscSampleCount * 2);

      this.samplesPerTick = (sr || sampleRate) / this.tickRate;
      this.updateBufferViews();

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
      console.log('[FurnaceDispatch Worklet] Ready');

      // Process any pending messages
      const pending = this.pendingMessages;
      this.pendingMessages = [];
      for (const msg of pending) {
        this.handleMessage(msg);
      }
    } catch (error) {
      console.error('[FurnaceDispatch Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  createChip(platformType, sr) {
    // Destroy existing chip first
    if (this.dispatchHandle) {
      this.wasm.destroy(this.dispatchHandle);
      this.dispatchHandle = 0;
    }

    this.platformType = platformType;
    this.dispatchHandle = this.wasm.create(platformType, sr);

    if (this.dispatchHandle <= 0) {
      console.error('[FurnaceDispatch Worklet] Failed to create platform:', platformType);
      this.port.postMessage({ type: 'error', message: 'Failed to create dispatch for platform ' + platformType });
      return;
    }

    this.numChannels = this.wasm.getNumChannels(this.dispatchHandle);
    this.lastOscNeedles = new Array(this.numChannels).fill(0);
    this.tickAccumulator = 0;

    // Set tick rate
    this.wasm.setTickRate(this.dispatchHandle, this.tickRate);

    // Enable linear pitch by default for musical note input
    this.wasm.setCompatFlag(this.dispatchHandle, 0, 2); // linearPitch = 2 (full linear)

    console.log('[FurnaceDispatch Worklet] Created platform', platformType,
                'handle', this.dispatchHandle, 'channels', this.numChannels);

    this.port.postMessage({
      type: 'chipCreated',
      handle: this.dispatchHandle,
      numChannels: this.numChannels,
      platformType: platformType
    });
  }

  getHeapBuffer() {
    // Get WASM memory buffer from multiple sources
    if (this.module.HEAPU8) return this.module.HEAPU8.buffer;
    if (this.module.HEAPF32) return this.module.HEAPF32.buffer;
    if (this.module.wasmMemory) return this.module.wasmMemory.buffer;
    return null;
  }

  setGBInstrument(insIndex, insData) {
    if (!insData || !this.module) return;

    const heapBuffer = this.getHeapBuffer();
    if (!heapBuffer) return;

    // insData is a Uint8Array from the main thread
    const dataLen = insData.length;
    const dataPtr = this.module._malloc(dataLen);
    const heap = new Uint8Array(heapBuffer, dataPtr, dataLen);
    heap.set(insData);

    this.wasm.setGBInstrument(this.dispatchHandle, insIndex, dataPtr, dataLen);
    this.module._free(dataPtr);
  }

  setWavetable(waveIndex, waveData) {
    if (!waveData || !this.module) return;

    const heapBuffer = this.getHeapBuffer();
    if (!heapBuffer) return;

    const dataLen = waveData.length;
    const dataPtr = this.module._malloc(dataLen);
    const heap = new Uint8Array(heapBuffer, dataPtr, dataLen);
    heap.set(waveData);

    this.wasm.setWavetable(this.dispatchHandle, waveIndex, dataPtr, dataLen);
    this.module._free(dataPtr);
  }

  updateBufferViews() {
    if (!this.module || !this.outputPtrL) return;

    // Try multiple sources for WASM memory buffer
    const wasmMem = this.module.wasmMemory;
    const heapBuffer = this.module.HEAPF32
      ? this.module.HEAPF32.buffer
      : (wasmMem ? wasmMem.buffer : null);
    if (!heapBuffer) return;

    if (this.lastHeapBuffer !== heapBuffer) {
      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, this.bufferSize);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, this.bufferSize);
      this.lastHeapBuffer = heapBuffer;
    }
  }

  readOscilloscopeData() {
    if (!this.dispatchHandle || !this.wasm || !this.module || this.numChannels === 0) return;

    const channelData = [];

    for (let ch = 0; ch < this.numChannels; ch++) {
      const needle = this.wasm.getOscNeedle(this.dispatchHandle, ch);

      // Only send if needle has moved
      if (needle === this.lastOscNeedles[ch]) {
        channelData.push(null);
        continue;
      }
      this.lastOscNeedles[ch] = needle;

      // Read samples ending at the needle position
      const startPos = (needle - this.oscSampleCount) & 0xFFFF;
      this.wasm.getOscData(this.dispatchHandle, ch, this.oscPtrOut, startPos, this.oscSampleCount);

      // Copy from WASM memory to transferable buffer
      const oscHeapBuffer = this.getHeapBuffer();
      if (!oscHeapBuffer) continue;
      const heap16 = new Int16Array(oscHeapBuffer, this.oscPtrOut, this.oscSampleCount);
      const data = new Int16Array(this.oscSampleCount);
      data.set(heap16);
      channelData.push(data);
    }

    // Only send if at least one channel has new data
    if (channelData.some(d => d !== null)) {
      const transferables = channelData.filter(d => d !== null).map(d => d.buffer);
      this.port.postMessage({
        type: 'oscData',
        channels: channelData,
        numChannels: this.numChannels
      }, transferables);
    }
  }

  cleanup() {
    if (this.module) {
      if (this.dispatchHandle) {
        this.wasm.destroy(this.dispatchHandle);
        this.dispatchHandle = 0;
      }

      const free = this.module._free;
      if (free) {
        if (this.outputPtrL) free(this.outputPtrL);
        if (this.outputPtrR) free(this.outputPtrR);
        if (this.oscPtrOut) free(this.oscPtrOut);
      }
    }

    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.oscPtrOut = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.oscBufferOut = null;
    this.wasm = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
    this.numChannels = 0;
    this.platformType = 0;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.dispatchHandle || !this.wasm) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = Math.min(outputL.length, this.bufferSize);

    // Check for WASM memory growth
    this.updateBufferViews();

    if (!this.outputBufferL || !this.outputBufferR) {
      return true;
    }

    // Advance tick accumulator and call tick() at engine rate
    this.tickAccumulator += numSamples;
    while (this.tickAccumulator >= this.samplesPerTick) {
      this.wasm.tick(this.dispatchHandle);
      this.tickAccumulator -= this.samplesPerTick;
    }

    // Render audio from dispatch
    this.wasm.render(this.dispatchHandle, this.outputPtrL, this.outputPtrR, numSamples);

    // Copy from WASM memory to output
    for (let i = 0; i < numSamples; i++) {
      outputL[i] = this.outputBufferL[i];
      outputR[i] = this.outputBufferR[i];
    }

    // Periodically send oscilloscope data (~30fps)
    this.oscSendCounter++;
    if (this.oscSendCounter >= this.oscSendInterval) {
      this.oscSendCounter = 0;
      this.readOscilloscopeData();
    }

    return true;
  }
}

registerProcessor('furnace-dispatch-processor', FurnaceDispatchProcessor);
