/**
 * AelapseHardwareUI — React wrapper around the Ælapse JUCE UI WASM.
 *
 * Mirrors the pattern used by src/components/instruments/hardware/OBXfHardwareUI.tsx
 * except this is for an *effect* rather than a synth:
 *
 *   1. Loads `public/aelapse/AelapseUI.js` (JUCE editor compiled to WASM),
 *      calls `_aelapse_ui_init`, runs `_aelapse_ui_tick` on every rAF frame,
 *      blits the exported framebuffer to a 2D canvas.
 *   2. Overlaid on top of the JUCE canvas is a second `<canvas>` driven by
 *      `AelapseSpringsRenderer` — it paints the real springs shader in WebGL2
 *      where the JUCE editor's SpringsGL stub leaves an empty region.
 *   3. Mouse events on the JUCE canvas are forwarded into WASM so the knobs
 *      and buttons are interactive.
 *   4. Parameter changes bubble out via `onUpdateParameter(key, value)` — the
 *      parent wraps this around `AelapseEffect.ts` setters.
 *
 * RMS data for the springs shader will be streamed from the DSP worklet in
 * Phase D via `onRequestRMS()` — for now the overlay renders with a static
 * zero buffer (still looks like real springs, just no animation).
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AelapseSpringsRenderer } from '@/engine/effects/AelapseSpringsRenderer';

// ─── WASM module shape ─────────────────────────────────────────────────────

interface AelapseUIModule {
  _aelapse_ui_init: () => void;
  _aelapse_ui_init_scaled: (scale: number) => void;
  _aelapse_ui_tick: () => void;
  _aelapse_ui_get_fb: () => number;
  _aelapse_ui_get_width: () => number;
  _aelapse_ui_get_height: () => number;
  _aelapse_ui_on_mouse_down: (x: number, y: number, mods: number) => void;
  _aelapse_ui_on_mouse_up: (x: number, y: number, mods: number) => void;
  _aelapse_ui_on_mouse_move: (x: number, y: number, mods: number) => void;
  _aelapse_ui_on_mouse_wheel: (x: number, y: number, dx: number, dy: number) => void;
  _aelapse_ui_set_param: (index: number, value: number) => void;
  _aelapse_ui_get_param: (index: number) => number;
  _aelapse_ui_get_param_count: () => number;
  _aelapse_ui_get_springs_x: () => number;
  _aelapse_ui_get_springs_y: () => number;
  _aelapse_ui_get_springs_w: () => number;
  _aelapse_ui_get_springs_h: () => number;
  _aelapse_ui_shutdown: () => void;
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  HEAPU8: Uint8Array;
  wasmMemory?: WebAssembly.Memory;
}

// ─── GPU-accelerated framebuffer blit ──────────────────────────────────────
// JUCE renders ARGB (little-endian: [B,G,R,A] bytes). Instead of a CPU
// loop swapping 288K pixels/frame, we upload the raw bytes as a BGRA
// texture and let the GPU do the swizzle via WebGL2's BGRA extension
// or a trivial fragment shader fallback.

const BLIT_VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
    v_uv = a_pos * 0.5 + 0.5;
    v_uv.y = 1.0 - v_uv.y;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const BLIT_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 fragColor;
void main() {
    vec4 c = texture(u_tex, v_uv);
    fragColor = vec4(c.b, c.g, c.r, 1.0); // BGRA → RGBA swizzle
}`;

class GPUBlitter {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private tex: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private w: number;
  private h: number;

  constructor(canvas: HTMLCanvasElement, w: number, h: number) {
    this.w = w;
    this.h = h;
    canvas.width = w;
    canvas.height = h;

    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, premultipliedAlpha: false,
      preserveDrawingBuffer: true, desynchronized: true,
    })!;
    this.gl = gl;

    // Compile shader
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, BLIT_VS);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, BLIT_FS);
    gl.compileShader(fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.program = prog;
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // Fullscreen quad
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;

    // Texture for JUCE framebuffer
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tex = tex;
  }

  blit(src: Uint8Array): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.tex);
    gl.deleteVertexArray(this.vao);
  }
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface AelapseHardwareUIProps {
  /**
   * Called when a parameter changes in the JUCE UI. The parameter index is
   * the JUCE `ParamId` ordinal — the parent can look up the name via the
   * globally-exposed `window._aelapseParamIds` array the WASM init emits.
   */
  onUpdateParameter?: (paramIndex: number, normalizedValue: number) => void;

  /**
   * Source of the RMS ring buffer for the springs shader overlay. Called on
   * every animation frame; should return a Float32Array of 256 floats plus
   * the current ring-buffer write position. Returning null leaves the
   * previous frame's data in place.
   */
  getRMSSnapshot?: () => { stack: Float32Array; pos: number } | null;
}

