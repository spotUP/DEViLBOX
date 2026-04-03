/**
 * PixiADSRVisualizer — ADSR envelope shape visualizer for the Pixi instrument editor.
 * Draws attack/decay/sustain/release curve using Pixi Graphics.
 */

import React, { useCallback } from 'react';
import { Graphics } from 'pixi.js';
import { usePixiTheme } from '../../theme';

interface PixiADSRVisualizerProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  width: number;
  height: number;
  color?: number;
}

export const PixiADSRVisualizer: React.FC<PixiADSRVisualizerProps> = ({
  attack: _a, decay: _d, sustain, release: _r, width, height, color,
}) => {
  const theme = usePixiTheme();
  const lineColor = color ?? theme.accent.color;

  const draw = useCallback((g: Graphics) => {
    g.clear();
    const pad = 4;
    const w = width - pad * 2;
    const h = height - pad * 2;
    const segW = w / 4;

    // Background
    g.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.3 });

    // Baseline
    g.moveTo(pad, height - pad).lineTo(width - pad, height - pad)
      .stroke({ color: 0x333333, width: 1 });

    const yBottom = height - pad;
    const yTop = pad;
    const ySustain = yBottom - (h * sustain);

    const x0 = pad;
    const x1 = pad + segW;
    const x2 = pad + segW * 2;
    const x3 = pad + segW * 3;
    const x4 = pad + segW * 4;

    // Filled area
    g.moveTo(x0, yBottom);
    g.lineTo(x1, yTop);
    g.lineTo(x2, ySustain);
    g.lineTo(x3, ySustain);
    g.lineTo(x4, yBottom);
    g.closePath().fill({ color: lineColor, alpha: 0.15 });

    // Curve line
    g.moveTo(x0, yBottom);
    g.lineTo(x1, yTop);
    g.lineTo(x2, ySustain);
    g.lineTo(x3, ySustain);
    g.lineTo(x4, yBottom);
    g.stroke({ color: lineColor, width: 2 });

    // Stage dividers
    for (const x of [x1, x2, x3]) {
      g.moveTo(x, pad).lineTo(x, height - pad).stroke({ color: 0x444444, width: 1 });
    }
  }, [width, height, sustain, lineColor]);

  return <pixiGraphics draw={draw} layout={{ width, height }} />;
};
