/**
 * SunVox DSP Worker — Official SunVox Library (v2.x, 41 modules)
 *
 * Uses the official sunvox_lib WASM (sv_* API) instead of the old open-source engine.
 * Renders audio into a SharedArrayBuffer ring buffer that the AudioWorklet reads.
 *
 * Message protocol (unchanged from previous version):
 *   { type: 'init', sampleRate }
 *   { type: 'createHandle' }
 *   { type: 'loadSong', handle, buffer }
 *   { type: 'loadSynth', handle, buffer }
 *   { type: 'saveSong', handle }
 *   { type: 'saveSynth', handle, moduleId }
 *   { type: 'getModules', handle }
 *   { type: 'getPatterns', handle }
 *   { type: 'getControls', handle, moduleId }
 *   { type: 'play', handle }
 *   { type: 'stop', handle }
 *   { type: 'noteOn', handle, moduleId, note, vel }
 *   { type: 'noteOff', handle, moduleId }
 *   { type: 'setControl', handle, moduleId, ctlId, value }
 *   { type: 'destroyHandle', handle }
 *
 * Internally, "handle" maps to a SunVox "slot" (0-15).
 */

const HEADER_BYTES = 16;
const HEADER_INTS  = HEADER_BYTES / 4;
const RING_FRAMES  = 8192;
const RENDER_BLOCK = 512;

// SunVox init flags
const SV_INIT_FLAG_USER_AUDIO_CALLBACK = (1 << 1);
const SV_INIT_FLAG_AUDIO_FLOAT32       = (1 << 3);
const SV_INIT_FLAG_ONE_THREAD          = (1 << 4);
const SV_INIT_FLAG_NO_DEBUG_OUTPUT     = (1 << 0);

// Module flags
const SV_MODULE_FLAG_EXISTS = 1 << 0;

let svlib = null;      // Emscripten module instance
let sampleRate = 44100;
let sab = null;
let sabInt32 = null;
let sabFloat32 = null;
let renderBuf = null;  // Float32Array for sv_audio_callback output
let renderTimer = null;
let slots = {};        // active slot ids (handle → true)
let nextSlot = 0;

// Render buffer pointers for sv_audio_callback
let sv_callback_buf_mptr = null;
let sv_callback_buf_numframes = 0;

// ── Error handling ──────────────────────────────────────────────────────────

self.onerror = function (e) {
  workerLog('[SunVox Worker] Unhandled error: ' + (e.message || e));
  self.postMessage({ type: 'error', message: `Unhandled: ${e.message || e}` });
};

