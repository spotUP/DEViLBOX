/**
 * PixiDJDeck — Complete deck component: track info + turntable + waveform + transport.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { useTick } from '@pixi/react';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme, usePixiThemeId, getDeckColors, type PixiTheme } from '../../theme';
import { PixiButton, PixiLabel, PixiSlider } from '../../components';
import { useDJStore } from '@/stores/useDJStore';
import { PixiDeckTransport } from './PixiDeckTransport';
import { PixiDeckTurntable } from './PixiDeckTurntable';
// PixiDeckWaveform moved to full-width strip in PixiDJView
import { PixiDeckScratch } from './PixiDeckScratch';
import { PixiDeckCuePoints } from './PixiDeckCuePoints';
import { PixiDeckScopes } from './PixiDeckScopes';
import { PixiDeckBeatGrid } from './PixiDeckBeatGrid';
import { PixiDeckFXPads } from './PixiDeckFXPads';
import { PixiDeckPatternDisplay } from './PixiDeckPatternDisplay';
import { getDJEngine } from '@engine/dj/DJEngine';
import { TurntablePhysics, OMEGA_NORMAL } from '@/engine/turntable/TurntablePhysics';
import { useDeckVisualizationData } from '@/hooks/dj/useDeckVisualizationData';
import * as DJActions from '@/engine/dj/DJActions';

/** Format milliseconds as M:SS */
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/* ─── Visualizer modes ──────────────────────────────────────────────── */

const VIZ_MODES = ['spectrum', 'waveform', 'circular', 'mirrored', 'terrain', 'starfield', 'plasma', 'particles'] as const;
type VizMode = (typeof VIZ_MODES)[number];

const VIZ_LABELS: Record<VizMode, string> = {
  spectrum: 'SPECTRUM',
  waveform: 'WAVEFORM',
  circular: 'RADIAL',
  mirrored: 'MIRROR',
  terrain: 'TERRAIN',
  starfield: 'STARFIELD',
  plasma: 'PLASMA',
  particles: 'PARTICLES',
};

/* ─── Spectrum visualizer (rAF loop, multiple modes, beat flash) ───── */

const PixiSpectrumDisplay: React.FC<{
  deckId: 'A' | 'B' | 'C';
  height: number;
  deckColor: number;
  vizMode: VizMode;
  onBeatFlash?: () => void;
}> = ({ deckId, height, deckColor, vizMode, onBeatFlash }) => {
  const theme = usePixiTheme();
  const viz = useDeckVisualizationData(deckId);
  const graphicsRef = useRef<GraphicsType | null>(null);
  const rafRef = useRef(0);
  const prevEnergyRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const vizTimeRef = useRef(0);
  const starsRef = useRef<{ x: number; y: number; z: number; speed: number; hue: number }[]>([]);
  if (starsRef.current.length === 0) {
    starsRef.current = Array.from({ length: 200 }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
      speed: 0.2 + Math.random() * 0.8,
      hue: Math.random(),
    }));
  }
  const burstsRef = useRef<{ particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number; size: number }[]; age: number }[]>([]);
  const lastBurstTimeRef = useRef(0);

  useEffect(() => {
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) { rafRef.current = requestAnimationFrame(draw); return; }
      g.clear();

      const now = performance.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      vizTimeRef.current += dt;

      const width = (g as any).layout?.computedLayout?.width ?? 280;
      g.rect(0, 0, width, height).fill({ color: theme.bg.color });

      const isPlaying = useDJStore.getState().decks[deckId]?.isPlaying ?? false;
      let fft: Float32Array | null = null;
      let waveform: Float32Array | null = null;
      if (isPlaying) {
        fft = viz.getFFT();
        if (vizMode === 'waveform') waveform = viz.getWaveform();
      }

      // Beat detection from FFT energy
      if (fft && fft.length > 0 && onBeatFlash) {
        const lowBins = Math.min(16, fft.length);
        let energy = 0;
        for (let i = 0; i < lowBins; i++) energy += Math.abs(fft[i] ?? -100);
        energy /= lowBins;
        if (energy - prevEnergyRef.current > 15) onBeatFlash();
        prevEnergyRef.current = energy * 0.8 + prevEnergyRef.current * 0.2;
      }

      if (vizMode === 'waveform' && waveform && waveform.length > 0) {
        drawWaveform(g, waveform, width, height, deckColor, theme);
      } else if (vizMode === 'circular' && fft && fft.length > 0) {
        drawCircular(g, fft, width, height, deckColor, theme);
      } else if (vizMode === 'mirrored' && fft && fft.length > 0) {
        drawMirrored(g, fft, width, height, deckColor, theme);
      } else if (vizMode === 'terrain' && fft && fft.length > 0) {
        drawTerrain(g, fft, width, height, vizTimeRef.current, deckColor, theme);
      } else if (vizMode === 'starfield' && fft && fft.length > 0) {
        let rms = 0;
        for (let i = 0; i < fft.length; i++) { const v = (fft[i] + 100) / 100; rms += v * v; }
        rms = Math.sqrt(rms / fft.length);
        drawStarfield(g, fft, width, height, vizTimeRef.current, deckColor, dt, rms, starsRef.current, theme);
      } else if (vizMode === 'plasma') {
        drawPlasma(g, fft ?? new Float32Array(128).fill(-100), width, height, vizTimeRef.current);
      } else if (vizMode === 'particles') {
        drawParticles(g, fft ?? new Float32Array(128).fill(-100), width, height, vizTimeRef.current, dt, burstsRef, lastBurstTimeRef, theme);
      } else if (fft && fft.length > 0) {
        drawSpectrumBars(g, fft, width, height, deckColor, theme);
      }

      g.rect(0, 0, width, height).stroke({ color: theme.bgTertiary.color, width: 0.5 });
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deckId, height, deckColor, vizMode, onBeatFlash]);

  return <pixiGraphics ref={graphicsRef} draw={() => {}} layout={{ width: '100%', height }} />;
};

function drawSpectrumBars(g: GraphicsType, fft: Float32Array, w: number, h: number, accentColor: number, theme: PixiTheme) {
  const bars = 32;
  const gap = 1;
  const barW = (w - gap * (bars + 1)) / bars;
  const step = Math.floor(fft.length / bars);
  for (let i = 0; i < bars; i++) {
    const db = fft[i * step] ?? -100;
    const val = Math.max(0, Math.min(1, (db + 100) / 80));
    const barH = val * (h - 4);
    if (barH < 1) continue;
    const color = val > 0.8 ? theme.error.color : val > 0.5 ? theme.warning.color : accentColor;
    g.rect(gap + i * (barW + gap), h - 2 - barH, barW, barH).fill({ color, alpha: 0.85 });
  }
}

function drawWaveform(g: GraphicsType, data: Float32Array, w: number, h: number, accentColor: number, theme: PixiTheme) {
  const mid = h / 2;
  const step = data.length / w;
  g.moveTo(0, mid);
  for (let x = 0; x < w; x++) {
    const idx = Math.floor(x * step);
    const val = data[idx] ?? 0;
    g.lineTo(x, mid + val * mid * 0.8);
  }
  g.stroke({ color: accentColor, width: 1.5 });
  // Center line
  g.moveTo(0, mid).lineTo(w, mid).stroke({ color: theme.border.color, width: 0.5 });
}

function drawCircular(g: GraphicsType, fft: Float32Array, w: number, h: number, accentColor: number, theme: PixiTheme) {
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) * 0.3;
  const bars = 64;
  const step = Math.max(1, Math.floor(fft.length / bars));
  for (let i = 0; i < bars; i++) {
    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const db = fft[i * step] ?? -100;
    const val = Math.max(0, Math.min(1, (db + 100) / 80));
    const barLen = val * radius * 0.8;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const x1 = cx + cosA * radius, y1 = cy + sinA * radius;
    const x2 = cx + cosA * (radius + barLen), y2 = cy + sinA * (radius + barLen);
    const color = val > 0.7 ? theme.error.color : val > 0.4 ? theme.warning.color : accentColor;
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width: 2 });
  }
  g.circle(cx, cy, radius * 0.3).fill({ color: theme.bgSecondary.color });
  g.circle(cx, cy, radius * 0.3).stroke({ color: accentColor, width: 1 });
}

function drawMirrored(g: GraphicsType, fft: Float32Array, w: number, h: number, accentColor: number, theme: PixiTheme) {
  const bars = 48;
  const barW = w / bars - 1;
  const step = Math.max(1, Math.floor(fft.length / bars));
  const mid = h / 2;
  for (let i = 0; i < bars; i++) {
    const db = fft[i * step] ?? -100;
    const val = Math.max(0, Math.min(1, (db + 100) / 80));
    const barH = val * mid * 0.9;
    const color = val > 0.7 ? theme.error.color : val > 0.4 ? theme.warning.color : accentColor;
    g.rect(i * (barW + 1), mid - barH, barW, barH).fill({ color, alpha: 0.85 });
    g.rect(i * (barW + 1), mid, barW, barH).fill({ color, alpha: 0.85 });
  }
}

