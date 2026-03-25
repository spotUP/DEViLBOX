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
const RING_FRAMES = 32768; // ~700ms at 46875Hz — larger buffer for non-real-time DSP

let module = null;
let handle = -1;
let initialized = false;
let disposed = false;

// SAB views
let sabInt32 = null;
let sabFloat32 = null;

// Internal render buffer — larger blocks reduce JS↔WASM call overhead
const RENDER_BLOCK = 256;
let outputPtrL = 0;
let outputPtrR = 0;

// DSP render loop interval
let renderTimer = null;

// Diagnostics
let totalFramesRendered = 0;
let firstAudioTime = 0;
let peakSeen = 0;

// Auto-calibration state
let currentClockPercent = 10; // Start conservative — auto-calibration adjusts
let calibrationDone = false;
let calibrationStartTime = 0;
let calibrationStartFrames = 0;
let currentSynthType = 0;
let currentSampleRate = 44100;

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
        const pct = Math.max(1, Math.min(100, data.percent || 100));
        currentClockPercent = pct;
        calibrationDone = true; // Manual override disables auto-calibration
        module._gm_setDspClockPercent(handle, pct);
        console.log(`[Gearmulator Worker] Clock set to ${pct}% (manual override)`);
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

    case 'renderOffline':
      if (handle >= 0 && module) {
        renderOffline(data);
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

  currentSynthType = synthType || 0;
  currentSampleRate = sr || 44100;

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
      if (text.includes('ERROR') || text.includes('error') || text.includes('snapshot') || text.includes('boot') || text.includes('Factory reset') || text.includes('OOB') || text.includes('DSP'))
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
  currentSampleRate = actualRate || currentSampleRate;
  console.log(`[Gearmulator Worker] Device created in ${createMs}ms — handle=${handle}, rate=${actualRate}, valid=${valid}`);

  // Start with reduced clock speed — the DSP56300 interpreter in WASM runs at
  // ~5.5% real-time at 100% clock. Auto-calibration will find the optimal value.
  // JP-8000 (type 5) doesn't support clock adjustment, leave at 100%.
  if (synthType === 5) {
    currentClockPercent = 100;
    calibrationDone = true; // No calibration for JP-8000
  } else {
    currentClockPercent = 100;
    calibrationDone = true; // Must be 100% for correct synthesis — slower than real-time but sounds right
  }
  module._gm_setDspClockPercent(handle, currentClockPercent);
  console.log(`[Gearmulator Worker] Initial clock: ${currentClockPercent}%`);

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

  // Reset calibration state
  calibrationStartTime = performance.now();
  calibrationStartFrames = totalFramesRendered;

  // Pre-fill the ring buffer before starting the render loop.
  // This ensures the worklet has audio available immediately, reducing initial underruns.
  console.log('[Gearmulator Worker] Pre-filling ring buffer...');
  const prefillTarget = Math.floor(RING_FRAMES * 0.5); // Fill to 50%
  let prefillFrames = 0;
  const prefillStart = performance.now();
  while (prefillFrames < prefillTarget && !disposed) {
    const before = totalFramesRendered;
    fillRingBuffer();
    const rendered = totalFramesRendered - before;
    if (rendered === 0) break; // Buffer full or no progress
    prefillFrames += rendered;
  }
  const prefillMs = (performance.now() - prefillStart).toFixed(0);
  console.log(`[Gearmulator Worker] Pre-filled ${prefillFrames} frames in ${prefillMs}ms`);
  self.postMessage({ type: 'prefilled', frames: prefillFrames });

  // Reset calibration timing after pre-fill
  calibrationStartTime = performance.now();
  calibrationStartFrames = totalFramesRendered;

  function renderTick() {
    if (!initialized || handle < 0 || !module || disposed) return;

    const t0 = performance.now();

    // Render multiple fills per tick to maximize buffer level.
    // At 10% clock we're ~50% real-time, so we need to render as much as
    // possible per yield to keep the buffer from draining completely.
    const bufSize = Atomics.load(sabInt32, 2);
    let fills = 0;
    const maxFillTime = 200;
    const targetFill = Math.floor(bufSize * 0.6); // Don't fill past 60% — leave headroom
    while (fills < 16) {
      const wp = Atomics.load(sabInt32, 0);
      const rp = Atomics.load(sabInt32, 1);
      let used = wp - rp;
      if (used < 0) used += bufSize;
      if (used >= targetFill) break; // Buffer sufficiently full
      const free = bufSize - used - 1;
      if (free < RENDER_BLOCK) break;
      fillRingBuffer();
      fills++;
      if (performance.now() - t0 > maxFillTime) break;
    }

    const renderMs = performance.now() - t0;

    // After rendering audio, run a small burst of MC68K cycles for MIDI processing.
    if (hasUcProcessing) {
      try {
        module._gm_processUc(handle, 32, 1);
      } catch (e) {
        console.error('[Gearmulator Worker] ucTick error:', e);
        hasUcProcessing = false;
      }
    }

    const totalMs = performance.now() - t0;
    renderCount++;

    // Auto-calibration: after 5 ticks, measure real-time ratio and adjust clock
    if (!calibrationDone && renderCount === 5) {
      autoCalibrateClock();
    }

    // Periodic re-calibration every 500 ticks to adapt to changing conditions
    if (!calibrationDone && renderCount > 5 && renderCount % 500 === 0) {
      autoCalibrateClock();
    }

    if (renderCount <= 3 || (renderCount % 5000 === 0)) {
      console.log(`[Gearmulator Worker] tick #${renderCount}: render=${renderMs.toFixed(1)}ms frames=${totalFramesRendered} peak=${peakSeen.toFixed(6)} clock=${currentClockPercent}% fills=${fills}`);
    }

    // Use setTimeout(0) to yield to the event loop for MIDI messages
    renderTimer = setTimeout(renderTick, 0);
  }
  // Schedule first tick async so startRenderLoop returns immediately
  renderTimer = setTimeout(renderTick, 0);
}

