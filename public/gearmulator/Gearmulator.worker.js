/**
 * Gearmulator DSP Worker
 *
 * Runs the DSP56300 emulator (Emscripten+pthreads) in a regular Web Worker.
 * Writes audio output into a SharedArrayBuffer ring buffer that the
 * AudioWorklet reads from.
 *
 * Message protocol (from main thread):
 *   { type: 'init', sampleRate, wasmBinary, jsCode, romData, synthType, sab }
 *   { type: 'noteOn', note, velocity, channel }
 *   { type: 'noteOff', note, channel }
 *   { type: 'cc', cc, value, channel }
 *   { type: 'programChange', program, channel }
 *   { type: 'sysex', data (ArrayBuffer) }
 *   { type: 'setClockPercent', percent }
 *   { type: 'getState' }
 *   { type: 'setState', data (ArrayBuffer) }
 *   { type: 'dispose' }
 *
 * SharedArrayBuffer layout (SAB):
 *   Int32[0] = writePos (atomic, worker writes)
 *   Int32[1] = readPos  (atomic, worklet writes)
 *   Int32[2] = bufferSize (in frames, set once during init)
 *   Float32[HEADER_INTS .. HEADER_INTS + bufferSize*2] = interleaved L/R audio
 */

const HEADER_BYTES = 16; // 4 Int32s (writePos, readPos, bufferSize, flags)
const HEADER_INTS = HEADER_BYTES / 4;
const RING_FRAMES = 8192; // ~186ms at 44100Hz — enough to absorb jitter

let module = null;
let handle = -1;
let initialized = false;
let disposed = false;

// SAB views
let sabInt32 = null;
let sabFloat32 = null;

// Internal render buffer
const RENDER_BLOCK = 128; // match WebAudio quantum
let outputPtrL = 0;
let outputPtrR = 0;

// DSP render loop interval
let renderTimer = null;
let renderDebugCounter = 0;

// Catch unhandled errors
self.onerror = function(e) {
  console.error('[Gearmulator Worker] Unhandled error:', e);
  self.postMessage({ type: 'error', message: `Unhandled: ${e.message || e}` });
};

self.onmessage = async function (e) {
  const data = e.data;

  switch (data.type) {
    case 'init':
      try {
        await initSynth(data);
      } catch (err) {
        console.error('[Gearmulator Worker] Init error:', err);
        self.postMessage({ type: 'error', message: String(err) });
      }
      break;

    case 'noteOn':
      if (handle >= 0 && module) {
        const status = 0x90 | ((data.channel || 0) & 0x0f);
        module._gm_sendMidi(handle, status, data.note & 0x7f, (data.velocity || 100) & 0x7f);
      }
      break;

    case 'noteOff':
      if (handle >= 0 && module) {
        const status = 0x80 | ((data.channel || 0) & 0x0f);
        module._gm_sendMidi(handle, status, data.note & 0x7f, 0);
      }
      break;

    case 'cc':
      if (handle >= 0 && module) {
        const status = 0xb0 | ((data.channel || 0) & 0x0f);
        module._gm_sendMidi(handle, status, data.cc & 0x7f, data.value & 0x7f);
      }
      break;

    case 'programChange':
      if (handle >= 0 && module) {
        const status = 0xc0 | ((data.channel || 0) & 0x0f);
        module._gm_sendMidi(handle, status, data.program & 0x7f, 0);
      }
      break;

    case 'sysex':
      if (handle >= 0 && module && data.data) {
        const buf = new Uint8Array(data.data);
        const ptr = module._malloc(buf.length);
        module.HEAPU8.set(buf, ptr);
        module._gm_sendSysex(handle, ptr, buf.length);
        module._free(ptr);
      }
      break;

    case 'setClockPercent':
      if (handle >= 0 && module) {
        module._gm_setDspClockPercent(handle, data.percent || 100);
      }
      break;

    case 'getState':
      if (handle >= 0 && module) {
        const size = module._gm_getState(handle, 0, 0);
        if (size > 0) {
          const ptr = module._malloc(size);
          module._gm_getState(handle, ptr, size);
          const state = new Uint8Array(module.HEAPU8.buffer, ptr, size).slice();
          module._free(ptr);
          self.postMessage({ type: 'state', data: state.buffer }, [state.buffer]);
        }
      }
      break;

    case 'setState':
      if (handle >= 0 && module && data.data) {
        const buf = new Uint8Array(data.data);
        const ptr = module._malloc(buf.length);
        module.HEAPU8.set(buf, ptr);
        module._gm_setState(handle, ptr, buf.length);
        module._free(ptr);
      }
      break;

    case 'dispose':
      dispose();
      break;
  }
};

