/**
 * ParticleField - Audio-reactive particle system visualization
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
}

interface ParticleFieldProps {
  height?: number;
}

export const ParticleField: React.FC<ParticleFieldProps> = ({ height = 100 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const [width, setWidth] = useState(300);

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

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const particles = particlesRef.current;

    // Enable analysers when visualization is active
    const engine = getToneEngine();
    engine.enableAnalysers();

    const createParticle = (x: number, y: number, intensity: number): Particle => ({
      x,
      y,
      vx: (Math.random() - 0.5) * intensity * 4,
      vy: (Math.random() - 0.5) * intensity * 4,
      size: Math.random() * 3 + 1,
      life: 1.0,
    });

    const FRAME_INTERVAL = 1000 / 30;

    const animate = () => {
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

      // Fade out effect
      ctx.fillStyle = 'rgba(10, 10, 11, 0.15)';
      ctx.fillRect(0, 0, width, height);

      const engine = getToneEngine();
      const waveform = engine.getWaveform();

      let level = 0;
      if (waveform && waveform.length > 0) {
        const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
        level = Math.min(1, rms * 10);
      }

      // Spawn new particles based on audio level
      if (level > 0.1 && particles.length < 150) {
        const numNew = Math.floor(level * 8);
        for (let i = 0; i < numNew; i++) {
          particles.push(createParticle(
            width / 2 + (Math.random() - 0.5) * 40,
            height / 2 + (Math.random() - 0.5) * 40,
            level
          ));
        }
      }

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.015;

        // Apply gravity/attraction to center (using squared distance to avoid sqrt)
        const dx = width / 2 - p.x;
        const dy = height / 2 - p.y;
        const distSq = dx * dx + dy * dy;
        const threshold = 20 * 20; // 400
        if (distSq > threshold) {
          // Use inverse square law for force (eliminates sqrt)
          const strength = 2.0 / distSq; // Adjusted for similar visual effect
          p.vx += dx * strength;
          p.vy += dy * strength;
        }

        // Damping
        p.vx *= 0.98;
        p.vy *= 0.98;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        // Draw particle
        const alpha = p.life;
        const hue = (p.life * 60 + 160) % 360;
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();

        // Draw glow
        if (level > 0.5) {
          ctx.fillStyle = `hsla(${hue}, 100%, 80%, ${alpha * 0.3})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      particlesRef.current = [];
      // Disable analysers to save CPU when visualization unmounts
      engine.disableAnalysers();
    };
  }, [width, height]);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px` }} />
    </div>
  );
};
