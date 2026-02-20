/**
 * TrackerVisualBackground — WebGL audio-reactive visuals behind the pattern editor.
 *
 * Reuses the DJ view's 6 WebGL renderers (spectrum, radial, terrain, plasma,
 * starfield, particles) rendered at reduced opacity so pattern text remains readable.
 * Connects to ToneEngine analysers on mount and tears down on unmount.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '@stores/useSettingsStore';
import { getToneEngine } from '@engine/ToneEngine';
import {
  VISUALIZER_MODES,
  MODE_LABELS,
  createVisualizerState,
  type AudioData,
  type VisualizerMode,
} from '@/components/dj/visualizers/types';
import {
  createRendererCache,
  destroyRendererCache,
  RENDERERS,
  type RendererCache,
} from '@/components/dj/visualizers/renderers';

// The 6 WebGL modes (skip 'pattern' which is DJ-only)
const GL_MODES = VISUALIZER_MODES.filter((m) => m !== 'pattern') as Exclude<VisualizerMode, 'pattern'>[];

const EMPTY_WAVE = new Float32Array(256);
const EMPTY_FFT = new Float32Array(1024);
const EMPTY_AUDIO: AudioData = {
  waveform: EMPTY_WAVE, fft: EMPTY_FFT,
  rms: 0, peak: 0, bassEnergy: 0, midEnergy: 0, highEnergy: 0,
};

function getTrackerAudioData(): AudioData {
  try {
    const engine = getToneEngine();
    const waveform = engine.getWaveform();
    const fft = engine.getFFT();

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i];
      sumSq += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSq / waveform.length);

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

interface TrackerVisualBackgroundProps {
  width: number;
  height: number;
}

export const TrackerVisualBackground: React.FC<TrackerVisualBackgroundProps> = React.memo(({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const cacheRef = useRef<RendererCache | null>(null);
  const stateRef = useRef(createVisualizerState());
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(performance.now() / 1000);

  const modeIndex = useSettingsStore((s) => s.trackerVisualMode);
  const setTrackerVisualMode = useSettingsStore((s) => s.setTrackerVisualMode);

  // Use ref so RAF loop always reads current mode without restarting the effect
  const modeRef = useRef(GL_MODES[modeIndex % GL_MODES.length]);
  modeRef.current = GL_MODES[modeIndex % GL_MODES.length];

  const modeLabel = MODE_LABELS[modeRef.current];

  // Cycle mode on click
  const handleCycleMode = useCallback(() => {
    setTrackerVisualMode((modeIndex + 1) % GL_MODES.length);
  }, [modeIndex, setTrackerVisualMode]);

  // Single effect: connect analysers + WebGL init + RAF loop
  // Only restarts when canvas size changes (not on mode change — mode is read via ref)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    // Enable analysers — retry until engine is ready
    let analysersEnabled = false;
    const ensureAnalysers = () => {
      if (analysersEnabled) return;
      try {
        getToneEngine().enableAnalysers();
        analysersEnabled = true;
      } catch {
        // Engine not ready yet — will retry next frame
      }
    };
    ensureAnalysers();

    // Init WebGL context (reuse across mode changes)
    if (!glRef.current) {
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        premultipliedAlpha: false,
      });
      if (!gl) return;
      gl.getExtension('EXT_color_buffer_float');
      glRef.current = gl;
      cacheRef.current = createRendererCache(gl);
    }

    const gl = glRef.current;
    const cache = cacheRef.current!;
    const vizState = stateRef.current;
    let running = true;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const drawW = Math.round(width * dpr);
    const drawH = Math.round(height * dpr);

    // Set canvas size once (only changes when width/height props change)
    if (canvas.width !== drawW || canvas.height !== drawH) {
      canvas.width = drawW;
      canvas.height = drawH;
    }

    const frame = () => {
      if (!running) return;

      // Retry analyser connection if it failed on mount
      ensureAnalysers();

      gl.viewport(0, 0, drawW, drawH);

      const audio = getTrackerAudioData();
      const time = performance.now() / 1000 - startTimeRef.current;

      // Read current mode from ref (no effect restart needed)
      const currentMode = modeRef.current;
      const renderer = RENDERERS[currentMode];
      if (renderer) {
        renderer(cache, audio, vizState, time, drawW, drawH);
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      // Disconnect analysers
      try { getToneEngine().disableAnalysers(); } catch { /* ignore */ }
    };
  }, [width, height]);

  // Cleanup WebGL on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (cacheRef.current) {
        destroyRendererCache(cacheRef.current);
        cacheRef.current = null;
        glRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width,
          height,
          zIndex: 0,
          pointerEvents: 'none',
          opacity: 0.45,
        }}
      />
      {/* Mode label / cycle button */}
      <button
        onClick={handleCycleMode}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 3,
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 3,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 9,
          fontFamily: 'monospace',
          padding: '2px 6px',
          cursor: 'pointer',
          lineHeight: 1.2,
        }}
        title="Cycle visual mode"
      >
        {modeLabel}
      </button>
    </>
  );
});

TrackerVisualBackground.displayName = 'TrackerVisualBackground';
