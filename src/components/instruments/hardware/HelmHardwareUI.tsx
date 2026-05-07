/**
 * HelmHardwareUI — Full JUCE Helm editor rendered from WASM framebuffer
 *
 * Loads the Helm UI WASM module (compiled from the original JUCE plugin
 * editor with OpenGL visualizers stubbed out), renders to a pixel buffer,
 * and blits to an HTML canvas each frame.
 *
 * Pixel format: JUCE ARGB little-endian [B,G,R,A] → Canvas [R,G,B,A]
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getToneEngine } from '../../../engine/ToneEngine';
import { buildHelmParameterUpdates, type HelmPresetFile } from '../../../lib/helmPresetLoader';
import { consumePendingPresetData } from '../../../lib/pendingPresetData';

interface HelmUIModule {
  _helm_ui_init: () => void;
  _helm_ui_init_scaled: (scale: number) => void;
  _helm_ui_tick: () => void;
  _helm_ui_get_fb: () => number;
  _helm_ui_get_width: () => number;
  _helm_ui_get_height: () => number;
  _helm_ui_on_mouse_down: (x: number, y: number, mods: number) => void;
  _helm_ui_on_mouse_up: (x: number, y: number, mods: number) => void;
  _helm_ui_on_mouse_move: (x: number, y: number, mods: number) => void;
  _helm_ui_on_mouse_wheel: (x: number, y: number, deltaX: number, deltaY: number) => void;
  _helm_ui_set_param: (paramId: number, value: number) => void;
  _helm_ui_get_param: (paramId: number) => number;
  _helm_ui_get_param_count: () => number;
  _helm_ui_get_program: () => number;
  _helm_ui_set_program: (p: number) => void;
  _helm_ui_get_program_count: () => number;
  _helm_ui_get_program_name: (p: number) => number;
  _helm_ui_shutdown: () => void;
  HEAPU8: Uint8Array;
  UTF8ToString: (ptr: number) => string;
}

function blitFramebuffer(
  mod: HelmUIModule,
  ctx: CanvasRenderingContext2D,
  imgData: ImageData,
  fbWidth: number,
  fbHeight: number
) {
  const fbPtr = mod._helm_ui_get_fb();
  if (!fbPtr) return;

  const totalPixels = fbWidth * fbHeight;
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
  const dst = imgData.data;

  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];     // R ← B
    dst[off + 1] = src[off + 1]; // G ← G
    dst[off + 2] = src[off];     // B ← R
    dst[off + 3] = 255;          // A
  }
  ctx.putImageData(imgData, 0, 0);
}

interface HelmHardwareUIProps {
  parameters?: Record<string, number>;
  onParamChange?: (key: string, value: number) => void;
  instrumentId?: number;
}

export const HelmHardwareUI: React.FC<HelmHardwareUIProps> = ({
  onParamChange: _onParamChange,
  instrumentId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moduleRef = useRef<HelmUIModule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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


  const applyHelmPreset = useCallback((preset: HelmPresetFile) => {
    const updates = buildHelmParameterUpdates(preset);
    const module = moduleRef.current;

    if (module) {
      for (const { paramId, value } of updates) {
        module._helm_ui_set_param(paramId, value);
      }
    }

    if (!instrumentId) {
      return;
    }

    try {
      const engine = getToneEngine();
      const key = (instrumentId << 16) | 0xFFFF;
      const synth = engine.instruments.get(key) as { setParameter?: (paramId: number, value: number) => void } | undefined;
      if (synth?.setParameter) {
        for (const { paramId, value } of updates) {
          synth.setParameter(paramId, value);
        }
      }
    } catch {
      /* engine not ready */
    }
  }, [instrumentId]);

  useEffect(() => {
    const handlePresetLoad = (event: Event) => {
      const presetEvent = event as CustomEvent<{ data?: HelmPresetFile }>;
      if (presetEvent.detail?.data) {
        applyHelmPreset(presetEvent.detail.data);
      }
    };

    window.addEventListener('devilbox:load-helm-preset', handlePresetLoad as EventListener);
    return () => {
      window.removeEventListener('devilbox:load-helm-preset', handlePresetLoad as EventListener);
    };
  }, [applyHelmPreset]);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups: (() => void)[] = [];

    const init = async () => {
      try {
        const factory = await new Promise<
          (opts: Record<string, unknown>) => Promise<HelmUIModule>
        >((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = (window as any).createHelmUIModule;
          if (typeof existing === 'function') {
            resolve(existing);
            return;
          }

          const script = document.createElement('script');
          script.src = '/helm/HelmUI.js';
          script.onload = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn = (window as any).createHelmUIModule;
            if (typeof fn === 'function') {
              resolve(fn);
            } else {
              reject(new Error('createHelmUIModule not found on window'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load HelmUI.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        const m = await factory({
          onAbort: (what: string) => {
            console.error('[HelmHardwareUI] WASM abort:', what);
          },
        });
        if (cancelled) {
          m._helm_ui_shutdown();
          return;
        }

        moduleRef.current = m;
        m._helm_ui_init();

        // Check for pending preset data from Library browser
        const pendingData = consumePendingPresetData('helm');
        if (pendingData) {
          applyHelmPreset(pendingData as HelmPresetFile);
        }

        const w = m._helm_ui_get_width();
        const h = m._helm_ui_get_height();

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = w;
        canvas.height = h;

        const updateCanvasCSS = () => {
          const container = containerRef.current;
          if (!container || !canvas) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const s = Math.min(cw / w, ch / h);
          canvas.style.width = `${Math.floor(w * s)}px`;
          canvas.style.height = `${Math.floor(h * s)}px`;
        };
        updateCanvasCSS();

        const ro = new ResizeObserver(updateCanvasCSS);
        if (containerRef.current) ro.observe(containerRef.current);
        eventCleanups.push(() => ro.disconnect());

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);

        const onMouseDown = (e: MouseEvent) => {
          e.preventDefault();
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._helm_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._helm_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._helm_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._helm_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
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
        (window as any)._helmUIParamCallback = (paramIndex: number, normalizedValue: number) => {
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
          delete (window as any)._helmUIParamCallback;
        });

        setLoaded(true);

        let lastFrameTime = 0;
        const FRAME_INTERVAL = 1000 / 30;
        const renderLoop = (now: number) => {
          if (cancelled) return;
          rafId = requestAnimationFrame(renderLoop);
          if (now - lastFrameTime < FRAME_INTERVAL) return;
          lastFrameTime = now;
          if (m._helm_ui_tick) m._helm_ui_tick();
          blitFramebuffer(m, ctx, imgData, w, h);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error('[HelmHardwareUI] Init failed:', err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());

      if (moduleRef.current) {
        moduleRef.current._helm_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);

  if (error) {
    return (
      <div style={{ padding: 16, color: '#ff6666', fontFamily: 'monospace' }}>
        [HelmHardwareUI] Error: {error}
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
          Loading Helm hardware UI...
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

export default HelmHardwareUI;
