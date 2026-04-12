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

// Per-platform getPostAmp() — matches upstream Furnace exactly.
// Default is 1.0. Keys are DivSystem enum values (matching FurnaceDispatchWrapper.cpp).
const POST_AMP = {
  4: 1.5,   // SMS
  5: 1.5,   // SMS_OPLL
  83: 1.5,  // T6W28
  29: 1.5,  // OPLL
  48: 1.5,  // VRC7
  59: 1.5,  // OPLL_DRUMS
  8: 2.0,   // NES
  106: 2.0, // 5E01
  2: 2.0,   // GENESIS
  3: 2.0,   // GENESIS_EXT
  20: 2.0,  // YM2612
  52: 2.0,  // YM2612_EXT
  80: 2.0,  // YM2612_DUALPCM
  81: 2.0,  // YM2612_DUALPCM_EXT
  89: 2.0,  // YM2612_CSM
  42: 2.0,  // POKEY
  30: 2.0,  // FDS
  11: 3.0,  // C64_6581 (reSIDfp)
  12: 3.0,  // C64_8580 (reSIDfp)
  98: 3.0,  // C140
  99: 3.0,  // C219
  74: 3.0,  // MSM6295
  65: 4.0,  // X1_010
  76: 4.0,  // YMZ280B
  62: 4.0,  // VERA
  47: 6.0,  // VBOY
  31: 64.0, // MMC5
  21: 0.5,  // TIA
};

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

    // Sequencer state
    this.sequencerActive = false;
    this._lastSeqOrder = 0;
    this._lastSeqRow = 0;
    this._posFrameCount = 0;

    // Oscilloscope readback
    this.oscSendCounter = 0;
    this.oscSendInterval = 12; // ~30fps at 128-sample frames (12 * 128/48000 ≈ 32ms)
    this.oscSampleCount = 256;
    this.oscPtrOut = 0;
    this.oscBufferOut = null;

    // Pending messages queue (buffer before init completes)
    this.pendingMessages = [];

    // Scheduled command queue for sample-accurate timing
    // Commands with a 'time' field are queued here and applied at the correct
    // sample offset during process(), preventing up to 100ms of jitter from
    // the main-thread lookahead scheduler.
    this.scheduledCommands = [];

    // Per-channel effect isolation slots (max 4).
    // Each slot renders only channels in its channelMask to outputs[slotIndex+1].
    // Uses mute-and-re-render: save mute state → isolate → render → restore.
    this.isolationSlots = [null, null, null, null];

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
          // Clear bad-chip flag so the platform can be retried if recreated
          if (this._badChips) this._badChips.delete(data.platformType);
        }
        break;
      }

      case 'dispatch': {
        // If the command has a scheduled time, queue it for sample-accurate playback
        if (data.time !== undefined && data.time > currentTime) {
          this.scheduledCommands.push({
            time: data.time,
            platformType: data.platformType,
            cmd: data.cmd,
            chan: data.chan,
            val1: data.val1 || 0,
            val2: data.val2 || 0
          });
        } else {
          // No time or time is in the past — execute immediately
          const chip = this.getChip(data.platformType);
          if (chip && this.wasm) {
            this.wasm.cmd(chip.handle, data.cmd, data.chan, data.val1 || 0, data.val2 || 0);
          }
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

      case 'loadIns2':
        if (this.initialized && this.module && this.wasm?.loadIns2) {
          const insData = data.insData;
          if (insData && insData.length > 0) {
            const heapBuffer = this.getHeapBuffer();
            if (heapBuffer) {
              const dataPtr = this.module._malloc(insData.length);
              const heap = new Uint8Array(heapBuffer, dataPtr, insData.length);
              heap.set(insData);
              this.wasm.loadIns2(data.insIndex, dataPtr, insData.length);
              this.module._free(dataPtr);
              this.updateBufferViews(); // Heap may have grown
              console.log('[FurnaceDispatch Worklet] loadIns2 index:', data.insIndex, 'size:', insData.length);
            }
          }
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
          if (chip) {
            this.setInstrumentData('setSample', chip.handle, data.sampleIndex, data.sampleData);
            console.log('[FurnaceDispatch Worklet] setSample: index=', data.sampleIndex, 'size=', data.sampleData?.length, 'platform=', data.platformType);
          }
        } else {
          console.warn('[FurnaceDispatch Worklet] setSample SKIPPED: initialized=', this.initialized, 'module=', !!this.module);
        }
        break;

      case 'renderSamples': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.renderSamples(chip.handle);
          // renderSamples may grow WASM heap (sample format conversion) — refresh views
          this.updateBufferViews();
          console.log('[FurnaceDispatch Worklet] renderSamples called for platform', data.platformType, 'handle', chip.handle);
        } else {
          console.warn('[FurnaceDispatch Worklet] renderSamples SKIPPED: chip=', !!chip, 'wasm=', !!this.wasm, 'platform=', data.platformType);
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

      // Compatibility flags — send to ALL chips when no platformType specified
      case 'setCompatFlags': {
        if (this.wasm && data.flags) {
          const heapBuffer = this.getHeapBuffer();
          if (heapBuffer) {
            const flags = data.flags instanceof Uint8Array ? data.flags : new Uint8Array(data.flags);
            const dataPtr = this.module._malloc(flags.length);
            const heap = new Uint8Array(heapBuffer, dataPtr, flags.length);
            heap.set(flags);
            if (data.platformType !== undefined) {
              // Send to specific chip
              const chip = this.getChip(data.platformType);
              if (chip) this.wasm.setCompatFlags(chip.handle, dataPtr, flags.length);
            } else {
              // Send to ALL chips
              for (const chip of this.chips.values()) {
                this.wasm.setCompatFlags(chip.handle, dataPtr, flags.length);
              }
            }
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
        // Also update sequencer divider if active
        if (this.sequencerActive && this.wasm) {
          this.wasm.seqSetDivider(this.tickRate);
        }
        break;

      case 'setChipFlags': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm && data.flagsStr) {
          const heapBuffer = this.getHeapBuffer();
          if (heapBuffer) {
            // Manual UTF-8 encode (TextEncoder not available in AudioWorkletGlobalScope)
            const str = data.flagsStr;
            const encoded = [];
            for (let ci = 0; ci < str.length; ci++) {
              let code = str.charCodeAt(ci);
              if (code < 0x80) { encoded.push(code); }
              else if (code < 0x800) { encoded.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F)); }
              else { encoded.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F)); }
            }
            const dataPtr = this.module._malloc(encoded.length + 1);
            const heap = new Uint8Array(heapBuffer, dataPtr, encoded.length + 1);
            heap.set(encoded);
            heap[encoded.length] = 0; // null terminate
            this.wasm.setFlags(chip.handle, dataPtr, encoded.length);
            this.module._free(dataPtr);
          }
        }
        break;
      }

      case 'setTuning': {
        if (this.wasm && data.tuning !== undefined) {
          if (data.platformType !== undefined) {
            const chip = this.getChip(data.platformType);
            if (chip) this.wasm.setTuning(chip.handle, data.tuning);
          } else {
            // Apply to all chips (tuning is a song-level setting)
            for (const chip of this.chips.values()) {
              this.wasm.setTuning(chip.handle, data.tuning);
            }
          }
        }
        break;
      }

      case 'mute': {
        const chip = this.getChip(data.platformType);
        if (chip && this.wasm) {
          this.wasm.mute(chip.handle, data.chan, data.mute ? 1 : 0);
          // Also mute in sequencer to block NOTE_ON retriggering
          if (this.wasm.seqSetMute) {
            this.wasm.seqSetMute(data.chan, data.mute ? 1 : 0);
          }
        }
        break;
      }

      // --- Per-channel effect isolation ---
      case 'addIsolation': {
        const { slotIndex, channelMask } = data;
        if (slotIndex >= 0 && slotIndex < 4) {
          this.isolationSlots[slotIndex] = { channelMask };
          this.port.postMessage({ type: 'isolationReady', slotIndex, channelMask });
        }
        break;
      }

      case 'removeIsolation': {
        if (data.slotIndex >= 0 && data.slotIndex < 4) {
          this.isolationSlots[data.slotIndex] = null;
        }
        break;
      }

      case 'updateIsolationMask': {
        if (data.slotIndex >= 0 && data.slotIndex < 4 && this.isolationSlots[data.slotIndex]) {
          this.isolationSlots[data.slotIndex].channelMask = data.channelMask;
        }
        break;
      }

      case 'diagIsolation': {
        const activeSlots = this.isolationSlots
          .map((s, i) => s ? { slot: i, mask: '0x' + s.channelMask.toString(16) } : null)
          .filter(Boolean);
        this.port.postMessage({
          type: 'diagIsolation',
          slots: activeSlots,
          chipCount: this.chips.size,
          totalChannels: [...this.chips.values()].reduce((sum, c) => sum + c.numChannels, 0)
        });
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

      // ── Sequencer messages ──────────────────────────────
      case 'seqLoadSong': {
        if (!this.wasm) break;
        // Reset sequencer state before loading (avoids stale dispatch handle crashes)
        this.sequencerActive = false;
        this.wasm.seqLoadSong(data.numChannels, data.patLen, data.ordersLen);
        // Link sequencer to first chip's dispatch handle
        if (this.chips.size > 0) {
          const firstChip = this.chips.values().next().value;
          this.wasm.seqSetDispatchHandle(firstChip.handle);
        }
        this.wasm.seqSetSampleRate(sampleRate);
        this.wasm.seqSetDivider(this.tickRate);
        this.sequencerActive = true;
        this.port.postMessage({ type: 'seqLoaded', result: 0 });
        break;
      }
      case 'seqSetEffectCols': {
        if (this.wasm) this.wasm.seqSetEffectCols(data.ch, data.effectCols);
        break;
      }
      case 'seqPlay': {
        if (this.wasm) this.wasm.seqPlay(data.order || 0, data.row || 0);
        break;
      }
      case 'seqStop': {
        if (this.wasm && this.sequencerActive) this.wasm.seqStop();
        this.sequencerActive = false;
        break;
      }
      case 'enableCmdLog': {
        this._cmdLogEnabled = !!data.enable;
        if (this.wasm && this.wasm.cmdLogEnable) {
          this.wasm.cmdLogEnable(this._cmdLogEnabled ? 1 : 0);
        }
        break;
      }
      case 'seqSeek': {
        if (this.wasm) this.wasm.seqSeek(data.order, data.row);
        break;
      }
      case 'seqSetCell': {
        if (this.wasm) this.wasm.seqSetCell(data.ch, data.pat, data.row, data.col, data.val);
        break;
      }
      case 'seqSetOrder': {
        if (this.wasm) this.wasm.seqSetOrder(data.ch, data.pos, data.patIdx);
        break;
      }
      case 'seqSetSpeed': {
        if (this.wasm) this.wasm.seqSetSpeed(data.speed1, data.speed2);
        break;
      }
      case 'seqSetSpeedPattern': {
        if (this.wasm && this.module && data.values && data.values.length > 0) {
          const len = Math.min(data.values.length, 16);
          const ptr = this.module._malloc(len * 2); // uint16_t
          // Use getHeapBuffer() — HEAPU8 may be undefined after memory growth
          const heapBuf = this.getHeapBuffer();
          if (!heapBuf) break;
          const heap16 = new Uint16Array(heapBuf);
          for (let i = 0; i < len; i++) {
            heap16[(ptr >> 1) + i] = data.values[i];
          }
          this.wasm.seqSetSpeedPattern(ptr, len);
          this.module._free(ptr);
        }
        break;
      }
      case 'seqSetTempo': {
        if (this.wasm) this.wasm.seqSetTempo(data.virtualN || 150, data.virtualD || 150);
        break;
      }
      case 'seqSetCompatFlags': {
        if (this.wasm) this.wasm.seqSetCompatFlags(data.flags || 0, data.flagsExt || 0, data.pitchSlideSpeed || 4);
        break;
      }
      case 'seqSetGrooveEntry': {
        if (this.wasm && this.module && data.values && data.values.length > 0) {
          // Allocate temp buffer in WASM memory for the groove values
          const len = Math.min(data.len || data.values.length, 16);
          const ptr = this.module._malloc(len * 2); // uint16_t
          // Use getHeapBuffer() — HEAPU8 may be undefined after memory growth
          const heapBuf = this.getHeapBuffer();
          if (!heapBuf) { this.module._free(ptr); break; }
          const heap16 = new Uint16Array(heapBuf);
          for (let i = 0; i < len; i++) {
            heap16[(ptr >> 1) + i] = data.values[i] || 6;
          }
          this.wasm.seqSetGrooveEntry(data.index || 0, ptr, len);
          this.module._free(ptr);
        }
        break;
      }
      case 'seqSetChannelChip': {
        if (this.wasm) {
          this.wasm.seqSetChannelChip(data.channel || 0, data.chipId || 0, data.subIdx || 0);
          // Set per-channel dispatch handle for multi-chip routing
          if (data.handle && this.wasm.seqSetChannelDispatch) {
            this.wasm.seqSetChannelDispatch(data.channel || 0, data.handle);
          }
        }
        break;
      }
      case 'seqSetRepeatPattern': {
        if (this.wasm) this.wasm.seqSetRepeatPattern(data.repeat ? 1 : 0);
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
      // Capture printf output from WASM and forward to main thread
      const self = this;
      config.print = (text) => {
        self.port.postMessage({ type: 'debug', msg: `[WASM] ${text}` });
      };
      config.printErr = (text) => {
        self.port.postMessage({ type: 'debug', msg: `[WASM ERR] ${text}` });
      };

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
        setFlags: this.module._furnace_dispatch_set_flags,
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
        loadIns2: this.module._furnace_dispatch_load_ins2,
        setSample: this.module._furnace_dispatch_set_sample,
        renderSamples: this.module._furnace_dispatch_render_samples,
        // Macro control functions
        setMacrosEnabled: this.module._furnace_dispatch_set_macros_enabled,
        clearMacros: this.module._furnace_dispatch_clear_macros,
        releaseMacros: this.module._furnace_dispatch_release_macros,
        // Compatibility flags
        setCompatFlags: this.module._furnace_dispatch_set_compat_flags,
        resetCompatFlags: this.module._furnace_dispatch_reset_compat_flags,
        // Sequencer API
        seqLoadSong: this.module._furnace_seq_load_song,
        seqSetCell: this.module._furnace_seq_set_cell,
        seqSetOrder: this.module._furnace_seq_set_order,
        seqSetEffectCols: this.module._furnace_seq_set_effect_cols,
        seqPlay: this.module._furnace_seq_play,
        seqStop: this.module._furnace_seq_stop,
        seqSeek: this.module._furnace_seq_seek,
        seqSetSpeed: this.module._furnace_seq_set_speed,
        seqSetSpeedPattern: this.module._furnace_seq_set_speed_pattern,
        seqSetTempo: this.module._furnace_seq_set_tempo,
        seqSetGroove: this.module._furnace_seq_set_groove,
        seqSetGrooveEntry: this.module._furnace_seq_set_groove_entry,
        seqSetRepeatPattern: this.module._furnace_seq_set_repeat_pattern,
        seqSetCompatFlags: this.module._furnace_seq_set_compat_flags,
        seqSetChannelChip: this.module._furnace_seq_set_channel_chip,
        seqSetChannelDispatch: this.module._furnace_seq_set_channel_dispatch,
        seqSetPatLen: this.module._furnace_seq_set_pat_len,
        seqSetDispatchHandle: this.module._furnace_seq_set_dispatch_handle,
        seqSetSampleRate: this.module._furnace_seq_set_sample_rate,
        seqSetDivider: this.module._furnace_seq_set_divider,
        seqGetDivider: this.module._furnace_seq_get_divider,
        seqSetMute: this.module._furnace_seq_set_mute,
        seqTick: this.module._furnace_seq_tick,
        seqGetOrder: this.module._furnace_seq_get_order,
        seqGetRow: this.module._furnace_seq_get_row,
        seqIsPlaying: this.module._furnace_seq_is_playing,
        // Command log for automation capture
        cmdLogEnable: this.module._furnace_cmd_log_enable,
        cmdLogCount: this.module._furnace_cmd_log_count,
        cmdLogGet: this.module._furnace_cmd_log_get,
      };
      this._cmdLogEnabled = false;
      this._cmdLogPollCounter = 0;

      // Allocate audio output buffers in WASM memory (shared scratch for render)
      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      // Allocate oscilloscope readback buffer (int16 = 2 bytes)
      this.oscPtrOut = this.module._malloc(this.oscSampleCount * 2);

      this.samplesPerTick = (sr || sampleRate) / this.tickRate;
      this.updateBufferViews();

      this.initialized = true;
      this.wasmCrashed = false;
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
    if (this.wasmCrashed) {
      console.warn('[FurnaceDispatch Worklet] Ignoring createChip — WASM module crashed');
      this.port.postMessage({ type: 'error', message: 'Cannot create chip: WASM module crashed. Reload the page.' });
      return;
    }
    // If same platform chip already exists, reuse it (Furnace pattern: disCont[] reuse)
    if (this.chips.has(platformType)) {
      const existing = this.chips.get(platformType);
      // Reuse existing chip — no log (can happen 4-5x per song load)
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
    // Heap may have grown during malloc/WASM call — refresh buffer views
    this.updateBufferViews();

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

    // Detect heap growth: buffer reference changes, OR existing views are detached
    const needsUpdate = this.lastHeapBuffer !== heapBuffer
      || !this.outputBufferL
      || (this.outputBufferL.buffer && this.outputBufferL.buffer.byteLength === 0);

    if (needsUpdate) {
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
    this.scheduledCommands = [];
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || this.chips.size === 0 || !this.wasm || this.wasmCrashed) {
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

    // Zero output before mixing — outside try-block so a per-chip crash
    // doesn't silence all other chips (they still mix into a clean buffer).
    outputL.fill(0);
    outputR.fill(0);

    try {
      // --- Process scheduled commands at sample-accurate positions ---
      // Sort by time so earliest commands execute first
      if (this.scheduledCommands.length > 0) {
        this.scheduledCommands.sort((a, b) => a.time - b.time);
        const blockEnd = currentTime + numSamples / sampleRate;
        // Execute all commands scheduled for this audio block (or past-due)
        while (this.scheduledCommands.length > 0 && this.scheduledCommands[0].time <= blockEnd) {
          const sc = this.scheduledCommands.shift();
          const chip = this.getChip(sc.platformType);
          if (chip && this.wasm) {
            this.wasm.cmd(chip.handle, sc.cmd, sc.chan, sc.val1, sc.val2);
          }
        }
      }

      // Tick all chips in lock-step, then render the full block.
      // Ticking first ensures macro/envelope state is current before rendering.
      // (Furnace nextBuf pattern: tick → render samplesPerTick, but we tick per
      // process() block for stability — the 128-sample granularity is close enough
      // for most use cases without risking audio thread overload.)
      this.tickAccumulator += numSamples;
      while (this.tickAccumulator >= this.samplesPerTick) {
        if (this.sequencerActive && this.wasm.seqIsPlaying && this.wasm.seqIsPlaying()) {
          try {
            const pos = this.wasm.seqTick();
            this._lastSeqOrder = (pos >> 16) & 0xFFFF;
            this._lastSeqRow = pos & 0xFFFF;
            if (this.wasm.seqGetDivider) {
              const newDiv = this.wasm.seqGetDivider();
              if (newDiv > 0 && newDiv !== this.tickRate) {
                this.tickRate = newDiv;
                this.samplesPerTick = sampleRate / this.tickRate;
              }
            }
          } catch (e) {
            console.error('[FurnaceDispatch] seqTick WASM trap:', e);
            this.sequencerActive = false;
            this.wasmCrashed = true;
            for (const chip of this.chips.values()) {
              try { this.wasm.destroy(chip.handle); } catch { /* already broken */ }
            }
            this.chips.clear();
            this.port.postMessage({ type: 'error', message: 'WASM sequencer crashed: ' + (e.message || e) });
          }
        }
        for (const chip of this.chips.values()) {
          try { this.wasm.tick(chip.handle); } catch { /* skip bad chip */ }
        }
        this.tickAccumulator -= this.samplesPerTick;
      }

      // Drain command log periodically and post to main thread
      if (this._cmdLogEnabled && this.wasm.cmdLogCount) {
        this._cmdLogPollCounter++;
        if (this._cmdLogPollCounter >= 10) {
          this._cmdLogPollCounter = 0;
          const count = this.wasm.cmdLogCount();
          if (count > 0) {
            const ptr = this.wasm.cmdLogGet();
            const heapBuf = this.getHeapBuffer();
            if (heapBuf) {
              const heap32 = new Int32Array(heapBuf);
              const entries = [];
              for (let i = 0; i < count; i++) {
                const base = ptr / 4 + i * 6;
                entries.push({
                  tick: heap32[base],
                  cmd: heap32[base + 1],
                  channel: heap32[base + 2],
                  value1: heap32[base + 3],
                  value2: heap32[base + 4],
                });
              }
              this.port.postMessage({ type: 'cmdLog', entries });
            }
            this.module._free(ptr);
          }
        }
      }

      // Check if any isolation slots are active
      const hasIsolation = this.isolationSlots.some(s => s !== null);

      // Build a bitmask of all channels currently isolated (for muting in main output)
      let isolatedChannelBits = 0;
      if (hasIsolation) {
        for (let s = 0; s < 4; s++) {
          if (this.isolationSlots[s]) isolatedChannelBits |= this.isolationSlots[s].channelMask;
        }
      }

      // Compute per-chip channel offsets (globalCh = chipOffset + localCh)
      const chipOffsets = new Map();
      let channelOffset = 0;
      for (const [pType, chip] of this.chips) {
        chipOffsets.set(pType, channelOffset);
        channelOffset += chip.numChannels;
      }

      // Render each chip and mix into main output with postAmp scaling.
      // Channels that are isolated are muted in the main output to avoid double-summation.
      for (const chip of this.chips.values()) {
        const chipOff = chipOffsets.get(chip.platformType) || 0;
        try {
          // If isolation is active, mute isolated channels for main output render
          if (isolatedChannelBits) {
            for (let ch = 0; ch < chip.numChannels; ch++) {
              if (isolatedChannelBits & (1 << (chipOff + ch))) {
                this.wasm.mute(chip.handle, ch, 1);
              }
            }
          }

          this.wasm.render(chip.handle, this.outputPtrL, this.outputPtrR, numSamples);
          this.updateBufferViews();
          const amp = POST_AMP[chip.platformType] || 1.0;
          for (let i = 0; i < numSamples; i++) {
            outputL[i] += this.outputBufferL[i] * amp;
            outputR[i] += this.outputBufferR[i] * amp;
          }

          // Restore mutes after main render
          if (isolatedChannelBits) {
            for (let ch = 0; ch < chip.numChannels; ch++) {
              if (isolatedChannelBits & (1 << (chipOff + ch))) {
                this.wasm.mute(chip.handle, ch, 0);
              }
            }
          }
        } catch (chipErr) {
          if (!this._badChips) this._badChips = new Set();
          if (!this._badChips.has(chip.platformType)) {
            this._badChips.add(chip.platformType);
            const msg = `WASM render error for platform ${chip.platformType}: ${chipErr.message || chipErr}`;
            this.port.postMessage({ type: 'error', message: msg });
          }
        }
      }

      // --- Render isolation slots (per-channel effect routing) ---
      // For each active slot, mute all channels EXCEPT the slot's channelMask,
      // re-render each chip, and mix to the slot's output buffer.
      if (hasIsolation) {
        for (let s = 0; s < 4; s++) {
          const slot = this.isolationSlots[s];
          if (!slot) continue;

          const slotOutput = outputs[s + 1];
          if (!slotOutput || slotOutput.length === 0) continue;

          const slotL = slotOutput[0];
          const slotR = slotOutput[1] || slotOutput[0];
          slotL.fill(0);
          slotR.fill(0);

          for (const chip of this.chips.values()) {
            const chipOff = chipOffsets.get(chip.platformType) || 0;
            try {
              // Mute all channels except those in this slot's mask
              for (let ch = 0; ch < chip.numChannels; ch++) {
                const shouldPlay = (slot.channelMask & (1 << (chipOff + ch))) !== 0;
                this.wasm.mute(chip.handle, ch, shouldPlay ? 0 : 1);
              }

              this.wasm.render(chip.handle, this.outputPtrL, this.outputPtrR, numSamples);
              this.updateBufferViews();
              const amp = POST_AMP[chip.platformType] || 1.0;
              for (let i = 0; i < numSamples; i++) {
                slotL[i] += this.outputBufferL[i] * amp;
                slotR[i] += this.outputBufferR[i] * amp;
              }

              // Restore all channels to unmuted after isolation render
              for (let ch = 0; ch < chip.numChannels; ch++) {
                this.wasm.mute(chip.handle, ch, 0);
              }
            } catch (e) {
              // Isolation render failure is non-fatal — main output still works
            }
          }
        }
      }


    } catch (e) {
      if (!this._errorReported) {
        this._errorReported = true;
        const msg = `WASM error in process (chips=${this.chips.size}): ${e.message || e}`;
        this.port.postMessage({ type: 'error', message: msg });
        console.error('[FurnaceDispatch Worklet]', msg);
      }
    }

    // Non-audio-critical: oscilloscope + position reporting (isolated from render)
    try {
      // Periodically send oscilloscope data (~30fps)
      this.oscSendCounter++;
      if (this.oscSendCounter >= this.oscSendInterval) {
        this.oscSendCounter = 0;
        this.readOscilloscopeData();
      }

      // Sequencer position callback (~60fps)
      if (this.sequencerActive && this.wasm.seqIsPlaying && this.wasm.seqIsPlaying()) {
        this._posFrameCount++;
        if (this._posFrameCount >= 12) {
          this._posFrameCount = 0;
          this.port.postMessage({
            type: 'seqPosition',
            order: this._lastSeqOrder,
            row: this._lastSeqRow,
            audioTime: currentTime
          });
        }
      }
    } catch (e) {
      // Non-critical — don't kill audio over oscilloscope/position errors
      if (!this._nonAudioErrLogged) {
        this._nonAudioErrLogged = true;
        console.warn('[FurnaceDispatch Worklet] Non-audio error:', e.message || e);
      }
    }

    return true;
  }
}

registerProcessor('furnace-dispatch-processor', FurnaceDispatchProcessor);
