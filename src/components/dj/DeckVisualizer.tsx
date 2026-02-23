/**
 * DeckVisualizer — Audio visualizer with always-on pattern overlay for DJ decks.
 *
 * The pattern display is always composited on top of the active visualizer
 * (like the tracker view), and pointer events pass through to the pattern
 * display for scratch interaction.
 *
 * Navigation buttons (prev / next / random / slideshow) are shown in the
 * top-right corner on hover, replacing the old click-to-cycle behavior.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Maximize2, Minimize2, ChevronLeft, ChevronRight, Shuffle, Play, Pause,
} from 'lucide-react';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { DeckPatternDisplay } from './DeckPatternDisplay';
import {
  VISUALIZER_MODES,
  MODE_LABELS,
  AM_PRESET_MAP,
  isAudioMotionMode,
  createVisualizerState,
  type WebGLVisualizerMode,
  type AudioData,
} from './visualizers/types';
import { AudioMotionVisualizer } from '@/components/visualization/AudioMotionVisualizer';
import {
  createRendererCache,
  destroyRendererCache,
  RENDERERS,
  type RendererCache,
} from './visualizers/renderers';

/**
 * Visualizer-only modes (pattern is always an overlay, not a standalone mode).
 * Starts from index 1 of VISUALIZER_MODES to skip 'pattern'.
 */
const VIZ_MODES = VISUALIZER_MODES.slice(1);
const SLIDESHOW_INTERVAL_MS = 15_000; // 15s per mode in slideshow

interface DeckVisualizerProps {
  deckId: 'A' | 'B' | 'C';
  resetKey?: number;
}

