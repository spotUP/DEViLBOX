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
import { TurntablePhysics } from '@engine/turntable/TurntablePhysics';
import { getDJEngine } from '@engine/dj/DJEngine';
import * as DJActions from '@engine/dj/DJActions';
import { ExternalLink, SkipForward, Shuffle, Pause, Play, List, Maximize, Minimize, Music, Zap } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { VIEW_OPTIONS, switchView } from '@/constants/viewOptions';
import { CustomSelect } from '@components/common/CustomSelect';
import { useDJStore } from '@stores/useDJStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { focusPopout } from '@components/ui/PopOutWindow';
import { VJPresetBrowser } from './VJPresetBrowser';
import { VJPatternOverlay } from './VJPatternOverlay';
import { registerCaptureCanvas } from '@/engine/dj/streaming/DJVideoCapture';

// Lazy-load ProjectMCanvas (heavy WASM dependency)
const ProjectMCanvas = React.lazy(() => import('./ProjectMCanvas').then(m => ({ default: m.ProjectMCanvas })));

// Lazy-load KraftwerkHeadOverlay (transparent 3D head on top of visualizers)
const LazyHeadOverlay = React.lazy(() => import('./KraftwerkHeadOverlay').then(m => ({ default: m.KraftwerkHeadOverlay })));

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
  /** Load preset by name. blend/smooth: number for butterchurn (seconds), boolean for projectM */
  loadPresetByName: (name: string, blendOrSmooth?: number | boolean) => void;
  getPresetNames: () => string[];
  getCurrentIndex: () => number;
  /** Load a random preset with NO internal transition (instant cut).
   *  Used during layer switches where the CSS crossfade handles the visual transition.
   *  Butterchurn: blend=0. ProjectM: direct load, no fade overlay. */
  loadRandomDirect?: () => void;
}

interface VJCanvasProps {
  /** Called once butterchurn is ready with preset metadata */
  onReady?: (presetCount: number) => void;
  /** Called when the active preset changes */
  onPresetChange?: (idx: number, name: string) => void;
  /** Whether this layer is currently visible */
  visible?: boolean;
}

export const VJCanvas = React.forwardRef<VJCanvasHandle, VJCanvasProps>(
  ({ onReady, onPresetChange, visible = true }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const visualizerRef = useRef<any>(null);
    const audioDataBusRef = useRef<AudioDataBus | null>(null);
    const rafRef = useRef<number>(0);
    const presetNamesRef = useRef<string[]>([]);
    const presetMapRef = useRef<Record<string, object>>({});
    const currentIdxRef = useRef(0);
    const visibleRef = useRef(visible);
    const [ready, setReady] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => { visibleRef.current = visible; }, [visible]);

    // Register canvas for video capture
    useEffect(() => {
      registerCaptureCanvas('vj', canvasRef.current);
      return () => registerCaptureCanvas('vj', null);
    }, []);

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
          if (cancelled || !canvas) return;

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
          console.error('[VJ] butterchurn load failed:', err);
          if (!cancelled) setLoadFailed(true);
        }
      }

      return () => { cancelled = true; cancelAnimationFrame(initRaf); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Render loop — runs continuously once ready; skips draw when not visible.
    // Only depends on `ready` (not `visible`) to avoid tearing down/recreating
    // the rAF chain during crossfade visibility toggles.
    useEffect(() => {
      if (!ready) return;
      let cancelled = false;
      const render = () => {
        if (cancelled) return;
        if (visibleRef.current) {
          audioDataBusRef.current?.update();
          visualizerRef.current?.render();
        }
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
      return () => { cancelled = true; cancelAnimationFrame(rafRef.current); };
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
      loadPresetByName: (name: string, blendOrSmooth?: number | boolean) => doLoadPresetByName(name, typeof blendOrSmooth === 'number' ? blendOrSmooth : undefined),
      getPresetNames: () => presetNamesRef.current,
      getCurrentIndex: () => currentIdxRef.current,
      loadRandomDirect: () => {
        const names = presetNamesRef.current;
        if (names.length === 0) return;
        doLoadPreset(Math.floor(Math.random() * names.length), 0.0);
      },
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
            <div className="text-white/60 font-mono text-sm">
              {loadFailed ? 'Butterchurn failed to load — using ISF/projectM' : 'Loading Milkdrop visualizer...'}
            </div>
          </div>
        )}
      </>
    );
  }
);
VJCanvas.displayName = 'VJCanvas';


