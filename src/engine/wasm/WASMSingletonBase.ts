/**
 * WASMSingletonBase — shared base for singleton WASM replayer/synth engines.
 *
 * 20+ engines in this codebase followed the same skeleton:
 *   • static instance + static asset cache (wasmBinary, jsCode, WeakSet/WeakMap)
 *   • constructor that wires audioContext + output gain + initPromise
 *   • static ensureInitialized(ctx) that fetches wasm + js, transforms the JS
 *     for worklet Function() exec, and calls audioWorklet.addModule
 *   • initialize() that awaits ensureInitialized then calls createNode()
 *   • ready() that returns initPromise
 *   • dispose() that posts a 'dispose' message and disconnects
 *
 * This file hoists that skeleton. Subclasses provide:
 *   • a static WASMAssetsCache (their own cache object)
 *   • their own `static instance` + getInstance/hasInstance (keeps flexibility
 *     around context-switch checks that vary per engine)
 *   • getLoaderConfig() — where to fetch the assets
 *   • createNode() — worklet wiring + message handlers (engine-specific)
 *
 * Risk: changing the init lifecycle here affects every engine that extends
 * this class. If a regression surfaces, the cleanest revert is per-engine —
 * just restore the pre-refactor implementation of the engine in question.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

/** Mutable cache stored as a static field on each subclass. */
export interface WASMAssetsCache {
  wasmBinary: ArrayBuffer | null;
  jsCode: string | null;
  loadedContexts: WeakSet<AudioContext>;
  initPromises: WeakMap<AudioContext, Promise<void>>;
}

export function createWASMAssetsCache(): WASMAssetsCache {
  return {
    wasmBinary: null,
    jsCode: null,
    loadedContexts: new WeakSet(),
    initPromises: new WeakMap(),
  };
}

export interface WASMLoaderConfig {
  /** public/<dir>/ — where the worklet + wasm + js live */
  dir: string;
  /** Filename of the AudioWorklet file, e.g. "JamCracker.worklet.js". */
  workletFile: string;
  /** Filename of the WASM binary, e.g. "JamCracker.wasm". */
  wasmFile: string;
  /**
   * Filename of the Emscripten JS glue, e.g. "JamCracker.js". Omit for engines
   * whose worklet instantiates the WASM binary directly (e.g. VocoderCore) —
   * in that case only the wasm binary is fetched and cached.
   */
  jsFile?: string;
  /**
   * Optional: override the default JS transform used to make the Emscripten
   * output runnable inside `new Function(code)` in the worklet. Most engines
   * use the default transform below — override only when your engine's JS
   * bundler produced non-standard output.
   */
  transformJS?: (code: string) => string;
  /**
   * Optional query-string to bust the worklet module cache. Only SoundMon
   * currently uses this (`?v=${Date.now()}`) so the dev loop picks up worklet
   * edits without a hard reload.
   */
  workletCacheBust?: boolean;
}

/** Default Emscripten-output → Function()-safe transform used by most engines. */
export function defaultWASMTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
    .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
}

/**
 * Fetch + transform + register the engine's assets on the given AudioContext.
 * Idempotent: once a context is loaded, further calls resolve immediately.
 * Concurrent callers share one init promise.
 */
export async function loadWASMAssets(
  context: AudioContext,
  cache: WASMAssetsCache,
  config: WASMLoaderConfig,
): Promise<void> {
  if (cache.loadedContexts.has(context)) return;
  const existing = cache.initPromises.get(context);
  if (existing) return existing;

  const promise = (async () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const workletUrl = `${baseUrl}${config.dir}/${config.workletFile}`
      + (config.workletCacheBust ? `?v=${Date.now()}` : '');

    try {
      await context.audioWorklet.addModule(workletUrl);
    } catch {
      /* Module might already be registered — not fatal. */
    }

    const needsWasm = !cache.wasmBinary;
    const needsJs = !!config.jsFile && !cache.jsCode;

    if (needsWasm || needsJs) {
      const fetches: Promise<Response>[] = [];
      if (needsWasm) fetches.push(fetch(`${baseUrl}${config.dir}/${config.wasmFile}`));
      if (needsJs) fetches.push(fetch(`${baseUrl}${config.dir}/${config.jsFile}`));
      const responses = await Promise.all(fetches);
      let idx = 0;
      if (needsWasm) {
        const r = responses[idx++];
        if (r.ok) cache.wasmBinary = await r.arrayBuffer();
      }
      if (needsJs) {
        const r = responses[idx++];
        if (r.ok) {
          const raw = await r.text();
          cache.jsCode = config.transformJS ? config.transformJS(raw) : defaultWASMTransform(raw);
        }
      }
    }

    cache.loadedContexts.add(context);
  })();

  cache.initPromises.set(context, promise);
  return promise;
}

/**
 * Base class for the singleton WASM engines. Provides instance state
 * (audioContext, output, initPromise, disposed) and lifecycle hooks.
 *
 * Subclass contract:
 *   • call `super()` — sets up audioContext + output + initPromise.
 *   • in the subclass constructor, AFTER super(), call `this.initialize()`.
 *     This lets the subclass finish setting up its own fields before the
 *     async init kicks off (which calls `createNode()`, abstract below).
 *   • implement `createNode()` — create the AudioWorkletNode and wire up
 *     `port.onmessage` + post the initial `{type: 'init', wasmBinary, jsCode,
 *     sampleRate}` message.
 *   • implement `getLoaderConfig()` — return the paths (subclass caches assets
 *     via its own static WASMAssetsCache, passed to `this.initialize()`).
 *   • keep `static instance` + `getInstance()` + `hasInstance()` in the
 *     subclass (context-switch logic varies across engines — some dispose
 *     on context change, some don't, so don't force it here).
 */
export abstract class WASMSingletonBase {
  protected audioContext: AudioContext;
  protected workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  protected _initPromise: Promise<void>;
  protected _resolveInit: (() => void) | null = null;
  protected _disposed = false;

  protected constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise((resolve) => {
      this._resolveInit = resolve;
    });
  }

  /** Called by the subclass constructor after super() completes. */
  protected async initialize(cache: WASMAssetsCache): Promise<void> {
    try {
      await loadWASMAssets(this.audioContext, cache, this.getLoaderConfig());
      this.createNode();
    } catch (err) {
      console.error(`[${this.constructor.name}] Initialization failed:`, err);
    }
  }

  protected abstract createNode(): void;
  protected abstract getLoaderConfig(): WASMLoaderConfig;

  /** Resolves once the worklet has reported `type: 'ready'`. */
  ready(): Promise<void> {
    return this._initPromise;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Base dispose — sends 'dispose' to the worklet, disconnects, clears the
   * node reference. Subclasses should override to also null their own
   * `static instance` field so the next getInstance() builds a fresh engine.
   */
  dispose(): void {
    this._disposed = true;
    try { this.workletNode?.port.postMessage({ type: 'dispose' }); } catch { /* port closed */ }
    try { this.workletNode?.disconnect(); } catch { /* already disconnected */ }
    this.workletNode = null;
  }
}
