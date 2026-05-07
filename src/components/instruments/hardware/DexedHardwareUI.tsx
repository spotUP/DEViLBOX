/**
 * DexedHardwareUI — Full JUCE DX7 editor rendered from WASM framebuffer
 *
 * Loads the Dexed UI WASM module (compiled from the original JUCE plugin
 * editor with operator panels, algorithm display, global controls, and
 * bitmap-based look and feel), renders to a pixel buffer, and blits
 * to an HTML canvas each frame. Same pattern as AMSynth/Monique hardware UIs.
 *
 * Parameter changes in the WASM UI are forwarded to the audio worklet
 * via window._dexedUIParamCallback.
 *
 * Pixel format: JUCE ARGB little-endian [B,G,R,A] → Canvas [R,G,B,A]
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getToneEngine } from '../../../engine/ToneEngine';
import { unpackDX7Voice } from '../../../engine/dx7/dx7sysex';

interface DexedUIModule {
  _dexed_ui_init: () => void;
  _dexed_ui_init_scaled: (scale: number) => void;
  _dexed_ui_tick: () => void;
  _dexed_ui_get_fb: () => number;
  _dexed_ui_get_width: () => number;
  _dexed_ui_get_height: () => number;
  _dexed_ui_on_mouse_down: (x: number, y: number, mods: number) => void;
  _dexed_ui_on_mouse_up: (x: number, y: number, mods: number) => void;
  _dexed_ui_on_mouse_move: (x: number, y: number, mods: number) => void;
  _dexed_ui_on_mouse_wheel: (x: number, y: number, deltaX: number, deltaY: number) => void;
  _dexed_ui_set_param: (paramId: number, value: number) => void;
  _dexed_ui_get_param: (paramId: number) => number;
  _dexed_ui_get_param_count: () => number;
  _dexed_ui_load_sysex: (ptr: number, len: number) => void;
  _dexed_ui_set_program: (program: number) => void;
  _dexed_ui_get_program: () => number;
  _dexed_ui_get_program_count: () => number;
  _dexed_ui_get_voice_data: () => number;
  _dexed_ui_shutdown: () => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
}

function blitFramebuffer(
  mod: DexedUIModule,
  ctx: CanvasRenderingContext2D,
  imgData: ImageData,
  fbWidth: number,
  fbHeight: number
) {
  const fbPtr = mod._dexed_ui_get_fb();
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

interface DexedHardwareUIProps {
  parameters?: Record<string, number>;
  onParamChange?: (key: string, value: number) => void;
  instrumentId?: number;
}

export const DexedHardwareUI: React.FC<DexedHardwareUIProps> = ({
  onParamChange: _onParamChange,
  instrumentId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moduleRef = useRef<DexedUIModule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patchInfo, setPatchInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Load sysex data into both the UI WASM and audio engine */
  const loadSysexData = useCallback((buffer: ArrayBuffer, sourceLabel: string) => {
    const data = new Uint8Array(buffer);
    const m = moduleRef.current;

    if (data.length === 4104 || data.length === 4096) {
      const voiceData = data.length === 4104 ? data.subarray(6, 4102) : data;
      const firstVoice = unpackDX7Voice(voiceData.subarray(0, 128));
      if (m) {
        const ptr = m._malloc(155);
        m.HEAPU8.set(firstVoice.subarray(0, 155), ptr);
        m._dexed_ui_load_sysex(ptr, 155);
        m._free(ptr);
      }

      if (instrumentId) {
        try {
          const engine = getToneEngine();
          const key = (instrumentId << 16) | 0xFFFF;
          const synth = engine.instruments.get(key) as any;
          if (synth?.loadSysex) {
            if (data.length === 4096) {
              const sysex = new Uint8Array(4104);
              sysex[0] = 0xF0; sysex[1] = 0x43; sysex[2] = 0x00;
              sysex[3] = 0x09; sysex[4] = 0x20; sysex[5] = 0x00;
              sysex.set(data, 6);
              let sum = 0;
              for (let i = 0; i < 4096; i++) sum += data[i];
              sysex[4102] = (-sum) & 0x7F;
              sysex[4103] = 0xF7;
              synth.loadSysex(sysex.buffer);
            } else {
              synth.loadSysex(buffer);
            }
          }
        } catch { /* engine not ready */ }
      }
      setPatchInfo(`Loaded ${sourceLabel} (32 voices)`);
      return;
    }

    if (data.length >= 155 && data.length <= 163) {
      const vcedStart = data[0] === 0xF0 ? 6 : 0;
      const vcedData = data.subarray(vcedStart, vcedStart + 155);
      if (m) {
        const ptr = m._malloc(155);
        m.HEAPU8.set(vcedData, ptr);
        m._dexed_ui_load_sysex(ptr, 155);
        m._free(ptr);
      }
      if (instrumentId) {
        try {
          const engine = getToneEngine();
          const key = (instrumentId << 16) | 0xFFFF;
          const synth = engine.instruments.get(key) as any;
          if (synth?._loadVcedData) {
            synth._loadVcedData(new Uint8Array(vcedData));
          }
        } catch { /* engine not ready */ }
      }
      setPatchInfo(`Loaded ${sourceLabel} (single voice)`);
      return;
    }

    setPatchInfo(`Unknown format (${data.length} bytes)`);
  }, [instrumentId]);

  const loadSysexFile = useCallback(async (file: File) => {
    loadSysexData(await file.arrayBuffer(), file.name);
  }, [loadSysexData]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.syx') || file.name.endsWith('.SYX'))) {
      loadSysexFile(file);
    }
  }, [loadSysexFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadSysexFile(file);
    e.target.value = '';
  }, [loadSysexFile]);


  useEffect(() => {
    const handlePresetLoad = (event: Event) => {
      const presetEvent = event as CustomEvent<{ data?: ArrayBuffer }>;
      if (presetEvent.detail?.data) {
        loadSysexData(presetEvent.detail.data, 'browser preset');
      }
    };

    window.addEventListener('devilbox:load-dexed-preset', handlePresetLoad as EventListener);
    return () => {
      window.removeEventListener('devilbox:load-dexed-preset', handlePresetLoad as EventListener);
    };
  }, [loadSysexData]);

  const fbWidthRef = useRef(866);
  const fbHeightRef = useRef(674);

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
        // Load factory via script tag (Emscripten MODULARIZE pattern)
        const factory = await new Promise<
          (opts: Record<string, unknown>) => Promise<DexedUIModule>
        >((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = (window as any).createDexedUIModule;
          if (typeof existing === 'function') {
            resolve(existing);
            return;
          }

          const script = document.createElement('script');
          script.src = '/dexed/DexedUI.js';
          script.onload = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn = (window as any).createDexedUIModule;
            if (typeof fn === 'function') {
              resolve(fn);
            } else {
              reject(new Error('createDexedUIModule not found on window'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load DexedUI.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        const m = await factory({});
        if (cancelled) {
          m._dexed_ui_shutdown();
          return;
        }

        moduleRef.current = m;

        // Initialize WASM at DPR scale for Retina-crisp rendering
        const dpr = window.devicePixelRatio || 1;
        if (m._dexed_ui_init_scaled) {
          m._dexed_ui_init_scaled(dpr);
        } else {
          m._dexed_ui_init();
        }

        const w = m._dexed_ui_get_width();
        const h = m._dexed_ui_get_height();
        fbWidthRef.current = Math.round(w / dpr);
        fbHeightRef.current = Math.round(h / dpr);

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = w;
        canvas.height = h;
        const nativeW = fbWidthRef.current;
        const nativeH = fbHeightRef.current;

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
          m._dexed_ui_on_mouse_down(cx, cy, getModifiers(e));
        };

        const onMouseUp = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._dexed_ui_on_mouse_up(cx, cy, getModifiers(e));
        };

        const onMouseMove = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._dexed_ui_on_mouse_move(cx, cy, getModifiers(e));
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._dexed_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
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

        // Parameter callback: program change triggers immediate sync
        // (individual knob changes are caught by the ~10Hz polling in renderLoop)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._dexedUIParamCallback = (_paramId: number, _normalizedValue: number) => {
          // Force immediate voice sync on next frame by resetting hash
          lastVoiceHash = 0;
        };

        // MIDI callback: JUCE on-screen keyboard → JS → audio worklet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._dexedUIMidiCallback = (type: string, note: number, vel: number) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            const key = (instrumentId << 16) | 0xFFFF;
            const synth = engine.instruments.get(key) as any;
            if (!synth) return;

            if (type === 'noteOn') {
              synth.triggerAttack(note, undefined, vel / 127);
            } else if (type === 'noteOff') {
              synth.triggerRelease(note);
            }
          } catch { /* engine not ready */ }
        };

        // Cart button callback: JUCE cart button → JS file picker
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._dexedUICartCallback = () => {
          fileInputRef.current?.click();
        };

        eventCleanups.push(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._dexedUIParamCallback;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._dexedUIMidiCallback;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._dexedUICartCallback;
        });

        setLoaded(true);

        // Voice data sync: poll UI WASM voice data and push to VDX7 audio engine on change
        let lastVoiceHash = 0;
        let syncCounter = 0;
        const computeHash = (data: Uint8Array): number => {
          let h = 0;
          for (let i = 0; i < data.length; i++) h = ((h << 5) - h + data[i]) | 0;
          return h;
        };
        const syncVoiceToAudio = () => {
          if (!instrumentId) return;
          const voicePtr = m._dexed_ui_get_voice_data();
          if (!voicePtr) return;
          const vced = m.HEAPU8.subarray(voicePtr, voicePtr + 155);
          const hash = computeHash(vced);
          if (hash === lastVoiceHash) return;
          lastVoiceHash = hash;
          try {
            const engine = getToneEngine();
            const key = (instrumentId << 16) | 0xFFFF;
            const synth = engine.instruments.get(key);
            if (synth && '_loadVcedData' in synth) {
              // Use bulk dump path (direct memory write) — reliable
              (synth as any)._loadVcedData(new Uint8Array(vced));
            }
          } catch { /* engine not ready */ }
        };

        // rAF render loop — sync voice data at ~10Hz (every 6th frame)
        const renderLoop = () => {
          if (cancelled) return;
          if (m._dexed_ui_tick) m._dexed_ui_tick();
          blitFramebuffer(m, ctx, imgData, w, h);
          if (++syncCounter % 6 === 0) syncVoiceToAudio();
          rafId = requestAnimationFrame(renderLoop);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error('[DexedHardwareUI] Init failed:', err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());

      // Prevent stuck notes when switching away from hardware UI
      if (instrumentId) {
        try {
          const engine = getToneEngine();
          const key = (instrumentId << 16) | 0xFFFF;
          const synth = engine.instruments.get(key) as any;
          if (synth?.triggerRelease) synth.triggerRelease();
        } catch { /* engine not ready */ }
      }

      if (moduleRef.current) {
        moduleRef.current._dexed_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);

  if (error) {
    return (
      <div style={{ padding: 16, color: '#ff6666', fontFamily: 'monospace' }}>
        [DexedHardwareUI] Error: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleFileDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
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
          Loading Dexed DX7 hardware UI...
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
      {loaded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: '#333', color: '#ccc', border: '1px solid #555',
              borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}
          >
            Load .SYX
          </button>
          {patchInfo && (
            <span style={{ color: '#8f8', fontSize: 11, fontFamily: 'monospace' }}>{patchInfo}</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".syx,.SYX"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>
      )}
    </div>
  );
};

export default DexedHardwareUI;
