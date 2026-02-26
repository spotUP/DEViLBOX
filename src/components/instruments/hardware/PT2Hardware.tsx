/**
 * PT2Hardware — ProTracker 2 Sample Editor Hardware UI
 *
 * Wraps the pt2_sampled WASM module in a React component.
 * Renders the classic Amiga ProTracker sampler screen with waveform display,
 * loop markers, and parameter editing. Bidirectional sync with InstrumentConfig.
 *
 * Canvas is rendered declaratively in JSX (imperative createElement doesn't
 * survive React Strict Mode remounts).
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
const SAMPLER_Y = 121;       // Sampler screen starts at row 121
const SAMPLER_H = SCREEN_H - SAMPLER_Y; // 134 rows visible

/* Emscripten module interface */
interface PT2Module {
  onParamChange?: (paramId: number, value: number) => void;
  onLoopChange?: (loopStart: number, loopLength: number, loopType: number) => void;
  onPlaySample?: (ptr: number, len: number, loopStart: number, loopLength: number, loopType: number) => void;
  onStopSample?: () => void;
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
  _pt2_sampled_tick: () => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  HEAP8: Int8Array;
}

/* Blit ARGB framebuffer from WASM to canvas 2D context (sampler portion only) */
function blitFramebuffer(mod: PT2Module, ctx: CanvasRenderingContext2D, imgData: ImageData) {
  const fbPtr = mod._pt2_sampled_get_fb();
  const srcOffset = fbPtr + SAMPLER_Y * SCREEN_W * 4; // skip top 121 rows
  const src = mod.HEAPU8.subarray(srcOffset, srcOffset + SCREEN_W * SAMPLER_H * 4);
  const dst = imgData.data;
  /* WASM little-endian: ARGB 0xAARRGGBB stored as [BB,GG,RR,AA] */
  /* Canvas ImageData wants [RR,GG,BB,AA] */
  for (let i = 0; i < SCREEN_W * SAMPLER_H; i++) {
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

async function decodePCM(instrument: InstrumentConfig): Promise<{ pcm: Int8Array; sampleRate: number } | null> {
  const sample = instrument.sample;
  if (!sample) return null;

  let audioBuffer: AudioBuffer | null = null;

  try {
    if (sample.audioBuffer && sample.audioBuffer.byteLength > 0) {
      const ctx = new OfflineAudioContext(1, 1, 44100);
      audioBuffer = await ctx.decodeAudioData(sample.audioBuffer.slice(0));
    } else if (sample.url) {
      const resp = await fetch(sample.url);
      const arrayBuf = await resp.arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 44100);
      audioBuffer = await ctx.decodeAudioData(arrayBuf);
    }
  } catch {
    return null;
  }

  if (!audioBuffer) return null;

  const float32 = audioBuffer.getChannelData(0);
  const int8 = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let v = Math.round(float32[i] * 127);
    if (v > 127) v = 127;
    if (v < -128) v = -128;
    int8[i] = v;
  }

  return { pcm: int8, sampleRate: audioBuffer.sampleRate };
}

/* ── Component ─────────────────────────────────────────────────── */

