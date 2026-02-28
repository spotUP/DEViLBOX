/**
 * SunVox.worklet.js - AudioWorklet processor for SunVox WASM engine
 *
 * Architecture:
 *   - Multiple simultaneous SunVox handles (created via 'create' message)
 *   - Each handle is a standalone sunvox_wasm_create() instance
 *   - Messages from main thread: create, destroy, loadSong, saveSong,
 *     loadSynth, saveSynth, getControls, getModules, noteOn, noteOff,
 *     setControl, play, stop
 *   - Audio rendering: sunvox_wasm_render() per-handle, mixed into output
 *
 * Models the SoundMon + Hively worklet patterns for init and player management.
 */

const MAX_FRAMES = 128;

class SunVoxProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.initialized = false;
    // Per-instance scratch buffers — allocated after WASM loads, freed on dispose.
    this.renderBufL = 0;
    this.renderBufR = 0;

    // Per-handle render state. Keyed by handle (integer).
    // Value: { active: true } — all handles share the static render bufs.
    this.handles = {};

    // Pending message queue — drained at the start of each process() call.
    // Using a queue lets us safely handle messages that arrive between process() calls.
    this.messageQueue = [];

    this.port.onmessage = (event) => {
      if (event.data.type === 'init') {
        // Handle init directly — initWasm() is async and posts 'ready' when done.
        // It must NOT go through the queue because process() only runs when the
        // worklet node is connected to an active audio graph. During pre-read
        // extraction the engine exists before any SunVoxSynth, so process() never
        // fires and a queued init would hang forever.
        this.initWasm(event.data.sampleRate, event.data.wasmBinary, event.data.jsCode);
      } else {
        // All other messages are enqueued and drained at the start of process().
        this.messageQueue.push(event.data);
      }
    };
  }

  /**
   * Drain and execute all queued messages from the main thread.
   * Called at the start of process() so messages are applied before rendering.
   */
  drainQueue() {
    while (this.messageQueue.length > 0) {
      const data = this.messageQueue.shift();
      this.handleMessage(data);
    }
  }

  handleMessage(data) {
    const m = this.wasm;
    // Portable ASCII→pointer helper.
    // All paths we pass are pure ASCII (/tmp/input.sunvox etc.) so charCodeAt is correct.
    // Avoids relying on any Emscripten helper (allocateUTF8/stringToNewUTF8/lengthBytesUTF8
    // are variously absent depending on build version; TextEncoder is absent in worklet scope).
    const strToPtr = (s) => {
      const ptr = m._malloc(s.length + 1);
      for (let i = 0; i < s.length; i++) m.HEAPU8[ptr + i] = s.charCodeAt(i);
      m.HEAPU8[ptr + s.length] = 0;
      return ptr;
    };

    switch (data.type) {
      // ── Lifecycle ──────────────────────────────────────────────────────────

      case 'create': {
        if (!m) break;
        const handle = m._sunvox_wasm_create(data.sampleRate);
        if (handle >= 0) {
          this.handles[handle] = { active: true };
          this.port.postMessage({ type: 'handle', handle });
        } else {
          this.port.postMessage({ type: 'error', message: 'sunvox_wasm_create failed' });
        }
        break;
      }

      case 'destroy': {
        if (!m) break;
        const h = data.handle;
        if (this.handles[h]) {
          m._sunvox_wasm_destroy(h);
          delete this.handles[h];
        }
        break;
      }

      case 'dispose':
        if (m) {
          for (const h of Object.keys(this.handles)) {
            m._sunvox_wasm_destroy(parseInt(h));
          }
          this.handles = {};
          if (this.renderBufL) { m._free(this.renderBufL); this.renderBufL = 0; }
          if (this.renderBufR) { m._free(this.renderBufR); this.renderBufR = 0; }
        }
        this.initialized = false;
        break;

      // ── Song I/O ───────────────────────────────────────────────────────────

      case 'loadSong': {
        if (!m) break;
        const buf = new Uint8Array(data.buffer);
        try {
          m.FS.writeFile('/tmp/input.sunvox', buf);
          const pathPtr = strToPtr('/tmp/input.sunvox');
          m._sunvox_wasm_load_song(data.handle, pathPtr);
          m._free(pathPtr);
          m.FS.unlink('/tmp/input.sunvox');
          this.port.postMessage({ type: 'songLoaded', handle: data.handle });
        } catch (err) {
          this.port.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      case 'saveSong': {
        if (!m) break;
        try {
          const pathPtr = strToPtr('/tmp/output.sunvox');
          m._sunvox_wasm_save_song(data.handle, pathPtr);
          m._free(pathPtr);
          const saved = m.FS.readFile('/tmp/output.sunvox');
          m.FS.unlink('/tmp/output.sunvox');
          // Transfer the underlying ArrayBuffer for zero-copy
          const outBuf = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength);
          this.port.postMessage({ type: 'songSaved', handle: data.handle, buffer: outBuf }, [outBuf]);
        } catch (err) {
          this.port.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      // ── Synth I/O ──────────────────────────────────────────────────────────

      case 'loadSynth': {
        if (!m) break;
        const buf = new Uint8Array(data.buffer);
        try {
          m.FS.writeFile('/tmp/input.sunsynth', buf);
          const pathPtr = strToPtr('/tmp/input.sunsynth');
          const moduleId = m._sunvox_wasm_load_synth(data.handle, pathPtr);
          m._free(pathPtr);
          m.FS.unlink('/tmp/input.sunsynth');
          this.port.postMessage({ type: 'synthLoaded', handle: data.handle, moduleId });
        } catch (err) {
          this.port.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      case 'saveSynth': {
        if (!m) break;
        try {
          const pathPtr = strToPtr('/tmp/output.sunsynth');
          m._sunvox_wasm_save_synth(data.handle, data.moduleId, pathPtr);
          m._free(pathPtr);
          const saved = m.FS.readFile('/tmp/output.sunsynth');
          m.FS.unlink('/tmp/output.sunsynth');
          const outBuf = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength);
          this.port.postMessage(
            { type: 'synthSaved', handle: data.handle, moduleId: data.moduleId, buffer: outBuf },
            [outBuf],
          );
        } catch (err) {
          this.port.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      // ── Module/Control introspection ───────────────────────────────────────

      case 'getModules': {
        if (!m) break;
        const count = m._sunvox_wasm_get_module_count(data.handle);
        const outPtr = m._malloc(256);
        const modules = [];
        for (let i = 0; i < count; i++) {
          m._sunvox_wasm_get_module_name(data.handle, i, outPtr, 256);
          modules.push({ id: i, name: m.UTF8ToString(outPtr) });
        }
        m._free(outPtr);
        this.port.postMessage({ type: 'modules', handle: data.handle, modules });
        break;
      }

      case 'getControls': {
        if (!m) break;
        const ctlCount = m._sunvox_wasm_get_control_count(data.handle, data.moduleId);
        const outPtr = m._malloc(256);
        const controls = [];
        for (let i = 0; i < ctlCount; i++) {
          m._sunvox_wasm_get_control_name(data.handle, data.moduleId, i, outPtr, 256);
          controls.push({
            name: m.UTF8ToString(outPtr),
            min: m._sunvox_wasm_get_control_min(data.handle, data.moduleId, i),
            max: m._sunvox_wasm_get_control_max(data.handle, data.moduleId, i),
            value: m._sunvox_wasm_get_control_value(data.handle, data.moduleId, i),
          });
        }
        m._free(outPtr);
        this.port.postMessage({ type: 'controls', handle: data.handle, moduleId: data.moduleId, controls });
        break;
      }

      // ── Playback control ───────────────────────────────────────────────────

      case 'noteOn':
        if (m) m._sunvox_wasm_note_on(data.handle, data.moduleId, data.note, data.vel);
        break;

      case 'noteOff':
        if (m) m._sunvox_wasm_note_off(data.handle, data.moduleId);
        break;

      case 'setControl':
        if (m) m._sunvox_wasm_set_control(data.handle, data.moduleId, data.ctlId, data.value);
        break;

      case 'play':
        if (m) m._sunvox_wasm_play(data.handle);
        break;

      case 'stop':
        if (m) m._sunvox_wasm_stop(data.handle);
        break;
    }
  }

  async initWasm(sr, wasmBinary, jsCode) {
    try {
      // Polyfill document for Emscripten in worklet context
      if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
          createElement: () => ({
            setAttribute: () => {},
            appendChild: () => {},
            style: {},
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

      // Execute Emscripten JS via Function constructor (import() is unavailable in worklets)
      if (jsCode && !globalThis.createSunVox) {
        const wrappedCode = jsCode + '\nreturn createSunVox;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createSunVox = result;
        }
      }

      if (!globalThis.createSunVox) {
        throw new Error('createSunVox factory not available');
      }

      // Instantiate WASM module with pre-fetched binary for fast loading
      this.wasm = await globalThis.createSunVox({
        wasmBinary,
      });

      // Allocate per-instance scratch buffers — reused for every render call
      this.renderBufL = this.wasm._malloc(MAX_FRAMES * 4);
      this.renderBufR = this.wasm._malloc(MAX_FRAMES * 4);

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[SunVox Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  process(_inputs, outputs, _parameters) {
    // Drain all pending messages before rendering so params take effect this block
    this.drainQueue();

    if (!this.initialized || !this.wasm) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = outputL.length;

    // Start silent; each active handle adds into the output
    outputL.fill(0);
    outputR.fill(0);

    const m = this.wasm;
    const heapF32 = m.HEAPF32;
    const offL = this.renderBufL >> 2; // byte offset → Float32 index
    const offR = this.renderBufR >> 2;

    for (const h of Object.keys(this.handles)) {
      const hi = parseInt(h);
      m._sunvox_wasm_render(hi, this.renderBufL, this.renderBufR, numSamples);
      for (let i = 0; i < numSamples; i++) {
        outputL[i] += heapF32[offL + i];
        outputR[i] += heapF32[offR + i];
      }
    }

    return true;
  }
}

registerProcessor('sunvox-processor', SunVoxProcessor);
