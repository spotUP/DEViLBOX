/**
 * SDLHardwareWrapper — Generic React wrapper for SDL2/Emscripten hardware UI modules
 *
 * Eliminates ~200 lines of boilerplate per synth by handling:
 * - Script injection + factory function caching
 * - Canvas creation with unique IDs (prevents #canvas conflicts when multiple modules coexist)
 * - configRef pattern (CLAUDE.md) for stable callbacks
 * - Module lifecycle (init/start/shutdown)
 * - Config buffer push on prop changes
 * - Cleanup on unmount
 *
 * Each synth-specific wrapper just provides configToBuffer() and callback mapping.
 *
 * ### Canvas ID Management
 * Emscripten's SDL2 registers mouse/keyboard event handlers via `document.querySelector('#canvas')`.
 * When multiple SDL modules are on screen simultaneously, duplicate id="canvas" elements cause
 * event handlers from one module to land on another module's canvas. Fix: each instance gets a
 * unique canvas ID (canvas-sdl-N). Factory calls are serialized via sdlFactoryLock — the canvas
 * is temporarily renamed to id="canvas" during the factory() window (the only time Emscripten
 * queries the ID for event registration), then restored to its unique ID afterward. The same
 * temporary rename happens during shutdown so Emscripten can unregister cleanly.
 *
 * ### React StrictMode
 * React StrictMode double-invokes effects. If cleanup fires while factory() is still running,
 * the canvas MUST stay in DOM so SDL can register its event handlers cleanly. Canvas removal
 * is deferred to inside init() if cleanup fires mid-factory.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';

/* ── Factory Cache ─────────────────────────────────────────────────────── */

const factoryCache = new Map<string, (opts: { canvas: HTMLCanvasElement }) => Promise<SDLModule>>();
const loadPromises = new Map<string, Promise<(opts: { canvas: HTMLCanvasElement }) => Promise<SDLModule>>>();

async function loadModuleFactory(
  moduleUrl: string,
  factoryName: string,
): Promise<(opts: { canvas: HTMLCanvasElement }) => Promise<SDLModule>> {
  const cached = factoryCache.get(moduleUrl);
  if (cached) return cached;

  /* Deduplicate concurrent loads of the same module */
  const pending = loadPromises.get(moduleUrl);
  if (pending) return pending;

  const promise = new Promise<(opts: { canvas: HTMLCanvasElement }) => Promise<SDLModule>>(
    (resolve, reject) => {
      const script = document.createElement('script');
      script.src = moduleUrl;
      script.onload = () => {
        const fn = (window as unknown as Record<string, unknown>)[factoryName];
        if (typeof fn === 'function') {
          const factory = fn as (opts: { canvas: HTMLCanvasElement }) => Promise<SDLModule>;
          factoryCache.set(moduleUrl, factory);
          loadPromises.delete(moduleUrl);
          resolve(factory);
        } else {
          loadPromises.delete(moduleUrl);
          reject(new Error(`${factoryName} not found after loading ${moduleUrl}`));
        }
      };
      script.onerror = () => {
        loadPromises.delete(moduleUrl);
        reject(new Error(`Failed to load ${moduleUrl}`));
      };
      document.head.appendChild(script);
    },
  );

  loadPromises.set(moduleUrl, promise);
  return promise;
}

/* ── Serialized Factory Lock ───────────────────────────────────────────── */
/*
 * Emscripten calls document.querySelector('#canvas') during SDL initialization
 * to register event handlers. If two SDL modules initialize concurrently, both
 * would rename their canvases to id="canvas" at the same time, causing one module
 * to register event handlers on the wrong canvas.
 *
 * sdlFactoryLock serializes factory() calls so only one module has id="canvas" at
 * a time. Modules queue up and each gets exclusive use of the '#canvas' ID.
 */
let sdlFactoryLock: Promise<void> = Promise.resolve();

/** Unique instance counter — incremented once per SDLHardwareWrapper mount */
let sdlInstanceCounter = 0;

/* ── Types ─────────────────────────────────────────────────────────────── */

/** Minimal Emscripten module interface for SDL2 WASM modules */
export interface SDLModule {
  canvas: HTMLCanvasElement;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  HEAP8: Int8Array;
  /* Standard lifecycle functions (name varies per module) */
  [key: string]: unknown;
}