async function initSynth(data) {
  const { sampleRate: sr, wasmBinary, jsCode, romData, synthType, sab } = data;

  console.log('[Gearmulator Worker] initSynth called', {
    hasJsCode: !!jsCode, jsCodeLen: jsCode?.length,
    hasWasmBinary: !!wasmBinary, wasmSize: wasmBinary?.byteLength,
    hasRomData: !!romData, romSize: romData?.byteLength,
    synthType, sampleRate: sr, hasSab: !!sab,
  });

  if (!wasmBinary || !romData) {
    throw new Error('Missing wasmBinary or romData');
  }

  // Set up SharedArrayBuffer views
  sabInt32 = new Int32Array(sab);
  sabFloat32 = new Float32Array(sab);
  Atomics.store(sabInt32, 0, 0); // writePos
  Atomics.store(sabInt32, 1, 0); // readPos
  Atomics.store(sabInt32, 2, RING_FRAMES);

  // Load Emscripten JS directly from server URL so pthreads sub-workers
  // can re-load it using the same URL (mainScriptUrlOrBlob)
  const emscriptenUrl = '/gearmulator/gearmulator_wasm.js';
  console.log('[Gearmulator Worker] importScripts from server URL...');
  importScripts(emscriptenUrl);
  console.log('[Gearmulator Worker] importScripts done, typeof createGearmulator =', typeof createGearmulator);

  if (typeof createGearmulator !== 'function') {
    throw new Error('createGearmulator not found after importScripts — check Emscripten JS glue');
  }

  const config = {
    wasmBinary,
    mainScriptUrlOrBlob: emscriptenUrl,
    locateFile: (path) => {
      if (path.endsWith('.wasm')) return '/gearmulator/gearmulator_wasm.wasm';
      return path;
    },
    // Suppress Emscripten's verbose stdout/stderr
    print: (text) => { if (!text.includes('TSMB') && !text.includes('ESSI')) console.log('[EM]', text); },
    printErr: (text) => { if (!text.includes('TSMB') && !text.includes('ESSI')) console.warn('[EM]', text); },
  };

  console.log('[Gearmulator Worker] Creating Emscripten module (await)...');
  module = await createGearmulator(config);
  console.log('[Gearmulator Worker] Emscripten module READY');

  // Allocate render buffers in WASM heap
  outputPtrL = module._malloc(RENDER_BLOCK * 4);
  outputPtrR = module._malloc(RENDER_BLOCK * 4);

  // Load ROM and create device
  console.log('[Gearmulator Worker] Loading ROM into WASM heap...');
  const rom = new Uint8Array(romData);
  const romPtr = module._malloc(rom.length);
  module.HEAPU8.set(rom, romPtr);

  console.log('[Gearmulator Worker] Creating device (type=' + synthType + ', sr=' + sr + ')...');
  handle = module._gm_create(romPtr, rom.length, synthType || 0, sr || 44100);
  module._free(romPtr);

  if (handle < 0) {
    throw new Error(`Failed to create synth device (type=${synthType})`);
  }

  const valid = module._gm_isValid(handle);
  console.log('[Gearmulator Worker] Device handle=' + handle + ', valid=' + valid);
  if (!valid) {
    throw new Error('Device created but not valid — check ROM data');
  }

  const actualRate = module._gm_getSamplerate(handle);
  console.log(`[Gearmulator Worker] Device ready — handle=${handle}, sampleRate=${actualRate}, type=${synthType}`);

  // Reduce DSP clock for WASM interpreter performance
  // 10% → cyclesPerSample=115 (enough for ISR handlers, ~334Hz timer rate)
  // Lower values cause ESAI transmit underruns (ISR can't complete in time)
  const clockPercent = 10;
  module._gm_setDspClockPercent(handle, clockPercent);
  console.log(`[Gearmulator Worker] DSP clock set to ${clockPercent}% (cyclesPerSample ~${Math.round(1152 * clockPercent / 100)})`);

  initialized = true;

  self.postMessage({ type: 'ready', sampleRate: actualRate, handle: handle });

  // Start rendering audio to SAB ring buffer
  console.log('[Gearmulator Worker] Starting render loop...');
  startRenderLoop(actualRate);
}

