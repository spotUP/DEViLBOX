/**
 * EnvelopeCurve - Generic ADSR/ADR/ASR envelope visualization component
 *
 * Reusable component for visualizing amplitude envelopes across different
 * instrument editors. Based on Furnace's drawFMEnv pattern.
 *
 * Supports:
 * - ADSR (Attack, Decay, Sustain, Release)
 * - ADR (Attack, Decay, Release) - no sustain level
 * - ASR (Attack, Sustain, Release) - no decay phase
 * - AD (Attack, Decay only)
 */

import React, { useRef, useEffect } from 'react';

export interface EnvelopeCurveProps {
  /** Attack time (0-1 normalized or raw value if attackMax provided) */
  attack: number;
  /** Decay time - optional for ASR envelopes */
  decay?: number;
  /** Sustain level (0-1) - optional for ADR envelopes */
  sustain?: number;
  /** Release time */
  release: number;
  /** Maximum attack value for normalization */
  attackMax?: number;
  /** Maximum decay value for normalization */
  decayMax?: number;
  /** Maximum release value for normalization */
  releaseMax?: number;
  /** Canvas width */
  width?: number;
  /** Canvas height */
  height?: number;
  /** Primary color for the envelope curve */
  color?: string;
  /** Background color */
  bgColor?: string;
  /** Show phase labels (A, D, S, R) */
  showLabels?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Invert time values (higher = faster, like FM chips) */
  invertTime?: boolean;
  /** Custom className */
  className?: string;
}

export const EnvelopeCurve: React.FC<EnvelopeCurveProps> = ({
  attack,
  decay,
  sustain,
  release,
  attackMax = 1,
  decayMax = 1,
  releaseMax = 1,
  width = 120,
  height = 48,
  color = '#f59e0b',
  bgColor = '#0f172a',
  showLabels = false,
  showGrid = true,
  invertTime = false,
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

    // Normalize time values
    const normAttack = invertTime
      ? 1 - (attack / attackMax)
      : attack / attackMax;
    const normDecay = decay !== undefined && decayMax > 0
      ? (invertTime ? 1 - (decay / decayMax) : decay / decayMax)
      : 0;
    const normRelease = invertTime
      ? 1 - (release / releaseMax)
      : release / releaseMax;
    const sustainLevel = sustain !== undefined ? sustain : 0.7;

    // Calculate phase widths (proportional)
    const totalTime =
      (normAttack * 0.3) +
      (decay !== undefined ? normDecay * 0.25 : 0) +
      0.25 + // Sustain hold
      (normRelease * 0.2);

    const attackWidth = (normAttack * 0.3) / totalTime;
    const decayWidth = decay !== undefined ? (normDecay * 0.25) / totalTime : 0;
    const sustainWidth = 0.25 / totalTime;
    const releaseWidth = (normRelease * 0.2) / totalTime;

    const effectiveW = w - padding * 2;
    const effectiveH = h - padding * 2;

    // Draw envelope path
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    let x = padding;
    let y = h - padding;

    // Start at zero
    ctx.moveTo(x, y);

    // Attack phase (rise to peak)
    x += attackWidth * effectiveW;
    y = padding;
    ctx.lineTo(x, y);

    // Decay phase (fall to sustain level)
    if (decay !== undefined) {
      x += decayWidth * effectiveW;
      y = padding + effectiveH * (1 - sustainLevel);
      ctx.lineTo(x, y);
    }

    // Sustain phase (hold at sustain level)
    const sustainY = sustain !== undefined
      ? padding + effectiveH * (1 - sustainLevel)
      : padding; // If no sustain, hold at peak
    x += sustainWidth * effectiveW;
    y = sustainY;
    ctx.lineTo(x, y);

    // Release phase (fall to zero)
    x += releaseWidth * effectiveW;
    y = h - padding;
    ctx.lineTo(x, y);

    // Extend to end
    ctx.lineTo(w - padding, y);

    ctx.stroke();

    // Fill under curve
    ctx.lineTo(w - padding, h - padding);
    ctx.lineTo(padding, h - padding);
    ctx.closePath();
    ctx.fillStyle = `${color}20`;
    ctx.fill();

    // Draw labels if enabled
    if (showLabels) {
      ctx.fillStyle = '#64748b';
      ctx.font = '8px system-ui';
      ctx.textAlign = 'center';

      let labelX = padding + attackWidth * effectiveW * 0.5;
      ctx.fillText('A', labelX, h - 2);

      if (decay !== undefined) {
        labelX = padding + (attackWidth + decayWidth * 0.5) * effectiveW;
        ctx.fillText('D', labelX, h - 2);
      }

      labelX = padding + (attackWidth + decayWidth + sustainWidth * 0.5) * effectiveW;
      ctx.fillText('S', labelX, h - 2);

      labelX = padding + (attackWidth + decayWidth + sustainWidth + releaseWidth * 0.5) * effectiveW;
      ctx.fillText('R', labelX, h - 2);
    }

  }, [attack, decay, sustain, release, attackMax, decayMax, releaseMax,
      width, height, color, bgColor, showLabels, showGrid, invertTime]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`rounded border border-gray-700 ${className}`}
    />
  );
};

export default EnvelopeCurve;
