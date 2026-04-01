/**
 * Odin2HardwareUI — Full JUCE Odin2 editor rendered from WASM framebuffer
 *
 * Loads the Odin2 UI WASM module (compiled from the original JUCE plugin
 * editor with knob/slider controls, oscillator panels, filter section,
 * mod matrix, patch browser, and arpeggiator),
 * renders to a pixel buffer, and blits to an HTML canvas each frame.
 *
 * Parameter changes in the WASM UI are forwarded to the audio worklet
 * via window._odin2UIParamCallback.
 *
 * Pixel format: JUCE ARGB little-endian [B,G,R,A] → Canvas [R,G,B,A]
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getToneEngine } from '../../../engine/ToneEngine';

interface Odin2UIModule {
  _odin2_ui_init: () => void;
  _odin2_ui_init_scaled: (scale: number) => void;
  _odin2_ui_tick: () => void;
  _odin2_ui_get_fb: () => number;
  _odin2_ui_get_width: () => number;
  _odin2_ui_get_height: () => number;
  _odin2_ui_on_mouse_down: (x: number, y: number, mods: number) => void;
  _odin2_ui_on_mouse_up: (x: number, y: number, mods: number) => void;
  _odin2_ui_on_mouse_move: (x: number, y: number, mods: number) => void;
  _odin2_ui_on_mouse_wheel: (x: number, y: number, deltaX: number, deltaY: number) => void;
  _odin2_ui_set_param: (paramId: number, value: number) => void;
  _odin2_ui_get_param: (paramId: number) => number;
  _odin2_ui_get_param_count: () => number;
  _odin2_ui_shutdown: () => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
}

function blitFramebuffer(
  mod: Odin2UIModule,
  ctx: CanvasRenderingContext2D,
  imgData: ImageData,
  fbWidth: number,
  fbHeight: number
) {
  const fbPtr = mod._odin2_ui_get_fb();
  if (!fbPtr) return;

  const totalPixels = fbWidth * fbHeight;
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
  const dst = imgData.data;

  // BGRA → RGBA byte swap
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];     // R ← src[2]
    dst[off + 1] = src[off + 1]; // G ← src[1]
    dst[off + 2] = src[off];     // B ← src[0]
    dst[off + 3] = 255;          // A (always opaque)
  }
  ctx.putImageData(imgData, 0, 0);
}

interface Odin2HardwareUIProps {
  parameters?: Record<string, number>;
  onParamChange?: (key: string, value: number) => void;
  instrumentId?: number;
}

export const Odin2HardwareUI: React.FC<Odin2HardwareUIProps> = ({
  onParamChange: _onParamChange,
  instrumentId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moduleRef = useRef<Odin2UIModule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fbWidthRef = useRef(1200);
  const fbHeightRef = useRef(924);

  const canvasCoords = useCallback(
    (canvas: HTMLCanvasElement, e: MouseEvent | React.MouseEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * scaleX),
        Math.floor((e.clientY - rect.top) * scaleY),
      ];
    },
    []
  );

  const getModifiers = useCallback((e: MouseEvent | React.MouseEvent): number => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey) mods |= 2;
    if (e.altKey) mods |= 4;
    if (e.metaKey) mods |= 8;
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups: (() => void)[] = [];

    const init = async () => {
      try {
        const factory = await new Promise<
          (opts: Record<string, unknown>) => Promise<Odin2UIModule>
        >((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = (window as any).createOdin2UIModule;
          if (typeof existing === 'function') {
            resolve(existing);
            return;
          }

          const script = document.createElement('script');
          script.src = '/odin2/Odin2UI.js';
          script.onload = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn = (window as any).createOdin2UIModule;
            if (typeof fn === 'function') {
              resolve(fn);
            } else {
              reject(new Error('createOdin2UIModule not found on window'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load Odin2UI.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        const m = await factory({
          onAbort: (what: string) => {
            console.error('[Odin2HardwareUI] WASM abort:', what);
          },
        });
        if (cancelled) {
          m._odin2_ui_shutdown();
          return;
        }

        moduleRef.current = m;

        // Yield to browser before heavy WASM init (Odin2 loads/scales 1248 PNG assets)
        await new Promise(resolve => setTimeout(resolve, 50));
        if (cancelled) {
          m._odin2_ui_shutdown();
          return;
        }

        m._odin2_ui_init();

        const w = m._odin2_ui_get_width();
        const h = m._odin2_ui_get_height();
        fbWidthRef.current = w;
        fbHeightRef.current = h;

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = w;
        canvas.height = h;
        const nativeW = w;
        const nativeH = h;

        const updateCanvasCSS = () => {
          const container = containerRef.current;
          if (!container) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const s = Math.min(cw / nativeW, ch / nativeH);
          canvas.style.width = `${Math.floor(nativeW * s)}px`;
          canvas.style.height = `${Math.floor(nativeH * s)}px`;
        };
        updateCanvasCSS();

        const ro = new ResizeObserver(updateCanvasCSS);
        if (containerRef.current) ro.observe(containerRef.current);
        eventCleanups.push(() => ro.disconnect());

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);

        // Mouse event handlers
        const onMouseDown = (e: MouseEvent) => {
          e.preventDefault();
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._odin2_ui_on_mouse_down(cx, cy, getModifiers(e));
        };

        const onMouseUp = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._odin2_ui_on_mouse_up(cx, cy, getModifiers(e));
        };

        const onMouseMove = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._odin2_ui_on_mouse_move(cx, cy, getModifiers(e));
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._odin2_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };

        canvas.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        eventCleanups.push(
          () => canvas.removeEventListener('mousedown', onMouseDown),
          () => document.removeEventListener('mouseup', onMouseUp),
          () => document.removeEventListener('mousemove', onMouseMove),
          () => canvas.removeEventListener('wheel', onWheel)
        );

        // Parameter callback: WASM UI knob → audio worklet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._odin2UIParamCallback = (paramIndex: number, normalizedValue: number) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const instruments = (engine as any).instruments as Map<number, any>;
            const key = (instrumentId << 16) | 0xFFFF;
            const synth = instruments?.get(key);
            if (synth?._worklet) {
              synth._worklet.port.postMessage({
                type: 'parameter',
                paramId: paramIndex,
                value: normalizedValue,
              });
            }
          } catch { /* engine not ready */ }
        };

        eventCleanups.push(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._odin2UIParamCallback;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._odin2ParamIds;
        });

        setLoaded(true);

        // rAF render loop — throttled to 30fps
        let lastFrameTime = 0;
        const FRAME_INTERVAL = 1000 / 30;
        const renderLoop = (now: number) => {
          if (cancelled) return;
          rafId = requestAnimationFrame(renderLoop);
          if (now - lastFrameTime < FRAME_INTERVAL) return;
          lastFrameTime = now;
          if (m._odin2_ui_tick) m._odin2_ui_tick();
          blitFramebuffer(m, ctx, imgData, w, h);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error('[Odin2HardwareUI] Init failed:', err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());

      if (instrumentId) {
        try {
          const engine = getToneEngine();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const instruments = (engine as any).instruments as Map<number, any>;
          const key = (instrumentId << 16) | 0xFFFF;
          const synth = instruments?.get(key);
          if (synth?._worklet) {
            synth._worklet.port.postMessage({ type: 'allNotesOff' });
          }
        } catch { /* engine not ready */ }
      }

      if (moduleRef.current) {
        moduleRef.current._odin2_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);

  if (error) {
    return (
      <div style={{ padding: 16, color: '#ff6666', fontFamily: 'monospace' }}>
        [Odin2HardwareUI] Error: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a1a',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {!loaded && (
        <div style={{ padding: 16, color: '#888', fontFamily: 'monospace' }}>
          Loading Odin2 hardware UI...
        </div>
      )}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        style={{
          display: loaded ? 'block' : 'none',
          cursor: 'default',
        }}
      />
    </div>
  );
};

export default Odin2HardwareUI;
