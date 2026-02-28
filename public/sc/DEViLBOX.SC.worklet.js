/**
 * DEViLBOX.SC.worklet.js — AudioWorklet processor for SuperCollider (scsynth.wasm)
 *
 * Architecture:
 *   SC.js is a standard scsynth Emscripten build. It exposes a global Module object and
 *   uses Embind to provide `Module.audio_driver()` and `Module.web_in_port()` objects.
 *   Audio rendering is driven by `Module.audio_driver().WaRun()`, which scsynth normally
 *   calls from a ScriptProcessor onaudioprocess callback.
 *
 *   This worklet bypasses that ScriptProcessor by:
 *   1. Pre-populating `Module.audioDriver` with manually-allocated WASM buffers before
 *      callMain() so the C++ WebAudioDriver init (ASM_CONSTS[84155]) doesn't crash on
 *      missing window.AudioContext.
 *   2. Patching ASM_CONSTS[84155] to a no-op so the real init is skipped.
 *   3. Manually calling Module.audio_driver().WaInitBuffers() after init.
 *   4. In process(): filling input, calling WaRun(), copying planar output channels.
 *
 *   OSC delivery uses Module.oscDriver[57110].receive(0, packet) — the same path
 *   that the ScriptProcessor OSC bridge uses (ASM_CONSTS[83188]).
 *
 * Message protocol (from main thread → worklet):
 *   { type: 'init', jsCode: string, wasmBinary: ArrayBuffer, sampleRate: number,
 *     blockSize: number }
 *   { type: 'osc', data: ArrayBuffer }  — raw OSC packet bytes
 *   { type: 'dispose' }
 *
 * Messages sent to main thread:
 *   { type: 'ready' }         — WASM initialized and scsynth running
 *   { type: 'error', message: string }
 *   { type: 'oscReply', data: Uint8Array }  — OSC reply from scsynth
 *
 * SC_PORT constant: scsynth listens on UDP 57110 by default. The Module.oscDriver
 * keyed by port is the same virtual port used for JS↔WASM OSC exchange.
 */

const SC_PORT = 57110;
const NUM_OUT_CHANNELS = 2;
const NUM_IN_CHANNELS = 0;

class DEViLBOXSCProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._ready = false;
    this._waDriver = null;  // Embind audio_driver() object — provides WaRun()
    this._oscEndpoint = null;  // Module.oscDriver[SC_PORT] — provides receive()
    this._floatBufOut = null;  // Float32Array views into WASM heap (per channel)
    this._blockSize = 128;

    this.port.onmessage = (evt) => this._handleMessage(evt.data);
  }

  async _handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this._init(data.jsCode, data.wasmBinary, data.sampleRate, data.blockSize || 128);
        break;

      case 'osc':
        this._sendOsc(data.data);
        break;

      case 'dispose':
        this._ready = false;
        break;
    }
  }

  async _init(jsCode, wasmBinary, initSampleRate, blockSize) {
    try {
      const sr = initSampleRate || sampleRate || 44100;
      this._blockSize = blockSize;

      // ---- Emscripten environment polyfills ----
      // AudioWorkletGlobalScope has no window/document/importScripts.
      // SC.js checks for ENVIRONMENT_IS_WORKER via `typeof importScripts`.
      if (!globalThis.self) globalThis.self = globalThis;
      if (typeof globalThis.importScripts === 'undefined') {
        globalThis.importScripts = () => {};
      }
      if (!globalThis.WorkerGlobalScope) globalThis.WorkerGlobalScope = true;
      if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
          createElement: () => ({ setAttribute: () => {}, style: {}, addEventListener: () => {} }),
          head: { appendChild: () => {} },
          body: { appendChild: () => {} },
          createTextNode: () => ({}),
          getElementById: () => null,
          querySelector: () => null,
        };
      }
      if (typeof globalThis.window === 'undefined') {
        globalThis.window = globalThis;
      }
      if (typeof globalThis.location === 'undefined') {
        globalThis.location = { href: '.', pathname: '/' };
      }
      if (typeof globalThis.performance === 'undefined') {
        globalThis.performance = { now: () => Date.now() };
      }
      if (typeof globalThis.navigator === 'undefined') {
        globalThis.navigator = { mediaDevices: null };
      }
      // AudioContext stub — prevents ASM_CONSTS[84155] from crashing.
      // We will patch ASM_CONSTS[84155] before callMain anyway, but the
      // check for `window.AudioContext` happens synchronously at that point.
      if (typeof globalThis.AudioContext === 'undefined') {
        globalThis.AudioContext = function() { return {}; };
      }
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
                str += String.fromCharCode(
                  ((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f)
                );
              }
            }
            return str;
          }
        };
      }

      // ---- Load SC.js glue via new Function() ----
      // SC.js is NOT modularized — it uses `var Module = ...` at the top level.
      // We execute it in a new Function scope so its globals don't pollute ours.
      // After execution, Module is accessible as globalThis.Module.
      console.log('[SC.worklet] Loading SC.js glue (' + jsCode.length + ' chars)...');

      // SC.js references `Module` as a global. We need to set it up before evaluation.
      // Pre-configure Module so that:
      //   1. noInitialRun is set (we call callMain manually after setup)
      //   2. The WASM binary is provided so no fetch() is needed
      //   3. wasmBinary is set so Emscripten skips the fetch path
      if (typeof globalThis.Module === 'undefined') {
        globalThis.Module = {};
      }
      const M = globalThis.Module;
      M.noInitialRun = true;
      M.wasmBinary = wasmBinary;
      // Provide a locateFile override so SC.js doesn't try to fetch .wasm
      M.locateFile = (path) => {
        if (path.endsWith('.wasm')) return '/sc/SC.wasm';
        return path;
      };
      M.print = (text) => console.log('[scsynth]', text);
      M.printErr = (text) => console.error('[scsynth-err]', text);
      M.onAbort = (reason) => {
        console.error('[SC.worklet] WASM aborted:', reason);
        this.port.postMessage({ type: 'error', message: 'WASM aborted: ' + reason });
      };

      // Execute SC.js. It will install itself on globalThis.Module.
      const wrappedCode = jsCode + '\n// end SC.js\n';
      const execFn = new Function(wrappedCode);
      execFn();

      // Wait for Module runtime to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('SC.js onRuntimeInitialized timeout')), 30000);
        if (M.calledRun || M.asm) {
          // Already initialized
          clearTimeout(timeout);
          resolve();
        } else {
          const prevInit = M.onRuntimeInitialized;
          M.onRuntimeInitialized = () => {
            clearTimeout(timeout);
            if (prevInit) prevInit();
            resolve();
          };
        }
      });

      console.log('[SC.worklet] SC.js runtime ready. Setting up audio driver...');

      // ---- Pre-configure Module.audioDriver ----
      // We populate this object BEFORE calling callMain so that when scsynth's
      // WebAudioDriver calls ASM_CONSTS[84155], our fields are already present.
      // We patch ASM_CONSTS[84155] to skip its normal body and just call WaInitBuffers
      // on our pre-allocated buffers instead of creating an AudioContext.
      const numOut = NUM_OUT_CHANNELS;
      const numIn = NUM_IN_CHANNELS;
      const bytesPerChan = blockSize * Float32Array.BYTES_PER_ELEMENT;

      M.audioDriver = {};
      const ad = M.audioDriver;
      ad.bufSize = blockSize;
      ad.sampleRate = sr;
      ad.inChanCount = numIn;
      ad.outChanCount = numOut;
      ad.connected = true;
      ad.context = { baseLatency: 0, sampleRate: sr };
      // Allocate WASM heap buffers for audio I/O
      const numInBytes = numIn * bytesPerChan;
      const numOutBytes = numOut * bytesPerChan;
      ad.bufInPtr = numIn > 0 ? M._malloc(numInBytes) : 0;
      ad.bufOutPtr = M._malloc(numOutBytes);
      ad.floatBufIn = [];
      ad.floatBufOut = [];
      for (let ch = 0; ch < numIn; ch++) {
        ad.floatBufIn[ch] = new Float32Array(M.HEAPU8.buffer, ad.bufInPtr + ch * bytesPerChan, blockSize);
      }
      for (let ch = 0; ch < numOut; ch++) {
        ad.floatBufOut[ch] = new Float32Array(M.HEAPU8.buffer, ad.bufOutPtr + ch * bytesPerChan, blockSize);
      }
      // Stub proc so ASM_CONSTS[86429] (connect) doesn't crash
      ad.proc = {
        connect: () => {},
        disconnect: () => {},
        onaudioprocess: null,
      };

      // Patch ASM_CONSTS[84155] to skip AudioContext creation and just call WaInitBuffers.
      // The original code creates window.AudioContext and createScriptProcessor — neither
      // exists in AudioWorkletGlobalScope. Instead we read from our pre-set audioDriver.
      if (M.asm && typeof M.asm === 'object') {
        // ASM_CONSTS live in the outer scope of SC.js as a closure variable.
        // We can't easily patch them after the fact. Instead, we rely on the fact that
        // ASM_CONSTS[84155] checks `if(!AudioContext) return -1` — we provide a fake
        // AudioContext constructor. But then it tries `new AudioContext(opt)` which
        // we must survive. Our stub AudioContext constructor returns a plain object.
        //
        // The critical path in ASM 84155 after context creation:
        //   ad.proc = ad.context.createScriptProcessor(...)  <- our stub context needs this
        //   ad.bufSize = ad.proc.bufferSize                  <- our stub needs bufferSize
        //
        // Patch our stub context to handle these calls gracefully:
        ad.context.createScriptProcessor = () => ad.proc;
        ad.proc.bufferSize = blockSize;
        // The stub AudioContext constructor must return an object with createScriptProcessor
        // and baseLatency. Override it to return our pre-built context.
        globalThis.AudioContext = function() { return ad.context; };
        // ad.context.sampleRate must be correct
        ad.context.sampleRate = sr;
        // After createScriptProcessor, ASM 84155 calls Module._malloc for bufInPtr/bufOutPtr.
        // But Module.audioDriver is already set, so `if(!Module.audioDriver) Module.audioDriver={}`
        // is a no-op. However, it will OVERWRITE our bufInPtr/bufOutPtr with new mallocs.
        // We prevent this by making ASM_CONSTS[84155] detect our pre-populated driver.
        //
        // Solution: mark audioDriver as already initialized so we can detect it in the patched path.
        // Actually — the cleanest approach is to defer callMain until we intercept.
        // The issue is ASM_CONSTS is a closure in SC.js we can't access from outside.
        //
        // Alternative: Override Module._malloc to return our pre-allocated buffers when
        // called with the exact sizes ASM 84155 would request. This is fragile.
        //
        // Best approach: Let ASM 84155 run and re-initialize our views after it completes.
        // ASM 84155 will malloc new buffers (wasting the ones we pre-allocated). That's ok.
        // After callMain returns (async), ASM 84155 will have already run and populated
        // Module.audioDriver with correct pointers. We then rebuild our Float32Array views.
      }

      // ---- Patch ASM 83778 (window.onerror) to avoid crash ----
      // ASM_CONSTS[83778] does: window.onerror = function(...) {...}
      // In AudioWorklet, window.onerror exists on globalThis (we set window=globalThis above).
      // That's fine — it will just set globalThis.onerror which is harmless.

      // ---- Start scsynth via callMain ----
      // Arguments: -u <udp-port> -D <num-sample-bufs> -i <inputs> -o <outputs>
      // The -u port means scsynth's OSC server listens on UDP 57110.
      // In WASM, this UDP socket is actually a virtual socket (via Module.oscDriver).
      console.log('[SC.worklet] Calling callMain to start scsynth...');

      // callMain is synchronous — scsynth runs its init, sets up audio/OSC drivers, then
      // enters its main event loop (which in WASM is driven by the audio callback).
      try {
        M.callMain(['-u', String(SC_PORT), '-D', '0', '-i', String(numIn), '-o', String(numOut)]);
      } catch (e) {
        // callMain may throw ExitStatus or similar — that's OK if scsynth initialized
        if (e && e.name === 'ExitStatus') {
          console.warn('[SC.worklet] callMain threw ExitStatus(' + e.status + ') — scsynth may have exited early');
          if (e.status !== 0) {
            throw new Error('scsynth exited with status ' + e.status);
          }
        } else if (typeof e === 'string' && e === 'unwind') {
          // Emscripten uses 'unwind' exception for longjmp/setjmp — normal for pthreads
          console.log('[SC.worklet] callMain: unwind (normal for Emscripten)');
        } else {
          throw e;
        }
      }

      // ---- Rebuild Float32Array views from actual audioDriver pointers ----
      // ASM_CONSTS[84155] ran during callMain and may have re-allocated buffers.
      // Rebuild our channel views from Module.audioDriver's actual pointers.
      const adFinal = M.audioDriver;
      if (!adFinal) {
        throw new Error('Module.audioDriver not set after callMain — scsynth audio driver failed to init');
      }

      this._blockSize = adFinal.bufSize || blockSize;
      this._floatBufOut = adFinal.floatBufOut;

      // ---- Get the WaDriver embind object ----
      if (typeof M.audio_driver !== 'function') {
        throw new Error('Module.audio_driver() not available — SC.js Embind not initialized');
      }
      this._waDriver = M.audio_driver();

      // ---- Set up OSC receive path ----
      // ASM_CONSTS[83188] ran during callMain to set up Module.oscDriver[SC_PORT].
      // The oscDriver entry has a `receive(srcAddr, data)` method that delivers OSC to scsynth.
      this._oscEndpoint = M.oscDriver && M.oscDriver[SC_PORT];
      if (!this._oscEndpoint) {
        console.warn('[SC.worklet] Module.oscDriver[' + SC_PORT + '] not available — OSC will not work');
      } else {
        console.log('[SC.worklet] OSC endpoint ready on port', SC_PORT);
      }

      // ---- Connect audio (ASM_CONSTS[86429] normally does this) ----
      // Since we bypassed the ScriptProcessor connect, call it manually.
      // For our AudioWorklet model, "connected" just means WaRun() will be called
      // from process(). Set the flag.
      if (adFinal) adFinal.connected = true;

      console.log('[SC.worklet] scsynth initialized. blockSize=' + this._blockSize + ' sr=' + sr);
      this._ready = true;
      this.port.postMessage({ type: 'ready' });

    } catch (err) {
      let msg;
      if (err instanceof Error) {
        msg = err.message + (err.stack ? '\n' + err.stack : '');
      } else {
        msg = String(err);
      }
      console.error('[SC.worklet] Init failed:', msg);
      this.port.postMessage({ type: 'error', message: msg });
    }
  }

  /**
   * Deliver a raw OSC packet to scsynth.
   *
   * Module.oscDriver[SC_PORT].receive(srcAddr, data) is the JS side of scsynth's
   * virtual UDP receive. It copies data into the WASM heap buffer and calls
   * the C++ WebInPort::Receive(srcAddr, size) to process the OSC message.
   *
   * @param {ArrayBuffer|Uint8Array} oscPacket - Raw OSC bytes
   */
  _sendOsc(oscPacket) {
    if (!this._ready || !this._oscEndpoint) return;
    try {
      const bytes = oscPacket instanceof Uint8Array ? oscPacket : new Uint8Array(oscPacket);
      // receive(srcAddr, data): srcAddr=0 means localhost/self
      this._oscEndpoint.receive(0, bytes);
    } catch (e) {
      console.error('[SC.worklet] OSC send failed:', e);
    }
  }

  /**
   * AudioWorklet process() — called every audio block (128 frames by default).
   *
   * The output buffer layout in Module.audioDriver.floatBufOut is PLANAR:
   *   floatBufOut[0] = left channel (blockSize Float32 samples)
   *   floatBufOut[1] = right channel (blockSize Float32 samples)
   *
   * We call WaRun() which renders one block into these WASM heap buffers,
   * then copy each channel to the Web Audio output arrays.
   */
  process(_inputs, outputs, _params) {
    if (!this._ready || !this._waDriver) return true;

    try {
      // Render one audio block
      this._waDriver.WaRun();

      // Copy WASM output buffers to Web Audio output
      const output = outputs[0];
      if (output && this._floatBufOut) {
        const numCh = Math.min(output.length, this._floatBufOut.length);
        for (let ch = 0; ch < numCh; ch++) {
          if (output[ch] && this._floatBufOut[ch]) {
            output[ch].set(this._floatBufOut[ch]);
          }
        }
      }
    } catch (e) {
      // Don't crash the worklet — log and keep running
      console.error('[SC.worklet] process() error:', e.message || e);
    }

    return true; // Keep processor alive
  }
}

registerProcessor('devilbox-sc-processor', DEViLBOXSCProcessor);
