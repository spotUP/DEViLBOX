/**
 * LFOVisualizer - Displays LFO waveform with animated phase indicator
 *
 * Features:
 * - Displays LFO waveform shape (sine/tri/saw/square)
 * - Animated phase indicator (cycling dot)
 * - Rate display with optional BPM sync
 * - 30fps animation
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { useVisualizationStore } from '@stores/useVisualizationStore';

type LFOWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';

interface LFOVisualizerProps {
  instrumentId: number;
  rate: number; // Hz or BPM sync value
  depth: number; // 0-100
  waveform: LFOWaveform;
  syncToBPM?: boolean;
  bpm?: number;
  width?: number;
  height?: number;
  color?: string;
  dotColor?: string;
  backgroundColor?: string;
  className?: string;
  label?: string;
}

// Generate waveform path
function generateWaveformPath(
  waveform: LFOWaveform,
  width: number,
  height: number,
  padding: { top: number; bottom: number; left: number; right: number },
  depth: number
): string {
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const centerY = padding.top + graphHeight / 2;
  const amplitude = (graphHeight / 2) * (depth / 100);

  const points: string[] = [];
  const numPoints = 100;

  for (let i = 0; i <= numPoints; i++) {
    const phase = i / numPoints; // 0 to 1
    const x = padding.left + phase * graphWidth;

    let value = 0;
    switch (waveform) {
      case 'sine':
        value = Math.sin(phase * Math.PI * 2);
        break;
      case 'triangle':
        value = 1 - 4 * Math.abs(Math.round(phase) - phase);
        break;
      case 'sawtooth':
        value = 2 * (phase - Math.floor(phase + 0.5));
        break;
      case 'square':
        value = phase < 0.5 ? 1 : -1;
        break;
    }

    const y = centerY - value * amplitude;
    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }

  return points.join(' ');
}

// Get waveform value at phase
function getWaveformValue(waveform: LFOWaveform, phase: number): number {
  switch (waveform) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'triangle':
      return 1 - 4 * Math.abs(Math.round(phase) - phase);
    case 'sawtooth':
      return 2 * (phase - Math.floor(phase + 0.5));
    case 'square':
      return phase < 0.5 ? 1 : -1;
    default:
      return 0;
  }
}

export const LFOVisualizer: React.FC<LFOVisualizerProps> = ({
  instrumentId,
  rate,
  depth,
  waveform,
  syncToBPM = false,
  bpm = 120,
  width = 120,
  height = 50,
  color = '#a855f7',
  dotColor = '#ffffff',
  backgroundColor = '#1a1a1a',
  className = '',
  label = 'LFO',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Subscribe to visualization store for LFO phase
  const lfoPhases = useVisualizationStore((state) => state.lfoPhases);
  const setLFOPhase = useVisualizationStore((state) => state.setLFOPhase);
  void lfoPhases; // Available for multi-LFO display

  // Padding and dimensions
  const padding = { top: 4, right: 4, bottom: 16, left: 4 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const centerY = padding.top + graphHeight / 2;
  const amplitude = (graphHeight / 2) * (depth / 100);

  // Calculate actual rate in Hz
  const actualRate = syncToBPM ? (bpm / 60) * rate : rate;

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

      // Update phase based on time
      const deltaTime = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = timestamp;

      phaseRef.current = (phaseRef.current + actualRate * deltaTime) % 1;

      // Update visualization store
      setLFOPhase(instrumentId, {
        filter: phaseRef.current,
        pitch: phaseRef.current,
        rate: actualRate,
      });

      // Clear canvas
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw center line
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, centerY);
      ctx.lineTo(padding.left + graphWidth, centerY);
      ctx.stroke();

      // Generate and draw waveform path
      const waveformPath = generateWaveformPath(waveform, width, height, padding, depth);
      const path = new Path2D(waveformPath);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(path);

      // Glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.stroke(path);
      ctx.shadowBlur = 0;

      // Draw phase indicator dot
      const dotX = padding.left + phaseRef.current * graphWidth;
      const value = getWaveformValue(waveform, phaseRef.current);
      const dotY = centerY - value * amplitude;

      // Dot glow
      ctx.fillStyle = dotColor;
      ctx.shadowColor = dotColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Dot outline
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw label and rate
      ctx.fillStyle = '#666';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, padding.left, canvas.height - 2);

      ctx.textAlign = 'right';
      const rateText = syncToBPM ? `${rate}x` : `${rate.toFixed(1)}Hz`;
      ctx.fillText(rateText, canvas.width - padding.right, canvas.height - 2);

      return true; // LFO always animates
    },
    [
      instrumentId,
      waveform,
      depth,
      actualRate,
      syncToBPM,
      rate,
      color,
      dotColor,
      backgroundColor,
      label,
      width,
      height,
      padding,
      graphWidth,
      centerY,
      amplitude,
      setLFOPhase,
    ]
  );

  // Start animation
  useVisualizationAnimation({
    onFrame,
    enabled: depth > 0,
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
