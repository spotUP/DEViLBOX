/**
 * PixiVisualizer — Multi-mode GPU visualizer for WebGL mode.
 * Three modes toggled by click: Waveform, Spectrum, Vectorscope.
 * Uses Pixi Graphics for GPU-accelerated rendering via app.ticker.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme, type PixiTheme } from '../../theme';
import { useTransportStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

type VizMode = 'waveform' | 'spectrum' | 'vectorscope' | 'channels' | 'stereo' | 'freqbars' | 'levels' | 'particles' | 'mirror' | 'radial' | 'energy' | 'logo' | 'banner';
const VIZ_MODES: VizMode[] = ['waveform', 'spectrum', 'vectorscope', 'channels', 'stereo', 'freqbars', 'levels', 'particles', 'mirror', 'radial', 'energy', 'logo', 'banner'];
const VIZ_MODE_LABELS: Record<VizMode, string> = {
  waveform: 'WAVE',
  spectrum: 'SPECTRUM',
  vectorscope: 'SCOPE',
  channels: 'CH-OSC',
  stereo: 'STEREO',
  freqbars: 'BARS',
  levels: 'LEVELS',
  particles: 'PARTICLES',
  mirror: 'MIRROR',
  radial: 'RADIAL',
  energy: 'ENERGY',
  logo: 'LOGO',
  banner: 'BANNER',
};

interface PixiVisualizerProps {
  width?: number;
  height?: number;
}

const PEAK_DECAY = 0.02;

// Stable module-level layout objects — inline literals create new references every render,
// which causes Yoga WASM "Expected null or instance of Node" BindingErrors.
const LAYOUT_MODE_LABEL: Record<string, unknown> = {};
const LAYOUT_MODE_LABEL_COLLAPSED: Record<string, unknown> = { width: 0, height: 0 };
const LAYOUT_MODE_INDICATOR: Record<string, unknown> = { position: 'absolute', right: 4, bottom: 2 };
const LAYOUT_MODE_INDICATOR_COLLAPSED: Record<string, unknown> = { position: 'absolute', width: 0, height: 0 };
// Logo/banner overlay text — visible only in logo/banner modes
const LAYOUT_OVERLAY_LABEL: Record<string, unknown> = { position: 'absolute' };
const LAYOUT_OVERLAY_COLLAPSED: Record<string, unknown> = { position: 'absolute', width: 0, height: 0 };

export const PixiVisualizer: React.FC<PixiVisualizerProps> = ({
  width = 160,
  height = 64,
}) => {
  const theme = usePixiTheme();
  const [mode, setMode] = useState<VizMode>('waveform');
  const graphicsRef = useRef<GraphicsType | null>(null);
  const peakHoldsRef = useRef(new Float32Array(64));
  const particlesRef = useRef<ParticleState[]>([]);
  const isPlaying = useTransportStore(s => s.isPlaying);

  const handleClick = useCallback(() => {
    setMode(prev => {
      const idx = VIZ_MODES.indexOf(prev);
      return VIZ_MODES[(idx + 1) % VIZ_MODES.length];
    });
  }, []);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !graphicsRef.current) return;

    // Connect analyser nodes so getWaveform()/getFFT() return real data
    try {
      getToneEngine().enableAnalysers();
    } catch {
      // Engine not ready yet — will try again on next effect
    }

    let rafId: number;
    const peaks = peakHoldsRef.current;
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;

      g.clear();
      drawBackground(g, width, height, theme);

      try {
        const engine = getToneEngine();
        switch (mode) {
          case 'waveform':
            drawWaveform(g, engine.getWaveform(), width, height, theme);
            break;
          case 'spectrum':
            drawSpectrum(g, engine.getFFT(), width, height, theme, peaks);
            break;
          case 'vectorscope':
            drawVectorscope(g, engine.getWaveform(), width, height, theme);
            break;
          case 'channels':
            drawChannelOscilloscopes(g, engine.getWaveform(), width, height, theme);
            break;
          case 'stereo':
            drawStereoField(g, engine.getWaveform(), width, height, theme);
            break;
          case 'freqbars':
            drawFrequencyBars(g, engine.getFFT(), width, height, theme, peaks);
            break;
          case 'levels':
            drawChannelLevels(g, engine.getWaveform(), width, height, theme);
            break;
          case 'particles':
            drawParticles(g, engine.getWaveform(), width, height, theme, particlesRef.current);
            break;
          case 'mirror':
            drawMirrorWave(g, engine.getWaveform(), width, height, theme);
            break;
          case 'radial':
            drawRadialSpectrum(g, engine.getFFT(), width, height, theme);
            break;
          case 'energy':
            drawEnergyBurst(g, engine.getWaveform(), engine.getFFT(), width, height, theme);
            break;
          case 'logo':
            drawLogoBackground(g, engine.getWaveform(), width, height, theme);
            break;
          case 'banner':
            drawBannerBackground(g, engine.getWaveform(), width, height, theme);
            break;
        }
      } catch (e) {
        // Engine not ready — only log unexpected errors
        if (e instanceof Error && !e.message.includes('not ready') && !e.message.includes('disposed')) {
          console.warn('[Visualizer]', e.message);
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, mode, width, height, theme]);

  // Memoized layout objects for prop-dependent values (width/height change infrequently)
  const layoutContainer = useMemo(
    () => ({ width, height, justifyContent: 'center' as const, alignItems: 'center' as const }),
    [width, height]
  );
  const layoutFill = useMemo(
    () => ({ position: 'absolute' as const, width, height }),
    [width, height]
  );

  // Static display when not playing
  const drawStatic = useCallback((g: GraphicsType) => {
    g.clear();
    drawBackground(g, width, height, theme);
  }, [width, height, theme]);

  // Keep the Pixi/Yoga tree structure STABLE across isPlaying changes.
  // Conditional rendering (ternary / &&) swaps entire subtrees, which creates
  // fresh Yoga nodes that mismatch existing ones → BindingError.
  // Instead: always render all elements, toggle via `visible` + collapsed layout.
  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={handleClick}
      layout={layoutContainer}
    >
      {/* Single graphics element — drawStatic when paused, animation loop drives it when playing */}
      <pixiGraphics
        ref={graphicsRef}
        draw={isPlaying ? () => {} : drawStatic}
        layout={layoutFill}
      />

      {/* Centered mode label — visible when stopped, collapsed when playing */}
      <pixiBitmapText
        text={VIZ_MODE_LABELS[mode]}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={isPlaying ? LAYOUT_MODE_LABEL_COLLAPSED : LAYOUT_MODE_LABEL}
        alpha={!isPlaying ? 1 : 0}
      />

      {/* Bottom-right mode indicator — visible when playing, collapsed when stopped */}
      <pixiBitmapText
        text={VIZ_MODE_LABELS[mode]}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={isPlaying ? LAYOUT_MODE_INDICATOR : LAYOUT_MODE_INDICATOR_COLLAPSED}
        alpha={isPlaying ? 0.5 : 0}
      />

      {/* Logo mode overlay — large DEViLBOX text, energy-reactive alpha */}
      <pixiBitmapText
        text="DEViLBOX"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 20, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={mode === 'logo' ? LAYOUT_OVERLAY_LABEL : LAYOUT_OVERLAY_COLLAPSED}
        alpha={mode === 'logo' ? 1 : 0}
      />

      {/* Banner mode overlay — mode label as large banner text */}
      <pixiBitmapText
        text="★ DEViLBOX ★"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
        tint={theme.accentSecondary.color}
        layout={mode === 'banner' ? LAYOUT_OVERLAY_LABEL : LAYOUT_OVERLAY_COLLAPSED}
        alpha={mode === 'banner' ? 0.9 : 0}
      />
    </pixiContainer>
  );
};