export interface SDLHardwareWrapperProps {
  /** URL to the Emscripten JS file, e.g., '/furnace/FurnaceFM.js' */
  moduleUrl: string;
  /** Factory function name on window, e.g., 'createFurnaceFM' */
  factoryName: string;
  /** Canvas width in pixels */
  canvasWidth: number;
  /** Canvas height in pixels */
  canvasHeight: number;

  /** Init function name exported from WASM, e.g., '_furnace_fm_init' */
  initFn: string;
  /** Start function name (begins emscripten_set_main_loop), e.g., '_furnace_fm_start' */
  startFn: string;
  /** Shutdown function name, e.g., '_furnace_fm_shutdown' */
  shutdownFn: string;
  /** Load config function name, e.g., '_furnace_fm_load_config' */
  loadConfigFn: string;

  /** Serialized config buffer to push to WASM */
  configBuffer: Uint8Array;

  /**
   * Called when the WASM module fires a parameter change callback.
   * Register your callbacks on the module in onModuleReady.
   */
  onModuleReady?: (mod: SDLModule) => void;

  /** Optional: called when the module fails to load */
  onError?: (error: string) => void;

  /** Optional: extra init data buffer (e.g., parameter metadata for generic modules) */
  initBuffer?: Uint8Array;
  /** Optional: init function that takes a data buffer, e.g., '_mame_generic_init_with_data' */
  initWithDataFn?: string;

  /** Optional: PCM data to push to WASM */
  pcmData?: Int8Array | null;
  /** Optional: function name to load PCM data */
  loadPcmFn?: string;

  /** Optional CSS class for the container */
  className?: string;
  /** Image rendering mode for the canvas when scaled. Default: 'pixelated' (good for retro UIs).
   *  Use 'auto' for smooth bilinear scaling (better for ImGui-based UIs at non-native resolution). */
  imageRendering?: 'pixelated' | 'auto';