function drawTerrain(g: GraphicsType, fftData: Float32Array, w: number, h: number, time: number, accentColor: number, theme: PixiTheme) {
  g.clear();
  const lines = 40;
  const lineSpacing = h / (lines + 2);

  for (let line = lines - 1; line >= 0; line--) {
    const baseY = (line + 1.5) * lineSpacing;
    const phase = line * 0.15 + time * 0.5;

    const points: number[] = [];
    const segments = Math.min(fftData.length, 128);

    for (let x = 0; x <= w; x += w / segments) {
      const idx = Math.floor((x / w) * segments);
      const val = (fftData[idx] + 100) / 100;
      const amplitude = val * lineSpacing * 2.5;
      const noise = Math.sin(x * 0.02 + phase) * lineSpacing * 0.3;
      const y = baseY - amplitude - noise;
      points.push(x, y);
    }

    // Filled polygon for occlusion
    g.moveTo(0, baseY + lineSpacing);
    g.lineTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
      g.lineTo(points[i], points[i + 1]);
    }
    g.lineTo(w, baseY + lineSpacing);
    g.closePath();
    g.fill({ color: theme.bg.color });

    // Draw the waveform line on top
    g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
      g.lineTo(points[i], points[i + 1]);
    }
    const brightness = 0.3 + (1 - line / lines) * 0.7;
    const r = ((accentColor >> 16) & 0xff) * brightness;
    const gr = ((accentColor >> 8) & 0xff) * brightness;
    const b = (accentColor & 0xff) * brightness;
    const lineColor = (Math.round(r) << 16) | (Math.round(gr) << 8) | Math.round(b);
    g.stroke({ color: lineColor, width: 1.5 });
  }
}

function drawStarfield(
  g: GraphicsType, fftData: Float32Array, w: number, h: number, _time: number,
  accentColor: number, dt: number, rms: number,
  stars: { x: number; y: number; z: number; speed: number; hue: number }[],
  theme: PixiTheme,
) {
  g.clear();
  g.rect(0, 0, w, h).fill({ color: theme.bg.color });

  const cx = w / 2, cy = h / 2;
  const bass = (fftData[2] + 100) / 100;
  const speedMult = 0.5 + bass * 2 + rms;

  for (const star of stars) {
    star.z -= dt * star.speed * speedMult * 0.3;
    if (star.z <= 0) {
      star.z = 1;
      star.x = (Math.random() - 0.5) * 2;
      star.y = (Math.random() - 0.5) * 2;
    }

    const scale = 1 / star.z;
    const sx = cx + star.x * scale * (w * 0.4);
    const sy = cy + star.y * scale * (h * 0.4);

    if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) {
      star.z = 1;
      continue;
    }

    const size = (1 - star.z) * 3 + 0.5;

    // Motion streak from previous position
    const prevZ = star.z + dt * star.speed * speedMult * 0.3;
    const prevScale = 1 / prevZ;
    const psx = cx + star.x * prevScale * (w * 0.4);
    const psy = cy + star.y * prevScale * (h * 0.4);

    const brightness = (1 - star.z) * 0.8 + 0.2;
    const color = star.hue < 0.6 ? 0xffffff : star.hue < 0.8 ? accentColor : theme.accentSecondary.color;

    if (star.z < 0.7) {
      g.moveTo(psx, psy).lineTo(sx, sy).stroke({ color, width: size * 0.5, alpha: brightness * 0.5 });
    }

    g.circle(sx, sy, size).fill({ color, alpha: brightness });
  }

  // Warp flash on high energy
  if (rms > 0.7) {
    const flashAlpha = (rms - 0.7) * 2;
    g.circle(cx, cy, 40).fill({ color: accentColor, alpha: flashAlpha * 0.3 });
  }
}

const BURST_COLORS = [0xef4444, 0xf97316, 0xf59e0b, 0x10b981, 0x4c8bf5, 0xcc44ff];

function drawPlasma(g: GraphicsType, fftData: Float32Array, w: number, h: number, time: number) {
  g.clear();
  const cellSize = 8;
  const cols = Math.ceil(w / cellSize);
  const rows = Math.ceil(h / cellSize);
  const aspect = w / h;

  // Audio reactivity
  const rms = fftData.reduce((s, v) => s + (v + 100), 0) / fftData.length / 100;
  const bass = (fftData[2] + 100) / 100;
  const mid = (fftData[Math.min(20, fftData.length - 1)] + 100) / 100;
  const high = (fftData[Math.min(60, fftData.length - 1)] + 100) / 100;
  const speed = 0.3 + rms * 2;
  const t = time * speed;

  // Plasma color palette (red → orange → amber → green → cyan)
  const plasmaColor = (val: number): number => {
    val = ((val % 1) + 1) % 1;
    let r: number, g2: number, b: number;
    if (val < 0.2) { const t2 = val / 0.2; r = 0.937 + (0.976 - 0.937) * t2; g2 = 0.267 + (0.451 - 0.267) * t2; b = 0.267 + (0.086 - 0.267) * t2; }
    else if (val < 0.4) { const t2 = (val - 0.2) / 0.2; r = 0.976 + (0.961 - 0.976) * t2; g2 = 0.451 + (0.620 - 0.451) * t2; b = 0.086 + (0.043 - 0.086) * t2; }
    else if (val < 0.6) { const t2 = (val - 0.4) / 0.2; r = 0.961 + (0.063 - 0.961) * t2; g2 = 0.620 + (0.725 - 0.620) * t2; b = 0.043 + (0.506 - 0.043) * t2; }
    else if (val < 0.8) { const t2 = (val - 0.6) / 0.2; r = 0.063 + (0.1 - 0.063) * t2; g2 = 0.725 + (0.8 - 0.725) * t2; b = 0.506 + (0.9 - 0.506) * t2; }
    else { const t2 = (val - 0.8) / 0.2; r = 0.1 + (0.937 - 0.1) * t2; g2 = 0.8 + (0.267 - 0.8) * t2; b = 0.9 + (0.267 - 0.9) * t2; }
    return (Math.round(r * 255) << 16) | (Math.round(g2 * 255) << 8) | Math.round(b * 255);
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col / cols * aspect;
      const py = row / rows;

      // 6 overlapping sine patterns
      const v1 = Math.sin(px * 6 + t * 0.7 + bass * 3);
      const v2 = Math.sin(py * 8 - t * 0.5 + mid * 2);
      const v3 = Math.sin((px + py) * 5 + t * 0.9);
      const v4 = Math.sin(Math.sqrt((px - aspect * 0.5) ** 2 + (py - 0.5) ** 2) * 10 - t * 1.2 + high * 4);
      const v5 = Math.sin(px * 12 * (1 + bass) + py * 8 + t * 1.5) * mid;
      const v6 = Math.cos(Math.sqrt((px - aspect * 0.3) ** 2 + (py - 0.7) ** 2) * 15 + t * 2) * high;

      let plasma = (v1 + v2 + v3 + v4 + v5 + v6) / 6;
      plasma = plasma * 0.5 + 0.5;

      // Bass pulse
      const dist = Math.sqrt((px - aspect * 0.5) ** 2 + (py - 0.5) ** 2);
      plasma += bass * 0.3 * Math.sin(dist * 3 - t * 3);

      // Vignette
      const ux = col / cols - 0.5;
      const uy = row / rows - 0.5;
      const vignette = Math.max(1 - (ux * ux + uy * uy) * 1.69 * 4, 0);

      const color = plasmaColor(plasma + time * 0.02);
      const brightness = vignette * (0.7 + rms * 0.6);
      const cr = ((color >> 16) & 0xff) * brightness;
      const cg = ((color >> 8) & 0xff) * brightness;
      const cb = (color & 0xff) * brightness;
      const finalColor = (Math.min(255, Math.round(cr)) << 16) | (Math.min(255, Math.round(cg)) << 8) | Math.min(255, Math.round(cb));

      g.rect(col * cellSize, row * cellSize, cellSize, cellSize).fill(finalColor);
    }
  }
}