// ─── Pattern overlay toggle (reads/writes settings store directly) ──────────
const PatternOverlayToggle: React.FC = () => {
  const enabled = useSettingsStore(s => s.vjPatternOverlay);
  const toggle = useSettingsStore(s => s.setVjPatternOverlay);
  return (
    <button
      onClick={() => toggle(!enabled)}
      className={`p-2 rounded-full transition-colors text-text-primary ${
        enabled ? 'bg-purple-600/50 hover:bg-purple-600/70' : 'bg-white/10 hover:bg-white/20'
      }`}
      title={enabled ? 'Hide pattern overlay' : 'Show pattern overlay'}
    >
      <Music size={18} />
    </button>
  );
};

// ─── Max Headroom mode toggle ───────────────────────────────────────────────
const MaxHeadroomToggle: React.FC = () => {
  const enabled = useSettingsStore(s => s.maxHeadroomMode);
  const toggle = useSettingsStore(s => s.setMaxHeadroomMode);
  return (
    <button
      onClick={() => toggle(!enabled)}
      className={`p-2 rounded-full transition-colors text-text-primary ${
        enabled ? 'bg-cyan-600/50 hover:bg-cyan-600/70' : 'bg-white/10 hover:bg-white/20'
      }`}
      title={enabled ? 'Disable Max Headroom mode' : 'Enable Max Headroom mode'}
    >
      <Zap size={18} />
    </button>
  );
};

// ─── Conditional wrapper for pattern overlay on VJ view ─────────────────────
const VJPatternOverlayWrapper: React.FC = () => {
  const enabled = useSettingsStore(s => s.vjPatternOverlay);
  const trackerPlaying = useTransportStore(s => s.isPlaying);
  const deckA = useDJStore(s => s.decks.A);
  const deckB = useDJStore(s => s.decks.B);
  const crossfader = useDJStore(s => s.crossfaderPosition);
  if (!enabled) return null;

  // Collect active sources into a single array for one unified canvas
  const activeSources: Array<'tracker' | 'deckA' | 'deckB'> = [];
  if (trackerPlaying) activeSources.push('tracker');
  if (deckA.isPlaying) activeSources.push('deckA');
  if (deckB.isPlaying) activeSources.push('deckB');

  // Only show overlay when something with real pattern data is playing
  if (activeSources.length === 0) return null;

  return <VJPatternOverlay sources={activeSources} crossfader={crossfader} />;
};

// ─── VJControls — DOM overlay controls (used by both DOM view + PixiDOMOverlay) ─

type VJLayer = 'milkdrop' | 'projectm';

interface VJControlsProps {
  currentName: string;
  currentIdx: number;
  totalPresets: number;
  autoAdvance: boolean;
  isPopout?: boolean;
  onNext: () => void;
  onRandom: () => void;
  onToggleAutoAdvance: () => void;
  onPopOut?: () => void;
  onToggleBrowser?: () => void;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
  browserOpen?: boolean;
}

