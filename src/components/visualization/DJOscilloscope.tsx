/**
 * DJOscilloscope — Lightweight waveform visualizer using AudioDataBus.
 *
 * Unlike the main Oscilloscope (which uses ToneEngine's analyser),
 * this taps Tone.Destination via AudioDataBus, so it captures ALL audio
 * including DJ mixer output.
 *
 * Used as a fallback when no pattern data is available in DJ/VJ views.
 */

import React, { useEffect, useRef } from 'react';
import { AudioDataBus } from '@engine/vj/AudioDataBus';

interface DJOscilloscopeProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export const DJOscilloscope: React.FC<DJOscilloscopeProps> = ({
  width,
  height,
  color = '#00ccff',
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const busRef = useRef<AudioDataBus | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const bus = AudioDataBus.getShared();
    busRef.current = bus;

    const render = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(render); return; }

      const w = width ?? container?.clientWidth ?? 300;
      const h = height ?? container?.clientHeight ?? 80;
      const dpr = devicePixelRatio;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(render); return; }

      bus.update();
      const frame = bus.getFrame();
      const waveform = frame.waveform;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw waveform
      const cw = canvas.width;
      const ch = canvas.height;
      const mid = ch / 2;

      // Subtle center line
      ctx.strokeStyle = `${color}22`;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(cw, mid);
      ctx.stroke();

      // Waveform line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      const step = waveform.length / cw;
      for (let x = 0; x < cw; x++) {
        const i = Math.floor(x * step);
        const v = waveform[i] ?? 0;
        const y = mid + v * mid * 0.9;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Glow effect via shadow (subtle, not heavy)
      ctx.shadowColor = color;
      ctx.shadowBlur = 4 * dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, color]);

  return (
    <div ref={containerRef} className={className ?? 'w-full h-full'}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
