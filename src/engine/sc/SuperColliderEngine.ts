/**
 * SuperColliderEngine.ts - Singleton scsynth WASM engine wrapper
 *
 * Runs scsynth on the MAIN THREAD using ScriptProcessorNode. SC.wasm is compiled
 * with Emscripten pthreads which require Web Workers — these are unavailable in
 * AudioWorkletGlobalScope but work on the main thread.
 *
 * Architecture:
 *   Main thread loads SC.js → callMain() boots scsynth → ScriptProcessor output
 *   OSC sent directly via Module.oscDriver[57110].receive(0, data)
 *
 * Follows the UADEEngine pattern: static getInstance(AudioContext) with WeakMap caching.
 */

const SC_PORT = 57110;

// Emscripten Module type (partial — just what we use)
interface SCModule {
  callMain(args: string[]): void;
  audioDriver: {
    proc: ScriptProcessorNode;
    bufOutPtr: number;
    outChanCount: number;
    connected: boolean;
    context: AudioContext;
  };
  oscDriver: Record<number, {
    receive: (addr: number, data: Uint8Array) => void;
  }>;
  print: (text: string) => void;
  printErr: (text: string) => void;
  locateFile?: (path: string) => string;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  noInitialRun: boolean;
}

const instanceCache = new WeakMap<AudioContext, Promise<SuperColliderEngine>>();

export class SuperColliderEngine {
  readonly output: GainNode;

  private _module: SCModule | null = null;
  private _disposed = false;

  private constructor(module: SCModule, output: GainNode) {
    this._module = module;
    this.output = output;
  }

  // ---------------------------------------------------------------------------
  // Singleton factory
  // ---------------------------------------------------------------------------

  static getInstance(
    audioContext: AudioContext,
    synthDefBinary?: Uint8Array,
    synthDefName?: string,
  ): Promise<SuperColliderEngine> {
    const cached = instanceCache.get(audioContext);
    if (cached) return cached;

    const promise = SuperColliderEngine._boot(audioContext, synthDefBinary, synthDefName);
    promise.catch(() => instanceCache.delete(audioContext));
    instanceCache.set(audioContext, promise);
    return promise;
  }

