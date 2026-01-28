/**
 * InstrumentSpectrum - Canvas-based FFT bar display for frequency visualization
 *
 * Features:
 * - Real-time spectrum visualization
 * - Logarithmic frequency scale
 * - Gradient bars with configurable colors
 * - 30fps animation with idle detection
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { getToneEngine } from '@engine/ToneEngine';

interface InstrumentSpectrumProps {
  instrumentId: number;
  width?: number;
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
      // Logarithmic mapping: more bars in lower frequencies
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const gradientRef = useRef<CanvasGradient | null>(null);

  // Initialize canvas context and gradient
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    contextRef.current = ctx;

    // Create vertical gradient for bars
    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0, colorEnd);
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, color);
    gradientRef.current = gradient;
  }, [color, colorEnd, height]);

  // Animation frame callback
  const onFrame = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return false;

    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!analyser) {
      return false;
    }

    const fftData = analyser.getFFT();
    const hasActivity = analyser.hasActivity();

    if (!hasActivity) {
      return false;
    }

    const binMapping = getLogBinMapping(fftData.length * 2, barCount);

    // Calculate bar dimensions
    const gap = 2;
    const barWidth = (canvas.width - (barCount - 1) * gap) / barCount;

    ctx.fillStyle = gradientRef.current || color;

    for (let i = 0; i < barCount; i++) {
      // Get FFT value at mapped bin
      const binIndex = binMapping[i];
      const dbValue = fftData[binIndex] || -100;

      // Convert dB to height (normalize from -100..0 to 0..1)
      const normalizedValue = Math.max(0, (dbValue + 100) / 100);
      const barHeight = normalizedValue * canvas.height;

      if (barHeight > 0) {
        const x = i * (barWidth + gap);
        const y = canvas.height - barHeight;

        // Draw rounded bar
        const radius = Math.min(barWidth / 2, 2);
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
        ctx.fill();
      }
    }

    return true;
  }, [instrumentId, backgroundColor, color, barCount]);

  // Start animation
  useVisualizationAnimation({
    onFrame,
    enabled: true,
  });

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`rounded ${className}`}
      style={{ backgroundColor }}
    />
  );
};
