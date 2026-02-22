/**
 * HivelyHardware — Authentic HivelyTracker instrument editor UI
 *
 * Wraps the hvl_insed WASM/SDL2 module in a React component with
 * bidirectional parameter sync.  The C module renders the classic
 * blue/white Amiga-style editor while React maintains the source of truth.
 */

import React, { useRef, useEffect, useState } from 'react';
import type { HivelyConfig } from '@typedefs/instrument';

/* Parameter IDs must match the InsedParam enum in hvl_insed.h */
const INSED = {
  VOLUME: 0,
  WAVELENGTH: 1,
  ATTACK_FRAMES: 2,
  ATTACK_VOLUME: 3,
  DECAY_FRAMES: 4,
  DECAY_VOLUME: 5,
  SUSTAIN_FRAMES: 6,
  RELEASE_FRAMES: 7,
  RELEASE_VOLUME: 8,
  VIBRATO_DELAY: 9,
  VIBRATO_DEPTH: 10,
  VIBRATO_SPEED: 11,
  SQUARE_LOWER: 12,
  SQUARE_UPPER: 13,
  SQUARE_SPEED: 14,
  FILTER_LOWER: 15,
  FILTER_UPPER: 16,
  FILTER_SPEED: 17,
  PERF_SPEED: 18,
  PERF_LENGTH: 19,
  HARDCUT_FRAMES: 20,
  HARDCUT_RELEASE: 21,
  PARAM_COUNT: 22,
} as const;

interface HivelyHardwareProps {
  config: HivelyConfig;
  onChange: (config: HivelyConfig) => void;
}

/* Emscripten module interface (subset we use) */
interface InsEdModule {
  canvas: HTMLCanvasElement;
  onParamChange?: (paramId: number, value: number) => void;
  onPlistChange?: (
    index: number, note: number, waveform: number, fixed: number,
    fx0: number, fp0: number, fx1: number, fp1: number,
  ) => void;
  onPlistLengthChange?: (newLength: number) => void;
  _insed_init: (w: number, h: number) => void;
  _insed_start: () => void;
  _insed_shutdown: () => void;
  _insed_set_param: (paramId: number, value: number) => void;
  _insed_get_param: (paramId: number) => number;
  _insed_set_plist_entry: (
    index: number, note: number, waveform: number, fixed: number,
    fx0: number, fp0: number, fx1: number, fp1: number,
  ) => void;
  _insed_load_from_buffer: (ptr: number, len: number) => void;
  _insed_dump_to_buffer: (ptr: number, maxLen: number) => number;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
}

/* ── Config → flat buffer packing ──────────────────────────────── */

function configToBuffer(c: HivelyConfig): Uint8Array {
  const entries = c.performanceList?.entries ?? [];
  const buf = new Uint8Array(22 + entries.length * 5);

  buf[0]  = c.volume;
  buf[1]  = c.waveLength;
  buf[2]  = c.envelope.aFrames;
  buf[3]  = c.envelope.aVolume;
  buf[4]  = c.envelope.dFrames;
  buf[5]  = c.envelope.dVolume;
  buf[6]  = c.envelope.sFrames;
  buf[7]  = c.envelope.rFrames;
  buf[8]  = c.envelope.rVolume;
  buf[9]  = c.vibratoDelay;
  buf[10] = c.vibratoDepth;
  buf[11] = c.vibratoSpeed;
  buf[12] = c.squareLowerLimit;
  buf[13] = c.squareUpperLimit;
  buf[14] = c.squareSpeed;
  buf[15] = c.filterLowerLimit;
  buf[16] = c.filterUpperLimit;
  buf[17] = c.filterSpeed;
  buf[18] = c.performanceList?.speed ?? 1;
  buf[19] = entries.length;
  buf[20] = c.hardCutReleaseFrames;
  buf[21] = c.hardCutRelease ? 1 : 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const off = 22 + i * 5;
    buf[off]     = e.note;
    buf[off + 1] = (e.waveform & 0x7F) | ((e.fixed ? 1 : 0) << 7);
    buf[off + 2] = ((e.fx[0] & 0xF) << 4) | (e.fx[1] & 0xF);
    buf[off + 3] = e.fxParam[0];
    buf[off + 4] = e.fxParam[1];
  }

  return buf;
}

/* ── Param ID → config field mapping ──────────────────────────── */

function applyParamToConfig(
  config: HivelyConfig, paramId: number, value: number,
): HivelyConfig {
  const c = { ...config, envelope: { ...config.envelope },
              performanceList: { ...config.performanceList } };

  switch (paramId) {
    case INSED.VOLUME:          c.volume = value; break;
    case INSED.WAVELENGTH:      c.waveLength = value; break;
    case INSED.ATTACK_FRAMES:   c.envelope.aFrames = value; break;
    case INSED.ATTACK_VOLUME:   c.envelope.aVolume = value; break;
    case INSED.DECAY_FRAMES:    c.envelope.dFrames = value; break;
    case INSED.DECAY_VOLUME:    c.envelope.dVolume = value; break;
    case INSED.SUSTAIN_FRAMES:  c.envelope.sFrames = value; break;
    case INSED.RELEASE_FRAMES:  c.envelope.rFrames = value; break;
    case INSED.RELEASE_VOLUME:  c.envelope.rVolume = value; break;
    case INSED.VIBRATO_DELAY:   c.vibratoDelay = value; break;
    case INSED.VIBRATO_DEPTH:   c.vibratoDepth = value; break;
    case INSED.VIBRATO_SPEED:   c.vibratoSpeed = value; break;
    case INSED.SQUARE_LOWER:    c.squareLowerLimit = value; break;
    case INSED.SQUARE_UPPER:    c.squareUpperLimit = value; break;
    case INSED.SQUARE_SPEED:    c.squareSpeed = value; break;
    case INSED.FILTER_LOWER:    c.filterLowerLimit = value; break;
    case INSED.FILTER_UPPER:    c.filterUpperLimit = value; break;
    case INSED.FILTER_SPEED:    c.filterSpeed = value; break;
    case INSED.PERF_SPEED:      c.performanceList.speed = value; break;
    case INSED.PERF_LENGTH:     /* handled via plist length change */ break;
    case INSED.HARDCUT_FRAMES:  c.hardCutReleaseFrames = value; break;
    case INSED.HARDCUT_RELEASE: c.hardCutRelease = value !== 0; break;
  }

  return c;
}

