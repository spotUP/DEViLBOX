/**
 * InstrumentOscilloscope - Canvas-based waveform display for selected instrument
 *
 * Features:
 * - Real-time waveform visualization
 * - 30fps animation with idle detection
 * - Configurable colors and size
 * - Auto-scales to container when width="auto"
 * - High-DPI (Retina) support with crisp 1px lines
 */

import React, { useRef, useEffect, useCallback, useState, useLayoutEffect } from 'react';
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
  lineWidth = 1.2,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [logicalWidth, setLogicalWidth] = useState(width === 'auto' ? 200 : width);

  // Handle responsive width with ResizeObserver
  useEffect(() => {
    if (width !== 'auto') {
      setLogicalWidth(width);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        setLogicalWidth(Math.floor(rect.width));
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [width]);

  // Setup High-DPI canvas size and context scaling
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    
    // Set physical dimensions
    canvas.width = logicalWidth * dpr;
    canvas.height = height * dpr;
    
    // Scale context to match logical units
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset first
    ctx.scale(dpr, dpr);
    
    contextRef.current = ctx;
    gradientCache.clear();
  }, [logicalWidth, height]);

  // Animation frame callback
  const onFrame = useCallback((): boolean => {
    const ctx = contextRef.current;
    if (!ctx) return false;

    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);

    // Clear canvas using logical coordinates
    if (backgroundColor === 'transparent' || backgroundColor === 'rgba(0,0,0,0)') {
      ctx.clearRect(0, 0, logicalWidth, height);
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, logicalWidth, height);
    }

    // Draw center line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(logicalWidth, height / 2);
    ctx.stroke();

    if (!analyser) return false;

    const waveform = analyser.getWaveform();
    const hasActivity = analyser.hasActivity();
    if (!hasActivity) return false;

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
    // Adjust lineWidth for DPR to keep it crisp but not "fat"
    // If user provides 1.5, we keep it 1.5 logical pixels (which is 3 physical on 2x)
    // To make it look like 1.5 physical pixels, we'd need to divide by DPR.
    // However, the user said "super fat", so we'll slightly thin the default.
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    const sliceWidth = logicalWidth / waveform.length;
    let x = 0;

    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i];
      const y = ((v + 1) / 2) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }

    ctx.stroke();

    // Optional: Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    return true;
  }, [instrumentId, backgroundColor, color, lineWidth, logicalWidth, height]);

  // Start animation
  useVisualizationAnimation({
    onFrame,
    enabled: true,
  });

  const canvas = (
    <canvas
      ref={canvasRef}
      className={`rounded ${className}`}
      style={{ 
        backgroundColor: backgroundColor === 'transparent' ? 'transparent' : backgroundColor, 
        width: width === 'auto' ? '100%' : `${width}px`,
        height: `${height}px`,
        display: 'block'
      }}
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