  /**
   * Optional CSS display dimensions (logical pixels). When set, the canvas is constrained to
   * max-width × max-height CSS pixels and the aspect ratio uses these dimensions.
   *
   * Use this when the canvas buffer is larger than the logical layout (e.g., SCALE=2 for Retina):
   *   canvasWidth=960, canvasHeight=720, displayWidth=480, displayHeight=360
   * On a 2× Retina display: 480 CSS × 2 DPR = 960 physical = exact buffer size → pixel-perfect.
   */
  displayWidth?: number;
  displayHeight?: number;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export const SDLHardwareWrapper: React.FC<SDLHardwareWrapperProps> = ({
  moduleUrl,
  factoryName,
  canvasWidth,
  canvasHeight,
  initFn,
  startFn,
  shutdownFn,
  loadConfigFn,
  configBuffer,
  onModuleReady,
  onError,
  initBuffer,
  initWithDataFn,
  pcmData,
  loadPcmFn,
  className,
  imageRendering = 'pixelated',
  displayWidth,
  displayHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleRef = useRef<SDLModule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Stable refs for callbacks — CLAUDE.md configRef pattern */
  const configBufferRef = useRef(configBuffer);
  const onModuleReadyRef = useRef(onModuleReady);
  const onErrorRef = useRef(onError);

  useEffect(() => { configBufferRef.current = configBuffer; }, [configBuffer]);
  useEffect(() => { onModuleReadyRef.current = onModuleReady; }, [onModuleReady]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  /* Unique canvas ID — prevents '#canvas' querySelector conflicts between
   * concurrent SDL instances. Computed once per component mount. */
  const uniqueCanvasId = useMemo(() => `canvas-sdl-${++sdlInstanceCounter}`, []);

  /* Push config to WASM when configBuffer changes externally */
  useEffect(() => {
    const mod = moduleRef.current;
    if (!mod || !loaded) return;

    const fn = mod[loadConfigFn] as ((ptr: number, len: number) => void) | undefined;
    if (typeof fn !== 'function') return;

    const ptr = mod._malloc(configBuffer.length);
    if (!ptr) return;
    mod.HEAPU8.set(configBuffer, ptr);
    fn.call(mod, ptr, configBuffer.length);
    mod._free(ptr);
  }, [configBuffer, loaded, loadConfigFn]);

  /* Push PCM data when it changes */
  useEffect(() => {
    const mod = moduleRef.current;
    if (!mod || !loaded || !pcmData || !loadPcmFn) return;

    const fn = mod[loadPcmFn] as ((ptr: number, len: number) => void) | undefined;
    if (typeof fn !== 'function') return;

    const ptr = mod._malloc(pcmData.length);
    if (!ptr) return;
    mod.HEAP8.set(pcmData, ptr);
    fn.call(mod, ptr, pcmData.length);
    mod._free(ptr);
  }, [pcmData, loaded, loadPcmFn]);

  /* Mount: load WASM + start SDL loop */
  useEffect(() => {
    let cancelled = false;
    let mod: SDLModule | null = null;

    /* Track canvas/container locally so cleanup can act even after refs are cleared */
    let localCanvas: HTMLCanvasElement | null = null;
    let localContainer: HTMLElement | null = null;

    /* True once factory() has resolved — controls deferred canvas removal */
    let factoryCompleted = false;

    /* ── Canvas removal helper ──────────────────────────────────────────── */
    function removeCanvas() {
      if (localCanvas) {
        const parent = localContainer ?? (localCanvas.parentNode as HTMLElement | null);
        if (parent) {
          try { parent.removeChild(localCanvas); } catch { /* already removed */ }
        }
        canvasRef.current = null;
        localCanvas = null;
      }
    }

    /* ── Shutdown helper — temporarily restores id="canvas" for Emscripten ─ */
    function doShutdown(m: SDLModule) {
      const prevId = localCanvas?.id;
      /* Emscripten's unregisterOrRemoveHandler queries '#canvas' to find the element.
       * Temporarily restore the expected ID so unregistration succeeds. */
      if (localCanvas) localCanvas.id = 'canvas';
      try {
        const fn = m[shutdownFn] as (() => void) | undefined;
        if (typeof fn === 'function') fn.call(m);
      } catch { /* ignore shutdown errors */ }
      /* Restore unique ID so the element doesn't conflict with other modules */
      if (localCanvas && prevId !== undefined) localCanvas.id = prevId;
    }

    async function init() {
      try {
        /* Create canvas with a unique ID to avoid '#canvas' querySelector conflicts */
        const canvas = document.createElement('canvas');
        canvas.id = uniqueCanvasId;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.imageRendering = imageRendering;
        canvas.tabIndex = 0;
        localCanvas = canvas;
        localContainer = containerRef.current;

        if (containerRef.current && !cancelled) {
          containerRef.current.appendChild(canvas);
          canvasRef.current = canvas;
        }

        if (cancelled) {
          removeCanvas();
          return;
        }

        /* Load module factory (script injection + caching) */
        const factory = await loadModuleFactory(moduleUrl, factoryName);
        if (cancelled) {
          removeCanvas();
          return;
        }

        /* Serialize this factory() call through the global lock.
         * Inside our turn: rename canvas to 'canvas', call factory(), rename back.
         * This ensures only one module has id="canvas" at a time, so Emscripten's
         * querySelector('#canvas') always finds the correct element. */
        let factoryResult: SDLModule | null = null;
        let factoryError: unknown = null;

        const myTurn = sdlFactoryLock.then(async () => {
          if (cancelled) return; // Skip if cancelled while waiting in queue
          canvas.id = 'canvas'; // Temporarily become '#canvas' for Emscripten SDL init
          try {
            factoryResult = await factory({ canvas }) as SDLModule;
          } catch (e) {
            factoryError = e;
          } finally {
            canvas.id = uniqueCanvasId; // Restore unique ID immediately after factory resolves
          }
        });

        /* Extend the global lock so subsequent factory calls queue behind us */
        sdlFactoryLock = myTurn.then(
          () => undefined,
          () => undefined, // Don't break the lock chain on error
        );

        await myTurn;
        factoryCompleted = true;

        if (factoryError) throw factoryError;

        if (!factoryResult) {
          /* Cancelled while waiting in the lock queue */
          removeCanvas();
          return;
        }

        /* Explicit cast: factoryResult is a let captured by a then() callback so tsc -b
         * loses narrowing across the await boundary; null was already guarded above. */
        const sdlMod = factoryResult as SDLModule;
        mod = sdlMod;
        moduleRef.current = sdlMod;

        if (cancelled) {
          /* Cleanup fired while factory() was running — shut down immediately now
           * that factory is done. Canvas is still in DOM, shutdown will succeed. */
          doShutdown(sdlMod);
          removeCanvas();
          return;
        }

        /* Set up callbacks BEFORE init, so they're available during first render */
        if (onModuleReadyRef.current) {
          onModuleReadyRef.current(sdlMod);
        }

        /* Initialize — either with data buffer or plain */
        if (initBuffer && initWithDataFn) {
          const initWithData = sdlMod[initWithDataFn] as ((ptr: number, len: number) => void) | undefined;
          if (typeof initWithData === 'function') {
            const ptr = sdlMod._malloc(initBuffer.length);
            if (ptr) {
              sdlMod.HEAPU8.set(initBuffer, ptr);
              initWithData.call(sdlMod, ptr, initBuffer.length);
              sdlMod._free(ptr);
            }
          }
        } else {
          const initFunc = sdlMod[initFn] as ((w: number, h: number) => void) | undefined;
          if (typeof initFunc === 'function') {
            initFunc.call(sdlMod, canvasWidth, canvasHeight);
          }
        }

        /* Push initial config */
        const cfgBuf = configBufferRef.current;
        const loadCfg = sdlMod[loadConfigFn] as ((ptr: number, len: number) => void) | undefined;
        if (typeof loadCfg === 'function' && cfgBuf.length > 0) {
          const ptr = sdlMod._malloc(cfgBuf.length);
          if (ptr) {
            sdlMod.HEAPU8.set(cfgBuf, ptr);
            loadCfg.call(sdlMod, ptr, cfgBuf.length);
            sdlMod._free(ptr);
          }
        }

        /* Start the SDL main loop */
        const startFunc = sdlMod[startFn] as (() => void) | undefined;
        if (typeof startFunc === 'function') {
          startFunc.call(sdlMod);
        }

        if (!cancelled) setLoaded(true);
      } catch (err) {
        const msg = String(err);
        if (!cancelled) {
          setError(msg);
          if (onErrorRef.current) onErrorRef.current(msg);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (mod) {
        doShutdown(mod);
      }
      /* If factory() completed (or was never started), remove canvas now.
       * If factory() is still running, canvas removal is deferred to init()
       * so SDL can register its event handlers on a valid DOM element first. */
      if (factoryCompleted || !localCanvas) {
        removeCanvas();
      }
      moduleRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = useCallback(() => {
    canvasRef.current?.focus();
  }, []);

  /* Focus canvas on mouseenter so SDL's wheel callback can fire immediately
   * when the user starts scrolling — focus() inside the wheel handler is too
   * late if SDL checks focus before dispatching SDL_MOUSEWHEEL.
   * Non-passive wheel handler prevents browser scroll (e.preventDefault). */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMouseEnter = () => { canvasRef.current?.focus(); };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); };
    container.addEventListener('mouseenter', onMouseEnter);
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('mouseenter', onMouseEnter);
      container.removeEventListener('wheel', onWheel);
    };
  }, []);

  /* Derive display dimensions: if displayWidth/displayHeight are provided they
   * define the max CSS size (e.g., logical 480px for a 960px HiDPI buffer).
   * Aspect ratio uses display dims when set so the container height is correct. */
  const cssAspectW = displayWidth ?? canvasWidth;
  const cssAspectH = displayHeight ?? canvasHeight;

  return (
    <div className={`sdl-hardware-wrapper ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          width: '100%',
          maxWidth: displayWidth ? `${displayWidth}px` : undefined,
          aspectRatio: `${cssAspectW} / ${cssAspectH}`,
          background: loaded ? 'transparent' : '#111',
        }}
        onClick={handleClick}
      >
        {/* Loading overlay — shown while WASM initializes, hiding the black canvas underneath */}
        {!loaded && !error && (
          <div
            className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs"
            style={{ pointerEvents: 'none' }}
          >
            Loading hardware UI…
          </div>
        )}
      </div>
      {error && (
        <div className="text-red-400 text-sm mt-2 text-center">
          Failed to load hardware UI: {error}
        </div>
      )}
    </div>
  );
};
