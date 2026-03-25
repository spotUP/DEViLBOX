/**
 * FurnaceView — Main Furnace editor layout (DOM mode).
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, subsong, speed, channels, pos)  │
 * ├──────────────────────────────────────────────────┤
 * │ Order Editor (~160px tall)                       │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Editor (fills remaining space)           │
 * └──────────────────────────────────────────────────┘
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { FurnaceOrderEditor, FURNACE_ORDER_MATRIX_HEIGHT, FURNACE_ORDER_MATRIX_COLLAPSED_HEIGHT } from './FurnaceOrderEditor';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';

const TOOLBAR_H = 36;

export const FurnaceView: React.FC<{ width?: number; height?: number }> = () => {
  const { isMobile } = useResponsiveSafe();
  const nativeData = useFormatStore(s => s.furnaceNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const setFurnaceOrderEntry = useFormatStore(s => s.setFurnaceOrderEntry);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);

  const [editPosition, setEditPosition] = useState(0);
  const [orderCollapsed, setOrderCollapsed] = useState(isMobile); // Collapsed by default on mobile

  const orderH = orderCollapsed ? FURNACE_ORDER_MATRIX_COLLAPSED_HEIGHT : FURNACE_ORDER_MATRIX_HEIGHT;

  // Measure container width for FurnaceOrderEditor (canvas-based, needs numeric width)
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      if (width > 0) setContainerWidth(width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const activePosition = isPlaying ? currentPositionIndex : editPosition;

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) setCurrentPosition(pos);
  }, [isPlaying, setCurrentPosition]);

  const handleOrderChange = useCallback((channel: number, position: number, patternIndex: number) => {
    setFurnaceOrderEntry(channel, position, patternIndex);
  }, [setFurnaceOrderEntry]);

  if (!nativeData) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono items-center justify-center">
        <span className="text-ft2-textDim">No Furnace module loaded</span>
      </div>
    );
  }

  const sub = nativeData.subsongs[nativeData.activeSubsong];
  const toolbarInfo = [
    `Subsong: ${sub?.name || '0'}`,
    `Spd: ${sub?.speed1}/${sub?.speed2}`,
    `Hz: ${sub?.hz?.toFixed(1)}`,
    `Len: ${sub?.patLen}`,
    `Pos: ${activePosition.toString(16).toUpperCase().padStart(2, '0')}/${(sub?.ordersLen ?? 0).toString(16).toUpperCase().padStart(2, '0')}`,
    `CH: ${sub?.channels.length ?? 0}`,
  ].join('  |  ');

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
        backgroundColor: 'var(--color-bg)',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
      }}
    >
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        height: `${TOOLBAR_H}px`, padding: '0 12px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 'bold', color: '#fde047', fontSize: '12px' }}>FURNACE</span>
        <span style={{ color: 'var(--color-text-muted)' }}>|</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flex: 1 }}>{toolbarInfo}</span>
      </div>

      {/* Order Editor */}
      <div style={{
        height: `${orderH}px`,
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <FurnaceOrderEditor
          width={containerWidth}
          height={orderH}
          collapsed={orderCollapsed}
          onToggleCollapse={() => setOrderCollapsed(c => !c)}
          nativeData={nativeData}
          currentPosition={activePosition}
          onPositionChange={handlePositionChange}
          onOrderChange={handleOrderChange}
        />
      </div>

      {/* Pattern Editor */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <PatternEditorCanvas
          formatCurrentRow={currentRow}
          formatIsPlaying={isPlaying}
        />
      </div>
    </div>
  );
};
