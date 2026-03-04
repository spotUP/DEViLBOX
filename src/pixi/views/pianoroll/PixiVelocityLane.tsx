/**
 * PixiVelocityLane — Velocity bar display and editor for the piano roll.
 * - Click / drag on a bar → set velocity proportional to y position
 * - Drag across multiple bars → draw-mode edit across all bars touched
 * - Interpolated paint: fills between last and current x to prevent holes
 * - Visual tint feedback on dragged bars
 * - No undo entry committed if velocity was unchanged on release
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

  // Track which note IDs are being actively dragged (for visual tint)
  const dragActiveIdsRef = useRef<Set<string>>(new Set());
  // Track whether any velocity actually changed during this drag session
  const dragChangedRef = useRef(false);
  // Track the last local-x position so we can interpolate between frames
  const lastDragXRef = useRef<number | null>(null);
  // Track the last local-y for interpolation
  const lastDragYRef = useRef<number | null>(null);

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

  /**
   * Find all notes whose bar center x falls between x0 and x1 (inclusive).
   * Returns them sorted left-to-right.
   */
  function findNotesBetweenX(x0: number, x1: number): VelocityNote[] {
    const { notes: ns, pixelsPerBeat: ppb, scrollBeat: sb } = paramsRef.current;
    const barW = Math.max(4, ppb * BAR_WIDTH_FRAC);
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    return ns
      .filter(n => {
        const barCenterX = (n.start - sb) * ppb + barW / 2;
        return barCenterX >= lo - barW / 2 - 2 && barCenterX <= hi + barW / 2 + 2;
      })
      .sort((a, b) => a.start - b.start);
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

    // Capture initial velocity to detect whether anything actually changed
    const initialVelocity = note.velocity;

    callbacksRef.current.onDragStart?.();
    dragChangedRef.current = false;
    dragActiveIdsRef.current = new Set([note.id]);
    lastDragXRef.current = pos.x;
    lastDragYRef.current = pos.y;

    const newVel = velocityFromY(pos.y);
    if (newVel !== initialVelocity) {
      dragChangedRef.current = true;
    }
    callbacksRef.current.onVelocityChange?.(note.id, newVel);

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

      const prevX = lastDragXRef.current ?? laneLocalX;
      const prevY = lastDragYRef.current ?? laneLocalY;

      // Find all notes between the previous x and current x for interpolation
      const spannedNotes = findNotesBetweenX(prevX, laneLocalX);

      if (spannedNotes.length > 0) {
        const xRange = Math.abs(laneLocalX - prevX);
        const newActiveIds = new Set<string>();

        spannedNotes.forEach((n, idx) => {
          const { pixelsPerBeat: ppb, scrollBeat: sb } = paramsRef.current;
          const barW = Math.max(4, ppb * BAR_WIDTH_FRAC);
          const barCenterX = (n.start - sb) * ppb + barW / 2;

          // Interpolate y based on where this bar's center x falls between prevX and laneLocalX
          let interpY: number;
          if (xRange < 1) {
            interpY = laneLocalY;
          } else {
            const t = Math.max(0, Math.min(1, (barCenterX - Math.min(prevX, laneLocalX)) / xRange));
            // t goes from 0 (at earlier x) to 1 (at later x); map to y accordingly
            if (laneLocalX >= prevX) {
              interpY = prevY + t * (laneLocalY - prevY);
            } else {
              interpY = laneLocalY + t * (prevY - laneLocalY);
            }
          }

          const vel = velocityFromY(interpY);
          callbacksRef.current.onVelocityChange?.(n.id, vel);
          dragChangedRef.current = true;
          newActiveIds.add(n.id);
          void idx; // suppress unused warning
        });

        dragActiveIdsRef.current = newActiveIds;
      } else {
        // No note under cursor — check the nearest note at current x
        const n = findNoteAtX(laneLocalX);
        if (n) {
          const vel = velocityFromY(laneLocalY);
          callbacksRef.current.onVelocityChange?.(n.id, vel);
          dragChangedRef.current = true;
          dragActiveIdsRef.current = new Set([n.id]);
        }
      }

      lastDragXRef.current = laneLocalX;
      lastDragYRef.current = laneLocalY;
    };

    const onUp = () => {
      // Only commit undo entry if velocity actually changed
      if (dragChangedRef.current) {
        callbacksRef.current.onDragEnd?.();
      }
      dragActiveIdsRef.current = new Set();
      dragChangedRef.current = false;
      lastDragXRef.current = null;
      lastDragYRef.current = null;
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
      const isDragging = dragActiveIdsRef.current.has(n.id);

      g.rect(x, height - barH - 2, barW, barH);
      g.fill({ color: isSelected ? theme.warning.color : theme.accent.color, alpha: 0.7 });

      // Tip highlight
      g.rect(x, height - barH - 2, barW, 2);
      g.fill({ color: isSelected ? theme.warning.color : theme.accent.color, alpha: 1 });

      // Active drag tint — white overlay at alpha 0.3
      if (isDragging) {
        g.rect(x, height - barH - 2, barW, barH + 2);
        g.fill({ color: 0xffffff, alpha: 0.3 });
      }
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
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: 4, top: 4 }}
      />
    </pixiContainer>
  );
};
