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

const HEADER_BYTES = 16; // 4 Int32s (writePos, readPos, bufferSize, peakx1000)
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

// Diagnostics
let totalFramesRendered = 0;
let firstAudioTime = 0;
let peakSeen = 0;

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
        console.log(`[Gearmulator Worker] MIDI NoteOn ch=${data.channel||0} note=${data.note} vel=${data.velocity||100}`);
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
  importScripts(emscriptenUrl);

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
    // Suppress Emscripten's verbose stdout/stderr but show important messages
    print: (text) => {
      if (text.includes('[EM]') || text.includes('Factory reset') || text.includes('boot') || text.includes('ERROR') || text.includes('error') || text.includes('snapshot') || text.includes('ESAI') || text.includes('MIPS'))
        console.log('[EM]', text);
    },
    printErr: (text) => {
      if (!text.includes('TSMB') && !text.includes('ESSI'))
        console.warn('[EM]', text);
    },
  };

  console.log(`[Gearmulator Worker] Creating Emscripten module (WASM=${(wasmBinary.byteLength/1024).toFixed(0)}KB)...`);
  module = await createGearmulator(config);
  console.log('[Gearmulator Worker] Emscripten module ready.');

  // Allocate render buffers in WASM heap
  outputPtrL = module._malloc(RENDER_BLOCK * 4);
  outputPtrR = module._malloc(RENDER_BLOCK * 4);

  const rom = new Uint8Array(romData);
  const romPtr = module._malloc(rom.length);
  module.HEAPU8.set(rom, romPtr);

  // JP-8000 (type 5): pre-load factory reset RAM dump to skip slow WASM factory reset
  if ((synthType || 0) === 5) {
    try {
      console.log('[Gearmulator Worker] Loading JP-8000 RAM dump...');
      const ramResp = await fetch('/gearmulator/jp8000_ram_dump.bin');
      if (ramResp.ok) {
        const ramBuf = new Uint8Array(await ramResp.arrayBuffer());
        const ramPtr = module._malloc(ramBuf.length);
        module.HEAPU8.set(ramBuf, ramPtr);
        module._gm_loadJP8kRam(ramPtr, ramBuf.length);
        module._free(ramPtr);
        console.log('[Gearmulator Worker] JP-8000 RAM dump loaded:', ramBuf.length, 'bytes');
      } else {
        console.warn('[Gearmulator Worker] JP-8000 RAM dump not found, factory reset will run (slow!)');
      }
    } catch (e) {
      console.warn('[Gearmulator Worker] Failed to load JP-8000 RAM dump:', e);
    }
  }

  console.log(`[Gearmulator Worker] gm_create(romSize=${rom.length}, type=${synthType}, rate=${sr||44100})...`);
  const t0 = performance.now();

  // XT (3) and Nord (4) take 10+ min in WASM interpreter mode. Use async boot
  // so the Worker stays responsive. microQ (2) has pre-boot snapshot — fast sync boot.
  const useAsyncBoot = (synthType === 3 || synthType === 4);

  if (useAsyncBoot) {
    module._gm_create_async(romPtr, rom.length, synthType, sr || 44100);
    module._free(romPtr);

    console.log('[Gearmulator Worker] Async boot started — polling for completion...');
    self.postMessage({ type: 'booting', synthType });

    // Poll every 500ms until boot completes
    let pollCount = 0;
    await new Promise((resolve, reject) => {
      const poll = () => {
        if (disposed) { reject(new Error('Disposed during boot')); return; }
        if (module._gm_is_boot_done()) {
          handle = module._gm_get_async_result();
          if (handle < 0) reject(new Error(`Async boot failed (type=${synthType})`));
          else resolve();
        } else {
          pollCount++;
          if (pollCount % 60 === 0) { // Log every 30s
            console.log(`[Gearmulator Worker] Still booting... (${(pollCount * 0.5).toFixed(0)}s)`);
            self.postMessage({ type: 'booting', synthType, elapsed: pollCount * 500 });
          }
          setTimeout(poll, 500);
        }
      };
      poll();
    });
  } else {
    handle = module._gm_create(romPtr, rom.length, synthType || 0, sr || 44100);
    module._free(romPtr);
  }

  const createMs = (performance.now() - t0).toFixed(0);

  if (handle < 0) {
    throw new Error(`Failed to create synth device (type=${synthType}) — gm_create returned ${handle}`);
  }

  const valid = module._gm_isValid(handle);
  if (!valid) {
    throw new Error('Device created but not valid — check ROM data');
  }

  const actualRate = module._gm_getSamplerate(handle);
  console.log(`[Gearmulator Worker] Device created in ${createMs}ms — handle=${handle}, rate=${actualRate}, valid=${valid}`);

  // Full speed for WASM interpreter
  module._gm_setDspClockPercent(handle, 100);

  initialized = true;
  totalFramesRendered = 0;
  peakSeen = 0;
  firstAudioTime = 0;

  // For snapshot-booted synths (microQ=2), the DSP is running but MC68K firmware
  // is still initializing in the background. Start the render loop immediately
  // (DSP produces silence until boot completes), but wait for boot completion
  // before reporting 'ready' so the caller knows MIDI will actually work.
  const needsBootWait = (synthType === 2);

  if (needsBootWait) {
    // Check if boot is already complete (FullSnapshot mode completes during gm_create)
    let alreadyBooted = false;
    try {
      alreadyBooted = !!module._gm_isBootCompleted(handle);
      console.log(`[Gearmulator Worker] Initial boot check: ${alreadyBooted ? 'already complete' : 'still booting'}`);
    } catch (e) {
      console.error('[Gearmulator Worker] gm_isBootCompleted threw:', e);
    }

    // Start render loop — DSP needs processAudio calls to produce output
    startRenderLoop(actualRate);

    if (!alreadyBooted) {
      console.log('[Gearmulator Worker] Waiting for MC68K firmware boot to complete...');
      self.postMessage({ type: 'booting', synthType });

      let bootPollCount = 0;
      const maxBootPollCount = 600; // 5 minutes max (600 * 500ms)
      await new Promise((resolve) => {
        const pollBoot = () => {
          if (disposed) { resolve(); return; }
          try {
            if (module._gm_isBootCompleted(handle)) {
              const bootMs = (performance.now() - t0).toFixed(0);
              console.log(`[Gearmulator Worker] MC68K boot completed in ${bootMs}ms`);
              resolve();
              return;
            }
          } catch (e) {
            console.error('[Gearmulator Worker] gm_isBootCompleted poll error:', e);
          }
          if (bootPollCount >= maxBootPollCount) {
            console.warn(`[Gearmulator Worker] MC68K boot timeout after ${(maxBootPollCount * 0.5).toFixed(0)}s — proceeding anyway`);
            resolve();
          } else {
            bootPollCount++;
            if (bootPollCount % 10 === 0) {
              const elapsed = (bootPollCount * 0.5).toFixed(0);
              console.log(`[Gearmulator Worker] MC68K still booting... (${elapsed}s)`);
              self.postMessage({ type: 'booting', synthType, elapsed: bootPollCount * 500 });
            }
            setTimeout(pollBoot, 500);
          }
        };
        pollBoot();
      });
    } else {
      console.log('[Gearmulator Worker] FullSnapshot boot — skipping wait');
    }
  }

  self.postMessage({ type: 'ready', sampleRate: actualRate, handle: handle });

  if (!needsBootWait) {
    startRenderLoop(actualRate);
  }
}

