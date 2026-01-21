/**
 * AccentChargeVisualizer - Devil Fish accent sweep capacitor charge
 * Shows the charge buildup during consecutive accented notes
 */

import React, { useRef, useEffect, useState } from 'react';

interface AccentChargeVisualizerProps {
  charge: number;     // 0-1 current charge level
  sweepSpeed: 'fast' | 'normal' | 'slow';
  enabled: boolean;
  height?: number;
  color?: string;
}

export const AccentChargeVisualizer: React.FC<AccentChargeVisualizerProps> = ({
  charge,
  sweepSpeed,
  enabled,
  height = 60,
  color = '#ff0066',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(120);

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

    if (!enabled) {
      // Show disabled state
      ctx.fillStyle = '#333';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DISABLED', width / 2, height / 2);
      return;
    }

    // Padding
    const padding = { top: 15, right: 10, bottom: 15, left: 10 };
    const barWidth = width - padding.left - padding.right;
    const barHeight = height - padding.top - padding.bottom;

    // Draw background bar
    ctx.fillStyle = '#222';
    ctx.fillRect(padding.left, padding.top, barWidth, barHeight);

    // Draw grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    for (let i = 1; i <= 4; i++) {
      const x = padding.left + (barWidth / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + barHeight);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw charge level with gradient
    if (charge > 0) {
      const chargeWidth = barWidth * charge;

      // Create gradient from left to right (darker to brighter)
      const gradient = ctx.createLinearGradient(
        padding.left,
        0,
        padding.left + chargeWidth,
        0
      );

      // Low charge: dim color
      gradient.addColorStop(0, `${color}40`);
      // Medium charge: medium brightness
      gradient.addColorStop(0.5, `${color}80`);
      // High charge: full brightness
      gradient.addColorStop(1, color);

      ctx.fillStyle = gradient;
      ctx.fillRect(padding.left, padding.top, chargeWidth, barHeight);

      // Add glow effect for high charge
      if (charge > 0.7) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.fillRect(padding.left, padding.top, chargeWidth, barHeight);
        ctx.shadowBlur = 0;
      }
    }

    // Draw border
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding.left, padding.top, barWidth, barHeight);

    // Draw labels
    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0%', padding.left, padding.top - 5);
    ctx.fillText('50%', padding.left + barWidth / 2, padding.top - 5);
    ctx.fillText('100%', padding.left + barWidth, padding.top - 5);

    // Draw charge percentage
    ctx.fillStyle = charge > 0.5 ? '#111' : '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(charge * 100)}%`, padding.left + barWidth / 2, padding.top + barHeight / 2 + 4);

    // Draw speed indicator
    ctx.fillStyle = '#888';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    const speedLabel = sweepSpeed === 'fast' ? 'FAST' : sweepSpeed === 'slow' ? 'SLOW' : 'NORM';
    ctx.fillText(speedLabel, padding.left + barWidth / 2, padding.top + barHeight + 12);

  }, [width, height, charge, sweepSpeed, enabled, color]);

  return (
    <div className="bg-[#1a1a1a] rounded-lg p-2 border border-gray-700 w-full">
      <div className="text-xs text-gray-400 mb-1 font-mono">Accent Charge</div>
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px` }}
        className="w-full"
      />
    </div>
  );
};
