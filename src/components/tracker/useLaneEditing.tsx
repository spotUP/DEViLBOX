/**
 * Editing an automation lane: press or drag to write points, double-click to
 * remove one, right-click for presets / clear / remove.
 *
 * Shared by the per-channel lanes (AutomationLanes) and the GLOBAL lane
 * (GlobalLaneCurves), so the global dub curves edit exactly like a channel's.
 * Positions are measured against `containerRef`; each lane passes its own
 * left edge, width and vertical offset within that container.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useAutomationStore } from '@stores';
import type { AutomationCurve, AutomationPreset } from '@typedefs/automation';
import { ContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { Trash2, Eraser } from 'lucide-react';

/** Row and 0..1 value under a pointer, for a lane at laneLeft/laneWidth. */
export function laneValueAt(
  clientX: number, clientY: number, container: DOMRect,
  laneLeft: number, laneWidth: number, yOffset: number, rowHeight: number,
): { row: number; value: number } {
  const row = Math.floor((clientY - container.top - yOffset) / rowHeight);
  const value = Math.max(0, Math.min(1, (clientX - container.left - laneLeft - 1) / (laneWidth - 2)));
  return { row, value };
}

interface DragState { curveId: string; laneLeft: number; laneWidth: number; yOffset: number }

export function useLaneEditing(opts: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  rowHeight: number;
  patternLength: number;
}) {
  const { containerRef, rowHeight, patternLength } = opts;
  const addPoint = useAutomationStore((s) => s.addPoint);
  const removePoint = useAutomationStore((s) => s.removePoint);
  const presets = useAutomationStore((s) => s.presets);
  const applyPreset = useAutomationStore((s) => s.applyPreset);
  const clearPoints = useAutomationStore((s) => s.clearPoints);
  const removeCurve = useAutomationStore((s) => s.removeCurve);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; curveId: string } | null>(null);

  /** Pointer down on a lane: write the point under it and start a drag. */
  const beginDraw = useCallback((
    e: React.PointerEvent, curve: AutomationCurve, laneLeft: number, yOffset: number, laneWidth: number,
  ) => {
    if (e.button !== 0) return; // primary contact only
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { row, value } = laneValueAt(e.clientX, e.clientY, rect, laneLeft, laneWidth, yOffset, rowHeight);
    if (row < 0 || row >= patternLength) return;
    addPoint(curve.id, row, value);
    setDrag({ curveId: curve.id, laneLeft, laneWidth, yOffset });
  }, [containerRef, rowHeight, patternLength, addPoint]);

  // Document-level move/up so a drag continues when the pointer strays
  // outside the lane and back in. `pointercancel` counts as a release: a
  // finger sends it when the browser takes the pointer away, and a lane left
  // in drag state would keep writing points.
  React.useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { row, value } = laneValueAt(e.clientX, e.clientY, rect, drag.laneLeft, drag.laneWidth, drag.yOffset, rowHeight);
      if (row < 0 || row >= patternLength) return;
      addPoint(drag.curveId, row, value);
    };
    const up = () => setDrag(null);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
  }, [drag, containerRef, rowHeight, patternLength, addPoint]);

  /** Double-click: remove the point on that row, if there is one. */
  const removePointAt = useCallback((e: React.MouseEvent, curve: AutomationCurve, yOffset: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const row = Math.floor((e.clientY - rect.top - yOffset) / rowHeight);
    if (row < 0 || row >= patternLength) return;
    if (curve.points.some((p) => p.row === row)) removePoint(curve.id, row);
  }, [containerRef, rowHeight, patternLength, removePoint]);

  /** Right-click: the lane menu. */
  const openMenu = useCallback((e: React.MouseEvent, curveId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, curveId });
  }, []);

  // Presets are authored against a 64-row pattern; rescale rows to this one.
  const applyPresetScaled = useCallback((curveId: string, preset: AutomationPreset) => {
    const scale = (patternLength - 1) / 63;
    applyPreset(curveId, { ...preset, points: preset.points.map((p) => ({ ...p, row: Math.round(p.row * scale) })) });
  }, [patternLength, applyPreset]);

  const menuItems = useMemo<MenuItemType[]>(() => {
    if (!menu) return [];
    const curveId = menu.curveId;
    return [
      {
        id: 'apply-preset',
        label: 'Apply Preset',
        submenu: presets.map((preset) => ({
          id: `preset-${preset.id}`,
          label: preset.name,
          onClick: () => applyPresetScaled(curveId, preset),
        })),
      },
      { type: 'divider' as const },
      { id: 'clear-points', label: 'Clear Points', icon: <Eraser size={14} />, onClick: () => clearPoints(curveId) },
      { id: 'remove-curve', label: 'Remove Lane', icon: <Trash2 size={14} />, danger: true, onClick: () => removeCurve(curveId) },
    ];
  }, [menu, presets, applyPresetScaled, clearPoints, removeCurve]);

  const menuElement = menu ? (
    <ContextMenu items={menuItems} position={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)} />
  ) : null;

  return { beginDraw, removePointAt, openMenu, menuElement };
}