function startRenderLoop(sampleRate) {
  // Use blocking gm_process() — the standard Device::process() path that handles
  // all DSP thread synchronization internally. Render small chunks with setTimeout
  // to let the worker event loop breathe for message handling.
  console.log('[Gearmulator Worker] Starting blocking render loop (gm_process)...');

  function renderTick() {
    if (!initialized || handle < 0 || !module || disposed) return;
    fillRingBuffer();
    // Use setTimeout(0) to yield to the event loop between render passes
    renderTimer = setTimeout(renderTick, 0);
  }
  renderTick();
}

function fillRingBuffer() {
  const bufSize = Atomics.load(sabInt32, 2);
  let writePos = Atomics.load(sabInt32, 0);
  let readPos = Atomics.load(sabInt32, 1);

  let used = writePos - readPos;
  if (used < 0) used += bufSize;
  let free = bufSize - used - 1;

  // Render up to 16 blocks per tick (2048 samples) to reduce setTimeout overhead
  // With clock at 10%, each block is much faster so we can batch more
  const maxBlocks = Math.min(16, Math.floor(free / RENDER_BLOCK));

  for (let b = 0; b < maxBlocks; b++) {
    module._gm_process(handle, outputPtrL, outputPtrR, RENDER_BLOCK);

    const heapF32 = module.HEAPF32;
    const offL = outputPtrL >> 2;
    const offR = outputPtrR >> 2;

    // Debug: log peak every 500 blocks
    if (renderDebugCounter++ % 500 === 0) {
      let peak = 0;
      for (let i = 0; i < RENDER_BLOCK; i++) {
        const v = Math.abs(heapF32[offL + i]);
        if (v > peak) peak = v;
        const vr = Math.abs(heapF32[offR + i]);
        if (vr > peak) peak = vr;
      }
      console.log(`[Gearmulator Worker] render #${renderDebugCounter}: peak=${peak.toFixed(6)}, writePos=${writePos}, used=${used}, free=${free}`);
    }

    // Write interleaved L/R into ring buffer
    const audioOffset = HEADER_INTS;
    for (let i = 0; i < RENDER_BLOCK; i++) {
      const frameIdx = (writePos + i) % bufSize;
      const idx = audioOffset + frameIdx * 2;
      sabFloat32[idx] = heapF32[offL + i];
      sabFloat32[idx + 1] = heapF32[offR + i];
    }

    writePos = (writePos + RENDER_BLOCK) % bufSize;
    Atomics.store(sabInt32, 0, writePos);
  }
}

// Non-blocking version: push input and pull any available output
function fillRingBufferNonBlocking() {
  const bufSize = Atomics.load(sabInt32, 2);
  let writePos = Atomics.load(sabInt32, 0);
  let readPos = Atomics.load(sabInt32, 1);

  let used = writePos - readPos;
  if (used < 0) used += bufSize;
  let free = bufSize - used - 1;

  // Push input to keep DSP fed (non-blocking)
  const inputToPush = Math.min(RENDER_BLOCK * 4, 1024);
  const pushed = module._gm_pushAudioInput(handle, inputToPush);

  // Pull any available output (non-blocking)
  let totalRead = 0;
  while (free > RENDER_BLOCK) {
    const read = module._gm_pullAudioOutput(handle, outputPtrL, outputPtrR, RENDER_BLOCK);
    if (read <= 0) break;

    // Write to SAB ring buffer
    const heapF32 = module.HEAPF32;
    const offL = outputPtrL >> 2;
    const offR = outputPtrR >> 2;
    const audioOffset = HEADER_INTS;

    for (let i = 0; i < read; i++) {
      const frameIdx = (writePos + i) % bufSize;
      const idx = audioOffset + frameIdx * 2;
      sabFloat32[idx] = heapF32[offL + i];
      sabFloat32[idx + 1] = heapF32[offR + i];
    }

    writePos = (writePos + read) % bufSize;
    Atomics.store(sabInt32, 0, writePos);

    totalRead += read;
    free -= read;
  }

  if (renderDebugCounter++ % 500 === 0) {
    console.log(`[Gearmulator Worker NB] pushed=${pushed}, pulled=${totalRead}, writePos=${writePos}, free=${free}`);
  }
}

function dispose() {
  disposed = true;
  if (renderTimer) {
    clearInterval(renderTimer);
    renderTimer = null;
  }
  if (handle >= 0 && module) {
    module._gm_destroy(handle);
    handle = -1;
  }
  if (outputPtrL && module) {
    module._free(outputPtrL);
    outputPtrL = 0;
  }
  if (outputPtrR && module) {
    module._free(outputPtrR);
    outputPtrR = 0;
  }
  initialized = false;
}
