/**
 * ProjectMCanvas — React component wrapping the projectM v4 WASM Milkdrop renderer.
 *
 * Uses Emscripten + SDL2 + WebGL2 to render Milkdrop presets with higher fidelity
 * than butterchurn (~95%+ preset compatibility vs ~80%).
 *
 * The component:
 *  - Injects public/projectm/ProjectM.js + .wasm
 *  - Creates an SDL2/WebGL2 canvas owned by Emscripten
 *  - Pushes PCM audio from ToneEngine each frame
 *  - Exposes next/random/load imperative API (same as VJCanvasHandle)
 *
 * Milkdrop presets are loaded from public/projectm/presets/ (user can drop .milk files there).
 * The component also ships a curated set of ~14 built-in presets as embedded strings.
 * On init, it loads the cream-of-the-crop manifest (9,795 .milk presets) for lazy fetching.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectMEngine } from '@engine/vj/ProjectMEngine';
import { AudioDataBus } from '@engine/vj/AudioDataBus';
import { BUILTIN_PRESETS } from './projectm-builtin-presets';
import type { VJCanvasHandle } from './VJView';

// ── Manifest types ──────────────────────────────────────────────────────────
interface ManifestPreset {
  name: string;
  path: string;
  category: string;
}

// ── Module-level cache for manifest + preset content ────────────────────────
let manifestPresets: ManifestPreset[] | null = null;
let allPresetNames: string[] | null = null;
const presetContentCache = new Map<string, string>();

async function loadManifest(): Promise<void> {
  if (manifestPresets) return;
  try {
    const resp = await fetch('/projectm/presets-manifest.json');
    const data = await resp.json();
    manifestPresets = data.presets;
    const builtinNames = Object.keys(BUILTIN_PRESETS);
    const seen = new Set(builtinNames);
    allPresetNames = [...builtinNames];
    for (const p of manifestPresets!) {
      if (!seen.has(p.name)) { allPresetNames.push(p.name); seen.add(p.name); }
    }
    for (const [name, content] of Object.entries(BUILTIN_PRESETS)) {
      presetContentCache.set(name, content);
    }
  } catch {
    allPresetNames = Object.keys(BUILTIN_PRESETS);
    for (const [name, content] of Object.entries(BUILTIN_PRESETS)) {
      presetContentCache.set(name, content);
    }
  }
}

async function fetchPresetContent(name: string): Promise<string | null> {
  if (presetContentCache.has(name)) return presetContentCache.get(name)!;
  const entry = manifestPresets?.find(p => p.name === name);
  if (!entry) {
    return null;
  }
  try {
    const encodedPath = entry.path.split('/').map(encodeURIComponent).join('/');
    const resp = await fetch(`/projectm/presets/${encodedPath}`);
    if (!resp.ok) {
      return null;
    }
    const text = await resp.text();
    presetContentCache.set(name, text);
    return text;
  } catch (_err) {
    return null;
  }
}

// Expose for VJPresetBrowser
export function getProjectMManifest(): ManifestPreset[] | null {
  return manifestPresets;
}

export function getProjectMPresetNames(): string[] | null {
  return allPresetNames;
}

export { loadManifest as loadProjectMManifest };

// ── Component ───────────────────────────────────────────────────────────────

interface ProjectMCanvasProps {
  onReady?: (presetCount: number) => void;
  onPresetChange?: (idx: number, name: string) => void;
  visible?: boolean;
}

// Fade-to-black transition duration (ms) for each half (fade-out + fade-in)
const FADE_DURATION_MS = 350;

export const ProjectMCanvas = React.forwardRef<VJCanvasHandle, ProjectMCanvasProps>(
  ({ onReady, onPresetChange, visible = true }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<ProjectMEngine | null>(null);
    const rafRef = useRef<number>(0);
    const currentIdxRef = useRef(0);
    const visibleRef = useRef(visible);
    const mountedRef = useRef(true);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const audioBusRef = useRef<AudioDataBus | null>(null);

    // Pre-allocated stereo buffer for audio push (avoids per-frame Float32Array allocation)
    const stereoBufferRef = useRef<Float32Array | null>(null);
    const stereoBufferLenRef = useRef(0);

    // Fade overlay for smooth preset transitions
    const fadeRef = useRef<HTMLDivElement>(null);
    const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Stuck-detection: timestamp of last preset load (grace period before checking)
    const presetLoadTimeRef = useRef(0);

    // Ref to hold doLoadPreset so the render loop doesn't re-run when its identity changes
    const doLoadPresetRef = useRef<(idx: number, smooth?: boolean) => Promise<void>>(undefined);

    useEffect(() => { visibleRef.current = visible; }, [visible]);

    // Init — wait until canvas has real dimensions (layout complete)
    useEffect(() => {
      let cancelled = false;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Give Emscripten/SDL2 an id so it can find the canvas for event registration
      if (!canvas.id) canvas.id = 'projectm-canvas';

      const doInit = async () => {
        try {
          // Load manifest in parallel with engine init
          await loadManifest();

          const engine = new ProjectMEngine();
          const cw = canvas.clientWidth;
          const ch = canvas.clientHeight;
          const w = Math.round(Math.max(cw, 320) * devicePixelRatio);
          const h = Math.round(Math.max(ch, 240) * devicePixelRatio);
          canvas.width = w;
          canvas.height = h;

          await engine.init(canvas, w, h);
          if (cancelled) { engine.destroy(); return; }

          engineRef.current = engine;

          // Connect audio analysis via AudioDataBus (proven tap on Tone.Destination)
          const bus = new AudioDataBus();
          bus.enable();
          audioBusRef.current = bus;

          // Load initial preset (random from full list)
          const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
          if (names.length > 0) {
            const startIdx = Math.floor(Math.random() * names.length);
            const content = await fetchPresetContent(names[startIdx]);
            if (content && !cancelled) {
              engine.loadPresetData(content, false);
              currentIdxRef.current = startIdx;
              presetLoadTimeRef.current = performance.now();
              onPresetChange?.(startIdx, names[startIdx]);
            }
          }

          setReady(true);
          onReady?.(names.length);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      };

      // WebGL context loss recovery
      const handleContextLost = (e: Event) => {
        e.preventDefault(); // Signal browser we want context restore
        console.warn('[ProjectM] WebGL context lost — waiting for restore');
        // Clear any pending fade/crossfade timers to prevent stale state
        if (fadeTimerRef.current !== undefined) clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = undefined;
        audioBusRef.current?.disable();
        audioBusRef.current = null;
        engineRef.current?.destroy();
        engineRef.current = null;
        setReady(false);
      };

      const handleContextRestored = () => {
        console.warn('[ProjectM] WebGL context restored — re-initializing');
        doInit();
      };

      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);

      // Wait for next frame so canvas has layout dimensions
      const raf = requestAnimationFrame(() => {
        if (!cancelled) doInit();
      });

      return () => {
        cancelled = true;
        mountedRef.current = false;
        cancelAnimationFrame(raf);
        cancelAnimationFrame(rafRef.current);
        if (fadeTimerRef.current !== undefined) clearTimeout(fadeTimerRef.current);
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
        audioBusRef.current?.disable();
        audioBusRef.current = null;
        engineRef.current?.destroy();
        engineRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load preset by index. Uses projectM's native soft cut (crossfade) by default.
    // Falls back to a fade-to-black transition if soft cuts produce visual glitches.
    const doLoadPreset = useCallback(async (idx: number, smooth = true) => {
      const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
      if (!engineRef.current || names.length === 0) return;
      const wrappedIdx = ((idx % names.length) + names.length) % names.length;
      const name = names[wrappedIdx];

      const content = await fetchPresetContent(name);
      if (!content || !engineRef.current || !mountedRef.current) {
        if (!content) console.warn('[ProjectM] Failed to fetch preset:', name);
        return;
      }

      // Cancel any in-progress fade
      if (fadeTimerRef.current !== undefined) clearTimeout(fadeTimerRef.current);

      if (smooth) {
        // Native projectM soft cut — crossfade via internal transition shaders
        presetLoadTimeRef.current = performance.now();
        engineRef.current.loadPresetData(content, true);
        currentIdxRef.current = wrappedIdx;
        onPresetChange?.(wrappedIdx, name);
      } else {
        // Fade-to-black: CSS overlay fades out, hard-cut preset, fade back in
        const fade = fadeRef.current;
        if (fade) {
          fade.style.transition = `opacity ${FADE_DURATION_MS}ms ease-in`;
          fade.style.opacity = '1';

          fadeTimerRef.current = setTimeout(() => {
            presetLoadTimeRef.current = performance.now();
            engineRef.current?.loadPresetData(content, false);
            currentIdxRef.current = wrappedIdx;
            onPresetChange?.(wrappedIdx, name);

            requestAnimationFrame(() => {
              if (fade) {
                fade.style.transition = `opacity ${FADE_DURATION_MS}ms ease-out`;
                fade.style.opacity = '0';
              }
            });
            fadeTimerRef.current = undefined;
          }, FADE_DURATION_MS);
        } else {
          presetLoadTimeRef.current = performance.now();
          engineRef.current.loadPresetData(content, false);
          currentIdxRef.current = wrappedIdx;
          onPresetChange?.(wrappedIdx, name);
        }
      }

      // Pre-fetch next random preset in background
      const nextIdx = Math.floor(Math.random() * names.length);
      fetchPresetContent(names[nextIdx]); // fire-and-forget
    }, [onPresetChange]);

    // Keep ref in sync so render loop always has current doLoadPreset
    useEffect(() => { doLoadPresetRef.current = doLoadPreset; }, [doLoadPreset]);

    // Load preset by name (async)
    const doLoadPresetByName = useCallback(async (name: string, smooth = true) => {
      const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
      const idx = names.indexOf(name);
      if (idx >= 0) {
        await doLoadPreset(idx, smooth);
      }
    }, [doLoadPreset]);

    // Direct preset load — fetches content and hard-cuts without any fade overlay.
    // Used during layer switches where the parent CSS crossfade handles the transition.
    const doLoadPresetDirect = useCallback(async (idx: number) => {
      const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
      if (!engineRef.current || names.length === 0) return;
      const wrappedIdx = ((idx % names.length) + names.length) % names.length;
      const name = names[wrappedIdx];
      const content = await fetchPresetContent(name);
      if (!content || !engineRef.current || !mountedRef.current) return;
      // Cancel any in-progress fade from a previous load
      if (fadeTimerRef.current !== undefined) clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = undefined;
      const fade = fadeRef.current;
      if (fade) { fade.style.transition = 'none'; fade.style.opacity = '0'; }
      presetLoadTimeRef.current = performance.now();
      engineRef.current.loadPresetData(content, false);
      currentIdxRef.current = wrappedIdx;
      onPresetChange?.(wrappedIdx, name);
      // Pre-fetch next preset
      const nextIdx = Math.floor(Math.random() * names.length);
      fetchPresetContent(names[nextIdx]);
    }, [onPresetChange]); // allPresetNames is module-level, not React state

    // Render loop — runs continuously once ready; skips draw when not visible.
    // Stuck detection moved to separate 1Hz timer to avoid GPU→CPU stalls.
    useEffect(() => {
      if (!ready) return;
      let cancelled = false;

      const render = () => {
        if (cancelled) return;
        if (visibleRef.current) {
          const engine = engineRef.current;
          const bus = audioBusRef.current;
          if (engine && bus) {
            const frame = bus.update();
            const waveform = frame.waveform;
            const neededLen = waveform.length * 2;
            if (stereoBufferLenRef.current !== neededLen || !stereoBufferRef.current) {
              stereoBufferRef.current = new Float32Array(neededLen);
              stereoBufferLenRef.current = neededLen;
            }
            const stereo = stereoBufferRef.current;
            for (let i = 0; i < waveform.length; i++) {
              stereo[i * 2] = waveform[i];
              stereo[i * 2 + 1] = waveform[i];
            }
            engine.pushAudio(stereo, waveform.length);
            engine.renderFrame();
          }
        }
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
      return () => { cancelled = true; cancelAnimationFrame(rafRef.current); };
    }, [ready]); // doLoadPreset accessed via ref to avoid restarting the loop

    // Stuck detection — 1Hz timer (off the render loop to avoid GPU→CPU sync stalls).
    // Samples center pixel from the WebGL canvas to detect frozen/alternating output.
    useEffect(() => {
      if (!ready || !visible) return;
      let sampleCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
      let sampleCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
      try {
        sampleCanvas = new OffscreenCanvas(1, 1);
        sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
      } catch {
        return; // OffscreenCanvas not supported — skip stuck detection
      }
      if (!sampleCtx) return;

      let prevHash1 = 0;
      let prevHash2 = 0;
      let alternatingCount = 0;
      let timerId: ReturnType<typeof setTimeout>;

      const check = () => {
        const canvas = canvasRef.current;
        if (!canvas || !engineRef.current || !visibleRef.current) {
          timerId = setTimeout(check, 1000);
          return;
        }
        const timeSinceLoad = performance.now() - presetLoadTimeRef.current;
        if (timeSinceLoad > 5000) {
          sampleCtx!.drawImage(canvas, canvas.width >> 1, canvas.height >> 1, 1, 1, 0, 0, 1, 1);
          const px = sampleCtx!.getImageData(0, 0, 1, 1).data;
          const hash = (px[0] << 16) | (px[1] << 8) | px[2];

          if (hash === prevHash1 || hash === prevHash2) {
            alternatingCount++;
          } else {
            prevHash2 = prevHash1;
            prevHash1 = hash;
            alternatingCount = 0;
          }

          // 6 consecutive matches at 1Hz = ~6 seconds stuck → force new preset
          if (alternatingCount >= 6) {
            alternatingCount = 0;
            prevHash1 = 0;
            prevHash2 = 0;
            const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
            if (names.length > 0) {
              doLoadPresetRef.current?.(Math.floor(Math.random() * names.length), false);
            }
          }
        }
        timerId = setTimeout(check, 1000);
      };
      timerId = setTimeout(check, 2000); // Initial delay — let preset render a bit
      return () => clearTimeout(timerId);
    }, [ready, visible]);

    // Resize
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !engineRef.current) return;
      const handleResize = () => {
        const w = Math.round(canvas.clientWidth * devicePixelRatio);
        const h = Math.round(canvas.clientHeight * devicePixelRatio);
        canvas.width = w;
        canvas.height = h;
        engineRef.current?.setSize(w, h);
      };
      const observer = new ResizeObserver(handleResize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [ready]);

    // Imperative API — smooth=true enables projectM's native soft cut (crossfade).
    // Safe because VJView alternates layers so projectM never does back-to-back swaps.
    React.useImperativeHandle(ref, () => ({
      // Always use smooth=false (CSS fade-to-black) — projectM's native soft-cut
      // transition shader causes alternating-frame artifacts in WebGL2.
      nextPreset: () => { doLoadPreset(currentIdxRef.current + 1, false); },
      randomPreset: () => {
        const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
        doLoadPreset(Math.floor(Math.random() * names.length), false);
      },
      loadPresetByIndex: (idx: number) => { doLoadPreset(idx, false); },
      loadPresetByName: (name: string, blendOrSmooth?: number | boolean) => { doLoadPresetByName(name, blendOrSmooth !== false); },
      getPresetNames: () => allPresetNames ?? Object.keys(BUILTIN_PRESETS),
      getCurrentIndex: () => currentIdxRef.current,
      loadRandomDirect: () => {
        const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
        doLoadPresetDirect(Math.floor(Math.random() * names.length));
      },
    }), [doLoadPreset, doLoadPresetByName, doLoadPresetDirect]);

    return (
      <div ref={containerRef} className="w-full h-full relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ imageRendering: 'auto' }}
        />
        {/* Fade-to-black overlay for smooth preset transitions */}
        <div
          ref={fadeRef}
          className="absolute inset-0 bg-black pointer-events-none"
          style={{ opacity: 0 }}
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-white/60 font-mono text-sm">Loading projectM (WASM)...</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-red-400/80 font-mono text-sm text-center px-8">
              <div>projectM failed to load</div>
              <div className="text-xs mt-1 text-white/40">{error}</div>
              <div className="text-xs mt-2 text-white/30">Falling back to Butterchurn is recommended</div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
ProjectMCanvas.displayName = 'ProjectMCanvas';
