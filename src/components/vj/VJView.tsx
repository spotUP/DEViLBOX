/**
 * VJView — Milkdrop visualizer powered by Butterchurn.
 *
 * Renders audio-reactive Milkdrop presets in a fullscreen WebGL canvas.
 * Works as:
 *   1. Inline app view (activeView === 'vj')
 *   2. PopOutWindow for second-screen VJ output (vjPoppedOut === true)
 *
 * The butterchurn canvas is self-contained (own WebGL context, separate from
 * PixiJS). In GL mode, PixiVJView wraps this component via PixiDOMOverlay.
 *
 * Audio data comes from ToneEngine's master output via Web Audio API.
 * Zustand store state is shared across windows (same JS context).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { AudioDataBus } from '@engine/vj/AudioDataBus';
import { ExternalLink, SkipForward, Shuffle, Pause, Play, List } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useDJStore } from '@stores/useDJStore';
import { focusPopout } from '@components/ui/PopOutWindow';
import { VJPresetBrowser } from './VJPresetBrowser';
import { ISFCanvas, type ISFCanvasHandle } from './ISFCanvas';
import { ThreeCanvas, type ThreeCanvasHandle } from './ThreeCanvas';

// Lazy-load ProjectMCanvas (heavy WASM dependency)
const ProjectMCanvas = React.lazy(() => import('./ProjectMCanvas').then(m => ({ default: m.ProjectMCanvas })));

// ─── Lazy-loaded butterchurn (large dependency) ────────────────────────────────

let butterchurnModule: any = null;
let allPresetsCache: Record<string, object> | null = null;
let presetNamesCache: string[] | null = null;

async function loadButterchurn() {
  if (butterchurnModule && allPresetsCache) {
    return { butterchurn: butterchurnModule, presetMap: allPresetsCache, presetNames: presetNamesCache! };
  }

  const [bc, mainMod, extraMod, extra2Mod, md1Mod, nmMod] = await Promise.all([
    import('butterchurn'),
    import('butterchurn-presets'),
    import('butterchurn-presets/lib/butterchurnPresetsExtra.min.js' as string),
    import('butterchurn-presets/lib/butterchurnPresetsExtra2.min.js' as string),
    import('butterchurn-presets/lib/butterchurnPresetsMD1.min.js' as string),
    import('butterchurn-presets/lib/butterchurnPresetsNonMinimal.min.js' as string),
  ]);

  butterchurnModule = bc.default || bc;

  // Merge all preset packs (deduped by name)
  const allMap: Record<string, object> = {};
  for (const mod of [mainMod, extraMod, extra2Mod, md1Mod, nmMod]) {
    const m = mod.default || mod;
    const presets = typeof m.getPresets === 'function' ? m.getPresets() : m;
    Object.assign(allMap, presets);
  }

  allPresetsCache = allMap;
  presetNamesCache = Object.keys(allMap).sort();
  return { butterchurn: butterchurnModule, presetMap: allMap, presetNames: presetNamesCache };
}

// ─── VJCanvas — The butterchurn WebGL canvas (shared by DOM + GL views) ────────

export interface VJCanvasHandle {
  nextPreset: () => void;
  randomPreset: () => void;
  loadPresetByIndex: (idx: number, blend?: number) => void;
  loadPresetByName: (name: string, blend?: number) => void;
  getPresetNames: () => string[];
  getCurrentIndex: () => number;
}

interface VJCanvasProps {
  /** Called once butterchurn is ready with preset metadata */
  onReady?: (presetCount: number) => void;
  /** Called when the active preset changes */
  onPresetChange?: (idx: number, name: string) => void;
}

