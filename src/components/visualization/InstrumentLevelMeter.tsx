/**
 * InstrumentLevelMeter - LED-style VU meter for instrument output
 *
 * Features:
 * - LED-style segmented display
 * - Peak hold indicator
 * - Horizontal or vertical orientation
 * - Smooth decay animation
 * - 30fps animation with idle detection
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { getToneEngine } from '@engine/ToneEngine';

interface InstrumentLevelMeterProps {
  instrumentId: number;
  orientation?: 'horizontal' | 'vertical';
  segments?: number;
  width?: number;
  height?: number;
  colorLow?: string;
  colorMid?: string;
  colorHigh?: string;
  backgroundColor?: string;
  className?: string;
}

// Pre-computed segment colors
const colorCache = new Map<string, string[]>();

function getSegmentColors(
  segments: number,
  colorLow: string,
  colorMid: string,
  colorHigh: string
): string[] {
  const cacheKey = `${segments}-${colorLow}-${colorMid}-${colorHigh}`;
  let colors = colorCache.get(cacheKey);

  if (!colors) {
    colors = new Array(segments);
    const lowThreshold = Math.floor(segments * 0.6);
    const midThreshold = Math.floor(segments * 0.85);

    for (let i = 0; i < segments; i++) {
      if (i < lowThreshold) {
        colors[i] = colorLow;
      } else if (i < midThreshold) {
        colors[i] = colorMid;
      } else {
        colors[i] = colorHigh;
      }
    }

    colorCache.set(cacheKey, colors);
  }

  return colors;
}

export const InstrumentLevelMeter: React.FC<InstrumentLevelMeterProps> = ({
  instrumentId,
  orientation = 'horizontal',
  segments = 16,
  width,
  height,
  colorLow = '#22c55e',
  colorMid = '#eab308',
  colorHigh = '#ef4444',
  backgroundColor = '#1a1a1a',
  className = '',
}) => {
  // Default dimensions based on orientation
  const defaultWidth = orientation === 'horizontal' ? 120 : 20;
  const defaultHeight = orientation === 'horizontal' ? 16 : 80;
  const actualWidth = width ?? defaultWidth;
  const actualHeight = height ?? defaultHeight;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // State refs for smooth animation (avoid React re-renders)
  const levelRef = useRef(0);
  const peakRef = useRef(0);
  const peakHoldTimeRef = useRef(0);

  const DECAY_RATE = 0.92;
  const PEAK_HOLD_MS = 1000;
  const PEAK_DECAY_RATE = 0.98;

  const segmentColors = getSegmentColors(segments, colorLow, colorMid, colorHigh);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    contextRef.current = ctx;
  }, []);

  // Animation frame callback
  const onFrame = useCallback(
    (timestamp: number): boolean => {
      const canvas = canvasRef.current;
      const ctx = contextRef.current;
      if (!canvas || !ctx) return false;

      const engine = getToneEngine();
      const analyser = engine.getInstrumentAnalyser(instrumentId);

      // Get current level
      const currentLevel = analyser ? analyser.getLevel() : 0;

      // Update level with decay
      if (currentLevel > levelRef.current) {
        levelRef.current = currentLevel;
      } else {
        levelRef.current *= DECAY_RATE;
        if (levelRef.current < 0.001) {
          levelRef.current = 0;
        }
      }

      // Update peak hold
      if (currentLevel > peakRef.current) {
        peakRef.current = currentLevel;
        peakHoldTimeRef.current = timestamp;
      } else if (timestamp - peakHoldTimeRef.current > PEAK_HOLD_MS) {
        // Decay peak after hold time
        peakRef.current *= PEAK_DECAY_RATE;
        if (peakRef.current < 0.001) {
          peakRef.current = 0;
        }
      }

      // Clear canvas
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const gap = 2;
      const isHorizontal = orientation === 'horizontal';

      // Calculate segment dimensions
      const segmentSize = isHorizontal
        ? (canvas.width - (segments - 1) * gap) / segments
        : (canvas.height - (segments - 1) * gap) / segments;

      const activeSegments = Math.round(levelRef.current * segments);
      const peakSegment = Math.min(Math.round(peakRef.current * segments), segments - 1);

      for (let i = 0; i < segments; i++) {
        const isLit = i < activeSegments;
        const isPeak = i === peakSegment && peakRef.current > 0;

        let x: number, y: number, w: number, h: number;

        if (isHorizontal) {
          x = i * (segmentSize + gap);
          y = 2;
          w = segmentSize;
          h = canvas.height - 4;
        } else {
          // Vertical: bottom to top
          x = 2;
          y = canvas.height - (i + 1) * (segmentSize + gap);
          w = canvas.width - 4;
          h = segmentSize;
        }

        if (isLit || isPeak) {
          ctx.fillStyle = segmentColors[i];
          ctx.globalAlpha = isPeak && !isLit ? 0.6 : 1;
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 1);
          ctx.fill();
          ctx.globalAlpha = 1;

          // Add glow for active segments
          if (isLit) {
            ctx.shadowColor = segmentColors[i];
            ctx.shadowBlur = 4;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        } else {
          // Dim segment
          ctx.fillStyle = '#333';
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 1);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      return levelRef.current > 0 || peakRef.current > 0;
    },
    [instrumentId, orientation, segments, backgroundColor, segmentColors]
  );

  // Start animation
  useVisualizationAnimation({
    onFrame,
    enabled: true,
  });

  return (
    <canvas
      ref={canvasRef}
      width={actualWidth}
      height={actualHeight}
      className={`rounded ${className}`}
      style={{ backgroundColor }}
    />
  );
};
