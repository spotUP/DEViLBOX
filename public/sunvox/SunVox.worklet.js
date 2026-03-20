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

    this._playReceived = false;
    this._debuggedNonZero = false;
    this._debugZeroCount = 0;
    this._warnedNoHeap = false;

    this.port.onmessage = (event) => {
      // All messages are handled directly in onmessage. AudioWorklet onmessage and
      // process() run on the same audio rendering thread and are serialized by the
      // JS event loop, so there is no concurrency risk. Handling here (rather than
      // in a queue drained from process()) ensures correctness even when the worklet
      // node is not connected to an active audio graph — e.g. during pre-read module
      // extraction where no SunVoxSynth exists yet and process() never fires.
      if (event.data.type === 'init') {
        this.initWasm(event.data.sampleRate, event.data.wasmBinary, event.data.jsCode);
      } else {
        this.handleMessage(event.data);
      }
    };
  }

  async handleMessage(data) {
    let m = this.wasm;
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
        if (!m || this._wasmCrashed) {
          if (this._wasmCrashed && this._wasmBinary) {
            // Auto-reinitialize WASM after a crash
            console.warn('[SunVox] WASM crashed previously — reinitializing...');
            this._wasmCrashed = false;
            this.handles = {};
            this.initialized = false;
            this.wasm = null;
            await this.initWasm(data.sampleRate, this._wasmBinary, null);
            m = this.wasm;
            if (!m) {
              this.port.postMessage({ type: 'error', message: 'WASM reinit failed' });
              break;
            }
          } else {
            console.error('[SunVox] create: WASM not loaded');
            this.port.postMessage({ type: 'error', message: 'sunvox_wasm_create failed: WASM not loaded' });
            break;
          }
        }
        let handle;
        try {
          handle = m._sunvox_wasm_create(data.sampleRate);
        } catch (err) {
          console.error('[SunVox] create crashed:', err.message, '— will reinit on next create');
          this._wasmCrashed = true;
          this.port.postMessage({ type: 'error', message: 'sunvox_wasm_create crashed: ' + err.message });
          break;
        }
        if (handle < 0) {
          // All 32 slots exhausted — likely stale handles from previous HMR/page reloads.
          // Destroy all handles we DON'T own and retry.
          console.warn('[SunVox] create: no free slots, cleaning up stale handles');
          for (let i = 0; i < 32; i++) {
            if (!this.handles[i]) {
              // Not owned by this processor instance — safe to reclaim
              m._sunvox_wasm_destroy(i);
            }
          }
          handle = m._sunvox_wasm_create(data.sampleRate);
        }
        if (handle >= 0) {
          this.handles[handle] = { active: true };
          this.port.postMessage({ type: 'handle', handle });
        } else {
          this.port.postMessage({ type: 'error', message: `sunvox_wasm_create returned ${handle} (sampleRate=${data.sampleRate})` });
        }
        break;
      }

      case 'destroy': {
        if (!m) break;
        const h = data.handle;
        if (this.handles[h]) {
          try { m._sunvox_wasm_destroy(h); } catch { /* WASM may already be corrupted */ }
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
          // Return song metadata immediately after load
          const namePtr = m._malloc(256);
          m._sunvox_wasm_get_song_name(data.handle, namePtr, 256);
          const songName = m.UTF8ToString(namePtr);
          m._free(namePtr);
          const bpm = m._sunvox_wasm_get_bpm(data.handle);
          const speed = m._sunvox_wasm_get_speed(data.handle);
          const patCount = m._sunvox_wasm_get_pattern_count(data.handle);
          this.port.postMessage({ type: 'songLoaded', handle: data.handle, songName, bpm, speed, patCount });
        } catch (err) {
          this.port.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      case 'getPatterns': {
        if (!m) break;
        const h = data.handle;
        const patCount = m._sunvox_wasm_get_pattern_count(h);
        const patterns = [];
        for (let p = 0; p < patCount; p++) {
          const lines = m._sunvox_wasm_get_pattern_lines(h, p);
          if (lines <= 0) continue; // empty slot
          const flags = m._sunvox_wasm_get_pattern_flags(h, p);
          if (flags & 1) continue; // skip clones (SUNVOX_PATTERN_FLAG_CLONE)
          const tracks = m._sunvox_wasm_get_pattern_tracks(h, p);
          const x = m._sunvox_wasm_get_pattern_x(h, p);
          const notes = [];
          for (let t = 0; t < tracks; t++) {
            const col = [];
            for (let l = 0; l < lines; l++) {
              const note    = m._sunvox_wasm_get_note(h, p, t, l);
              const vel     = m._sunvox_wasm_get_note_vel(h, p, t, l);
              const module  = m._sunvox_wasm_get_note_module(h, p, t, l);
              const ctl     = m._sunvox_wasm_get_note_ctl(h, p, t, l);
              const ctlVal  = m._sunvox_wasm_get_note_ctl_val(h, p, t, l);
              col.push({ note, vel, module, ctl, ctlVal });
            }
            notes.push(col);
          }
          patterns.push({ patIndex: p, x, tracks, lines, notes });
        }
        this.port.postMessage({ type: 'patterns', handle: h, patterns });
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
        if (m) {
          // Stop first to reset playback position, then play from the beginning
          m._sunvox_wasm_stop(data.handle);
          m._sunvox_wasm_play(data.handle);
          this._playReceived = true;
          this._debuggedNonZero = false; // reset so we detect first audio after play
          this._debugZeroCount = 0;
        }
        break;

      case 'stop':
        if (m) m._sunvox_wasm_stop(data.handle);
        break;

      // ── Module graph (uses available API — no type/connection info in this WASM) ──

      case 'getModuleGraph': {
        if (!m) break;
        const count = m._sunvox_wasm_get_module_count(data.handle);
        const outPtr = m._malloc(256);
        const graphModules = [];
        for (let i = 0; i < count; i++) {
          m._sunvox_wasm_get_module_name(data.handle, i, outPtr, 256);
          const name = m.UTF8ToString(outPtr);
          // Get controls for this module
          const ctlCountRaw = m._sunvox_wasm_get_control_count(data.handle, i);
          const ctlCount = Math.min(ctlCountRaw, 32); // Cap to prevent blocking
          const controls = [];
          for (let c = 0; c < ctlCount; c++) {
            m._sunvox_wasm_get_control_name(data.handle, i, c, outPtr, 256);
            controls.push({
              name: m.UTF8ToString(outPtr),
              min: m._sunvox_wasm_get_control_min(data.handle, i, c),
              max: m._sunvox_wasm_get_control_max(data.handle, i, c),
              value: m._sunvox_wasm_get_control_value(data.handle, i, c),
            });
          }
          // Infer module type from control names (best effort without native type API)
          let typeName = 'Unknown';
          if (i === 0) {
            typeName = 'Output';
          } else {
            const ctlNames = controls.map(c => c.name.toLowerCase());
            const has = (s) => ctlNames.some(n => n.includes(s));
            if (has('waveform') && has('duty cycle')) typeName = 'Analog generator';
            else if (has('fm algo') || (has('panning') && has('c.ratio') && ctlCount >= 10)) typeName = 'FM';
            else if (has('freq') && has('boost') && has('bandwidth')) typeName = 'EQ';
            else if (has('roll-off') && has('freq')) typeName = 'Filter Pro';
            else if (has('type') && has('freq') && has('resonance') && !has('roll-off')) typeName = 'Filter';
            else if (has('power') && has('type') && has('bit depth')) typeName = 'Distortion';
            else if (has('dry') && has('wet') && has('delay') && !has('feedback')) typeName = 'Delay';
            else if (has('dry') && has('wet') && has('feedback')) typeName = 'Echo';
            else if (has('dry') && has('wet') && has('room size')) typeName = 'Reverb';
            else if (has('dry') && has('wet') && has('lfo')) typeName = 'Flanger';
            else if (has('dry') && has('wet') && has('channels')) typeName = 'Vibrato';
            else if (has('attack') && has('release') && has('threshold')) typeName = 'Compressor';
            else if (has('waveform') && has('generator') && !has('duty')) typeName = 'Generator';
            else if (has('velocity') && has('waveform') && has('vol')) typeName = 'Kicker';
            else if (has('volume') && has('panning') && ctlCount <= 6 && !has('waveform')) typeName = 'Amplifier';
            else if (has('harmonic')) typeName = 'SpectraVoice';
            else if (has('sample') && has('interpolation')) typeName = 'Sampler';
            else if (has('freq') && has('amplitude') && has('duty') && ctlCount <= 4) typeName = 'LFO';
            else if (has('attack') && has('decay') && has('sustain') && has('release') && ctlCount <= 8) typeName = 'ADSR';
            else if (has('curve') && has('dc filter')) typeName = 'WaveShaper';
            else if (ctlCount > 0) typeName = 'Generator';
            else typeName = 'Amplifier';
          }
          graphModules.push({ id: i, name, typeName, flags: 1, inputs: [], outputs: [], controls });
        }
        m._free(outPtr);
        this.port.postMessage({ type: 'moduleGraph', handle: data.handle, modules: graphModules });
        break;
      }
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

      // Instantiate WASM module with pre-fetched binary
      // Convert Uint8Array back to ArrayBuffer if needed (structured clone from main thread)
      let wasmBuffer;
      if (wasmBinary instanceof Uint8Array) {
        // Ensure we get a clean ArrayBuffer (byteOffset may be non-zero after transfer)
        wasmBuffer = wasmBinary.buffer.byteLength === wasmBinary.length
          ? wasmBinary.buffer
          : wasmBinary.slice().buffer;
      } else {
        wasmBuffer = wasmBinary;
      }
      console.log('[SunVox Worklet] initWasm: wasmBuffer size:', wasmBuffer?.byteLength, 'sampleRate:', sr);
      this.wasm = await globalThis.createSunVox({
        wasmBinary: wasmBuffer,
      });

      // Allocate per-instance scratch buffers — reused for every render call
      this.renderBufL = this.wasm._malloc(MAX_FRAMES * 4);
      this.renderBufR = this.wasm._malloc(MAX_FRAMES * 4);

      this._wasmBinary = wasmBuffer; // Keep for reinit after crash
      this._wasmCrashed = false;
      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[SunVox Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  process(_inputs, outputs, _parameters) {
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
    if (!heapF32) {
      if (!this._warnedNoHeap) {
        this._warnedNoHeap = true;
        console.error('[SunVox Worklet] HEAPF32 not available on module — audio will be silent');
      }
      return true;
    }

    const offL = this.renderBufL >> 2; // byte offset → Float32 index
    const offR = this.renderBufR >> 2;

    for (const h of Object.keys(this.handles)) {
      const hi = parseInt(h);
      // Guard: if BPM is 0, sunvox_render_piece_of_sound will infinite-loop (one_tick=0).
      // Check before render and skip the handle until the song is properly loaded.
      const bpm = m._sunvox_wasm_get_bpm ? m._sunvox_wasm_get_bpm(hi) : 1;
      if (bpm <= 0) {
        if (!this._warnedZeroBpm) {
          this._warnedZeroBpm = true;
          console.warn('[SunVox Worklet] BPM=0 for handle', hi, '— skipping render to prevent tab freeze');
        }
        continue;
      }
      try {
        m._sunvox_wasm_render(hi, this.renderBufL, this.renderBufR, numSamples);
        for (let i = 0; i < numSamples; i++) {
          outputL[i] += heapF32[offL + i];
          outputR[i] += heapF32[offR + i];
        }
      } catch (err) {
        // WASM memory crash — remove ALL handles and flag for reinit
        console.error('[SunVox Worklet] Render crash on handle', hi, '— clearing all handles. Error:', err.message);
        this.handles = {};
        this._wasmCrashed = true;
        this.port.postMessage({ type: 'error', message: 'RuntimeError: ' + err.message });
        break; // Stop iterating handles
      }
    }

    // Debug: log first non-zero block (fires once), or warn after persistent silence
    if (!this._debuggedNonZero) {
      let maxAbs = 0;
      for (let i = 0; i < numSamples; i++) maxAbs = Math.max(maxAbs, Math.abs(outputL[i]));
      if (maxAbs > 0) {
        this._debuggedNonZero = true;
        console.log('[SunVox Worklet] First non-zero render block: maxAbs=', maxAbs,
          'handles=', Object.keys(this.handles));
      } else {
        this._debugZeroCount = (this._debugZeroCount || 0) + 1;
        // Log after 10 silent blocks (~58ms) and again at 200 (~1.16s)
        if (this._debugZeroCount === 10 || this._debugZeroCount === 200) {
          const rawL = heapF32[offL];
          const rawR = heapF32[offR];
          console.warn('[SunVox Worklet] Silent after', this._debugZeroCount, 'blocks.',
            'handles=', Object.keys(this.handles),
            'heapF32 length=', heapF32.length,
            'bufL ptr=', this.renderBufL, 'offL=', offL,
            'heapF32[offL]=', rawL, 'heapF32[offR]=', rawR,
            'playing?', this._playReceived);
        }
      }
    }

    return true;
  }
}

registerProcessor('sunvox-processor', SunVoxProcessor);
