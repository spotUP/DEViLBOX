/**
 * SunTronicView — Main SunTronic V1.3 editor layout (DOM mode).
 * Mirrors HivelyView in structure.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, blocks, positions)              │
 * ├──────────────────────────────────────────────────┤
 * │ Position Editor (block index + editable transpose)│
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Editor (standard store-driven note grid) │
 * └──────────────────────────────────────────────────┘
 *
 * SunTronic V1.3 patterns are populated into the standard tracker store as
 * ordinary TrackerCells (SunTronicParser sets song.patterns), so the note grid
 * reuses the shared store-driven PatternEditorCanvas — no format adapter needed.
 * The SunTronic-specific surface is the position matrix (block index display +
 * editable transpose), rendered by SunTronicPositionEditor.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTrackerStore, useFormatStore, useUIStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import {
  SunTronicPositionEditor,
  SUNTRONIC_MATRIX_HEIGHT,
  SUNTRONIC_MATRIX_COLLAPSED_HEIGHT,
} from './SunTronicPositionEditor';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';

const TOOLBAR_H = 36;

export const SunTronicView: React.FC = () => {
  const { isMobile } = useResponsiveSafe();
  const nativeData = useFormatStore(s => s.sunTronicNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);
  const editorFullscreen = useUIStore(s => s.editorFullscreen);

  const [editPosition, setEditPosition] = useState(0);
  const [matrixCollapsed, setMatrixCollapsed] = useState(isMobile);

  const positionH = matrixCollapsed ? SUNTRONIC_MATRIX_COLLAPSED_HEIGHT : SUNTRONIC_MATRIX_HEIGHT;

  // Measure container width for SunTronicPositionEditor (canvas-based, needs numeric width)
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

  if (!nativeData) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-dark-bg text-ft2-text font-mono items-center justify-center">
        <span className="text-ft2-textDim">No SunTronic module loaded</span>
      </div>
    );
  }

  const toolbarInfo = [
    `Blocks: ${nativeData.blocks.length}`,
    `Pos: ${nativeData.positions.length}`,
    `${activePosition.toString().padStart(3, '0')}/${nativeData.positions.length.toString().padStart(3, '0')}`,
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
      {!editorFullscreen && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        height: `${TOOLBAR_H}px`, padding: '0 12px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
        flexShrink: 0,
      }}>
        <span className="text-accent-highlight" style={{ fontWeight: 'bold', fontSize: '12px' }}>SunTronic</span>
        <span style={{ color: 'var(--color-text-muted)' }}>|</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flex: 1 }}>{toolbarInfo}</span>
      </div>
      )}

      {/* Position editor */}
      {!editorFullscreen && (
      <div style={{
        height: `${positionH}px`,
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <SunTronicPositionEditor
          width={containerWidth}
          height={positionH}
          nativeData={nativeData}
          currentPosition={activePosition}
          onPositionChange={handlePositionChange}
          collapsed={matrixCollapsed}
          onToggleCollapse={() => setMatrixCollapsed(!matrixCollapsed)}
        />
      </div>
      )}

      {/* Pattern Editor — standard store-driven note grid */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <PatternEditorCanvas
          formatCurrentRow={currentRow}
          formatIsPlaying={isPlaying}
        />
      </div>
    </div>
  );
};
