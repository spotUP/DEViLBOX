/**
 * InstrumentSpectrogram - Scrolling time-frequency heatmap
 *
 * Features:
 * - Real-time FFT scrolling spectrogram
 * - Logarithmic frequency scale (y-axis)
 * - Color-mapped intensity (dark → cyan → green → yellow → red → white)
 * - Configurable scroll speed and resolution
 * - High-DPI (Retina) support
 * - Auto-scales to container when width="auto"
 */

import React, { useRef, useEffect, useCallback, useState, useLayoutEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { getToneEngine } from '@engine/ToneEngine';

interface InstrumentSpectrogramProps {
  instrumentId: number;
  width?: number | 'auto';
  height?: number;
  backgroundColor?: string;
  className?: string;
}

// Warm-to-hot colormap: black → dark blue → cyan → green → yellow → red → white
const COLORMAP_SIZE = 256;
const colormap: Uint8Array = new Uint8Array(COLORMAP_SIZE * 3);

// Build colormap once
(function buildColormap() {
  const stops = [
    [0, 0, 0, 0],         // black
    [0.15, 0, 20, 80],    // dark blue
    [0.3, 0, 100, 140],   // teal
    [0.45, 0, 180, 120],  // cyan-green
    [0.6, 80, 220, 0],    // green-yellow
    [0.75, 220, 220, 0],  // yellow
    [0.88, 255, 80, 0],   // orange-red
    [1.0, 255, 255, 255], // white
  ];

  for (let i = 0; i < COLORMAP_SIZE; i++) {
    const t = i / (COLORMAP_SIZE - 1);
    let lo = 0;
    for (let s = 1; s < stops.length; s++) {
      if (t <= stops[s][0]) { lo = s - 1; break; }
    }
    const hi = lo + 1;
    const range = (stops[hi][0] as number) - (stops[lo][0] as number);
    const frac = range > 0 ? (t - (stops[lo][0] as number)) / range : 0;
    colormap[i * 3 + 0] = Math.round((stops[lo][1] as number) + frac * ((stops[hi][1] as number) - (stops[lo][1] as number)));
    colormap[i * 3 + 1] = Math.round((stops[lo][2] as number) + frac * ((stops[hi][2] as number) - (stops[lo][2] as number)));
    colormap[i * 3 + 2] = Math.round((stops[lo][3] as number) + frac * ((stops[hi][3] as number) - (stops[lo][3] as number)));
  }
})();

// Pre-computed log frequency mapping (maps pixel row → FFT bin)
const logBinCache = new Map<string, number[]>();

function getLogFreqMapping(fftBins: number, rows: number): number[] {
  const key = `${fftBins}-${rows}`;
  let mapping = logBinCache.get(key);
  if (!mapping) {
    mapping = new Array(rows);
    const minBin = 1;
    const maxBin = fftBins - 1;
    const logMin = Math.log10(minBin);
    const logMax = Math.log10(maxBin);
    for (let y = 0; y < rows; y++) {
      // Bottom row = low freq, top row = high freq
      const frac = y / (rows - 1);
      const logVal = logMin + frac * (logMax - logMin);
      mapping[rows - 1 - y] = Math.min(Math.floor(Math.pow(10, logVal)), maxBin);
    }
    logBinCache.set(key, mapping);
  }
  return mapping;
}

export const InstrumentSpectrogram: React.FC<InstrumentSpectrogramProps> = ({
  instrumentId,
  width = 200,
  height = 80,
  backgroundColor = '#000000',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [logicalWidth, setLogicalWidth] = useState(width === 'auto' ? 200 : width);

  // Scrolling buffer: ImageData that we shift left each frame
  const imageDataRef = useRef<ImageData | null>(null);

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

  // Setup High-DPI canvas
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // For spectrogram we work at 1:1 pixel mapping (no DPR scaling —
    // each logical pixel IS a time/freq cell, CSS handles display scaling)
    canvas.width = logicalWidth;
    canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Fill with background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, logicalWidth, height);

    contextRef.current = ctx;
    imageDataRef.current = ctx.getImageData(0, 0, logicalWidth, height);
  }, [logicalWidth, height, backgroundColor]);

  const onFrame = useCallback((): boolean => {
    const ctx = contextRef.current;
    const imgData = imageDataRef.current;
    if (!ctx || !imgData) return false;

    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);
    if (!analyser || !analyser.hasActivity()) return false;

    const fftData = analyser.getFFT();
    const freqMapping = getLogFreqMapping(fftData.length, height);
    const w = imgData.width;
    const pixels = imgData.data;

    // Shift entire image left by 1 pixel
    for (let y = 0; y < height; y++) {
      const rowStart = y * w * 4;
      // Copy row shifted left by 1
      for (let x = 0; x < (w - 1); x++) {
        const dst = rowStart + x * 4;
        const src = rowStart + (x + 1) * 4;
        pixels[dst] = pixels[src];
        pixels[dst + 1] = pixels[src + 1];
        pixels[dst + 2] = pixels[src + 2];
        pixels[dst + 3] = pixels[src + 3];
      }
    }

    // Write new column at rightmost pixel
    const xCol = w - 1;
    for (let y = 0; y < height; y++) {
      const bin = freqMapping[y];
      const dbValue = fftData[bin] ?? -100;
      // Map dB (-100..0) to 0..1
      const normalized = Math.max(0, Math.min(1, (dbValue + 100) / 85));
      // Squared for more contrast in quiet areas
      const intensity = normalized * normalized;
      const cmIdx = Math.min(COLORMAP_SIZE - 1, Math.floor(intensity * (COLORMAP_SIZE - 1)));

      const off = (y * w + xCol) * 4;
      pixels[off] = colormap[cmIdx * 3];
      pixels[off + 1] = colormap[cmIdx * 3 + 1];
      pixels[off + 2] = colormap[cmIdx * 3 + 2];
      pixels[off + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    return true;
  }, [instrumentId, height]);

  useVisualizationAnimation({ onFrame, enabled: true, fps: 30 });

  const canvas = (
    <canvas
      ref={canvasRef}
      className={`rounded ${className}`}
      style={{
        backgroundColor,
        width: width === 'auto' ? '100%' : `${width}px`,
        height: `${height}px`,
        display: 'block',
        imageRendering: 'pixelated',
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
