/**
 * PixiVelocityLane — Velocity bar display for the piano roll.
 * Renders vertical bars representing note velocities.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';

interface VelocityNote {
  start: number;     // Beat position
  velocity: number;  // 0-127
}

interface PixiVelocityLaneProps {
  width: number;
  height?: number;
  notes: VelocityNote[];
  pixelsPerBeat?: number;
  scrollBeat?: number;
  selectedIndices?: Set<number>;
}

export const PixiVelocityLane: React.FC<PixiVelocityLaneProps> = ({
  width,
  height = 80,
  notes,
  pixelsPerBeat = 40,
  scrollBeat = 0,
  selectedIndices,
}) => {
  const theme = usePixiTheme();

  const drawVelocities = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgSecondary.color, alpha: 0.5 });

    // Top border
    g.rect(0, 0, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });

    // Horizontal guide lines (at 25%, 50%, 75%, 100%)
    for (const pct of [0.25, 0.5, 0.75]) {
      const y = height - pct * (height - 4);
      g.rect(0, y, width, 1);
      g.fill({ color: theme.border.color, alpha: 0.1 });
    }

    // Velocity bars
    const barWidth = Math.max(2, pixelsPerBeat * 0.15);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const x = (n.start - scrollBeat) * pixelsPerBeat;
      if (x < -barWidth || x > width) continue;

      const barH = (n.velocity / 127) * (height - 4);
      const isSelected = selectedIndices?.has(i);

      g.rect(x, height - barH - 2, barWidth, barH);
      g.fill({ color: isSelected ? theme.warning.color : theme.accent.color, alpha: 0.7 });
    }
  }, [width, height, notes, pixelsPerBeat, scrollBeat, selectedIndices, theme]);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics draw={drawVelocities} layout={{ position: 'absolute', width, height }} />

      {/* Labels */}
      <pixiBitmapText
        text="VEL"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: 4, top: 4 }}
      />
    </pixiContainer>
  );
};
