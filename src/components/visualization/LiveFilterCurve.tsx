/**
 * LiveFilterCurve - Filter response curve with real-time modulation display
 *
 * Features:
 * - Shows filter frequency response curve
 * - Animates cutoff position based on LFO/envelope modulation
 * - Shows sweep range during filter envelope
 * - 30fps animation
 * - High-DPI (Retina) support
 */

import React, { useRef, useCallback, useLayoutEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { getVisualizationData } from '@stores/useVisualizationStore';

type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

interface LiveFilterCurveProps {
  instrumentId: number;
  cutoff: number; // 20-20000 Hz
  resonance: number; // 0-30 Q
  type: FilterType;
  envelopeAmount?: number; // -100 to 100
  lfoAmount?: number; // 0-100
  width?: number;
  height?: number;
  color?: string;
  modulatedColor?: string;
  backgroundColor?: string;
  className?: string;
}

export const LiveFilterCurve: React.FC<LiveFilterCurveProps> = ({
  instrumentId,
  cutoff,
  resonance,
  type,
  envelopeAmount = 0,
  lfoAmount = 0,
  width = 200,
  height = 80,
  color = '#ff6b6b',
  modulatedColor = '#fbbf24',
  backgroundColor = '#1a1a1a',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const modulatedCutoffRef = useRef(cutoff);

  // Read visualization data directly (no Zustand subscription for high-frequency data)
  const vizData = getVisualizationData();
  const lfoPhase = vizData.lfoPhases.get(instrumentId);
  const adsrStage = vizData.adsrStages.get(instrumentId) || 'idle';
  const stageProgress = vizData.adsrProgress.get(instrumentId) || 0;

  // Padding and dimensions
  const padding = { top: 8, right: 8, bottom: 20, left: 32 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Frequency scale (logarithmic)
  const minFreq = 20;
  const maxFreq = 20000;

  const freqToX = useCallback(
    (freq: number) => {
      const logMin = Math.log10(minFreq);
      const logMax = Math.log10(maxFreq);
      const logFreq = Math.log10(Math.max(minFreq, Math.min(maxFreq, freq)));
      return padding.left + ((logFreq - logMin) / (logMax - logMin)) * graphWidth;
    },
    [graphWidth, padding.left]
  );

  // dB scale
  const minDb = -24;
  const maxDb = 24;

  const dbToY = useCallback(
    (db: number) => {
      const normalized = (db - minDb) / (maxDb - minDb);
      return padding.top + (1 - normalized) * graphHeight;
    },
    [graphHeight, padding.top]
  );

  // Generate filter response path
  const generateFilterPath = useCallback(
    (cutoffFreq: number, Q: number) => {
      const points: string[] = [];
      const numPoints = 100;

      for (let i = 0; i <= numPoints; i++) {
        const x = padding.left + (i / numPoints) * graphWidth;
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);
        const normalized = (x - padding.left) / graphWidth;
        const freq = Math.pow(10, logMin + normalized * (logMax - logMin));

        let db = 0;
        const ratio = freq / cutoffFreq;
        const q = Math.max(0.5, Q / 3);

        switch (type) {
          case 'lowpass': {
            const response = 1 / Math.sqrt(1 + Math.pow(ratio, 4));
            const peak =
              ratio > 0.7 && ratio < 1.3
                ? (q - 0.5) * 6 * Math.exp(-Math.pow((ratio - 1) * 3, 2))
                : 0;
            db = 20 * Math.log10(response) + peak;
            break;
          }
          case 'highpass': {
            const response = Math.pow(ratio, 2) / Math.sqrt(1 + Math.pow(ratio, 4));
            const peak =
              ratio > 0.7 && ratio < 1.3
                ? (q - 0.5) * 6 * Math.exp(-Math.pow((ratio - 1) * 3, 2))
                : 0;
            db = 20 * Math.log10(Math.max(0.001, response)) + peak;
            break;
          }
          case 'bandpass': {
            const bw = 1 / q;
            const response = 1 / Math.sqrt(1 + Math.pow((ratio - 1 / ratio) / bw, 2));
            db = 20 * Math.log10(response);
            break;
          }
          case 'notch': {
            const bw = 1 / q;
            const response =
              Math.abs(ratio - 1 / ratio) /
              Math.sqrt(Math.pow(ratio - 1 / ratio, 2) + bw * bw);
            db = 20 * Math.log10(Math.max(0.001, response));
            break;
          }
        }

        db = Math.max(minDb, Math.min(maxDb, db));
        const y = dbToY(db);

        points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
      }

      return points.join(' ');
    },
    [type, graphWidth, padding.left, dbToY]
  );

  // Setup High-DPI canvas size and context scaling
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    contextRef.current = ctx;
  }, [width, height]);

  // Animation frame callback
  const onFrame = useCallback((): boolean => {
    const ctx = contextRef.current;
    if (!ctx) return false;

    // Calculate modulated cutoff
    let modCutoff = cutoff;

    // Apply envelope modulation
    if (adsrStage !== 'idle' && envelopeAmount !== 0) {
      let envValue = 0;
      switch (adsrStage) {
        case 'attack':
          envValue = stageProgress;
          break;
        case 'decay':
        case 'sustain':
          envValue = 1 - stageProgress * 0.3; // Decay to sustain level
          break;
        case 'release':
          envValue = 0.7 * (1 - stageProgress);
          break;
      }

      const envMod = (envelopeAmount / 100) * envValue;
      const octaves = envMod * 4; // Up to 4 octaves of modulation
      modCutoff = cutoff * Math.pow(2, octaves);
    }

    // Apply LFO modulation
    if (lfoPhase && lfoAmount > 0) {
      const lfoValue = Math.sin(lfoPhase.filter * Math.PI * 2);
      const lfoMod = (lfoAmount / 100) * lfoValue;
      const octaves = lfoMod * 2; // Up to 2 octaves of LFO modulation
      modCutoff = modCutoff * Math.pow(2, octaves);
    }

    // Clamp to valid range
    modCutoff = Math.max(minFreq, Math.min(maxFreq, modCutoff));
    modulatedCutoffRef.current = modCutoff;

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    // Horizontal grid (dB)
    [-12, 0, 12].forEach((db) => {
      const y = dbToY(db);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + graphWidth, y);
      ctx.stroke();
    });

    // Vertical grid (frequency)
    [100, 1000, 10000].forEach((freq) => {
      const x = freqToX(freq);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + graphHeight);
      ctx.stroke();
    });

    ctx.setLineDash([]);

    // Draw modulated filter curve (if different from base)
    const hasModulation = Math.abs(modCutoff - cutoff) > 10;
    if (hasModulation) {
      const modPath = new Path2D(generateFilterPath(modCutoff, resonance));

      // Fill under modulated curve
      const fillPath = new Path2D(generateFilterPath(modCutoff, resonance));
      fillPath.lineTo(padding.left + graphWidth, dbToY(minDb));
      fillPath.lineTo(padding.left, dbToY(minDb));
      fillPath.closePath();
      ctx.fillStyle = `${modulatedColor}22`;
      ctx.fill(fillPath);

      // Draw modulated curve
      ctx.strokeStyle = modulatedColor;
      ctx.lineWidth = 2;
      ctx.stroke(modPath);

      // Glow
      ctx.shadowColor = modulatedColor;
      ctx.shadowBlur = 6;
      ctx.stroke(modPath);
      ctx.shadowBlur = 0;
    }

    // Draw base filter curve
    const basePath = new Path2D(generateFilterPath(cutoff, resonance));

    // Fill under base curve
    const fillPath = new Path2D(generateFilterPath(cutoff, resonance));
    fillPath.lineTo(padding.left + graphWidth, dbToY(minDb));
    fillPath.lineTo(padding.left, dbToY(minDb));
    fillPath.closePath();
    ctx.fillStyle = `${color}22`;
    ctx.fill(fillPath);

    // Draw base curve
    ctx.strokeStyle = hasModulation ? `${color}66` : color;
    ctx.lineWidth = 2;
    ctx.stroke(basePath);

    if (!hasModulation) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.stroke(basePath);
      ctx.shadowBlur = 0;
    }

    // Draw cutoff line
    const cutoffX = freqToX(hasModulation ? modCutoff : cutoff);
    ctx.strokeStyle = hasModulation ? modulatedColor : color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cutoffX, padding.top);
    ctx.lineTo(cutoffX, padding.top + graphHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw frequency labels
    ctx.fillStyle = '#555';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';

    [100, 1000, 10000].forEach((freq) => {
      const x = freqToX(freq);
      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
      ctx.fillText(label, x, padding.top + graphHeight + 12);
    });

    // Draw dB labels
    ctx.textAlign = 'right';
    [-12, 0, 12].forEach((db) => {
      const y = dbToY(db);
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, padding.left - 4, y + 3);
    });

    return hasModulation;
  }, [
    cutoff,
    resonance,
    envelopeAmount,
    lfoAmount,
    lfoPhase,
    adsrStage,
    stageProgress,
    color,
    modulatedColor,
    backgroundColor,
    generateFilterPath,
    freqToX,
    dbToY,
    graphWidth,
    graphHeight,
    padding,
    width,
    height
  ]);

  // Start animation
  useVisualizationAnimation({
    onFrame,
    enabled: true,
    fps: 60,
  });

  return (
    <canvas
      ref={canvasRef}
      className={`rounded ${className}`}
      style={{ 
        backgroundColor,
        width: `${width}px`,
        height: `${height}px`,
        display: 'block'
      }}
    />
  );
};