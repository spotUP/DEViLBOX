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

import React, { useEffect, useRef, useState } from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { GTU_COLUMNS } from './gtuAdapter';
import { GTToolbar } from './GTToolbar';
import { useGTKeyboardHandler } from './GTKeyboardHandler';
import { useGTUltraEngineInit } from '../../engine/gtultra/useGTUltraEngineInit';
import { useGTUltraFormatData } from './useGTUltraFormatData';

const TOOLBAR_H = 36;

export const GTUltraView: React.FC<{ width?: number; height?: number }> = () => {
  const { channels, currentRow, isPlaying, handleCellChange } = useGTUltraFormatData();

  const containerRef = useRef<HTMLDivElement>(null);
  const [_containerWidth, setContainerWidth] = useState(800);

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

  useGTKeyboardHandler(true);
  useGTUltraEngineInit();

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      background: '#0a0a1e', color: '#c0c0c0',
      fontFamily: 'monospace',
    }}>
      <div style={{ height: `${TOOLBAR_H}px`, flexShrink: 0 }}>
        <GTToolbar />
      </div>

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
