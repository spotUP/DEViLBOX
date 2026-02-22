/**
 * SDLHardwareWrapper — Generic React wrapper for SDL2/Emscripten hardware UI modules
 *
 * Eliminates ~200 lines of boilerplate per synth by handling:
 * - Script injection + factory function caching
 * - Canvas creation with id="canvas", pixelated scaling
 * - configRef pattern (CLAUDE.md) for stable callbacks
 * - Module lifecycle (init/start/shutdown)
 * - Config buffer push on prop changes
 * - Cleanup on unmount
 *
 * Each synth-specific wrapper just provides configToBuffer() and callback mapping.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

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

    async function init() {
      try {
        /* Create canvas for SDL — must have id="canvas" for Emscripten event registration */
        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.imageRendering = 'pixelated';
        canvas.tabIndex = 0;

        if (containerRef.current && !cancelled) {
          containerRef.current.appendChild(canvas);
          canvasRef.current = canvas;
        }

        if (cancelled) return;

        /* Load module factory */
        const factory = await loadModuleFactory(moduleUrl, factoryName);
        if (cancelled) return;

        mod = await factory({ canvas }) as SDLModule;
        moduleRef.current = mod;

        if (cancelled) return;

        /* Set up callbacks BEFORE init, so they're available during first render */
        if (onModuleReadyRef.current) {
          onModuleReadyRef.current(mod);
        }

        /* Initialize — either with data buffer or plain */
        if (initBuffer && initWithDataFn) {
          const initWithData = mod[initWithDataFn] as ((ptr: number, len: number) => void) | undefined;
          if (typeof initWithData === 'function') {
            const ptr = mod._malloc(initBuffer.length);
            if (ptr) {
              mod.HEAPU8.set(initBuffer, ptr);
              initWithData.call(mod, ptr, initBuffer.length);
              mod._free(ptr);
            }
          }
        } else {
          const initFunc = mod[initFn] as ((w: number, h: number) => void) | undefined;
          if (typeof initFunc === 'function') {
            initFunc.call(mod, canvasWidth, canvasHeight);
          }
        }

        /* Push initial config */
        const cfgBuf = configBufferRef.current;
        const loadCfg = mod[loadConfigFn] as ((ptr: number, len: number) => void) | undefined;
        if (typeof loadCfg === 'function' && cfgBuf.length > 0) {
          const ptr = mod._malloc(cfgBuf.length);
          if (ptr) {
            mod.HEAPU8.set(cfgBuf, ptr);
            loadCfg.call(mod, ptr, cfgBuf.length);
            mod._free(ptr);
          }
        }

        /* Start the SDL main loop */
        const startFunc = mod[startFn] as (() => void) | undefined;
        if (typeof startFunc === 'function') {
          startFunc.call(mod);
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
        try {
          const shutdown = mod[shutdownFn] as (() => void) | undefined;
          if (typeof shutdown === 'function') {
            shutdown.call(mod);
          }
        } catch { /* ignore shutdown errors */ }
      }
      if (canvasRef.current && containerRef.current) {
        try { containerRef.current.removeChild(canvasRef.current); } catch { /* ignore */ }
        canvasRef.current = null;
      }
      moduleRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = useCallback(() => {
    canvasRef.current?.focus();
  }, []);

  return (
    <div className={`sdl-hardware-wrapper flex flex-col items-center ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="relative bg-black overflow-hidden"
        style={{
          maxWidth: canvasWidth,
          width: '100%',
          aspectRatio: `${canvasWidth} / ${canvasHeight}`,
        }}
        onClick={handleClick}
      />
      {!loaded && !error && (
        <div className="text-gray-500 text-xs mt-1">Loading hardware UI...</div>
      )}
      {error && (
        <div className="text-red-400 text-sm mt-2 text-center">
          Failed to load hardware UI: {error}
        </div>
      )}
    </div>
  );
};