// ─── Drawing helpers ─────────────────────────────────────────────────────────

function drawBackground(g: GraphicsType, w: number, h: number, theme: PixiTheme) {
  // Pure black background so the visualizer stands out from the toolbar rows
  g.roundRect(0, 0, w, h, 4);
  g.fill({ color: theme.bg.color });
  g.roundRect(0, 0, w, h, 4);
  g.stroke({ color: theme.border.color, alpha: 0.6, width: 1 });
}

function drawWaveform(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;

  const midY = h / 2;
  const padX = 4;
  const drawW = w - padX * 2;
  const step = data.length / drawW;

  // Draw center line
  g.moveTo(padX, midY);
  g.lineTo(w - padX, midY);
  g.stroke({ color: theme.border.color, alpha: 0.2, width: 1 });

  // Draw waveform
  g.moveTo(padX, midY + data[0] * (h / 2 - 4));
  for (let i = 1; i < drawW; i++) {
    const sampleIdx = Math.floor(i * step);
    const val = data[sampleIdx] ?? 0;
    const y = midY + val * (h / 2 - 4);
    g.lineTo(padX + i, y);
  }
  g.stroke({ color: theme.accent.color, alpha: 0.9, width: 1.5 });

  // Glow effect — draw again slightly wider and more transparent
  g.moveTo(padX, midY + data[0] * (h / 2 - 4));
  for (let i = 1; i < drawW; i++) {
    const sampleIdx = Math.floor(i * step);
    const val = data[sampleIdx] ?? 0;
    const y = midY + val * (h / 2 - 4);
    g.lineTo(padX + i, y);
  }
  g.stroke({ color: theme.accent.color, alpha: 0.2, width: 4 });
}

