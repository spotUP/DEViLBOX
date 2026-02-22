/**
 * PT2Hardware — ProTracker 2 Sample Editor Hardware UI
 *
 * Wraps the pt2_sampled WASM/SDL2 module in a React component.
 * Renders the classic Amiga ProTracker sampler screen with waveform display,
 * loop markers, and parameter editing. Bidirectional sync with InstrumentConfig.
 */

import React, { useRef, useEffect, useState } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';

/* Parameter IDs must match PT2Param enum in pt2_sampled.h */
const PT2 = {
  VOLUME: 0,
  FINETUNE: 1,
  LOOP_START_HI: 2,
  LOOP_START_LO: 3,
  LOOP_LENGTH_HI: 4,
  LOOP_LENGTH_LO: 5,
  LOOP_TYPE: 6,
} as const;

interface PT2HardwareProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

const SCREEN_W = 320;
const SCREEN_H = 255;

/* Emscripten module interface */
interface PT2Module {
  canvas: HTMLCanvasElement;
  onParamChange?: (paramId: number, value: number) => void;
  onLoopChange?: (loopStart: number, loopLength: number, loopType: number) => void;
  _pt2_sampled_init: (w: number, h: number) => void;
  _pt2_sampled_start: () => void;
  _pt2_sampled_shutdown: () => void;
  _pt2_sampled_load_pcm: (ptr: number, length: number) => void;
  _pt2_sampled_set_param: (paramId: number, value: number) => void;
  _pt2_sampled_get_param: (paramId: number) => number;
  _pt2_sampled_load_config: (ptr: number, len: number) => void;
  _pt2_sampled_dump_config: (ptr: number, maxLen: number) => number;
  _pt2_sampled_get_fb: () => number;
  _pt2_sampled_on_mouse_down: (x: number, y: number) => void;
  _pt2_sampled_on_mouse_up: (x: number, y: number) => void;
  _pt2_sampled_on_mouse_move: (x: number, y: number) => void;
  _pt2_sampled_on_wheel: (deltaY: number, x: number, y: number) => void;
  _pt2_sampled_on_key_down: (keyCode: number) => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  HEAP8: Int8Array;
}

/* Blit ARGB framebuffer from WASM to canvas 2D context */
function blitFramebuffer(mod: PT2Module, ctx: CanvasRenderingContext2D, imgData: ImageData) {
  const fbPtr = mod._pt2_sampled_get_fb();
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + SCREEN_W * SCREEN_H * 4);
  const dst = imgData.data;
  /* WASM little-endian: ARGB 0xAARRGGBB stored as [BB,GG,RR,AA] */
  /* Canvas ImageData wants [RR,GG,BB,AA] */
  for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
    const off = i * 4;
    dst[off]     = src[off + 2]; // R
    dst[off + 1] = src[off + 1]; // G
    dst[off + 2] = src[off];     // B
    dst[off + 3] = 255;          // A
  }
  ctx.putImageData(imgData, 0, 0);
}

/* ── Config → buffer packing (11 bytes) ────────────────────────── */

function configToBuffer(inst: InstrumentConfig): Uint8Array {
  const buf = new Uint8Array(11);
  const sample = inst.sample;
  const mod = inst.metadata?.modPlayback;

  buf[0] = mod?.defaultVolume ?? 64;
  buf[1] = ((mod?.finetune ?? 0) + 8) & 0xF; // -8..+7 → 0..15

  const loopStart = sample?.loopStart ?? 0;
  const loopLength = (sample?.loopEnd ?? 0) - (sample?.loopStart ?? 0);

  // Loop start (uint32 LE)
  buf[2] = loopStart & 0xFF;
  buf[3] = (loopStart >> 8) & 0xFF;
  buf[4] = (loopStart >> 16) & 0xFF;
  buf[5] = (loopStart >> 24) & 0xFF;

  // Loop length (uint32 LE)
  const ll = loopLength > 0 ? loopLength : 0;
  buf[6] = ll & 0xFF;
  buf[7] = (ll >> 8) & 0xFF;
  buf[8] = (ll >> 16) & 0xFF;
  buf[9] = (ll >> 24) & 0xFF;

  // Loop type: 0=off, 1=forward
  const lt = sample?.loopType;
  buf[10] = (lt === 'forward' || lt === 'pingpong') ? 1 : 0;

  return buf;
}

/* ── Audio decode: Float32 → Int8Array ─────────────────────────── */

