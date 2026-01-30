/**
 * PitchEnvelopeCurve - Pitch sweep visualization for kick drums and frequency sweeps
 *
 * Visualizes frequency sweeps from a start frequency to an end frequency,
 * with configurable decay rate and shape. Used by FSMKick, FSMKickXP,
 * ElenzilFrequencyBomb, and similar pitch-sweeping instruments.
 */

import React, { useRef, useEffect } from 'react';

export interface PitchEnvelopeCurveProps {
  /** Start frequency (higher value) */
  startFreq: number;
  /** End frequency (lower value) */
  endFreq: number;
  /** Maximum frequency for normalization */
  freqMax?: number;
  /** Decay rate - how fast the pitch drops (0-1 or raw value) */
  decayRate?: number;
  /** Maximum decay rate for normalization */
  decayRateMax?: number;
  /** Decay shape/curve - affects the exponential nature (0-1 or raw value) */
  decayShape?: number;
  /** Maximum decay shape for normalization */
  decayShapeMax?: number;
  /** Canvas width */
  width?: number;
  /** Canvas height */
  height?: number;
  /** Primary color for the curve */
  color?: string;
  /** Secondary color for end frequency line */
  endColor?: string;
  /** Background color */
  bgColor?: string;
  /** Show frequency labels */
  showLabels?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Custom className */
  className?: string;
}

export const PitchEnvelopeCurve: React.FC<PitchEnvelopeCurveProps> = ({
  startFreq,
  endFreq,
  freqMax = 240,
  decayRate = 0.5,
  decayRateMax = 240,
  decayShape = 0.5,
  decayShapeMax = 240,
  width = 120,
  height = 48,
  color = '#ef4444',
  endColor = '#f97316',
  bgColor = '#0f172a',
  showLabels = false,
  showGrid = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const padding = 4;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    if (showGrid) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (h / 4) * i);
        ctx.lineTo(w, (h / 4) * i);
        ctx.stroke();
      }
    }

    const effectiveW = w - padding * 2;
    const effectiveH = h - padding * 2;

    // Normalize frequencies to 0-1 range
    const normStart = startFreq / freqMax;
    const normEnd = endFreq / freqMax;

    // Normalize decay parameters
    const normDecayRate = decayRate / decayRateMax;
    const normDecayShape = decayShape / decayShapeMax;

    // Calculate Y positions (inverted: higher freq = higher on canvas)
    const startY = padding + effectiveH * (1 - normStart);
    const endY = padding + effectiveH * (1 - normEnd);

    // Draw end frequency reference line (dashed)
    ctx.beginPath();
    ctx.strokeStyle = `${endColor}40`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.moveTo(padding, endY);
    ctx.lineTo(w - padding, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw pitch envelope curve
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    // Start at high frequency
    ctx.moveTo(padding, startY);

    // Draw exponential decay curve
    // The shape parameter affects the curvature
    const exponent = 1 + (normDecayShape * 3); // 1-4 range for exponential
    const decayDuration = 0.3 + normDecayRate * 0.5; // 30-80% of width

    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = padding + (t * decayDuration) * effectiveW;

      // Exponential decay formula
      const decay = Math.pow(1 - t, exponent);
      const freq = normEnd + (normStart - normEnd) * decay;
      const y = padding + effectiveH * (1 - freq);

      ctx.lineTo(x, y);
    }

    // Hold at end frequency for the rest
    const holdStartX = padding + decayDuration * effectiveW;
    ctx.lineTo(holdStartX, endY);
    ctx.lineTo(w - padding, endY);

    ctx.stroke();

    // Fill under curve with gradient
    const gradient = ctx.createLinearGradient(0, startY, 0, endY);
    gradient.addColorStop(0, `${color}30`);
    gradient.addColorStop(1, `${endColor}10`);

    ctx.lineTo(w - padding, h - padding);
    ctx.lineTo(padding, h - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw start frequency marker
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(padding + 2, startY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw labels if enabled
    if (showLabels) {
      ctx.fillStyle = '#64748b';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'left';

      // Start frequency label
      ctx.fillStyle = color;
      ctx.fillText(`${Math.round(startFreq)}`, padding + 8, startY + 3);

      // End frequency label
      ctx.fillStyle = endColor;
      ctx.fillText(`${Math.round(endFreq)}`, w - padding - 20, endY - 2);
    }

  }, [startFreq, endFreq, freqMax, decayRate, decayRateMax, decayShape,
      decayShapeMax, width, height, color, endColor, bgColor, showLabels, showGrid]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`rounded border border-gray-700 ${className}`}
    />
  );
};

export default PitchEnvelopeCurve;
