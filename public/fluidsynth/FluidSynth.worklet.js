/**
 * FluidSynth.worklet.js - AudioWorklet processor for FluidSynth SF2 playback
 *
 * Architecture:
 *   - MODULARIZE Emscripten build → createFluidSynth() factory
 *   - SF2 data sent via postMessage, written to Emscripten MEMFS
 *   - fluidsynth_process() pulls interleaved stereo float samples
 *
 * Messages from main thread:
 *   init       { sampleRate, wasmBinary, jsCode }
 *   loadSF2    { data: Uint8Array, filename: string }
 *   noteOn     { channel, key, velocity }
 *   noteOff    { channel, key }
 *   cc         { channel, ctrl, val }
 *   programChange { channel, program }
 *   bankSelect { channel, bank }
 *   pitchBend  { channel, val }
 *   pitchBendRange { channel, val }
 *   channelPressure { channel, val }
 *   allNotesOff { channel }
 *   allSoundsOff { channel }
 *   setParam   { id, value }
 *   getParam   { id }
 *   getPresetName { bank, program }
 *   destroy    {}
 */

const RENDER_FRAMES = 128;

class FluidSynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.initialized = false;
    this._sampleRate = 48000;
    this._leftPtr = 0;
    this._rightPtr = 0;
    this._wasmBinary = null;
    this._wasmCrashed = false;
    this._sf2Loaded = false;

    this.port.onmessage = (event) => {
      const { type } = event.data;
      if (type === 'init') {
        this._initWasm(event.data.sampleRate, event.data.wasmBinary, event.data.jsCode);
      } else {
        this._handleMessage(event.data);
      }
    };
  }

  async _initWasm(sr, wasmBinary, jsCode) {
    try {
      this._sampleRate = sr;

      // Polyfill for worklet context
      if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
          createElement: () => ({
            setAttribute: () => {}, appendChild: () => {}, style: {},
            addEventListener: () => {},
          }),
          head: { appendChild: () => {} },
          body: { appendChild: () => {} },
          createTextNode: () => ({}),
          getElementById: () => null,
          querySelector: () => null,
        };
      }
      if (typeof globalThis.location === 'undefined') {
        globalThis.location = { href: '.', pathname: '/' };
      }
      if (typeof globalThis.performance === 'undefined') {
        globalThis.performance = { now: () => Date.now() };
      }

      // Load the Emscripten JS via Function constructor
      if (jsCode && !globalThis.createFluidSynth) {
        const wrappedCode = jsCode + '\nreturn createFluidSynth;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createFluidSynth = result;
        }
      }

      if (!globalThis.createFluidSynth) {
        throw new Error('createFluidSynth factory not available');
      }

      let wasmBuffer;
      if (wasmBinary instanceof Uint8Array) {
        wasmBuffer = wasmBinary.buffer.byteLength === wasmBinary.length
          ? wasmBinary.buffer
          : wasmBinary.slice().buffer;
      } else {
        wasmBuffer = wasmBinary;
      }

      this.module = await globalThis.createFluidSynth({
        wasmBinary: wasmBuffer,
        // Suppress noisy FluidSynth stderr (stub warnings, ROM sample warnings, etc.)
        print: () => {},
        printErr: () => {},
      });
      const m = this.module;

      // Create the synth engine
      m._fluidsynth_create(sr);

      // Allocate left/right render buffers
      this._leftPtr = m._malloc(RENDER_FRAMES * 4);
      this._rightPtr = m._malloc(RENDER_FRAMES * 4);

      this._wasmBinary = wasmBuffer;
      this._wasmCrashed = false;
      this.initialized = true;

      console.log('[FluidSynth Worklet] Initialized, sampleRate:', sr);
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[FluidSynth Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  _handleMessage(data) {
    if (!this.initialized || !this.module) {
      if (data.type === 'loadSF2') {
        // Queue SF2 load until initialized
        const checkInit = () => {
          if (this.initialized && this.module) {
            this._loadSF2(data.data, data.filename);
          } else {
            setTimeout(checkInit, 50);
          }
        };
        checkInit();
      }
      return;
    }

    const m = this.module;

    switch (data.type) {
      case 'loadSF2':
        this._loadSF2(data.data, data.filename);
        break;

      case 'noteOn':
        m._fluidsynth_note_on(data.channel || 0, data.key != null ? data.key : data.note, data.velocity);
        break;

      case 'noteOff':
        m._fluidsynth_note_off(data.channel || 0, data.key != null ? data.key : data.note);
        break;

      case 'cc':
        m._fluidsynth_cc(data.channel || 0, data.ctrl, data.val);
        break;

      case 'programChange':
        m._fluidsynth_program_change(data.channel || 0, data.program);
        break;

      case 'bankSelect':
        m._fluidsynth_bank_select(data.channel || 0, data.bank);
        break;

      case 'pitchBend':
        m._fluidsynth_pitch_bend(data.channel || 0, data.val);
        break;

      case 'pitchBendRange':
        m._fluidsynth_pitch_wheel_sens(data.channel || 0, data.val);
        break;

      case 'channelPressure':
        m._fluidsynth_channel_pressure(data.channel || 0, data.val);
        break;

      case 'allNotesOff':
        if (data.channel != null && data.channel >= 0) {
          m._fluidsynth_all_notes_off(data.channel);
        } else {
          for (let ch = 0; ch < 16; ch++) m._fluidsynth_all_notes_off(ch);
        }
        break;

      case 'allSoundsOff':
        if (data.channel != null && data.channel >= 0) {
          m._fluidsynth_all_sounds_off(data.channel);
        } else {
          for (let ch = 0; ch < 16; ch++) m._fluidsynth_all_sounds_off(ch);
        }
        break;

      case 'setParam':
        m._fluidsynth_set_param(data.id != null ? data.id : data.index, data.value);
        break;

      case 'getParam': {
        const paramId = data.id != null ? data.id : data.index;
        const val = m._fluidsynth_get_param(paramId);
        this.port.postMessage({ type: 'paramValue', id: paramId, value: val });
        break;
      }

      case 'getPresetName': {
        const namePtr = m._fluidsynth_get_preset_name(data.bank || 0, data.program || 0);
        const name = m.UTF8ToString(namePtr);
        this.port.postMessage({ type: 'presetName', bank: data.bank, program: data.program, name });
        break;
      }

      case 'destroy':
      case 'dispose':
        m._fluidsynth_destroy();
        this.initialized = false;
        this._sf2Loaded = false;
        break;

      default:
        break;
    }
  }

  _loadSF2(sf2Data, filename) {
    const m = this.module;
    if (!m) return;

    try {
      const fname = filename || 'soundfont.sf2';
      const memPath = '/' + fname;

      // Write SF2 data to Emscripten MEMFS
      const u8 = (sf2Data instanceof Uint8Array) ? sf2Data : new Uint8Array(sf2Data);
      m.FS.writeFile(memPath, u8);

      // Allocate C string for the path and load
      // TextEncoder not available in AudioWorklet — manual ASCII encode
      const pathStr = memPath + '\0';
      const pathBytes = new Uint8Array(pathStr.length);
      for (let i = 0; i < pathStr.length; i++) pathBytes[i] = pathStr.charCodeAt(i);
      const pathPtr = m._malloc(pathBytes.length);
      const heap = m.HEAPU8 || new Uint8Array(m.wasmMemory?.buffer || m.HEAPF32?.buffer);
      new Uint8Array(heap.buffer, pathPtr, pathBytes.length).set(pathBytes);
      const sfId = m._fluidsynth_load_sf2(pathPtr);
      m._free(pathPtr);

      if (sfId >= 0) {
        this._sf2Loaded = true;
        console.log('[FluidSynth Worklet] SF2 loaded:', fname, 'id:', sfId, 'size:', u8.byteLength);
        this.port.postMessage({ type: 'sf2Loaded', id: sfId, filename: fname });
      } else {
        console.error('[FluidSynth Worklet] SF2 load failed:', sfId);
        this.port.postMessage({ type: 'error', message: 'SF2 load failed: ' + sfId });
      }

      // Clean up the MEMFS file to free memory
      try { m.FS.unlink(memPath); } catch (_) {}
    } catch (err) {
      console.error('[FluidSynth Worklet] SF2 load error:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  process(_inputs, outputs, _parameters) {
    if (!this.initialized || !this.module || this._wasmCrashed) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output.length > 1 ? output[1] : null;
    const frames = left.length;

    try {
      const m = this.module;
      m._fluidsynth_process(this._leftPtr, this._rightPtr, frames);

      // Copy from WASM heap to output buffers
      const leftArr = new Float32Array(m.HEAPF32.buffer, this._leftPtr, frames);
      const rightArr = new Float32Array(m.HEAPF32.buffer, this._rightPtr, frames);

      left.set(leftArr);
      if (right) right.set(rightArr);
    } catch (err) {
      if (!this._wasmCrashed) {
        console.error('[FluidSynth Worklet] Process error:', err);
        this._wasmCrashed = true;
        this.port.postMessage({ type: 'error', message: 'WASM crash: ' + err.message });
      }
    }

    return true;
  }
}

registerProcessor('fluidsynth-processor', FluidSynthProcessor);