export const VJControls: React.FC<VJControlsProps> = ({
  currentName,
  currentIdx,
  totalPresets,
  autoAdvance,
  isPopout,
  onNext,
  onRandom,
  onToggleAutoAdvance,
  onPopOut,
  onToggleBrowser,
  onFullscreen,
  isFullscreen,
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
        {/* Top bar: view switcher + preset name + counter */}
        <div className="absolute top-0 left-0 right-0 pointer-events-auto bg-gradient-to-b from-black/70 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 mr-4 min-w-0">
              {/* View switcher — since NavBar is hidden in VJ fullscreen mode */}
              <CustomSelect
                value="vj"
                onChange={(v) => switchView(v, 'vj')}
                className="bg-white/10 text-white text-xs border border-white/20 rounded px-2 py-1 outline-none cursor-pointer"
                title="Switch view"
                options={VIEW_OPTIONS.map((v) => ({ value: v.value, label: v.label }))}
              />
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
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-text-primary transition-colors"
              title="Random preset"
            >
              <Shuffle size={18} />
            </button>

            <button
              onClick={onToggleAutoAdvance}
              className={`p-2 rounded-full transition-colors text-text-primary ${
                autoAdvance ? 'bg-green-600/50 hover:bg-green-600/70' : 'bg-white/10 hover:bg-white/20'
              }`}
              title={autoAdvance ? 'Pause auto-advance' : 'Resume auto-advance'}
            >
              {autoAdvance ? <Pause size={18} /> : <Play size={18} />}
            </button>

            <button
              onClick={onNext}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-text-primary transition-colors"
              title="Next preset"
            >
              <SkipForward size={18} />
            </button>

            {onToggleBrowser && (
              <button
                onClick={onToggleBrowser}
                className={`p-2 rounded-full transition-colors text-text-primary ${
                  browserOpen ? 'bg-accent/50 hover:bg-accent/70' : 'bg-white/10 hover:bg-white/20'
                }`}
                title="Browse presets"
              >
                <List size={18} />
              </button>
            )}

            <PatternOverlayToggle />
            <MaxHeadroomToggle />

            {!isPopout && onPopOut && (
              <button
                onClick={onPopOut}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-text-primary transition-colors"
                title="Pop out to second screen"
              >
                <ExternalLink size={18} />
              </button>
            )}

            {onFullscreen && (
              <button
                onClick={onFullscreen}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-text-primary transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
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
  const vjViewActive = useUIStore((s) => s.activeView === 'vj') || isPopout;
  const canvasHandleRef = useRef<VJCanvasHandle>(null);
  const projectmHandleRef = useRef<VJCanvasHandle>(null);
  const [activeLayer, setActiveLayer] = useState<VJLayer>('milkdrop');
  const [presetName, setPresetName] = useState('Loading...');
  const [presetIdx, setPresetIdx] = useState(0);
  const [presetCount, setPresetCount] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prevLayerRef = useRef<VJLayer>('milkdrop');
  const switchToLayerRef = useRef<(target: VJLayer, loadPreset: () => void) => void>(undefined);

  // Which layers are actively rendering — both on during crossfade, then old one stops.
  // This avoids running two WebGL pipelines at 60fps permanently.
  const [renderMilkdrop, setRenderMilkdrop] = useState(true);
  const [renderProjectm, setRenderProjectm] = useState(false);
  const crossfadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const preloadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Track what the auto-advance preloaded into the hidden canvas
  const preloadedTargetRef = useRef<VJLayer | null>(null);

  // Layer switch for manual controls (Next, Random, browser pick).
  // Loads the preset immediately (may block briefly during butterchurn shader
  // compilation — old canvas stays frozen which is less jarring than a black screen),
  // then crossfades after 2 rAF frames once the target has rendered.
  const switchToLayer = useCallback((target: VJLayer, loadPreset: () => void) => {
    // HARD GUARD: never allow projectM → projectM (crashes native shader pipeline)
    let effectiveTarget = target;
    let effectiveLoadPreset = loadPreset;
    if (target === 'projectm' && prevLayerRef.current === 'projectm') {
      effectiveTarget = 'milkdrop';
      effectiveLoadPreset = () => canvasHandleRef.current?.loadRandomDirect?.() ?? canvasHandleRef.current?.nextPreset();
    }
    prevLayerRef.current = effectiveTarget;
    preloadedTargetRef.current = null; // cancel any pending auto-advance preload

    if (crossfadeTimerRef.current !== undefined) clearTimeout(crossfadeTimerRef.current);

    // Wake both render loops
    setRenderMilkdrop(true);
    setRenderProjectm(true);

    // Load preset — butterchurn compiles shaders synchronously (may block 0.1-3s,
    // old canvas stays frozen). projectM fetches async + queues.
    effectiveLoadPreset();

    // Wait 2 rAF frames for target to render, then CSS crossfade
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setActiveLayer(effectiveTarget);
        // Stop old engine after CSS transition completes
        crossfadeTimerRef.current = setTimeout(() => {
          setRenderMilkdrop(effectiveTarget === 'milkdrop');
          setRenderProjectm(effectiveTarget === 'projectm');
          crossfadeTimerRef.current = undefined;
        }, 750); // 700ms CSS transition + 50ms margin
      });
    });
  }, []);

  // Keep ref in sync so auto-advance timer always has current switchToLayer
  useEffect(() => { switchToLayerRef.current = switchToLayer; }, [switchToLayer]);

  // ── DJ deck scratch via scroll ──────────────────────────────────────────
  const scratchPhysicsRef = useRef<TurntablePhysics | null>(null);
  const scratchActiveRef = useRef(false);
  const scratchLastScrollTimeRef = useRef(0);
  const scratchReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scratchRafRef = useRef<number | null>(null);
  const scratchLastTickRef = useRef(0);
  const scratchDeckRef = useRef<'A' | 'B' | null>(null);

  // Fullscreen toggle
  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // projectM state
  const [pmPresetName, setPmPresetName] = useState('');
  const [pmPresetIdx, setPmPresetIdx] = useState(0);
  const [pmPresetCount, setPmPresetCount] = useState(0);

  // Stable callbacks for projectM (avoid inline arrows that change every render)
  const handlePMReady = useCallback((count: number) => setPmPresetCount(count), []);
  const handlePMPresetChange = useCallback((idx: number, name: string) => {
    setPmPresetIdx(idx);
    setPmPresetName(name);
  }, []);

  // Show whichever engine is currently active — user doesn't see the distinction
  const currentName = activeLayer === 'milkdrop' ? presetName : pmPresetName;
  const combinedCount = presetCount + pmPresetCount;
  const currentIdx = activeLayer === 'milkdrop' ? presetIdx : (presetCount + pmPresetIdx);

  const handlePresetChange = useCallback((idx: number, name: string) => {
    setPresetIdx(idx);
    setPresetName(name);
  }, []);

  const handleReady = useCallback((count: number) => {
    setPresetCount(count);
  }, []);

  // Auto-advance with preset pre-compilation.
  // Phase 1 (5s before switch): wake the hidden engine + load a random preset.
  //   Butterchurn shader compilation blocks the main thread here, but it happens
  //   mid-preset (not during the transition) so the brief stutter is much less
  //   noticeable than a freeze at the crossfade moment.
  // Phase 2 (switch time): just start the CSS crossfade — both canvases are
  //   already rendering live frames, so the transition is perfectly smooth.
  useEffect(() => {
    if (!autoAdvance) return;
    if (presetCount === 0 && pmPresetCount === 0) return;

    const PRELOAD_LEAD_MS = 5000;

    const scheduleAdvance = () => {
      const interval = 15000 + Math.random() * 15000;

      // Determine next target layer
      const nextTarget: VJLayer =
        (activeLayer === 'milkdrop' && pmPresetCount > 0) ? 'projectm' :
        (activeLayer === 'projectm' && presetCount > 0) ? 'milkdrop' :
        activeLayer; // only one engine available

      const willSwitchLayer = nextTarget !== activeLayer;

      // Phase 1: Pre-load preset into hidden canvas (shader compiles here)
      if (willSwitchLayer) {
        preloadTimerRef.current = setTimeout(() => {
          preloadTimerRef.current = undefined;
          // Wake target engine so its render loop starts processing
          if (nextTarget === 'milkdrop') setRenderMilkdrop(true);
          else setRenderProjectm(true);
          // Load with instant cut — no internal blend/fade
          if (nextTarget === 'milkdrop') {
            canvasHandleRef.current?.loadRandomDirect?.() ?? canvasHandleRef.current?.randomPreset();
          } else {
            projectmHandleRef.current?.loadRandomDirect?.() ?? projectmHandleRef.current?.randomPreset();
          }
          preloadedTargetRef.current = nextTarget;
        }, Math.max(interval - PRELOAD_LEAD_MS, 2000));
      }

      // Phase 2: Execute the switch
      autoAdvanceTimerRef.current = setTimeout(() => {
        if (willSwitchLayer && preloadedTargetRef.current === nextTarget) {
          // Preset already compiled + rendering in hidden canvas — just crossfade
          prevLayerRef.current = nextTarget;
          preloadedTargetRef.current = null;
          setActiveLayer(nextTarget);
          crossfadeTimerRef.current = setTimeout(() => {
            setRenderMilkdrop(nextTarget === 'milkdrop');
            setRenderProjectm(nextTarget === 'projectm');
            crossfadeTimerRef.current = undefined;
          }, 750);
        } else if (willSwitchLayer) {
          // Preload didn't fire or was cancelled — fall back to direct switch
          preloadedTargetRef.current = null;
          const doSwitch = switchToLayerRef.current;
          if (doSwitch) {
            if (nextTarget === 'milkdrop') {
              doSwitch('milkdrop', () => canvasHandleRef.current?.loadRandomDirect?.() ?? canvasHandleRef.current?.randomPreset());
            } else {
              doSwitch('projectm', () => projectmHandleRef.current?.loadRandomDirect?.() ?? projectmHandleRef.current?.randomPreset());
            }
          }
        } else {
          // Only one engine available — advance within it
          if (activeLayer === 'milkdrop') canvasHandleRef.current?.randomPreset();
          else projectmHandleRef.current?.randomPreset();
        }
        scheduleAdvance();
      }, interval);
    };

    scheduleAdvance();
    return () => {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
      preloadedTargetRef.current = null;
    };
  }, [autoAdvance, presetCount, pmPresetCount, activeLayer]);

  // Wheel listener — scratch whichever DJ deck is playing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: WheelEvent) => {
      // Find an active DJ deck
      const decks = useDJStore.getState().decks;
      const deckId: 'A' | 'B' | null = decks.A.isPlaying ? 'A' : decks.B.isPlaying ? 'B' : null;
      if (!deckId) return; // No DJ deck playing — let event pass

      e.preventDefault();

      if (!scratchPhysicsRef.current) {
        try { scratchPhysicsRef.current = getDJEngine().getDeck(deckId).physics; } catch { return; }
      }
      const physics = scratchPhysicsRef.current;

      // Enter scratch on first event
      if (!scratchActiveRef.current || scratchDeckRef.current !== deckId) {
        scratchActiveRef.current = true;
        scratchDeckRef.current = deckId;
        DJActions.startScratch(deckId);

        // Physics rAF loop — forwards rate to DeckEngine
        if (scratchRafRef.current !== null) cancelAnimationFrame(scratchRafRef.current);
        scratchLastTickRef.current = performance.now();
        let prevRate = 1;

        const tick = (now: number) => {
          const dt = (now - scratchLastTickRef.current) / 1000;
          scratchLastTickRef.current = now;

          const rate = physics.tick(dt);

          if (Math.abs(rate - prevRate) > 0.01) {
            DJActions.setScratchVelocity(deckId, rate);
            prevRate = rate;
          }

          // Exit when motor restores to normal and hand is released
          if (!physics.touching && Math.abs(rate - 1.0) < 0.02) {
            scratchActiveRef.current = false;
            scratchDeckRef.current = null;
            DJActions.stopScratch(deckId, 50);
            scratchRafRef.current = null;
            return;
          }

          scratchRafRef.current = requestAnimationFrame(tick);
        };

        scratchRafRef.current = requestAnimationFrame(tick);
      }

      // Velocity control (same as pattern editor and DJ vinyl)
      const now = performance.now();
      const dt = Math.max(0.001, (now - scratchLastScrollTimeRef.current) / 1000);
      scratchLastScrollTimeRef.current = now;

      const normalizedDelta = e.deltaMode === 1 ? e.deltaY * 12 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const omega = TurntablePhysics.deltaToAngularVelocity(normalizedDelta, dt);
      physics.setTouching(true);
      physics.setHandVelocity(omega);

      if (scratchReleaseTimerRef.current !== null) clearTimeout(scratchReleaseTimerRef.current);
      scratchReleaseTimerRef.current = setTimeout(() => {
        scratchReleaseTimerRef.current = null;
        physics.setTouching(false);
      }, 150);
    };

    container.addEventListener('wheel', handler, { passive: false });
    return () => {
      container.removeEventListener('wheel', handler);
      if (scratchRafRef.current !== null) cancelAnimationFrame(scratchRafRef.current);
      if (scratchReleaseTimerRef.current !== null) clearTimeout(scratchReleaseTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // containerRef is stable; useDJStore is read imperatively

  const handlePopOut = useCallback(() => {
    const s = useUIStore.getState();
    if (s.vjPoppedOut) {
      focusPopout('DEViLBOX — VJ');
    } else {
      // Exit fullscreen first — browsers block window.open() in fullscreen mode
      if (document.fullscreenElement) {
        document.exitFullscreen().then(() => {
          useUIStore.getState().setVJPoppedOut(true);
        });
      } else {
        s.setVJPoppedOut(true);
      }
    }
  }, []);

  const handleBrowserSelect = useCallback((name: string, _idx: number) => {
    switchToLayer('milkdrop', () => canvasHandleRef.current?.loadPresetByName(name, 1.5));
  }, [switchToLayer]);

  const handlePMBrowserSelect = useCallback((name: string, _idx: number) => {
    // Instant switch (no blend) for manual browser picks + reset auto-advance timer
    switchToLayer('projectm', () => projectmHandleRef.current?.loadPresetByName(name, false));
    // Close browser so user can see the preset change (80% black overlay hides it)
    setBrowserOpen(false);
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = undefined;
    }
  }, [switchToLayer]);

  // Next/Random always alternate layers so projectM never loads consecutive presets
  const handleNext = useCallback(() => {
    if (activeLayer === 'projectm' && presetCount > 0) {
      switchToLayer('milkdrop', () => canvasHandleRef.current?.nextPreset());
    } else if (activeLayer === 'milkdrop' && pmPresetCount > 0) {
      switchToLayer('projectm', () => projectmHandleRef.current?.nextPreset());
    } else {
      if (activeLayer === 'milkdrop') canvasHandleRef.current?.nextPreset();
      else projectmHandleRef.current?.nextPreset();
    }
  }, [activeLayer, presetCount, pmPresetCount, switchToLayer]);

  const handleRandom = useCallback(() => {
    if (activeLayer === 'projectm' && presetCount > 0) {
      switchToLayer('milkdrop', () => canvasHandleRef.current?.randomPreset());
    } else if (activeLayer === 'milkdrop' && pmPresetCount > 0) {
      switchToLayer('projectm', () => projectmHandleRef.current?.randomPreset());
    } else {
      if (activeLayer === 'milkdrop') canvasHandleRef.current?.randomPreset();
      else projectmHandleRef.current?.randomPreset();
    }
  }, [activeLayer, presetCount, pmPresetCount, switchToLayer]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
      {/* Milkdrop layer — crossfade via CSS opacity, render loop paused when fully hidden */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-in-out"
        style={{ opacity: activeLayer === 'milkdrop' ? 1 : 0, pointerEvents: activeLayer === 'milkdrop' ? 'auto' : 'none' }}
      >
        <VJCanvas
          ref={canvasHandleRef}
          onReady={handleReady}
          onPresetChange={handlePresetChange}
          visible={vjViewActive && renderMilkdrop}
        />
      </div>
      {/* projectM WASM layer */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-in-out"
        style={{ opacity: activeLayer === 'projectm' ? 1 : 0, pointerEvents: activeLayer === 'projectm' ? 'auto' : 'none' }}
      >
        <React.Suspense fallback={<div className="w-full h-full bg-black flex items-center justify-center"><span className="text-white/50 font-mono text-sm">Loading projectM...</span></div>}>
          <ProjectMCanvas
            ref={projectmHandleRef}
            onReady={handlePMReady}
            onPresetChange={handlePMPresetChange}
            visible={vjViewActive && renderProjectm}
          />
        </React.Suspense>
      </div>
      {/* 3D wireframe head overlay — transparent, on top of visualizers */}
      <React.Suspense fallback={null}>
        <LazyHeadOverlay />
      </React.Suspense>
      <VJPatternOverlayWrapper />
      <VJControls
        currentName={currentName}
        currentIdx={currentIdx}
        totalPresets={combinedCount}
        autoAdvance={autoAdvance}
        isPopout={isPopout}
        onNext={handleNext}
        onRandom={handleRandom}
        onToggleAutoAdvance={() => setAutoAdvance(v => !v)}
        onPopOut={handlePopOut}
        onToggleBrowser={() => setBrowserOpen(v => !v)}
        onFullscreen={handleFullscreen}
        isFullscreen={isFullscreen}
        browserOpen={browserOpen}
      />
      <VJPresetBrowser
        isOpen={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelectPreset={activeLayer === 'projectm' ? handlePMBrowserSelect : handleBrowserSelect}
        currentPresetIdx={activeLayer === 'projectm' ? pmPresetIdx : presetIdx}
        currentPresetName={activeLayer === 'projectm' ? pmPresetName : undefined}
        mode={activeLayer === 'projectm' ? 'projectm' : 'butterchurn'}
      />
    </div>
  );
};