async function decodePCM(instrument: InstrumentConfig): Promise<Int8Array | null> {
  const sample = instrument.sample;
  if (!sample) return null;

  let audioBuffer: AudioBuffer | null = null;

  try {
    // Try decoding from audioBuffer first
    if (sample.audioBuffer && sample.audioBuffer.byteLength > 0) {
      const ctx = new OfflineAudioContext(1, 1, 44100);
      audioBuffer = await ctx.decodeAudioData(sample.audioBuffer.slice(0));
    } else if (sample.url) {
      // Fetch from URL
      const resp = await fetch(sample.url);
      const arrayBuf = await resp.arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 44100);
      audioBuffer = await ctx.decodeAudioData(arrayBuf);
    }
  } catch {
    return null;
  }

  if (!audioBuffer) return null;

  // Convert Float32 → Int8 (signed 8-bit)
  const float32 = audioBuffer.getChannelData(0);
  const int8 = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let v = Math.round(float32[i] * 127);
    if (v > 127) v = 127;
    if (v < -128) v = -128;
    int8[i] = v;
  }

  return int8;
}

/* ── Component ─────────────────────────────────────────────────── */

export const PT2Hardware: React.FC<PT2HardwareProps> = ({ instrument, onChange }) => {
  const configRef = useRef(instrument);
  const moduleRef = useRef<PT2Module | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  const pcmLoadedRef = useRef(false);

  /* Keep refs in sync — CLAUDE.md configRef pattern */
  useEffect(() => { configRef.current = instrument; }, [instrument]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  /* Push config to WASM when config changes externally */
  useEffect(() => {
    const mod = moduleRef.current;
    if (!mod || !loaded) return;

    const buf = configToBuffer(instrument);
    const ptr = mod._malloc(buf.length);
    if (!ptr) return;
    mod.HEAPU8.set(buf, ptr);
    mod._pt2_sampled_load_config(ptr, buf.length);
    mod._free(ptr);
  }, [instrument, loaded]);

  /* Convert CSS mouse coordinates to canvas pixel coordinates */
  const canvasCoords = (canvas: HTMLCanvasElement, e: MouseEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [
      Math.floor((e.clientX - rect.left) * scaleX),
      Math.floor((e.clientY - rect.top) * scaleY),
    ];
  };

  /* Mount: load WASM and start render loop */
  useEffect(() => {
    let cancelled = false;
    let mod: PT2Module | null = null;
    const eventCleanups: (() => void)[] = [];

    async function init() {
      try {
        /* Create canvas — no SDL, so no id requirement */
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 255;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.imageRendering = 'pixelated';
        canvas.tabIndex = 0;

        if (containerRef.current && !cancelled) {
          containerRef.current.appendChild(canvas);
          canvasRef.current = canvas;
        }

        /* Load Emscripten module via script injection */
        const factory = await new Promise<(opts: { canvas: HTMLCanvasElement }) => Promise<PT2Module>>((resolve, reject) => {
          const existing = (window as unknown as Record<string, unknown>).createPT2SampEd;
          if (typeof existing === 'function') {
            resolve(existing as (opts: { canvas: HTMLCanvasElement }) => Promise<PT2Module>);
            return;
          }

          const script = document.createElement('script');
          script.src = '/pt2/PT2SampEd.js';
          script.onload = () => {
            const fn = (window as unknown as Record<string, unknown>).createPT2SampEd;
            if (typeof fn === 'function') {
              resolve(fn as (opts: { canvas: HTMLCanvasElement }) => Promise<PT2Module>);
            } else {
              reject(new Error('createPT2SampEd not found after script load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load PT2SampEd.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        mod = await factory({ canvas }) as PT2Module;
        moduleRef.current = mod;

        /* C→JS callbacks */
        mod.onParamChange = (paramId: number, value: number) => {
          const inst = configRef.current;
          const updates: Partial<InstrumentConfig> = {};

          switch (paramId) {
            case PT2.VOLUME:
              updates.metadata = {
                ...inst.metadata,
                modPlayback: {
                  ...inst.metadata?.modPlayback,
                  usePeriodPlayback: inst.metadata?.modPlayback?.usePeriodPlayback ?? false,
                  periodMultiplier: inst.metadata?.modPlayback?.periodMultiplier ?? 3546895,
                  finetune: inst.metadata?.modPlayback?.finetune ?? 0,
                  defaultVolume: value,
                },
              };
              break;
            case PT2.FINETUNE:
              updates.metadata = {
                ...inst.metadata,
                modPlayback: {
                  ...inst.metadata?.modPlayback,
                  usePeriodPlayback: inst.metadata?.modPlayback?.usePeriodPlayback ?? false,
                  periodMultiplier: inst.metadata?.modPlayback?.periodMultiplier ?? 3546895,
                  finetune: value > 7 ? value - 16 : value, // 0-15 → -8..+7
                  defaultVolume: inst.metadata?.modPlayback?.defaultVolume ?? 64,
                },
              };
              break;
          }

          if (Object.keys(updates).length > 0) {
            configRef.current = { ...inst, ...updates };
            onChangeRef.current(updates);
          }
        };

        mod.onLoopChange = (loopStart: number, loopLength: number, loopType: number) => {
          const inst = configRef.current;
          const loopEnd = loopStart + loopLength;
          const lt = loopType === 0 ? 'off' as const : 'forward' as const;

          const updates: Partial<InstrumentConfig> = {
            sample: {
              ...inst.sample!,
              loopStart,
              loopEnd,
              loopType: lt,
              loop: loopType > 0,
            },
          };

          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };

        /* Init */
        mod._pt2_sampled_init(SCREEN_W, SCREEN_H);
        mod._pt2_sampled_start(); // no-op, kept for API compat

        /* Wire up canvas events → C input handlers */
        const m = mod; // capture for closures
        const onMouseDown = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._pt2_sampled_on_mouse_down(cx, cy);
        };
        const onMouseUp = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._pt2_sampled_on_mouse_up(cx, cy);
        };
        const onMouseMove = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._pt2_sampled_on_mouse_move(cx, cy);
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._pt2_sampled_on_wheel(Math.sign(e.deltaY), cx, cy);
        };
        const onKeyDown = (e: KeyboardEvent) => {
          const navKeys = [36, 35, 37, 39]; // Home, End, Left, Right
          if (navKeys.includes(e.keyCode)) {
            e.preventDefault();
            m._pt2_sampled_on_key_down(e.keyCode);
          }
        };

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('keydown', onKeyDown);

        eventCleanups.push(
          () => canvas.removeEventListener('mousedown', onMouseDown),
          () => canvas.removeEventListener('mouseup', onMouseUp),
          () => canvas.removeEventListener('mousemove', onMouseMove),
          () => canvas.removeEventListener('wheel', onWheel),
          () => canvas.removeEventListener('keydown', onKeyDown),
        );

        /* Push initial config */
        const buf = configToBuffer(configRef.current);
        const ptr = mod._malloc(buf.length);
        if (ptr) {
          mod.HEAPU8.set(buf, ptr);
          mod._pt2_sampled_load_config(ptr, buf.length);
          mod._free(ptr);
        }

        /* Get 2D context and create reusable ImageData */
        const ctx = canvas.getContext('2d')!;
        const imgData = ctx.createImageData(SCREEN_W, SCREEN_H);

        /* Start React-driven rAF render loop */
        let rafId = 0;
        const renderLoop = () => {
          if (cancelled) return;
          blitFramebuffer(m, ctx, imgData);
          rafId = requestAnimationFrame(renderLoop);
        };
        rafId = requestAnimationFrame(renderLoop);
        eventCleanups.push(() => cancelAnimationFrame(rafId));

        if (!cancelled) setLoaded(true);

        /* Decode and push PCM data */
        const pcm = await decodePCM(configRef.current);
        if (pcm && !cancelled && mod) {
          const pcmPtr = mod._malloc(pcm.length);
          if (pcmPtr) {
            mod.HEAP8.set(pcm, pcmPtr);
            mod._pt2_sampled_load_pcm(pcmPtr, pcm.length);
            mod._free(pcmPtr);
            pcmLoadedRef.current = true;
          }
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    init();

    return () => {
      cancelled = true;
      eventCleanups.forEach(fn => fn());
      if (mod) {
        try { mod._pt2_sampled_shutdown(); } catch { /* ignore */ }
      }
      if (canvasRef.current && containerRef.current) {
        try { containerRef.current.removeChild(canvasRef.current); } catch { /* ignore */ }
        canvasRef.current = null;
      }
      moduleRef.current = null;
      pcmLoadedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pt2-hardware-container flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative bg-black overflow-hidden"
        style={{
          maxWidth: 640,
          width: '100%',
          aspectRatio: '320 / 255',
        }}
        onClick={() => canvasRef.current?.focus()}
      />
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          Loading PT2 sample editor...
        </div>
      )}
      {error && (
        <div className="text-red-400 text-sm mt-2 text-center">
          Failed to load PT2 hardware UI: {error}
        </div>
      )}
    </div>
  );
};