function drawParticles(
  g: GraphicsType, fftData: Float32Array, w: number, h: number, time: number, dt: number,
  burstsRef: React.MutableRefObject<{ particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number; size: number }[]; age: number }[]>,
  lastBurstTimeRef: React.MutableRefObject<number>,
  theme: PixiTheme,
) {
  g.clear();
  g.rect(0, 0, w, h).fill(theme.bg.color);

  const rms = fftData.reduce((s, v) => s + (v + 100), 0) / fftData.length / 100;
  const bass = (fftData[2] + 100) / 100;
  const peak = Math.max(...Array.from(fftData.subarray(0, Math.min(10, fftData.length))).map(v => (v + 100) / 100));

  // Spawn new burst on energy spikes
  if (peak > 0.7 && time - lastBurstTimeRef.current > 0.3) {
    lastBurstTimeRef.current = time;
    const burstColor = BURST_COLORS[burstsRef.current.length % BURST_COLORS.length];
    const originX = (Math.random() - 0.5) * w * 0.5 + w / 2;
    const originY = h * 0.3 + Math.random() * h * 0.4;

    const particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number; size: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 150;
      particles.push({
        x: originX, y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        life: 1, maxLife: 0.8 + Math.random() * 0.7,
        color: burstColor, size: 1.5 + Math.random() * 2,
      });
    }
    burstsRef.current.push({ particles, age: 0 });
    if (burstsRef.current.length > 6) burstsRef.current.shift();
  }

  // Update and draw all bursts
  for (let bi = burstsRef.current.length - 1; bi >= 0; bi--) {
    const burst = burstsRef.current[bi];
    burst.age += dt;

    let alive = false;
    for (const p of burst.particles) {
      if (p.life <= 0) continue;
      alive = true;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // gravity
      p.vx *= 0.99;
      p.life -= dt / p.maxLife;

      if (p.life <= 0) continue;

      const alpha = Math.max(0, p.life);
      g.circle(p.x, p.y, p.size * alpha).fill({ color: p.color, alpha });

      // Hot white core for fresh particles
      if (p.life > 0.8) {
        g.circle(p.x, p.y, p.size * 0.5).fill({ color: 0xffffff, alpha: (p.life - 0.8) * 5 });
      }
    }

    if (!alive) burstsRef.current.splice(bi, 1);
  }

  // Ambient embers
  for (let i = 0; i < 20; i++) {
    const seed = i * 0.37;
    const ex = Math.sin(seed * 30 + time * 0.5 * (0.5 + (seed % 1))) * w * 0.4 + w / 2;
    const ey = ((seed * 5 - time * 0.1 * (0.3 + (seed % 1))) % 1.5 - 0.5) * h + h / 2;
    const flicker = 0.5 + 0.5 * Math.sin(time * (3 + (seed % 1) * 5));
    const alpha2 = flicker * rms * 0.4;
    if (alpha2 > 0.05) {
      g.circle(ex, ey, 1.5).fill({ color: theme.warning.color, alpha: alpha2 });
    }
  }

  // Ground glow on bass
  if (bass > 0.3) {
    for (let x = 0; x < w; x += 4) {
      const glowAlpha = bass * 0.15 * Math.exp(-((x / w - 0.5) ** 2) * 4);
      g.rect(x, h - 8, 4, 8).fill({ color: theme.error.color, alpha: glowAlpha });
    }
  }
}

/* ─── Vinyl record display with grooves, label, rotation, and scratch ─ */

const GROOVE_COUNT = 28;