function drawSpectrum(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme, peakHolds: Float32Array) {
  if (!data || data.length === 0) return;

  const barCount = 48;
  const padX = 4;
  const padY = 4;
  const drawW = w - padX * 2;
  const drawH = h - padY * 2;
  const barWidth = drawW / barCount;
  const step = Math.floor(data.length / barCount);

  for (let i = 0; i < barCount; i++) {
    // Average FFT bins for this bar
    let sum = 0;
    for (let j = 0; j < step; j++) {
      sum += data[i * step + j] ?? -100;
    }
    const db = sum / step;
    const normalized = Math.max(0, Math.min(1, (db + 100) / 100));
    const barH = normalized * drawH;

    // Update peak hold
    if (normalized > peakHolds[i]) {
      peakHolds[i] = normalized;
    } else {
      peakHolds[i] = Math.max(0, peakHolds[i] - PEAK_DECAY);
    }

    if (barH > 0.5) {
      const x = padX + i * barWidth;
      const y = h - padY - barH;

      // Gradient effect: hue shifts from accent to warning at high levels
      const alpha = 0.4 + normalized * 0.6;
      const color = normalized > 0.8 ? theme.warning.color : theme.accent.color;

      g.rect(x, y, barWidth - 1, barH);
      g.fill({ color, alpha });
    }

    // Peak hold line
    const peakY = h - padY - peakHolds[i] * drawH;
    if (peakHolds[i] > 0.02) {
      g.rect(padX + i * barWidth, peakY, barWidth - 1, 1);
      g.fill({ color: theme.accentSecondary.color, alpha: 0.8 });
    }
  }
}