export const VJCanvas = React.forwardRef<VJCanvasHandle, VJCanvasProps>(
  ({ onReady, onPresetChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const visualizerRef = useRef<any>(null);
    const audioDataBusRef = useRef<AudioDataBus | null>(null);
    const rafRef = useRef<number>(0);
    const presetNamesRef = useRef<string[]>([]);
    const presetMapRef = useRef<Record<string, object>>({});
    const currentIdxRef = useRef(0);
    const [ready, setReady] = useState(false);

    // Init butterchurn
    useEffect(() => {
      let cancelled = false;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Wait for layout so canvas has real dimensions (avoids 0×0 WebGL textures)
      const initRaf = requestAnimationFrame(() => {
        if (cancelled) return;
        doInit();
      });

      async function doInit() {
        try {
          const { butterchurn, presetMap, presetNames } = await loadButterchurn();
          if (cancelled) return;

          // Enforce minimum canvas dimensions to avoid zero-size WebGL textures
          const cw = Math.max(canvas.clientWidth, 320);
          const ch = Math.max(canvas.clientHeight, 240);
          const w = Math.round(cw * devicePixelRatio);
          const h = Math.round(ch * devicePixelRatio);
          canvas.width = w;
          canvas.height = h;

          const ctx = Tone.getContext().rawContext as AudioContext;
          const visualizer = butterchurn.createVisualizer(ctx, canvas, {
            width: w,
            height: h,
            pixelRatio: devicePixelRatio,
          });

          // Connect to master audio output
          const dest = Tone.getDestination();
          const nativeNode = (dest as any).output?.input || (dest as any)._gainNode || (dest as any).input;
          if (nativeNode) {
            visualizer.connectAudio(nativeNode);
          }

          presetNamesRef.current = presetNames;
          presetMapRef.current = presetMap;

          // Load a random initial preset
          const startIdx = Math.floor(Math.random() * presetNames.length);
          visualizer.loadPreset(presetMap[presetNames[startIdx]], 0.0);
          currentIdxRef.current = startIdx;

          visualizerRef.current = visualizer;
          setReady(true);
          onReady?.(presetNames.length);
          onPresetChange?.(startIdx, presetNames[startIdx]);

          // Enable audio analysis
          const bus = new AudioDataBus();
          bus.enable();
          audioDataBusRef.current = bus;
        } catch (err) {
          console.error('[VJCanvas] Failed to initialize butterchurn:', err);
        }
      }

      return () => { cancelled = true; cancelAnimationFrame(initRaf); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Render loop
    useEffect(() => {
      if (!ready) return;
      const render = () => {
        visualizerRef.current?.render();
        audioDataBusRef.current?.update();
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafRef.current);
    }, [ready]);

    // Handle resize
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !visualizerRef.current) return;
      const handleResize = () => {
        const w = Math.round(Math.max(canvas.clientWidth, 320) * devicePixelRatio);
        const h = Math.round(Math.max(canvas.clientHeight, 240) * devicePixelRatio);
        canvas.width = w;
        canvas.height = h;
        visualizerRef.current?.setRendererSize(w, h);
      };
      handleResize();
      const observer = new ResizeObserver(handleResize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [ready]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        audioDataBusRef.current?.disable();
        cancelAnimationFrame(rafRef.current);
      };
    }, []);

    // Load a preset by index
    const doLoadPreset = useCallback((idx: number, blend = 2.0) => {
      if (!visualizerRef.current) return;
      const names = presetNamesRef.current;
      const map = presetMapRef.current;
      if (names.length === 0) return;
      const name = names[idx];
      const preset = map[name];
      if (preset) {
        visualizerRef.current.loadPreset(preset, blend);
        currentIdxRef.current = idx;
        onPresetChange?.(idx, name);
      }
    }, [onPresetChange]);

    // Load a preset by name
    const doLoadPresetByName = useCallback((name: string, blend = 2.0) => {
      if (!visualizerRef.current) return;
      const map = presetMapRef.current;
      const preset = map[name];
      if (preset) {
        const idx = presetNamesRef.current.indexOf(name);
        visualizerRef.current.loadPreset(preset, blend);
        currentIdxRef.current = idx >= 0 ? idx : currentIdxRef.current;
        onPresetChange?.(currentIdxRef.current, name);
      }
    }, [onPresetChange]);

    // Expose imperative API
    React.useImperativeHandle(ref, () => ({
      nextPreset: () => {
        const names = presetNamesRef.current;
        if (names.length === 0) return;
        doLoadPreset((currentIdxRef.current + 1) % names.length);
      },
      randomPreset: () => {
        const names = presetNamesRef.current;
        if (names.length === 0) return;
        doLoadPreset(Math.floor(Math.random() * names.length));
      },
      loadPresetByIndex: (idx: number, blend?: number) => doLoadPreset(idx, blend),
      loadPresetByName: (name: string, blend?: number) => doLoadPresetByName(name, blend),
      getPresetNames: () => presetNamesRef.current,
      getCurrentIndex: () => currentIdxRef.current,
    }), [doLoadPreset, doLoadPresetByName]);

    return (
      <>
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ imageRendering: 'auto' }}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-white/60 font-mono text-sm">Loading Milkdrop visualizer...</div>
          </div>
        )}
      </>
    );
  }
);
VJCanvas.displayName = 'VJCanvas';


