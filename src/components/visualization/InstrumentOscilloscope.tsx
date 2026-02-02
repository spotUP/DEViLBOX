/**
 * InstrumentOscilloscope - Canvas-based waveform display for selected instrument
 *
 * Features:
 * - Real-time waveform visualization
 * - 30fps animation with idle detection
 * - Configurable colors and size
 * - Auto-scales to container when width="auto"
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { getToneEngine } from '@engine/ToneEngine';

interface InstrumentOscilloscopeProps {
  instrumentId: number;
  width?: number | 'auto';
  height?: number;
  color?: string;
  backgroundColor?: string;
  lineWidth?: number;
  className?: string;
}

// Color cache for gradient creation
const gradientCache = new Map<string, CanvasGradient>();

export const InstrumentOscilloscope: React.FC<InstrumentOscilloscopeProps> = ({
  instrumentId,
  width = 200,
  height = 80,
  color = '#4ade80',
  backgroundColor = '#0a0a0a',
  lineWidth = 1.5,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(width === 'auto' ? 200 : width);

  // Handle responsive width with ResizeObserver
  useEffect(() => {
    if (width !== 'auto') {
      setCanvasWidth(width);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        setCanvasWidth(Math.floor(rect.width));
      }
    };

    // Initial measurement
    updateWidth();

    // Watch for container resize
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [width]);

  // Initialize canvas context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use alpha: true to support transparent clearing
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    contextRef.current = ctx;

    // Clear gradient cache when color changes
    gradientCache.clear();
  }, [color, canvasWidth]);

  // Animation frame callback
  const onFrame = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return false;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== canvasWidth * dpr) {
      canvas.width = canvasWidth * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    }

    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);

    // Clear canvas - use clearRect if transparent, fillRect otherwise
    if (backgroundColor === 'transparent' || backgroundColor === 'rgba(0,0,0,0)') {
      ctx.clearRect(0, 0, canvasWidth, height);
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvasWidth, height);
    }

    // Draw center line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(canvasWidth, height / 2);
    ctx.stroke();

    if (!analyser) {
      return false;
    }

    const waveform = analyser.getWaveform();
    const hasActivity = analyser.hasActivity();

    if (!hasActivity) {
      return false;
    }

    // Get or create gradient
    const gradientKey = `${color}-${height}`;
    let gradient = gradientCache.get(gradientKey);
    if (!gradient) {
      gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, color);
      gradientCache.set(gradientKey, gradient);
    }

    // Draw waveform
    ctx.strokeStyle = gradient;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    const sliceWidth = canvasWidth / waveform.length;
    let x = 0;

    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i];
      const y = ((v + 1) / 2) * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();

    // Optional: Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    return true;
  }, [instrumentId, backgroundColor, color, lineWidth]);

  // Start animation
  useVisualizationAnimation({
    onFrame,
    enabled: true,
  });

  // Wrap in container for auto-width measurement
  const canvas = (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={height}
      className={`rounded ${className}`}
      style={{ backgroundColor, width: width === 'auto' ? '100%' : undefined }}
    />
  );

  if (width === 'auto') {
    return (
      <div ref={containerRef} className="w-full h-full">
        {canvas}
      </div>
    );
  }

  return canvas;
};
