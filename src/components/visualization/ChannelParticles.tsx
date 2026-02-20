/**
 * ChannelParticles - Per-channel particle field displays
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  channelIndex: number;
}

interface ChannelParticlesProps {
  height?: number;
}

export const ChannelParticles: React.FC<ChannelParticlesProps> = ({ height = 100 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef(0);
  const particlesRef = useRef<Particle[][]>([]);
  const [width, setWidth] = useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex,
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = pattern?.channels.length || 4;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) setWidth(newWidth);
      }
    });

    resizeObserver.observe(canvas.parentElement!);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const channelsPerRow = Math.min(4, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;

    // Initialize particle arrays for each channel
    particlesRef.current = Array(channelCount).fill(0).map(() => []);

    const FRAME_INTERVAL = 1000 / 30;

    const animate = () => {
      if (!mounted) return;

      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const now = performance.now();
      if (now - lastFrameTimeRef.current < FRAME_INTERVAL) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTimeRef.current = now;

      ctx.fillStyle = '#0a0a0b';
      ctx.fillRect(0, 0, width, height);

      const engine = getToneEngine();
      const waveform = engine.getWaveform();

      let baseLevel = 0;
      if (waveform && waveform.length > 0) {
        const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
        baseLevel = Math.min(1, rms * 10);
      }

      for (let ch = 0; ch < channelCount; ch++) {
        const row = Math.floor(ch / channelsPerRow);
        const col = ch % channelsPerRow;
        const x = col * cellWidth;
        const y = row * cellHeight;

        // Per-channel level
        const time = Date.now() / 1000;
        const channelPhase = ch * 2.3;
        const variation = Math.sin(time * 2.5 + channelPhase) * 0.35;
        const channelMultiplier = 0.5 + (ch % 4) * 0.25;
        const level = pattern?.channels[ch]?.muted ? 0 : Math.max(0, Math.min(1, (baseLevel * channelMultiplier) + variation));

        // Draw cell border
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellWidth, cellHeight);

        // Draw channel number
        ctx.fillStyle = '#555';
        ctx.font = '8px monospace';
        ctx.fillText(`CH${ch + 1}`, x + 4, y + 10);

        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        const maxParticles = 20;

        const particles = particlesRef.current[ch];

        // Spawn particles based on audio level
        if (level > 0.1 && particles.length < maxParticles) {
          const spawnCount = Math.floor(level * 3);
          for (let i = 0; i < spawnCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 1.5;
            particles.push({
              x: centerX,
              y: centerY,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1,
              maxLife: 0.5 + Math.random() * 0.5,
              channelIndex: ch,
            });
          }
        }

        // Update and draw particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          
          // Update physics
          p.x += p.vx;
          p.y += p.vy;
          
          // Attraction to center (slight pull back)
          const dx = centerX - p.x;
          const dy = centerY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 5) {
            p.vx += dx * 0.01;
            p.vy += dy * 0.01;
          }
          
          // Friction
          p.vx *= 0.98;
          p.vy *= 0.98;
          
          // Life decay
          p.life -= 0.02;
          
          // Remove dead particles
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
          
          // Draw particle with glow
          const alpha = p.life;
          const hue = 160 + (ch / channelCount) * 60;
          const size = 2 + alpha * 2;
          
          ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${alpha * 0.8})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
          
          // Glow
          ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${alpha * 0.2})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, channelCount, pattern]);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px` }} />
    </div>
  );
};
