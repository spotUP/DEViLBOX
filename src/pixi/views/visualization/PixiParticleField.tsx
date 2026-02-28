/**
 * PixiParticleField — Audio-reactive particle physics visualization.
 * Particles respond to audio energy, attract to center, and have velocity/friction physics.
 */

import { useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useTransportStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

const PARTICLE_COUNT = 200;
const FRICTION = 0.97;
const CENTER_ATTRACTION = 0.002;
const AUDIO_FORCE = 15;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
}

interface PixiParticleFieldProps {
  width: number;
  height: number;
}

export const PixiParticleField: React.FC<PixiParticleFieldProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);
  const graphicsRef = useRef<GraphicsType | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  // Initialize particles
  useEffect(() => {
    const cx = width / 2, cy = height / 2;
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: cx + (Math.random() - 0.5) * width * 0.6,
      y: cy + (Math.random() - 0.5) * height * 0.6,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      size: 1 + Math.random() * 2,
      hue: Math.random(),
    }));
  }, [width, height]);

  useEffect(() => {
    if (!isPlaying || !graphicsRef.current) return;
    try { getToneEngine().enableAnalysers(); } catch { /* not ready */ }

    let rafId: number;
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;
      g.clear();

      // Background
      g.rect(0, 0, width, height);
      g.fill({ color: theme.bg.color });

      let fft: Float32Array;
      try { fft = getToneEngine().getFFT(); } catch { rafId = requestAnimationFrame(draw); return; }

      // Compute audio energy
      let energy = 0;
      const binCount = Math.min(32, fft.length);
      for (let i = 0; i < binCount; i++) {
        energy += Math.max(0, (fft[i] + 100) / 100);
      }
      energy = (energy / binCount) * AUDIO_FORCE;

      const cx = width / 2, cy = height / 2;
      const particles = particlesRef.current;

      for (const p of particles) {
        // Audio-reactive force
        const angle = Math.atan2(p.y - cy, p.x - cx);
        p.vx += Math.cos(angle) * energy * 0.1 * (Math.random() - 0.3);
        p.vy += Math.sin(angle) * energy * 0.1 * (Math.random() - 0.3);

        // Center attraction
        p.vx += (cx - p.x) * CENTER_ATTRACTION;
        p.vy += (cy - p.y) * CENTER_ATTRACTION;

        // Friction
        p.vx *= FRICTION;
        p.vy *= FRICTION;

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Wrap
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Draw
        const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
        const maxDist = Math.sqrt(cx * cx + cy * cy);
        const alpha = 0.3 + (1 - dist / maxDist) * 0.7;
        const size = p.size * (1 + energy * 0.05);

        g.circle(p.x, p.y, size);
        g.fill({ color: theme.accent.color, alpha: Math.min(1, alpha) });
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, width, height, theme]);

  const drawStatic = (g: GraphicsType) => {
    g.clear(); g.rect(0, 0, width, height); g.fill({ color: theme.bg.color });
  };

  return (
    <pixiContainer layout={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <pixiGraphics ref={graphicsRef} draw={isPlaying ? () => {} : drawStatic} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText text="PARTICLES" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }} tint={theme.textMuted.color} layout={{}} alpha={!isPlaying ? 1 : 0} />
    </pixiContainer>
  );
};
