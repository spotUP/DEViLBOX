/**
 * InstrumentSpectrum - Canvas-based FFT bar display for frequency visualization
 *
 * Features:
 * - Real-time spectrum visualization
 * - Logarithmic frequency scale
 * - Gradient bars with configurable colors
 * - 30fps animation with idle detection
 * - Auto-scales to container when width="auto"
 * - High-DPI (Retina) support
 */

import React, { useRef, useEffect, useCallback, useState, useLayoutEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { getToneEngine } from '@engine/ToneEngine';

interface InstrumentSpectrumProps {
  instrumentId: number;
  width?: number | 'auto';
  height?: number;
  barCount?: number;
  color?: string;
  colorEnd?: string;
  backgroundColor?: string;
  className?: string;
}

// Pre-computed logarithmic bin mapping for different bar counts
const binMappingCache = new Map<string, number[]>();

function getLogBinMapping(fftSize: number, barCount: number): number[] {
  const cacheKey = `${fftSize}-${barCount}`;
  let mapping = binMappingCache.get(cacheKey);

  if (!mapping) {
    mapping = new Array(barCount);
    const maxFreqBin = fftSize / 2;

    for (let i = 0; i < barCount; i++) {
      const logMin = Math.log10(1);
      const logMax = Math.log10(maxFreqBin);
      const logVal = logMin + ((logMax - logMin) * i) / (barCount - 1);
      mapping[i] = Math.min(Math.floor(Math.pow(10, logVal)), maxFreqBin - 1);
    }
    binMappingCache.set(cacheKey, mapping);
  }
  return mapping;
}

export const InstrumentSpectrum: React.FC<InstrumentSpectrumProps> = ({
  instrumentId,
  width = 200,
  height = 80,
  barCount = 32,
  color = '#4ade80',
  colorEnd = '#22c55e',
  backgroundColor = '#0a0a0a',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const gradientRef = useRef<CanvasGradient | null>(null);
  const [logicalWidth, setLogicalWidth] = useState(width === 'auto' ? 200 : width);

  // Handle responsive width
  useEffect(() => {
    if (width !== 'auto') {
      requestAnimationFrame(() => setLogicalWidth(width));
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) setLogicalWidth(Math.floor(rect.width));
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
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = logicalWidth * dpr;
    canvas.height = height * dpr;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    contextRef.current = ctx;

    // Create vertical gradient
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, colorEnd);
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, color);
    gradientRef.current = gradient;
  }, [logicalWidth, height, color, colorEnd]);

  // Animation frame callback
  const onFrame = useCallback((): boolean => {
    const ctx = contextRef.current;
    if (!ctx) return false;

    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, logicalWidth, height);

    if (!analyser) return false;

    const fftData = analyser.getFFT();
    const hasActivity = analyser.hasActivity();
    if (!hasActivity) return false;

    const binMapping = getLogBinMapping(fftData.length * 2, barCount);

    // Calculate bar dimensions
    const gap = 2;
    const barWidth = (logicalWidth - (barCount - 1) * gap) / barCount;

    ctx.fillStyle = gradientRef.current || color;

    for (let i = 0; i < barCount; i++) {
      const binIndex = binMapping[i];
      const dbValue = fftData[binIndex] || -100;
      const normalizedValue = Math.max(0, (dbValue + 100) / 100);
      const barHeight = normalizedValue * height;

      if (barHeight > 0) {
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        const radius = Math.min(barWidth / 2, 2);
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
        ctx.fill();
      }
    }

    return true;
  }, [instrumentId, backgroundColor, color, barCount, logicalWidth, height]);

  // Start animation
  useVisualizationAnimation({
    onFrame,
    enabled: true,
    fps: 60,
  });

  const canvas = (
    <canvas
      ref={canvasRef}
      className={`rounded ${className}`}
      style={{ 
        backgroundColor, 
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