const PixiVinylDisplay: React.FC<{
  deckId: 'A' | 'B' | 'C';
  size: number;
  deckColor: number;
}> = ({ deckId, size, deckColor }) => {
  const theme = usePixiTheme();
  const isPlaying = useDJStore(s => s.decks[deckId].isPlaying);
  const effectiveBPM = useDJStore(s => s.decks[deckId].effectiveBPM);
  const trackName = useDJStore(s => s.decks[deckId].trackName);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const labelR = outerR * 0.32;

  // ── Physics-driven rotation ──────────────────────────────────────────────
  const physicsRef = useRef<TurntablePhysics | null>(null);
  const angleRef = useRef(0);
  const lastTickRef = useRef(0);
  const isScratchActiveRef = useRef(false);
  const [isScratchActive, setIsScratchActive] = useState(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerTimeRef = useRef(0);
  const graphicsRef = useRef<GraphicsType | null>(null);
  const isHoveredRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const scrollReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep play state accessible from rAF closure without re-creating it
  const playStateRef = useRef({ isPlaying, effectiveBPM });
  playStateRef.current = { isPlaying, effectiveBPM };

  // ── Physics rAF loop ─────────────────────────────────────────────────────
  useEffect(() => {
    let prevRate = 1;

    const tick = (now: number) => {
      const dt = lastTickRef.current > 0 ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;

      // Lazy-init engine physics
      if (!physicsRef.current) {
        try { physicsRef.current = getDJEngine().getDeck(deckId).physics; } catch { /* engine not ready */ }
      }
      const physics = physicsRef.current;

      const baseBPM = playStateRef.current.effectiveBPM || 120;
      const rps = (baseBPM / 120) * 0.5556; // 33⅓ RPM normalized

      if (playStateRef.current.isPlaying || isScratchActiveRef.current) {
        let rate = 1;
        if (physics && (isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive)) {
          rate = physics.tick(dt);
        }

        angleRef.current += rps * rate * 2 * Math.PI * dt;

        // Forward physics rate to DeckEngine scratch API via DJActions
        if (isScratchActiveRef.current && Math.abs(rate - prevRate) > 0.01) {
          DJActions.setScratchVelocity(deckId, rate);
          prevRate = rate;
        }

        // Check if physics settled back to normal — exit scratch
        if (physics && isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive) {
          if (Math.abs(rate - 1.0) < 0.02) {
            isScratchActiveRef.current = false;
            setIsScratchActive(false);
            DJActions.stopScratch(deckId, 50);
            prevRate = 1;
          }
        }
      }

      // Render
      drawVinylToGraphics();
      rafRef.current = requestAnimationFrame(tick);
    };

    const rafRef = { current: requestAnimationFrame(tick) };
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // ── Imperative graphics draw (called each rAF frame) ─────────────────────
  const drawVinylToGraphics = useCallback(() => {
    const g = graphicsRef.current;
    if (!g) return;

    const rotation = angleRef.current;
    const playing = playStateRef.current.isPlaying || isScratchActiveRef.current;

    g.clear();

    // Platter
    g.circle(cx, cy, outerR).fill({ color: theme.bgSecondary.color });
    g.circle(cx, cy, outerR).stroke({ color: theme.border.color, width: 1.5 });

    // Vinyl disc
    g.circle(cx, cy, outerR - 3).fill({ color: theme.bg.color });

    // Grooves with shimmer
    const grooveStart = labelR + 6;
    const grooveEnd = outerR - 6;
    for (let i = 0; i < GROOVE_COUNT; i++) {
      const r = grooveStart + (i / (GROOVE_COUNT - 1)) * (grooveEnd - grooveStart);
      const alpha = 0.12 + 0.08 * Math.sin(i * 1.5 + rotation * 0.3);
      g.circle(cx, cy, r).stroke({ color: theme.bgSecondary.color, alpha, width: 0.5 });
    }

    // Rotation marker line
    g.moveTo(cx + Math.cos(rotation) * (labelR + 2), cy + Math.sin(rotation) * (labelR + 2))
      .lineTo(cx + Math.cos(rotation) * (outerR - 4), cy + Math.sin(rotation) * (outerR - 4))
      .stroke({ color: deckColor, alpha: playing ? 0.8 : 0.3, width: 2 });

    // Label area
    g.circle(cx, cy, labelR).fill({ color: deckColor, alpha: 0.15 });
    g.circle(cx, cy, labelR).stroke({ color: deckColor, alpha: 0.3, width: 0.5 });

    // Edge dot
    g.circle(cx + Math.cos(rotation) * (outerR - 2), cy + Math.sin(rotation) * (outerR - 2), 2)
      .fill({ color: 0xffffff, alpha: playing ? 0.7 : 0.2 });

    // Spindle
    g.circle(cx, cy, 3).fill({ color: theme.bg.color });
    g.circle(cx, cy, 3).stroke({ color: theme.border.color, width: 0.5 });
  }, [cx, cy, outerR, labelR, deckColor]);

  // ── Scratch enter/exit helpers ───────────────────────────────────────────
  const enterScratch = useCallback(() => {
    if (isScratchActiveRef.current) return;
    isScratchActiveRef.current = true;
    setIsScratchActive(true);
    DJActions.startScratch(deckId);
  }, [deckId]);

  // ── Pointer handlers (scratch grab) ──────────────────────────────────────
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();

    if (!playStateRef.current.isPlaying) return;

    enterScratch();

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    lastPointerTimeRef.current = performance.now();

    // Tell physics: hand on record
    physicsRef.current?.setTouching(true);
    physicsRef.current?.setHandVelocity(0);

    const onMove = (ev: PointerEvent) => {
      if (!lastPointerRef.current) return;
      const g = graphicsRef.current;
      if (!g) return;

      // Use global bounds of the graphics element for center calculation
      const bounds = g.getBounds();
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const rx = ev.clientX - centerX;
      const ry = ev.clientY - centerY;
      const radius = Math.sqrt(rx * rx + ry * ry);

      if (radius > 4) {
        const dx = ev.clientX - lastPointerRef.current.x;
        const dy = ev.clientY - lastPointerRef.current.y;
        // Tangential component of pointer movement relative to center
        const tangential = (rx * dy - ry * dx) / radius;

        const now = performance.now();
        const dt = Math.max(0.001, (now - lastPointerTimeRef.current) / 1000);
        lastPointerTimeRef.current = now;

        // Scale: tangential px/s → angular velocity in rad/s
        const pixelVelocity = tangential / dt;
        const sensitivity = useDJStore.getState().jogWheelSensitivity;
        const omega = (pixelVelocity / (size * 0.8)) * OMEGA_NORMAL * sensitivity;

        physicsRef.current?.setHandVelocity(omega);
      }

      lastPointerRef.current = { x: ev.clientX, y: ev.clientY };
    };

    const onUp = () => {
      lastPointerRef.current = null;
      physicsRef.current?.setTouching(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [enterScratch, size]);

  // ── Wheel handler (scroll scratch — velocity control) ───────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!isHoveredRef.current || !playStateRef.current.isPlaying) return;
    e.preventDefault();

    if (!isScratchActiveRef.current) {
      enterScratch();
    }

    const now = performance.now();
    const dt = Math.max(0.001, (now - lastScrollTimeRef.current) / 1000);
    lastScrollTimeRef.current = now;

    const normalizedDelta = e.deltaMode === 1 ? e.deltaY * 12 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const omega = TurntablePhysics.deltaToAngularVelocity(normalizedDelta, dt);
    physicsRef.current?.setTouching(true);
    physicsRef.current?.setHandVelocity(omega);

    if (scrollReleaseTimerRef.current !== null) clearTimeout(scrollReleaseTimerRef.current);
    scrollReleaseTimerRef.current = setTimeout(() => {
      scrollReleaseTimerRef.current = null;
      physicsRef.current?.setTouching(false);
    }, 150);
  }, [enterScratch]);

  // Attach document-level wheel listener; hover state gates which deck handles it
  useEffect(() => {
    const handler = (e: WheelEvent) => handleWheel(e);
    document.addEventListener('wheel', handler, { passive: false });
    return () => {
      document.removeEventListener('wheel', handler);
      if (scrollReleaseTimerRef.current !== null) clearTimeout(scrollReleaseTimerRef.current);
    };
  }, [handleWheel]);

  return (
    <pixiContainer layout={{ width: size, height: size }}>
      <pixiGraphics
        ref={graphicsRef}
        draw={() => {}}
        eventMode="static"
        cursor={isScratchActive ? 'grabbing' : 'grab'}
        onPointerDown={handlePointerDown}
        onPointerEnter={() => { isHoveredRef.current = true; }}
        onPointerLeave={() => { isHoveredRef.current = false; }}
        layout={{ width: size, height: size }}
      />
      <pixiBitmapText
        text={trackName || `Deck ${deckId}`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: Math.max(8, Math.round(labelR * 0.4)), fill: 0xffffff }}
        tint={deckColor}
        alpha={0.7}
        layout={{ position: 'absolute', left: cx - labelR + 4, top: cy - 5 }}
      />
      {isScratchActive && (
        <PixiLabel
          text="SCR"
          size="xs"
          weight="bold"
          color="accent"
          layout={{ position: 'absolute', top: 4, right: 4 }}
        />
      )}
    </pixiContainer>
  );
};

/* ─── Tonearm overlay for turntable mode ────────────────────────────── */

// @ts-expect-error — component ready, will be rendered when tonearm integration is wired
const _PixiTonearm: React.FC<{
  size: number;
  isPlaying: boolean;
}> = ({ size, isPlaying }) => {
  const theme = usePixiTheme();
  const drawArm = useCallback((g: GraphicsType) => {
    g.clear();

    const baseX = size - 14;
    const baseY = 14;
    const armAngle = isPlaying ? Math.PI * 0.78 : Math.PI * 0.88;
    const armLen = size * 0.55;
    const endX = baseX - Math.cos(armAngle) * armLen;
    const endY = baseY + Math.sin(armAngle) * armLen;

    // Counterweight
    g.circle(baseX + Math.cos(armAngle) * 16, baseY - Math.sin(armAngle) * 16, 4)
      .fill({ color: theme.textMuted.color });

    // Arm shaft
    g.moveTo(baseX, baseY).lineTo(endX, endY)
      .stroke({ color: theme.textSecondary.color, width: 2 });

    // Headshell
    const sa = armAngle + 0.3;
    g.moveTo(endX, endY)
      .lineTo(endX - Math.cos(sa) * 12, endY + Math.sin(sa) * 12)
      .stroke({ color: theme.text.color, width: 3 });

    // Pivot
    g.circle(baseX, baseY, 6).fill({ color: theme.border.color });
    g.circle(baseX, baseY, 2).fill({ color: theme.textSecondary.color });
  }, [size, isPlaying]);

  return (
    <pixiGraphics
      draw={drawArm}
      layout={{ width: size, height: size, position: 'absolute', left: 0, top: 0 }}
    />
  );
};

/* ─── Full 2D top-down turntable deck ───────────────────────────────── */

const PixiTurntable2D: React.FC<{
  deckId: 'A' | 'B' | 'C';
  deckColor: number;
  height: number;
}> = ({ deckId, deckColor, height: deckH }) => {
  const theme = usePixiTheme();
  const isPlaying = useDJStore(s => s.decks[deckId].isPlaying);
  const trackName = useDJStore(s => s.decks[deckId].trackName);
  const pitchOffset = useDJStore(s => s.decks[deckId].pitchOffset);

  const [rpm, setRpm] = useState<33 | 45>(33);
  const [powerOn, setPowerOn] = useState(true);
  const [measuredW, setMeasuredW] = useState(290);
  const deckW = measuredW;

  // Physics-driven rotation (same pattern as PixiVinylDisplay)
  const physicsRef = useRef<TurntablePhysics | null>(null);
  const angleRef = useRef(0);
  const lastTickRef = useRef(0);
  const isScratchActiveRef = useRef(false);
  const [isScratchActive, setIsScratchActive] = useState(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerTimeRef = useRef(0);
  const graphicsRef = useRef<GraphicsType | null>(null);
  const isHoveredRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const scrollReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pitch fader drag state
  const [isDraggingFader, setIsDraggingFader] = useState(false);
  const faderDragStartYRef = useRef(0);
  const faderDragStartValueRef = useRef(0);

  const playStateRef = useRef({ isPlaying, trackName, pitchOffset });
  playStateRef.current = { isPlaying, trackName, pitchOffset };

  // Keep power state in sync: turning power off pauses deck
  const powerOnRef = useRef(powerOn);
  powerOnRef.current = powerOn;
  const rpmRef = useRef(rpm);
  rpmRef.current = rpm;

  // Geometry
  const platterR = Math.min(deckW, deckH) * 0.35;
  const platterCX = deckW * 0.4;
  const platterCY = deckH * 0.5;

  // Fader geometry
  const faderX = deckW * 0.88;
  const faderTop = deckH * 0.3;
  const faderBottom = deckH * 0.72;
  const faderH = faderBottom - faderTop;

  // Physics rAF loop
  useEffect(() => {
    let prevRate = 1;

    const tick = (now: number) => {
      const dt = lastTickRef.current > 0 ? (now - lastTickRef.current) / 1000 : 0;
      lastTickRef.current = now;

      // Lazy-init engine physics
      if (!physicsRef.current) {
        try { physicsRef.current = getDJEngine().getDeck(deckId).physics; } catch { /* engine not ready */ }
      }
      const physics = physicsRef.current;

      const baseRps = rpmRef.current === 45 ? (45 / 60) : (33.333 / 60);
      const pitchMultiplier = Math.pow(2, (playStateRef.current.pitchOffset ?? 0) / 12);
      const rps = baseRps * pitchMultiplier;

      if ((playStateRef.current.isPlaying && powerOnRef.current) || isScratchActiveRef.current) {
        let rate = 1;
        if (physics && (isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive)) {
          rate = physics.tick(dt);
        }

        angleRef.current += rps * rate * 2 * Math.PI * dt;

        if (isScratchActiveRef.current && Math.abs(rate - prevRate) > 0.01) {
          DJActions.setScratchVelocity(deckId, rate);
          prevRate = rate;
        }

        if (physics && isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive) {
          if (Math.abs(rate - 1.0) < 0.02) {
            isScratchActiveRef.current = false;
            setIsScratchActive(false);
            DJActions.stopScratch(deckId, 50);
            prevRate = 1;
          }
        }
      }

      drawDeck();
      rafRef.current = requestAnimationFrame(tick);
    };

    const rafRef = { current: requestAnimationFrame(tick) };
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // Track measured width to update geometry when container resizes
  const measuredWRef = useRef(290);

  // Imperative graphics draw
  const drawDeck = useCallback(() => {
    const g = graphicsRef.current;
    if (!g) return;

    // Read computed layout width each frame
    const computedW = (g as any).layout?.computedLayout?.width;
    if (computedW && computedW > 0 && Math.abs(computedW - measuredWRef.current) > 1) {
      measuredWRef.current = computedW;
      setMeasuredW(computedW);
    }

    const playing = playStateRef.current.isPlaying && powerOnRef.current;
    const rotation = angleRef.current;
    const currentRpm = rpmRef.current;
    const currentPower = powerOnRef.current;
    const currentPitch = playStateRef.current.pitchOffset ?? 0;
    // Fader knob pos: pitchOffset is in semitones, -16..+16, map to fader range
    const pitchPct = (currentPitch / 0.08) * 100; // as percentage for display
    const faderPos = faderTop + faderH * (0.5 - currentPitch / 0.16);

    g.clear();

    // Deck chassis
    g.roundRect(0, 0, deckW, deckH, 8).fill({ color: theme.bgSecondary.color }).stroke({ color: theme.border.color, width: 1 });

    // Platter well
    g.circle(platterCX, platterCY, platterR + 8).fill({ color: theme.bgSecondary.color });

    // Platter
    g.circle(platterCX, platterCY, platterR).fill({ color: theme.bg.color });

    // Vinyl grooves
    const labelR = platterR * 0.2;
    for (let r = platterR * 0.25; r < platterR * 0.95; r += 3) {
      const alpha = 0.12 + 0.06 * Math.sin(r * 0.5 + rotation * 0.3);
      g.circle(platterCX, platterCY, r).stroke({ color: theme.bgSecondary.color, alpha, width: 0.5 });
    }

    // Label area
    g.circle(platterCX, platterCY, labelR).fill({ color: deckColor, alpha: 0.2 });
    g.circle(platterCX, platterCY, labelR).stroke({ color: deckColor, alpha: 0.4, width: 0.5 });

    // Rotation marker line
    const markerInner = labelR + 2;
    const markerOuter = platterR - 4;
    g.moveTo(platterCX + Math.cos(rotation) * markerInner, platterCY + Math.sin(rotation) * markerInner)
      .lineTo(platterCX + Math.cos(rotation) * markerOuter, platterCY + Math.sin(rotation) * markerOuter)
      .stroke({ color: deckColor, alpha: playing ? 0.8 : 0.3, width: 2 });

    // Edge dot
    g.circle(
      platterCX + Math.cos(rotation) * (platterR - 2),
      platterCY + Math.sin(rotation) * (platterR - 2), 2
    ).fill({ color: 0xffffff, alpha: playing ? 0.7 : 0.2 });

    // Spindle
    g.circle(platterCX, platterCY, 3).fill({ color: theme.bg.color });
    g.circle(platterCX, platterCY, 3).stroke({ color: theme.border.color, width: 0.5 });

    // --- Tonearm ---
    const armPivotX = deckW * 0.78;
    const armPivotY = deckH * 0.1;
    g.circle(armPivotX, armPivotY, 8).fill({ color: theme.border.color });
    // Counterweight
    g.circle(armPivotX + Math.cos(-0.5) * 18, armPivotY + Math.sin(-0.5) * 18, 5).fill({ color: theme.textMuted.color });

    // Arm angle: sweeps inward when playing, parked when stopped
    const armAngle = playing ? Math.PI * 0.78 : Math.PI * 0.88;
    const armLen = platterR * 1.05;
    const armEndX = armPivotX - Math.cos(armAngle) * armLen;
    const armEndY = armPivotY + Math.sin(armAngle) * armLen;

    g.moveTo(armPivotX, armPivotY).lineTo(armEndX, armEndY)
      .stroke({ color: theme.textSecondary.color, width: 2 });

    // Headshell
    const headAngle = armAngle + 0.3;
    const headX = armEndX - Math.cos(headAngle) * 12;
    const headY = armEndY + Math.sin(headAngle) * 12;
    g.moveTo(armEndX, armEndY).lineTo(headX, headY)
      .stroke({ color: theme.text.color, width: 3 });
    // Stylus
    g.circle(headX, headY, 1.5).fill(0xffffff);

    // --- Pitch fader (right side) ---
    // Fader track
    g.roundRect(faderX - 4, faderTop, 8, faderH, 4).fill({ color: theme.bgTertiary.color }).stroke({ color: theme.border.color, width: 0.5 });
    // Center line (zero mark)
    const centerY = faderTop + faderH * 0.5;
    g.moveTo(faderX - 6, centerY).lineTo(faderX + 6, centerY).stroke({ color: theme.textMuted.color, width: 1 });
    // Tick marks
    for (let i = 0; i <= 4; i++) {
      const y = faderTop + (i / 4) * faderH;
      g.moveTo(faderX - 5, y).lineTo(faderX + 5, y).stroke({ color: theme.border.color, width: 0.5 });
    }
    // Fader knob
    const clampedFaderPos = Math.max(faderTop, Math.min(faderBottom, faderPos));
    g.roundRect(faderX - 8, clampedFaderPos - 5, 16, 10, 3)
      .fill({ color: theme.textSecondary.color }).stroke({ color: theme.text.color, width: 0.5 });

    // --- Controls row (bottom right) ---
    // Power button
    const pwrX = deckW * 0.76;
    const pwrY = deckH * 0.88;
    g.circle(pwrX, pwrY, 9).fill(currentPower ? deckColor : theme.bgTertiary.color).stroke({ color: theme.textMuted.color, width: 1 });
    // Power symbol
    g.moveTo(pwrX, pwrY - 5).lineTo(pwrX, pwrY - 2).stroke({ color: 0xffffff, width: 1.5 });
    g.arc(pwrX, pwrY, 4, -Math.PI * 0.75, -Math.PI * 0.25).stroke({ color: 0xffffff, width: 1 });

    // RPM toggle
    const rpmX = deckW * 0.9;
    const rpmY = deckH * 0.88;
    g.roundRect(rpmX - 14, rpmY - 7, 28, 14, 4).fill({ color: theme.bgTertiary.color }).stroke({ color: theme.border.color, width: 0.5 });
    const toggleX = currentRpm === 33 ? rpmX - 6 : rpmX + 6;
    g.circle(toggleX, rpmY, 4.5).fill(deckColor);

    // Scratch indicator
    if (isScratchActiveRef.current) {
      g.roundRect(platterCX - 14, deckH * 0.08, 28, 12, 3).fill({ color: deckColor, alpha: 0.3 });
    }

    void pitchPct; // used for label text below
  }, [deckW, deckH, platterR, platterCX, platterCY, deckColor, faderX, faderTop, faderBottom, faderH]);

  // Scratch enter
  const enterScratch = useCallback(() => {
    if (isScratchActiveRef.current) return;
    isScratchActiveRef.current = true;
    setIsScratchActive(true);
    DJActions.startScratch(deckId);
  }, [deckId]);

  // Platter pointer handlers (scratch)
  const handlePlatterPointerDown = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
    if (!playStateRef.current.isPlaying || !powerOnRef.current) return;

    enterScratch();

    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    lastPointerTimeRef.current = performance.now();
    physicsRef.current?.setTouching(true);
    physicsRef.current?.setHandVelocity(0);

    const onMove = (ev: PointerEvent) => {
      if (!lastPointerRef.current) return;
      const g = graphicsRef.current;
      if (!g) return;

      const bounds = g.getBounds();
      const centerX = bounds.x + platterCX * (bounds.width / deckW);
      const centerY = bounds.y + platterCY * (bounds.height / deckH);
      const rx = ev.clientX - centerX;
      const ry = ev.clientY - centerY;
      const radius = Math.sqrt(rx * rx + ry * ry);

      if (radius > 4) {
        const dx = ev.clientX - lastPointerRef.current.x;
        const dy = ev.clientY - lastPointerRef.current.y;
        const tangential = (rx * dy - ry * dx) / radius;
        const now = performance.now();
        const dt = Math.max(0.001, (now - lastPointerTimeRef.current) / 1000);
        lastPointerTimeRef.current = now;
        const pixelVelocity = tangential / dt;
        const sensitivity2D = useDJStore.getState().jogWheelSensitivity;
        const omega = (pixelVelocity / (platterR * 4)) * OMEGA_NORMAL * sensitivity2D;
        physicsRef.current?.setHandVelocity(omega);
      }

      lastPointerRef.current = { x: ev.clientX, y: ev.clientY };
    };

    const onUp = () => {
      lastPointerRef.current = null;
      physicsRef.current?.setTouching(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [enterScratch, deckW, deckH, platterCX, platterCY, platterR]);

  // ── Wheel handler (scroll scratch — velocity control) ───────────────────
  const handleWheel2D = useCallback((e: WheelEvent) => {
    if (!isHoveredRef.current || !playStateRef.current.isPlaying || !powerOnRef.current) return;
    e.preventDefault();

    if (!isScratchActiveRef.current) {
      enterScratch();
    }

    const now = performance.now();
    const dt = Math.max(0.001, (now - lastScrollTimeRef.current) / 1000);
    lastScrollTimeRef.current = now;

    const normalizedDelta = e.deltaMode === 1 ? e.deltaY * 12 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const omega = TurntablePhysics.deltaToAngularVelocity(normalizedDelta, dt);
    physicsRef.current?.setTouching(true);
    physicsRef.current?.setHandVelocity(omega);

    if (scrollReleaseTimerRef.current !== null) clearTimeout(scrollReleaseTimerRef.current);
    scrollReleaseTimerRef.current = setTimeout(() => {
      scrollReleaseTimerRef.current = null;
      physicsRef.current?.setTouching(false);
    }, 150);
  }, [enterScratch]);

  useEffect(() => {
    const handler = (e: WheelEvent) => handleWheel2D(e);
    document.addEventListener('wheel', handler, { passive: false });
    return () => {
      document.removeEventListener('wheel', handler);
      if (scrollReleaseTimerRef.current !== null) clearTimeout(scrollReleaseTimerRef.current);
    };
  }, [handleWheel2D]);

  // Power button handler
  const handlePowerClick = useCallback(() => {
    const newPower = !powerOnRef.current;
    setPowerOn(newPower);
    try {
      const deck = getDJEngine().getDeck(deckId);
      const store = useDJStore.getState();
      if (!newPower && store.decks[deckId].isPlaying) {
        deck.pause();
        store.setDeckPlaying(deckId, false);
      } else if (newPower && !store.decks[deckId].isPlaying) {
        deck.play();
        store.setDeckPlaying(deckId, true);
      }
    } catch { /* not ready */ }
  }, [deckId]);

  // RPM toggle handler
  const handleRpmClick = useCallback(() => {
    setRpm(prev => prev === 33 ? 45 : 33);
  }, []);

  // Pitch fader drag handlers
  const handleFaderPointerDown = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
    setIsDraggingFader(true);
    faderDragStartYRef.current = e.clientY;
    faderDragStartValueRef.current = playStateRef.current.pitchOffset ?? 0;

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - faderDragStartYRef.current;
      // Map pixel drag to pitch range: full fader travel = 0.16 (±0.08)
      const pitchDelta = -(dy / faderH) * 0.16;
      const newPitch = Math.max(-0.08, Math.min(0.08, faderDragStartValueRef.current + pitchDelta));
      useDJStore.getState().setDeckPitch(deckId, newPitch);
    };

    const onUp = () => {
      setIsDraggingFader(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [deckId, faderH]);

  const pitchPct = ((pitchOffset ?? 0) / 0.08) * 100;

  return (
    <pixiContainer layout={{ width: '100%', height: deckH }}>
      {/* Main deck graphics (drawn imperatively via rAF) */}
      <pixiGraphics
        ref={graphicsRef}
        draw={() => {}}
        layout={{ width: '100%', height: deckH }}
      />

      {/* Platter scratch hitbox */}
      <pixiGraphics
        eventMode="static"
        cursor={isScratchActive ? 'grabbing' : 'grab'}
        onPointerDown={handlePlatterPointerDown}
        onPointerEnter={() => { isHoveredRef.current = true; }}
        onPointerLeave={() => { isHoveredRef.current = false; }}
        draw={(g: GraphicsType) => { g.clear(); g.circle(platterCX, platterCY, platterR).fill({ color: 0xff0000, alpha: 0.001 }); }}
        layout={{ position: 'absolute', top: 0, left: 0, width: deckW, height: deckH }}
      />

      {/* Pitch fader hitbox */}
      <pixiGraphics
        eventMode="static"
        cursor={isDraggingFader ? 'ns-resize' : 'pointer'}
        onPointerDown={handleFaderPointerDown}
        draw={(g: GraphicsType) => { g.clear(); g.rect(faderX - 12, faderTop - 8, 24, faderH + 16).fill({ color: 0xff0000, alpha: 0.001 }); }}
        layout={{ position: 'absolute', top: 0, left: 0, width: deckW, height: deckH }}
      />

      {/* Power button hitbox */}
      <pixiGraphics
        eventMode="static"
        cursor="pointer"
        onPointerDown={handlePowerClick}
        draw={(g: GraphicsType) => { g.clear(); g.circle(deckW * 0.76, deckH * 0.88, 14).fill({ color: 0xff0000, alpha: 0.001 }); }}
        layout={{ position: 'absolute', top: 0, left: 0, width: deckW, height: deckH }}
      />

      {/* RPM toggle hitbox */}
      <pixiGraphics
        eventMode="static"
        cursor="pointer"
        onPointerDown={handleRpmClick}
        draw={(g: GraphicsType) => { g.clear(); g.rect(deckW * 0.9 - 16, deckH * 0.88 - 10, 32, 20).fill({ color: 0xff0000, alpha: 0.001 }); }}
        layout={{ position: 'absolute', top: 0, left: 0, width: deckW, height: deckH }}
      />

      {/* Labels */}
      <PixiLabel text={`${rpm} RPM`} size="xs" font="mono" color="textMuted"
        layout={{ position: 'absolute', left: deckW * 0.9 - 14, top: deckH * 0.88 + 12 }} />
      <PixiLabel text={`${pitchPct > 0 ? '+' : ''}${pitchPct.toFixed(1)}%`} size="xs" font="mono" color="textMuted"
        layout={{ position: 'absolute', left: faderX - 14, top: faderTop - 16 }} />
      {isScratchActive && (
        <PixiLabel text="SCR" size="xs" weight="bold" color="accent"
          layout={{ position: 'absolute', left: platterCX - 10, top: deckH * 0.08 }} />
      )}
      <PixiLabel text="PWR" size="xs" font="mono" color="textMuted"
        layout={{ position: 'absolute', left: deckW * 0.76 - 10, top: deckH * 0.88 + 12 }} />
    </pixiContainer>
  );
};

/* ─── Loop button (LOOP / SLIP) — matches DOM DeckLoopControls ──────── */

const LOOP_BTN_SIZE = 40;

const PixiLoopButton: React.FC<{
  label: string;
  active: boolean;
  color: number;
  onClick: () => void;
}> = ({ label, active, color, onClick }) => {
  const theme = usePixiTheme();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, LOOP_BTN_SIZE, LOOP_BTN_SIZE, 4);
    if (active) {
      g.fill({ color, alpha: 0.4 });
      g.roundRect(0, 0, LOOP_BTN_SIZE, LOOP_BTN_SIZE, 4);
      g.stroke({ color, alpha: 0.6, width: 1 });
    } else {
      g.fill({ color: theme.bgTertiary.color });
      g.roundRect(0, 0, LOOP_BTN_SIZE, LOOP_BTN_SIZE, 4);
      g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });
    }
    // Status LED dot (top-right)
    g.circle(LOOP_BTN_SIZE - 5, 5, 2).fill({ color: active ? color : theme.border.color });
  }, [active, color, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={onClick}
      layout={{ width: LOOP_BTN_SIZE, height: LOOP_BTN_SIZE, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: LOOP_BTN_SIZE, height: LOOP_BTN_SIZE }} />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={active ? theme.text.color : theme.textSecondary.color}
        eventMode="none"
        layout={{}}
      />
    </pixiContainer>
  );
};

/* ─── Loop size button (1, 2, 4, 8, 16, 32) ─────────────────────────── */

const LOOP_SIZE_BTN_W = 28;
const LOOP_SIZE_BTN_H = 40;

const PixiLoopSizeButton: React.FC<{
  size: number;
  active: boolean;
  selected: boolean;
  color: number;
  onClick: () => void;
}> = ({ size, active, selected, color, onClick }) => {
  const theme = usePixiTheme();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, LOOP_SIZE_BTN_W, LOOP_SIZE_BTN_H, 2);
    if (active) {
      g.fill({ color, alpha: 0.5 });
      g.roundRect(0, 0, LOOP_SIZE_BTN_W, LOOP_SIZE_BTN_H, 2);
      g.stroke({ color, alpha: 0.6, width: 1 });
    } else if (selected) {
      g.fill({ color: theme.bgTertiary.color, alpha: 0.8 });
      g.roundRect(0, 0, LOOP_SIZE_BTN_W, LOOP_SIZE_BTN_H, 2);
      g.stroke({ color: theme.border.color, alpha: 0.6, width: 1 });
    } else {
      g.fill({ color: theme.bgTertiary.color });
      g.roundRect(0, 0, LOOP_SIZE_BTN_W, LOOP_SIZE_BTN_H, 2);
      g.stroke({ color: theme.border.color, alpha: 0.2, width: 1 });
    }
  }, [active, selected, color, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={onClick}
      layout={{ width: LOOP_SIZE_BTN_W, height: LOOP_SIZE_BTN_H, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: LOOP_SIZE_BTN_W, height: LOOP_SIZE_BTN_H }} />
      <pixiBitmapText
        text={String(size)}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: size >= 10 ? 9 : 11, fill: 0xffffff }}
        tint={active ? color : selected ? theme.text.color : theme.textMuted.color}
        eventMode="none"
        layout={{}}
      />
    </pixiContainer>
  );
};

