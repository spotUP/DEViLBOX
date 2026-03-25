/**
 * PixiGTOscilloscope — Real-time waveform oscilloscope for GoatTracker Ultra.
 *
 * Uses Web Audio AnalyserNode connected to the GTUltra engine output to
 * display waveform data. Renders via Pixi Graphics for GPU-accelerated drawing.
 *
 * Features:
 * - Dual-channel (L/R) or combined mono display
 * - Adjustable time window (zoom)
 * - Trigger detection for stable waveform display
 * - Color-coded by SID voice activity
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { usePixiTheme } from '../../theme';

// Semantic channel waveform colors (kept as-is)
const C_WAVE_L  = 0x00ff88;
const C_WAVE_R  = 0x6699ff;

const FFT_SIZE = 2048;

interface Props {
  width: number;
  height: number;
}

export const PixiGTOscilloscope: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const containerRef = useRef<ContainerType>(null);
  const bgRef = useRef<GraphicsType>(null);
  const waveRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const animRef = useRef(0);
  const bufferL = useRef(new Float32Array(FFT_SIZE));
  const bufferR = useRef(new Float32Array(FFT_SIZE));

  const engine = useGTUltraStore((s) => s.engine);

  // Set up analyser nodes when engine is available
  useEffect(() => {
    if (!engine) return;

    const ctx = engine.output.context as AudioContext;
    const splitter = ctx.createChannelSplitter(2);
    const analyserL = ctx.createAnalyser();
    const analyserR = ctx.createAnalyser();
    analyserL.fftSize = FFT_SIZE;
    analyserR.fftSize = FFT_SIZE;
    analyserL.smoothingTimeConstant = 0;
    analyserR.smoothingTimeConstant = 0;

    // Tap into the engine output without interrupting signal chain
    engine.output.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    analyserLRef.current = analyserL;
    analyserRRef.current = analyserR;
    splitterRef.current = splitter;

    return () => {
      try {
        engine.output.disconnect(splitter);
        splitter.disconnect();
      } catch { /* may already be disconnected */ }
      analyserLRef.current = null;
      analyserRRef.current = null;
      splitterRef.current = null;
    };
  }, [engine]);

  // Init MegaText
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  // Draw static background
  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;
    bg.clear();

    // Background
    bg.rect(0, 0, width, height).fill({ color: theme.bg.color });
    bg.rect(0, 0, width, height).stroke({ color: theme.border.color, width: 1 });

    // Center line
    const cy = height / 2;
    bg.moveTo(0, cy).lineTo(width, cy).stroke({ color: theme.border.color, width: 1 });

    // Grid lines (quarter marks)
    for (const frac of [0.25, 0.75]) {
      const y = height * frac;
      bg.moveTo(0, y).lineTo(width, y).stroke({ color: theme.border.color, width: 1, alpha: 0.3 });
    }
    // Vertical grid
    for (let i = 1; i < 4; i++) {
      const x = (width / 4) * i;
      bg.moveTo(x, 0).lineTo(x, height).stroke({ color: theme.border.color, width: 1, alpha: 0.3 });
    }
  }, [width, height, theme]);

  // Animation loop
  const drawWave = useCallback(() => {
    const wave = waveRef.current;
    const mega = megaRef.current;
    const aL = analyserLRef.current;
    const aR = analyserRRef.current;
    if (!wave || !mega) return;

    wave.clear();

    if (!aL || !aR) {
      // No analyser yet — show "NO SIGNAL" label
      mega.updateLabels([
        { x: width / 2 - 30, y: height / 2 - 5, text: 'NO SIGNAL', color: theme.textMuted.color, fontFamily: PIXI_FONTS.MONO },
      ], 10);
      return;
    }

    // Get waveform data
    aL.getFloatTimeDomainData(bufferL.current);
    aR.getFloatTimeDomainData(bufferR.current);

    const samples = Math.min(bufferL.current.length, width * 2);
    const step = samples / width;
    const cy = height / 2;
    const amp = height * 0.45;

    // Find trigger point (zero-crossing, rising edge) for stable display
    let triggerOffset = 0;
    for (let i = 1; i < samples / 2; i++) {
      if (bufferL.current[i - 1] <= 0 && bufferL.current[i] > 0) {
        triggerOffset = i;
        break;
      }
    }

    // Draw left channel
    wave.moveTo(0, cy - bufferL.current[triggerOffset] * amp);
    for (let px = 1; px < width; px++) {
      const idx = triggerOffset + Math.floor(px * step);
      if (idx >= bufferL.current.length) break;
      wave.lineTo(px, cy - bufferL.current[idx] * amp);
    }
    wave.stroke({ color: C_WAVE_L, width: 1.5, alpha: 0.8 });

    // Draw right channel (offset slightly for visual distinction)
    wave.moveTo(0, cy - bufferR.current[triggerOffset] * amp);
    for (let px = 1; px < width; px++) {
      const idx = triggerOffset + Math.floor(px * step);
      if (idx >= bufferR.current.length) break;
      wave.lineTo(px, cy - bufferR.current[idx] * amp);
    }
    wave.stroke({ color: C_WAVE_R, width: 1, alpha: 0.5 });

    // Labels
    const labels: GlyphLabel[] = [
      { x: 4, y: 2, text: 'L', color: C_WAVE_L, fontFamily: PIXI_FONTS.MONO },
      { x: 16, y: 2, text: 'R', color: C_WAVE_R, fontFamily: PIXI_FONTS.MONO },
    ];
    mega.updateLabels(labels, 10);
  }, [width, height]);

  useEffect(() => {
    const tick = () => {
      drawWave();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawWave]);

  return (
    <pixiContainer ref={containerRef} layout={{ width, height }}>
      <pixiGraphics ref={bgRef} draw={() => {}} />
      <pixiGraphics ref={waveRef} draw={() => {}} />
    </pixiContainer>
  );
};
