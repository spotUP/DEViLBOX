/**
 * SamplePlaybackCursor - Animated vertical line overlay for sample waveform
 *
 * Features:
 * - Smooth 60fps position tracking
 * - Handles loop regions
 * - Configurable appearance
 * - Designed to overlay on waveform canvas
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useHighFpsAnimation } from '@hooks/useVisualizationAnimation';
import { useVisualizationStore } from '@stores/useVisualizationStore';

interface SamplePlaybackCursorProps {
  instrumentId: number;
  waveformWidth: number;
  waveformHeight?: number;
  displayStart?: number; // 0-1 normalized view start
  displayEnd?: number; // 0-1 normalized view end
  loopStart?: number; // Sample index
  loopEnd?: number; // Sample index
  totalSamples?: number; // Total sample count
  cursorColor?: string;
  loopColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const SamplePlaybackCursor: React.FC<SamplePlaybackCursorProps> = ({
  instrumentId,
  waveformWidth,
  waveformHeight = 180,
  displayStart = 0,
  displayEnd = 1,
  loopStart,
  loopEnd,
  totalSamples,
  cursorColor = '#fbbf24',
  loopColor = '#3b82f6',
  className = '',
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Subscribe to visualization store
  const samplePositions = useVisualizationStore((state) => state.samplePositions);
  const position = samplePositions.get(instrumentId);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    contextRef.current = ctx;
  }, []);

  // Update visibility
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(position !== undefined && position >= 0));
  }, [position]);

  // Animation frame callback
  const onFrame = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return false;

    // Clear canvas (transparent)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (position === undefined || position < 0) {
      return false;
    }

    // Check if position is within visible range
    const visibleRange = displayEnd - displayStart;
    const normalizedPos = position; // 0-1 position

    if (normalizedPos < displayStart || normalizedPos > displayEnd) {
      return false; // Cursor outside visible area
    }

    // Calculate cursor X position
    const relativePos = (normalizedPos - displayStart) / visibleRange;
    const cursorX = relativePos * canvas.width;

    // Draw cursor line
    ctx.strokeStyle = cursorColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, canvas.height);
    ctx.stroke();

    // Cursor glow
    ctx.shadowColor = cursorColor;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw cursor head (triangle at top)
    ctx.fillStyle = cursorColor;
    ctx.beginPath();
    ctx.moveTo(cursorX - 6, 0);
    ctx.lineTo(cursorX + 6, 0);
    ctx.lineTo(cursorX, 10);
    ctx.closePath();
    ctx.fill();

    // Optional: Draw loop region indicators
    if (loopStart !== undefined && loopEnd !== undefined && totalSamples) {
      const loopStartNorm = loopStart / totalSamples;
      const loopEndNorm = loopEnd / totalSamples;

      // Only draw if loop is within visible range
      if (loopEndNorm > displayStart && loopStartNorm < displayEnd) {
        const loopStartX = Math.max(0, ((loopStartNorm - displayStart) / visibleRange) * canvas.width);
        const loopEndX = Math.min(
          canvas.width,
          ((loopEndNorm - displayStart) / visibleRange) * canvas.width
        );

        // Loop region highlight
        ctx.fillStyle = `${loopColor}11`;
        ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, canvas.height);

        // Loop markers
        ctx.strokeStyle = loopColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // Loop start line
        if (loopStartNorm >= displayStart && loopStartNorm <= displayEnd) {
          ctx.beginPath();
          ctx.moveTo(loopStartX, 0);
          ctx.lineTo(loopStartX, canvas.height);
          ctx.stroke();
        }

        // Loop end line
        if (loopEndNorm >= displayStart && loopEndNorm <= displayEnd) {
          ctx.beginPath();
          ctx.moveTo(loopEndX, 0);
          ctx.lineTo(loopEndX, canvas.height);
          ctx.stroke();
        }

        ctx.setLineDash([]);
      }
    }

    return true;
  }, [
    position,
    displayStart,
    displayEnd,
    loopStart,
    loopEnd,
    totalSamples,
    cursorColor,
    loopColor,
  ]);

  // Use 60fps animation for smooth cursor
  useHighFpsAnimation({
    onFrame,
    enabled: isVisible,
  });

  return (
    <canvas
      ref={canvasRef}
      width={waveformWidth}
      height={waveformHeight}
      className={`pointer-events-none ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        ...style,
      }}
    />
  );
};