let ucTimer = null;
let hasUcProcessing = false;

function startRenderLoop(sampleRate) {
  let renderCount = 0;
  hasUcProcessing = !!(module._gm_processUc);

  function renderTick() {
    if (!initialized || handle < 0 || !module || disposed) return;

    const t0 = performance.now();
    fillRingBuffer();
    const renderMs = performance.now() - t0;

    // After rendering audio, run a small burst of MC68K cycles for MIDI processing.
    // This ensures audio always gets priority and UC gets remaining time budget.
    if (hasUcProcessing) {
      try {
        // Run 32 MC68K cycles with 1ms time limit — just enough to process
        // queued MIDI without starving the render loop
        module._gm_processUc(handle, 32, 1);
      } catch (e) {
        console.error('[Gearmulator Worker] ucTick error:', e);
        hasUcProcessing = false;
      }
    }

    const totalMs = performance.now() - t0;
    renderCount++;
    if (renderCount <= 5 || (renderCount % 1000 === 0)) {
      console.log(`[Gearmulator Worker] tick #${renderCount}: render=${renderMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms frames=${totalFramesRendered} peak=${peakSeen.toFixed(6)}`);
    }

    // Use setTimeout(0) to yield to the event loop between passes
    renderTimer = setTimeout(renderTick, 0);
  }
  // Schedule first tick async so startRenderLoop returns immediately
  renderTimer = setTimeout(renderTick, 0);
}

function fillRingBuffer() {
  const bufSize = Atomics.load(sabInt32, 2);
  let writePos = Atomics.load(sabInt32, 0);
  let readPos = Atomics.load(sabInt32, 1);

  let used = writePos - readPos;
  if (used < 0) used += bufSize;
  let free = bufSize - used - 1;

  // Render up to 4 blocks per tick (512 samples). Reduced from 16 because
  // microQ's inline processAudio blocks while DSP produces each block.
  const maxBlocks = Math.min(4, Math.floor(free / RENDER_BLOCK));

  for (let b = 0; b < maxBlocks; b++) {
    module._gm_process(handle, outputPtrL, outputPtrR, RENDER_BLOCK);

    const heapF32 = module.HEAPF32;
    const offL = outputPtrL >> 2;
    const offR = outputPtrR >> 2;

    // Write interleaved L/R into ring buffer
    const audioOffset = HEADER_INTS;
    for (let i = 0; i < RENDER_BLOCK; i++) {
      const frameIdx = (writePos + i) % bufSize;
      const idx = audioOffset + frameIdx * 2;
      const sL = heapF32[offL + i];
      const sR = heapF32[offR + i];
      sabFloat32[idx] = sL;
      sabFloat32[idx + 1] = sR;

      // Track peak for diagnostics
      const absL = sL < 0 ? -sL : sL;
      const absR = sR < 0 ? -sR : sR;
      if (absL > peakSeen) peakSeen = absL;
      if (absR > peakSeen) peakSeen = absR;
      if ((absL > 0.0001 || absR > 0.0001) && firstAudioTime === 0) {
        firstAudioTime = performance.now();
        console.log(`[Gearmulator Worker] First non-zero audio at frame ${totalFramesRendered + i} (${(firstAudioTime / 1000).toFixed(1)}s after worker start)`);
      }
    }

    writePos = (writePos + RENDER_BLOCK) % bufSize;
    Atomics.store(sabInt32, 0, writePos);
    totalFramesRendered += RENDER_BLOCK;
  }

  // Store running peak (x1000, as integer) in SAB slot 3 for test page visibility
  if (peakSeen > 0) {
    Atomics.store(sabInt32, 3, Math.round(peakSeen * 1000));
  }
}

function dispose() {
  disposed = true;
  if (renderTimer) {
    clearTimeout(renderTimer);
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
  console.log(`[Gearmulator Worker] Disposed. Total frames rendered: ${totalFramesRendered}, peak: ${peakSeen.toFixed(6)}`);
}
