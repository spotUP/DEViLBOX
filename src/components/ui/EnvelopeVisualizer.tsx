/**
 * EnvelopeVisualizer - Real-time envelope visualization
 * Shows filter envelope shape with current position indicator
 */

import React, { useRef, useEffect, useState } from 'react';

interface EnvelopeVisualizerProps {
  attack?: number;    // ms
  decay: number;      // ms
  sustain?: number;   // 0-1
  release?: number;   // ms
  envMod: number;     // 0-100 (envelope modulation depth)
  currentPosition?: number; // 0-1 current envelope position (live playback)
  isActive?: boolean; // Whether envelope is currently playing
  height?: number;
  color?: string;
  label?: string;
}

export const EnvelopeVisualizer: React.FC<EnvelopeVisualizerProps> = ({
  attack = 3,
  decay,
  sustain = 0,
  release = 50,
  envMod,
  currentPosition,
  isActive = false,
  height = 50,
  color = '#ff6600',
  label = 'Filter Envelope',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(280);

  // Get theme colors from CSS variables
  const getThemeColors = () => {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    return {
      gridColor: computedStyle.getPropertyValue('--color-border-light').trim() || '#403535',
      labelColor: computedStyle.getPropertyValue('--color-text-muted').trim() || '#686060',
    };
  };

  // ResizeObserver for dynamic width
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) {
          setWidth(newWidth);
        }
      }
    });

    resizeObserver.observe(canvas.parentElement!);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get theme colors
    const themeColors = getThemeColors();

    // Padding - reduced for smaller size
    const padding = { top: 6, right: 8, bottom: 14, left: 8 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Calculate total time (attack + decay + release)
    const totalTime = attack + decay + release;
    const timeToX = (time: number) => padding.left + (time / totalTime) * graphWidth;

    // Calculate envelope points
    const points: { x: number; y: number }[] = [];

    // Start point
    points.push({ x: padding.left, y: padding.top + graphHeight });

    // Attack peak (based on envMod)
    const peakValue = envMod / 100;
    const attackX = timeToX(attack);
    points.push({ x: attackX, y: padding.top + graphHeight * (1 - peakValue) });

    // Decay to sustain
    const decayX = timeToX(attack + decay);
    const sustainValue = sustain * peakValue; // Sustain is relative to peak
    points.push({ x: decayX, y: padding.top + graphHeight * (1 - sustainValue) });

    // Sustain plateau (brief)
    const sustainDuration = Math.min(totalTime * 0.1, 50);
    const sustainEndX = timeToX(attack + decay + sustainDuration);
    points.push({ x: sustainEndX, y: padding.top + graphHeight * (1 - sustainValue) });

    // Release to zero
    points.push({ x: padding.left + graphWidth, y: padding.top + graphHeight });

    // Draw grid
    ctx.strokeStyle = themeColors.gridColor;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 3]);

    // Horizontal grid lines - reduced to 3 lines for smaller height
    for (let i = 0; i <= 2; i++) {
      const y = padding.top + (graphHeight / 2) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + graphWidth, y);
      ctx.stroke();
    }

    // Draw envelope curve
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    points.forEach((point, i) => {
      if (i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    // Fill under curve
    ctx.fillStyle = `${color}33`; // 20% opacity
    ctx.beginPath();
    points.forEach((point, i) => {
      if (i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.lineTo(padding.left + graphWidth, padding.top + graphHeight);
    ctx.lineTo(padding.left, padding.top + graphHeight);
    ctx.closePath();
    ctx.fill();

    // Draw current position indicator
    if (isActive && currentPosition !== undefined) {
      let currentX: number;
      let currentY: number;

      // Calculate position along envelope
      const attackPhase = attack / totalTime;
      const decayPhase = (attack + decay) / totalTime;
      const sustainPhase = (attack + decay + sustainDuration) / totalTime;

      if (currentPosition < attackPhase) {
        // In attack phase
        const t = currentPosition / attackPhase;
        currentX = padding.left + t * (attackX - padding.left);
        currentY = padding.top + graphHeight - t * graphHeight * peakValue;
      } else if (currentPosition < decayPhase) {
        // In decay phase
        const t = (currentPosition - attackPhase) / (decayPhase - attackPhase);
        currentX = attackX + t * (decayX - attackX);
        currentY = padding.top + graphHeight * (1 - peakValue + t * (peakValue - sustainValue));
      } else if (currentPosition < sustainPhase) {
        // In sustain phase
        const t = (currentPosition - decayPhase) / (sustainPhase - decayPhase);
        currentX = decayX + t * (sustainEndX - decayX);
        currentY = padding.top + graphHeight * (1 - sustainValue);
      } else {
        // In release phase
        const t = (currentPosition - sustainPhase) / (1 - sustainPhase);
        currentX = sustainEndX + t * (padding.left + graphWidth - sustainEndX);
        currentY = padding.top + graphHeight * (1 - sustainValue * (1 - t));
      }

      // Draw playhead line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(currentX, padding.top);
      ctx.lineTo(currentX, padding.top + graphHeight);
      ctx.stroke();

      // Draw playhead circle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(currentX, currentY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(currentX, currentY, 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw labels
    ctx.fillStyle = themeColors.labelColor;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';

    // Attack label
    ctx.fillText('A', timeToX(attack / 2), padding.top + graphHeight + 10);
    // Decay label
    ctx.fillText('D', timeToX(attack + decay / 2), padding.top + graphHeight + 10);
    // Release label
    ctx.fillText('R', padding.left + graphWidth - 8, padding.top + graphHeight + 10);

  }, [width, height, attack, decay, sustain, release, envMod, currentPosition, isActive, color]);

  return (
    <div className="rounded-lg p-1.5 border w-full" style={{
      backgroundColor: 'var(--color-bg-secondary)',
      borderColor: 'var(--color-border)'
    }}>
      <div className="text-[10px] mb-0.5 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px` }}
        className="w-full"
      />
      <div className="flex justify-between mt-0.5 text-[9px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
        <div>Decay: {decay}ms</div>
        <div>Mod: {envMod}%</div>
      </div>
    </div>
  );
};