// ─── Component ─────────────────────────────────────────────────────────────

export const AelapseHardwareUI: React.FC<AelapseHardwareUIProps> = ({
  onUpdateParameter,
  getRMSSnapshot,
}) => {
  const containerRef   = useRef<HTMLDivElement>(null);
  const jcanvasRef     = useRef<HTMLCanvasElement>(null);
  const overlayRef     = useRef<HTMLCanvasElement>(null);
  const moduleRef      = useRef<AelapseUIModule | null>(null);
  const springsRef     = useRef<AelapseSpringsRenderer | null>(null);
  const startTimeRef   = useRef(performance.now());

  // Zero-initialised RMS buffer used when no snapshot source is wired up yet.
  const fallbackRMSRef = useRef(new Float32Array(256));

  // Cached springs overlay bounds (set once from WASM, never changes).
  const springsBoundsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Store callback props in refs so the useEffect doesn't re-run when
  // the parent re-renders with new function references. The JUCE WASM
  // module must be initialized exactly once.
  const onUpdateParameterRef = useRef(onUpdateParameter);
  onUpdateParameterRef.current = onUpdateParameter;
  const getRMSSnapshotRef = useRef(getRMSSnapshot);
  getRMSSnapshotRef.current = getRMSSnapshot;

  const fbWidthRef  = useRef(900);
  const fbHeightRef = useRef(600);

  const canvasCoords = useCallback(
    (canvas: HTMLCanvasElement, e: MouseEvent | React.MouseEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width  / rect.width;
      const sy = canvas.height / rect.height;
      return [
        Math.floor((e.clientX - rect.left) * sx),
        Math.floor((e.clientY - rect.top)  * sy),
      ];
    },
    [],
  );

  const getModifiers = useCallback((e: MouseEvent | React.MouseEvent): number => {
    let mods = 0;
    if (e.shiftKey) mods |= 1;
    if (e.ctrlKey)  mods |= 2;
    if (e.altKey)   mods |= 4;
    if (e.metaKey)  mods |= 8;
    if ((e as MouseEvent).buttons & 1) mods |= 16;
    return mods;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    const eventCleanups: (() => void)[] = [];

    // NOTE: Unlike the DSP AudioWorklet, the UI WASM does NOT need the
    // WebAssembly.instantiate interception for memory capture. The UI
    // WASM exports HEAPU8 directly via EXPORTED_RUNTIME_METHODS, and
    // intercepting instantiate breaks Emscripten's EM_ASM const table
    // setup (causes "ASM_CONSTS[code] is not a function" at init time).

    const init = async () => {
      try {
        // Load factory via a script tag (Emscripten MODULARIZE pattern).
        type AelapseFactory = (opts: Record<string, unknown>) => Promise<AelapseUIModule>;
        const factory = await new Promise<AelapseFactory>((resolve, reject) => {
          const existing = (window as unknown as { createAelapseUIModule?: AelapseFactory })
            .createAelapseUIModule;
          if (typeof existing === 'function') { resolve(existing); return; }

          const script = document.createElement('script');
          script.src = `/aelapse/AelapseUI.js?v=${Date.now()}`;
          script.onload = () => {
            const fn = (window as unknown as { createAelapseUIModule?: AelapseFactory })
              .createAelapseUIModule;
            if (typeof fn === 'function') resolve(fn);
            else reject(new Error('createAelapseUIModule not found on window'));
          };
          script.onerror = () => reject(new Error('Failed to load AelapseUI.js'));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        const cacheBust = Date.now();
        const m = await factory({
          onAbort: (what: string) => console.error('[AelapseHardwareUI] WASM abort:', what),
          locateFile: (path: string) => `/aelapse/${path}?v=${cacheBust}`,
        });
        if (cancelled) { m._aelapse_ui_shutdown(); return; }

        moduleRef.current = m;

        // Yield to the browser before the heavy init — JUCE allocates a
        // multi-MB juce::Image during _aelapse_ui_init.
        await new Promise((r) => setTimeout(r, 30));
        if (cancelled) { m._aelapse_ui_shutdown(); return; }

        m._aelapse_ui_init();

        const w = m._aelapse_ui_get_width();
        const h = m._aelapse_ui_get_height();
        fbWidthRef.current  = w;
        fbHeightRef.current = h;

        const jcanvas = jcanvasRef.current;
        const overlay = overlayRef.current;
        if (!jcanvas || !overlay) return;

        jcanvas.width  = w;
        jcanvas.height = h;

        // Fit-contain the canvas pair inside the container. The overlay is
        // positioned absolute on top so both share the same transform.
        const updateCanvasCSS = () => {
          const container = containerRef.current;
          if (!container) return;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const s  = Math.min(cw / w, ch / h);
          const dw = Math.floor(w * s);
          const dh = Math.floor(h * s);
          jcanvas.style.width  = `${dw}px`;
          jcanvas.style.height = `${dh}px`;
          overlay.style.width  = `${dw}px`;
          overlay.style.height = `${dh}px`;
        };
        updateCanvasCSS();

        const ro = new ResizeObserver(updateCanvasCSS);
        if (containerRef.current) ro.observe(containerRef.current);
        eventCleanups.push(() => ro.disconnect());

        const blitter = new GPUBlitter(jcanvas, w, h);

        // Mouse event forwarding.
        const onMouseDown = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          jcanvas.focus();
          const [cx, cy] = canvasCoords(jcanvas, e);
          m._aelapse_ui_on_mouse_down(cx, cy, getModifiers(e));
        };
        const onMouseUp = (e: MouseEvent) => {
          const [cx, cy] = canvasCoords(jcanvas, e);
          m._aelapse_ui_on_mouse_up(cx, cy, getModifiers(e));
        };
        const onMouseMove = (e: MouseEvent) => {
          const isDown = (e.buttons & 1) !== 0;
          if (isDown) {
            e.preventDefault();
          }
          const [cx, cy] = canvasCoords(jcanvas, e);
          m._aelapse_ui_on_mouse_move(cx, cy, getModifiers(e));
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(jcanvas, e);
          m._aelapse_ui_on_mouse_wheel(cx, cy, e.deltaX, e.deltaY);
        };

        jcanvas.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('mousemove', onMouseMove);
        jcanvas.addEventListener('wheel', onWheel, { passive: false });

        eventCleanups.push(
          () => jcanvas.removeEventListener('mousedown', onMouseDown),
          () => document.removeEventListener('mouseup', onMouseUp),
          () => document.removeEventListener('mousemove', onMouseMove),
          () => jcanvas.removeEventListener('wheel', onWheel),
        );

        // Param callback: JUCE UI → JS → onUpdateParameter prop (via ref).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._aelapseUIParamCallback = (paramIndex: number, normalizedValue: number) => {
          onUpdateParameterRef.current?.(paramIndex, normalizedValue);
        };
        eventCleanups.push(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (window as any)._aelapseUIParamCallback;
        });

        // Wire the springs overlay. Reads the current coils/shape/radius
        // from the JUCE param vector via get_param — keeps the shader in
        // sync with knob movements even when onUpdateParameter isn't wired
        // to anything yet (e.g. during Phase C stand-alone testing).
        const springs = new AelapseSpringsRenderer(overlay);
        springsRef.current = springs;

        setLoaded(true);

        // Track JUCE param values to detect preset loads (which don't
        // fire parameterValueChanged). Poll every frame and push diffs.
        const paramCount = m._aelapse_ui_get_param_count();
        const prevParams = new Float32Array(paramCount);
        for (let i = 0; i < paramCount; i++) prevParams[i] = m._aelapse_ui_get_param(i);

        // rAF loop — throttled to 30fps (same as OBXf). The JUCE
        // framebuffer blit is 720×400×4 = 1.15 MB/frame of byte-swapping;
        // at 60fps it causes jerky knob interaction.
        let lastFrameTime = 0;
        let pollCounter = 0;
        const FRAME_INTERVAL = 1000 / 30;
        const renderLoop = (nowMs: number) => {
          if (cancelled) return;
          rafId = requestAnimationFrame(renderLoop);
          if (nowMs - lastFrameTime < FRAME_INTERVAL) return;
          lastFrameTime = nowMs;

          const modRef = moduleRef.current;
          if (!modRef) return;

          modRef._aelapse_ui_tick();

          // Poll JUCE params for preset-load detection — only every
          // 10th frame (~3Hz) to avoid flooding the store.
          pollCounter = (pollCounter + 1) % 10;
          if (pollCounter === 0) {
            for (let i = 0; i < paramCount; i++) {
              const cur = modRef._aelapse_ui_get_param(i);
              if (Math.abs(cur - prevParams[i]) > 0.001) {
                prevParams[i] = cur;
                onUpdateParameterRef.current?.(i, cur);
              }
            }
          }

          if (modRef.HEAPU8) {
            const fbPtr = modRef._aelapse_ui_get_fb();
            if (fbPtr) {
              const src = new Uint8Array(modRef.HEAPU8.buffer, fbPtr, w * h * 4);
              blitter.blit(src);
            }
          }

          // Position springs overlay. Use percentage-based CSS so it
          // works regardless of container scaling. The springs panel is
          // the right ~20% width, top ~50% height of the 720×400 editor.
          // Reposition springs overlay to track JUCE canvas size changes
          const cw = jcanvas.clientWidth;
          const ch = jcanvas.clientHeight;
          if (cw > 0 && ch > 0) {
            // SpringsGL column: x=582, full section height from header to bottom.
            // The shader has transparent background so JUCE knobs show
            // through the gaps between coils. pointer-events: none means
            // clicks pass through to the JUCE canvas underneath.
            // Match the original SpringsGL aspect ratio (~1.06:1) but
            // scaled up to fill the column. Original was 123×116.
            overlay.style.left   = `${Math.round(cw * (555 / 720))}px`;
            overlay.style.top    = `${Math.round(ch * (62 / 400))}px`;
            overlay.style.width  = `${Math.round(cw * (140 / 720))}px`;
            overlay.style.height = `${Math.round(cw * (132 / 720))}px`;
            if (overlay.style.display === 'none') overlay.style.display = 'block';
          }

          // Springs overlay — pull latest RMS snapshot and a handful of
          // knob values straight from the JUCE param vector.
          const rmsSnap = getRMSSnapshotRef.current?.() ?? null;
          const stack = rmsSnap ? rmsSnap.stack : fallbackRMSRef.current;
          const pos   = rmsSnap ? rmsSnap.pos   : 0;

          const radius = modRef._aelapse_ui_get_param(15);
          const shape  = modRef._aelapse_ui_get_param(17);
          const coils  = modRef._aelapse_ui_get_param(20);

          springs.render({
            coils,
            radius,
            shape,
            time: (nowMs - startTimeRef.current) / 1000,
            rmsStack: stack,
            rmsPos: pos,
            clip: springsBoundsRef.current ?? undefined,
          });
        };
        rafId = requestAnimationFrame(renderLoop);
      } catch (err) {
        if (!cancelled) {
          console.error('[AelapseHardwareUI] Init failed:', err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventCleanups.forEach((fn) => fn());

      // Reset bounds so re-mount recalculates
      springsBoundsRef.current = null;

      if (springsRef.current) {
        try { springsRef.current.dispose(); } catch { /* already disposed */ }
        springsRef.current = null;
      }
      // GPUBlitter is local to the init closure — no ref needed since
      // the rAF loop is already cancelled above via `cancelled = true`.
      if (moduleRef.current) {
        try { moduleRef.current._aelapse_ui_shutdown(); } catch { /* already shut down */ }
        moduleRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- callback props use refs; WASM init must run exactly once
  }, []);

  if (error) {
    return (
      <div style={{ padding: 16, color: '#ff6666', fontFamily: 'monospace' }}>
        [AelapseHardwareUI] Error: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
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
          Loading Ælapse hardware UI…
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={jcanvasRef}
          tabIndex={0}
          style={{
            display: loaded ? 'block' : 'none',
            cursor: 'default',
            imageRendering: 'pixelated',
            touchAction: 'none',
          }}
        />
        <canvas
          ref={overlayRef}
          style={{
            display: 'none',
            position: 'absolute',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};
