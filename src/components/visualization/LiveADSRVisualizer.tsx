/**
 * LiveADSRVisualizer - Animated ADSR envelope display
 *
 * Features:
 * - Shows ADSR envelope shape
 * - Animated playhead during note playback
 * - Highlights current stage (A/D/S/R) with color
 * - Reads from visualization store for stage tracking
 * - 30fps animation
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { useVisualizationStore } from '@stores/useVisualizationStore';

interface LiveADSRVisualizerProps {
  instrumentId: number;
  attack: number; // ms
  decay: number; // ms
  sustain: number; // 0-100
  release: number; // ms
  width?: number;
  height?: number;
  color?: string;
  activeColor?: string;
  backgroundColor?: string;
  className?: string;
}

type ADSRStage = 'attack' | 'decay' | 'sustain' | 'release' | 'idle';

export const LiveADSRVisualizer: React.FC<LiveADSRVisualizerProps> = ({
  instrumentId,
  attack,
  decay,
  sustain,
  release,
  width = 200,
  height = 80,
  color = '#00ff88',
  activeColor = '#ffffff',
  backgroundColor = '#1a1a1a',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Subscribe to visualization store
  const adsrStages = useVisualizationStore((state) => state.adsrStages);
  const adsrProgress = useVisualizationStore((state) => state.adsrProgress);

  const currentStage = adsrStages.get(instrumentId) || 'idle';
  const stageProgress = adsrProgress.get(instrumentId) || 0;

  // Padding and dimensions
  const padding = { top: 8, right: 8, bottom: 8, left: 8 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Calculate stage widths (proportional)
  const totalTime = attack + decay + release;
  const sustainProportion = 0.15;
  const timeProportion = 1 - sustainProportion;

  const attackWidth = totalTime > 0 ? (attack / totalTime) * graphWidth * timeProportion : graphWidth * 0.25;
  const decayWidth = totalTime > 0 ? (decay / totalTime) * graphWidth * timeProportion : graphWidth * 0.25;
  const sustainWidth = graphWidth * sustainProportion;
  const releaseWidth = totalTime > 0 ? (release / totalTime) * graphWidth * timeProportion : graphWidth * 0.25;

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    contextRef.current = ctx;
  }, []);

  // Animation frame callback
  const onFrame = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return false;

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate envelope points
    const startX = padding.left;
    const startY = padding.top + graphHeight;

    const attackEndX = startX + attackWidth;
    const attackEndY = padding.top;

    const decayEndX = attackEndX + decayWidth;
    const decayEndY = padding.top + graphHeight * (1 - sustain / 100);

    const sustainEndX = decayEndX + sustainWidth;
    const sustainEndY = decayEndY;

    const releaseEndX = padding.left + graphWidth;
    const releaseEndY = padding.top + graphHeight;

    // Draw stage separators
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    // Attack/Decay boundary
    ctx.beginPath();
    ctx.moveTo(attackEndX, padding.top);
    ctx.lineTo(attackEndX, padding.top + graphHeight);
    ctx.stroke();

    // Decay/Sustain boundary
    ctx.beginPath();
    ctx.moveTo(decayEndX, padding.top);
    ctx.lineTo(decayEndX, padding.top + graphHeight);
    ctx.stroke();

    // Sustain/Release boundary
    ctx.beginPath();
    ctx.moveTo(sustainEndX, padding.top);
    ctx.lineTo(sustainEndX, padding.top + graphHeight);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw filled envelope area
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(attackEndX, attackEndY);
    ctx.lineTo(decayEndX, decayEndY);
    ctx.lineTo(sustainEndX, sustainEndY);
    ctx.lineTo(releaseEndX, releaseEndY);
    ctx.lineTo(releaseEndX, padding.top + graphHeight);
    ctx.lineTo(startX, padding.top + graphHeight);
    ctx.closePath();

    // Fill with gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
    gradient.addColorStop(0, `${color}33`);
    gradient.addColorStop(1, `${color}11`);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw envelope line with stage highlighting
    const drawStageSegment = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      stage: ADSRStage
    ) => {
      const isActive = currentStage === stage;
      ctx.strokeStyle = isActive ? activeColor : color;
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Glow effect for active stage
      if (isActive) {
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    // Draw each stage
    drawStageSegment(startX, startY, attackEndX, attackEndY, 'attack');
    drawStageSegment(attackEndX, attackEndY, decayEndX, decayEndY, 'decay');
    drawStageSegment(decayEndX, decayEndY, sustainEndX, sustainEndY, 'sustain');
    drawStageSegment(sustainEndX, sustainEndY, releaseEndX, releaseEndY, 'release');

    // Calculate and draw playhead
    let playheadX = startX;
    if (currentStage !== 'idle') {
      switch (currentStage) {
        case 'attack':
          playheadX = startX + stageProgress * attackWidth;
          break;
        case 'decay':
          playheadX = attackEndX + stageProgress * decayWidth;
          break;
        case 'sustain':
          playheadX = decayEndX + stageProgress * sustainWidth;
          break;
        case 'release':
          playheadX = sustainEndX + stageProgress * releaseWidth;
          break;
      }

      // Draw playhead
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, padding.top);
      ctx.lineTo(playheadX, padding.top + graphHeight);
      ctx.stroke();

      // Playhead glow
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw playhead dot
      let playheadY = startY;
      if (currentStage === 'attack') {
        playheadY = startY - stageProgress * (startY - attackEndY);
      } else if (currentStage === 'decay') {
        playheadY = attackEndY + stageProgress * (decayEndY - attackEndY);
      } else if (currentStage === 'sustain') {
        playheadY = decayEndY;
      } else if (currentStage === 'release') {
        playheadY = sustainEndY + stageProgress * (releaseEndY - sustainEndY);
      }

      ctx.fillStyle = activeColor;
      ctx.beginPath();
      ctx.arc(playheadX, playheadY, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = activeColor;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw stage labels
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';

    const labelY = padding.top + graphHeight + 12;
    ctx.fillText('A', startX + attackWidth / 2, labelY);
    ctx.fillText('D', attackEndX + decayWidth / 2, labelY);
    ctx.fillText('S', decayEndX + sustainWidth / 2, labelY);
    ctx.fillText('R', sustainEndX + releaseWidth / 2, labelY);

    return currentStage !== 'idle';
  }, [
    instrumentId,
    attack,
    decay,
    sustain,
    release,
    currentStage,
    stageProgress,
    color,
    activeColor,
    backgroundColor,
    graphWidth,
    graphHeight,
    attackWidth,
    decayWidth,
    sustainWidth,
    releaseWidth,
    padding,
  ]);

  // Start animation
  useVisualizationAnimation({
    onFrame,
    enabled: true,
    fps: currentStage !== 'idle' ? 30 : 10, // Lower FPS when idle
  });

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height + 16} // Extra space for labels
      className={`rounded ${className}`}
      style={{ backgroundColor }}
    />
  );
};
