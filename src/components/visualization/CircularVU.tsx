/**
 * CircularVU - Circular/radial VU meter visualization
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';

interface CircularVUProps {
  height?: number;
}

export const CircularVU: React.FC<CircularVUProps> = ({ height = 100 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
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

    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.4;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      const engine = getToneEngine();
      const waveform = engine.getWaveform();

      let level = 0;
      if (waveform && waveform.length > 0) {
        const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
        level = Math.min(1, rms * 10);
      }

      // Draw outer ring
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw level arcs (multiple rings)
      const numRings = 3;
      for (let i = 0; i < numRings; i++) {
        const radius = maxRadius * (0.4 + (i * 0.2));
        const intensity = Math.max(0, level - (i * 0.3));
        
        if (intensity > 0) {
          const angle = Math.PI * 2 * Math.min(intensity * 2, 1);
          
          const gradient = ctx.createLinearGradient(
            centerX - radius, centerY,
            centerX + radius, centerY
          );
          gradient.addColorStop(0, '#00d4aa');
          gradient.addColorStop(0.5, '#00ffff');
          gradient.addColorStop(1, '#00d4aa');

          ctx.strokeStyle = gradient;
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + angle);
          ctx.stroke();
        }
      }

      // Draw center dot
      ctx.fillStyle = level > 0.5 ? '#00ffff' : '#333';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
      ctx.fill();

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height]);

  return (
    <div className="w-full h-full flex items-center justify-center bg-dark-bgPrimary rounded-md border border-dark-border">
      <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px` }} />
    </div>
  );
};
