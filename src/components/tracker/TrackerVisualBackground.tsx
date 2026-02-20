/**
 * TrackerVisualBackground — Audio-reactive visuals behind the pattern editor.
 *
 * Reuses the DJ view's 6 WebGL renderers (spectrum, radial, terrain, plasma,
 * starfield, particles) plus 2 audioMotion-analyzer presets, all rendered at
 * reduced opacity so pattern text remains readable.
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
  type WebGLVisualizerMode,
} from '@/components/dj/visualizers/types';
import {
  createRendererCache,
  destroyRendererCache,
  RENDERERS,
  type RendererCache,
} from '@/components/dj/visualizers/renderers';
import { AudioMotionVisualizer } from '@/components/visualization/AudioMotionVisualizer';

// Background mode = WebGL mode name or audioMotion preset key
type BgMode =
  | { type: 'webgl'; mode: WebGLVisualizerMode }
  | { type: 'am'; preset: string; label: string };

export const BG_MODES: BgMode[] = [
  // 6 WebGL modes (skip 'pattern' and audioMotion from VISUALIZER_MODES)
  ...VISUALIZER_MODES
    .filter((m): m is WebGLVisualizerMode => m !== 'pattern' && !m.startsWith('am'))
    .map((mode) => ({ type: 'webgl' as const, mode })),
  // audioMotion presets
  { type: 'am', preset: 'ledBars',         label: 'LED BARS' },
  { type: 'am', preset: 'smoothBars',      label: 'SMOOTH BARS' },
  { type: 'am', preset: 'mirrorBars',      label: 'MIRROR BARS' },
  { type: 'am', preset: 'graphLine',       label: 'GRAPH LINE' },
  { type: 'am', preset: 'radialSpectrum',  label: 'RADIAL SPIN' },
  { type: 'am', preset: 'radialGraph',     label: 'RADIAL GRAPH' },
  { type: 'am', preset: 'dualStereo',      label: 'DUAL STEREO' },
  { type: 'am', preset: 'lumiBars',        label: 'LUMI BARS' },
  { type: 'am', preset: 'alphaBars',       label: 'GHOST BARS' },
  { type: 'am', preset: 'outlineBars',     label: 'OUTLINE' },
  { type: 'am', preset: 'dualVertical',    label: 'DUAL VERTICAL' },
  { type: 'am', preset: 'dualOverlay',     label: 'DUAL OVERLAY' },
  { type: 'am', preset: 'barkSpectrum',    label: 'BARK' },
  { type: 'am', preset: 'melGraph',        label: 'MEL GRAPH' },
  { type: 'am', preset: 'octaveBands',     label: 'OCTAVE BANDS' },
  { type: 'am', preset: 'noteLabels',      label: 'NOTE LABELS' },
  { type: 'am', preset: 'mirrorReflex',    label: 'MIRROR REFLEX' },
  { type: 'am', preset: 'radialInvert',    label: 'RADIAL INVERT' },
  { type: 'am', preset: 'radialLED',       label: 'RADIAL LED' },
  { type: 'am', preset: 'linearBars',      label: 'LINEAR' },
  { type: 'am', preset: 'aWeighted',       label: 'A-WEIGHTED' },
  { type: 'am', preset: 'lumiMirror',      label: 'LUMI MIRROR' },
];

export function getBgModeLabel(bg: BgMode): string {
  if (bg.type === 'am') return bg.label;
  return MODE_LABELS[bg.mode] ?? bg.mode;
}

const EMPTY_WAVE = new Float32Array(256);
const EMPTY_FFT = new Float32Array(1024);
const EMPTY_AUDIO: AudioData = {
  waveform: EMPTY_WAVE, fft: EMPTY_FFT,
  rms: 0, peak: 0, bassEnergy: 0, midEnergy: 0, highEnergy: 0,
};

function getTrackerAudioData(): AudioData {
  try {
    const engine = getToneEngine();
    // Ensure analysers stay connected every frame — other viz components
    // can call disableAnalysers() on unmount, killing our connection.
    // The engine's method no-ops if already connected.
    engine.enableAnalysers();
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

  const currentBg = BG_MODES[modeIndex % BG_MODES.length];
  const isAMMode = currentBg.type === 'am';

  // Use ref so RAF loop always reads current mode without restarting the effect
  const modeRef = useRef(currentBg);
  modeRef.current = currentBg;

  const modeLabel = getBgModeLabel(currentBg);

  // Cycle mode on click
  const handleCycleMode = useCallback(() => {
    setTrackerVisualMode((modeIndex + 1) % BG_MODES.length);
  }, [modeIndex, setTrackerVisualMode]);

  // Single effect: connect analysers + WebGL init + RAF loop
  // Only restarts when canvas size changes (not on mode change — mode is read via ref)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

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

      // Skip WebGL rendering when in audioMotion mode
      const bg = modeRef.current;
      if (bg.type === 'webgl') {
        gl.viewport(0, 0, drawW, drawH);

        const audio = getTrackerAudioData();
        const time = performance.now() / 1000 - startTimeRef.current;

        const renderer = RENDERERS[bg.mode];
        if (renderer) {
          renderer(cache, audio, vizState, time, drawW, drawH);
        }
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
      {/* WebGL canvas — hidden when audioMotion mode is active */}
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
          display: isAMMode ? 'none' : 'block',
        }}
      />
      {/* audioMotion overlay — shown only for AM modes */}
      {isAMMode && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width,
            height,
            zIndex: 0,
            pointerEvents: 'none',
            opacity: 0.45,
          }}
        >
          <AudioMotionVisualizer
            preset={currentBg.type === 'am' ? currentBg.preset : 'ledBars'}
            audioSource="master"
          />
        </div>
      )}
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
