/**
 * MoniqueHardwareUI — Hardware-accurate JUCE UI rendered from WASM framebuffer
 *
 * Loads the Monique UI WASM module (compiled from the original 45K LOC JUCE
 * Component tree), renders to a pixel buffer via JUCE's software renderer,
 * and blits to an HTML canvas each frame. Same pattern as PT2/FT2 hardware UIs.
 *
 * Pixel format: JUCE ARGB little-endian [B,G,R,A] → Canvas [R,G,B,A]
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getToneEngine } from '../../../engine/ToneEngine';

interface MoniqueUIModule {
  _monique_ui_init: (sampleRate: number) => void;
  _monique_ui_tick: () => void;
  _monique_ui_get_fb: () => number;
  _monique_ui_get_width: () => number;
  _monique_ui_get_height: () => number;
  _monique_ui_on_mouse_down: (x: number, y: number, mods: number) => void;
  _monique_ui_on_mouse_up: (x: number, y: number, mods: number) => void;
  _monique_ui_on_mouse_move: (x: number, y: number, mods: number) => void;
  _monique_ui_on_mouse_wheel: (x: number, y: number, deltaX: number, deltaY: number) => void;
  _monique_ui_shutdown: () => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
}

function blitFramebuffer(
  mod: MoniqueUIModule,
  ctx: CanvasRenderingContext2D,
  imgData: ImageData,
  width: number,
  height: number
) {
  const fbPtr = mod._monique_ui_get_fb();
  if (!fbPtr) return;

  const totalPixels = width * height;
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

interface MoniqueHardwareUIProps {
  parameters?: Record<string, number>;
  onParamChange?: (key: string, value: number) => void;
  instrumentId?: number;
}

export const MoniqueHardwareUI: React.FC<MoniqueHardwareUIProps> = (props) => {
  const { onParamChange: _onParamChange, instrumentId } = props;
  console.log('[MoniqueHW] render, instrumentId=', instrumentId, 'all props:', Object.keys(props));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instrumentIdRef = useRef(instrumentId);
  instrumentIdRef.current = instrumentId;
  const moduleRef = useRef<MoniqueUIModule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1465, height: 1210 });

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
    // Bit 16 = left mouse button is pressed (for drag detection in C++)
    if (e.buttons & 1) mods |= 16;
    return mods;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups: (() => void)[] = [];

    const init = async () => {
      try {
        // Load factory via script tag (Emscripten MODULARIZE pattern, non-ES6)
        const factory = await new Promise<
          (opts: Record<string, unknown>) => Promise<MoniqueUIModule>
        >((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = (window as any).createMoniqueUIModule;
          if (typeof existing === 'function') {
            resolve(existing);
            return;
          }

          const script = document.createElement('script');
          script.src = '/monique/MoniqueUI.js';
          script.onload = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn = (window as any).createMoniqueUIModule;
            if (typeof fn === 'function') {
              resolve(fn);
            } else {
              reject(new Error('createMoniqueUIModule not found on window'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load MoniqueUI.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        const m = await factory({});
        if (cancelled) {
          m._monique_ui_shutdown();
          return;
        }

        moduleRef.current = m;

        // Initialize with actual audio context sample rate
        const audioCtx = (window as unknown as Record<string, unknown>).devilboxAudioContext as AudioContext | undefined;
        const sampleRate = audioCtx?.sampleRate ?? 48000;
        m._monique_ui_init(sampleRate);

        const w = m._monique_ui_get_width();
        const h = m._monique_ui_get_height();
        setDimensions({ width: w, height: h });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const imgData = ctx.createImageData(w, h);

        // Mouse event handlers — track drag state to prevent parent scroll
        let isDragging = false;

        const onMouseDown = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          isDragging = true;
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._monique_ui_on_mouse_down(cx, cy, getModifiers(e));
        };

        const onMouseUp = (e: MouseEvent) => {
          isDragging = false;
          const [cx, cy] = canvasCoords(canvas, e);
          m._monique_ui_on_mouse_up(cx, cy, getModifiers(e));
        };

        const onMouseMove = (e: MouseEvent) => {
          if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
          }
          const [cx, cy] = canvasCoords(canvas, e);
          m._monique_ui_on_mouse_move(cx, cy, getModifiers(e));
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const [cx, cy] = canvasCoords(canvas, e);
          m._monique_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
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

        // MIDI callback: JUCE UI keyboard → JS → real audio engine
        // The WASM bridge's MidiForwarder calls window._moniqueUIMidiCallback
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._moniqueUIMidiCallback = (type: string, note: number, vel: number) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            // Get the cached VSTBridgeSynth — shared instruments use key = (id << 16) | 0xFFFF
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const instruments = (engine as any).instruments as Map<number, any>;
            const key = (instrumentIdRef.current! << 16) | 0xFFFF;
            const synth = instruments?.get(key);
            if (!synth?._worklet) {
              console.warn(`[MoniqueHardwareUI] Synth worklet not ready for instrument ${instrumentId}`);
              return;
            }

            // Post directly to the worklet — bypasses noteToMidi() which
            // would misinterpret the raw MIDI number as a frequency in Hz
            if (type === 'noteOn') {
              synth._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
            } else if (type === 'noteOff') {
              synth._worklet.port.postMessage({ type: 'noteOff', note });
            }
          } catch { /* engine not ready */ }
        };

        // Parameter change callback: UI knob changes → real audio engine
        // The C++ bridge polls synth_data fields in MoniqueParams enum order,
        // so the index matches the audio WASM's setParam directly.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._moniqueUIParamCallback = (index: number, value: number) => {
          console.log(`[MoniqueHW] param ${index} = ${value}, instrumentId=${instrumentIdRef.current}`);
          if (!instrumentIdRef.current) return;
          try {
            const engine = getToneEngine();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const instruments = (engine as any).instruments as Map<number, any>;
            const key = (instrumentIdRef.current << 16) | 0xFFFF;
            const synth = instruments?.get(key);
            console.log(`[MoniqueHW] synth found:`, !!synth, 'worklet:', !!synth?._worklet);
            if (synth?._worklet) {
              synth._worklet.port.postMessage({ type: 'setParam', index, value });
            }
          } catch (e) { console.error('[MoniqueHW] error:', e); }
        };

        eventCleanups.push(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._moniqueUIMidiCallback;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._moniqueUIParamCallback;
        });

        setLoaded(true);

        // rAF render loop
        const renderLoop = () => {
          if (cancelled) return;
          if (m._monique_ui_tick) m._monique_ui_tick();
          blitFramebuffer(m, ctx, imgData, w, h);
          rafId = requestAnimationFrame(renderLoop);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error('[MoniqueHardwareUI] Init failed:', err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());

      // Send allNotesOff to prevent stuck notes on unmount
      if (instrumentIdRef.current) {
        try {
          const engine = getToneEngine();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const instruments = (engine as any).instruments as Map<number, any>;
          const key = (instrumentIdRef.current! << 16) | 0xFFFF;
          const synth = instruments?.get(key);
          if (synth?._worklet) {
            synth._worklet.port.postMessage({ type: 'allNotesOff' });
          }
        } catch { /* engine not ready */ }
      }

      if (moduleRef.current) {
        moduleRef.current._monique_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers]);

  if (error) {
    return (
      <div style={{ padding: 16, color: '#ff6666', fontFamily: 'monospace' }}>
        [MoniqueHardwareUI] Error: {error}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: '#1a1a1a',
        width: '100%',
        height: '100%',
        overflow: 'auto',
      }}
    >
      {!loaded && (
        <div style={{ padding: 16, color: '#888', fontFamily: 'monospace' }}>
          Loading Monique hardware UI...
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        tabIndex={0}
        style={{
          imageRendering: 'pixelated',
          maxWidth: '100%',
          height: 'auto',
          display: loaded ? 'block' : 'none',
          cursor: 'default',
          touchAction: 'none',    // Prevent browser scroll on drag
          userSelect: 'none',     // Prevent text selection during drag
        }}
      />
    </div>
  );
};

export default MoniqueHardwareUI;
