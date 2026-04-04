/**
 * PixiPatternOrderSidebar — Pixi/GL version of the vertical pattern order list.
 * Visually 1:1 with DOM PatternOrderSidebar. Same store data.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { useTrackerStore } from '@stores';
import { notify } from '@stores/useNotificationStore';
import { PixiContextMenu } from '../../input/PixiContextMenu';
import type { ContextMenuItem } from '../../input/PixiContextMenu';

interface PixiPatternOrderSidebarProps {
  width?: number;
  height: number;
}

const SIDEBAR_W = 56;
const HEADER_H = 18;
const ROW_H = 18;

export const PixiPatternOrderSidebar: React.FC<PixiPatternOrderSidebarProps> = ({
  width = SIDEBAR_W,
  height,
}) => {
  const theme = usePixiTheme();
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const setCurrentPattern = useTrackerStore(s => s.setCurrentPattern);

  // ── Drag-to-reorder state (declared before draw so draw can reference) ────
  const reorderPositions = useTrackerStore(s => s.reorderPositions);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  const draw = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgSecondary.color });

    // Header
    g.rect(0, 0, width, HEADER_H);
    g.fill({ color: theme.bgTertiary.color });
    g.moveTo(0, HEADER_H);
    g.lineTo(width, HEADER_H);
    g.stroke({ color: theme.border.color, width: 1 });

    // Rows
    for (let i = 0; i < patternOrder.length; i++) {
      const y = HEADER_H + i * ROW_H;
      if (y > height) break;

      const isCurrent = i === currentPositionIndex;

      if (isCurrent) {
        g.rect(0, y, width, ROW_H);
        g.fill({ color: theme.accent.color, alpha: 0.15 });
      }

      // Bottom border
      g.moveTo(0, y + ROW_H);
      g.lineTo(width, y + ROW_H);
      g.stroke({ color: theme.border.color, width: 1, alpha: 0.3 });
    }

    // Right border
    g.moveTo(width - 1, 0);
    g.lineTo(width - 1, height);
    g.stroke({ color: theme.border.color, width: 1 });
    // Drop target highlight
    if (dropTarget !== null && dragIdx !== null && dropTarget !== dragIdx) {
      const dtY = HEADER_H + dropTarget * ROW_H;
      g.rect(0, dtY, width, ROW_H);
      g.fill({ color: theme.accent.color, alpha: 0.25 });
    }
  }, [width, height, patternOrder.length, currentPositionIndex, theme, dropTarget, dragIdx]);

  // ── Drag-to-reorder + click-to-select ──────────────────────────────────────
  const posFromY = useCallback((localY: number) => {
    const idx = Math.floor((localY - HEADER_H) / ROW_H);
    return idx >= 0 && idx < patternOrder.length ? idx : null;
  }, [patternOrder.length]);

  // ── Right-click context menu ───────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);
  const duplicatePosition = useTrackerStore(s => s.duplicatePosition);
  const removeFromOrder = useTrackerStore(s => s.removeFromOrder);
  const addToOrder = useTrackerStore(s => s.addToOrder);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);

  const ctxMenuItems = useMemo((): ContextMenuItem[] => {
    if (!ctxMenu) return [];
    const idx = ctxMenu.idx;
    return [
      { label: `Duplicate Pos ${idx}`, action: () => { duplicatePosition(idx); setCtxMenu(null); } },
      { label: `Remove Pos ${idx}`, action: () => { if (patternOrder.length > 1) { removeFromOrder(idx); } setCtxMenu(null); }, disabled: patternOrder.length <= 1 },
      { label: '', separator: true },
      { label: 'Add Current Pattern', action: () => { addToOrder(currentPatternIndex); setCtxMenu(null); } },
    ];
  }, [ctxMenu, patternOrder.length, duplicatePosition, removeFromOrder, addToOrder, currentPatternIndex]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const nativeEvent = e.nativeEvent as PointerEvent;
    const local = e.getLocalPosition(e.currentTarget);
    const idx = posFromY(local.y);
    if (idx === null) return;

    // Right-click → context menu
    if (nativeEvent.button === 2) {
      setCtxMenu({ x: nativeEvent.clientX, y: nativeEvent.clientY, idx });
      return;
    }

    dragStartY.current = local.y;
    isDragging.current = false;
    setDragIdx(idx);
  }, [posFromY]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (dragIdx === null) return;
    const local = e.getLocalPosition(e.currentTarget);
    if (!isDragging.current && Math.abs(local.y - dragStartY.current) > 4) {
      isDragging.current = true;
    }
    if (isDragging.current) {
      setDropTarget(posFromY(local.y));
    }
  }, [dragIdx, posFromY]);

  const handlePointerUp = useCallback((e: FederatedPointerEvent) => {
    if (dragIdx === null) return;
    if (isDragging.current && dropTarget !== null && dropTarget !== dragIdx) {
      reorderPositions(dragIdx, dropTarget);
      notify.success('Position reordered', 2000);
    } else if (!isDragging.current) {
      // Click — select position
      const local = e.getLocalPosition(e.currentTarget);
      const idx = posFromY(local.y);
      if (idx !== null) {
        setCurrentPosition(idx, true);
        setCurrentPattern(patternOrder[idx], true);
      }
    }
    setDragIdx(null);
    setDropTarget(null);
    isDragging.current = false;
  }, [dragIdx, dropTarget, patternOrder, posFromY, reorderPositions, setCurrentPosition, setCurrentPattern]);

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

      {/* Header text */}
      <pixiBitmapText
        text="ORDER"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: 4, top: 3 }}
      />

      {/* Row labels */}
      {patternOrder.map((patIdx, posIdx) => {
        const y = HEADER_H + posIdx * ROW_H;
        if (y > height) return null;
        const isCurrent = posIdx === currentPositionIndex;
        return (
          <pixiContainer key={posIdx} layout={{ position: 'absolute', left: 0, top: y, width, height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 4 }}>
            <pixiBitmapText
              text={String(posIdx).padStart(2, '0')}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <pixiBitmapText
              text={` ${String(patIdx).padStart(2, '0')}`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={isCurrent ? theme.accent.color : theme.textSecondary.color}
              layout={{}}
            />
          </pixiContainer>
        );
      })}

      {/* Right-click context menu */}
      <PixiContextMenu
        items={ctxMenuItems}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        isOpen={!!ctxMenu}
        onClose={() => setCtxMenu(null)}
      />
    </pixiContainer>
  );
};