// ─── VJControls — DOM overlay controls (used by both DOM view + PixiDOMOverlay) ─

export type VJLayer = 'milkdrop' | 'isf' | 'three' | 'projectm';

interface VJControlsProps {
  currentName: string;
  currentIdx: number;
  totalPresets: number;
  autoAdvance: boolean;
  isPopout?: boolean;
  activeLayer: VJLayer;
  onNext: () => void;
  onRandom: () => void;
  onToggleAutoAdvance: () => void;
  onPopOut?: () => void;
  onToggleBrowser?: () => void;
  onSwitchLayer?: (layer: VJLayer) => void;
  browserOpen?: boolean;
}

export const VJControls: React.FC<VJControlsProps> = ({
  currentName,
  currentIdx,
  totalPresets,
  autoAdvance,
  isPopout,
  activeLayer,
  onNext,
  onRandom,
  onToggleAutoAdvance,
  onPopOut,
  onToggleBrowser,
  onSwitchLayer,
  browserOpen,
}) => {
  const [showControls, setShowControls] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
      style={{ pointerEvents: 'none' }}
    >
      {/* Wrapper for auto-hide */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top bar: view selector + preset name + layer switcher */}
        <div className="absolute top-0 left-0 right-0 pointer-events-auto bg-gradient-to-b from-black/70 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 mr-4 min-w-0">
              {/* View selector dropdown */}
              <select
                value="vj"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== 'vj') {
                    // DJ is safe — switching back keeps engine alive
                    if (v !== 'dj') {
                      const { decks } = useDJStore.getState();
                      const anyPlaying = decks.A.isPlaying || decks.B.isPlaying || decks.C.isPlaying;
                      if (anyPlaying && !window.confirm('Audio is playing. Switch view? This will stop DJ playback.')) {
                        e.target.value = 'vj';
                        return;
                      }
                    }
                    useUIStore.getState().setActiveView(v as any);
                  }
                }}
                className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-white/10 text-white border border-white/20 rounded hover:bg-white/20 transition-colors cursor-pointer flex-shrink-0"
                title="Switch view"
              >
                <option value="tracker">Tracker</option>
                <option value="grid">Grid</option>
                <option value="pianoroll">Piano Roll</option>
                <option value="tb303">TB-303</option>
                <option value="arrangement">Arrangement</option>
                <option value="dj">DJ Mixer</option>
                <option value="drumpad">Drum Pads</option>
                <option value="vj">VJ View</option>
              </select>
              {onSwitchLayer && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onSwitchLayer('milkdrop')}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      activeLayer === 'milkdrop' ? 'bg-accent/60 text-white' : 'bg-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    Milkdrop
                  </button>
                  <button
                    onClick={() => onSwitchLayer('isf')}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      activeLayer === 'isf' ? 'bg-accent/60 text-white' : 'bg-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    ISF
                  </button>
                  <button
                    onClick={() => onSwitchLayer('three')}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      activeLayer === 'three' ? 'bg-accent/60 text-white' : 'bg-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    3D
                  </button>
                  <button
                    onClick={() => onSwitchLayer('projectm')}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      activeLayer === 'projectm' ? 'bg-accent/60 text-white' : 'bg-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    projectM
                  </button>
                </div>
              )}
              <div className="text-white/90 text-sm font-mono truncate">
                {currentName}
              </div>
            </div>
            <div className="text-white/50 text-xs font-mono">
              {totalPresets > 0 ? `${currentIdx + 1} / ${totalPresets}` : '—'}
            </div>
          </div>
        </div>

        {/* Bottom bar: controls */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-auto bg-gradient-to-t from-black/70 to-transparent p-4">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onRandom}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Random preset"
            >
              <Shuffle size={18} />
            </button>

            <button
              onClick={onToggleAutoAdvance}
              className={`p-2 rounded-full transition-colors text-white ${
                autoAdvance ? 'bg-green-600/50 hover:bg-green-600/70' : 'bg-white/10 hover:bg-white/20'
              }`}
              title={autoAdvance ? 'Pause auto-advance' : 'Resume auto-advance'}
            >
              {autoAdvance ? <Pause size={18} /> : <Play size={18} />}
            </button>

            <button
              onClick={onNext}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Next preset"
            >
              <SkipForward size={18} />
            </button>

            {onToggleBrowser && (
              <button
                onClick={onToggleBrowser}
                className={`p-2 rounded-full transition-colors text-white ${
                  browserOpen ? 'bg-accent/50 hover:bg-accent/70' : 'bg-white/10 hover:bg-white/20'
                }`}
                title="Browse presets"
              >
                <List size={18} />
              </button>
            )}

            {!isPopout && onPopOut && (
              <button
                onClick={onPopOut}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Pop out to second screen"
              >
                <ExternalLink size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


// ─── VJView — Full DOM view (used by App.tsx and PopOutWindow) ─────────────────

interface VJViewProps {
  /** When true, hides the pop-out button (already in a separate window) */
  isPopout?: boolean;
}

export const VJView: React.FC<VJViewProps> = ({ isPopout = false }) => {
  const canvasHandleRef = useRef<VJCanvasHandle>(null);
  const isfHandleRef = useRef<ISFCanvasHandle>(null);
  const threeHandleRef = useRef<ThreeCanvasHandle>(null);
  const projectmHandleRef = useRef<VJCanvasHandle>(null);
  const [activeLayer, setActiveLayer] = useState<VJLayer>('milkdrop');
  const [presetName, setPresetName] = useState('Loading...');
  const [presetIdx, setPresetIdx] = useState(0);
  const [presetCount, setPresetCount] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ISF state
  const [isfPresetName, setISFPresetName] = useState('');
  const [isfPresetIdx, setISFPresetIdx] = useState(0);
  const [isfPresetCount, setISFPresetCount] = useState(0);

  // Three.js state
  const [threeSceneName, setThreeSceneName] = useState('');
  const [threeSceneIdx, setThreeSceneIdx] = useState(0);
  const [threeSceneCount, setThreeSceneCount] = useState(0);

  // projectM state
  const [pmPresetName, setPmPresetName] = useState('');
  const [pmPresetIdx, setPmPresetIdx] = useState(0);
  const [pmPresetCount, setPmPresetCount] = useState(0);

  const currentName = activeLayer === 'milkdrop' ? presetName : activeLayer === 'isf' ? isfPresetName : activeLayer === 'projectm' ? pmPresetName : threeSceneName;
  const currentIdx = activeLayer === 'milkdrop' ? presetIdx : activeLayer === 'isf' ? isfPresetIdx : activeLayer === 'projectm' ? pmPresetIdx : threeSceneIdx;
  const currentCount = activeLayer === 'milkdrop' ? presetCount : activeLayer === 'isf' ? isfPresetCount : activeLayer === 'projectm' ? pmPresetCount : threeSceneCount;

  const handlePresetChange = useCallback((idx: number, name: string) => {
    setPresetIdx(idx);
    setPresetName(name);
  }, []);

  const handleReady = useCallback((count: number) => {
    setPresetCount(count);
  }, []);

  // Auto-advance timer
  useEffect(() => {
    if (!autoAdvance) return;
    const count = activeLayer === 'milkdrop' ? presetCount : activeLayer === 'isf' ? isfPresetCount : activeLayer === 'projectm' ? pmPresetCount : threeSceneCount;
    if (count === 0) return;
    const advance = () => {
      if (activeLayer === 'milkdrop') canvasHandleRef.current?.nextPreset();
      else if (activeLayer === 'isf') isfHandleRef.current?.nextPreset();
      else if (activeLayer === 'projectm') projectmHandleRef.current?.nextPreset();
      else threeHandleRef.current?.nextScene();
      autoAdvanceTimerRef.current = setTimeout(advance, 15000 + Math.random() * 15000);
    };
    autoAdvanceTimerRef.current = setTimeout(advance, 15000 + Math.random() * 15000);
    return () => { if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current); };
  }, [autoAdvance, presetCount, isfPresetCount, threeSceneCount, pmPresetCount, activeLayer]);

  const handlePopOut = useCallback(() => {
    const s = useUIStore.getState();
    if (s.vjPoppedOut) {
      focusPopout('DEViLBOX — VJ');
    } else {
      s.setVJPoppedOut(true);
    }
  }, []);

  const handleBrowserSelect = useCallback((name: string, _idx: number) => {
    canvasHandleRef.current?.loadPresetByName(name, 1.5);
    setActiveLayer('milkdrop');
  }, []);

  const handleNext = useCallback(() => {
    if (activeLayer === 'milkdrop') canvasHandleRef.current?.nextPreset();
    else if (activeLayer === 'isf') isfHandleRef.current?.nextPreset();
    else if (activeLayer === 'projectm') projectmHandleRef.current?.nextPreset();
    else threeHandleRef.current?.nextScene();
  }, [activeLayer]);

  const handleRandom = useCallback(() => {
    if (activeLayer === 'milkdrop') canvasHandleRef.current?.randomPreset();
    else if (activeLayer === 'isf') isfHandleRef.current?.randomPreset();
    else if (activeLayer === 'projectm') projectmHandleRef.current?.randomPreset();
    else threeHandleRef.current?.randomScene();
  }, [activeLayer]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Milkdrop layer */}
      <div className={`absolute inset-0 ${activeLayer === 'milkdrop' ? '' : 'hidden'}`}>
        <VJCanvas
          ref={canvasHandleRef}
          onReady={handleReady}
          onPresetChange={handlePresetChange}
        />
      </div>
      {/* ISF layer */}
      <div className={`absolute inset-0 ${activeLayer === 'isf' ? '' : 'hidden'}`}>
        <ISFCanvas
          ref={isfHandleRef}
          onReady={(count) => setISFPresetCount(count)}
          onPresetChange={(idx, name) => { setISFPresetIdx(idx); setISFPresetName(name); }}
        />
      </div>
      {/* Three.js 3D layer */}
      <div className={`absolute inset-0 ${activeLayer === 'three' ? '' : 'hidden'}`}>
        <ThreeCanvas
          ref={threeHandleRef}
          onReady={(count) => setThreeSceneCount(count)}
          onSceneChange={(idx, name) => { setThreeSceneIdx(idx); setThreeSceneName(name); }}
        />
      </div>
      {/* projectM WASM layer */}
      <div className={`absolute inset-0 ${activeLayer === 'projectm' ? '' : 'hidden'}`}>
        <React.Suspense fallback={<div className="w-full h-full bg-black flex items-center justify-center"><span className="text-white/50 font-mono text-sm">Loading projectM...</span></div>}>
          <ProjectMCanvas
            ref={projectmHandleRef}
            onReady={(count) => setPmPresetCount(count)}
            onPresetChange={(idx, name) => { setPmPresetIdx(idx); setPmPresetName(name); }}
          />
        </React.Suspense>
      </div>
      <VJControls
        currentName={currentName}
        currentIdx={currentIdx}
        totalPresets={currentCount}
        autoAdvance={autoAdvance}
        isPopout={isPopout}
        activeLayer={activeLayer}
        onNext={handleNext}
        onRandom={handleRandom}
        onToggleAutoAdvance={() => setAutoAdvance(v => !v)}
        onPopOut={handlePopOut}
        onToggleBrowser={() => setBrowserOpen(v => !v)}
        onSwitchLayer={setActiveLayer}
        browserOpen={browserOpen}
      />
      {activeLayer === 'milkdrop' && (
        <VJPresetBrowser
          isOpen={browserOpen}
          onClose={() => setBrowserOpen(false)}
          onSelectPreset={handleBrowserSelect}
          currentPresetIdx={presetIdx}
        />
      )}
    </div>
  );
};