function drawVectorscope(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length < 2) return;

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 6;

  // Draw crosshairs
  g.moveTo(cx, cy - radius);
  g.lineTo(cx, cy + radius);
  g.stroke({ color: theme.border.color, alpha: 0.15, width: 1 });
  g.moveTo(cx - radius, cy);
  g.lineTo(cx + radius, cy);
  g.stroke({ color: theme.border.color, alpha: 0.15, width: 1 });

  // Draw circle guide
  g.circle(cx, cy, radius);
  g.stroke({ color: theme.border.color, alpha: 0.1, width: 1 });

  // Time-delay Lissajous — use sample[i] vs sample[i+offset] to create
  // proper circular/spiral patterns even with mono analyser data.
  // Offset ~1/4 buffer creates ~90° phase shift → circular figures.
  const offset = Math.floor(data.length / 4);
  const sampleCount = Math.min(512, data.length - offset);
  const step = Math.max(1, Math.floor((data.length - offset) / sampleCount));

  // Draw as connected line for smoother appearance
  let started = false;
  for (let i = 0; i < sampleCount; i++) {
    const idx = i * step;
    const a = data[idx] ?? 0;
    const b = data[idx + offset] ?? 0;
    const x = cx + a * radius * 0.8;
    const y = cy - b * radius * 0.8;
    if (!started) { g.moveTo(x, y); started = true; } else { g.lineTo(x, y); }
  }
  g.stroke({ color: theme.accent.color, alpha: 0.7, width: 1.5 });

  // Glow pass
  started = false;
  for (let i = 0; i < sampleCount; i++) {
    const idx = i * step;
    const a = data[idx] ?? 0;
    const b = data[idx + offset] ?? 0;
    const x = cx + a * radius * 0.8;
    const y = cy - b * radius * 0.8;
    if (!started) { g.moveTo(x, y); started = true; } else { g.lineTo(x, y); }
  }
  g.stroke({ color: theme.accent.color, alpha: 0.15, width: 4 });
}

// ─── Extended visualizer modes ──────────────────────────────────────────────

interface ParticleState {
  x: number; y: number;
  vx: number; vy: number;
}

function drawChannelOscilloscopes(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;
  const channelCount = 4;
  const cols = 2;
  const rows = 2;
  const cellW = (w - 6) / cols;
  const cellH = (h - 6) / rows;
  // Show 4 overlapping time windows with different offsets for visual variety
  const windowSize = Math.floor(data.length / 2);
  const chColors = [theme.accent.color, 0xa855f7, theme.success.color, theme.warning.color];

  for (let ch = 0; ch < channelCount; ch++) {
    const col = ch % cols;
    const row = Math.floor(ch / cols);
    const ox = 3 + col * cellW;
    const oy = 3 + row * cellH;
    const midY = oy + cellH / 2;

    // Cell border
    g.rect(ox, oy, cellW - 1, cellH - 1);
    g.stroke({ color: theme.border.color, alpha: 0.15, width: 0.5 });

    // Waveform with staggered offset for each "channel"
    const offset = Math.floor(ch * data.length / (channelCount + 1));
    const samples = Math.min(windowSize, data.length - offset);
    const step = samples / (cellW - 4);
    g.moveTo(ox + 2, midY + (data[offset] ?? 0) * (cellH / 2 - 2));
    for (let i = 1; i < cellW - 4; i++) {
      const val = data[offset + Math.floor(i * step)] ?? 0;
      g.lineTo(ox + 2 + i, midY + val * (cellH / 2 - 2));
    }
    g.stroke({ color: chColors[ch], alpha: 0.8, width: 1 });
  }
}

function drawStereoField(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length < 2) return;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 4;

  g.circle(cx, cy, radius);
  g.stroke({ color: theme.border.color, alpha: 0.15, width: 0.5 });

  // Crosshairs
  g.moveTo(cx, cy - radius); g.lineTo(cx, cy + radius);
  g.stroke({ color: theme.border.color, alpha: 0.1, width: 0.5 });
  g.moveTo(cx - radius, cy); g.lineTo(cx + radius, cy);
  g.stroke({ color: theme.border.color, alpha: 0.1, width: 0.5 });

  // Time-delay phase plot — similar to vectorscope but with shorter delay
  // for a tighter, more "metered" look
  const offset = Math.floor(data.length / 6);
  const sampleCount = Math.min(256, data.length - offset);
  const step = Math.max(1, Math.floor((data.length - offset) / sampleCount));

  // Draw as connected line
  let started = false;
  for (let i = 0; i < sampleCount; i++) {
    const idx = i * step;
    const a = data[idx] ?? 0;
    const b = data[idx + offset] ?? 0;
    const m = (a + b) * 0.5;
    const s = (a - b) * 0.5;
    const x = cx + s * radius * 1.4;
    const y = cy - m * radius * 0.7;
    if (!started) { g.moveTo(x, y); started = true; } else { g.lineTo(x, y); }
  }
  g.stroke({ color: theme.accentSecondary.color, alpha: 0.6, width: 1.5 });
}

