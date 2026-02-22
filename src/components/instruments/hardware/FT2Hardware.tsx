/**
 * FT2Hardware — FastTracker 2 Instrument/Sample Editor Hardware UI
 *
 * Wraps the ft2_sampled WASM/SDL2 module in a React component.
 * Renders the classic FT2 instrument editor with volume/panning envelope
 * editors, auto-vibrato controls, and sample waveform display.
 * Bidirectional sync with InstrumentConfig.
 */

import React, { useRef, useEffect, useState } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { EnvelopePoints, AutoVibrato } from '@typedefs/tracker';

/* Parameter IDs must match FT2Param enum in ft2_sampled.h */
const FT2 = {
  VOLUME: 0,
  PANNING: 1,
  FINETUNE: 2,
  RELATIVE_NOTE: 3,
  LOOP_TYPE: 4,
  FADEOUT: 5,
  VIB_TYPE: 6,
  VIB_SWEEP: 7,
  VIB_DEPTH: 8,
  VIB_RATE: 9,
  VOL_ENV_ON: 10,
  VOL_ENV_SUSTAIN: 11,
  VOL_ENV_LOOP_START: 12,
  VOL_ENV_LOOP_END: 13,
  VOL_ENV_NUM_POINTS: 14,
  PAN_ENV_ON: 15,
  PAN_ENV_SUSTAIN: 16,
  PAN_ENV_LOOP_START: 17,
  PAN_ENV_LOOP_END: 18,
  PAN_ENV_NUM_POINTS: 19,
} as const;

interface FT2HardwareProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

/* Emscripten module interface */
interface FT2Module {
  canvas: HTMLCanvasElement;
  onParamChange?: (paramId: number, value: number) => void;
  onLoopChange?: (loopStart: number, loopLength: number, loopType: number) => void;
  onVolEnvChange?: (index: number, tick: number, value: number) => void;
  onPanEnvChange?: (index: number, tick: number, value: number) => void;
  onVolEnvFlagsChange?: (enabled: number, sustain: number, loopStart: number, loopEnd: number, numPoints: number) => void;
  onPanEnvFlagsChange?: (enabled: number, sustain: number, loopStart: number, loopEnd: number, numPoints: number) => void;
  _ft2_sampled_init: (w: number, h: number) => void;
  _ft2_sampled_start: () => void;
  _ft2_sampled_shutdown: () => void;
  _ft2_sampled_load_pcm: (ptr: number, length: number) => void;
  _ft2_sampled_set_param: (paramId: number, value: number) => void;
  _ft2_sampled_get_param: (paramId: number) => number;
  _ft2_sampled_set_loop: (loopStart: number, loopLength: number, loopType: number) => void;
  _ft2_sampled_set_vol_env_point: (index: number, tick: number, value: number) => void;
  _ft2_sampled_set_pan_env_point: (index: number, tick: number, value: number) => void;
  _ft2_sampled_load_config: (ptr: number, len: number) => void;
  _ft2_sampled_dump_config: (ptr: number, maxLen: number) => number;
  _ft2_sampled_on_mouse_down: (x: number, y: number) => void;
  _ft2_sampled_on_mouse_up: (x: number, y: number) => void;
  _ft2_sampled_on_mouse_move: (x: number, y: number) => void;
  _ft2_sampled_on_wheel: (deltaY: number, x: number, y: number) => void;
  _ft2_sampled_on_key_down: (keyCode: number) => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
}

/* Vibrato type string ↔ number */
const VIB_TYPES: AutoVibrato['type'][] = ['sine', 'square', 'rampDown', 'rampUp'];

/* ── Config → buffer packing (126 bytes) ───────────────────────── */