/* ─── Beat phase indicator (1-2-3-4 LED dots, matches DOM DeckBeatPhase) ─── */

const BEAT_COUNT = 4;
const ON_BEAT_THRESHOLD = 0.12;

const PixiBeatPhase: React.FC<{ deckId: 'A' | 'B' | 'C'; deckColor: number }> = ({ deckId, deckColor }) => {
  const theme = usePixiTheme();
  const hasBeatGrid = useDJStore(s => !!s.decks[deckId].beatGrid);
  const timeSignature = useDJStore(s => s.decks[deckId].beatGrid?.timeSignature ?? 4);
  const viz = useDeckVisualizationData(deckId);
  const gRef = useRef<GraphicsType | null>(null);

  const drawPlaceholder = useCallback((g: GraphicsType) => {
    gRef.current = g;
    g.clear();
    for (let i = 0; i < BEAT_COUNT; i++) {
      g.roundRect(i * 13, 0, 10, 10, 2);
      g.fill({ color: theme.bgTertiary.color });
    }
  }, [theme.bgTertiary.color]);

  useTick(() => {
    const g = gRef.current;
    if (!g || !hasBeatGrid) return;
    g.clear();
    const phase = viz.getBeatPhase();
    const currentBeat = phase ? Math.floor(phase.barPhase * timeSignature) % BEAT_COUNT : -1;
    const subBeatPhase = phase ? phase.beatPhase : 0;
    const isOnBeat = subBeatPhase < ON_BEAT_THRESHOLD || subBeatPhase > (1 - ON_BEAT_THRESHOLD);

    for (let i = 0; i < BEAT_COUNT; i++) {
      const x = i * 13;
      const isActive = i === currentBeat;
      const isDownbeat = i === 0;
      g.roundRect(x, 0, 10, 10, 2);
      g.fill({ color: theme.bgTertiary.color });
      const brightness = isActive
        ? (isOnBeat ? 1.0 : Math.max(0.3, 1.0 - subBeatPhase * 0.8))
        : 0.08;
      const color = isDownbeat ? deckColor : 0xffffff;
      g.roundRect(x, 0, 10, 10, 2);
      g.fill({ color, alpha: brightness });
    }
  });

  return <pixiGraphics draw={drawPlaceholder} layout={{ width: BEAT_COUNT * 13, height: 10 }} />;
};

