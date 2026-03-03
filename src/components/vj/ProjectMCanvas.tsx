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
    console.log('[ProjectMCanvas] Manifest loaded:', allPresetNames.length, 'total presets');
  } catch (err) {
    console.error('[ProjectMCanvas] Failed to load manifest:', err);
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
    console.warn('[ProjectMCanvas] No manifest entry for preset:', name, '(manifestPresets:', manifestPresets?.length ?? 'null', ')');
    return null;
  }
  try {
    const encodedPath = entry.path.split('/').map(encodeURIComponent).join('/');
    const resp = await fetch(`/projectm/presets/${encodedPath}`);
    if (!resp.ok) {
      console.error('[ProjectMCanvas] Fetch failed for preset:', name, resp.status);
      return null;
    }
    const text = await resp.text();
    presetContentCache.set(name, text);
    return text;
  } catch (err) {
    console.error('[ProjectMCanvas] Fetch error for preset:', name, err);
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
}

export const ProjectMCanvas = React.forwardRef<VJCanvasHandle, ProjectMCanvasProps>(
  ({ onReady, onPresetChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<ProjectMEngine | null>(null);
    const rafRef = useRef<number>(0);
    const currentIdxRef = useRef(0);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const audioBusRef = useRef<AudioDataBus | null>(null);

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
              onPresetChange?.(startIdx, names[startIdx]);
            }
          }

          setReady(true);
          onReady?.(names.length);
        } catch (err) {
          console.error('[ProjectMCanvas] Failed to initialize:', err);
          setError(err instanceof Error ? err.message : String(err));
        }
      };

      // Wait for next frame so canvas has layout dimensions
      const raf = requestAnimationFrame(() => {
        if (!cancelled) doInit();
      });

      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        cancelAnimationFrame(rafRef.current);
        audioBusRef.current?.disable();
        audioBusRef.current = null;
        engineRef.current?.destroy();
        engineRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Render loop
    useEffect(() => {
      if (!ready) return;
      const render = () => {
        const engine = engineRef.current;
        const bus = audioBusRef.current;
        if (engine && bus) {
          // Get audio frame from AudioDataBus (proven tap on Tone.Destination)
          const frame = bus.update();
          const waveform = frame.waveform;
          // Create stereo interleaved buffer (duplicate mono → stereo)
          const stereo = new Float32Array(waveform.length * 2);
          for (let i = 0; i < waveform.length; i++) {
            stereo[i * 2] = waveform[i];
            stereo[i * 2 + 1] = waveform[i];
          }
          engine.pushAudio(stereo, waveform.length);
          engine.renderFrame();
        }
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafRef.current);
    }, [ready]);

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

    // Load preset by index (async — fetches .milk on demand)
    const doLoadPreset = useCallback(async (idx: number) => {
      const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
      if (!engineRef.current || names.length === 0) return;
      const wrappedIdx = ((idx % names.length) + names.length) % names.length;
      const name = names[wrappedIdx];
      const content = await fetchPresetContent(name);
      if (!content || !engineRef.current) return;
      engineRef.current.loadPresetData(content, true);
      currentIdxRef.current = wrappedIdx;
      onPresetChange?.(wrappedIdx, name);
      // Pre-fetch next random preset in background
      const nextIdx = Math.floor(Math.random() * names.length);
      fetchPresetContent(names[nextIdx]); // fire-and-forget
    }, [onPresetChange]);

    // Load preset by name (async)
    const doLoadPresetByName = useCallback(async (name: string) => {
      const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
      const idx = names.indexOf(name);
      console.log('[ProjectMCanvas] loadPresetByName:', name, 'idx:', idx, 'total:', names.length);
      if (idx >= 0) {
        await doLoadPreset(idx);
      }
    }, [doLoadPreset]);

    // Imperative API
    React.useImperativeHandle(ref, () => ({
      nextPreset: () => { doLoadPreset(currentIdxRef.current + 1); },
      randomPreset: () => {
        const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
        doLoadPreset(Math.floor(Math.random() * names.length));
      },
      loadPresetByIndex: (idx: number) => { doLoadPreset(idx); },
      loadPresetByName: (name: string) => { doLoadPresetByName(name); },
      getPresetNames: () => allPresetNames ?? Object.keys(BUILTIN_PRESETS),
      getCurrentIndex: () => currentIdxRef.current,
    }), [doLoadPreset, doLoadPresetByName]);

    return (
      <div ref={containerRef} className="w-full h-full relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ imageRendering: 'auto' }}
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