function configToBuffer(inst: InstrumentConfig): Uint8Array {
  const buf = new Uint8Array(126);
  const sample = inst.sample;
  const mod = inst.metadata?.modPlayback;
  const volEnv = inst.metadata?.originalEnvelope;
  const panEnv = inst.metadata?.panningEnvelope;
  const vib = inst.metadata?.autoVibrato;

  buf[0] = mod?.defaultVolume ?? 64;
  buf[1] = mod?.panning ?? 128;

  // Finetune (int16 LE)
  const ft = mod?.finetune ?? 0;
  buf[2] = ft & 0xFF;
  buf[3] = (ft >> 8) & 0xFF;

  buf[4] = mod?.relativeNote ?? 0;

  // Loop type
  const lt = sample?.loopType;
  buf[5] = lt === 'forward' ? 1 : lt === 'pingpong' ? 2 : 0;

  // Loop start (int32 LE)
  const ls = sample?.loopStart ?? 0;
  buf[6] = ls & 0xFF;
  buf[7] = (ls >> 8) & 0xFF;
  buf[8] = (ls >> 16) & 0xFF;
  buf[9] = (ls >> 24) & 0xFF;

  // Loop length (int32 LE)
  const ll = Math.max(0, (sample?.loopEnd ?? 0) - (sample?.loopStart ?? 0));
  buf[10] = ll & 0xFF;
  buf[11] = (ll >> 8) & 0xFF;
  buf[12] = (ll >> 16) & 0xFF;
  buf[13] = (ll >> 24) & 0xFF;

  // Fadeout (uint16 LE)
  const fo = inst.metadata?.fadeout ?? 0;
  buf[14] = fo & 0xFF;
  buf[15] = (fo >> 8) & 0xFF;

  // Auto-vibrato
  buf[16] = VIB_TYPES.indexOf(vib?.type ?? 'sine');
  buf[17] = vib?.sweep ?? 0;
  buf[18] = vib?.depth ?? 0;
  buf[19] = vib?.rate ?? 0;

  // Volume envelope
  const volPts = volEnv?.points ?? [{ tick: 0, value: 64 }, { tick: 325, value: 0 }];
  buf[20] = (volEnv?.enabled ? 1 : 0);
  buf[21] = volEnv?.sustainPoint != null ? volEnv.sustainPoint : 0xFF; // -1 → 0xFF
  buf[22] = volEnv?.loopStartPoint != null ? volEnv.loopStartPoint : 0xFF;
  buf[23] = volEnv?.loopEndPoint != null ? volEnv.loopEndPoint : 0xFF;

  for (let i = 0; i < 12; i++) {
    const off = 24 + i * 4;
    if (i < volPts.length) {
      const t = volPts[i].tick;
      const v = volPts[i].value;
      buf[off]     = t & 0xFF;
      buf[off + 1] = (t >> 8) & 0xFF;
      buf[off + 2] = v & 0xFF;
      buf[off + 3] = (v >> 8) & 0xFF;
    }
  }

  // Panning envelope
  const panPts = panEnv?.points ?? [{ tick: 0, value: 32 }, { tick: 325, value: 32 }];
  buf[72] = (panEnv?.enabled ? 1 : 0);
  buf[73] = panEnv?.sustainPoint != null ? panEnv.sustainPoint : 0xFF;
  buf[74] = panEnv?.loopStartPoint != null ? panEnv.loopStartPoint : 0xFF;
  buf[75] = panEnv?.loopEndPoint != null ? panEnv.loopEndPoint : 0xFF;

  for (let i = 0; i < 12; i++) {
    const off = 76 + i * 4;
    if (i < panPts.length) {
      const t = panPts[i].tick;
      const v = panPts[i].value;
      buf[off]     = t & 0xFF;
      buf[off + 1] = (t >> 8) & 0xFF;
      buf[off + 2] = v & 0xFF;
      buf[off + 3] = (v >> 8) & 0xFF;
    }
  }

  // Num points
  buf[124] = volPts.length;
  buf[125] = panPts.length;

  return buf;
}

/* ── Audio decode: Float32 → Int16Array ────────────────────────── */

async function decodePCM(instrument: InstrumentConfig): Promise<Int16Array | null> {
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
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let v = Math.round(float32[i] * 32767);
    if (v > 32767) v = 32767;
    if (v < -32768) v = -32768;
    int16[i] = v;
  }

  return int16;
}

/* ── Helper: update envelope in metadata ───────────────────────── */

function updateVolEnvPoint(
  inst: InstrumentConfig,
  index: number, tick: number, value: number,
): Partial<InstrumentConfig> {
  const env = inst.metadata?.originalEnvelope;
  const points = [...(env?.points ?? [])];
  while (points.length <= index) points.push({ tick: 0, value: 0 });
  points[index] = { tick, value };

  return {
    metadata: {
      ...inst.metadata,
      originalEnvelope: { ...env!, points },
    },
  };
}

function updatePanEnvPoint(
  inst: InstrumentConfig,
  index: number, tick: number, value: number,
): Partial<InstrumentConfig> {
  const env = inst.metadata?.panningEnvelope;
  const points = [...(env?.points ?? [])];
  while (points.length <= index) points.push({ tick: 0, value: 32 });
  points[index] = { tick, value };

  return {
    metadata: {
      ...inst.metadata,
      panningEnvelope: { ...env!, points },
    },
  };
}