/* ─── Channel toggles (1-2-3-4 + ALL, matches DOM DeckChannelToggles) ───── */

const NUM_CHANNELS = 4;

const PixiChannelToggles: React.FC<{ deckId: 'A' | 'B' | 'C' }> = ({ deckId }) => {
  const channelMask = useDJStore(s => s.decks[deckId].channelMask);

  const isEnabled = (i: number) => (channelMask & (1 << i)) !== 0;
  const allEnabled = (() => { for (let i = 0; i < NUM_CHANNELS; i++) if (!isEnabled(i)) return false; return true; })();

  const handleClick = useCallback((index: number) => {
    useDJStore.getState().toggleDeckChannel(deckId, index);
  }, [deckId]);

  const handleAll = useCallback(() => {
    useDJStore.getState().setAllDeckChannels(deckId, true);
  }, [deckId]);

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: NUM_CHANNELS }, (_, i) => (
        <PixiButton
          key={i}
          label={String(i + 1)}
          variant="ft2"
          size="sm"
          width={28}
          height={28}
          color={isEnabled(i) ? 'blue' : undefined}
          active={isEnabled(i)}
          onClick={() => handleClick(i)}
        />
      ))}
      <PixiButton
        label="ALL"
        variant="ft2"
        size="sm"
        width={36}
        height={28}
        active={allEnabled}
        onClick={handleAll}
      />
    </pixiContainer>
  );
};