export const DeckVisualizer: React.FC<DeckVisualizerProps> = ({ deckId, resetKey = 0 }) => {
  const [vizIndex, setVizIndex] = useState(0); // index into VIZ_MODES
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [slideshowActive, setSlideshowActive] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const cacheRef = useRef<RendererCache | null>(null);
  const stateRef = useRef(createVisualizerState());
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(performance.now() / 1000);
  const slideshowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mode = VIZ_MODES[vizIndex % VIZ_MODES.length];
  const isAMMode = isAudioMotionMode(mode);

  // Reset to first viz mode when a new song is dropped
  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== prevResetKeyRef.current) {
      prevResetKeyRef.current = resetKey;
      setVizIndex(0);
    }
  }, [resetKey]);

  // ── Navigation callbacks ─────────────────────────────────────────────────

  const goNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setVizIndex((prev) => (prev + 1) % VIZ_MODES.length);
  }, []);

  const goPrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setVizIndex((prev) => (prev - 1 + VIZ_MODES.length) % VIZ_MODES.length);
  }, []);

  const goRandom = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setVizIndex((prev) => {
      let next: number;
      do { next = Math.floor(Math.random() * VIZ_MODES.length); } while (next === prev && VIZ_MODES.length > 1);
      return next;
    });
  }, []);

  const toggleSlideshow = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSlideshowActive((prev) => !prev);
  }, []);

  // Slideshow timer
  useEffect(() => {
    if (slideshowActive) {
      slideshowTimerRef.current = setInterval(() => {
        setVizIndex((prev) => {
          let next: number;
          do { next = Math.floor(Math.random() * VIZ_MODES.length); } while (next === prev && VIZ_MODES.length > 1);
          return next;
        });
      }, SLIDESHOW_INTERVAL_MS);
    }
    return () => {
      if (slideshowTimerRef.current) {
        clearInterval(slideshowTimerRef.current);
        slideshowTimerRef.current = null;
      }
    };
  }, [slideshowActive]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  // ── WebGL render loop ────────────────────────────────────────────────────

  useEffect(() => {
    if (isAMMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!glRef.current) {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      });
      if (!gl) {
        console.warn('[DeckVisualizer] WebGL2 not available');
        return;
      }
      gl.getExtension('EXT_color_buffer_float');
      glRef.current = gl;
      cacheRef.current = createRendererCache(gl);
    }

    const gl = glRef.current!;
    const cache = cacheRef.current!;
    const state = stateRef.current;
    let running = true;

    const frame = () => {
      if (!running) return;
      const container = containerRef.current;
      if (container && canvas) {
        const dpr = Math.min(window.devicePixelRatio, 2);
        const w = container.clientWidth;
        const h = container.clientHeight;
        const drawW = Math.round(w * dpr);
        const drawH = Math.round(h * dpr);
        if (canvas.width !== drawW || canvas.height !== drawH) {
          canvas.width = drawW;
          canvas.height = drawH;
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
        }
        gl.viewport(0, 0, drawW, drawH);
        const audio = getAudioData(deckId);
        const time = performance.now() / 1000 - startTimeRef.current;
        const renderer = RENDERERS[mode as WebGLVisualizerMode];
        if (renderer) renderer(cache, audio, state, time, drawW, drawH);
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [deckId, mode, isAMMode]);

  // Cleanup WebGL on unmount
  useEffect(() => {
    return () => {
      if (cacheRef.current) {
        destroyRendererCache(cacheRef.current);
        cacheRef.current = null;
      }
      glRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const modeLabel = MODE_LABELS[mode];

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-dark-bg border border-dark-border rounded-sm overflow-hidden select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* audioMotion analyzer */}
      {isAMMode && (
        <div className="absolute inset-0 w-full h-full">
          <AudioMotionVisualizer
            preset={AM_PRESET_MAP[mode] ?? 'ledBars'}
            audioSource={deckId === 'A' ? 'deckA' : 'deckB'}
          />
        </div>
      )}

      {/* WebGL canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: isAMMode ? 'none' : 'block' }}
      />

      {/* Pattern overlay — always visible, semi-transparent over the visualizer */}
      <div className="absolute inset-0" style={{ opacity: 0.55 }}>
        <DeckPatternDisplay deckId={deckId} />
      </div>

      {/* Mode label — bottom-right */}
      <div
        className="absolute bottom-1 right-1 text-[9px] font-mono uppercase tracking-wider pointer-events-none"
        style={{ opacity: isFullscreen ? 0.7 : 0.4, color: '#888' }}
      >
        {modeLabel}
        {slideshowActive && ' ⟳'}
      </div>

      {/* Navigation buttons — top-right, visible on hover */}
      {(isHovered || isFullscreen) && (
        <div className="absolute top-1 right-1 flex gap-0.5 z-10">
          <button
            className="p-0.5 rounded bg-black/50 hover:bg-black/80 text-white/60 hover:text-white/90 transition-colors"
            onClick={goPrev}
            title="Previous visualizer"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            className="p-0.5 rounded bg-black/50 hover:bg-black/80 text-white/60 hover:text-white/90 transition-colors"
            onClick={goNext}
            title="Next visualizer"
          >
            <ChevronRight size={12} />
          </button>
          <button
            className="p-0.5 rounded bg-black/50 hover:bg-black/80 text-white/60 hover:text-white/90 transition-colors"
            onClick={goRandom}
            title="Random visualizer"
          >
            <Shuffle size={12} />
          </button>
          <button
            className={`p-0.5 rounded transition-colors ${
              slideshowActive
                ? 'bg-green-500/40 text-green-300 hover:bg-green-500/60'
                : 'bg-black/50 hover:bg-black/80 text-white/60 hover:text-white/90'
            }`}
            onClick={toggleSlideshow}
            title={slideshowActive ? 'Stop slideshow' : 'Random slideshow (15s)'}
          >
            {slideshowActive ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button
            className="p-0.5 rounded bg-black/50 hover:bg-black/80 text-white/60 hover:text-white/90 transition-colors"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Audio data extraction ────────────────────────────────────────────────────

const EMPTY_WAVE = new Float32Array(256);
const EMPTY_FFT = new Float32Array(1024);
const EMPTY_AUDIO: AudioData = {
  waveform: EMPTY_WAVE,
  fft: EMPTY_FFT,
  rms: 0,
  peak: 0,
  bassEnergy: 0,
  midEnergy: 0,
  highEnergy: 0,
};

function getAudioData(deckId: 'A' | 'B' | 'C'): AudioData {
  try {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    const waveform = deck.getWaveform();
    const fft = deck.getFFT();

    // RMS from waveform
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i];
      sumSq += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSq / waveform.length);

    // Energy bands from FFT (normalized from dB)
    const normalize = (db: number) => Math.max(0, (db + 100) / 100);
    let bassSum = 0, midSum = 0, highSum = 0;
    const bassEnd = 10;
    const midEnd = 100;
    for (let i = 0; i < fft.length; i++) {
      const v = normalize(fft[i]);
      if (i < bassEnd) bassSum += v;
      else if (i < midEnd) midSum += v;
      else highSum += v;
    }

    return {
      waveform,
      fft,
      rms,
      peak,
      bassEnergy: bassSum / bassEnd,
      midEnergy: midSum / (midEnd - bassEnd),
      highEnergy: highSum / (fft.length - midEnd),
    };
  } catch {
    return EMPTY_AUDIO;
  }
}
