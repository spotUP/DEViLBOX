/**
 * GTUltraView — Main GoatTracker Ultra editor layout (DOM mode).
 *
 * AHX-style layout:
 * ┌──────────────────────────────────────────────┐
 * │ GTToolbar (Save/PRG/SID/REC/JAM/SID config)  │  ~36px
 * ├──────────────────────────────────────────────┤
 * │ PatternEditorCanvas (pattern + order + table  │  flex
 * │ channels side by side)                        │
 * └──────────────────────────────────────────────┘
 *
 * Orders and tables (Wave/Pulse/Filter/Speed) are integrated as
 * special channels on the right side of the pattern editor.
 */

import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { GTU_COLUMNS } from './gtuAdapter';
import { GTToolbar } from './GTToolbar';
import { GTOrderMatrix, GT_ORDER_MATRIX_HEIGHT, GT_ORDER_MATRIX_COLLAPSED_HEIGHT } from './GTOrderMatrix';
import { useGTKeyboardHandler } from './GTKeyboardHandler';
import { useGTDAWKeyboardHandler } from '../../hooks/useGTDAWKeyboardHandler';
import { useGTUltraEngineInit } from '../../engine/gtultra/useGTUltraEngineInit';
import { useGTUltraFormatData } from './useGTUltraFormatData';
import { useGTUltraStore } from '../../stores/useGTUltraStore';
import { useUIStore } from '../../stores/useUIStore';

const GTDAWView = lazy(() => import('./daw/GTDAWView').then(m => ({ default: m.GTDAWView })));

const TOOLBAR_H = 36;

export const GTUltraView: React.FC<{ width?: number; height?: number }> = () => {
  const viewMode = useGTUltraStore((s) => s.viewMode);
  const { channels, currentRow, isPlaying, handleCellChange } = useGTUltraFormatData();
  const editorFullscreen = useUIStore(s => s.editorFullscreen);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [ordersCollapsed, setOrdersCollapsed] = useState(false);

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

  useGTKeyboardHandler(viewMode !== 'daw');
  useGTDAWKeyboardHandler(viewMode === 'daw');
  useGTUltraEngineInit();

  const toggleOrdersCollapsed = useCallback(() => setOrdersCollapsed(v => !v), []);
  const matrixH = ordersCollapsed ? GT_ORDER_MATRIX_COLLAPSED_HEIGHT : GT_ORDER_MATRIX_HEIGHT;

  // DAW mode renders the modern visual editor
  if (viewMode === 'daw') {
    return (
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#121218', color: '#6b6b80', fontFamily: 'monospace' }}>Loading DAW mode...</div>}>
        <GTDAWView />
      </Suspense>
    );
  }

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      background: 'var(--color-tracker-row-even)', color: '#c0c0c0',
      fontFamily: 'monospace',
    }}>
      {!editorFullscreen && (
        <>
          <div style={{ height: `${TOOLBAR_H}px`, flexShrink: 0 }}>
            <GTToolbar />
          </div>

          <div style={{ height: matrixH, flexShrink: 0 }}>
            <GTOrderMatrix
              width={containerWidth}
              height={matrixH}
              collapsed={ordersCollapsed}
              onToggleCollapse={toggleOrdersCollapsed}
            />
          </div>
        </>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <PatternEditorCanvas
          formatColumns={GTU_COLUMNS}
          formatChannels={channels}
          formatCurrentRow={currentRow}
          formatIsPlaying={isPlaying}
          onFormatCellChange={handleCellChange}
        />
      </div>

    </div>
  );
};