interface PixiDJDeckProps {
  deckId: 'A' | 'B' | 'C';
}

export const PixiDJDeck: React.FC<PixiDJDeckProps> = ({ deckId }) => {
  const theme = usePixiTheme();
  const bpm = useDJStore(s => s.decks[deckId].effectiveBPM);
  const detectedBPM = useDJStore(s => s.decks[deckId].detectedBPM);
  const trackName = useDJStore(s => s.decks[deckId].trackName);
  const trackAuthor = useDJStore(s => s.decks[deckId].trackAuthor);
  const deckFileName = useDJStore(s => s.decks[deckId].fileName);
  const pitchOffset = useDJStore(s => s.decks[deckId].pitchOffset);
  const setDeckPitch = useDJStore(s => s.setDeckPitch);
  const loopActive = useDJStore(s => s.decks[deckId].loopActive);
  const lineLoopSize = useDJStore(s => s.decks[deckId].lineLoopSize);
  const slipEnabled = useDJStore(s => s.decks[deckId].slipEnabled);
  const playbackMode = useDJStore(s => s.decks[deckId].playbackMode);
  const audioPosition = useDJStore(s => s.decks[deckId].audioPosition);
  const elapsedMs = useDJStore(s => s.decks[deckId].elapsedMs);
  const durationMs = useDJStore(s => s.decks[deckId].durationMs);
  const musicalKey = useDJStore(s => s.decks[deckId].musicalKey);
  const seratoKey = useDJStore(s => s.decks[deckId].seratoKey);
  const analysisBPM = useDJStore(s => s.decks[deckId].beatGrid?.bpm ?? 0);
  const otherDeckId = deckId === 'A' ? 'B' : 'A';
  const otherBPM = useDJStore(s => s.decks[otherDeckId].effectiveBPM);

  // Computed display values matching DOM DeckTrackInfo
  const displayBPM = analysisBPM > 0 ? analysisBPM : (playbackMode === 'audio' ? detectedBPM : bpm);
  const isBPMMatched = Math.abs(displayBPM - otherBPM) < 0.5;
  const displayKey = musicalKey ?? seratoKey ?? null;
  const pitchPercent = pitchOffset !== 0
    ? `${(Math.pow(2, pitchOffset / 12) - 1) * 100 > 0 ? '+' : ''}${((Math.pow(2, pitchOffset / 12) - 1) * 100).toFixed(1)}%`
    : null;
  const formattedTime = (() => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  })();
  const formattedRemaining = (() => {
    if (playbackMode !== 'audio' || durationMs <= 0) return null;
    const remainMs = Math.max(0, durationMs - elapsedMs);
    const totalSeconds = Math.floor(remainMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `-${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  })();

  // Author: from store or extract from Modland path
  const displayAuthor = useMemo(() => {
    if (trackAuthor) return trackAuthor;
    if (deckFileName?.startsWith('modland:')) {
      const parts = deckFileName.replace('modland:', '').split('/').filter(Boolean);
      if (parts.length >= 4) return decodeURIComponent(parts[parts.length - 2]);
    }
    return '';
  }, [trackAuthor, deckFileName]);

  // Visualizer mode cycling
  const [vizMode, setVizMode] = useState<VizMode>('spectrum');
  const cycleVizNext = useCallback(() => {
    setVizMode(prev => VIZ_MODES[(VIZ_MODES.indexOf(prev) + 1) % VIZ_MODES.length]);
  }, []);

  // Beat flash state (decays via timeout)
  const [beatFlash, setBeatFlash] = useState(0);
  const beatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBeatFlash = useCallback(() => {
    setBeatFlash(1);
    if (beatTimerRef.current) clearTimeout(beatTimerRef.current);
    beatTimerRef.current = setTimeout(() => setBeatFlash(0), 100);
  }, []);

  // View mode from global store (synced with DOM version)
  const viewMode = useDJStore(s => s.deckViewMode);

  // Nudge BPM (matches DOM DeckNudge: soft +-2 BPM for 8 ticks)
  const handleNudge = useCallback((direction: 1 | -1) => {
    try {
      const engine = getDJEngine();
      engine.getDeck(deckId).nudge(direction * 2, 8);
    } catch { /* engine not ready */ }
  }, [deckId]);

  // Loop controls matching DOM DeckLoopControls
  const handleLoopToggle = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    const s = useDJStore.getState();
    if (loopActive) {
      deck.clearLineLoop();
      s.setDeckLoop(deckId, 'off', false);
    } else {
      deck.setLineLoop(lineLoopSize);
      s.setDeckLoop(deckId, 'line', true);
    }
  }, [deckId, loopActive, lineLoopSize]);

  const handleLoopSizeChange = useCallback((size: 1 | 2 | 4 | 8 | 16 | 32) => {
    const s = useDJStore.getState();
    s.setDeckLoopSize(deckId, size);
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    deck.setLineLoop(size);
    if (!loopActive) {
      s.setDeckLoop(deckId, 'line', true);
    }
  }, [deckId, loopActive]);

  const handleSlipToggle = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    const newSlip = !slipEnabled;
    deck.setSlipEnabled(newSlip);
    useDJStore.getState().setDeckSlip(deckId, newSlip);
  }, [deckId, slipEnabled]);

  // Loop sizes matching DOM DeckLoopControls
  const LOOP_SIZES = [1, 2, 4, 8, 16, 32] as const;

  const themeId = usePixiThemeId();
  const { deckA, deckB, deckC } = getDeckColors(themeId, theme.accent, theme.accentSecondary);
  const DECK_COLOR = deckId === 'A' ? deckA : deckId === 'B' ? deckB : deckC;

  const deckNum = deckId === 'A' ? '1' : deckId === 'B' ? '2' : '3';
  const isB = deckId === 'B';

  return (
    <pixiContainer
      layout={{
        flex: 1,
        flexBasis: 0,
        height: '100%',
        flexDirection: 'column',
        padding: 6,
        gap: 4,
        overflow: 'hidden',
      }}
    >
      {/* ── Track info + turntable (matches DOM) ── */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
        <pixiContainer layout={{ flex: 1, flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
          {/* Deck label */}
          <pixiBitmapText
            text={`D E C K   ${deckNum}`}
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
            tint={DECK_COLOR}
            alpha={0.6}
            layout={{}}
          />
          {/* Scopes — below deck label, above track info (matches DOM) */}
          <PixiDeckScopes deckId={deckId} size={48} layout={{ width: 200, height: 48, flexDirection: 'row', gap: 2 }} />
          {/* Track name + author */}
          <pixiContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <pixiBitmapText
              text={trackName || 'No track loaded'}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
              tint={trackName ? theme.text.color : theme.textMuted.color}
              layout={{}}
            />
            {displayAuthor !== '' && (
              <pixiBitmapText
                text={`— ${displayAuthor}`}
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            )}
          </pixiContainer>
          {/* BPM + Key row (matches DOM DeckTrackInfo) */}
          <pixiContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {/* Beat phase indicator (1-2-3-4) */}
            <PixiBeatPhase deckId={deckId} deckColor={DECK_COLOR} />
            {/* BPM — large LED style */}
            <pixiBitmapText
              text={displayBPM > 0 ? displayBPM.toFixed(1) : '---.-'}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 24, fill: 0xffffff }}
              tint={isBPMMatched ? theme.success.color : theme.text.color}
              layout={{}}
            />
            <pixiBitmapText
              text="BPM"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            {/* Pitch percentage */}
            {pitchPercent !== null && (
              <pixiBitmapText
                text={pitchPercent}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={theme.textSecondary.color}
                layout={{}}
              />
            )}
            {/* Musical key */}
            {displayKey !== null && (
              <pixiBitmapText
                text={displayKey}
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 13, fill: 0xffffff }}
                tint={DECK_COLOR}
                layout={{}}
              />
            )}
            {/* Elapsed time */}
            <pixiBitmapText
              text={formattedTime}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
              tint={theme.textSecondary.color}
              layout={{}}
            />
            {/* Remaining time (audio mode only) */}
            {formattedRemaining !== null && (
              <pixiBitmapText
                text={formattedRemaining}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            )}
          </pixiContainer>
        </pixiContainer>
        {/* Mini turntable in visualizer mode (matches DOM) */}
        {viewMode === 'visualizer' && <PixiDeckTurntable deckId={deckId} size={80} />}
      </pixiContainer>

      {/* ── Track overview / progress bar ── */}
      <pixiContainer layout={{ height: 20, width: '100%', flexShrink: 0 }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            const barW = (g as any).layout?.computedLayout?.width ?? 280;
            const barH = 20;
            g.roundRect(0, 0, barW, barH, 2);
            g.fill({ color: theme.bg.color });
            const progress = durationMs > 0 ? Math.min(1, audioPosition / durationMs) : 0;
            if (progress > 0) {
              const fillW = Math.max(2, progress * (barW - 2));
              g.roundRect(1, 1, fillW, barH - 2, 2);
              g.fill({ color: DECK_COLOR, alpha: 0.3 });
            }
            if (progress > 0) {
              const px = Math.floor(progress * (barW - 2)) + 1;
              g.rect(px, 0, 1, barH);
              g.fill({ color: DECK_COLOR, alpha: 0.9 });
            }
            g.roundRect(0, 0, barW, barH, 2);
            g.stroke({ color: theme.border.color, alpha: 0.5, width: 1 });
          }}
          layout={{ width: '100%', height: 20 }}
        />
        {durationMs > 0 && trackName && (
          <pixiBitmapText
            text={`${formatTime(audioPosition)} / ${formatTime(durationMs)}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{ position: 'absolute', left: 4, top: 0 }}
          />
        )}
      </pixiContainer>

      {/* Waveform moved to full-width strip at top of PixiDJView */}

      {/* ── Main controls area: visualizer/vinyl + pitch slider (matches DOM flex-1 min-h-0) ── */}
      {/* Deck B uses row-reverse so pitch slider is on the left */}
      {viewMode === 'visualizer' && (
        <pixiContainer layout={{ flexDirection: isB ? 'row-reverse' : 'row', gap: 4, flex: 1, minHeight: 0 }}>
          <pixiContainer layout={{ flex: 1, minWidth: 0, minHeight: 0, flexDirection: 'column', gap: 4 }}>
            {/* Spectrum visualizer with beat flash border — flex: 1 to fill available space */}
            <pixiContainer layout={{ width: '100%', flex: 1, minHeight: 0 }}>
              <PixiSpectrumDisplay deckId={deckId} height={80} deckColor={DECK_COLOR} vizMode={vizMode} onBeatFlash={handleBeatFlash} />
              {beatFlash > 0 && (
                <pixiGraphics
                  draw={(g: GraphicsType) => {
                    g.clear();
                    const bw = (g as any).layout?.computedLayout?.width ?? 280;
                    const bh = (g as any).layout?.computedLayout?.height ?? 80;
                    g.roundRect(0, 0, bw, bh, 4).stroke({ color: DECK_COLOR, width: 3, alpha: beatFlash });
                  }}
                  layout={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  eventMode="none"
                />
              )}
            </pixiContainer>
            {/* Visualizer mode label — bottom right (matches DOM) */}
            <pixiBitmapText
              text={VIZ_LABELS[vizMode]}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={theme.textMuted.color}
              alpha={0.5}
              eventMode="static"
              cursor="pointer"
              onPointerUp={cycleVizNext}
              layout={{ position: 'absolute', bottom: 4, right: 4 }}
            />
          </pixiContainer>
          {/* Pitch slider */}
          <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center', flexShrink: 0, alignSelf: 'stretch', width: 32 }}>
            <PixiSlider
              value={pitchOffset ?? 0}
              min={-0.08}
              max={0.08}
              orientation="vertical"
              length={0}
              detent={0}
              thickness={4}
              handleWidth={24}
              handleHeight={14}
              onChange={(v) => setDeckPitch?.(deckId, v)}
              layout={{ flex: 1, minHeight: 0 }}
            />
            <pixiBitmapText
              text={`${((pitchOffset ?? 0) * 100).toFixed(1)} st`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </pixiContainer>
        </pixiContainer>
      )}

      {viewMode === 'vinyl' && (
        <pixiContainer layout={{ flexDirection: isB ? 'row-reverse' : 'row', gap: 4, flex: 1, minHeight: 0, alignItems: 'center' }}>
          <pixiContainer layout={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <PixiVinylDisplay deckId={deckId} size={250} deckColor={DECK_COLOR} />
            <pixiContainer alpha={0.55} eventMode="none" layout={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
              <PixiDeckPatternDisplay deckId={deckId} />
            </pixiContainer>
          </pixiContainer>
          {/* Pitch slider */}
          <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center', flexShrink: 0, alignSelf: 'stretch', width: 32 }}>
            <PixiSlider
              value={pitchOffset ?? 0}
              min={-0.08}
              max={0.08}
              orientation="vertical"
              length={0}
              detent={0}
              thickness={4}
              handleWidth={24}
              handleHeight={14}
              onChange={(v) => setDeckPitch?.(deckId, v)}
              layout={{ flex: 1, minHeight: 0 }}
            />
            <pixiBitmapText
              text={`${((pitchOffset ?? 0) * 100).toFixed(1)} st`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </pixiContainer>
        </pixiContainer>
      )}

      {viewMode === '3d' && (
        <pixiContainer layout={{ flexDirection: isB ? 'row-reverse' : 'row', gap: 4, flex: 1, minHeight: 0, alignItems: 'center' }}>
          <pixiContainer layout={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <PixiTurntable2D
              deckId={deckId}
              deckColor={DECK_COLOR}
              height={260}
            />
            <pixiContainer alpha={0.55} eventMode="none" layout={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
              <PixiDeckPatternDisplay deckId={deckId} />
            </pixiContainer>
          </pixiContainer>
          {/* Pitch slider */}
          <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center', flexShrink: 0, alignSelf: 'stretch', width: 32 }}>
            <PixiSlider
              value={pitchOffset ?? 0}
              min={-0.08}
              max={0.08}
              orientation="vertical"
              length={0}
              detent={0}
              thickness={4}
              handleWidth={24}
              handleHeight={14}
              onChange={(v) => setDeckPitch?.(deckId, v)}
              layout={{ flex: 1, minHeight: 0 }}
            />
            <pixiBitmapText
              text={`${((pitchOffset ?? 0) * 100).toFixed(1)} st`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </pixiContainer>
        </pixiContainer>
      )}

      {/* ── Cue points (matches DOM placement before transport) ── */}
      <PixiDeckCuePoints deckId={deckId} layout={{ width: '100%', height: 28, flexShrink: 0 }} />

      {/* ── Transport + Nudge + Loop — ALL ONE ROW (matches DOM) ── */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center', flexShrink: 0, width: '100%' }}>
        <PixiDeckTransport deckId={deckId} />
        <PixiButton icon="prev" label="" variant="default" width={40} height={40} onClick={() => handleNudge(-1)} />
        <PixiButton icon="next" label="" variant="default" width={40} height={40} onClick={() => handleNudge(1)} />
        <PixiLoopButton label="LOOP" active={loopActive} color={DECK_COLOR} onClick={handleLoopToggle} />
        {LOOP_SIZES.map((size) => (
          <PixiLoopSizeButton
            key={size}
            size={size}
            active={lineLoopSize === size && loopActive}
            selected={lineLoopSize === size}
            color={DECK_COLOR}
            onClick={() => handleLoopSizeChange(size)}
          />
        ))}
        <PixiLoopButton label="SLIP" active={slipEnabled} color={theme.warning.color} onClick={handleSlipToggle} />
      </pixiContainer>

      {/* ── Channel toggles (1-2-3-4 + ALL, matches DOM DeckChannelToggles) ── */}
      <PixiChannelToggles deckId={deckId} />

      {/* ── FX Pads + Beat Jump (matches DOM placement after transport) ── */}
      <pixiContainer layout={{ flexShrink: 0, width: '100%' }}>
        <PixiDeckFXPads deckId={deckId} />
      </pixiContainer>

      {/* ── Scratch presets + Fader LFO (matches DOM: last section) ── */}
      <PixiDeckScratch deckId={deckId} layout={{ width: '100%', flexShrink: 0 }} />

      {/* Beat grid */}
      <pixiContainer layout={{ flexShrink: 0, width: '100%' }}>
        <PixiDeckBeatGrid deckId={deckId} />
      </pixiContainer>
    </pixiContainer>
  );
};