function drawFrequencyBars(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme, peaks: Float32Array) {
  if (!data || data.length === 0) return;
  const barCount = Math.min(64, Math.floor((w - 8) / 2));
  const padX = 4;
  const padY = 4;
  const drawW = w - padX * 2;
  const drawH = h - padY * 2;
  const barWidth = drawW / barCount;
  const step = Math.floor(data.length / barCount);

  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += data[i * step + j] ?? -100;
    const db = sum / step;
    const norm = Math.max(0, Math.min(1, (db + 100) / 100));
    const barH = norm * drawH;

    if (i < peaks.length) {
      if (norm > peaks[i]) peaks[i] = norm;
      else peaks[i] = Math.max(0, peaks[i] - PEAK_DECAY);
    }

    if (barH > 0.5) {
      const x = padX + i * barWidth;
      const color = norm > 0.8 ? theme.warning.color : theme.accent.color;
      g.rect(x, h - padY - barH, barWidth - 1, barH);
      g.fill({ color, alpha: 0.5 + norm * 0.5 });
    }
    if (i < peaks.length && peaks[i] > 0.02) {
      g.rect(padX + i * barWidth, h - padY - peaks[i] * drawH, barWidth - 1, 1);
      g.fill({ color: theme.accentSecondary.color, alpha: 0.7 });
    }
  }
}

function drawChannelLevels(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;
  // Show 4 bars representing different energy bands of the waveform
  // (since we only have mono, split into frequency-ish bands via simple windowing)
  const bandCount = 4;
  const padX = 4;
  const padY = 3;
  const drawW = w - padX * 2;
  const barH = Math.max(4, (h - padY * 2) / bandCount - 2);
  const bandColors = [theme.success.color, theme.accent.color, theme.warning.color, theme.error.color];

  for (let band = 0; band < bandCount; band++) {
    const y = padY + band * (barH + 2);

    // Each band looks at a different "derivative" order for variety:
    // band 0: RMS of raw signal (low freq energy)
    // band 1: RMS of differences (mid freq energy)
    // band 2: RMS of 2nd differences (high freq energy)
    // band 3: peak amplitude
    let sum = 0;
    const count = data.length;
    if (band === 0) {
      for (let i = 0; i < count; i++) sum += (data[i] ?? 0) ** 2;
      sum = Math.sqrt(sum / count);
    } else if (band === 1) {
      for (let i = 1; i < count; i++) { const d = (data[i] ?? 0) - (data[i-1] ?? 0); sum += d * d; }
      sum = Math.sqrt(sum / count) * 4;
    } else if (band === 2) {
      for (let i = 2; i < count; i++) { const d = (data[i] ?? 0) - 2*(data[i-1] ?? 0) + (data[i-2] ?? 0); sum += d * d; }
      sum = Math.sqrt(sum / count) * 12;
    } else {
      for (let i = 0; i < count; i++) sum = Math.max(sum, Math.abs(data[i] ?? 0));
    }
    const level = Math.min(1, sum * 3);

    // Background track
    g.rect(padX, y, drawW, barH);
    g.fill({ color: theme.bgSecondary.color });

    // Level bar
    const barW = level * drawW;
    g.rect(padX, y, barW, barH);
    g.fill({ color: bandColors[band], alpha: 0.7 });
  }
}

