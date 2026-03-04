/**
 * PixiTrackerVisualBg — Pure Pixi.js replacement for the PixiDOMOverlay + TrackerVisualBackground
 * pattern. Renders audio-reactive visualizations as a Pixi Sprite (no DOM overlays).
 *
 * WebGL modes render to an offscreen canvas → copied to a 2D display canvas → Pixi texture.
 * AudioMotion modes render via a hidden DOM container → captured to the same texture.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Texture } from 'pixi.js';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTick } from '@pixi/react';
import { useSettingsStore } from '@stores/useSettingsStore';
import { getToneEngine } from '@engine/ToneEngine';
import {
  createVisualizerState,
  type AudioData,
} from '@/components/dj/visualizers/types';
import {
  createRendererCache,
  destroyRendererCache,
  RENDERERS,
  type RendererCache,
} from '@/components/dj/visualizers/renderers';
import { BG_MODES, getBgModeLabel } from '@/components/tracker/TrackerVisualBackground';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { AUDIOMOTION_PRESETS } from '@/components/visualization/audioMotionPresets';
import { getDevilboxAudioContext, getNativeAudioNode } from '@/utils/audio-context';
import { PIXI_FONTS } from '../../fonts';

// ── Audio data helper (same logic as TrackerVisualBackground) ────────────────

const EMPTY_WAVE = new Float32Array(256);
const EMPTY_FFT = new Float32Array(1024);
const EMPTY_AUDIO: AudioData = {
  waveform: EMPTY_WAVE, fft: EMPTY_FFT,
  rms: 0, peak: 0, bassEnergy: 0, midEnergy: 0, highEnergy: 0,
};

function getTrackerAudioData(): AudioData {
  try {
    const engine = getToneEngine();
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
      waveform, fft, rms, peak,
      bassEnergy: bassSum / bassEnd,
      midEnergy: midSum / (midEnd - bassEnd),
      highEnergy: highSum / (fft.length - midEnd),
    };
  } catch {
    return EMPTY_AUDIO;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface PixiTrackerVisualBgProps {
  width: number;
  height: number;
}

export const PixiTrackerVisualBg: React.FC<PixiTrackerVisualBgProps> = React.memo(({ width, height }) => {
  // Offscreen rendering refs
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const cacheRef = useRef<RendererCache | null>(null);
  const vizStateRef = useRef(createVisualizerState());
  const startTimeRef = useRef(performance.now() / 1000);
  const textureRef = useRef<Texture | null>(null);
  const [texReady, setTexReady] = useState(0);

  // AudioMotion refs
  const amContainerRef = useRef<HTMLDivElement | null>(null);
  const amAnalyzerRef = useRef<AudioMotionAnalyzer | null>(null);

  // Settings
  const modeIndex = useSettingsStore(s => s.trackerVisualMode);
  const setTrackerVisualMode = useSettingsStore(s => s.setTrackerVisualMode);
  const currentBg = BG_MODES[modeIndex % BG_MODES.length];
  const modeRef = useRef(currentBg);
  modeRef.current = currentBg;

  const dpr = Math.min(window.devicePixelRatio, 2);
  const drawW = Math.round(width * dpr);
  const drawH = Math.round(height * dpr);

  // ── Init offscreen canvases & Pixi texture ──────────────────────────────

  useEffect(() => {
    if (width <= 0 || height <= 0) return;

    // 2D display canvas (single texture source for Pixi)
    if (!displayCanvasRef.current) {
      displayCanvasRef.current = document.createElement('canvas');
    }
    const dc = displayCanvasRef.current;
    dc.width = drawW;
    dc.height = drawH;
    displayCtxRef.current = dc.getContext('2d')!;

    // WebGL2 canvas for visualizer shaders
    if (!glCanvasRef.current) {
      glCanvasRef.current = document.createElement('canvas');
    }
    const glCanvas = glCanvasRef.current;
    glCanvas.width = drawW;
    glCanvas.height = drawH;

    if (!glRef.current) {
      const gl = glCanvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
      if (gl) {
        gl.getExtension('EXT_color_buffer_float');
        glRef.current = gl;
        cacheRef.current = createRendererCache(gl);
      }
    }

    // Create Pixi texture from 2D canvas (once)
    if (!textureRef.current) {
      textureRef.current = Texture.from(dc, true);
      setTexReady(v => v + 1);
    } else {
      textureRef.current.source.update();
    }
  }, [width, height, drawW, drawH]);

  // ── AudioMotion setup for AM modes ──────────────────────────────────────

  useEffect(() => {
    const bg = BG_MODES[modeIndex % BG_MODES.length];
    if (bg.type !== 'am') {
      if (amAnalyzerRef.current) {
        try { amAnalyzerRef.current.destroy(); } catch { /* ignore */ }
        amAnalyzerRef.current = null;
      }
      return;
    }

    if (!amContainerRef.current) {
      const div = document.createElement('div');
      div.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;`;
      document.body.appendChild(div);
      amContainerRef.current = div;
    } else {
      amContainerRef.current.style.width = `${width}px`;
      amContainerRef.current.style.height = `${height}px`;
    }

    const presetOptions = AUDIOMOTION_PRESETS[bg.preset] ?? AUDIOMOTION_PRESETS.ledBars;
    if (amAnalyzerRef.current && !amAnalyzerRef.current.isDestroyed) {
      amAnalyzerRef.current.setOptions(presetOptions);
      return;
    }

    let audioCtx: AudioContext;
    try { audioCtx = getDevilboxAudioContext(); } catch { return; }

    const analyzer = new AudioMotionAnalyzer(amContainerRef.current, {
      audioCtx,
      connectSpeakers: false,
      overlay: true,
      ...presetOptions,
    });

    try {
      const engine = getToneEngine();
      engine.enableAnalysers();
      const nativeNode = getNativeAudioNode(engine.masterChannel);
      if (nativeNode) analyzer.connectInput(nativeNode);
    } catch { /* ignore */ }

    amAnalyzerRef.current = analyzer;
  }, [modeIndex, width, height]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (cacheRef.current) {
        destroyRendererCache(cacheRef.current);
        cacheRef.current = null;
        glRef.current = null;
      }
      if (amAnalyzerRef.current) {
        try { amAnalyzerRef.current.destroy(); } catch { /* ignore */ }
        amAnalyzerRef.current = null;
      }
      if (amContainerRef.current) {
        document.body.removeChild(amContainerRef.current);
        amContainerRef.current = null;
      }
      if (textureRef.current) {
        textureRef.current.destroy(true);
        textureRef.current = null;
      }
      try { getToneEngine().disableAnalysers(); } catch { /* ignore */ }
    };
  }, []);

  // ── Per-frame rendering ─────────────────────────────────────────────────

  useTick(() => {
    const ctx = displayCtxRef.current;
    const texture = textureRef.current;
    if (!ctx || !texture || width <= 0 || height <= 0) return;

    const bg = modeRef.current;

    if (bg.type === 'webgl') {
      const gl = glRef.current;
      const cache = cacheRef.current;
      if (!gl || !cache) return;

      gl.viewport(0, 0, drawW, drawH);
      const audio = getTrackerAudioData();
      const time = performance.now() / 1000 - startTimeRef.current;
      const renderer = RENDERERS[bg.mode];
      if (renderer) {
        renderer(cache, audio, vizStateRef.current, time, drawW, drawH);
      }
      ctx.clearRect(0, 0, drawW, drawH);
      ctx.drawImage(glCanvasRef.current!, 0, 0);
    } else if (bg.type === 'am') {
      const analyzer = amAnalyzerRef.current;
      if (analyzer && !analyzer.isDestroyed) {
        ctx.clearRect(0, 0, drawW, drawH);
        ctx.drawImage(analyzer.canvas, 0, 0, drawW, drawH);
      }
    }

    texture.source.update();
  });

  // ── Button ──────────────────────────────────────────────────────────────

  const handleCycleMode = useCallback(() => {
    setTrackerVisualMode((modeIndex + 1) % BG_MODES.length);
  }, [modeIndex, setTrackerVisualMode]);

  const modeLabel = getBgModeLabel(currentBg);
  const buttonW = modeLabel.length * 5.4 + 12;

  const drawButtonBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, buttonW, 16, 3);
    g.fill({ color: 0x000000, alpha: 0.6 });
    g.stroke({ color: 0xffffff, alpha: 0.15, width: 1 });
  }, [buttonW]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (width <= 0 || height <= 0 || !textureRef.current) return null;

  // Suppress unused-var lint for texReady (used only to trigger re-render)
  void texReady;

  return (
    <pixiContainer layout={{ position: 'absolute', width, height, left: 0, top: 0 }}>
      <pixiSprite
        texture={textureRef.current}
        x={0}
        y={0}
        width={width}
        height={height}
        alpha={0.45}
      />

      {/* Mode cycle button */}
      <pixiContainer
        x={width - buttonW - 4}
        y={4}
        eventMode="static"
        cursor="pointer"
        onPointerTap={handleCycleMode}
      >
        <pixiGraphics draw={drawButtonBg} />
        <pixiBitmapText
          text={modeLabel}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          alpha={0.5}
          x={6}
          y={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
});

PixiTrackerVisualBg.displayName = 'PixiTrackerVisualBg';
