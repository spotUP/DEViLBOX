/**
 * SunVox.worklet.js - AudioWorklet processor for official SunVox Library v2.1.4d
 *
 * Uses the official SunVox Library API (sv_init, sv_open_slot, sv_audio_callback, etc.)
 * instead of the old custom sunvox_wasm_* wrapper. Supports all SunVox format versions.
 *
 * Architecture:
 *   - sv_init() with SV_INIT_FLAG_USER_AUDIO_CALLBACK | AUDIO_FLOAT32 | ONE_THREAD
 *   - Slots (0-15) used as handles for simultaneous SunVox instances
 *   - sv_audio_callback() renders ALL active slots at once (interleaved stereo LRLR)
 *   - Messages from main thread: create, destroy, loadSong, saveSong,
 *     loadSynth, saveSynth, getControls, getModules, noteOn, noteOff,
 *     setControl, play, stop, getPatterns, getModuleGraph
 */

const MAX_FRAMES = 128;

// SunVox Library constants
const SV_INIT_FLAG_NO_DEBUG_OUTPUT = (1 << 0);
const SV_INIT_FLAG_USER_AUDIO_CALLBACK = (1 << 1);
const SV_INIT_FLAG_AUDIO_FLOAT32 = (1 << 3);
const SV_INIT_FLAG_ONE_THREAD = (1 << 4);

const SV_MODULE_FLAG_EXISTS = 1 << 0;
const SV_MODULE_FLAG_GENERATOR = 1 << 1;
const SV_MODULE_FLAG_EFFECT = 1 << 2;
const SV_MODULE_FLAG_MUTE = 1 << 3;
const SV_MODULE_INPUTS_OFF = 16;
const SV_MODULE_INPUTS_MASK = (255 << SV_MODULE_INPUTS_OFF);
const SV_MODULE_OUTPUTS_OFF = (16 + 8);
const SV_MODULE_OUTPUTS_MASK = (255 << SV_MODULE_OUTPUTS_OFF);

const NOTECMD_NOTE_OFF = 128;

class SunVoxProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.svlib = null;       // Emscripten module instance
    this.initialized = false;
    this._svInited = false;  // sv_init() called
    this._sampleRate = 48000;

    // Render buffer for sv_audio_callback (interleaved stereo float32: LRLRLR...)
    this._renderBuf = null;  // WASM pointer
    this._renderBufFrames = 0;

    // Active slots (equivalent to old handles)
    this.handles = {};

    this._playReceived = false;
    this._debuggedNonZero = false;
    this._debugZeroCount = 0;
    this._warnedNoHeap = false;
    this._wasmCrashed = false;
    this._wasmBinary = null;
    this._ticks = 0;
    // Module mute state: Map<`${slot}:${modId}`, { volCtlIdx, savedVal }>
    this._mutedModules = new Map();
    // Cached module graph chains: Map<`${slot}:${modId}`, Set<number>>
    this._chainCache = new Map();

    this.port.onmessage = (event) => {
      if (event.data.type === 'init') {
        this.initWasm(event.data.sampleRate, event.data.wasmBinary, event.data.jsCode);
      } else {
        this.handleMessage(event.data);
      }
    };
  }

  // Helper: get all downstream modules from a start module (BFS), excluding Output (module 0).
  // Returns a Set of module IDs including the start module.
  _getDownstreamModules(handle, startModId) {
    const cacheKey = `${handle}:${startModId}`;
    if (this._chainCache.has(cacheKey)) return this._chainCache.get(cacheKey);
    const m = this.svlib;
    if (!m) return new Set([startModId]);
    const visited = new Set();
    const queue = [startModId];
    while (queue.length > 0) {
      const modId = queue.shift();
      if (visited.has(modId)) continue;
      if (modId === 0) continue; // Don't mute Output module
      const flags = m._sv_get_module_flags(handle, modId);
      if (!(flags & SV_MODULE_FLAG_EXISTS)) continue;
      visited.add(modId);
      const numOutputs = (flags & SV_MODULE_OUTPUTS_MASK) >> SV_MODULE_OUTPUTS_OFF;
      const outputsPtr = m._sv_get_module_outputs(handle, modId);
      if (outputsPtr) {
        for (let j = 0; j < numOutputs; j++) {
          const out = m.HEAP32[(outputsPtr >> 2) + j];
          if (out >= 0 && !visited.has(out)) queue.push(out);
        }
      }
    }
    this._chainCache.set(cacheKey, visited);
    return visited;
  }

  // Helper: mute a single module (save volume, set to min). Returns true if newly muted.
  _muteOneModule(handle, moduleId) {
    const m = this.svlib;
    const key = `${handle}:${moduleId}`;
    if (this._mutedModules.has(key)) return false;
    const ctlCount = m._sv_get_number_of_module_ctls(handle, moduleId);
    let volCtlIdx = -1;
    for (let i = 0; i < ctlCount; i++) {
      const name = m.UTF8ToString(m._sv_get_module_ctl_name(handle, moduleId, i));
      if (name.toLowerCase() === 'volume') { volCtlIdx = i; break; }
    }
    if (volCtlIdx >= 0) {
      const savedVal = m._sv_get_module_ctl_value(handle, moduleId, volCtlIdx, 0);
      const minVal = m._sv_get_module_ctl_min(handle, moduleId, volCtlIdx, 0);
      this._mutedModules.set(key, { volCtlIdx, savedVal });
      m._sv_set_module_ctl_value(handle, moduleId, volCtlIdx, minVal, 0);
    } else {
      m._sv_send_event(handle, 0, 140, 0, moduleId + 1, 0, 0); // NOTECMD_CLEAN_MODULE
      this._mutedModules.set(key, { volCtlIdx: -1, savedVal: 0 });
    }
    return true;
  }

  // Helper: unmute a single module (restore volume). Returns true if was muted.
  _unmuteOneModule(handle, moduleId) {
    const m = this.svlib;
    const key = `${handle}:${moduleId}`;
    const saved = this._mutedModules.get(key);
    if (!saved) return false;
    if (saved.volCtlIdx >= 0) {
      m._sv_set_module_ctl_value(handle, moduleId, saved.volCtlIdx, saved.savedVal, 0);
    }
    this._mutedModules.delete(key);
    return true;
  }

  // Helper: allocate a C string from a JS string
  _strToPtr(s) {
    const m = this.svlib;
    const ptr = m._malloc(s.length + 1);
    for (let i = 0; i < s.length; i++) m.HEAPU8[ptr + i] = s.charCodeAt(i);
    m.HEAPU8[ptr + s.length] = 0;
    return ptr;
  }

  // Helper: allocate a Uint8Array in WASM memory, returns { ptr, size }
  _allocBytes(uint8arr) {
    const m = this.svlib;
    const ptr = m._malloc(uint8arr.length);
    m.HEAPU8.set(uint8arr, ptr);
    return ptr;
  }

  async handleMessage(data) {
    const m = this.svlib;

    switch (data.type) {
      // ── Lifecycle ──────────────────────────────────────────────────────────

      case 'create': {
        if (!m || this._wasmCrashed) {
          if (this._wasmCrashed && this._wasmBinary) {
            console.warn('[SunVox] WASM crashed previously — reinitializing...');
            this._wasmCrashed = false;
            this.handles = {};
            this.initialized = false;
            this._svInited = false;
            this.svlib = null;
            await this.initWasm(data.sampleRate, this._wasmBinary, null);
            if (!this.svlib) {
              this.port.postMessage({ type: 'error', message: 'WASM reinit failed' });
              break;
            }
          } else {
            this.port.postMessage({ type: 'error', message: 'WASM not loaded' });
            break;
          }
        }
        // Find first free slot (0-15)
        let slot = -1;
        for (let i = 0; i < 16; i++) {
          if (!this.handles[i]) { slot = i; break; }
        }
        if (slot < 0) {
          this.port.postMessage({ type: 'error', message: 'No free SunVox slots (max 16)' });
          break;
        }
        try {
          const rv = this.svlib._sv_open_slot(slot);
          if (rv === 0) {
            this.handles[slot] = { active: true };
            this.port.postMessage({ type: 'handle', handle: slot });
          } else {
            this.port.postMessage({ type: 'error', message: `sv_open_slot(${slot}) returned ${rv}` });
          }
        } catch (err) {
          console.error('[SunVox] sv_open_slot crashed:', err.message);
          this._wasmCrashed = true;
          this.port.postMessage({ type: 'error', message: 'sv_open_slot crashed: ' + err.message });
        }
        break;
      }

      case 'destroy': {
        if (!m) break;
        const h = data.handle;
        if (this.handles[h]) {
          // sv_stop: first call stops playing, second call resets all activity
          try { m._sv_stop(h); m._sv_stop(h); } catch { /* ignore */ }
          try { m._sv_close_slot(h); } catch { /* ignore */ }
          delete this.handles[h];
          // Clear any muted modules and chain cache for this handle
          for (const key of this._mutedModules.keys()) {
            if (key.startsWith(`${h}:`)) this._mutedModules.delete(key);
          }
          for (const key of this._chainCache.keys()) {
            if (key.startsWith(`${h}:`)) this._chainCache.delete(key);
          }
        }
        break;
      }

      case 'dispose':
        if (m) {
          for (const h of Object.keys(this.handles)) {
            try { m._sv_close_slot(parseInt(h)); } catch { /* ignore */ }
          }
          this.handles = {};
          if (this._renderBuf) { m._free(this._renderBuf); this._renderBuf = null; }
          if (this._svInited) { m._sv_deinit(); this._svInited = false; }
        }
        this.initialized = false;
        break;

      // ── Song I/O ───────────────────────────────────────────────────────────

      case 'loadSong': {
        if (!m) break;
        const buf = new Uint8Array(data.buffer);
        try {
          // Stop any playback on this handle before loading new song data.
          // sv_stop twice: first stops playing, second resets all activity.
          try { m._sv_stop(data.handle); m._sv_stop(data.handle); } catch { /* ignore */ }
          // Clear muted-module state and chain cache for this handle
          for (const key of this._mutedModules.keys()) {
            if (key.startsWith(`${data.handle}:`)) this._mutedModules.delete(key);
          }
          for (const key of this._chainCache.keys()) {
            if (key.startsWith(`${data.handle}:`)) this._chainCache.delete(key);
          }
          const ptr = this._allocBytes(buf);
          const rv = m._sv_load_from_memory(data.handle, ptr, buf.length);
          m._free(ptr);
          if (rv !== 0) {
            this.port.postMessage({ type: 'error', message: `sv_load_from_memory failed: ${rv}` });
            break;
          }
          // Return song metadata
          const songName = m.UTF8ToString(m._sv_get_song_name(data.handle));
          const bpm = m._sv_get_song_bpm(data.handle);
          const speed = m._sv_get_song_tpl(data.handle); // ticks per line = speed
          const patCount = m._sv_get_number_of_patterns(data.handle);
          this.port.postMessage({ type: 'songLoaded', handle: data.handle, songName, bpm, speed, patCount });
        } catch (err) {
          this.port.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      case 'getPatterns': {
        if (!m) break;
        const h = data.handle;
        const patCount = m._sv_get_number_of_patterns(h);
        const patterns = [];
        const seenDataPtrs = new Map(); // dataPtr → first patIndex (for clone detection)
        for (let p = 0; p < patCount; p++) {
          const lines = m._sv_get_pattern_lines(h, p);
          if (lines <= 0) continue; // empty slot
          const tracks = m._sv_get_pattern_tracks(h, p);
          if (tracks <= 0) continue;
          const x = m._sv_get_pattern_x(h, p);
          const y = m._sv_get_pattern_y(h, p);
          // Get pattern name
          const namePtr = m._sv_get_pattern_name(h, p);
          const patName = namePtr ? m.UTF8ToString(namePtr) : '';
          // Get raw pattern data: 8 bytes per event (NN VV MM MM EE CC YY XX)
          const dataPtr = m._sv_get_pattern_data(h, p);
          if (!dataPtr) continue;
          // Detect clones (share same data pointer) but don't skip them —
          // clones at different timeline positions are valid song structure
          const cloneOf = seenDataPtrs.has(dataPtr) ? seenDataPtrs.get(dataPtr) : -1;
          if (!seenDataPtrs.has(dataPtr)) seenDataPtrs.set(dataPtr, p);
          const notes = [];
          for (let t = 0; t < tracks; t++) {
            const col = [];
            for (let l = 0; l < lines; l++) {
              const off = dataPtr + (l * tracks + t) * 8;
              const nn = m.HEAPU8[off];       // note (NN)
              const vv = m.HEAPU8[off + 1];   // velocity (VV)
              const mm = m.HEAPU8[off + 2] | (m.HEAPU8[off + 3] << 8); // module (MM, 16-bit LE)
              const ee = m.HEAPU8[off + 4];   // effect code (EE)
              const cc = m.HEAPU8[off + 5];   // controller number + 1 (CC)
              const yy = m.HEAPU8[off + 6];   // ctl_val low byte (YY)
              const xx = m.HEAPU8[off + 7];   // ctl_val high byte (XX)
              // ctl = 0xCCEE (little-endian uint16: low byte=EE at offset 4, high byte=CC at offset 5)
              const ctl = ee | (cc << 8);
              // ctl_val = 0xXXYY (little-endian uint16: low byte=YY at offset 6, high byte=XX at offset 7)
              const ctlVal = yy | (xx << 8);
              // Map module: SunVox uses 1-based (0=none), our system uses 0-based IDs
              const module = mm > 0 ? mm - 1 : -1;
              col.push({ note: nn, vel: vv, module, ctl, ctlVal });
            }
            notes.push(col);
          }
          patterns.push({ patIndex: p, x, y, tracks, lines, patName, cloneOf, notes });
        }
        console.log('[SunVox Worklet] getPatterns:', patterns.length, 'non-empty patterns from', patCount, 'slots',
          'tracks:', patterns.map(p => p.tracks).filter((v,i,a) => a.indexOf(v)===i).sort((a,b)=>a-b).join(','));
        this.port.postMessage({ type: 'patterns', handle: h, patterns });
        break;
      }

      case 'saveSong': {
        if (!m) break;
        try {
          const sizePtr = m._malloc(4);
          const dataPtr = m._sv_save_to_memory(data.handle, sizePtr);
          const size = m.getValue(sizePtr, 'i32');
          m._free(sizePtr);
          if (dataPtr && size > 0) {
            const src = m.HEAPU8.subarray(dataPtr, dataPtr + size);
            const outBuf = new Uint8Array(size);
            outBuf.set(src);
            m._free(dataPtr);
            const ab = outBuf.buffer;
            this.port.postMessage({ type: 'songSaved', handle: data.handle, buffer: ab }, [ab]);
          } else {
            this.port.postMessage({ type: 'error', message: 'sv_save_to_memory failed' });
          }
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
          const ptr = this._allocBytes(buf);
          const moduleId = m._sv_load_module_from_memory(data.handle, ptr, buf.length, 0, 0, 0);
          m._free(ptr);
          this.port.postMessage({ type: 'synthLoaded', handle: data.handle, moduleId });
        } catch (err) {
          this.port.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      case 'saveSynth': {
        // The official API doesn't have a direct save-single-module-to-memory.
        // Use FS-based approach as fallback.
        if (!m) break;
        try {
          // Not directly supported — send error
          this.port.postMessage({ type: 'error', message: 'saveSynth not yet implemented for official SunVox library' });
        } catch (err) {
          this.port.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      // ── Module/Control introspection ───────────────────────────────────────

      case 'getModules': {
        if (!m) break;
        const count = m._sv_get_number_of_modules(data.handle);
        const modules = [];
        for (let i = 0; i < count; i++) {
          const flags = m._sv_get_module_flags(data.handle, i);
          if (!(flags & SV_MODULE_FLAG_EXISTS)) continue;
          const name = m.UTF8ToString(m._sv_get_module_name(data.handle, i));
          modules.push({ id: i, name });
        }
        this.port.postMessage({ type: 'modules', handle: data.handle, modules });
        break;
      }

      case 'getControls': {
        if (!m) break;
        const ctlCount = m._sv_get_number_of_module_ctls(data.handle, data.moduleId);
        const controls = [];
        for (let i = 0; i < ctlCount; i++) {
          controls.push({
            name: m.UTF8ToString(m._sv_get_module_ctl_name(data.handle, data.moduleId, i)),
            min: m._sv_get_module_ctl_min(data.handle, data.moduleId, i, 0),
            max: m._sv_get_module_ctl_max(data.handle, data.moduleId, i, 0),
            value: m._sv_get_module_ctl_value(data.handle, data.moduleId, i, 0),
          });
        }
        this.port.postMessage({ type: 'controls', handle: data.handle, moduleId: data.moduleId, controls });
        break;
      }

      // ── Playback control ───────────────────────────────────────────────────

      case 'noteOn':
        // SunVox send_event: note (1-based), vel (1-129), module (1-based, 0=none)
        if (m) m._sv_send_event(data.handle, 0, data.note, data.vel, data.moduleId + 1, 0, 0);
        break;

      case 'noteOff':
        if (m) m._sv_send_event(data.handle, 0, NOTECMD_NOTE_OFF, 0, data.moduleId + 1, 0, 0);
        break;

      case 'setControl':
        if (m) m._sv_set_module_ctl_value(data.handle, data.moduleId, data.ctlId, data.value, 0);
        break;

      case 'setPatternEvent': {
        // Write a pattern event: sv_set_pattern_event(slot, pat, track, line, nn, vv, mm, ccee, xxyy)
        // Only non-negative values are written (pass -1 to leave a field unchanged)
        if (!m) break;
        const rv = m._sv_set_pattern_event(
          data.handle, data.pat, data.track, data.line,
          data.nn ?? -1, data.vv ?? -1, data.mm ?? -1, data.ccee ?? -1, data.xxyy ?? -1
        );
        if (rv < 0) console.warn('[SunVox Worklet] sv_set_pattern_event failed:', rv);
        break;
      }

      case 'muteModule': {
        // Mute a single module (legacy — prefer setModuleMuteState for chain-aware muting)
        if (!m) break;
        this._muteOneModule(data.handle, data.moduleId);
        break;
      }

      case 'unmuteModule': {
        if (!m) break;
        this._unmuteOneModule(data.handle, data.moduleId);
        break;
      }

      case 'setMuteMask': {
        // Per-channel muting via bitmask. In SunVox, "channels" correspond to
        // generator modules (modules with SV_MODULE_FLAG_GENERATOR set),
        // excluding module 0 (Output). Bit N = generator N muted.
        if (!m) break;
        const h = data.handle;
        const mask = data.mask || 0;
        // Collect generator module IDs (skip module 0 = Output)
        const modCount = m._sv_get_number_of_modules(h);
        const generators = [];
        for (let i = 1; i < modCount; i++) {
          const flags = m._sv_get_module_flags(h, i);
          if ((flags & SV_MODULE_FLAG_EXISTS) && (flags & SV_MODULE_FLAG_GENERATOR)) {
            generators.push(i);
          }
        }
        // Apply mute/unmute per generator
        const mutedRoots = [];
        const unmutedRoots = [];
        for (let ch = 0; ch < generators.length; ch++) {
          if (mask & (1 << ch)) {
            mutedRoots.push(generators[ch]);
          } else {
            unmutedRoots.push(generators[ch]);
          }
        }
        // Delegate to chain-aware muting
        // Collect all modules that should be unmuted (in any active chain)
        const shouldBeUnmuted = new Set();
        for (const rootId of unmutedRoots) {
          for (const modId of this._getDownstreamModules(h, rootId)) {
            shouldBeUnmuted.add(modId);
          }
        }
        // Collect all modules that should be muted
        const shouldBeMuted = new Set();
        for (const rootId of mutedRoots) {
          for (const modId of this._getDownstreamModules(h, rootId)) {
            if (!shouldBeUnmuted.has(modId)) shouldBeMuted.add(modId);
          }
        }
        for (const modId of shouldBeUnmuted) this._unmuteOneModule(h, modId);
        for (const modId of shouldBeMuted) this._muteOneModule(h, modId);
        break;
      }

      case 'setModuleMuteState': {
        // Chain-aware muting: walks the module graph from each root module to Output,
        // muting/unmuting entire signal chains. Shared modules stay unmuted if ANY
        // chain through them is active.
        if (!m) break;
        const h = data.handle;
        const unmutedRoots = data.unmutedRoots || [];
        const mutedRoots = data.mutedRoots || [];

        // Collect all modules that should be unmuted (in any active chain)
        const shouldBeUnmuted = new Set();
        for (const rootId of unmutedRoots) {
          for (const modId of this._getDownstreamModules(h, rootId)) {
            shouldBeUnmuted.add(modId);
          }
        }

        // Collect all modules that should be muted (in muted chains, but NOT in any active chain)
        const shouldBeMuted = new Set();
        for (const rootId of mutedRoots) {
          for (const modId of this._getDownstreamModules(h, rootId)) {
            if (!shouldBeUnmuted.has(modId)) shouldBeMuted.add(modId);
          }
        }

        // Unmute modules that should be active but are currently muted
        for (const modId of shouldBeUnmuted) {
          this._unmuteOneModule(h, modId);
        }

        // Mute modules that should be silent
        for (const modId of shouldBeMuted) {
          this._muteOneModule(h, modId);
        }
        break;
      }

      case 'play':
        if (m) {
          // Clear any muted module state from a previous song
          for (const [key, saved] of this._mutedModules) {
            if (key.startsWith(`${data.handle}:`)) {
              if (saved.volCtlIdx >= 0) {
                const modId = parseInt(key.split(':')[1]);
                m._sv_set_module_ctl_value(data.handle, modId, saved.volCtlIdx, saved.savedVal, 0);
              }
              this._mutedModules.delete(key);
            }
          }
          // Ensure volume is set before play.
          // Do NOT call sv_stop before sv_play — a double-stop puts the engine in
          // standby mode (no audio). sv_play_from_beginning already resets state.
          m._sv_volume(data.handle, 256); // max volume (0-256)
          if (data.fromBeginning) {
            m._sv_stop(data.handle);
            m._sv_play_from_beginning(data.handle);
          } else {
            // Resume from current position (after stop or first play on fresh load)
            m._sv_play(data.handle);
          }
          console.log('[SunVox Worklet] play: handle', data.handle, 'fromBeginning:', !!data.fromBeginning);
          this._playReceived = true;
          this._debuggedNonZero = false;
          this._debugZeroCount = 0;
        }
        break;

      case 'stop':
        if (m) m._sv_stop(data.handle);
        break;

      // ── Per-module oscilloscope ─────────────────────────────────────────

      case 'getModuleScope': {
        // sv_get_module_scope2(slot, mod_num, channel, dest_buf, samples_to_read) → actual count
        if (!m) break;
        try {
          const SCOPE_LEN = 1024;
          const destPtr = m._malloc(SCOPE_LEN * 2); // int16 = 2 bytes each
          const received = m._sv_get_module_scope2(
            data.handle, data.moduleId, data.channel || 0, destPtr, SCOPE_LEN
          );
          const out = new Float32Array(received);
          const heap16 = new Int16Array(m.HEAPU8.buffer, destPtr, received);
          for (let i = 0; i < received; i++) out[i] = heap16[i] / 32768;
          m._free(destPtr);
          this.port.postMessage(
            { type: 'moduleScope', handle: data.handle, moduleId: data.moduleId, data: out.buffer },
            [out.buffer]
          );
        } catch (err) {
          console.error('[SunVox Worklet] getModuleScope error:', err.message);
          const empty = new Float32Array(0);
          this.port.postMessage(
            { type: 'moduleScope', handle: data.handle, moduleId: data.moduleId, data: empty.buffer },
            [empty.buffer]
          );
        }
        break;
      }

      // ── Bulk per-module RMS levels for VU meters ─────────────────────────

      case 'getModuleLevels': {
        // data.handle: slot, data.moduleIds: number[]
        // Returns RMS level (0-1) per module using sv_get_module_scope2
        if (!m) break;
        try {
          const ids = data.moduleIds;
          const levels = new Float32Array(ids.length);
          const SCOPE_LEN = 256; // fewer samples = faster
          const destPtr = m._malloc(SCOPE_LEN * 2);
          for (let idx = 0; idx < ids.length; idx++) {
            const received = m._sv_get_module_scope2(
              data.handle, ids[idx], 0, destPtr, SCOPE_LEN
            );
            if (received > 0) {
              const heap16 = new Int16Array(m.HEAPU8.buffer, destPtr, received);
              let sumSq = 0;
              for (let i = 0; i < received; i++) {
                const s = heap16[i] / 32768;
                sumSq += s * s;
              }
              levels[idx] = Math.sqrt(sumSq / received);
            }
          }
          m._free(destPtr);
          this.port.postMessage(
            { type: 'moduleLevels', handle: data.handle, levels: levels.buffer },
            [levels.buffer]
          );
        } catch (err) {
          console.error('[SunVox Worklet] getModuleLevels error:', err.message);
          this.port.postMessage(
            { type: 'moduleLevels', handle: data.handle, levels: new Float32Array(0).buffer },
            []
          );
        }
        break;
      }

      // ── Module graph (with full type info from official API) ──────────────

      case 'getModuleGraph': {
        if (!m) break;
        const count = m._sv_get_number_of_modules(data.handle);
        const graphModules = [];
        for (let i = 0; i < count; i++) {
          const flags = m._sv_get_module_flags(data.handle, i);
          if (!(flags & SV_MODULE_FLAG_EXISTS)) continue;
          const name = m.UTF8ToString(m._sv_get_module_name(data.handle, i));
          const typeName = m.UTF8ToString(m._sv_get_module_type(data.handle, i));
          // Get inputs
          const numInputs = (flags & SV_MODULE_INPUTS_MASK) >> SV_MODULE_INPUTS_OFF;
          const inputsPtr = m._sv_get_module_inputs(data.handle, i);
          const inputs = [];
          if (inputsPtr) {
            for (let j = 0; j < numInputs; j++) {
              const inp = m.HEAP32[(inputsPtr >> 2) + j];
              if (inp >= 0) inputs.push(inp);
            }
          }
          // Get outputs
          const numOutputs = (flags & SV_MODULE_OUTPUTS_MASK) >> SV_MODULE_OUTPUTS_OFF;
          const outputsPtr = m._sv_get_module_outputs(data.handle, i);
          const outputs = [];
          if (outputsPtr) {
            for (let j = 0; j < numOutputs; j++) {
              const out = m.HEAP32[(outputsPtr >> 2) + j];
              if (out >= 0) outputs.push(out);
            }
          }
          // Get controls
          const ctlCount = Math.min(m._sv_get_number_of_module_ctls(data.handle, i), 32);
          const controls = [];
          for (let c = 0; c < ctlCount; c++) {
            controls.push({
              name: m.UTF8ToString(m._sv_get_module_ctl_name(data.handle, i, c)),
              min: m._sv_get_module_ctl_min(data.handle, i, c, 0),
              max: m._sv_get_module_ctl_max(data.handle, i, c, 0),
              value: m._sv_get_module_ctl_value(data.handle, i, c, 0),
            });
          }
          graphModules.push({ id: i, name, typeName, flags, inputs, outputs, controls });
        }
        this.port.postMessage({ type: 'moduleGraph', handle: data.handle, modules: graphModules });
        break;
      }
    }
  }

  async initWasm(sr, wasmBinary, jsCode) {
    try {
      this._sampleRate = sr;

      // Polyfill document/location/performance for Emscripten in worklet context
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

      // Execute Emscripten JS via Function constructor
      if (jsCode && !globalThis.SunVoxLib) {
        // The new SunVox.js exports SunVoxLib as an IIFE that returns an async factory
        const wrappedCode = jsCode + '\nreturn SunVoxLib;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.SunVoxLib = result;
        }
      }

      if (!globalThis.SunVoxLib) {
        throw new Error('SunVoxLib factory not available');
      }

      // Convert Uint8Array back to ArrayBuffer if needed
      let wasmBuffer;
      if (wasmBinary instanceof Uint8Array) {
        wasmBuffer = wasmBinary.buffer.byteLength === wasmBinary.length
          ? wasmBinary.buffer
          : wasmBinary.slice().buffer;
      } else {
        wasmBuffer = wasmBinary;
      }
      console.log('[SunVox Worklet] initWasm: wasmBuffer size:', wasmBuffer?.byteLength, 'sampleRate:', sr);

      // Instantiate the official SunVox Library WASM
      this.svlib = await globalThis.SunVoxLib({ wasmBinary: wasmBuffer });
      const m = this.svlib;

      // Initialize the SunVox engine
      const flags = SV_INIT_FLAG_USER_AUDIO_CALLBACK | SV_INIT_FLAG_AUDIO_FLOAT32 | SV_INIT_FLAG_ONE_THREAD | SV_INIT_FLAG_NO_DEBUG_OUTPUT;
      const rv = m._sv_init(0, sr, 2, flags);
      if (rv < 0) {
        throw new Error(`sv_init failed: ${rv}`);
      }
      console.log('[SunVox Worklet] sv_init OK, library version:', rv.toString(16));
      this._svInited = true;

      // Allocate interleaved stereo render buffer (LRLRLR... float32)
      this._renderBufFrames = MAX_FRAMES;
      this._renderBuf = m._malloc(MAX_FRAMES * 2 * 4); // 2 channels * 4 bytes per float

      this._wasmBinary = wasmBuffer;
      this._wasmCrashed = false;
      this.initialized = true;
      console.log('[SunVox Worklet] Official SunVox Library v2.1.4d initialized');
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[SunVox Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  process(_inputs, outputs, _parameters) {
    if (!this.initialized || !this.svlib) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = outputL.length;

    outputL.fill(0);
    outputR.fill(0);

    const m = this.svlib;

    // Skip if no active handles
    if (Object.keys(this.handles).length === 0) return true;

    try {
      // sv_audio_callback renders ALL active slots at once
      // Output is interleaved stereo float32: LRLRLR...
      const ticks = m._sv_get_ticks();
      m._sv_audio_callback(this._renderBuf, numSamples, 0, ticks);

      // De-interleave stereo output
      const heapF32 = m.HEAPF32;
      const off = this._renderBuf >> 2;
      for (let i = 0; i < numSamples; i++) {
        outputL[i] = heapF32[off + i * 2];
        outputR[i] = heapF32[off + i * 2 + 1];
      }
    } catch (err) {
      console.error('[SunVox Worklet] Render crash:', err.message);
      this.handles = {};
      this._wasmCrashed = true;
      this.port.postMessage({ type: 'error', message: 'RuntimeError: ' + err.message });
      return true;
    }

    // Debug: log first non-zero block or warn after persistent silence
    if (!this._debuggedNonZero) {
      let maxAbs = 0;
      for (let i = 0; i < numSamples; i++) maxAbs = Math.max(maxAbs, Math.abs(outputL[i]));
      if (maxAbs > 0) {
        this._debuggedNonZero = true;
        console.log('[SunVox Worklet] First non-zero render block: maxAbs=', maxAbs,
          'handles=', Object.keys(this.handles));
      } else {
        this._debugZeroCount = (this._debugZeroCount || 0) + 1;
        if (this._debugZeroCount === 10 || this._debugZeroCount === 200) {
          console.warn('[SunVox Worklet] Silent after', this._debugZeroCount, 'blocks.',
            'handles=', Object.keys(this.handles),
            'playing?', this._playReceived);
        }
      }
    }

    return true;
  }
}

registerProcessor('sunvox-processor', SunVoxProcessor);