function updateEnvFlags(
  inst: InstrumentConfig,
  envKey: 'originalEnvelope' | 'panningEnvelope',
  enabled: number, sustain: number, loopStart: number, loopEnd: number, numPoints: number,
): Partial<InstrumentConfig> {
  const env = inst.metadata?.[envKey];
  const points = [...(env?.points ?? [])];

  // Truncate or extend points array
  while (points.length > numPoints) points.pop();
  while (points.length < numPoints) {
    const lastTick = points.length > 0 ? points[points.length - 1].tick + 10 : 0;
    points.push({ tick: lastTick, value: envKey === 'originalEnvelope' ? 64 : 32 });
  }

  return {
    metadata: {
      ...inst.metadata,
      [envKey]: {
        ...env,
        enabled: enabled !== 0,
        points,
        sustainPoint: sustain === 0xFF || sustain < 0 ? null : sustain,
        loopStartPoint: loopStart === 0xFF || loopStart < 0 ? null : loopStart,
        loopEndPoint: loopEnd === 0xFF || loopEnd < 0 ? null : loopEnd,
      } as EnvelopePoints,
    },
  };
}

/* ── Component ─────────────────────────────────────────────────── */

export const FT2Hardware: React.FC<FT2HardwareProps> = ({ instrument, onChange }) => {
  const configRef = useRef(instrument);
  const moduleRef = useRef<FT2Module | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);

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
    mod._ft2_sampled_load_config(ptr, buf.length);
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
    let mod: FT2Module | null = null;
    const eventCleanups: (() => void)[] = [];

    async function init() {
      try {
        /* Create canvas — no SDL, so no id requirement */
        const canvas = document.createElement('canvas');
        canvas.width = 632;
        canvas.height = 400;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.imageRendering = 'pixelated';
        canvas.tabIndex = 0;

        if (containerRef.current && !cancelled) {
          containerRef.current.appendChild(canvas);
          canvasRef.current = canvas;
        }

        /* Load Emscripten module via script injection */
        const factory = await new Promise<(opts: { canvas: HTMLCanvasElement }) => Promise<FT2Module>>((resolve, reject) => {
          const existing = (window as unknown as Record<string, unknown>).createFT2SampEd;
          if (typeof existing === 'function') {
            resolve(existing as (opts: { canvas: HTMLCanvasElement }) => Promise<FT2Module>);
            return;
          }

          const script = document.createElement('script');
          script.src = '/ft2/FT2SampEd.js';
          script.onload = () => {
            const fn = (window as unknown as Record<string, unknown>).createFT2SampEd;
            if (typeof fn === 'function') {
              resolve(fn as (opts: { canvas: HTMLCanvasElement }) => Promise<FT2Module>);
            } else {
              reject(new Error('createFT2SampEd not found after script load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load FT2SampEd.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        mod = await factory({ canvas }) as FT2Module;
        moduleRef.current = mod;

        /* ── C→JS callbacks ──────────────────────────────────── */

        mod.onParamChange = (paramId: number, value: number) => {
          const inst = configRef.current;
          const updates: Partial<InstrumentConfig> = {};

          switch (paramId) {
            case FT2.VOLUME:
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
            case FT2.PANNING:
              updates.metadata = {
                ...inst.metadata,
                modPlayback: {
                  ...inst.metadata?.modPlayback,
                  usePeriodPlayback: inst.metadata?.modPlayback?.usePeriodPlayback ?? false,
                  periodMultiplier: inst.metadata?.modPlayback?.periodMultiplier ?? 3546895,
                  finetune: inst.metadata?.modPlayback?.finetune ?? 0,
                  panning: value,
                },
              };
              break;
            case FT2.FINETUNE:
              updates.metadata = {
                ...inst.metadata,
                modPlayback: {
                  ...inst.metadata?.modPlayback,
                  usePeriodPlayback: inst.metadata?.modPlayback?.usePeriodPlayback ?? false,
                  periodMultiplier: inst.metadata?.modPlayback?.periodMultiplier ?? 3546895,
                  finetune: value,
                  defaultVolume: inst.metadata?.modPlayback?.defaultVolume ?? 64,
                },
              };
              break;
            case FT2.FADEOUT:
              updates.metadata = {
                ...inst.metadata,
                fadeout: value,
              };
              break;
            case FT2.VIB_TYPE:
            case FT2.VIB_SWEEP:
            case FT2.VIB_DEPTH:
            case FT2.VIB_RATE: {
              const curVib = inst.metadata?.autoVibrato ?? { type: 'sine' as const, sweep: 0, depth: 0, rate: 0 };
              const newVib = { ...curVib };
              if (paramId === FT2.VIB_TYPE) newVib.type = VIB_TYPES[value] ?? 'sine';
              if (paramId === FT2.VIB_SWEEP) newVib.sweep = value;
              if (paramId === FT2.VIB_DEPTH) newVib.depth = value;
              if (paramId === FT2.VIB_RATE) newVib.rate = value;
              updates.metadata = { ...inst.metadata, autoVibrato: newVib };
              break;
            }
          }

          if (Object.keys(updates).length > 0) {
            configRef.current = { ...inst, ...updates };
            onChangeRef.current(updates);
          }
        };

        mod.onLoopChange = (loopStart: number, loopLength: number, loopType: number) => {
          const inst = configRef.current;
          const lt = loopType === 0 ? 'off' as const :
                     loopType === 1 ? 'forward' as const : 'pingpong' as const;

          const updates: Partial<InstrumentConfig> = {
            sample: {
              ...inst.sample!,
              loopStart,
              loopEnd: loopStart + loopLength,
              loopType: lt,
              loop: loopType > 0,
            },
          };

          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };

        mod.onVolEnvChange = (index: number, tick: number, value: number) => {
          const inst = configRef.current;
          const updates = updateVolEnvPoint(inst, index, tick, value);
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };

        mod.onPanEnvChange = (index: number, tick: number, value: number) => {
          const inst = configRef.current;
          const updates = updatePanEnvPoint(inst, index, tick, value);
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };

        mod.onVolEnvFlagsChange = (enabled: number, sustain: number, loopStart: number, loopEnd: number, numPoints: number) => {
          const inst = configRef.current;
          const updates = updateEnvFlags(inst, 'originalEnvelope', enabled, sustain, loopStart, loopEnd, numPoints);
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };

        mod.onPanEnvFlagsChange = (enabled: number, sustain: number, loopStart: number, loopEnd: number, numPoints: number) => {
          const inst = configRef.current;
          const updates = updateEnvFlags(inst, 'panningEnvelope', enabled, sustain, loopStart, loopEnd, numPoints);
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };

        /* Init (no SDL) */
        mod._ft2_sampled_init(632, 400);

        /* Wire up canvas events → C input handlers */
        const m = mod;
        const onMouseDown = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._ft2_sampled_on_mouse_down(cx, cy);
        };
        const onMouseUp = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._ft2_sampled_on_mouse_up(cx, cy);
        };
        const onMouseMove = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._ft2_sampled_on_mouse_move(cx, cy);
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._ft2_sampled_on_wheel(Math.sign(e.deltaY), cx, cy);
        };
        const onKeyDown = (e: KeyboardEvent) => {
          const navKeys = [37, 39]; // Left, Right
          if (navKeys.includes(e.keyCode)) {
            e.preventDefault();
            m._ft2_sampled_on_key_down(e.keyCode);
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
          mod._ft2_sampled_load_config(ptr, buf.length);
          mod._free(ptr);
        }

        /* Start main loop */
        mod._ft2_sampled_start();

        if (!cancelled) setLoaded(true);

        /* Decode and push PCM data */
        const pcm = await decodePCM(configRef.current);
        if (pcm && !cancelled && mod) {
          const pcmPtr = mod._malloc(pcm.length * 2); // 2 bytes per int16
          if (pcmPtr) {
            mod.HEAP16.set(pcm, pcmPtr >> 1); // Divide by 2 for int16 alignment
            mod._ft2_sampled_load_pcm(pcmPtr, pcm.length);
            mod._free(pcmPtr);
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
        try { mod._ft2_sampled_shutdown(); } catch { /* ignore */ }
      }
      if (canvasRef.current && containerRef.current) {
        try { containerRef.current.removeChild(canvasRef.current); } catch { /* ignore */ }
        canvasRef.current = null;
      }
      moduleRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ft2-hardware-container flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative bg-black overflow-hidden"
        style={{
          maxWidth: 632,
          width: '100%',
          aspectRatio: '632 / 400',
        }}
        onClick={() => canvasRef.current?.focus()}
      />
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          Loading FT2 instrument editor...
        </div>
      )}
      {error && (
        <div className="text-red-400 text-sm mt-2 text-center">
          Failed to load FT2 hardware UI: {error}
        </div>
      )}
    </div>
  );
};