function drawParticles(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme, particles: ParticleState[]) {
  // Initialize particles on first call
  if (particles.length === 0) {
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      });
    }
  }

  // Audio energy from waveform
  let energy = 0;
  let peak = 0;
  if (data && data.length > 0) {
    for (let i = 0; i < Math.min(256, data.length); i++) {
      const a = Math.abs(data[i] ?? 0);
      energy += a;
      if (a > peak) peak = a;
    }
    energy = energy / Math.min(256, data.length);
  }

  const cx = w / 2;
  const cy = h / 2;
  const force = energy * 12;

  for (const p of particles) {
    // Center attraction
    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    p.vx += (dx / dist) * 0.003 + (Math.random() - 0.5) * force;
    p.vy += (dy / dist) * 0.003 + (Math.random() - 0.5) * force;

    p.vx *= 0.96;
    p.vy *= 0.96;
    p.x += p.vx;
    p.y += p.vy;

    // Wrap
    if (p.x < 0) p.x = w;
    if (p.x > w) p.x = 0;
    if (p.y < 0) p.y = h;
    if (p.y > h) p.y = 0;

    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const alpha = 0.4 + Math.min(0.6, speed * 0.4);
    const size = 1.5 + energy * 4 + speed * 0.3;
    g.circle(p.x, p.y, size);
    g.fill({ color: theme.accent.color, alpha });
  }
}

// ─── AudioMotion-style extra modes ──────────────────────────────────────────

/** Mirror: symmetric waveform reflected across horizontal center */
function drawMirrorWave(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;
  const midY = h / 2;
  const padX = 4;
  const drawW = w - padX * 2;
  const step = data.length / drawW;

  // Upper half (normal)
  g.moveTo(padX, midY - Math.abs(data[0] ?? 0) * (midY - 4));
  for (let i = 1; i < drawW; i++) {
    const val = Math.abs(data[Math.floor(i * step)] ?? 0);
    g.lineTo(padX + i, midY - val * (midY - 4));
  }
  g.stroke({ color: theme.accent.color, alpha: 0.9, width: 1.5 });

  // Lower half (mirrored)
  g.moveTo(padX, midY + Math.abs(data[0] ?? 0) * (midY - 4));
  for (let i = 1; i < drawW; i++) {
    const val = Math.abs(data[Math.floor(i * step)] ?? 0);
    g.lineTo(padX + i, midY + val * (midY - 4));
  }
  g.stroke({ color: theme.accent.color, alpha: 0.6, width: 1 });

  // Center divider
  g.moveTo(padX, midY); g.lineTo(w - padX, midY);
  g.stroke({ color: theme.border.color, alpha: 0.2, width: 1 });

  // Glow fill between the two halves (horizontal band)
  g.moveTo(padX, midY - Math.abs(data[0] ?? 0) * (midY - 4));
  for (let i = 1; i < drawW; i++) {
    const val = Math.abs(data[Math.floor(i * step)] ?? 0);
    g.lineTo(padX + i, midY - val * (midY - 4));
  }
  for (let i = drawW - 1; i >= 0; i--) {
    const val = Math.abs(data[Math.floor(i * step)] ?? 0);
    g.lineTo(padX + i, midY + val * (midY - 4));
  }
  g.closePath();
  g.fill({ color: theme.accent.color, alpha: 0.06 });
}

/** Radial: polar spectrum — FFT bars radiating from center */
function drawRadialSpectrum(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  if (!data || data.length === 0) return;
  const cx = w / 2;
  const cy = h / 2;
  const innerR = Math.min(w, h) * 0.15;
  const outerMax = Math.min(w, h) * 0.46;
  const barCount = 48;
  const step = Math.floor(data.length / barCount);
  const angleStep = (Math.PI * 2) / barCount;

  // Inner circle
  g.circle(cx, cy, innerR);
  g.stroke({ color: theme.border.color, alpha: 0.15, width: 1 });

  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += data[i * step + j] ?? -100;
    const db = sum / step;
    const norm = Math.max(0, Math.min(1, (db + 100) / 100));
    const barLen = norm * (outerMax - innerR);

    const angle = i * angleStep - Math.PI / 2;
    const x1 = cx + Math.cos(angle) * innerR;
    const y1 = cy + Math.sin(angle) * innerR;
    const x2 = cx + Math.cos(angle) * (innerR + barLen);
    const y2 = cy + Math.sin(angle) * (innerR + barLen);

    const color = norm > 0.8 ? theme.warning.color : theme.accent.color;
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke({ color, alpha: 0.5 + norm * 0.5, width: 2 });
  }
}