/**
 * Auto-calibrate DSP clock speed based on measured real-time ratio.
 * Target: ~90% real-time (0.9 ratio) — leaves 10% headroom for jitter.
 */
function autoCalibrateClock() {
  const wallMs = performance.now() - calibrationStartTime;
  const framesRendered = totalFramesRendered - calibrationStartFrames;
  if (wallMs < 100 || framesRendered < 256) return; // Not enough data

  const audioMs = (framesRendered / currentSampleRate) * 1000;
  const ratio = audioMs / wallMs; // 1.0 = perfect real-time

  // Calculate target clock percent to achieve ~0.9 ratio.
  // IMPORTANT: Lower clock % = fewer DSP cycles per sample = faster render = higher ratio.
  // So the relationship is INVERSE: to increase ratio, we must DECREASE clock%.
  // ratio = audioMs/wallMs. If ratio < target, we're too slow → decrease clock.
  // newClock = currentClock * (ratio / targetRatio)
  // Target 0.5 (50% real-time) — leaves enough DSP cycles for MIDI processing.
  // At 100% clock the interpreter is ~5.5% real-time. We want to lower the clock
  // enough for usable (if choppy) playback while keeping MIDI responsive.
  const targetRatio = 0.5;
  let newClock = Math.round(currentClockPercent * (ratio / targetRatio));

  // Clamp to reasonable range
  newClock = Math.max(8, Math.min(100, newClock));

  // Only change if difference is significant (> 1%)
  if (Math.abs(newClock - currentClockPercent) > 1) {
    console.log(`[Gearmulator Worker] Auto-calibration: ratio=${ratio.toFixed(3)}, clock ${currentClockPercent}% → ${newClock}% (target ratio=${targetRatio})`);
    currentClockPercent = newClock;
    module._gm_setDspClockPercent(handle, newClock);

    // Report to main thread
    self.postMessage({
      type: 'performance',
      clockPercent: newClock,
      realtimeRatio: ratio,
      framesRendered,
      wallMs: Math.round(wallMs),
    });
  } else {
    console.log(`[Gearmulator Worker] Auto-calibration: ratio=${ratio.toFixed(3)}, clock=${currentClockPercent}% — no change needed`);
    calibrationDone = true; // Stable, stop recalibrating
    self.postMessage({
      type: 'performance',
      clockPercent: currentClockPercent,
      realtimeRatio: ratio,
      framesRendered,
      wallMs: Math.round(wallMs),
      calibrated: true,
    });
  }

  // Reset measurement window
  calibrationStartTime = performance.now();
  calibrationStartFrames = totalFramesRendered;
}

function fillRingBuffer() {
  const bufSize = Atomics.load(sabInt32, 2);
  let writePos = Atomics.load(sabInt32, 0);
  let readPos = Atomics.load(sabInt32, 1);

  let used = writePos - readPos;
  if (used < 0) used += bufSize;
  let free = bufSize - used - 1;

  // Render up to 8 blocks per tick (8 × 256 = 2048 samples).
  const maxBlocks = Math.min(8, Math.floor(free / RENDER_BLOCK));

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

/**
 * Render audio offline (not real-time) — bypasses SAB/worklet entirely.
 * Sends a note, renders the requested duration, returns raw float buffers.
 */
function renderOffline(data) {
  const { durationMs, note, velocity } = data;
  const sr = module._gm_getSamplerate(handle);
  const totalFrames = Math.ceil(sr * (durationMs / 1000));
  const blockSize = 256;

  // Set 100% clock for full-quality offline render
  const savedClock = currentClockPercent;
  module._gm_setDspClockPercent(handle, 100);
  console.log(`[Gearmulator Worker] Offline render: ${totalFrames} frames at ${sr} Hz (clock=100%)`);


  // Allocate output buffers
  const ptrL = module._malloc(blockSize * 4);
  const ptrR = module._malloc(blockSize * 4);
  const allL = new Float32Array(totalFrames);
  const allR = new Float32Array(totalFrames);

  // Send note on
  if (note !== undefined) {
    module._gm_sendMidi(handle, 0x90, note & 0x7f, (velocity || 127) & 0x7f);
  }

  // Render all frames
  let offset = 0;
  while (offset < totalFrames) {
    const n = Math.min(blockSize, totalFrames - offset);
    module._gm_process(handle, ptrL, ptrR, n);

    const heapF32 = module.HEAPF32;
    const offL = ptrL >> 2;
    const offR = ptrR >> 2;
    for (let i = 0; i < n; i++) {
      allL[offset + i] = heapF32[offL + i];
      allR[offset + i] = heapF32[offR + i];
    }
    offset += n;
  }

  // Send note off
  if (note !== undefined) {
    module._gm_sendMidi(handle, 0x80, note & 0x7f, 0);
  }

  module._free(ptrL);
  module._free(ptrR);

  // Restore original clock
  module._gm_setDspClockPercent(handle, savedClock);
  console.log(`[Gearmulator Worker] Offline render complete: ${totalFrames} frames (clock restored to ${savedClock}%)`);

  // Transfer buffers to main thread
  self.postMessage({
    type: 'offlineRendered',
    left: allL.buffer,
    right: allR.buffer,
    sampleRate: sr,
    frames: totalFrames,
  }, [allL.buffer, allR.buffer]);
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
