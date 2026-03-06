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

  initialized = true;

  self.postMessage({ type: 'ready', sampleRate: actualRate, handle: handle });

  // Start rendering audio to SAB ring buffer
  console.log('[Gearmulator Worker] Starting render loop...');
  startRenderLoop(actualRate);
}

function startRenderLoop(sampleRate) {
  // Target: keep ring buffer ~50% full
  // Render in RENDER_BLOCK chunks, check frequently
  const intervalMs = Math.max(1, Math.floor((RENDER_BLOCK / sampleRate) * 1000 * 0.5));

  // Diagnostic: check ESAI status after first render
  console.log('[Gearmulator Worker] Diagnostic timer starting (2s interval)...');
  const diagTimer = setInterval(() => {
    console.log('[Gearmulator Worker DIAG] Timer fired');
    if (!module || handle < 0) {
      console.log('[Gearmulator Worker DIAG] Timer cleared: module=' + !!module + ', handle=' + handle);
      clearInterval(diagTimer);
      return;
    }
    const inSize = module._gm_getAudioInputSize(handle);
    const outSize = module._gm_getAudioOutputSize(handle);
    console.log(`[Gearmulator Worker DIAG] audioIn=${inSize}, audioOut=${outSize}`);
    if (outSize > 0) {
      console.log('[Gearmulator Worker DIAG] ✓ ESAI producing output!');
    }
  }, 2000); // Every 2 seconds during first 10 seconds
  setTimeout(() => clearInterval(diagTimer), 10000);

  renderTimer = setInterval(() => {
    if (!initialized || handle < 0 || !module || disposed) return;
    fillRingBuffer();
  }, intervalMs);

  // Also do an initial fill
  fillRingBuffer();
}

function fillRingBuffer() {
  const bufSize = Atomics.load(sabInt32, 2);
  let writePos = Atomics.load(sabInt32, 0);
  let readPos = Atomics.load(sabInt32, 1);

  // How many frames are available (free space)?
  let used = writePos - readPos;
  if (used < 0) used += bufSize;
  let free = bufSize - used - 1; // -1 to distinguish full from empty

  // Render until buffer is at least 75% full or no more free space
  const target = Math.floor(bufSize * 0.75);
  let rendered = 0;

  while (used + rendered < target && free > RENDER_BLOCK) {
    // Render one block
    if (renderDebugCounter < 3) {
      console.log(`[Gearmulator Worker] Calling _gm_process #${renderDebugCounter} (${RENDER_BLOCK} samples)...`);
    }
    module._gm_process(handle, outputPtrL, outputPtrR, RENDER_BLOCK);
    if (renderDebugCounter < 3) {
      console.log(`[Gearmulator Worker] _gm_process #${renderDebugCounter} returned`);
    }

    // Read from WASM heap
    const heapF32 = module.HEAPF32;
    const offL = outputPtrL >> 2;
    const offR = outputPtrR >> 2;

    // Debug: check for non-zero audio (log occasionally)
    if (renderDebugCounter++ % 500 === 0) {
      let peak = 0;
      for (let i = 0; i < RENDER_BLOCK; i++) {
        const v = Math.abs(heapF32[offL + i]);
        if (v > peak) peak = v;
      }
      console.log(`[Gearmulator Worker] render #${renderDebugCounter}: peak=${peak.toFixed(6)}, writePos=${writePos}, readPos=${readPos}, used=${used}, free=${free}`);
    }

    // Write interleaved L/R into ring buffer
    const audioOffset = HEADER_INTS; // Float32 offset for audio data start
    for (let i = 0; i < RENDER_BLOCK; i++) {
      const frameIdx = (writePos + i) % bufSize;
      const idx = audioOffset + frameIdx * 2;
      sabFloat32[idx] = heapF32[offL + i];
      sabFloat32[idx + 1] = heapF32[offR + i];
    }

    writePos = (writePos + RENDER_BLOCK) % bufSize;
    Atomics.store(sabInt32, 0, writePos);

    rendered += RENDER_BLOCK;
    free -= RENDER_BLOCK;
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
