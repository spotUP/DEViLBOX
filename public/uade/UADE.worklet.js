/**
 * UADE.worklet.js — AudioWorklet processor for UADE exotic Amiga format playback
 *
 * Runs inside an AudioWorkletGlobalScope (separate thread from main JS).
 * Communicates with UADEEngine.ts via port messages.
 *
 * Message protocol (from main thread):
 *   { type: 'init', sampleRate, wasmBinary }
 *   { type: 'load', buffer: ArrayBuffer, filenameHint: string }
 *   { type: 'play' }
 *   { type: 'stop' }
 *   { type: 'pause' }
 *   { type: 'setSubsong', index: number }
 *   { type: 'setLooping', value: boolean }
 *   { type: 'dispose' }
 *
 * Messages sent to main thread:
 *   { type: 'ready' }                            — WASM initialized
 *   { type: 'loaded', player, formatName, subsongCount, minSubsong, maxSubsong }
 *   { type: 'error', message }                   — Load/init error
 *   { type: 'songEnd' }                          — Song playback finished
 *   { type: 'position', subsong, position }      — Periodic position update
 */

class UADEProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._wasm = null;         // Emscripten module instance
    this._ready = false;
    this._playing = false;
    this._paused = false;
    this._lastData = null;       // Last loaded file bytes (for subsong re-scan)
    this._lastHint = '';

    // Float32 output buffers allocated in WASM heap
    this._outL = null;
    this._outR = null;
    this._outFrames = 256;    // Larger than 128 to handle render calls > quantum size

    this.port.onmessage = (event) => this._handleMessage(event.data);
  }

  async _handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this._init(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'load':
        this._load(data.buffer, data.filenameHint);
        break;

      case 'play':
        this._playing = true;
        this._paused = false;
        break;

      case 'stop':
        if (this._wasm && this._ready) {
          this._wasm._uade_wasm_stop();
        }
        this._playing = false;
        this._paused = false;
        break;

      case 'pause':
        this._paused = !this._paused;
        break;

      case 'setSubsong':
        if (this._wasm && this._ready) {
          this._wasm._uade_wasm_set_subsong(data.index);
        }
        break;

      case 'setLooping':
        if (this._wasm && this._ready) {
          this._wasm._uade_wasm_set_looping(data.value ? 1 : 0);
        }
        break;

      case 'dispose':
        if (this._wasm && this._ready) {
          this._wasm._uade_wasm_cleanup();
        }
        this._ready = false;
        this._playing = false;
        break;

      case 'renderFull':
        this._renderFullSong(data.subsong);
        break;

      case 'scanSubsong':
        this._scanSubsong(data.subsong);
        break;
    }
  }

  async _init(sampleRate, wasmBinary, jsCode) {
    console.log('[UADE.worklet] _init called, sampleRate=' + sampleRate +
      ', wasmBinary=' + (wasmBinary ? wasmBinary.byteLength + ' bytes' : 'null') +
      ', jsCode=' + (jsCode ? jsCode.length + ' chars' : 'null'));
    try {
      // Polyfill browser globals for Emscripten in worklet context.
      // AudioWorkletGlobalScope is neither a Worker nor a Window, so
      // Emscripten's environment detection fails. We polyfill the globals
      // it checks for so it recognizes this as a "worker" environment.
      if (!globalThis.self) {
        globalThis.self = globalThis;
      }
      // Emscripten checks `typeof importScripts === 'function'` to detect
      // worker environment. AudioWorklet doesn't have importScripts.
      if (typeof globalThis.importScripts === 'undefined') {
        globalThis.importScripts = function() {
          console.warn('[UADE.worklet] importScripts called (no-op in AudioWorklet)');
        };
      }
      // Emscripten also checks `globalThis.WorkerGlobalScope` to confirm
      // it's running in a web/worker context. AudioWorklet lacks this.
      if (!globalThis.WorkerGlobalScope) {
        globalThis.WorkerGlobalScope = true;
      }
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
      // TextEncoder polyfill — not available in AudioWorkletGlobalScope
      if (typeof globalThis.TextEncoder === 'undefined') {
        globalThis.TextEncoder = class {
          encode(str) {
            const buf = new Uint8Array(str.length * 3);
            let pos = 0;
            for (let i = 0; i < str.length; i++) {
              let c = str.charCodeAt(i);
              if (c < 0x80) {
                buf[pos++] = c;
              } else if (c < 0x800) {
                buf[pos++] = 0xc0 | (c >> 6);
                buf[pos++] = 0x80 | (c & 0x3f);
              } else {
                buf[pos++] = 0xe0 | (c >> 12);
                buf[pos++] = 0x80 | ((c >> 6) & 0x3f);
                buf[pos++] = 0x80 | (c & 0x3f);
              }
            }
            return buf.slice(0, pos);
          }
        };
      }
      // TextDecoder polyfill — needed by Emscripten's UTF8ToString
      if (typeof globalThis.TextDecoder === 'undefined') {
        globalThis.TextDecoder = class {
          decode(buf) {
            const bytes = new Uint8Array(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength || buf.length);
            let str = '';
            for (let i = 0; i < bytes.length; i++) {
              const b = bytes[i];
              if (b < 0x80) {
                if (b === 0) break;
                str += String.fromCharCode(b);
              } else if (b < 0xe0) {
                str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f));
              } else {
                str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
              }
            }
            return str;
          }
        };
      }

      // Execute Emscripten JS via Function constructor (importScripts not available in AudioWorklet)
      if (jsCode && typeof globalThis.createUADE === 'undefined') {
        console.log('[UADE.worklet] Executing Emscripten JS via new Function()...');
        const wrappedCode = jsCode + '\nreturn createUADE;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createUADE = result;
          console.log('[UADE.worklet] createUADE factory installed');
        } else {
          console.error('[UADE.worklet] new Function() did not return a function, got:', typeof result);
        }
      }

      if (!globalThis.createUADE) {
        throw new Error('createUADE factory not available (jsCode=' + (jsCode ? 'present' : 'missing') + ')');
      }

      // Instantiate the WASM module with the provided binary
      console.log('[UADE.worklet] Calling createUADE() with wasmBinary=' + (wasmBinary ? wasmBinary.byteLength + ' bytes' : 'null'));
      this._lastAbortReason = null;
      const self = this;
      this._wasm = await globalThis.createUADE({
        wasmBinary,
        onAbort(reason) {
          console.error('[UADE.worklet] WASM aborted:', reason);
          self._lastAbortReason = reason;
        },
        print(text) {
          console.log('[UADE-stdout]', text);
        },
        printErr(text) {
          console.error('[UADE-stderr]', text);
        },
      });
      console.log('[UADE.worklet] WASM module instantiated');

      // Allocate float32 buffers in WASM heap for audio output
      const frameBytes = this._outFrames * 4;  // float32
      this._ptrL = this._wasm._malloc(frameBytes);
      this._ptrR = this._wasm._malloc(frameBytes);

      // Initialize UADE engine
      console.log('[UADE.worklet] Calling _uade_wasm_init(' + (sampleRate || 44100) + ')');
      const ret = this._wasm._uade_wasm_init(sampleRate || 44100);
      if (ret !== 0) {
        throw new Error('uade_wasm_init failed with code ' + ret);
      }

      console.log('[UADE.worklet] UADE engine initialized successfully');
      this._ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      let errMsg;
      if (err instanceof Error) {
        errMsg = err.message + (err.stack ? '\n' + err.stack : '');
      } else if (typeof err === 'string') {
        errMsg = err;
      } else if (err && typeof err === 'object') {
        errMsg = err.message || err.what || err.status || JSON.stringify(err);
      } else {
        errMsg = String(err);
      }
      console.error('[UADE.worklet] Init failed:', errMsg);
      this.port.postMessage({ type: 'error', message: errMsg });
    }
  }

  _loadIntoWasm(data, filenameHint) {
    const ptr = this._wasm._malloc(data.byteLength);
    if (!ptr) throw new Error('malloc failed for file data (' + data.byteLength + ' bytes)');
    this._wasm.HEAPU8.set(data, ptr);

    const hintLen = filenameHint.length * 3 + 1;
    const hintPtr = this._wasm._malloc(hintLen);
    if (!hintPtr) throw new Error('malloc failed for filename hint');
    this._wasm.stringToUTF8(filenameHint, hintPtr, hintLen);

    this._lastAbortReason = null;
    const ret = this._wasm._uade_wasm_load(ptr, data.byteLength, hintPtr);

    this._wasm._free(ptr);
    this._wasm._free(hintPtr);
    return ret;
  }

  _load(buffer, filenameHint) {
    if (!this._wasm || !this._ready) {
      this.port.postMessage({ type: 'error', message: 'WASM not ready' });
      return;
    }

    try {
      console.log('[UADE.worklet] _load called: ' + filenameHint + ' (' + buffer.byteLength + ' bytes)');

      const data = new Uint8Array(buffer);
      // Keep a copy so _scanSubsong() can reload without transferring back from main thread
      this._lastData = data;
      this._lastHint = filenameHint;
      const ret = this._loadIntoWasm(data, filenameHint);
      console.log('[UADE.worklet] _uade_wasm_load returned: ' + ret);

      if (ret !== 0) {
        const abortInfo = this._lastAbortReason ? ' (abort: ' + this._lastAbortReason + ')' : '';
        console.error('[UADE.worklet] _uade_wasm_load failed with ret=' + ret + abortInfo);
        this.port.postMessage({
          type: 'error',
          message: 'UADE could not play: ' + filenameHint + ' (ret=' + ret + ')' + abortInfo
        });
        return;
      }

      // Read back metadata
      const nameBuf = this._wasm._malloc(256);
      this._wasm._uade_wasm_get_player_name(nameBuf, 256);
      const player = this._wasm.UTF8ToString(nameBuf);

      this._wasm._uade_wasm_get_format_name(nameBuf, 256);
      const formatName = this._wasm.UTF8ToString(nameBuf);
      this._wasm._free(nameBuf);

      const minSubsong = this._wasm._uade_wasm_get_subsong_min();
      const maxSubsong = this._wasm._uade_wasm_get_subsong_max();
      const subsongCount = this._wasm._uade_wasm_get_subsong_count();

      // Fast-scan the entire song to extract pattern data before playback
      console.log('[UADE.worklet] Starting song scan...');
      const scanStart = performance.now();
      const scanResult = this._scanSong();
      const isEnhanced = scanResult && scanResult.isEnhanced;
      const scanData = isEnhanced ? scanResult.rows : scanResult;
      const scanDuration = Math.round(performance.now() - scanStart);
      console.log('[UADE.worklet] Scan complete: ' + (isEnhanced ? 'enhanced' : 'basic') +
        ', ' + (Array.isArray(scanData) ? scanData.length : 0) + ' rows, ' +
        (isEnhanced ? Object.keys(scanResult.samples || {}).length + ' samples, ' : '') +
        scanDuration + 'ms');

      // Reload the song for playback (scan consumed the song state)
      this._wasm._uade_wasm_stop();
      const ret2 = this._loadIntoWasm(data, filenameHint);
      if (ret2 !== 0) {
        console.warn('[UADE.worklet] Reload after scan failed (ret=' + ret2 + '), scan data still valid');
      }

      this._playing = false;

      // Build message payload
      const msg = {
        type: 'loaded',
        player: player || 'Unknown',
        formatName: formatName || 'Unknown',
        minSubsong,
        maxSubsong,
        subsongCount,
        scanData,
      };

      // Include enhanced scan extras if available
      if (isEnhanced) {
        msg.enhancedScan = {
          samples: scanResult.samples,
          tempoChanges: scanResult.tempoChanges,
          bpm: scanResult.bpm,
          speed: scanResult.speed,
          warnings: scanResult.warnings || [],
        };
      }

      this.port.postMessage(msg);
    } catch (err) {
      let errMsg;
      if (err instanceof Error) {
        errMsg = err.message + (err.stack ? '\n' + err.stack : '');
      } else if (typeof err === 'string') {
        errMsg = err;
      } else if (err && typeof err === 'object') {
        errMsg = err.message || err.what || err.status || JSON.stringify(err);
      } else {
        errMsg = String(err);
      }
      console.error('[UADE.worklet] Load error:', errMsg);
      this.port.postMessage({ type: 'error', message: errMsg });
    }
  }

  /**
   * Fast-scan the entire song by rendering silently at max speed.
   * Captures Paula channel state at regular row intervals (~5292 frames at 125BPM/speed 6).
   * Returns array of rows, each containing 4 channels of {period, volume, samplePtr}.
   */
  _scanSong() {
    // Try enhanced scan first; fall back to basic scan if new WASM exports aren't available
    if (typeof this._wasm._uade_wasm_get_channel_extended === 'function') {
      return this._scanSongEnhanced();
    }
    return this._scanSongBasic();
  }

  /**
   * Basic scan — original row-based scan for older WASM builds without extended exports.
   */
  _scanSongBasic() {
    const CHUNK = 256;
    const FRAMES_PER_ROW = Math.round((sampleRate || 44100) * 2.5 * 6 / 125); // ~5292
    const MAX_ROWS = 64 * 256; // 256 patterns max
    const MAX_SECONDS = 600;   // 10 minute safety limit
    const maxFrames = (sampleRate || 44100) * MAX_SECONDS;

    // Ensure channel snapshot buffer exists
    if (this._channelBuf === undefined) {
      this._channelBuf = this._wasm._malloc(64);
    }

    // Allocate temp audio buffers (we discard the audio)
    const tmpL = this._wasm._malloc(CHUNK * 4);
    const tmpR = this._wasm._malloc(CHUNK * 4);

    const rows = [];
    const prevPeriods = [0, 0, 0, 0];
    const rowAccum = [null, null, null, null];
    let frameSinceRow = 0;
    let totalFrames = 0;

    this._wasm._uade_wasm_set_looping(0);

    while (rows.length < MAX_ROWS && totalFrames < maxFrames) {
      const ret = this._wasm._uade_wasm_render(tmpL, tmpR, CHUNK);
      if (ret <= 0) break;
      totalFrames += ret;
      frameSinceRow += ret;

      this._wasm._uade_wasm_get_channel_snapshot(this._channelBuf);
      const snap = new Uint32Array(this._wasm.HEAPU8.buffer, this._channelBuf, 16);

      for (let i = 0; i < 4; i++) {
        const base = i * 4;
        const per = snap[base];
        const vol = snap[base + 1];
        const dma = snap[base + 2];
        const lc = snap[base + 3];
        const triggered = per !== prevPeriods[i] && per > 0 && dma;

        if (triggered) {
          rowAccum[i] = { period: per, volume: vol, samplePtr: lc };
        } else if (!rowAccum[i] && dma && per > 0) {
          rowAccum[i] = { period: 0, volume: vol, samplePtr: 0 };
        }
        prevPeriods[i] = per;
      }

      if (frameSinceRow >= FRAMES_PER_ROW) {
        frameSinceRow -= FRAMES_PER_ROW;
        rows.push(rowAccum.map(acc => acc
          ? { period: acc.period, volume: acc.volume, samplePtr: acc.samplePtr }
          : { period: 0, volume: 0, samplePtr: 0 }
        ));
        for (let i = 0; i < 4; i++) rowAccum[i] = null;
      }
    }

    this._wasm._free(tmpL);
    this._wasm._free(tmpR);

    return rows;
  }

  /**
   * Enhanced scan — uses extended channel state + CIA timers + memory reads.
   *
   * Captures per-tick snapshots at high resolution, extracts sample PCM data
   * directly from Amiga chip RAM, detects tempo from CIA timers, and post-processes
   * to detect effects (vibrato, portamento, arpeggio, volume slides).
   *
   * Returns: { rows, samples, tempoChanges, isEnhanced }
   *   rows[]: per-row data with 4 channels of { period, volume, samplePtr, sampleStart, sampleLen, effTyp, eff }
   *   samples: { [samplePtr]: { pcm: Uint8Array, length, loopStart, loopLength, typicalPeriod } }
   *   tempoChanges: [{ row, bpm, speed }]
   */
  _scanSongEnhanced() {
    const CHUNK = 128;  // Smaller chunks = higher tick resolution
    const MAX_SECONDS = 600;
    const sr = sampleRate || 44100;
    const maxFrames = sr * MAX_SECONDS;
    const MAX_ROWS = 64 * 256;

    // Allocate WASM buffers
    const extBufSize = 128; // 4 channels * 8 uint32 = 128 bytes
    const ciaBufSize = 20;  // 5 uint32 = 20 bytes
    const extBuf = this._wasm._malloc(extBufSize);
    const ciaBuf = this._wasm._malloc(ciaBufSize);
    const tmpL = this._wasm._malloc(CHUNK * 4);
    const tmpR = this._wasm._malloc(CHUNK * 4);

    // For memory reads (sample extraction)
    const MEM_READ_BUF_SIZE = 131072; // 128KB max sample read
    const memBuf = this._wasm._malloc(MEM_READ_BUF_SIZE);

    // Tick snapshot accumulator
    const tickSnapshots = [];
    const sampleCache = new Map(); // samplePtr → { pcm, length, loopStart, loopLength, typicalPeriod }

    // Track previous state for change detection
    const prevPeriods = [0, 0, 0, 0];
    const prevVolumes = [0, 0, 0, 0];
    const prevSamplePtrs = [0, 0, 0, 0];
    let prevCiaBTA = 0;

    let totalFrames = 0;

    this._wasm._uade_wasm_set_looping(0);

    // Phase 1: Capture per-tick snapshots at high resolution
    while (tickSnapshots.length < MAX_ROWS * 20 && totalFrames < maxFrames) {
      const ret = this._wasm._uade_wasm_render(tmpL, tmpR, CHUNK);
      if (ret <= 0) break;
      totalFrames += CHUNK;

      // Read extended channel state
      this._wasm._uade_wasm_get_channel_extended(extBuf);
      const ext = new Uint32Array(this._wasm.HEAPU8.buffer, extBuf, 32);

      // Read CIA state for tempo
      this._wasm._uade_wasm_get_cia_state(ciaBuf);
      const cia = new Uint32Array(this._wasm.HEAPU8.buffer, ciaBuf, 5);

      const tickChannels = [];
      for (let ch = 0; ch < 4; ch++) {
        const base = ch * 8;
        const per = ext[base + 0];
        const vol = ext[base + 1];
        const dma = ext[base + 2];
        const lc = ext[base + 3];    // sample start address (lc register)
        const pt = ext[base + 4];    // current playback pointer
        const len = ext[base + 5];   // sample length in words
        const wper = ext[base + 6];  // pending period
        const wlen = ext[base + 7];  // pending length

        // Detect new sample pointer — extract PCM from Amiga memory.
        // Don't cache yet if PCM is all-zero (chip RAM not yet initialized by
        // the player — common in macro-based formats like FC2 where waveform
        // data is written a few ticks after the DMA address is first set).
        // By leaving it uncached, we re-try on the next encounter when the
        // data should be populated.
        if (lc > 0 && len > 0 && dma && !sampleCache.has(lc)) {
          const byteLen = Math.min(len * 2, MEM_READ_BUF_SIZE);
          if (byteLen > 4) { // Skip tiny samples (likely loop stubs)
            this._wasm._uade_wasm_read_memory(lc, memBuf, byteLen);
            const pcm = new Uint8Array(byteLen);
            pcm.set(new Uint8Array(this._wasm.HEAPU8.buffer, memBuf, byteLen));

            // Skip all-zero PCM — memory not yet written by the player
            const hasNonZero = pcm.some(b => b !== 0);
            if (hasNonZero) {
              // Detect loop: if wlen > 1 and sample re-triggers with same lc
              // Most Amiga formats: loop start is at (lc), loop length is (wlen) words
              // We'll store wlen for now and refine during post-processing
              sampleCache.set(lc, {
                pcm,
                length: byteLen,
                loopStart: 0,  // Refined later
                loopLength: wlen > 1 ? wlen * 2 : 0,
                typicalPeriod: per > 0 ? per : 428, // Default to C-2 if unknown
              });
            }
          }
        }

        // Update typical period for known samples
        if (lc > 0 && per > 0 && sampleCache.has(lc)) {
          const cached = sampleCache.get(lc);
          if (cached.typicalPeriod === 428 && per !== 428) {
            cached.typicalPeriod = per;
          }
        }

        // Detect loop reload: lc changed while DMA was active.
        // The new lc is the loop-start address; offset from the original sample start
        // gives us the loop start in bytes within the cached PCM buffer.
        const prevLc = prevSamplePtrs[ch];
        if (prevLc !== lc && prevLc > 0 && lc > 0 && dma) {
          const prevSample = sampleCache.get(prevLc);
          if (prevSample && prevSample.loopStart === 0 && lc >= prevLc) {
            const relLoopStart = lc - prevLc;
            if (relLoopStart < prevSample.length) {
              prevSample.loopStart = relLoopStart;
              prevSample.loopLength = wlen > 1 ? wlen * 2 : 0;
            }
          }
        }

        const triggered = per !== prevPeriods[ch] && per > 0 && dma;
        const sampleChanged = lc !== prevSamplePtrs[ch] && lc > 0;

        tickChannels.push({
          period: per,
          volume: vol,
          dma,
          samplePtr: lc,
          sampleStart: pt,
          sampleLen: len,
          triggered,
          sampleChanged,
        });

        prevPeriods[ch] = per;
        prevVolumes[ch] = vol;
        prevSamplePtrs[ch] = lc;
      }

      // CIA-B Timer A drives BPM in most Amiga formats
      const ciaBTA = cia[2];
      const vblankHz = cia[4] || 50;
      const ciaChanged = ciaBTA !== prevCiaBTA && ciaBTA > 0;
      prevCiaBTA = ciaBTA;

      tickSnapshots.push({
        channels: tickChannels,
        ciaBTA,
        vblankHz,
        ciaChanged,
        frame: totalFrames,
      });
    }

    // Free WASM buffers
    this._wasm._free(extBuf);
    this._wasm._free(ciaBuf);
    this._wasm._free(tmpL);
    this._wasm._free(tmpR);
    this._wasm._free(memBuf);

    // Phase 2: Determine row boundaries and BPM from CIA timers
    // BPM = (vblankHz * 2.5 * PAL_CLOCK_CONSTANT) / ciaBTA  or heuristic
    // For CIA timer: BPM ≈ 1773447 / (ciaBTA + 1)  [PAL systems]
    // For VBlank-based: fixed 125 BPM at speed 6

    const warnings = []; // Degradation notices collected during scan

    // Detect BPM from most common CIA-B Timer A value.
    // ciaReliable=true when CIA-B is actually driving BPM (most MOD/XM/S3M formats).
    // ciaReliable=false when the format uses VBlank/CIA-A timing (FC2, etc.) — in
    // that case CIA-B holds an OS or unrelated value, and trigger-based speed
    // estimation is also unreliable (FC2 macros cycle sample pointers every VBlank).
    let detectedBPM = 125;
    let detectedSpeed = 6;
    let ciaReliable = false;
    const ciaCounts = new Map();
    for (const tick of tickSnapshots) {
      if (tick.ciaBTA > 0) {
        ciaCounts.set(tick.ciaBTA, (ciaCounts.get(tick.ciaBTA) || 0) + 1);
      }
    }
    if (ciaCounts.size > 0) {
      // Find most common CIA timer value
      let maxCount = 0;
      let dominantCIA = 0;
      for (const [val, count] of ciaCounts) {
        if (count > maxCount) { maxCount = count; dominantCIA = val; }
      }
      if (dominantCIA > 0) {
        const rawBPM = Math.round(1773447 / (dominantCIA + 1));
        if (rawBPM >= 32 && rawBPM <= 999) {
          detectedBPM = rawBPM;
          ciaReliable = true;
        }
        // else: CIA-B timer not used for music timing; keep defaults BPM=125, speed=6
      }
    }

    // Only estimate speed from period-change triggers when CIA-B was reliable.
    // For VBlank-based formats (FC2 etc.), macro systems cause period/sample
    // pointer changes at VBlank rate, producing completely wrong speed estimates.
    if (ciaReliable) {
      const triggerFrames = [];
      let lastTriggerFrame = 0;
      for (let i = 0; i < tickSnapshots.length; i++) {
        const tick = tickSnapshots[i];
        const anyTrigger = tick.channels.some(ch => ch.triggered);
        if (anyTrigger) {
          if (lastTriggerFrame > 0) {
            triggerFrames.push(tick.frame - lastTriggerFrame);
          }
          lastTriggerFrame = tick.frame;
        }
      }
      if (triggerFrames.length > 10) {
        triggerFrames.sort((a, b) => a - b);
        const medianInterval = triggerFrames[Math.floor(triggerFrames.length / 2)];
        // speed = interval * BPM / (sr * 2.5)
        const estimatedSpeed = Math.round(medianInterval * detectedBPM / (sr * 2.5));
        if (estimatedSpeed >= 1 && estimatedSpeed <= 31) {
          detectedSpeed = estimatedSpeed;
        }
      }
    }

    // VBlank-based BPM estimation for formats where CIA-B doesn't drive timing.
    // For PAL Amiga: 50 Hz VBlank; NTSC: 60 Hz. Speed = VBlanks between note triggers.
    if (!ciaReliable) {
      const vblankHz = tickSnapshots[0]?.vblankHz || 50;
      const vblankInterval = Math.round(sr / vblankHz);
      const triggerFrames = [];
      let lastTriggerFrame = 0;
      for (let i = 0; i < tickSnapshots.length; i++) {
        const tick = tickSnapshots[i];
        const anyTrigger = tick.channels.some(ch => ch.triggered);
        if (anyTrigger) {
          if (lastTriggerFrame > 0) {
            triggerFrames.push(tick.frame - lastTriggerFrame);
          }
          lastTriggerFrame = tick.frame;
        }
      }
      if (triggerFrames.length > 5) {
        triggerFrames.sort((a, b) => a - b);
        const median = triggerFrames[Math.floor(triggerFrames.length / 2)];
        const estimatedSpeed = Math.max(1, Math.min(31, Math.round(median / vblankInterval)));
        if (estimatedSpeed >= 1 && estimatedSpeed <= 31) {
          detectedSpeed = estimatedSpeed;
          // BPM back-calculated: standard Amiga formula BPM = vblankHz * 2.5 / speed
          detectedBPM = Math.max(32, Math.min(999, Math.round(vblankHz * 2.5 / estimatedSpeed)));
          warnings.push('CIA unreliable — VBlank BPM estimated: ' + detectedBPM + ' BPM / speed ' + detectedSpeed);
        } else {
          warnings.push('CIA unreliable — tempo unknown, defaulted to 125 BPM / speed 6');
        }
      } else {
        warnings.push('CIA unreliable — too few note triggers to estimate tempo, defaulted to 125 BPM / speed 6');
      }
    }

    const actualFPR = Math.round(sr * 2.5 * detectedSpeed / detectedBPM);

    // Phase 3: Group tick snapshots into rows and detect effects
    const rows = [];
    const tempoChanges = [];
    let frameSinceRow = 0;
    let currentRowTicks = []; // Ticks within current row
    let currentBPM = detectedBPM;

    // Fingerprint-based loop detection: stops scanning when the song loops back.
    // Uses a sliding window of LOOP_WINDOW consecutive row fingerprints.
    // Each fingerprint encodes all 4 channel periods + samplePtrs.
    const LOOP_WINDOW = 16;
    const LOOP_MIN_ROWS = 128; // Don't check until at least 2 patterns of data
    const _fpHistory = []; // Per-row fingerprint strings
    const _seenWindows = new Set(); // Registered window keys

    for (let i = 0; i < tickSnapshots.length && rows.length < MAX_ROWS; i++) {
      const tick = tickSnapshots[i];
      currentRowTicks.push(tick);
      frameSinceRow += CHUNK;

      // Detect tempo changes
      if (tick.ciaChanged && tick.ciaBTA > 0) {
        const newBPM = Math.round(1773447 / (tick.ciaBTA + 1));
        if (newBPM >= 32 && newBPM <= 999 && newBPM !== currentBPM) {
          currentBPM = newBPM;
          tempoChanges.push({ row: rows.length, bpm: newBPM, speed: detectedSpeed });
        }
      }

      if (frameSinceRow >= actualFPR) {
        frameSinceRow -= actualFPR;
        rows.push(this._processRowTicks(currentRowTicks));
        currentRowTicks = [];

        // Build fingerprint for the row just pushed
        const _row = rows[rows.length - 1];
        const _fp = _row.map(ch => `${ch.period | 0},${ch.samplePtr | 0}`).join('|');
        _fpHistory.push(_fp);

        if (_fpHistory.length >= LOOP_WINDOW) {
          const _windowKey = _fpHistory.slice(-LOOP_WINDOW).join('\n');
          if (_fpHistory.length > LOOP_MIN_ROWS && _seenWindows.has(_windowKey)) {
            // Detected a loop: this exact sequence of rows was seen before — stop scanning
            break;
          }
          // Register the window ending one row earlier to avoid same-position false positives
          if (_fpHistory.length > LOOP_WINDOW) {
            _seenWindows.add(_fpHistory.slice(-LOOP_WINDOW - 1, -1).join('\n'));
          }
        }
      }
    }

    // Emit final partial row if significant
    if (currentRowTicks.length > 2) {
      rows.push(this._processRowTicks(currentRowTicks));
    }

    // Convert sample cache to transferable format
    const samples = {};
    for (const [ptr, data] of sampleCache) {
      samples[ptr] = {
        pcm: data.pcm, // Uint8Array (transferable)
        length: data.length,
        loopStart: data.loopStart,
        loopLength: data.loopLength,
        typicalPeriod: data.typicalPeriod,
      };
    }

    return {
      rows, // Enhanced rows compatible with basic scan format
      samples,
      tempoChanges,
      bpm: detectedBPM,
      speed: detectedSpeed,
      warnings,
      isEnhanced: true,
    };
  }

  /**
   * Process accumulated tick snapshots within a single row to detect effects.
   * Returns array of 4 channel entries with note, volume, sample, and detected effects.
   */
  _processRowTicks(ticks) {
    if (!ticks.length) {
      return [
        { period: 0, volume: 0, samplePtr: 0, sampleStart: 0, sampleLen: 0, effTyp: 0, eff: 0 },
        { period: 0, volume: 0, samplePtr: 0, sampleStart: 0, sampleLen: 0, effTyp: 0, eff: 0 },
        { period: 0, volume: 0, samplePtr: 0, sampleStart: 0, sampleLen: 0, effTyp: 0, eff: 0 },
        { period: 0, volume: 0, samplePtr: 0, sampleStart: 0, sampleLen: 0, effTyp: 0, eff: 0 },
      ];
    }

    const result = [];

    for (let ch = 0; ch < 4; ch++) {
      // Collect per-tick data for this channel
      const periods = [];
      const volumes = [];
      let bestPeriod = 0;
      let bestVolume = 0;
      let bestSamplePtr = 0;
      let bestSampleStart = 0;
      let bestSampleLen = 0;
      let triggered = false;

      for (const tick of ticks) {
        const c = tick.channels[ch];
        if (c.period > 0) periods.push(c.period);
        volumes.push(c.volume);

        if (c.triggered || c.sampleChanged) {
          triggered = true;
          bestPeriod = c.period;
          bestVolume = c.volume;
          bestSamplePtr = c.samplePtr;
          bestSampleStart = c.sampleStart;
          bestSampleLen = c.sampleLen;
        }
      }

      // If no trigger, use most recent non-zero values
      if (!triggered) {
        bestPeriod = 0; // No note
        bestVolume = volumes.length > 0 ? volumes[0] : 0;
        if (ticks[0].channels[ch].dma && ticks[0].channels[ch].period > 0) {
          bestSamplePtr = ticks[0].channels[ch].samplePtr;
        }
      }

      // Detect effects from tick-by-tick period/volume changes
      let effTyp = 0;
      let eff = 0;

      if (periods.length >= 3) {
        // Check for arpeggio: detect repeating period cycles of length 1, 2, or 3.
        // Most Amiga arpeggios run every 1 or 2 ticks (not just 3).
        const uniquePeriods = [...new Set(periods)];
        for (const cycleLen of [1, 2, 3]) {
          if (effTyp !== 0) break;
          if (periods.length < cycleLen + 1) continue;
          const cycle = periods.slice(0, cycleLen);
          // Verify the rest of the period array repeats this cycle
          let repeating = true;
          for (let t = cycleLen; t < periods.length; t++) {
            if (periods[t] !== cycle[t % cycleLen]) { repeating = false; break; }
          }
          if (!repeating) continue;
          // Found a repeating cycle — convert to semitone offsets from base period
          const sortedCycle = [...new Set(cycle)].sort((a, b) => a - b);
          if (sortedCycle.length < 2) continue; // All same period = no arpeggio
          const base = sortedCycle[0];
          const semi1 = Math.round(12 * Math.log2(base / sortedCycle[Math.min(1, sortedCycle.length - 1)]));
          const semi2 = sortedCycle.length >= 3 ? Math.round(12 * Math.log2(base / sortedCycle[2])) : 0;
          if (Math.abs(semi1) > 0 && Math.abs(semi1) <= 15 &&
              Math.abs(semi2) >= 0 && Math.abs(semi2) <= 15) {
            effTyp = 0; // Arpeggio (effect 0)
            eff = (Math.abs(semi1) << 4) | Math.abs(semi2);
          }
        }

        // Check for portamento: linear period change
        if (effTyp === 0 && uniquePeriods.length >= 2) {
          const first = periods[0];
          const last = periods[periods.length - 1];
          const diff = last - first;

          // Check if consistently moving in one direction
          let monotonic = true;
          for (let t = 1; t < periods.length; t++) {
            if (diff > 0 && periods[t] < periods[t - 1] - 2) { monotonic = false; break; }
            if (diff < 0 && periods[t] > periods[t - 1] + 2) { monotonic = false; break; }
          }

          if (monotonic && Math.abs(diff) > 2) {
            const rate = Math.min(255, Math.abs(Math.round(diff / periods.length)));
            if (diff < 0) {
              // Period decreasing = pitch going up = Portamento Up (1xx)
              effTyp = 1;
              eff = rate;
            } else {
              // Period increasing = pitch going down = Portamento Down (2xx)
              effTyp = 2;
              eff = rate;
            }
          }
        }

        // Check for vibrato: period oscillating around center
        if (effTyp === 0 && periods.length >= 4) {
          const avg = periods.reduce((a, b) => a + b, 0) / periods.length;
          let crossings = 0;
          for (let t = 1; t < periods.length; t++) {
            if ((periods[t - 1] - avg) * (periods[t] - avg) < 0) crossings++;
          }
          if (crossings >= 2) {
            // Oscillating — likely vibrato
            const maxDev = Math.max(...periods.map(p => Math.abs(p - avg)));
            const depth = Math.min(15, Math.round(maxDev / 4));
            const speed = Math.min(15, Math.round(crossings * 2));
            if (depth > 0) {
              effTyp = 4; // Vibrato
              eff = (speed << 4) | depth;
            }
          }
        }
      }

      // Check for volume slide
      if (effTyp === 0 && volumes.length >= 3) {
        const first = volumes[0];
        const last = volumes[volumes.length - 1];
        const vdiff = last - first;
        if (Math.abs(vdiff) > 2) {
          const rate = Math.min(15, Math.abs(Math.round(vdiff / volumes.length)));
          if (rate > 0) {
            effTyp = 0x0A; // Volume slide
            eff = vdiff > 0 ? (rate << 4) : rate; // Up: x0, Down: 0x
          }
        }
      }

      result.push({
        period: bestPeriod,
        volume: bestVolume,
        samplePtr: bestSamplePtr,
        sampleStart: bestSampleStart,
        sampleLen: bestSampleLen,
        effTyp,
        eff,
      });
    }

    return result;
  }

  /**
   * Re-scan a specific subsong without re-transferring the file data.
   * Reloads from this._lastData, seeks to the requested subsong, runs the
   * enhanced scan, then reloads again for normal playback.
   * Posts { type: 'subsongScanned', subsong, scanResult } on success,
   * or { type: 'subsongScanError', subsong, message } on failure.
   */
  _scanSubsong(subsong) {
    if (!this._wasm || !this._ready) {
      this.port.postMessage({ type: 'subsongScanError', subsong, message: 'WASM not ready' });
      return;
    }
    if (!this._lastData || !this._lastHint) {
      this.port.postMessage({ type: 'subsongScanError', subsong, message: 'No file loaded' });
      return;
    }

    try {
      // Stop current playback and reload for scanning
      this._wasm._uade_wasm_stop();
      const ret = this._loadIntoWasm(this._lastData, this._lastHint);
      if (ret !== 0) {
        this.port.postMessage({ type: 'subsongScanError', subsong, message: 'Reload failed (ret=' + ret + ')' });
        return;
      }

      // Seek to the requested subsong before scanning
      if (subsong > 0) {
        this._wasm._uade_wasm_set_subsong(subsong);
      }

      const scanResult = this._scanSongEnhanced();

      // Reload for playback (scan consumed the WASM state)
      this._wasm._uade_wasm_stop();
      const ret2 = this._loadIntoWasm(this._lastData, this._lastHint);
      if (ret2 !== 0) {
        console.warn('[UADE.worklet] Post-scan reload failed (ret=' + ret2 + ')');
      }
      this._playing = false;

      this.port.postMessage({
        type: 'subsongScanned',
        subsong,
        scanResult: {
          rows: scanResult.rows,
          samples: scanResult.samples,
          tempoChanges: scanResult.tempoChanges,
          bpm: scanResult.bpm,
          speed: scanResult.speed,
          warnings: scanResult.warnings || [],
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.port.postMessage({ type: 'subsongScanError', subsong, message: msg });
    }
  }

  /**
   * Render the entire song to a WAV audio buffer.
   * Used for pre-rendering UADE modules for DJ playback.
   */
  _renderFullSong(subsong) {
    if (!this._wasm || !this._ready) {
      this.port.postMessage({ type: 'renderError', message: 'WASM not ready' });
      return;
    }

    try {
      // Switch to specified subsong if provided
      if (subsong !== undefined && subsong !== null) {
        this._wasm._uade_wasm_set_subsong(subsong);
      }

      const sampleRate = this._wasm.HEAPU32[0] || 44100; // Read from WASM if available
      const CHUNK = 4096;
      const MAX_SECONDS = 600; // 10 minute safety limit
      const maxFrames = sampleRate * MAX_SECONDS;

      // Allocate temp render buffers
      const tmpL = this._wasm._malloc(CHUNK * 4);
      const tmpR = this._wasm._malloc(CHUNK * 4);

      // Collect rendered audio
      const audioChunks = [];
      let totalFrames = 0;

      // Disable looping for full render
      this._wasm._uade_wasm_set_looping(0);

      // Render loop
      while (totalFrames < maxFrames) {
        const ret = this._wasm._uade_wasm_render(tmpL, tmpR, CHUNK);
        if (ret <= 0) break; // Song ended

        // Copy audio to JS arrays
        const leftData = new Float32Array(ret);
        const rightData = new Float32Array(ret);
        const heapL = new Float32Array(this._wasm.HEAPF32.buffer, tmpL, ret);
        const heapR = new Float32Array(this._wasm.HEAPF32.buffer, tmpR, ret);
        leftData.set(heapL);
        rightData.set(heapR);

        audioChunks.push({ left: leftData, right: rightData });
        totalFrames += ret;
      }

      this._wasm._free(tmpL);
      this._wasm._free(tmpR);

      if (totalFrames === 0) {
        this.port.postMessage({ type: 'renderError', message: 'No audio rendered' });
        return;
      }

      // Concatenate all chunks into single buffers
      const leftChannel = new Float32Array(totalFrames);
      const rightChannel = new Float32Array(totalFrames);
      let offset = 0;
      for (const chunk of audioChunks) {
        leftChannel.set(chunk.left, offset);
        rightChannel.set(chunk.right, offset);
        offset += chunk.left.length;
      }

      // Encode to WAV
      const wavBuffer = this._encodeWAV(leftChannel, rightChannel, sampleRate);

      // Send back to main thread
      this.port.postMessage(
        { type: 'renderComplete', audioBuffer: wavBuffer },
        [wavBuffer] // Transfer ownership
      );

    } catch (err) {
      let errMsg = err instanceof Error ? err.message : String(err);
      console.error('[UADE.worklet] Render error:', errMsg);
      this.port.postMessage({ type: 'renderError', message: errMsg });
    }
  }

  /**
   * Encode stereo float32 PCM to WAV format (16-bit PCM).
   */
  _encodeWAV(leftChannel, rightChannel, sampleRate) {
    const numChannels = 2;
    const numFrames = leftChannel.length;
    const bytesPerSample = 2; // 16-bit
    const dataSize = numFrames * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV header
    let offset = 0;

    // "RIFF" chunk descriptor
    view.setUint32(offset, 0x52494646, false); offset += 4; // "RIFF"
    view.setUint32(offset, 36 + dataSize, true); offset += 4; // File size - 8
    view.setUint32(offset, 0x57415645, false); offset += 4; // "WAVE"

    // "fmt " sub-chunk
    view.setUint32(offset, 0x666d7420, false); offset += 4; // "fmt "
    view.setUint32(offset, 16, true); offset += 4; // Sub-chunk size (16 for PCM)
    view.setUint16(offset, 1, true); offset += 2; // Audio format (1 = PCM)
    view.setUint16(offset, numChannels, true); offset += 2; // Num channels
    view.setUint32(offset, sampleRate, true); offset += 4; // Sample rate
    view.setUint32(offset, sampleRate * numChannels * bytesPerSample, true); offset += 4; // Byte rate
    view.setUint16(offset, numChannels * bytesPerSample, true); offset += 2; // Block align
    view.setUint16(offset, bytesPerSample * 8, true); offset += 2; // Bits per sample

    // "data" sub-chunk
    view.setUint32(offset, 0x64617461, false); offset += 4; // "data"
    view.setUint32(offset, dataSize, true); offset += 4; // Data size

    // Audio data (interleaved 16-bit PCM)
    for (let i = 0; i < numFrames; i++) {
      // Clamp and convert to 16-bit signed integer
      const left = Math.max(-1, Math.min(1, leftChannel[i]));
      const right = Math.max(-1, Math.min(1, rightChannel[i]));
      view.setInt16(offset, left * 0x7FFF, true); offset += 2;
      view.setInt16(offset, right * 0x7FFF, true); offset += 2;
    }

    return buffer;
  }

  process(_inputs, outputs) {
    const outL = outputs[0][0];
    const outR = outputs[0][1] || outputs[0][0];  // Mono fallback
    const frames = outL.length;  // Usually 128

    if (!this._ready || !this._playing || this._paused) {
      // Silence
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }

    try {
      // Render audio into WASM-allocated float32 buffers
      const ret = this._wasm._uade_wasm_render(this._ptrL, this._ptrR, frames);

      if (ret === 0) {
        // Song ended
        this._playing = false;
        this.port.postMessage({ type: 'songEnd' });
        outL.fill(0);
        if (outR !== outL) outR.fill(0);
        return true;
      }

      if (ret < 0) {
        // Error — silence and continue
        outL.fill(0);
        if (outR !== outL) outR.fill(0);
        return true;
      }

      // Copy float32 from WASM heap to Web Audio output buffers
      const heapF32 = this._wasm.HEAPF32;
      const baseL = this._ptrL >> 2;  // Convert byte offset to float32 index
      const baseR = this._ptrR >> 2;

      for (let i = 0; i < frames; i++) {
        outL[i] = heapF32[baseL + i];
        if (outR !== outL) outR[i] = heapF32[baseR + i];
      }

      // Read Paula channel state for live pattern display (~20Hz)
      if (this._channelBuf === undefined) {
        this._channelBuf = this._wasm._malloc(64); // 4 channels * 4 fields * 4 bytes
        this._prevPeriods = [0, 0, 0, 0];
        this._lastChannelPost = 0;
      }

      this._wasm._uade_wasm_get_channel_snapshot(this._channelBuf);
      const snap = new Uint32Array(this._wasm.HEAPU8.buffer, this._channelBuf, 16);

      // Post at ~20Hz (every ~50ms), not every render call
      if (currentTime - this._lastChannelPost > 0.05) {
        const channels = [];
        for (let i = 0; i < 4; i++) {
          const base = i * 4;
          const period = snap[base];
          channels.push({
            period: period,
            volume: snap[base + 1],
            dma: snap[base + 2],
            triggered: period !== this._prevPeriods[i] && period > 0 && snap[base + 2],
            samplePtr: snap[base + 3],
          });
          this._prevPeriods[i] = period;
        }

        this.port.postMessage({
          type: 'channels',
          channels,
          totalFrames: this._wasm._uade_wasm_get_total_frames()
        });
        this._lastChannelPost = currentTime;
      }
    } catch (err) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
    }

    return true;  // Keep processor alive
  }
}

registerProcessor('uade-processor', UADEProcessor);
