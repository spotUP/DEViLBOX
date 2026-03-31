/**
 * LiveADSRVisualizer - Real-time ADSR envelope visualization
 *
 * Features:
 * - Shows ADSR curve with attack, decay, sustain, and release segments
 * - Animates current position marker during playback
 * - Configurable size and colors
 * - 30fps animation
 * - High-DPI (Retina) support
 */

import React, { useRef, useCallback, useLayoutEffect, useState, useEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { getVisualizationData } from '@stores/useVisualizationStore';

interface LiveADSRVisualizerProps {
  instrumentId: number;
  attack: number;  // 0-1 (seconds)
  decay: number;   // 0-1
  sustain: number; // 0-1
  release: number; // 0-1
  width?: number | 'auto';
  height?: number;
  color?: string;
  activeColor?: string;
  backgroundColor?: string;
  className?: string;
}

export const LiveADSRVisualizer: React.FC<LiveADSRVisualizerProps> = ({
  instrumentId,
  attack,
  decay,
  sustain,
  release,
  width = 200,
  height = 80,
  color = '#4ade80',
  activeColor = '#fbbf24',
  backgroundColor = 'var(--color-bg-tertiary)',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
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

  // Read visualization data directly (no Zustand subscription for high-frequency data)
  const vizData = getVisualizationData();
  const activeStage = vizData.adsrStages.get(instrumentId) || 'idle';
  const stageProgress = vizData.adsrProgress.get(instrumentId) || 0;

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
  }, [logicalWidth, height]);

  // Animation frame callback
  const onFrame = useCallback((): boolean => {
    const ctx = contextRef.current;
    if (!ctx) return false;

    // Clear canvas using logical units
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, logicalWidth, height);

    // Padding and dimensions
    const padding = { top: 10, right: 10, bottom: 10, left: 10 };
    const innerWidth = logicalWidth - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    // Calculate segments (fixed ratios for visual balance)
    const segmentWidth = innerWidth / 4;
    
    // Coordinates
    const x0 = padding.left;
    const x1 = x0 + segmentWidth;
    const x2 = x1 + segmentWidth;
    const x3 = x2 + segmentWidth;
    const x4 = x3 + segmentWidth;

    const yBottom = padding.top + innerHeight;
    const yTop = padding.top;
    const ySustain = yBottom - (innerHeight * sustain);

    // Draw grid
    ctx.strokeStyle = 'var(--color-border-light)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x0, ySustain);
    ctx.lineTo(x4, ySustain);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw curve
    ctx.beginPath();
    ctx.moveTo(x0, yBottom);
    ctx.lineTo(x1, yTop);      // Attack
    ctx.lineTo(x2, ySustain);  // Decay
    ctx.lineTo(x3, ySustain);  // Sustain
    ctx.lineTo(x4, yBottom);   // Release

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(x4, yBottom);
    ctx.lineTo(x0, yBottom);
    ctx.fillStyle = `${color}22`;
    ctx.fill();

    // Draw active position marker
    if (activeStage !== 'idle') {
      let markerX = x0;
      let markerY = yBottom;

      switch (activeStage) {
        case 'attack':
          markerX = x0 + segmentWidth * stageProgress;
          markerY = yBottom - (innerHeight * stageProgress);
          break;
        case 'decay':
          markerX = x1 + segmentWidth * stageProgress;
          markerY = yTop + (ySustain - yTop) * stageProgress;
          break;
        case 'sustain':
          markerX = x2 + segmentWidth * stageProgress;
          markerY = ySustain;
          break;
        case 'release':
          markerX = x3 + segmentWidth * stageProgress;
          markerY = ySustain + (yBottom - ySustain) * stageProgress;
          break;
      }

      // Draw glowing dot
      ctx.beginPath();
      ctx.arc(markerX, markerY, 4, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    return activeStage !== 'idle';
  }, [
    activeStage,
    stageProgress,
    attack,
    decay,
    sustain,
    release,
    logicalWidth,
    height,
    color,
    activeColor,
    backgroundColor,
  ]);

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