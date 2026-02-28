/**
 * SunVoxFramebufferView.tsx — React canvas component that blits the SunVox UI WASM framebuffer
 *
 * Loads the SunVoxUI WASM module (a pixel-buffer renderer for SunVox module controls),
 * creates a UI handle, pushes control metadata from the synth, runs a rAF render loop
 * that blits the BGRA framebuffer to a Canvas 2D context, and forwards mouse events.
 *
 * Framebuffer format: BGRA 32-bit (little-endian) — byte-swapped to RGBA for Canvas ImageData.
 * Pattern follows PT2Hardware (PT2Hardware.tsx) exactly.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { SunVoxConfig } from '@typedefs/instrument';
import type { SunVoxControl } from '@engine/sunvox/SunVoxEngine';
import type { SunVoxSynth } from '@engine/sunvox/SunVoxSynth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SunVoxFramebufferViewProps {
  synth: SunVoxSynth;
  config: SunVoxConfig;
  onChange: (config: SunVoxConfig) => void;
  width?: number;
  height?: number;
}

/**
 * Emscripten module interface for SunVoxUI.wasm.
 * Only the symbols used by this component are declared here.
 */
interface SunVoxUIModule {
  _sunvox_ui_create: (width: number, height: number) => number;
  _sunvox_ui_destroy: (handle: number) => void;
  _sunvox_ui_set_module: (
    handle: number,
    modNamePtr: number,
    ctlsCount: number,
    ctlNamesPtr: number,
    ctlMinsPtr: number,
    ctlMaxsPtr: number,
    ctlValsPtr: number,
  ) => void;
  _sunvox_ui_update_values: (handle: number, ctlValsPtr: number) => void;
  _sunvox_ui_mouse_event: (handle: number, type: number, x: number, y: number, btn: number) => void;
  _sunvox_ui_key_event: (handle: number, key: number, mod: number) => void;
  _sunvox_ui_tick: (handle: number) => void;
  _sunvox_ui_get_framebuffer: (handle: number) => number;
  _sunvox_ui_get_clicked_ctl: (handle: number) => number;
  _sunvox_ui_get_clicked_value: (handle: number) => number;
  _sunvox_ui_get_width: (handle: number) => number;
  _sunvox_ui_get_height: (handle: number) => number;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fixed name-slot width matching CTL_NAME_LEN in SunVoxUI.cpp */
const CTL_NAME_LEN = 32;

// Mouse event type constants matching SunVoxUI.cpp
const MOUSE_MOVE  = 0;
const MOUSE_DOWN  = 1;
const MOUSE_UP    = 2;
const MOUSE_SCROLL = 3;

const MOUSE_BTN_LEFT      = 1;
const MOUSE_SCROLL_UP_BTN = 8;
const MOUSE_SCROLL_DN_BTN = 16;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Blit the BGRA framebuffer from WASM into the canvas ImageData.
 * WASM stores little-endian ARGB (0xAARRGGBB) as bytes [BB, GG, RR, AA].
 * Canvas ImageData expects [RR, GG, BB, AA].
 */
function blitFramebuffer(
  m: SunVoxUIModule,
  handle: number,
  ctx: CanvasRenderingContext2D,
  imgData: ImageData,
  pixelCount: number,
): void {
  const fbPtr = m._sunvox_ui_get_framebuffer(handle);
  if (!fbPtr) return;

  const src = m.HEAPU8.subarray(fbPtr, fbPtr + pixelCount * 4);
  const dst = imgData.data;

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    dst[off]     = src[off + 2]; // R ← B-slot
    dst[off + 1] = src[off + 1]; // G ← G-slot
    dst[off + 2] = src[off];     // B ← R-slot
    dst[off + 3] = 255;          // A always opaque
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Write a null-terminated string into the WASM heap and return the pointer.
 * Caller must free the returned pointer with m._free().
 */
function allocCString(m: SunVoxUIModule, str: string): number {
  // Encode as UTF-8 bytes
  const encoded = new TextEncoder().encode(str);
  const ptr = m._malloc(encoded.length + 1);
  if (!ptr) return 0;
  m.HEAPU8.set(encoded, ptr);
  m.HEAPU8[ptr + encoded.length] = 0; // null terminator
  return ptr;
}

/**
 * Push control metadata and values to the WASM UI instance.
 * ctl_names is a flat packed array: ctls_count * CTL_NAME_LEN bytes,
 * each name null-padded to CTL_NAME_LEN bytes (matching the C struct).
 */
function pushModuleToWasm(
  m: SunVoxUIModule,
  handle: number,
  moduleName: string,
  controls: SunVoxControl[],
): void {
  const count = controls.length;

  // Allocate module name string
  const namePtr = allocCString(m, moduleName);

  // Allocate flat name buffer: count × CTL_NAME_LEN bytes
  const namesBytes = count * CTL_NAME_LEN;
  const namesPtr = m._malloc(namesBytes);
  if (namesPtr) {
    m.HEAPU8.fill(0, namesPtr, namesPtr + namesBytes);
    const enc = new TextEncoder();
    for (let i = 0; i < count; i++) {
      const nameBytes = enc.encode(controls[i].name);
      const dest = namesPtr + i * CTL_NAME_LEN;
      const copyLen = Math.min(nameBytes.length, CTL_NAME_LEN - 1);
      m.HEAPU8.set(nameBytes.subarray(0, copyLen), dest);
    }
  }

  // Allocate int32 arrays for mins, maxs, vals
  const minsPtr = m._malloc(count * 4);
  const maxsPtr = m._malloc(count * 4);
  const valsPtr = m._malloc(count * 4);

  if (minsPtr && maxsPtr && valsPtr) {
    for (let i = 0; i < count; i++) {
      // HEAP32 is indexed by byte offset / 4
      m.HEAP32[(minsPtr >> 2) + i] = controls[i].min;
      m.HEAP32[(maxsPtr >> 2) + i] = controls[i].max;
      m.HEAP32[(valsPtr >> 2) + i] = controls[i].value;
    }
  }

  m._sunvox_ui_set_module(
    handle,
    namePtr,
    count,
    namesPtr,
    minsPtr,
    maxsPtr,
    valsPtr,
  );

  // Free all temporary buffers
  if (namePtr) m._free(namePtr);
  if (namesPtr) m._free(namesPtr);
  if (minsPtr) m._free(minsPtr);
  if (maxsPtr) m._free(maxsPtr);
  if (valsPtr) m._free(valsPtr);
}

/**
 * Push updated control values to the WASM UI without touching names/ranges.
 */
function pushValuesToWasm(
  m: SunVoxUIModule,
  handle: number,
  controls: SunVoxControl[],
  overrides: Record<string, number>,
): void {
  const count = controls.length;
  if (count === 0) return;

  const valsPtr = m._malloc(count * 4);
  if (!valsPtr) return;

  for (let i = 0; i < count; i++) {
    const persisted = overrides[i.toString()];
    const val = persisted !== undefined ? persisted : controls[i].value;
    m.HEAP32[(valsPtr >> 2) + i] = val;
  }

  m._sunvox_ui_update_values(handle, valsPtr);
  m._free(valsPtr);
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SunVoxFramebufferView: React.FC<SunVoxFramebufferViewProps> = ({
  synth,
  config,
  onChange,
  width = 480,
  height = 320,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);
  const moduleRef = useRef<SunVoxUIModule | null>(null);
  const handleRef = useRef<number>(-1);
  const controlsRef = useRef<SunVoxControl[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep refs in sync with props — CLAUDE.md configRef pattern
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // When config.controlValues changes externally, push updated values to WASM
  useEffect(() => {
    const m = moduleRef.current;
    const h = handleRef.current;
    if (!m || h < 0 || controlsRef.current.length === 0) return;
    pushValuesToWasm(m, h, controlsRef.current, config.controlValues);
  }, [config.controlValues]);

  // Mount: load WASM module, create UI handle, start rAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let m: SunVoxUIModule | null = null;
    let uiHandle = -1;
    let rafId = 0;
    const eventCleanups: (() => void)[] = [];

    async function init() {
      try {
        // Load SunVoxUI Emscripten module via script injection (same as PT2Hardware)
        const factory = await new Promise<
          (opts: Record<string, unknown>) => Promise<SunVoxUIModule>
        >((resolve, reject) => {
          const win = window as unknown as Record<string, unknown>;
          if (typeof win['createSunVoxUI'] === 'function') {
            resolve(win['createSunVoxUI'] as (opts: Record<string, unknown>) => Promise<SunVoxUIModule>);
            return;
          }
          const script = document.createElement('script');
          script.src = '/sunvox/SunVoxUI.js';
          script.onload = () => {
            const fn = (window as unknown as Record<string, unknown>)['createSunVoxUI'];
            if (typeof fn === 'function') {
              resolve(fn as (opts: Record<string, unknown>) => Promise<SunVoxUIModule>);
            } else {
              reject(new Error('createSunVoxUI not found after script load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load SunVoxUI.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        m = await factory({}) as SunVoxUIModule;
        if (cancelled) return;

        moduleRef.current = m;

        // Create a UI handle for this canvas size
        uiHandle = m._sunvox_ui_create(width, height);
        if (uiHandle < 0) {
          throw new Error(`sunvox_ui_create(${width}, ${height}) returned -1`);
        }
        handleRef.current = uiHandle;

        // Fetch controls from synth and push to WASM
        const controls = await synth.getControls();
        if (cancelled) return;

        controlsRef.current = controls;

        if (controls.length > 0) {
          const moduleName = configRef.current.patchName || 'SunVox';
          pushModuleToWasm(m, uiHandle, moduleName, controls);
          // Apply any persisted override values
          if (Object.keys(configRef.current.controlValues).length > 0) {
            pushValuesToWasm(m, uiHandle, controls, configRef.current.controlValues);
          }
        }

        // Get 2D context and pre-allocate ImageData
        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (!ctx) {
          throw new Error('Canvas 2D context unavailable');
        }
        const imgData = ctx.createImageData(width, height);
        const pixelCount = width * height;

        // Wire mouse events — mousedown on canvas, mouseup/mousemove on document
        // (document listeners handle drag-outside-canvas correctly per CLAUDE.md)
        const getCanvasCoords = (e: MouseEvent): [number, number] => {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          return [
            Math.floor((e.clientX - rect.left) * scaleX),
            Math.floor((e.clientY - rect.top) * scaleY),
          ];
        };

        const onMouseDown = (e: MouseEvent) => {
          e.preventDefault();
          canvas.focus();
          const [cx, cy] = getCanvasCoords(e);
          m!._sunvox_ui_mouse_event(uiHandle, MOUSE_DOWN, cx, cy, MOUSE_BTN_LEFT);
        };
        const onMouseUp = (e: MouseEvent) => {
          const [cx, cy] = getCanvasCoords(e);
          m!._sunvox_ui_mouse_event(uiHandle, MOUSE_UP, cx, cy, MOUSE_BTN_LEFT);
        };
        const onMouseMove = (e: MouseEvent) => {
          const [cx, cy] = getCanvasCoords(e);
          m!._sunvox_ui_mouse_event(uiHandle, MOUSE_MOVE, cx, cy, 0);
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const [cx, cy] = getCanvasCoords(e);
          const btn = e.deltaY < 0 ? MOUSE_SCROLL_UP_BTN : MOUSE_SCROLL_DN_BTN;
          m!._sunvox_ui_mouse_event(uiHandle, MOUSE_SCROLL, cx, cy, btn);
        };

        canvas.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        eventCleanups.push(
          () => canvas.removeEventListener('mousedown', onMouseDown),
          () => document.removeEventListener('mouseup', onMouseUp),
          () => document.removeEventListener('mousemove', onMouseMove),
          () => canvas.removeEventListener('wheel', onWheel),
        );

        // rAF render loop
        const renderLoop = () => {
          if (cancelled) return;

          if (m!._sunvox_ui_tick) m!._sunvox_ui_tick(uiHandle);
          blitFramebuffer(m!, uiHandle, ctx, imgData, pixelCount);

          // Check for user interactions with controls
          const clickedCtl = m!._sunvox_ui_get_clicked_ctl(uiHandle);
          if (clickedCtl >= 0) {
            const clickedValue = m!._sunvox_ui_get_clicked_value(uiHandle);

            // Forward to synth engine (fire-and-forget)
            synth.set(clickedCtl.toString(), clickedValue);

            // Merge into config and propagate up
            const current = configRef.current;
            const updated: SunVoxConfig = {
              ...current,
              controlValues: {
                ...current.controlValues,
                [clickedCtl.toString()]: clickedValue,
              },
            };
            configRef.current = updated;
            onChangeRef.current(updated);
          }

          rafId = requestAnimationFrame(renderLoop);
        };
        rafId = requestAnimationFrame(renderLoop);
        eventCleanups.push(() => cancelAnimationFrame(rafId));

        if (!cancelled) setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    init();

    return () => {
      cancelled = true;
      eventCleanups.forEach(fn => fn());
      if (m && uiHandle >= 0) {
        try { m._sunvox_ui_destroy(uiHandle); } catch { /* ignore */ }
      }
      moduleRef.current = null;
      handleRef.current = -1;
      controlsRef.current = [];
    };
  }, [synth, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sunvox-framebuffer-view flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        tabIndex={0}
        style={{
          width: '100%',
          maxWidth: width,
          height: 'auto',
          imageRendering: 'pixelated',
          display: 'block',
          cursor: 'default',
        }}
      />
      {!loaded && !error && (
        <div className="text-gray-400 text-sm mt-2">
          Loading SunVox UI...
        </div>
      )}
      {error && (
        <div className="text-red-400 text-sm mt-2 text-center">
          Failed to load SunVox UI: {error}
        </div>
      )}
    </div>
  );
};

SunVoxFramebufferView.displayName = 'SunVoxFramebufferView';