self.onunhandledrejection = function (e) {
  const msg = e.reason ? (e.reason.stack || e.reason.message || String(e.reason)) : 'unknown';
  workerLog('[SunVox Worker] Unhandled rejection: ' + msg);
  self.postMessage({ type: 'error', message: `Unhandled rejection: ${msg}` });
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function workerLog(msg) {
  console.warn(msg);
  self.postMessage({ type: 'workerLog', message: msg });
}

// Intercept console.error for WASM debug output routing
const _origConsoleError = console.error.bind(console);
console.error = function(...args) {
  const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  workerLog(text);
  _origConsoleError(...args);
};

// ── sv_audio_callback wrapper ───────────────────────────────────────────────

function svRender(outBuf, frames) {
  // Render interleaved stereo float32 from all active slots
  const frameSize = 2 * 4; // 2 channels * 4 bytes (float32)
  if (frames > sv_callback_buf_numframes) {
    if (sv_callback_buf_mptr) svlib._free(sv_callback_buf_mptr);
    sv_callback_buf_mptr = null;
  }
  if (!sv_callback_buf_mptr) {
    sv_callback_buf_numframes = frames;
    sv_callback_buf_mptr = svlib._malloc(frames * frameSize);
  }
  // sv_audio_callback renders ALL active slots into the output
  svlib._sv_audio_callback(sv_callback_buf_mptr, frames, 0, svlib._sv_get_ticks());
  // Copy from WASM heap to JS buffer
  const heapF32 = svlib.HEAPF32;
  const off = sv_callback_buf_mptr >> 2;
  for (let i = 0; i < frames * 2; i++) {
    outBuf[i] = heapF32[off + i];
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init(msg) {
  sampleRate = msg.sampleRate || 44100;

  workerLog('[SunVox Worker] loading official SunVoxLib...');
  const _cacheBust = Date.now();
  importScripts('/sunvox/SunVoxLib.js?v=' + _cacheBust);
  workerLog('[SunVox Worker] importScripts done');

  if (typeof SunVoxLib !== 'function') {
    throw new Error('SunVoxLib factory not found after importScripts');
  }

  workerLog('[SunVox Worker] instantiating SunVoxLib WASM...');
  svlib = await SunVoxLib({
    print:    (text) => workerLog('[SunVox] ' + text),
    printErr: (text) => workerLog('[SunVox err] ' + text),
    locateFile: (path) => '/sunvox/' + (path === 'sunvox.wasm' ? 'SunVoxLib.wasm' : path) + '?v=' + _cacheBust,
  });
  workerLog('[SunVox Worker] SunVoxLib WASM ready');

  // Initialize the SunVox engine
  const flags = SV_INIT_FLAG_USER_AUDIO_CALLBACK | SV_INIT_FLAG_AUDIO_FLOAT32 | SV_INIT_FLAG_ONE_THREAD;
  const rv = svlib._sv_init(0, sampleRate, 2, flags);
  workerLog('[SunVox Worker] sv_init returned ' + rv);

  // Pre-allocate render buffer
  renderBuf = new Float32Array(RENDER_BLOCK * 2);

  // Allocate SharedArrayBuffer ring buffer
  const sabBytes = HEADER_BYTES + RING_FRAMES * 2 * 4;
  sab = new SharedArrayBuffer(sabBytes);
  sabInt32   = new Int32Array(sab);
  sabFloat32 = new Float32Array(sab);
  Atomics.store(sabInt32, 2, RING_FRAMES);

  // Start render loop
  renderTimer = setInterval(renderLoop, 1);

  self.postMessage({ type: 'ready', sab });
}

// ── Render loop ──────────────────────────────────────────────────────────────

function renderLoop() {
  if (!svlib || !sab) return;

  const bufSize  = Atomics.load(sabInt32, 2);
  const readPos  = Atomics.load(sabInt32, 1);
  let   writePos = Atomics.load(sabInt32, 0);

  let free = readPos - writePos - 1;
  if (free < 0) free += bufSize;
  if (free < RENDER_BLOCK) return;

  const activeSlots = Object.keys(slots);
  if (activeSlots.length === 0) {
    const dataOff = HEADER_INTS;
    for (let i = 0; i < RENDER_BLOCK; i++) {
      const base = dataOff + ((writePos + i) % bufSize) * 2;
      sabFloat32[base]   = 0;
      sabFloat32[base+1] = 0;
    }
    Atomics.store(sabInt32, 0, (writePos + RENDER_BLOCK) % bufSize);
    return;
  }

  // Render audio from official SunVox engine (all slots mixed)
  svRender(renderBuf, RENDER_BLOCK);

  // Write interleaved into ring buffer
  // SunVox float32 output is typically very quiet — apply gain boost
  const GAIN = 12.0;
  const dataOff = HEADER_INTS;
  let peak = 0;
  for (let i = 0; i < RENDER_BLOCK; i++) {
    const base = dataOff + ((writePos + i) % bufSize) * 2;
    const l = renderBuf[i * 2] * GAIN;
    const r = renderBuf[i * 2 + 1] * GAIN;
    sabFloat32[base]   = l;
    sabFloat32[base+1] = r;
    const abs = Math.max(Math.abs(l), Math.abs(r));
    if (abs > peak) peak = abs;
  }

  Atomics.store(sabInt32, 3, Math.round(peak * 1000));
  Atomics.store(sabInt32, 0, (writePos + RENDER_BLOCK) % bufSize);
}

// ── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async function (e) {
  const data = e.data;

  if (data.type === 'init') {
    try {
      await init(data);
    } catch (err) {
      workerLog('[SunVox Worker] Init error: ' + (err.stack || String(err)));
      self.postMessage({ type: 'error', message: String(err) });
    }
    return;
  }

  if (!svlib) {
    self.postMessage({ type: 'error', message: 'WASM not initialized' });
    return;
  }

  try {
    switch (data.type) {

      case 'createHandle': {
        const slot = nextSlot++;
        workerLog('[SunVox Worker] createHandle: opening slot ' + slot);
        svlib._sv_open_slot(slot);
        slots[slot] = true;
        self.postMessage({ type: 'handleCreated', handle: slot });
        break;
      }

      case 'destroyHandle': {
        const slot = data.handle;
        delete slots[slot];
        svlib._sv_close_slot(slot);
        break;
      }

      case 'loadSong': {
        const slot = data.handle;
        const buf = new Uint8Array(data.buffer);
        workerLog('[SunVox Worker] loadSong: slot=' + slot + ' size=' + buf.length);
        try {
          // Allocate in WASM heap and load from memory
          const mptr = svlib._malloc(buf.length);
          svlib.HEAPU8.set(buf, mptr);
          const rv = svlib._sv_load_from_memory(slot, mptr, buf.length);
          svlib._free(mptr);
          workerLog('[SunVox Worker] loadSong: sv_load_from_memory returned ' + rv);
        } catch (err) {
          workerLog('[SunVox Worker] loadSong EXCEPTION: ' + (err.stack || String(err)));
          self.postMessage({ type: 'error', message: '[loadSong] ' + String(err) });
          break;
        }

        const songName = svlib.UTF8ToString(svlib._sv_get_song_name(slot));
        const bpm      = svlib._sv_get_song_bpm(slot);
        const speed    = svlib._sv_get_song_tpl(slot);
        const patCount = svlib._sv_get_number_of_patterns(slot);

        // Set volume to max
        svlib._sv_volume(slot, 256);

        self.postMessage({ type: 'songLoaded', handle: slot, songName, bpm, speed, patCount });
        break;
      }

      case 'loadSynth': {
        const slot = data.handle;
        const buf = new Uint8Array(data.buffer);
        const mptr = svlib._malloc(buf.length);
        svlib.HEAPU8.set(buf, mptr);
        const moduleId = svlib._sv_load_module_from_memory(slot, mptr, buf.length, 0, 0, 0);
        svlib._free(mptr);
        // Auto-connect to output if it's a generator
        if (moduleId >= 0) {
          svlib._sv_connect_module(slot, moduleId, 0); // connect to Output
        }
        self.postMessage({ type: 'moduleLoaded', handle: slot, moduleId });
        break;
      }

      case 'saveSong': {
        const slot = data.handle;
        const sizeMptr = svlib._malloc(16);
        const mptr = svlib._sv_save_to_memory(slot, sizeMptr);
        const size = svlib.getValue(sizeMptr, 'i32');
        let ab = new ArrayBuffer(0);
        if (mptr && size > 0) {
          const src = svlib.HEAPU8.subarray(mptr, mptr + size);
          const copy = new Uint8Array(size);
          copy.set(src);
          ab = copy.buffer;
          svlib._free(mptr);
        }
        svlib._free(sizeMptr);
        self.postMessage({ type: 'songSaved', handle: slot, buffer: ab }, [ab]);
        break;
      }

      case 'saveSynth': {
        // Official API doesn't have per-module save — save entire song
        // TODO: implement proper module export if needed
        self.postMessage({ type: 'synthSaved', handle: data.handle, moduleId: data.moduleId, buffer: new ArrayBuffer(0) });
        break;
      }

      case 'getModules': {
        const slot = data.handle;
        const count = svlib._sv_get_number_of_modules(slot);
        const modules = [];
        for (let i = 0; i < count; i++) {
          const flags = svlib._sv_get_module_flags(slot, i);
          if (!(flags & SV_MODULE_FLAG_EXISTS)) continue;
          const name = svlib.UTF8ToString(svlib._sv_get_module_name(slot, i));
          modules.push({ id: i, name });
        }
        self.postMessage({ type: 'modules', handle: slot, modules });
        break;
      }

      case 'getPatterns': {
        const slot = data.handle;
        const patCount = svlib._sv_get_number_of_patterns(slot);
        const patterns = [];
        for (let p = 0; p < patCount; p++) {
          const tracks = svlib._sv_get_pattern_tracks(slot, p);
          const lines  = svlib._sv_get_pattern_lines(slot, p);
          if (tracks <= 0 || lines <= 0) continue;
          const x = svlib._sv_get_pattern_x(slot, p);
          // Read pattern data: 8 bytes per event (NN VV MM MM EE CC YY XX)
          const dataPtr = svlib._sv_get_pattern_data(slot, p);
          const notes = [];
          if (dataPtr) {
            const heap = svlib.HEAPU8;
            for (let t = 0; t < tracks; t++) {
              const trackNotes = [];
              for (let l = 0; l < lines; l++) {
                const off = dataPtr + (l * tracks + t) * 8;
                const nn = heap[off];
                const vv = heap[off + 1];
                const mm = heap[off + 2] | (heap[off + 3] << 8); // module (16-bit)
                const ccee = heap[off + 4] | (heap[off + 5] << 8);
                const xxyy = heap[off + 6] | (heap[off + 7] << 8);
                trackNotes.push({
                  note:   nn,
                  vel:    vv,
                  module: mm > 0 ? mm - 1 : -1, // convert from 1-indexed to 0-indexed
                  ctl:    ccee,
                  ctlVal: xxyy,
                });
              }
              notes.push(trackNotes);
            }
          }
          patterns.push({ patIndex: p, x, tracks, lines, notes });
        }
        self.postMessage({ type: 'patterns', handle: slot, patterns });
        break;
      }

      case 'getControls': {
        const slot = data.handle;
        const modId = data.moduleId;
        const count = svlib._sv_get_number_of_module_ctls(slot, modId);
        const controls = [];
        for (let i = 0; i < count; i++) {
          controls.push({
            id:   i,
            name: svlib.UTF8ToString(svlib._sv_get_module_ctl_name(slot, modId, i)),
            min:  svlib._sv_get_module_ctl_min(slot, modId, i, 0),
            max:  svlib._sv_get_module_ctl_max(slot, modId, i, 0),
            value: svlib._sv_get_module_ctl_value(slot, modId, i, 0),
          });
        }
        self.postMessage({ type: 'controls', handle: slot, moduleId: modId, controls });
        break;
      }

      case 'play':
        svlib._sv_play_from_beginning(data.handle);
        break;

      case 'stop':
        svlib._sv_stop(data.handle);
        break;

      case 'noteOn':
        // sv_send_event(slot, track, note, vel, module+1, ctl, ctl_val)
        svlib._sv_send_event(data.handle, 0, data.note, data.vel, data.moduleId + 1, 0, 0);
        break;

      case 'noteOff':
        svlib._sv_send_event(data.handle, 0, 128, 0, data.moduleId + 1, 0, 0);
        break;

      case 'setControl': {
        const ctlHigh = (data.ctlId + 1) << 8;
        svlib._sv_send_event(data.handle, 0, 0, 0, data.moduleId + 1, ctlHigh, data.value);
        break;
      }

      // ── Module/connection CRUD for modular editor ──────────────────────────

      case 'newModule': {
        const slot = data.handle;
        const typeStr = data.moduleType; // e.g. "Analog generator", "Filter"
        // Encode type string to WASM heap
        const typeBytes = new TextEncoder().encode(typeStr + '\0');
        const typeMptr = svlib._malloc(typeBytes.length);
        svlib.HEAPU8.set(typeBytes, typeMptr);
        svlib._sv_lock_slot(slot);
        const newModId = svlib._sv_new_module(slot, typeMptr, 0, 0, 0);
        svlib._sv_unlock_slot(slot);
        svlib._free(typeMptr);
        self.postMessage({ type: 'moduleCreated', handle: slot, moduleId: newModId });
        break;
      }

      case 'removeModule': {
        const slot = data.handle;
        svlib._sv_lock_slot(slot);
        svlib._sv_remove_module(slot, data.moduleId);
        svlib._sv_unlock_slot(slot);
        self.postMessage({ type: 'moduleRemoved', handle: slot, moduleId: data.moduleId });
        break;
      }

      case 'connectModules': {
        const slot = data.handle;
        svlib._sv_lock_slot(slot);
        const rv = svlib._sv_connect_module(slot, data.sourceId, data.destId);
        svlib._sv_unlock_slot(slot);
        self.postMessage({ type: 'modulesConnected', handle: slot, sourceId: data.sourceId, destId: data.destId, result: rv });
        break;
      }

      case 'disconnectModules': {
        const slot = data.handle;
        svlib._sv_lock_slot(slot);
        const rv = svlib._sv_disconnect_module(slot, data.sourceId, data.destId);
        svlib._sv_unlock_slot(slot);
        self.postMessage({ type: 'modulesDisconnected', handle: slot, sourceId: data.sourceId, destId: data.destId, result: rv });
        break;
      }

      case 'setModuleControl': {
        const slot = data.handle;
        svlib._sv_module_set_ctl_value(slot, data.moduleId, data.ctlId, data.value, 0);
        self.postMessage({ type: 'moduleControlSet', handle: slot, moduleId: data.moduleId, ctlId: data.ctlId });
        break;
      }

      case 'getModuleGraph': {
        const slot = data.handle;
        const count = svlib._sv_get_number_of_modules(slot);
        const graphModules = [];
        for (let i = 0; i < count; i++) {
          const flags = svlib._sv_get_module_flags(slot, i);
          if (!(flags & SV_MODULE_FLAG_EXISTS)) continue;
          const name = svlib.UTF8ToString(svlib._sv_get_module_name(slot, i));
          // Get module type
          const typePtr = svlib._sv_get_module_type(slot, i);
          const typeName = typePtr ? svlib.UTF8ToString(typePtr) : '';
          // Get connections — input/output counts are encoded in module flags
          // SunVox API: (flags >> 8) & 0xFF = number of output links
          //             (flags >> 16) & 0xFF = number of input links
          const numInputLinks = (flags >> 16) & 0xFF;
          const numOutputLinks = (flags >> 8) & 0xFF;
          const inputs = [];
          if (numInputLinks > 0) {
            const inputsPtr = svlib._sv_get_module_inputs(slot, i);
            if (inputsPtr) {
              for (let j = 0; j < numInputLinks; j++) {
                const connId = svlib.getValue(inputsPtr + j * 4, 'i32');
                if (connId >= 0) inputs.push(connId);
              }
            }
          }
          const outputs = [];
          if (numOutputLinks > 0) {
            const outputsPtr = svlib._sv_get_module_outputs(slot, i);
            if (outputsPtr) {
              for (let j = 0; j < numOutputLinks; j++) {
                const connId = svlib.getValue(outputsPtr + j * 4, 'i32');
                if (connId >= 0) outputs.push(connId);
              }
            }
          }
          // Get controls
          const ctlCount = svlib._sv_get_number_of_module_ctls(slot, i);
          const controls = [];
          for (let c = 0; c < ctlCount; c++) {
            controls.push({
              id: c,
              name: svlib.UTF8ToString(svlib._sv_get_module_ctl_name(slot, i, c)),
              min: svlib._sv_get_module_ctl_min(slot, i, c, 0),
              max: svlib._sv_get_module_ctl_max(slot, i, c, 0),
              value: svlib._sv_get_module_ctl_value(slot, i, c, 0),
            });
          }
          graphModules.push({ id: i, name, typeName, flags, inputs, outputs, controls });
        }
        self.postMessage({ type: 'moduleGraph', handle: slot, modules: graphModules });
        break;
      }

      default:
        workerLog('[SunVox Worker] Unknown message type: ' + data.type);
    }
  } catch (err) {
    workerLog('[SunVox Worker] Message handler error: ' + (err.stack || String(err)));
    self.postMessage({ type: 'error', message: String(err) });
  }
};
