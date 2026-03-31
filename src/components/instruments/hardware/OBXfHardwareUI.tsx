/**
 * OBXfHardwareUI — Full JUCE OB-Xf editor rendered from WASM framebuffer
 *
 * Loads the OB-Xf UI WASM module (compiled from the original JUCE plugin
 * editor with SVG-themed controls, preset browser, and parameter panels),
 * renders to a pixel buffer, and blits to an HTML canvas each frame.
 * Same pattern as Dexed/Monique/AMSynth hardware UIs.
 *
 * Parameter changes in the WASM UI are forwarded to the audio worklet
 * via window._obxfUIParamCallback.
 *
 * Pixel format: JUCE ARGB little-endian [B,G,R,A] → Canvas [R,G,B,A]
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getToneEngine } from '../../../engine/ToneEngine';
import { OBXD_NATIVE_PRESETS } from '../../../engine/obxd/OBXdSynth';

// OBXf UI param string ID → OBXd audio worklet param index mapping
// OBXf (OB-Xf fork) has ~80+ params with string IDs; OBXd audio WASM has 45 integer-indexed params
const OBXF_ID_TO_OBXD: Record<string, number> = {
  // Master
  Volume: 34,        // MASTER_VOLUME
  // Global
  Polyphony: 35,     // VOICES
  Portamento: 38,    // PORTAMENTO
  Unison: 36,        // UNISON
  UnisonDetune: 37,  // UNISON_DETUNE
  // Oscillators
  Osc1Pitch: 1,      // OSC1_OCTAVE (semitone → octave, both 0-1 normalized)
  Osc2Detune: 7,     // OSC2_DETUNE
  Osc2Pitch: 6,      // OSC2_OCTAVE
  OscPW: 3,          // OSC1_PW
  Osc2PWOffset: 8,   // OSC2_PW
  OscSync: 11,       // OSC_SYNC
  // Mixer
  Osc1Mix: 4,        // OSC1_LEVEL
  Osc2Mix: 9,        // OSC2_LEVEL
  NoiseMix: 41,      // NOISE_LEVEL
  // Filter
  FilterCutoff: 13,  // FILTER_CUTOFF
  FilterResonance: 14, // FILTER_RESONANCE
  FilterEnvAmount: 16, // FILTER_ENV_AMOUNT
  FilterKeyFollow: 17, // FILTER_KEY_TRACK
  Filter4PoleMode: 15, // FILTER_TYPE
  // Filter Envelope
  FilterEnvAttack: 19,  // FILTER_ATTACK
  FilterEnvDecay: 20,   // FILTER_DECAY
  FilterEnvSustain: 21, // FILTER_SUSTAIN
  FilterEnvRelease: 22, // FILTER_RELEASE
  VelToFilterEnv: 18,   // FILTER_VELOCITY
  // Amp Envelope
  AmpEnvAttack: 23,  // AMP_ATTACK
  AmpEnvDecay: 24,   // AMP_DECAY
  AmpEnvSustain: 25, // AMP_SUSTAIN
  AmpEnvRelease: 26, // AMP_RELEASE
  // LFO (map LFO1 → OBXd's single LFO)
  LFO1Rate: 27,        // LFO_RATE
  LFO1ModAmount1: 30,  // LFO_OSC_AMOUNT
  LFO1ModAmount2: 31,  // LFO_FILTER_AMOUNT
};

interface OBXfUIModule {
  _obxf_ui_init: () => void;
  _obxf_ui_init_scaled: (scale: number) => void;
  _obxf_ui_tick: () => void;
  _obxf_ui_get_fb: () => number;
  _obxf_ui_get_width: () => number;
  _obxf_ui_get_height: () => number;
  _obxf_ui_on_mouse_down: (x: number, y: number, mods: number) => void;
  _obxf_ui_on_mouse_up: (x: number, y: number, mods: number) => void;
  _obxf_ui_on_mouse_move: (x: number, y: number, mods: number) => void;
  _obxf_ui_on_mouse_wheel: (x: number, y: number, deltaX: number, deltaY: number) => void;
  _obxf_ui_set_param: (paramId: number, value: number) => void;
  _obxf_ui_get_param: (paramId: number) => number;
  _obxf_ui_get_param_count: () => number;
  _obxf_ui_set_program: (program: number) => void;
  _obxf_ui_get_program: () => number;
  _obxf_ui_get_program_count: () => number;
  _obxf_ui_populate_presets: () => void;
  _obxf_ui_shutdown: () => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
}

function blitFramebuffer(
  mod: OBXfUIModule,
  ctx: CanvasRenderingContext2D,
  imgData: ImageData,
  fbWidth: number,
  fbHeight: number
) {
  const fbPtr = mod._obxf_ui_get_fb();
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

interface OBXfHardwareUIProps {
  parameters?: Record<string, number>;
  onParamChange?: (key: string, value: number) => void;
  instrumentId?: number;
}

export const OBXfHardwareUI: React.FC<OBXfHardwareUIProps> = ({
  onParamChange: _onParamChange,
  instrumentId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moduleRef = useRef<OBXfUIModule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fbWidthRef = useRef(1440);
  const fbHeightRef = useRef(450);

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
          (opts: Record<string, unknown>) => Promise<OBXfUIModule>
        >((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = (window as any).createOBXfUIModule;
          if (typeof existing === 'function') {
            resolve(existing);
            return;
          }

          const script = document.createElement('script');
          script.src = '/obxf/OBXfUI.js';
          script.onload = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn = (window as any).createOBXfUIModule;
            if (typeof fn === 'function') {
              resolve(fn);
            } else {
              reject(new Error('createOBXfUIModule not found on window'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load OBXfUI.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        const m = await factory({
          onAbort: (what: string) => {
            console.error('[OBXfHardwareUI] WASM abort:', what);
          },
        });
        if (cancelled) {
          m._obxf_ui_shutdown();
          return;
        }

        moduleRef.current = m;

        // Yield to browser before heavy WASM init (OB-Xf parses 12MB of SVG assets)
        await new Promise(resolve => setTimeout(resolve, 50));
        if (cancelled) {
          m._obxf_ui_shutdown();
          return;
        }

        m._obxf_ui_init();

        // Populate patch browser with OBXd native presets
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._obxdPresetNames = OBXD_NATIVE_PRESETS.map(p => p.name);
        if (m._obxf_ui_populate_presets) m._obxf_ui_populate_presets();

        const w = m._obxf_ui_get_width();
        const h = m._obxf_ui_get_height();
        fbWidthRef.current = w;
        fbHeightRef.current = h;

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
          m._obxf_ui_on_mouse_down(cx, cy, getModifiers(e));
        };

        const onMouseUp = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._obxf_ui_on_mouse_up(cx, cy, getModifiers(e));
        };

        const onMouseMove = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._obxf_ui_on_mouse_move(cx, cy, getModifiers(e));
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._obxf_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
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

        // Parameter callback: WASM UI knob → name lookup → OBXd audio worklet
        // OBXf init emits window._obxfParamIds (string ID per JUCE param index)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._obxfUIParamCallback = (paramIndex: number, normalizedValue: number) => {
          if (!instrumentId) return;
          // Look up the OBXf string ID from the array built during C++ init
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const paramIds = (window as any)._obxfParamIds as string[] | undefined;
          if (!paramIds || paramIndex < 0 || paramIndex >= paramIds.length) return;
          const obxfId = paramIds[paramIndex];
          const obxdParamId = OBXF_ID_TO_OBXD[obxfId];
          if (obxdParamId === undefined) return; // no mapping for this OBXf param
          try {
            const engine = getToneEngine();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const instruments = (engine as any).instruments as Map<number, any>;
            const key = (instrumentId << 16) | 0xFFFF;
            const synth = instruments?.get(key);
            if (synth?._worklet) {
              synth._worklet.port.postMessage({
                type: 'parameter',
                paramId: obxdParamId,
                value: normalizedValue,
              });
            }
          } catch { /* engine not ready */ }
        };

        // MIDI callback: JUCE on-screen keyboard → JS → audio worklet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._obxfUIMidiCallback = (type: string, note: number, vel: number) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const instruments = (engine as any).instruments as Map<number, any>;
            const key = (instrumentId << 16) | 0xFFFF;
            const synth = instruments?.get(key);
            if (!synth?._worklet) return;

            if (type === 'noteOn') {
              synth._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
            } else if (type === 'noteOff') {
              synth._worklet.port.postMessage({ type: 'noteOff', note });
            }
          } catch { /* engine not ready */ }
        };

        // Program/preset change callback: OBXf patch browser → OBXd audio worklet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._obxfUIProgramCallback = (presetIndex: number) => {
          if (!instrumentId) return;
          try {
            const engine = getToneEngine();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const instruments = (engine as any).instruments as Map<number, any>;
            const key = (instrumentId << 16) | 0xFFFF;
            const synth = instruments?.get(key);
            if (!synth?._worklet) return;

            // Index -1 = Init patch (first preset), 0+ = preset index
            const idx = presetIndex < 0 ? 0 : presetIndex;
            const preset = OBXD_NATIVE_PRESETS[idx];
            if (preset) {
              synth._worklet.port.postMessage({
                type: 'loadPatch',
                values: preset.values,
              });
            }
          } catch { /* engine not ready */ }
        };

        eventCleanups.push(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._obxfUIParamCallback;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._obxfUIMidiCallback;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._obxfUIProgramCallback;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._obxfParamIds;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._obxdPresetNames;
        });

        setLoaded(true);

        // rAF render loop — throttled to 30fps (OB-Xf SVG rendering is heavy)
        let lastFrameTime = 0;
        const FRAME_INTERVAL = 1000 / 30;
        const renderLoop = (now: number) => {
          if (cancelled) return;
          rafId = requestAnimationFrame(renderLoop);
          if (now - lastFrameTime < FRAME_INTERVAL) return;
          lastFrameTime = now;
          if (m._obxf_ui_tick) m._obxf_ui_tick();
          blitFramebuffer(m, ctx, imgData, w, h);
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error('[OBXfHardwareUI] Init failed:', err);
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
        moduleRef.current._obxf_ui_shutdown();
        moduleRef.current = null;
      }
    };
  }, [canvasCoords, getModifiers, instrumentId]);

  if (error) {
    return (
      <div style={{ padding: 16, color: '#ff6666', fontFamily: 'monospace' }}>
        [OBXfHardwareUI] Error: {error}
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
          Loading OB-Xf hardware UI...
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

export default OBXfHardwareUI;
