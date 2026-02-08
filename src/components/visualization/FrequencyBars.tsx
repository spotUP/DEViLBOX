/**
 * FrequencyBars - 3D-style frequency bars visualization
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';

interface FrequencyBarsProps {
  height?: number;
}

export const FrequencyBars: React.FC<FrequencyBarsProps> = ({ height = 100 }) => {
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

    const numBars = 32;
    const barWidth = width / numBars;
    const smoothedValues = new Array(numBars).fill(0);

    const animate = () => {
      ctx.fillStyle = '#0a0a0b';
      ctx.fillRect(0, 0, width, height);

      const engine = getToneEngine();
      const fft = engine.getFFT();

      if (fft) {
        const values = fft;
        const step = Math.floor(values.length / numBars);

        for (let i = 0; i < numBars; i++) {
          const value = values[i * step];
          const normalized = (value + 140) / 140; // Convert dB to 0-1
          const targetHeight = Math.max(0, Math.min(1, normalized)) * height * 0.9;
          
          // Smooth the values
          smoothedValues[i] += (targetHeight - smoothedValues[i]) * 0.3;

          const x = i * barWidth;
          const barHeight = smoothedValues[i];

          // Create gradient for 3D effect
          const gradient = ctx.createLinearGradient(x, height - barHeight, x, height);
          gradient.addColorStop(0, '#00ffff');
          gradient.addColorStop(0.5, '#00d4aa');
          gradient.addColorStop(1, '#006655');

          ctx.fillStyle = gradient;
          ctx.fillRect(x + 1, height - barHeight, barWidth - 2, barHeight);

          // Top highlight
          ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
          ctx.fillRect(x + 1, height - barHeight, barWidth - 2, 2);

          // Side shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(x + barWidth - 2, height - barHeight, 1, barHeight);
        }
      }

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
