/**
 * FurnaceDispatch AudioWorklet Processor
 * Furnace chip dispatch emulation for DEViLBOX
 *
 * Manages MULTIPLE Furnace chip dispatch instances simultaneously
 * (following Furnace's disCont[] pattern), with:
 * - Tick-based command processing at engine rate (60Hz default)
 * - Audio rendering via per-chip acquire/render, mixed to output
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

    // WASM memory pointers for audio output (shared scratch buffer)
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;

    // Multi-chip dispatch — Map<platformType, chipInfo>
    // Mirrors Furnace's disCont[DIV_MAX_CHIPS] array
    this.chips = new Map();

    // Tick accumulator: advance tick() at engine rate (shared across all chips)
    this.tickRate = 60.0;
    this.tickAccumulator = 0;
    this.samplesPerTick = 0;

    // Oscilloscope readback
    this.oscSendCounter = 0;
    this.oscSendInterval = 12; // ~30fps at 128-sample frames (12 * 128/48000 ≈ 32ms)
    this.oscSampleCount = 256;
    this.oscPtrOut = 0;
    this.oscBufferOut = null;

    // Pending messages queue (buffer before init completes)
    this.pendingMessages = [];

    // Exported WASM functions (cwrap'd)
    this.wasm = null;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  /**
   * Get chip info for a given platformType.
   * Falls back to first chip if platformType not specified (backward compat).
   */
  getChip(platformType) {
    if (platformType !== undefined && this.chips.has(platformType)) {
      return this.chips.get(platformType);
    }
    // Fallback: return first chip for backward compat
    if (this.chips.size > 0) {
      return this.chips.values().next().value;
    }
    return null;
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
        try {
          this.createChip(data.platformType, data.sampleRate || sampleRate);
        } catch (e) {
          this.port.postMessage({ type: 'error', message: `createChip(${data.platformType}) crashed: ${e.message || e}` });
        }
        break;

      case 'destroyChip': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.destroy(chip.handle);
          this.chips.delete(data.platformType);
        }
        break;
      }

      case 'dispatch': {
        // Forward a DivCommand to the correct chip dispatch
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.cmd(chip.handle, data.cmd, data.chan, data.val1 || 0, data.val2 || 0);
        }
        break;
      }

      case 'setInstrument': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          // DIV_CMD_INSTRUMENT = 4
          this.wasm.cmd(chip.handle, 4, data.chan || 0, data.instrument || 0, 0);
        }
        break;
      }

      case 'setVolume': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          // DIV_CMD_VOLUME = 5
          this.wasm.cmd(chip.handle, 5, data.chan || 0, data.volume || 0, 0);
        }
        break;
      }

      case 'setGBInstrument':
        if (this.initialized && this.module) {
          const chip = this.getChip(data.platformType);
          if (chip) this.setGBInstrument(chip.handle, data.insIndex, data.insData);
        }
        break;

      case 'setWavetable':
        if (this.initialized && this.module) {
          const chip = this.getChip(data.platformType);
          if (chip) this.setWavetable(chip.handle, data.waveIndex, data.waveData);
        }
        break;

      // Full instrument setters for all chip types
      case 'setFMInstrument':
      case 'setC64Instrument':
      case 'setNESInstrument':
      case 'setSNESInstrument':
      case 'setN163Instrument':
      case 'setFDSInstrument':
      case 'setAmigaInstrument':
      case 'setMultiPCMInstrument':
      case 'setES5506Instrument':
      case 'setESFMInstrument':
      case 'setWaveSynth':
      case 'setInstrumentFull':
        if (this.initialized && this.module) {
          const chip = this.getChip(data.platformType);
          if (chip) this.setInstrumentData(data.type, chip.handle, data.insIndex, data.insData);
        }
        break;

      case 'setMacro':
        if (this.initialized && this.module) {
          const chip = this.getChip(data.platformType);
          if (chip) this.setInstrumentData('setMacro', chip.handle, data.insIndex, data.macroData);
        }
        break;

      case 'setSample':
        if (this.initialized && this.module) {
          const chip = this.getChip(data.platformType);
          if (chip) this.setInstrumentData('setSample', chip.handle, data.sampleIndex, data.sampleData);
        }
        break;

      case 'renderSamples': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.renderSamples(chip.handle);
          console.log('[FurnaceDispatch Worklet] renderSamples called for platform', data.platformType);
        }
        break;
      }

      // Macro control
      case 'setMacrosEnabled': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.setMacrosEnabled(chip.handle, data.enabled ? 1 : 0);
        }
        break;
      }

      case 'clearMacros': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.clearMacros(chip.handle, data.insIndex);
        }
        break;
      }

      case 'releaseMacros': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.releaseMacros(chip.handle, data.chan);
        }
        break;
      }

      // Compatibility flags
      case 'setCompatFlags': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm && data.flags) {
          const heapBuffer = this.getHeapBuffer();
          if (heapBuffer) {
            const flags = data.flags instanceof Uint8Array ? data.flags : new Uint8Array(data.flags);
            const dataPtr = this.module._malloc(flags.length);
            const heap = new Uint8Array(heapBuffer, dataPtr, flags.length);
            heap.set(flags);
            this.wasm.setCompatFlags(chip.handle, dataPtr, flags.length);
            this.module._free(dataPtr);
          }
        }
        break;
      }

      case 'setCompatFlag': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.setCompatFlag(chip.handle, data.flagIndex ?? data.flagId, data.value);
        }
        break;
      }

      case 'resetCompatFlags': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.resetCompatFlags(chip.handle);
        }
        break;
      }

      case 'setTickRate':
        this.tickRate = data.hz || 60.0;
        this.samplesPerTick = sampleRate / this.tickRate;
        // Update tick rate on all active chips
        for (const chip of this.chips.values()) {
          if (this.wasm) this.wasm.setTickRate(chip.handle, this.tickRate);
        }
        break;

      case 'mute': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.mute(chip.handle, data.chan, data.mute ? 1 : 0);
        }
        break;
      }

      case 'reset': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.reset(chip.handle);
        }
        break;
      }

      case 'forceIns': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.forceIns(chip.handle);
        }
        break;
      }

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
        // Full instrument setters for all chip types
        setFMInstrument: this.module._furnace_dispatch_set_fm_instrument,
        setC64Instrument: this.module._furnace_dispatch_set_c64_instrument,
        setNESInstrument: this.module._furnace_dispatch_set_nes_instrument,
        setSNESInstrument: this.module._furnace_dispatch_set_snes_instrument,
        setN163Instrument: this.module._furnace_dispatch_set_n163_instrument,
        setFDSInstrument: this.module._furnace_dispatch_set_fds_instrument,
        setAmigaInstrument: this.module._furnace_dispatch_set_amiga_instrument,
        setMultiPCMInstrument: this.module._furnace_dispatch_set_multipcm_instrument,
        setES5506Instrument: this.module._furnace_dispatch_set_es5506_instrument,
        setESFMInstrument: this.module._furnace_dispatch_set_esfm_instrument,
        setWaveSynth: this.module._furnace_dispatch_set_wavesynth,
        setMacro: this.module._furnace_dispatch_set_macro,
        setInstrumentFull: this.module._furnace_dispatch_set_instrument_full,
        setSample: this.module._furnace_dispatch_set_sample,
        renderSamples: this.module._furnace_dispatch_render_samples,
        // Macro control functions
        setMacrosEnabled: this.module._furnace_dispatch_set_macros_enabled,
        clearMacros: this.module._furnace_dispatch_clear_macros,
        releaseMacros: this.module._furnace_dispatch_release_macros,
        // Compatibility flags
        setCompatFlags: this.module._furnace_dispatch_set_compat_flags,
        resetCompatFlags: this.module._furnace_dispatch_reset_compat_flags,
      };

      // Allocate audio output buffers in WASM memory (shared scratch for render)
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
    // If same platform chip already exists, reuse it (Furnace pattern: disCont[] reuse)
    if (this.chips.has(platformType)) {
      const existing = this.chips.get(platformType);
      console.log('[FurnaceDispatch Worklet] Reusing existing chip for platform', platformType,
                  'handle', existing.handle);
      this.port.postMessage({
        type: 'chipCreated',
        handle: existing.handle,
        numChannels: existing.numChannels,
        platformType: platformType
      });
      return;
    }

    // Create new chip dispatch instance
    const handle = this.wasm.create(platformType, sr);

    if (handle <= 0) {
      console.error('[FurnaceDispatch Worklet] Failed to create platform:', platformType);
      this.port.postMessage({ type: 'error', message: 'Failed to create dispatch for platform ' + platformType });
      return;
    }

    const numChannels = this.wasm.getNumChannels(handle);
    this.chips.set(platformType, {
      handle,
      numChannels,
      platformType,
      lastOscNeedles: new Array(numChannels).fill(0)
    });

    this.tickAccumulator = 0;

    // Set tick rate
    this.wasm.setTickRate(handle, this.tickRate);

    // Enable linear pitch by default for musical note input
    this.wasm.setCompatFlag(handle, 0, 2); // linearPitch = 2 (full linear)

    console.log('[FurnaceDispatch Worklet] Created platform', platformType,
                'handle', handle, 'channels', numChannels,
                'total chips:', this.chips.size);

    this.port.postMessage({
      type: 'chipCreated',
      handle: handle,
      numChannels: numChannels,
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

  setGBInstrument(handle, insIndex, insData) {
    if (!insData || !this.module) return;

    const heapBuffer = this.getHeapBuffer();
    if (!heapBuffer) return;

    // insData is a Uint8Array from the main thread
    const dataLen = insData.length;
    const dataPtr = this.module._malloc(dataLen);
    const heap = new Uint8Array(heapBuffer, dataPtr, dataLen);
    heap.set(insData);

    this.wasm.setGBInstrument(handle, insIndex, dataPtr, dataLen);
    this.module._free(dataPtr);
  }

  setWavetable(handle, waveIndex, waveData) {
    if (!waveData || !this.module) return;

    const heapBuffer = this.getHeapBuffer();
    if (!heapBuffer) return;

    const dataLen = waveData.length;
    const dataPtr = this.module._malloc(dataLen);
    const heap = new Uint8Array(heapBuffer, dataPtr, dataLen);
    heap.set(waveData);

    this.wasm.setWavetable(handle, waveIndex, dataPtr, dataLen);
    this.module._free(dataPtr);
  }

  /**
   * Generic instrument data setter for all chip types.
   * @param {string} wasmFuncName - Name of the WASM function to call
   * @param {number} handle - Dispatch handle for the target chip
   * @param {number} index - Instrument or sample index
   * @param {Uint8Array} data - Binary data to send
   */
  setInstrumentData(wasmFuncName, handle, index, data) {
    if (!data || !this.module || !this.wasm[wasmFuncName]) {
      console.warn('[FurnaceDispatch Worklet] Missing:', wasmFuncName, 'or data');
      return;
    }

    const heapBuffer = this.getHeapBuffer();
    if (!heapBuffer) return;

    const dataLen = data.length;
    const dataPtr = this.module._malloc(dataLen);
    const heap = new Uint8Array(heapBuffer, dataPtr, dataLen);
    heap.set(data);

    this.wasm[wasmFuncName](handle, index, dataPtr, dataLen);
    this.module._free(dataPtr);

    console.log('[FurnaceDispatch Worklet]', wasmFuncName, 'handle:', handle, 'index:', index, 'size:', dataLen);
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
    if (this.chips.size === 0 || !this.wasm || !this.module) return;

    const channelData = [];
    let totalChannels = 0;

    // Read oscilloscope data from all chips (Furnace pattern: iterate disCont[])
    for (const chip of this.chips.values()) {
      for (let ch = 0; ch < chip.numChannels; ch++) {
        const needle = this.wasm.getOscNeedle(chip.handle, ch);

        // Only send if needle has moved
        if (needle === chip.lastOscNeedles[ch]) {
          channelData.push(null);
          totalChannels++;
          continue;
        }
        chip.lastOscNeedles[ch] = needle;

        // Read samples ending at the needle position
        this.wasm.getOscData(chip.handle, ch, this.oscPtrOut, this.oscSampleCount);

        // Copy from WASM memory to transferable buffer
        const oscHeapBuffer = this.getHeapBuffer();
        if (!oscHeapBuffer) { channelData.push(null); totalChannels++; continue; }
        const heap16 = new Int16Array(oscHeapBuffer, this.oscPtrOut, this.oscSampleCount);
        const data = new Int16Array(this.oscSampleCount);
        data.set(heap16);
        channelData.push(data);
        totalChannels++;
      }
    }

    // Only send if at least one channel has new data
    if (channelData.some(d => d !== null)) {
      const transferables = channelData.filter(d => d !== null).map(d => d.buffer);
      this.port.postMessage({
        type: 'oscData',
        channels: channelData,
        numChannels: totalChannels
      }, transferables);
    }
  }

  cleanup() {
    if (this.module) {
      // Destroy all chip dispatch instances
      for (const chip of this.chips.values()) {
        if (this.wasm) this.wasm.destroy(chip.handle);
      }
      this.chips.clear();

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
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || this.chips.size === 0 || !this.wasm) {
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

    try {
      // Advance tick accumulator — tick ALL chips in lock-step
      // (Furnace pattern: for (i=0; i<systemLen; i++) disCont[i].dispatch->tick())
      this.tickAccumulator += numSamples;
      while (this.tickAccumulator >= this.samplesPerTick) {
        for (const chip of this.chips.values()) {
          this.wasm.tick(chip.handle);
        }
        this.tickAccumulator -= this.samplesPerTick;
      }

      // Zero output — we'll mix all chips into it
      outputL.fill(0);
      outputR.fill(0);

      // Render each chip and mix into output
      // (Furnace pattern: each disCont[] renders to its own buffer, then mixed)
      for (const chip of this.chips.values()) {
        this.wasm.render(chip.handle, this.outputPtrL, this.outputPtrR, numSamples);

        // Mix this chip's output into the main output
        for (let i = 0; i < numSamples; i++) {
          outputL[i] += this.outputBufferL[i];
          outputR[i] += this.outputBufferR[i];
        }
      }

      // Periodically send oscilloscope data (~30fps)
      this.oscSendCounter++;
      if (this.oscSendCounter >= this.oscSendInterval) {
        this.oscSendCounter = 0;
        this.readOscilloscopeData();
      }
    } catch (e) {
      if (!this._errorReported) {
        this._errorReported = true;
        const msg = `WASM error in process (chips=${this.chips.size}): ${e.message || e}`;
        this.port.postMessage({ type: 'error', message: msg });
        console.error('[FurnaceDispatch Worklet]', msg);
      }
    }

    return true;
  }
}

registerProcessor('furnace-dispatch-processor', FurnaceDispatchProcessor);