export const PT2Hardware: React.FC<PT2HardwareProps> = ({ instrument, onChange }) => {
  const configRef = useRef(instrument);
  const moduleRef = useRef<PT2Module | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  const pcmLoadedRef = useRef(false);
  const sampleRateRef = useRef(44100);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

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

  /* Convert CSS mouse coordinates to WASM framebuffer coordinates */
  const canvasCoords = (canvas: HTMLCanvasElement, e: MouseEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [
      Math.floor((e.clientX - rect.left) * scaleX),
      Math.floor((e.clientY - rect.top) * scaleY) + SAMPLER_Y, // offset to absolute FB coords
    ];
  };

  /* Mount: load WASM and start render loop */
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current as HTMLCanvasElement;

    let cancelled = false;
    let mod: PT2Module | null = null;
    const eventCleanups: (() => void)[] = [];

    async function init() {
      try {
        /* Load Emscripten module via script injection */
        const factory = await new Promise<(opts: Record<string, unknown>) => Promise<PT2Module>>((resolve, reject) => {
          const existing = (window as unknown as Record<string, unknown>).createPT2SampEd;
          if (typeof existing === 'function') {
            resolve(existing as (opts: Record<string, unknown>) => Promise<PT2Module>);
            return;
          }

          const script = document.createElement('script');
          script.src = '/pt2/PT2SampEd.js';
          script.onload = () => {
            const fn = (window as unknown as Record<string, unknown>).createPT2SampEd;
            if (typeof fn === 'function') {
              resolve(fn as (opts: Record<string, unknown>) => Promise<PT2Module>);
            } else {
              reject(new Error('createPT2SampEd not found after script load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load PT2SampEd.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        /* Don't pass canvas to Emscripten — we do our own 2D rendering */
        mod = await factory({}) as PT2Module;
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

        /* Audio playback callbacks */
        mod.onPlaySample = (ptr: number, len: number, loopStart: number, loopLength: number, loopType: number) => {
          if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
          const ctx = audioCtxRef.current;
          // Stop previous playback
          if (currentSourceRef.current) {
            try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
            currentSourceRef.current = null;
          }
          if (len <= 0) return;
          // Copy Int8 sample data from WASM heap into a Float32 AudioBuffer
          const raw = new Int8Array(mod.HEAP8.buffer, ptr, len);
          const sr = sampleRateRef.current;
          const buf = ctx.createBuffer(1, len, sr);
          const ch = buf.getChannelData(0);
          for (let i = 0; i < len; i++) ch[i] = raw[i] / 128.0;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          if (loopType !== 0 && loopLength > 2) {
            src.loop = true;
            src.loopStart = loopStart / sr;
            src.loopEnd   = (loopStart + loopLength) / sr;
          }
          src.connect(ctx.destination);
          src.start();
          currentSourceRef.current = src;
          src.onended = () => { if (currentSourceRef.current === src) currentSourceRef.current = null; };
        };

        mod.onStopSample = () => {
          if (currentSourceRef.current) {
            try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
            currentSourceRef.current = null;
          }
        };

        /* Init */
        mod._pt2_sampled_init(SCREEN_W, SCREEN_H);
        mod._pt2_sampled_start();

        /* Wire up canvas events → C input handlers */
        const m = mod;
        const onMouseDown = (e: MouseEvent) => {
          e.preventDefault();
          canvas.focus(); // grab focus for keyboard
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
          e.preventDefault();
          m._pt2_sampled_on_key_down(e.keyCode);
        };
        const onKeyUp = (e: KeyboardEvent) => {
          // Clear modifier keys in WASM
          if (e.keyCode === 16 || e.keyCode === 17 || e.keyCode === 18) {
            // Send a synthetic key-up by clearing modifiers via a no-op key
            m._pt2_sampled_on_key_down(-e.keyCode); // negative = key up
          }
        };

        canvas.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('keydown', onKeyDown);
        canvas.addEventListener('keyup', onKeyUp);

        eventCleanups.push(
          () => canvas.removeEventListener('mousedown', onMouseDown),
          () => document.removeEventListener('mouseup', onMouseUp),
          () => document.removeEventListener('mousemove', onMouseMove),
          () => canvas.removeEventListener('wheel', onWheel),
          () => canvas.removeEventListener('keydown', onKeyDown),
          () => canvas.removeEventListener('keyup', onKeyUp),
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
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setError('Canvas 2D context unavailable');
          return;
        }
        const imgData = ctx.createImageData(SCREEN_W, SAMPLER_H);

        /* Start React-driven rAF render loop */
        let rafId = 0;
        const renderLoop = () => {
          if (cancelled) return;
          if (m._pt2_sampled_tick) m._pt2_sampled_tick();
          blitFramebuffer(m, ctx, imgData);
          rafId = requestAnimationFrame(renderLoop);
        };
        rafId = requestAnimationFrame(renderLoop);
        eventCleanups.push(() => cancelAnimationFrame(rafId));

        if (!cancelled) setLoaded(true);

        /* Decode and push PCM data */
        const decoded = await decodePCM(configRef.current);
        if (decoded && !cancelled && mod) {
          const { pcm, sampleRate } = decoded;
          sampleRateRef.current = sampleRate;
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
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch { /* ignore */ }
        currentSourceRef.current = null;
      }
      if (mod) {
        try { mod._pt2_sampled_shutdown(); } catch { /* ignore */ }
      }
      moduleRef.current = null;
      pcmLoadedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pt2-hardware-container flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={SCREEN_W}
        height={SAMPLER_H}
        tabIndex={0}
        style={{
          width: '100%',
          maxWidth: 640,
          height: 'auto',
          imageRendering: 'pixelated',
          display: 'block',
        }}
      />
      {!loaded && !error && (
        <div className="text-gray-400 text-sm mt-2">
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
