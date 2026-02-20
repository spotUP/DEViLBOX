/**
 * DeckVisualizer — Replaces DeckPatternDisplay in DJ decks.
 *
 * Click cycles through visualizer modes: Pattern → 6 WebGL VJ modes → Pattern.
 * When a song is loaded (fileName changes), auto-resets to pattern mode.
 * Fullscreen button (Maximize2) projects the current visualizer to fill the screen.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Maximize2, Minimize2, Layers } from 'lucide-react';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { DeckPatternDisplay } from './DeckPatternDisplay';
import {
  VISUALIZER_MODES,
  MODE_LABELS,
  createVisualizerState,
  type VisualizerMode,
  type AudioData,
} from './visualizers/types';
import {
  createRendererCache,
  destroyRendererCache,
  RENDERERS,
  type RendererCache,
} from './visualizers/renderers';

interface DeckVisualizerProps {
  deckId: 'A' | 'B';
  resetKey?: number;
}

export const DeckVisualizer: React.FC<DeckVisualizerProps> = ({ deckId, resetKey = 0 }) => {
  const [modeIndex, setModeIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showPatternOverlay, setShowPatternOverlay] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const cacheRef = useRef<RendererCache | null>(null);
  const stateRef = useRef(createVisualizerState());
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(performance.now() / 1000);

  const mode = VISUALIZER_MODES[modeIndex];
  const isPatternMode = mode === 'pattern';

  // Reset to pattern mode when a new song is dropped (parent bumps resetKey)
  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== prevResetKeyRef.current) {
      prevResetKeyRef.current = resetKey;
      setModeIndex(0);
    }
  }, [resetKey]);

  // Click cycles to next mode
  const handleClick = useCallback(() => {
    setModeIndex((prev) => (prev + 1) % VISUALIZER_MODES.length);
  }, []);

  // Pattern overlay toggle
  const togglePatternOverlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPatternOverlay((prev) => !prev);
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't cycle mode
    if (!containerRef.current) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  }, []);

  // Sync fullscreen state with API
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Initialize WebGL when entering a visualizer mode
  useEffect(() => {
    if (isPatternMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Get or re-use WebGL context
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
      // Enable float textures
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

      // Resize canvas to container
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

        // Get audio data
        const audio = getAudioData(deckId);
        const time = performance.now() / 1000 - startTimeRef.current;

        // Dispatch to renderer
        const renderer = RENDERERS[mode as Exclude<VisualizerMode, 'pattern'>];
        if (renderer) {
          renderer(cache, audio, state, time, drawW, drawH);
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [deckId, mode, isPatternMode]);

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
      className="relative w-full h-full bg-dark-bg border border-dark-border rounded-sm overflow-hidden cursor-pointer select-none"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Pattern display (mode 0) */}
      {isPatternMode && <DeckPatternDisplay deckId={deckId} />}

      {/* WebGL canvas (all other modes) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: isPatternMode ? 'none' : 'block' }}
      />

      {/* Pattern overlay on top of visualizer */}
      {!isPatternMode && showPatternOverlay && (
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.45 }}>
          <DeckPatternDisplay deckId={deckId} />
        </div>
      )}

      {/* Mode label — bottom-right */}
      {!isPatternMode && (
        <div
          className="absolute bottom-1 right-1 text-[9px] font-mono uppercase tracking-wider pointer-events-none"
          style={{ opacity: isFullscreen ? 0.7 : 0.4, color: '#888' }}
        >
          {modeLabel}
        </div>
      )}

      {/* Control buttons — top-right, visible on hover or when in a visualizer mode */}
      {!isPatternMode && (isHovered || isFullscreen) && (
        <div className="absolute top-1 right-1 flex gap-0.5 z-10">
          <button
            className={`p-0.5 rounded transition-colors ${
              showPatternOverlay
                ? 'bg-green-500/40 text-green-300 hover:bg-green-500/60'
                : 'bg-black/50 hover:bg-black/80 text-white/60 hover:text-white/90'
            }`}
            onClick={togglePatternOverlay}
            title={showPatternOverlay ? 'Hide pattern overlay' : 'Show pattern overlay'}
          >
            <Layers size={12} />
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

function getAudioData(deckId: 'A' | 'B'): AudioData {
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
