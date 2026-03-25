/**
 * PixiStepSequencer — Grid-based step sequencer for drum patterns and melodic sequences.
 *
 * Layout: rows = steps (time), columns = pads/notes
 * Each cell is a toggle button with velocity (drag vertical to set velocity).
 * Ideal for drum patterns, bass sequences, and melodic step programming.
 *
 * Props:
 * - steps: number of steps (default 16)
 * - pads: array of pad definitions (note, label, color)
 * - pattern: 2D boolean/velocity grid
 */

import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

export interface StepPad {
  note: number;    // MIDI note
  label: string;   // Display name (e.g., "Kick", "Snare", "C3")
  color?: number;  // Optional accent color
}

export interface StepData {
  active: boolean;
  velocity: number; // 0-127
}

interface PixiStepSequencerProps {
  width: number;
  height: number;
  steps: number;
  pads: StepPad[];
  data: StepData[][];  // [padIndex][stepIndex]
  currentStep?: number; // Playback position highlight
  onToggle?: (padIndex: number, stepIndex: number) => void;
  onVelocityChange?: (padIndex: number, stepIndex: number, velocity: number) => void;
}

const LABEL_WIDTH = 60;
const CELL_GAP = 1;
const BEAT_HIGHLIGHT_ALPHA = 0.08;

export const PixiStepSequencer: React.FC<PixiStepSequencerProps> = ({
  width,
  height,
  steps,
  pads,
  data,
  currentStep,
  onToggle,
  onVelocityChange,
}) => {
  const theme = usePixiTheme();
  const [dragState, setDragState] = useState<{ pad: number; step: number } | null>(null);

  const gridW = width - LABEL_WIDTH;
  const cellW = Math.max(4, (gridW - (steps - 1) * CELL_GAP) / steps);
  const cellH = Math.max(8, (height - (pads.length - 1) * CELL_GAP) / pads.length);

  const getCellAt = (localX: number, localY: number): { pad: number; step: number } | null => {
    const step = Math.floor((localX - LABEL_WIDTH) / (cellW + CELL_GAP));
    const pad = Math.floor(localY / (cellH + CELL_GAP));
    if (step < 0 || step >= steps || pad < 0 || pad >= pads.length) return null;
    return { pad, step };
  };

  const draw = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });

    // Label area background
    g.rect(0, 0, LABEL_WIDTH, height);
    g.fill({ color: theme.bgSecondary.color });

    // Draw cells
    for (let p = 0; p < pads.length; p++) {
      const y = p * (cellH + CELL_GAP);
      const padColor = pads[p].color ?? theme.accent.color;

      // Pad label background
      g.rect(0, y, LABEL_WIDTH - 2, cellH);
      g.fill({ color: theme.bgTertiary.color });

      for (let s = 0; s < steps; s++) {
        const x = LABEL_WIDTH + s * (cellW + CELL_GAP);
        const cell = data[p]?.[s];
        const isActive = cell?.active ?? false;
        const velocity = cell?.velocity ?? 100;
        const isBeat = s % 4 === 0;
        const isCurrentStep = s === currentStep;

        // Cell background
        if (isCurrentStep) {
          g.rect(x, y, cellW, cellH);
          g.fill({ color: theme.accent.color, alpha: 0.15 });
        } else if (isBeat) {
          g.rect(x, y, cellW, cellH);
          g.fill({ color: theme.textMuted.color, alpha: BEAT_HIGHLIGHT_ALPHA });
        }

        // Active cell
        if (isActive) {
          const velAlpha = 0.3 + (velocity / 127) * 0.7;
          g.roundRect(x + 1, y + 1, cellW - 2, cellH - 2, 2);
          g.fill({ color: padColor, alpha: velAlpha });

          // Velocity bar (fill from bottom)
          const barH = ((velocity / 127) * (cellH - 4));
          g.rect(x + 1, y + cellH - 1 - barH, cellW - 2, barH);
          g.fill({ color: padColor, alpha: 0.3 });
        }

        // Cell border
        g.roundRect(x, y, cellW, cellH, 2);
        g.stroke({
          color: isActive ? padColor : theme.border.color,
          alpha: isActive ? 0.6 : 0.2,
          width: 1,
        });
      }
    }

    // Playback cursor line
    if (currentStep !== undefined && currentStep >= 0 && currentStep < steps) {
      const cx = LABEL_WIDTH + currentStep * (cellW + CELL_GAP) + cellW / 2;
      g.moveTo(cx, 0);
      g.lineTo(cx, height);
      g.stroke({ color: theme.accent.color, alpha: 0.5, width: 2 });
    }
  }, [width, height, steps, pads, data, currentStep, cellW, cellH, theme]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const cell = getCellAt(local.x, local.y);
    if (!cell) return;

    onToggle?.(cell.pad, cell.step);
    setDragState(cell);
  }, [steps, pads.length, cellW, cellH, onToggle]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!dragState) return;
    const local = e.getLocalPosition(e.currentTarget);
    // Vertical drag on active cell = velocity
    const cell = data[dragState.pad]?.[dragState.step];
    if (cell?.active) {
      const cellY = dragState.pad * (cellH + CELL_GAP);
      const relY = 1 - Math.max(0, Math.min(1, (local.y - cellY) / cellH));
      const newVel = Math.round(relY * 127);
      onVelocityChange?.(dragState.pad, dragState.step, newVel);
    }
  }, [dragState, data, cellH, onVelocityChange]);

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics
        draw={draw}
        eventMode="static"
        cursor="pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerUpOutside={handlePointerUp}
        layout={{ width, height }}
      />
      {/* Pad labels */}
      {pads.map((pad, i) => (
        <pixiBitmapText
          key={i}
          text={pad.label}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={pad.color ?? theme.textSecondary.color}
          layout={{
            position: 'absolute',
            left: 4,
            top: i * (cellH + CELL_GAP) + Math.max(0, (cellH - 12) / 2),
          }}
        />
      ))}
    </pixiContainer>
  );
};
