/**
 * PixiVelocityLane — Velocity bar display and editor for the piano roll.
 * - Click / drag on a bar → set velocity proportional to y position
 * - Drag across multiple bars → draw-mode edit across all bars touched
 */

import { useCallback, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';

interface VelocityNote {
  id: string;        // Note ID for selection matching and callbacks
  start: number;     // Beat position
  velocity: number;  // 0-127
}

interface PixiVelocityLaneProps {
  width: number;
  height?: number;
  notes: VelocityNote[];
  pixelsPerBeat?: number;
  scrollBeat?: number;
  selectedIds?: Set<string>;
  /** Called once when a drag begins — use to capture undo snapshot */
  onDragStart?: () => void;
  /** Called while dragging to set a note's velocity (no undo per move) */
  onVelocityChange?: (noteId: string, velocity: number) => void;
  /** Called once when a drag ends — use to commit undo entry */
  onDragEnd?: () => void;
}

const BAR_WIDTH_FRAC = 0.6; // fraction of pixelsPerBeat for bar width

export const PixiVelocityLane: React.FC<PixiVelocityLaneProps> = ({
  width,
  height = 80,
  notes,
  pixelsPerBeat = 40,
  scrollBeat = 0,
  selectedIds,
  onDragStart,
  onVelocityChange,
  onDragEnd,
}) => {
  const theme = usePixiTheme();

  // Keep latest values accessible in document drag handlers
  const paramsRef = useRef({ notes, pixelsPerBeat, scrollBeat, height, width });
  paramsRef.current = { notes, pixelsPerBeat, scrollBeat, height, width };
  const callbacksRef = useRef({ onDragStart, onVelocityChange, onDragEnd });
  callbacksRef.current = { onDragStart, onVelocityChange, onDragEnd };

  // ---------- hit testing ----------
  function findNoteAtX(lx: number): VelocityNote | null {
    const { notes: ns, pixelsPerBeat: ppb, scrollBeat: sb } = paramsRef.current;
    const barW = Math.max(4, ppb * BAR_WIDTH_FRAC);
    let best: VelocityNote | null = null;
    let bestDist = Infinity;
    for (const n of ns) {
      const barX = (n.start - sb) * ppb;
      const dist = Math.abs(lx - (barX + barW / 2));
      if (dist < bestDist && lx >= barX - 2 && lx <= barX + barW + 2) {
        best = n;
        bestDist = dist;
      }
    }
    return best;
  }

  function velocityFromY(ly: number): number {
    const { height: h } = paramsRef.current;
    const usable = h - 4;
    return Math.max(1, Math.min(127, Math.round(((h - 2 - ly) / usable) * 127)));
  }

  // ---------- pointer handling ----------
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const pos = e.getLocalPosition(e.currentTarget as any);
    const note = findNoteAtX(pos.x);
    if (!note) return;

    callbacksRef.current.onDragStart?.();
    callbacksRef.current.onVelocityChange?.(note.id, velocityFromY(pos.y));

    // Capture initial client coords so we can compute local deltas on document events
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startLocalX = pos.x;
    const startLocalY = pos.y;

    const onMove = (me: PointerEvent) => {
      const cameraScale = useWorkbenchStore.getState().camera.scale;
      // Local coords = start local + client delta / camera scale
      const laneLocalX = startLocalX + (me.clientX - startClientX) / cameraScale;
      const laneLocalY = startLocalY + (me.clientY - startClientY) / cameraScale;

      const n = findNoteAtX(laneLocalX);
      if (n) {
        callbacksRef.current.onVelocityChange?.(n.id, velocityFromY(laneLocalY));
      }
    };

    const onUp = () => {
      callbacksRef.current.onDragEnd?.();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- drawing ----------
  const drawVelocities = useCallback((g: GraphicsType) => {
    g.clear();

    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgSecondary.color, alpha: 0.5 });

    g.rect(0, 0, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });

    for (const pct of [0.25, 0.5, 0.75]) {
      const y = height - pct * (height - 4);
      g.rect(0, y, width, 1);
      g.fill({ color: theme.border.color, alpha: 0.1 });
    }

    const barW = Math.max(4, pixelsPerBeat * BAR_WIDTH_FRAC);
    for (const n of notes) {
      const x = (n.start - scrollBeat) * pixelsPerBeat;
      if (x < -barW || x > width) continue;

      const barH = (n.velocity / 127) * (height - 4);
      const isSelected = selectedIds?.has(n.id);

      g.rect(x, height - barH - 2, barW, barH);
      g.fill({ color: isSelected ? theme.warning.color : theme.accent.color, alpha: 0.7 });

      // Tip highlight
      g.rect(x, height - barH - 2, barW, 2);
      g.fill({ color: isSelected ? theme.warning.color : theme.accent.color, alpha: 1 });
    }
  }, [width, height, notes, pixelsPerBeat, scrollBeat, selectedIds, theme]);

  return (
    <pixiContainer
      layout={{ width, height }}
      eventMode="static"
      cursor="ns-resize"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics draw={drawVelocities} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text="VEL"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: 4, top: 4 }}
      />
    </pixiContainer>
  );
};
