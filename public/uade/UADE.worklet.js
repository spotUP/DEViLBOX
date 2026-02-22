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
      const scanData = this._scanSong();
      console.log('[UADE.worklet] Scan complete: ' + scanData.length + ' rows in ' +
        Math.round(performance.now() - scanStart) + 'ms');

      // Reload the song for playback (scan consumed the song state)
      this._wasm._uade_wasm_stop();
      const ret2 = this._loadIntoWasm(data, filenameHint);
      if (ret2 !== 0) {
        console.warn('[UADE.worklet] Reload after scan failed (ret=' + ret2 + '), scan data still valid');
      }

      this._playing = false;

      this.port.postMessage({
        type: 'loaded',
        player: player || 'Unknown',
        formatName: formatName || 'Unknown',
        minSubsong,
        maxSubsong,
        subsongCount,
        scanData,
      });
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
    // Accumulate best trigger per channel within each row window
    const rowAccum = [null, null, null, null];
    let frameSinceRow = 0;
    let totalFrames = 0;

    // Start playback for scan
    this._wasm._uade_wasm_set_looping(0); // Disable looping so song ends

    while (rows.length < MAX_ROWS && totalFrames < maxFrames) {
      const ret = this._wasm._uade_wasm_render(tmpL, tmpR, CHUNK);
      if (ret <= 0) break; // Song ended or error
      totalFrames += ret;
      frameSinceRow += ret;

      // Read channel state at each chunk for fine-grained trigger detection
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
          // New note trigger — record it for this row window
          rowAccum[i] = { period: per, volume: vol, samplePtr: lc };
        } else if (!rowAccum[i] && dma && per > 0) {
          // No trigger yet in this window, but channel is active — record volume
          rowAccum[i] = { period: 0, volume: vol, samplePtr: 0 };
        }
        prevPeriods[i] = per;
      }

      // Emit a row at each row boundary
      if (frameSinceRow >= FRAMES_PER_ROW) {
        frameSinceRow -= FRAMES_PER_ROW;

        rows.push(rowAccum.map(acc => acc
          ? { period: acc.period, volume: acc.volume, samplePtr: acc.samplePtr }
          : { period: 0, volume: 0, samplePtr: 0 }
        ));

        // Reset accumulators for next row
        for (let i = 0; i < 4; i++) rowAccum[i] = null;
      }
    }

    this._wasm._free(tmpL);
    this._wasm._free(tmpR);

    return rows;
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