  private static async _boot(
    audioContext: AudioContext,
    synthDefBinary?: Uint8Array,
    synthDefName?: string,
  ): Promise<SuperColliderEngine> {
    const baseUrl = import.meta.env.BASE_URL ?? '/';
    const jsUrl = `${baseUrl}sc/SC.js`;
    const wasmUrl = `${baseUrl}sc/SC.wasm`;
    const workerUrl = `${baseUrl}sc/SC.worker.js`;

    console.log('[SC:Engine] Booting scsynth on main thread (pthreads build)...');

    // Set up Module config BEFORE loading SC.js
    const M: Partial<SCModule> & Record<string, unknown> = {
      noInitialRun: true,
      // Route scsynth output to console
      print: (text: string) => console.log('[scsynth]', text),
      printErr: (text: string) => console.warn('[scsynth]', text),
      // Tell Emscripten where to find .wasm and .worker.js
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) return wasmUrl;
        if (path.endsWith('.worker.js')) return workerUrl;
        return `${baseUrl}sc/${path}`;
      },
    };
    (globalThis as Record<string, unknown>).Module = M;

    // Patch AudioContext to return OUR context (scsynth will create ScriptProcessor on it)
    const OrigAC = globalThis.AudioContext;
    const origWebkitAC = (globalThis as Record<string, unknown>).webkitAudioContext;
    globalThis.AudioContext = function() { return audioContext; } as unknown as typeof AudioContext;
    (globalThis as Record<string, unknown>).webkitAudioContext = globalThis.AudioContext;

    // Load SC.js via script tag
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = jsUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('[SC:Engine] Failed to load SC.js'));
      document.head.appendChild(script);
    });

    // Wait for WASM compilation to finish
    const module = (globalThis as Record<string, unknown>).Module as SCModule & {
      ready?: Promise<unknown>;
      onRuntimeInitialized?: () => void;
    };

    // Emscripten provides onRuntimeInitialized callback or we poll for callMain
    if (module.ready) {
      await module.ready;
    } else {
      await new Promise<void>((resolve, reject) => {
        // Try onRuntimeInitialized first
        const origCb = module.onRuntimeInitialized;
        module.onRuntimeInitialized = () => {
          if (origCb) origCb();
          resolve();
        };
        // Also poll in case onRuntimeInitialized already fired
        let tries = 0;
        const check = () => {
          if (typeof module.callMain === 'function') return resolve();
          if (++tries > 200) return reject(new Error('[SC:Engine] Timeout waiting for WASM'));
          setTimeout(check, 100);
        };
        setTimeout(check, 200);
      });
    }

    console.log('[SC:Engine] WASM ready, calling callMain...');

    // Boot scsynth with 0 inputs, 2 outputs
    // AudioContext is still patched so ASM_CONSTS can create ScriptProcessor
    try {
      module.callMain(['-u', String(SC_PORT), '-D', '0', '-i', '0', '-o', '2']);
    } catch (e) {
      // callMain may throw ExitStatus or pthread-related errors — continue if audio driver exists
      console.warn('[SC:Engine] callMain threw:', e);
    }

    // Restore original AudioContext constructor (AFTER callMain)
    globalThis.AudioContext = OrigAC;
    if (origWebkitAC) {
      (globalThis as Record<string, unknown>).webkitAudioContext = origWebkitAC;
    }

    console.log('[SC:Engine] callMain complete, checking audio driver...');

    // Wait briefly for async init to complete (pthreads may still be starting)
    await new Promise(r => setTimeout(r, 500));

    // Verify the audio driver was set up
    if (!module.audioDriver?.proc) {
      throw new Error('[SC:Engine] scsynth did not create a ScriptProcessor');
    }

    // Create output GainNode and route ScriptProcessor through it EXCLUSIVELY.
    // Disconnect proc from destination (scsynth connects it there during init)
    // so all audio goes through our gain-controlled output only.
    const output = audioContext.createGain();
    output.gain.value = 1.0;
    try { module.audioDriver.proc.disconnect(audioContext.destination); } catch { /* may not be connected */ }
    module.audioDriver.proc.connect(output);
    // Temporarily connect output→destination so onaudioprocess keeps firing during
    // SynthDef loading. SuperColliderSynth will disconnect this after taking over.
    output.connect(audioContext.destination);
    module.audioDriver.connected = true;
    console.log('[SC:Engine] ScriptProcessor → GainNode → destination (temporary)');

    // Keep Module on globalThis — scsynth pthreads need it for their lifecycle.

    const engine = new SuperColliderEngine(module, output);

    // Load SynthDef if provided — then wait for scsynth to process it.
    // The ScriptProcessor callback runs WaRun() which processes the OSC queue.
    if (synthDefBinary && module.oscDriver?.[SC_PORT]) {
      engine._loadSynthDefBinary(synthDefBinary, synthDefName ?? 'mySynth');
      // Wait for several ScriptProcessor cycles (1024 samples / 48kHz ≈ 21ms each)
      await new Promise(r => setTimeout(r, 1500));
    }

    console.log('[SC:Engine] Boot complete, SynthDef loaded:', !!synthDefBinary);
    return engine;
  }

  // ---------------------------------------------------------------------------
  // OSC helpers
  // ---------------------------------------------------------------------------

  private static _oscStr(s: string): Uint8Array {
    const enc = new TextEncoder();
    const raw = enc.encode(s);
    const padded = new Uint8Array((raw.length + 4) & ~3);
    padded.set(raw);
    return padded;
  }

  private static _oscI32(v: number): Uint8Array {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, v, false);
    return new Uint8Array(buf);
  }

  private static _oscF32(v: number): Uint8Array {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, v, false);
    return new Uint8Array(buf);
  }

  private static _concatU8(...arrs: Uint8Array[]): Uint8Array {
    const total = arrs.reduce((a, b) => a + b.byteLength, 0);
    const msg = new Uint8Array(total);
    let off = 0;
    for (const a of arrs) { msg.set(a, off); off += a.byteLength; }
    return msg;
  }

  private _sendOsc(data: Uint8Array): void {
    if (!this._module?.oscDriver?.[SC_PORT]) return;
    this._module.oscDriver[SC_PORT].receive(0, data);
  }

  // ---------------------------------------------------------------------------
  // SynthDef loading
  // ---------------------------------------------------------------------------

  private _loadSynthDefBinary(binary: Uint8Array, defName: string): void {
    // Build /d_recv OSC: [addr][tags][blob-size][blob-data][padding]
    const { _oscStr, _concatU8 } = SuperColliderEngine;
    const addr = _oscStr('/d_recv');
    const tags = _oscStr(',b');
    const blobSize = new Uint8Array(4);
    new DataView(blobSize.buffer).setUint32(0, binary.byteLength, false);
    const blobPad = new Uint8Array((4 - (binary.byteLength % 4)) % 4);
    const oscMsg = _concatU8(addr, tags, blobSize, binary, blobPad);

    this._sendOsc(oscMsg);
    console.log('[SC:Engine] SynthDef loaded:', defName, 'binary:', binary.byteLength, 'bytes');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  loadSynthDef(binary: Uint8Array, defName?: string): void {
    this._loadSynthDefBinary(binary, defName ?? 'mySynth');
  }

  noteOn(nodeId: number, defName: string, params: Record<string, number>): void {
    const { _oscStr, _oscI32, _oscF32, _concatU8 } = SuperColliderEngine;
    const freq = params.freq ?? 440;
    const amp = params.amp ?? 0.5;

    const osc = _concatU8(
      _oscStr('/s_new'), _oscStr(',siiisfsfsf'),
      _oscStr(defName),
      _oscI32(nodeId), _oscI32(0), _oscI32(0),
      _oscStr('freq'), _oscF32(freq),
      _oscStr('amp'), _oscF32(amp),
      _oscStr('gate'), _oscF32(1.0),
    );
    this._sendOsc(osc);
    console.log('[SC:Engine] noteOn:', nodeId, defName, 'freq=', freq.toFixed(1), 'amp=', amp.toFixed(2));
  }

  noteOff(nodeId: number): void {
    const { _oscStr, _oscI32, _oscF32, _concatU8 } = SuperColliderEngine;
    const osc = _concatU8(
      _oscStr('/n_set'), _oscStr(',isf'),
      _oscI32(nodeId),
      _oscStr('gate'), _oscF32(0.0),
    );
    this._sendOsc(osc);
  }

  setNodeParams(nodeId: number, params: Record<string, number>): void {
    const { _oscStr, _oscI32, _oscF32, _concatU8 } = SuperColliderEngine;
    for (const [key, value] of Object.entries(params)) {
      const osc = _concatU8(
        _oscStr('/n_set'), _oscStr(',isf'),
        _oscI32(nodeId),
        _oscStr(key), _oscF32(value),
      );
      this._sendOsc(osc);
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._module?.audioDriver?.proc) {
      try { this._module.audioDriver.proc.disconnect(); } catch { /* ignore */ }
    }
  }
}
