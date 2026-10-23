/**
 * FluidSynth.worklet.js - AudioWorklet processor for FluidSynth SF2 playback
 *
 * Architecture:
 *   - MODULARIZE Emscripten build → createFluidSynth() factory
 *   - SF2 data sent via postMessage, written to Emscripten MEMFS
 *   - fluidsynth_process() pulls interleaved stereo float samples
 *
 * Messages from main thread:
 *   init       { sampleRate, wasmBinary, jsCode, multi?, midiChannels?, audioGroups? }
 *              multi: true creates the synth with audioGroups dry groups; the node
 *              must have audioGroups+1 stereo outputs (i < G dry, G shared fx return)
 *   getChannelBank { channel }  -> { type: 'channelBank', channel, bank } (-1 = no preset)
 *   setChannelType { channel, channelType }   0 melodic, 1 drum ('type' is the message tag)
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

import { TimedEventQueue } from '../shared/timedEventQueue.js';

const RENDER_FRAMES = 128;

class FluidSynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Notes sent ahead with a `time` wait here for their frame (see shared/timedEventQueue.js)
    this.noteEvents = new TimedEventQueue();
    this.module = null;
    this.initialized = false;
    this._sampleRate = 48000;
    this._leftPtr = 0;
    this._rightPtr = 0;
    this._wasmBinary = null;
    this._wasmCrashed = false;
    this._sf2Loaded = false;
    this._multi = false;
    this._groups = 1;
    this._midiChannels = 16;
    this._outPtrsPtr = 0;
    this._groupPtrs = [];
    this._fxLPtr = 0;
    this._fxRPtr = 0;

    this.port.onmessage = (event) => {
      const { type } = event.data;
      if (type === 'init') {
        this._initWasm(event.data.sampleRate, event.data.wasmBinary, event.data.jsCode, event.data);
      } else {
        this._handleMessage(event.data);
      }
    };
  }

  async _initWasm(sr, wasmBinary, jsCode, opts) {
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
      this._multi = !!(opts && opts.multi);
      if (this._multi) {
        const G = opts.audioGroups || 64;
        this._groups = G;
        this._midiChannels = opts.midiChannels || 64;
        m._fluidsynth_create_ex(sr, this._midiChannels, G);
        // 2*G dry buffers (L,R per group) + one fx pair, plus the pointer table
        this._outPtrsPtr = m._malloc(2 * G * 4);
        this._groupPtrs = [];
        for (let i = 0; i < 2 * G; i++) {
          const p = m._malloc(RENDER_FRAMES * 4);
          this._groupPtrs.push(p);
        }
        this._fxLPtr = m._malloc(RENDER_FRAMES * 4);
        this._fxRPtr = m._malloc(RENDER_FRAMES * 4);
        // Fill the table after all mallocs (memory growth detaches earlier views)
        const table = new Uint32Array(m.HEAPF32.buffer, this._outPtrsPtr, 2 * G);
        for (let i = 0; i < 2 * G; i++) table[i] = this._groupPtrs[i];
      } else {
        m._fluidsynth_create(sr);
        // Allocate left/right render buffers
        this._leftPtr = m._malloc(RENDER_FRAMES * 4);
        this._rightPtr = m._malloc(RENDER_FRAMES * 4);
      }

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
      case 'noteOff':
        if (this.noteEvents.push(data, currentTime)) this._applyNoteEvent(data);
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

      case 'setChannelType':
        m._fluidsynth_set_channel_type(data.channel || 0, data.channelType ? 1 : 0);
        break;

      case 'getChannelBank':
        this.port.postMessage({ type: 'channelBank', channel: data.channel || 0, bank: m._fluidsynth_get_channel_bank(data.channel || 0) });
        break;

      case 'allNotesOff': {
        // Cancels this channel's notes scheduled at or after it: on Stop the replayer has already sent the coming rows
        const ch = data.channel != null && data.channel >= 0 ? data.channel : -1;
        this.noteEvents.cancelFrom(data.time ?? currentTime, (e) => ch < 0 || (e.channel || 0) === ch);
        if (this.noteEvents.push(data, currentTime)) this._applyNoteEvent(data);
        break;
      }

      case 'allSoundsOff':
        if (data.channel != null && data.channel >= 0) {
          m._fluidsynth_all_sounds_off(data.channel);
        } else {
          for (let ch = 0; ch < this._midiChannels; ch++) m._fluidsynth_all_sounds_off(ch);
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

  _applyNoteEvent(ev) {
    const m = this.module;
    switch (ev.type) {
      case 'noteOn': m._fluidsynth_note_on(ev.channel || 0, ev.key != null ? ev.key : ev.note, ev.velocity); break;
      case 'noteOff': m._fluidsynth_note_off(ev.channel || 0, ev.key != null ? ev.key : ev.note); break;
      case 'allNotesOff':
        if (ev.channel != null && ev.channel >= 0) {
          m._fluidsynth_all_notes_off(ev.channel);
        } else {
          for (let ch = 0; ch < this._midiChannels; ch++) m._fluidsynth_all_notes_off(ch);
        }
        break;
    }
  }

  /**
   * Render the block in segments so a queued note event keys the engine at its own frame. The render
   * export writes to the pointers it is given, so a segment is the same buffers moved on by `done` frames.
   */
  _renderSegments(frames, renderSegment) {
    let done = 0;
    while (done < frames) {
      const now = currentTime + done / sampleRate;
      this.noteEvents.drain(now, (ev) => this._applyNoteEvent(ev));
      const off = this.noteEvents.nextOffset(now, frames - done, sampleRate);
      const len = off > 0 ? off : frames - done;
      renderSegment(done, len);
      done += len;
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

  _processMulti(outputs) {
    const first = outputs[0];
    if (!first || first.length === 0) return true;
    const frames = first[0].length;
    try {
      const m = this.module;
      const G = this._groups;
      // The pointer table is rewritten per segment (after any memory growth the view is fresh)
      this._renderSegments(frames, (done, len) => {
        const table = new Uint32Array(m.HEAPF32.buffer, this._outPtrsPtr, 2 * G);
        for (let i = 0; i < 2 * G; i++) table[i] = this._groupPtrs[i] + done * 4;
        m._fluidsynth_process_multi(this._outPtrsPtr, this._fxLPtr + done * 4, this._fxRPtr + done * 4, len);
      });
      const buf = m.HEAPF32.buffer;
      for (let g = 0; g < G; g++) {
        const out = outputs[g];
        if (!out || out.length === 0) continue;
        out[0].set(new Float32Array(buf, this._groupPtrs[2 * g], frames));
        if (out.length > 1) out[1].set(new Float32Array(buf, this._groupPtrs[2 * g + 1], frames));
      }
      const fx = outputs[G];
      if (fx && fx.length > 0) {
        fx[0].set(new Float32Array(buf, this._fxLPtr, frames));
        if (fx.length > 1) fx[1].set(new Float32Array(buf, this._fxRPtr, frames));
      }
    } catch (err) {
      if (!this._wasmCrashed) {
        console.error('[FluidSynth Worklet] Process error:', err);
        this._wasmCrashed = true;
        this.port.postMessage({ type: 'error', message: 'WASM crash: ' + err.message });
      }
    }
    return true;
  }

  process(_inputs, outputs, _parameters) {
    if (!this.initialized || !this.module || this._wasmCrashed) return true;

    if (this._multi) return this._processMulti(outputs);

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output.length > 1 ? output[1] : null;
    const frames = left.length;

    try {
      const m = this.module;
      this._renderSegments(frames, (done, len) => {
        m._fluidsynth_process(this._leftPtr + done * 4, this._rightPtr + done * 4, len);
      });

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
