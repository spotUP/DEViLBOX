/**
 * PixiSc68View — Full-screen visualizer for SC68/SNDH (Atari ST) playback.
 *
 * SC68 files contain opaque 68000 machine code driving the YM2149 chip.
 * There is no pattern data to display, so we show a multi-mode visualizer
 * with song metadata overlay instead.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Metadata bar (title, composer, format)           │
 * ├──────────────────────────────────────────────────┤
 * │                                                  │
 * │          Full-area visualizer                    │
 * │   (waveform / spectrum / vectorscope / bars)     │
 * │                                                  │
 * └──────────────────────────────────────────────────┘
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { getToneEngine } from '@engine/ToneEngine';

// ── Constants ────────────────────────────────────────────────────────────────

const HEADER_H = 28;
const PEAK_DECAY = 0.015;

type VizMode = 'waveform' | 'spectrum' | 'vectorscope' | 'stereo' | 'bars';
const VIZ_MODES: VizMode[] = ['waveform', 'spectrum', 'vectorscope', 'stereo', 'bars'];
const VIZ_LABELS: Record<VizMode, string> = {
  waveform: 'WAVEFORM',
  spectrum: 'SPECTRUM',
  vectorscope: 'VECTORSCOPE',
  stereo: 'STEREO FIELD',
  bars: 'FREQUENCY BARS',
};

// YM2149 color palette — Atari ST inspired
const YM_GREEN = 0x00cc55;
const YM_CYAN = 0x44ddcc;
const YM_AMBER = 0xddaa33;
const YM_BG = 0x0a0e12;
const YM_GRID = 0x1a2030;
const YM_GRID_LIGHT = 0x253040;

// ── Drawing helpers ──────────────────────────────────────────────────────────

function drawBackground(g: GraphicsType, w: number, h: number) {
  g.rect(0, 0, w, h).fill({ color: YM_BG });

  // Subtle grid lines
  const gridSpacingX = 40;
  const gridSpacingY = 30;
  for (let x = gridSpacingX; x < w; x += gridSpacingX) {
    g.moveTo(x, 0).lineTo(x, h).stroke({ color: YM_GRID, width: 1, alpha: 0.3 });
  }
  for (let y = gridSpacingY; y < h; y += gridSpacingY) {
    g.moveTo(0, y).lineTo(w, y).stroke({ color: YM_GRID, width: 1, alpha: 0.3 });
  }
}

function drawWaveform(g: GraphicsType, waveform: Float32Array | null, w: number, h: number) {
  if (!waveform || waveform.length === 0) return;

  const midY = h / 2;
  const amp = h * 0.4;

  // Center line
  g.moveTo(0, midY).lineTo(w, midY).stroke({ color: YM_GRID_LIGHT, width: 1, alpha: 0.4 });

  // Glow pass (thicker, dimmer)
  g.moveTo(0, midY);
  // step not needed — we index directly via x * waveform.length / w
  for (let x = 0; x < w; x++) {
    const idx = Math.min(Math.floor(x * waveform.length / w), waveform.length - 1);
    const y = midY - waveform[idx] * amp;
    g.lineTo(x, y);
  }
  g.stroke({ color: YM_GREEN, width: 3, alpha: 0.15 });

  // Main waveform
  g.moveTo(0, midY);
  for (let x = 0; x < w; x++) {
    const idx = Math.min(Math.floor(x * waveform.length / w), waveform.length - 1);
    const y = midY - waveform[idx] * amp;
    g.lineTo(x, y);
  }
  g.stroke({ color: YM_GREEN, width: 1.5, alpha: 0.9 });
}

function drawSpectrum(g: GraphicsType, fft: Float32Array | null, w: number, h: number, peaks: Float32Array) {
  if (!fft || fft.length === 0) return;

  const barCount = Math.min(64, fft.length);
  const barW = Math.max(2, (w - barCount) / barCount);
  const gap = 1;

  for (let i = 0; i < barCount; i++) {
    // FFT data is in dB, typically -100 to 0
    const db = fft[i] ?? -100;
    const norm = Math.max(0, Math.min(1, (db + 100) / 80));
    const barH = norm * h * 0.85;
    const x = i * (barW + gap);
    const y = h - barH;

    // Color gradient from green to amber to cyan based on frequency
    const t = i / barCount;
    let color: number;
    if (t < 0.33) color = YM_GREEN;
    else if (t < 0.66) color = YM_AMBER;
    else color = YM_CYAN;

    // Bar
    g.rect(x, y, barW, barH).fill({ color, alpha: 0.7 });

    // Peak hold
    if (norm > peaks[i]) peaks[i] = norm;
    else peaks[i] = Math.max(0, peaks[i] - PEAK_DECAY);

    const peakY = h - peaks[i] * h * 0.85;
    g.rect(x, peakY, barW, 2).fill({ color: 0xffffff, alpha: 0.6 });
  }
}

function drawVectorscope(g: GraphicsType, waveform: Float32Array | null, w: number, h: number) {
  if (!waveform || waveform.length < 4) return;

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.4;

  // Cross-hair
  g.moveTo(cx - radius, cy).lineTo(cx + radius, cy).stroke({ color: YM_GRID_LIGHT, width: 1, alpha: 0.3 });
  g.moveTo(cx, cy - radius).lineTo(cx, cy + radius).stroke({ color: YM_GRID_LIGHT, width: 1, alpha: 0.3 });
  g.circle(cx, cy, radius).stroke({ color: YM_GRID_LIGHT, width: 1, alpha: 0.2 });

  // Plot L/R as X/Y (interleaved stereo or split)
  const half = Math.floor(waveform.length / 2);
  for (let i = 0; i < half; i += 2) {
    const l = waveform[i] ?? 0;
    const r = waveform[i + 1] ?? waveform[Math.min(i + half, waveform.length - 1)] ?? 0;
    const x = cx + l * radius;
    const y = cy - r * radius;
    const alpha = 0.3 + Math.abs(l + r) * 0.4;
    g.circle(x, y, 1).fill({ color: YM_CYAN, alpha: Math.min(0.8, alpha) });
  }
}

function drawStereoField(g: GraphicsType, waveform: Float32Array | null, w: number, h: number) {
  if (!waveform || waveform.length < 4) return;

  const midX = w / 2;
  const midY = h / 2;
  const scaleX = w * 0.4;
  const scaleY = h * 0.4;

  // Grid
  g.moveTo(midX, 0).lineTo(midX, h).stroke({ color: YM_GRID_LIGHT, width: 1, alpha: 0.3 });
  g.moveTo(0, midY).lineTo(w, midY).stroke({ color: YM_GRID_LIGHT, width: 1, alpha: 0.3 });

  // L/R labels
  const half = Math.floor(waveform.length / 2);
  const step = Math.max(1, Math.floor(half / 512));
  for (let i = 0; i < half - 1; i += step) {
    const l = waveform[i] ?? 0;
    const r = waveform[i + 1] ?? waveform[Math.min(i + half, waveform.length - 1)] ?? 0;
    // Mid/Side transform
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    const x = midX + side * scaleX;
    const y = midY - mid * scaleY;
    g.circle(x, y, 1.2).fill({ color: YM_AMBER, alpha: 0.4 });
  }
}

function drawBars(g: GraphicsType, fft: Float32Array | null, w: number, h: number, peaks: Float32Array) {
  if (!fft || fft.length === 0) return;

  // Wider bars with mirror effect
  const barCount = Math.min(32, fft.length);
  const barW = Math.max(4, (w - barCount * 2) / barCount);
  const gap = 2;
  const midY = h / 2;

  for (let i = 0; i < barCount; i++) {
    const db = fft[i] ?? -100;
    const norm = Math.max(0, Math.min(1, (db + 100) / 75));
    const barH = norm * midY * 0.9;
    const x = i * (barW + gap) + (w - barCount * (barW + gap)) / 2;

    // Color based on band
    const t = i / barCount;
    let color: number;
    if (t < 0.25) color = YM_GREEN;
    else if (t < 0.5) color = YM_CYAN;
    else if (t < 0.75) color = YM_AMBER;
    else color = 0xff6644;

    // Top half (mirrored upward)
    g.rect(x, midY - barH, barW, barH).fill({ color, alpha: 0.75 });
    // Bottom half (mirrored downward, dimmer)
    g.rect(x, midY, barW, barH * 0.6).fill({ color, alpha: 0.3 });

    // Peak
    if (norm > peaks[i]) peaks[i] = norm;
    else peaks[i] = Math.max(0, peaks[i] - PEAK_DECAY);

    const peakY = midY - peaks[i] * midY * 0.9;
    g.rect(x, peakY, barW, 2).fill({ color: 0xffffff, alpha: 0.5 });
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  width: number;
  height: number;
}

// Stable layout objects to avoid Yoga BindingErrors from inline object literals
const LAYOUT_HEADER: Record<string, unknown> = {
  width: '100%', height: HEADER_H,
  flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 8, gap: 12,
};
const LAYOUT_FLEX1: Record<string, unknown> = { flex: 1 };
const LAYOUT_MODE_BTN: Record<string, unknown> = {};

export const PixiSc68View: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);
  const songName = useTrackerStore(s => (s as unknown as Record<string, string>).songName);
  const [mode, setMode] = useState<VizMode>('waveform');
  const graphicsRef = useRef<GraphicsType | null>(null);
  const peakHoldsRef = useRef(new Float32Array(64));

  // Parse song name for metadata display (format: "Title — Composer [Format]")
  const { title, composer, format } = useMemo(() => {
    if (!songName) return { title: 'SC68', composer: '', format: 'SNDH' };
    const bracketMatch = songName.match(/\[([^\]]+)\]$/);
    const fmt = bracketMatch ? bracketMatch[1] : 'SNDH';
    const withoutBracket = bracketMatch ? songName.slice(0, bracketMatch.index).trim() : songName;
    const dashIdx = withoutBracket.indexOf(' \u2014 ');
    if (dashIdx >= 0) {
      return { title: withoutBracket.slice(0, dashIdx), composer: withoutBracket.slice(dashIdx + 3), format: fmt };
    }
    return { title: withoutBracket, format: fmt, composer: '' };
  }, [songName]);

  const cycleMode = useCallback(() => {
    setMode(prev => {
      const idx = VIZ_MODES.indexOf(prev);
      return VIZ_MODES[(idx + 1) % VIZ_MODES.length];
    });
  }, []);

  const vizH = height - HEADER_H;

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !graphicsRef.current) return;

    try { getToneEngine().enableAnalysers(); } catch { /* not ready */ }

    let rafId: number;
    const peaks = peakHoldsRef.current;

    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;

      g.clear();
      drawBackground(g, width, vizH);

      try {
        const engine = getToneEngine();
        switch (mode) {
          case 'waveform':
            drawWaveform(g, engine.getWaveform(), width, vizH);
            break;
          case 'spectrum':
            drawSpectrum(g, engine.getFFT(), width, vizH, peaks);
            break;
          case 'vectorscope':
            drawVectorscope(g, engine.getWaveform(), width, vizH);
            break;
          case 'stereo':
            drawStereoField(g, engine.getWaveform(), width, vizH);
            break;
          case 'bars':
            drawBars(g, engine.getFFT(), width, vizH, peaks);
            break;
        }
      } catch {
        // Engine not ready
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, mode, width, vizH]);

  // Static draw when stopped
  const drawStatic = useCallback((g: GraphicsType) => {
    g.clear();
    drawBackground(g, width, vizH);
  }, [width, vizH]);

  // Stable layout objects that depend on dimensions
  const layoutContainer = useMemo(
    () => ({ width, height, flexDirection: 'column' as const }),
    [width, height],
  );
  const layoutViz = useMemo(
    () => ({ position: 'absolute' as const, width, height: vizH }),
    [width, vizH],
  );
  const layoutVizContainer = useMemo(
    () => ({ flex: 1, width: '100%' as const }),
    [],
  );
  const layoutStoppedLabel = useMemo(
    () => ({ position: 'absolute' as const, width, height: vizH, justifyContent: 'center' as const, alignItems: 'center' as const }),
    [width, vizH],
  );
  const layoutStoppedCollapsed = useMemo(
    () => ({ position: 'absolute' as const, width: 0, height: 0 }),
    [],
  );

  return (
    <pixiContainer layout={layoutContainer}>
      {/* Header bar */}
      <pixiContainer layout={LAYOUT_HEADER}>
        {/* Chip badge */}
        <pixiBitmapText
          text="YM2149"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={YM_GREEN}
        />

        {/* Title */}
        <pixiBitmapText
          text={title}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={0xdddddd}
        />

        {/* Composer */}
        <pixiBitmapText
          text={composer || ''}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={YM_AMBER}
          alpha={composer ? 1 : 0}
        />

        <pixiContainer layout={LAYOUT_FLEX1} />

        {/* Format badge */}
        <pixiBitmapText
          text={format}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={YM_CYAN}
        />

        {/* Viz mode button */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={cycleMode}
          layout={LAYOUT_MODE_BTN}
        >
          <pixiBitmapText
            text={VIZ_LABELS[mode]}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={theme.textMuted.color}
          />
        </pixiContainer>
      </pixiContainer>

      {/* Visualizer area */}
      <pixiContainer
        eventMode="static"
        cursor="pointer"
        onPointerUp={cycleMode}
        layout={layoutVizContainer}
      >
        <pixiGraphics
          ref={graphicsRef}
          draw={isPlaying ? () => {} : drawStatic}
          layout={layoutViz}
        />

        {/* Centered label when stopped — always mounted, toggle alpha to avoid Yoga BindingErrors */}
        <pixiContainer
          alpha={isPlaying ? 0 : 1}
          layout={isPlaying ? layoutStoppedCollapsed : layoutStoppedLabel}
        >
          <pixiBitmapText
            text="ATARI ST - SC68/SNDH PLAYER"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
            tint={0x445566}
          />
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};