function applyPlistToConfig(
  config: HivelyConfig,
  index: number,
  note: number, waveform: number, fixed: number,
  fx0: number, fp0: number, fx1: number, fp1: number,
): HivelyConfig {
  const entries = [...(config.performanceList?.entries ?? [])];

  /* Expand array if necessary */
  while (entries.length <= index) {
    entries.push({ note: 0, waveform: 0, fixed: false, fx: [0, 0], fxParam: [0, 0] });
  }

  entries[index] = {
    note,
    waveform,
    fixed: fixed !== 0,
    fx: [fx0, fx1] as [number, number],
    fxParam: [fp0, fp1] as [number, number],
  };

  return {
    ...config,
    performanceList: { ...config.performanceList, entries },
  };
}

/* ── Component ────────────────────────────────────────────────── */

export const HivelyHardware: React.FC<HivelyHardwareProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  const moduleRef = useRef<InsEdModule | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Keep ref in sync — CLAUDE.md configRef pattern */
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  /* Push config to WASM when config changes externally */
  useEffect(() => {
    const mod = moduleRef.current;
    if (!mod || !loaded) return;

    const buf = configToBuffer(config);
    const ptr = mod._malloc(buf.length);
    if (!ptr) return;
    mod.HEAPU8.set(buf, ptr);
    mod._insed_load_from_buffer(ptr, buf.length);
    mod._free(ptr);
  }, [config, loaded]);

  /* onChange stable ref */
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  /* Mount: load WASM and start SDL loop */
  useEffect(() => {
    let cancelled = false;
    let mod: InsEdModule | null = null;

    async function init() {
      try {
        /* Create canvas for SDL — must have id="canvas" for Emscripten event registration */
        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';
        canvas.width = 800;
        canvas.height = 480;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.imageRendering = 'pixelated';
        canvas.tabIndex = 0; /* allow keyboard focus */

        if (containerRef.current && !cancelled) {
          containerRef.current.appendChild(canvas);
          canvasRef.current = canvas;
        }

        /* Load Emscripten module via script injection (public/ assets) */
        const factory = await new Promise<(opts: { canvas: HTMLCanvasElement }) => Promise<InsEdModule>>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/hively/HivelyInsEd.js';
          script.onload = () => {
            const fn = (window as unknown as Record<string, unknown>).createHivelyInsEd;
            if (typeof fn === 'function') {
              resolve(fn as (opts: { canvas: HTMLCanvasElement }) => Promise<InsEdModule>);
            } else {
              reject(new Error('createHivelyInsEd not found after script load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load HivelyInsEd.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        mod = await factory({ canvas }) as InsEdModule;
        moduleRef.current = mod;

        /* Set up C→JS callbacks */
        mod.onParamChange = (paramId: number, value: number) => {
          const updated = applyParamToConfig(configRef.current, paramId, value);
          configRef.current = updated;
          onChangeRef.current(updated);
        };

        mod.onPlistChange = (
          index: number, note: number, waveform: number, fixed: number,
          fx0: number, fp0: number, fx1: number, fp1: number,
        ) => {
          const updated = applyPlistToConfig(
            configRef.current, index, note, waveform, fixed, fx0, fp0, fx1, fp1,
          );
          configRef.current = updated;
          onChangeRef.current(updated);
        };

        mod.onPlistLengthChange = (newLength: number) => {
          const entries = [...(configRef.current.performanceList?.entries ?? [])];
          /* Trim or extend to match */
          while (entries.length > newLength) entries.pop();
          while (entries.length < newLength) {
            entries.push({ note: 0, waveform: 0, fixed: false, fx: [0, 0], fxParam: [0, 0] });
          }
          const updated: HivelyConfig = {
            ...configRef.current,
            performanceList: { ...configRef.current.performanceList, entries },
          };
          configRef.current = updated;
          onChangeRef.current(updated);
        };

        /* Init and start the SDL main loop */
        mod._insed_init(800, 480);

        /* Push initial config */
        const buf = configToBuffer(configRef.current);
        const ptr = mod._malloc(buf.length);
        if (ptr) {
          mod.HEAPU8.set(buf, ptr);
          mod._insed_load_from_buffer(ptr, buf.length);
          mod._free(ptr);
        }

        mod._insed_start();

        if (!cancelled) setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    init();

    return () => {
      cancelled = true;
      if (mod) {
        try { mod._insed_shutdown(); } catch { /* ignore */ }
      }
      if (canvasRef.current && containerRef.current) {
        try { containerRef.current.removeChild(canvasRef.current); } catch { /* ignore */ }
        canvasRef.current = null;
      }
      moduleRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="hively-hardware-container flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative bg-black overflow-hidden"
        style={{
          maxWidth: 800,
          width: '100%',
          aspectRatio: '800 / 480',
        }}
        onClick={() => canvasRef.current?.focus()}
      />
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          Loading instrument editor...
        </div>
      )}
      {error && (
        <div className="text-red-400 text-sm mt-2 text-center">
          Failed to load hardware UI: {error}
        </div>
      )}
    </div>
  );
};
