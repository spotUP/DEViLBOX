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
  /**
   * Custom AudioParams for note control. Port messages to the worklet
   * are blocked once process()/WaRun() starts running, so we use
   * AudioParams as a lock-free communication channel.
   *
   * - gate:  0 → 1 triggers note-on, 1 → 0 triggers note-off
   * - freq:  note frequency in Hz
   * - amp:   note amplitude 0-1
   */
  static get parameterDescriptors() {
    return [
      { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'freq', defaultValue: 440, minValue: 20, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'amp', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();

    this._ready = false;
    this._waDriver = null;
    this._oscEndpoint = null;
    this._floatBufOut = null;
    this._blockSize = 128;
    this._prevGate = 0;
    this._currentNodeId = 0;
    this._synthDefName = '';

    this.port.onmessage = (evt) => this._handleMessage(evt.data);
  }

  async _handleMessage(data) {
    switch (data.type) {
      case 'init':
        this._synthDefName = data.synthDefName || 'mySynth';
        await this._init(data.jsCode, data.wasmBinary, data.sampleRate, data.blockSize || 128, data.synthDefBinary);
        break;

      case 'osc':
        // Fallback for direct OSC if port messages work (pre-init only)
        if (this._oscEndpoint) {
          const bytes = data.data instanceof Uint8Array ? data.data : new Uint8Array(data.data);
          this._oscEndpoint.receive(0, bytes);
        }
        break;

      case 'dispose':
        this._ready = false;
        break;
    }
  }

  async _init(jsCode, wasmBinary, initSampleRate, blockSize, synthDefBinary) {
    try {
      const sr = initSampleRate || sampleRate || 44100;
      this._blockSize = blockSize; // Temporary default; overwritten below from adFinal.bufSize

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

      // ---- setTimeout/clearTimeout polyfill ----
      // AudioWorkletGlobalScope does not expose setTimeout/clearTimeout.
      // SC.js (Emscripten) uses them internally, so we polyfill via Promise microtasks.
      if (typeof globalThis.setTimeout === 'undefined') {
        // AudioWorkletGlobalScope has no setTimeout, MessageChannel, or XHR.
        // Use Promise microtasks as a zero-delay shim — sufficient for Emscripten's
        // internal setTimeout(fn, 0) deferred-run calls. Actual delay is ignored.
        let _nextId = 1;
        const _timers = new Set();
        globalThis.setTimeout = (fn, _delay) => {
          const id = _nextId++;
          _timers.add(id);
          Promise.resolve().then(() => {
            if (_timers.has(id)) { _timers.delete(id); fn(); }
          });
          return id;
        };
        globalThis.clearTimeout = (id) => { _timers.delete(id); };
        globalThis.setInterval = (fn, _delay) => globalThis.setTimeout(fn, _delay);
        globalThis.clearInterval = (id) => globalThis.clearTimeout(id);
      }

      // ---- Worker polyfill ----
      // SC.wasm is compiled with Emscripten pthreads (-pthread). When callMain runs,
      // scsynth calls pthread_create(), which Emscripten implements by spawning Web Workers.
      // AudioWorkletGlobalScope has no Worker constructor, so this crashes.
      //
      // We don't need pthreads to function: audio is driven synchronously via WaRun()
      // from process(), and OSC is handled via direct function calls. The mock lets
      // pthread_create() return without crashing; the "threads" simply never run.
      if (typeof globalThis.Worker === 'undefined') {
        globalThis.Worker = class MockWorker {
          constructor() {}
          postMessage() {}
          terminate() {}
          addEventListener() {}
          removeEventListener() {}
          dispatchEvent() { return false; }
          set onmessage(_) {}
          get onmessage() { return null; }
          set onerror(_) {}
          get onerror() { return null; }
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
      // Fallback only — wasmBinary above already provides the binary directly,
      // so Emscripten never calls locateFile in practice. Kept as a safety net.
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

      // Execute SC.js. Pass M as the 'Module' parameter so SC.js's local
      // `var Module = typeof Module != "undefined" ? Module : {}` resolves to M.
      // Without this, SC.js's var declaration creates a local {} that shadows
      // globalThis.Module, causing it to ignore our wasmBinary and try to XHR-fetch.
      const wrappedCode = jsCode + '\n// end SC.js\n';
      const execFn = new Function('Module', wrappedCode);
      execFn(M);

      // Wait for Module runtime to be ready.
      // WebAssembly.instantiate() is always async even when wasmBinary is provided,
      // so M.calledRun is typically false immediately after execFn(M) returns.
      // We cannot implement a meaningful timeout here because our setTimeout polyfill
      // fires as a microtask (zero real delay) — a 30-second timeout would fire
      // immediately and reject the promise before WASM has a chance to init.
      // Instead, just wait for onRuntimeInitialized with no timeout.
      await new Promise((resolve) => {
        if (M.calledRun || M.asm) {
          resolve();
          return;
        }
        const prevInit = M.onRuntimeInitialized;
        M.onRuntimeInitialized = () => {
          if (prevInit) prevInit();
          resolve();
        };
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
      if (!this._floatBufOut || this._floatBufOut.length < NUM_OUT_CHANNELS) {
        throw new Error(
          'Module.audioDriver.floatBufOut missing or wrong channel count after callMain — ' +
          'ASM_CONSTS[84155] did not initialize output buffers'
        );
      }

      // ---- Get the WaDriver embind object ----
      if (typeof M.audio_driver !== 'function') {
        throw new Error('Module.audio_driver() not available — SC.js Embind not initialized');
      }
      this._waDriver = M.audio_driver();

      // ---- CRITICAL: Reinitialize buffers ----
      // ASM_CONSTS[84155] called WaInitBuffers during callMain, but the WASM heap may have
      // grown (invalidating Float32Array views) and the buffer pointers may have changed.
      // Re-call WaInitBuffers with the ACTUAL audioDriver pointers to ensure the C++ side
      // has correct output buffer locations.
      const waDriverMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(this._waDriver));
      this.port.postMessage({ type: 'debug', msg: 'WaDriver methods: ' + waDriverMethods.join(', ') });
      if (adFinal && typeof this._waDriver.WaInitBuffers === 'function') {
        const latency = 0;
        // Rebuild Float32Array views FIRST (WASM heap may have grown during callMain)
        const bytesPerChan = this._blockSize * 4;
        for (let ch = 0; ch < adFinal.outChanCount; ch++) {
          adFinal.floatBufOut[ch] = new Float32Array(M.HEAPU8.buffer, adFinal.bufOutPtr + ch * bytesPerChan, this._blockSize);
        }
        for (let ch = 0; ch < adFinal.inChanCount; ch++) {
          adFinal.floatBufIn[ch] = new Float32Array(M.HEAPU8.buffer, adFinal.bufInPtr + ch * bytesPerChan, this._blockSize);
        }
        this._floatBufOut = adFinal.floatBufOut;
        this._waDriver.WaInitBuffers(
          adFinal.bufInPtr, adFinal.inChanCount,
          adFinal.bufOutPtr, adFinal.outChanCount,
          this._blockSize, sr, latency
        );
        this.port.postMessage({ type: 'debug', msg: 'WaInitBuffers called: bufOut=' + adFinal.bufOutPtr +
          ' outCh=' + adFinal.outChanCount + ' bs=' + this._blockSize + ' sr=' + sr });
      } else {
        console.warn('[SC.worklet] WaInitBuffers not available — audio may not work');
      }

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
      if (adFinal) adFinal.connected = true;

      // ---- Load SynthDef binary if provided with init message ----
      // This MUST happen before _ready=true so the def is loaded before process()
      // starts calling WaRun(). Port messages are blocked once process() runs.
      if (synthDefBinary && this._oscEndpoint) {
        const defBytes = synthDefBinary instanceof Uint8Array ? synthDefBinary : new Uint8Array(synthDefBinary);
        const addrBytes = [0x2f, 0x64, 0x5f, 0x72, 0x65, 0x63, 0x76, 0x00]; // "/d_recv\0"
        const typeBytes = [0x2c, 0x62, 0x00, 0x00]; // ",b\0\0"
        const blobLen = defBytes.byteLength;
        const paddedLen = (blobLen + 3) & ~3;
        const oscMsg = new Uint8Array(addrBytes.length + typeBytes.length + 4 + paddedLen);
        let off = 0;
        oscMsg.set(addrBytes, off); off += addrBytes.length;
        oscMsg.set(typeBytes, off); off += typeBytes.length;
        oscMsg[off++] = (blobLen >>> 24) & 0xff;
        oscMsg[off++] = (blobLen >>> 16) & 0xff;
        oscMsg[off++] = (blobLen >>> 8) & 0xff;
        oscMsg[off++] = blobLen & 0xff;
        oscMsg.set(defBytes, off);
        this.port.postMessage({ type: 'debug', msg: 'Loading SynthDef: binary=' + defBytes.byteLength + 'b osc=' + oscMsg.byteLength + 'b defName=' + this._synthDefName });
        let drecvResult = 'ok';
        try {
          this._oscEndpoint.receive(0, oscMsg);
        } catch (e) {
          drecvResult = 'ERR:' + (typeof e === 'number' ? 'WASM_PTR:' + e : e.message || e);
        }
        for (let i = 0; i < 4; i++) this._waDriver.WaRun();
        this.port.postMessage({ type: 'debug', msg: 'SynthDef loaded (' + drecvResult + '), ran 4 warm-up blocks' });

        // TEST: Verify byteBuf is on current WASM heap, and test receive path
        try {
          const M = globalThis.Module;
          const ep = this._oscEndpoint;
          const ad = M.audioDriver;
          const results = [];

          // Test 1: Verify byteBuf points to current WASM heap
          const heapBuf = M.HEAPU8.buffer;
          const epBuf = ep.byteBuf.buffer;
          const sameHeap = heapBuf === epBuf;
          results.push('sameHeap=' + sameHeap);
          results.push('heapSize=' + heapBuf.byteLength);
          results.push('epBufSize=' + epBuf.byteLength);
          results.push('bufPtr=' + ep.bufPtr);

          // Test 2: Write marker to byteBuf, read from HEAPU8
          ep.byteBuf[0] = 0xDE;
          ep.byteBuf[1] = 0xAD;
          const readBack0 = M.HEAPU8[ep.bufPtr];
          const readBack1 = M.HEAPU8[ep.bufPtr + 1];
          results.push('marker:write=DEAD,read=' +
            readBack0.toString(16) + readBack1.toString(16));

          // If stale, rebuild the byteBuf
          if (!sameHeap) {
            results.push('REBUILDING_BYTEBUF');
            ep.byteBuf = new Uint8Array(M.HEAPU8.buffer, ep.bufPtr, ep.byteBuf.length);
            // Re-test
            ep.byteBuf[0] = 0xBE;
            ep.byteBuf[1] = 0xEF;
            const rb0 = M.HEAPU8[ep.bufPtr];
            const rb1 = M.HEAPU8[ep.bufPtr + 1];
            results.push('rebuilt:write=BEEF,read=' + rb0.toString(16) + rb1.toString(16));
          }

          // Test 3: Try send /dumpOSC 1 and check if prints appear
          const logs = [];
          const origPrint = M.print;
          const origPrintErr = M.printErr;
          M.print = function(t) { logs.push('OUT:' + t); };
          M.printErr = function(t) { logs.push('ERR:' + t); };

          // Build /dumpOSC 1
          const enc = new TextEncoder();
          function oscStr(s) {
            const raw = enc.encode(s);
            const padded = new Uint8Array((raw.length + 4) & ~3);
            padded.set(raw);
            return padded;
          }
          function oscI32(v) {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setInt32(0, v, false);
            return new Uint8Array(buf);
          }
          function concatU8(...arrs) {
            const total = arrs.reduce((a, b) => a + b.byteLength, 0);
            const msg = new Uint8Array(total);
            let o = 0;
            for (const a of arrs) { msg.set(a, o); o += a.byteLength; }
            return msg;
          }

          const dumpOscMsg = concatU8(oscStr('/dumpOSC'), oscStr(',i'), oscI32(1));
          ep.receive(0, dumpOscMsg);
          for (let i = 0; i < 5; i++) this._waDriver.WaRun();
          results.push('dumpLogs=' + logs.length + ':' + logs.slice(0, 5).join('|'));
          logs.length = 0;

          // Test 4: Send /notify 1 (which should produce a /done response)
          const notifyMsg = concatU8(oscStr('/notify'), oscStr(',i'), oscI32(1));
          ep.receive(0, notifyMsg);
          for (let i = 0; i < 5; i++) this._waDriver.WaRun();
          results.push('notifyLogs=' + logs.length + ':' + logs.slice(0, 5).join('|'));
          logs.length = 0;

          // Test 5: Check if there's a way to read scsynth's error state
          // Check if _sc_SetPrintFunc or similar exists
          const scFuncs = [];
          for (const k in M) {
            if (typeof M[k] === 'function' && (k.includes('sc') || k.includes('SC') || k.includes('World') || k.includes('print'))) {
              scFuncs.push(k);
            }
          }
          results.push('scFuncs=' + scFuncs.slice(0, 10).join(','));

          // Test 6: Try calling WaRun and examine more of the heap around bufOutPtr
          for (let i = 0; i < 50; i++) this._waDriver.WaRun();
          const heapF32 = M.HEAPF32;
          const base = ad.bufOutPtr >>> 2;
          let maxOut = 0;
          // Check wider range
          for (let off = -100; off < 1024; off++) {
            const v = Math.abs(heapF32[base + off]);
            if (v > 0.0001 && v < 100) {
              results.push('nonzero@' + off + '=' + v.toFixed(6));
              if (results.length > 25) break;
            }
            if (v > maxOut && v < 100) maxOut = v;
          }
          results.push('maxOut=' + maxOut.toFixed(6));

          M.print = origPrint;
          M.printErr = origPrintErr;

          this.port.postMessage({ type: 'debug', msg: 'DIAG2: ' + results.join(' | ') });
        } catch (testErr) {
          this.port.postMessage({ type: 'debug', msg: 'TEST ERROR: ' + (testErr.message || testErr) });
        }
      } else {
        this.port.postMessage({ type: 'debug', msg: 'NO SynthDef binary: synthDefBinary=' + !!synthDefBinary + ' oscEndpoint=' + !!this._oscEndpoint });
      }

      console.log('[SC.worklet] scsynth initialized. blockSize=' + this._blockSize + ' sr=' + sr);
      this._ready = true;
      this.port.onmessage = (evt) => this._handleMessage(evt.data);
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
   * Build an OSC /s_new message for scsynth.
   * Format: "/s_new\0\0" + ",siiisfsf\0\0\0" + defName + nodeId + addAction + targetId + paramPairs
   */
  _buildNoteOnOsc(defName, nodeId, freq, amp) {
    // /s_new defName nodeId 0 0 freq <f> amp <a> gate 1.0
    // ALL param values must be float (type 'f') per scsynth convention
    const enc = new TextEncoder();

    function oscString(s) {
      const raw = enc.encode(s);
      const padded = new Uint8Array((raw.length + 4) & ~3);
      padded.set(raw);
      return padded;
    }
    function oscInt(v) {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, v, false);
      return new Uint8Array(buf);
    }
    function oscFloat(v) {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, v, false);
      return new Uint8Array(buf);
    }

    const addr = oscString('/s_new');
    const tags = oscString(',siiisfsfsf');
    const parts = [
      addr, tags,
      oscString(defName),       // s: defName
      oscInt(nodeId),            // i: nodeId
      oscInt(0),                 // i: addAction (0=addToHead)
      oscInt(0),                 // i: targetId (0=default group)
      oscString('freq'),         // s: param name
      oscFloat(freq),            // f: param value
      oscString('amp'),          // s: param name
      oscFloat(amp),             // f: param value
      oscString('gate'),         // s: param name
      oscFloat(1.0),             // f: gate value (MUST be float)
    ];
    const totalLen = parts.reduce((a, b) => a + b.byteLength, 0);
    const msg = new Uint8Array(totalLen);
    let off = 0;
    for (const p of parts) { msg.set(p, off); off += p.byteLength; }
    return msg;
  }

  /**
   * Build an OSC /n_set message to set gate=0 on a node.
   */
  _buildNoteOffOsc(nodeId) {
    const enc = new TextEncoder();
    function oscString(s) {
      const raw = enc.encode(s);
      const padded = new Uint8Array((raw.length + 4) & ~3);
      padded.set(raw);
      return padded;
    }
    function oscInt(v) {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, v, false);
      return new Uint8Array(buf);
    }
    function oscFloat(v) {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, v, false);
      return new Uint8Array(buf);
    }

    const addr = oscString('/n_set');
    const tags = oscString(',isf');
    const parts = [addr, tags, oscInt(nodeId), oscString('gate'), oscFloat(0.0)];
    const totalLen = parts.reduce((a, b) => a + b.byteLength, 0);
    const msg = new Uint8Array(totalLen);
    let off = 0;
    for (const p of parts) { msg.set(p, off); off += p.byteLength; }
    return msg;
  }

  /**
   * AudioWorklet process() — called every audio block (128 frames by default).
   *
   * Note control is via AudioParams (gate, freq, amp) since port messages
   * are blocked by WaRun() on the audio thread. When gate transitions
   * 0→1 we send /s_new OSC, when 1→0 we send /n_set gate=0.
   */
  process(_inputs, outputs, params) {
    if (!this._ready || !this._waDriver) return true;

    try {
      const gate = params.gate[0];
      const freq = params.freq[0];
      const amp = params.amp[0];

      if (gate > 0.5 && this._prevGate <= 0.5) {
        this._currentNodeId++;
        const osc = this._buildNoteOnOsc(this._synthDefName, this._currentNodeId, freq, amp);
        if (this._oscEndpoint) this._oscEndpoint.receive(0, osc);
      } else if (gate <= 0.5 && this._prevGate > 0.5) {
        if (this._currentNodeId > 0) {
          const osc = this._buildNoteOffOsc(this._currentNodeId);
          if (this._oscEndpoint) this._oscEndpoint.receive(0, osc);
        }
      }
      this._prevGate = gate;

      // Render audio
      this._waDriver.WaRun();

      // Copy output from WASM heap
      const output = outputs[0];
      if (output) {
        const M = globalThis.Module;
        const bufOutPtr = M && M.audioDriver && M.audioDriver.bufOutPtr;
        if (bufOutPtr) {
          const heapF32 = M.HEAPF32;
          const bs = this._blockSize;
          const base = bufOutPtr >>> 2;
          const numCh = Math.min(output.length, NUM_OUT_CHANNELS);
          for (let ch = 0; ch < numCh; ch++) {
            if (output[ch]) {
              output[ch].set(heapF32.subarray(base + ch * bs, base + (ch + 1) * bs));
            }
          }
        }
      }
    } catch (e) {
      console.error('[SC.worklet] process() error:', e.message || e);
    }

    return true;
  }
}

registerProcessor('devilbox-sc-processor', DEViLBOXSCProcessor);