/** Energy: concentric pulsing rings driven by low-frequency energy */
function drawEnergyBurst(g: GraphicsType, wave: Float32Array, fft: Float32Array, w: number, h: number, theme: PixiTheme) {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.45;

  // Compute bass energy (low FFT bins) and overall RMS
  let bassEnergy = 0;
  const bassCount = Math.min(8, fft?.length ?? 0);
  for (let i = 0; i < bassCount; i++) bassEnergy += Math.max(0, ((fft?.[i] ?? -100) + 100) / 100);
  bassEnergy = bassCount > 0 ? bassEnergy / bassCount : 0;

  let rms = 0;
  const waveLen = wave?.length ?? 0;
  for (let i = 0; i < waveLen; i++) rms += (wave?.[i] ?? 0) ** 2;
  rms = waveLen > 0 ? Math.sqrt(rms / waveLen) : 0;

  // Three rings at different radii
  const rings = [
    { r: maxR * (0.3 + bassEnergy * 0.5), color: theme.accent.color, alpha: 0.9, w: 2 },
    { r: maxR * (0.5 + rms * 0.4), color: theme.accentSecondary.color, alpha: 0.5, w: 1.5 },
    { r: maxR * (0.7 + rms * 0.25), color: theme.border.color, alpha: 0.3, w: 1 },
  ];

  for (const ring of rings) {
    if (ring.r > 2) {
      g.circle(cx, cy, ring.r);
      g.stroke({ color: ring.color, alpha: ring.alpha, width: ring.w });
      // Glow
      g.circle(cx, cy, ring.r);
      g.stroke({ color: ring.color, alpha: ring.alpha * 0.15, width: ring.w * 4 });
    }
  }

  // Center dot pulsing with energy
  const dotR = 2 + bassEnergy * 6 + rms * 4;
  g.circle(cx, cy, dotR);
  g.fill({ color: theme.accent.color, alpha: 0.9 });
  g.circle(cx, cy, dotR * 2);
  g.fill({ color: theme.accent.color, alpha: 0.1 });
}

/** Logo background: subtle waveform + accent decorations behind DEViLBOX text overlay */
function drawLogoBackground(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  // Faint waveform ribbon
  if (data && data.length > 0) {
    const midY = h / 2;
    const step = data.length / w;
    g.moveTo(0, midY + (data[0] ?? 0) * (h / 3));
    for (let i = 1; i < w; i++) {
      g.lineTo(i, midY + (data[Math.floor(i * step)] ?? 0) * (h / 3));
    }
    g.stroke({ color: theme.accent.color, alpha: 0.15, width: 2 });
  }
  // Corner accent lines
  g.moveTo(0, 0); g.lineTo(16, 0);
  g.moveTo(0, 0); g.lineTo(0, 8);
  g.stroke({ color: theme.accent.color, alpha: 0.6, width: 1.5 });
  g.moveTo(w, h); g.lineTo(w - 16, h);
  g.moveTo(w, h); g.lineTo(w, h - 8);
  g.stroke({ color: theme.accent.color, alpha: 0.6, width: 1.5 });
}

/** Banner background: horizontal scan-line animation + waveform */
function drawBannerBackground(g: GraphicsType, data: Float32Array, w: number, h: number, theme: PixiTheme) {
  // Subtle horizontal scan lines
  for (let y = 2; y < h; y += 4) {
    g.moveTo(0, y); g.lineTo(w, y);
    g.stroke({ color: theme.border.color, alpha: 0.06, width: 1 });
  }
  // Thin bottom waveform
  if (data && data.length > 0) {
    const baseY = h - 6;
    const step = data.length / w;
    g.moveTo(0, baseY + (data[0] ?? 0) * 4);
    for (let i = 1; i < w; i++) {
      g.lineTo(i, baseY + (data[Math.floor(i * step)] ?? 0) * 4);
    }
    g.stroke({ color: theme.accentSecondary.color, alpha: 0.5, width: 1 });
  }
}
