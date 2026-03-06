/**
 * GenericFormatView — Shared layout for format pattern editors.
 *
 * Provides toolbar, optional position editor, pattern editor, and optional side panel.
 * Format-specific logic (position panel, instrument editor) provided via props/slots.
 */

import React, { useRef, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { FormatPatternEditor } from './FormatPatternEditor';
import type { ColumnDef, FormatChannel, OnCellChange } from './format-editor-types';

const TOOLBAR_H = 36;

interface GenericFormatViewProps {
  // Identity
  formatLabel: string;           // "KT", "HVL", "JMC"
  toolbarInfo: string;           // "Speed: 6/3 | Pat: 12 | Len: 64"

  // Playback
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;

  // Extra toolbar buttons (format-specific)
  toolbarSlot?: ReactNode;

  // Position editor area (optional, format-specific)
  positionEditor?: ReactNode;
  positionEditorHeight?: number;

  // Pattern editor data
  columns: ColumnDef[];
  channels: FormatChannel[];
  currentRow: number;
  onCellChange?: OnCellChange;

  // Optional side panel (instrument editor, etc.)
  sidePanel?: ReactNode;
  sidePanelWidth?: number;
}

export const GenericFormatView: React.FC<GenericFormatViewProps> = ({
  formatLabel, toolbarInfo, isPlaying, onPlay, onStop, toolbarSlot,
  positionEditor, positionEditorHeight = 160,
  columns, channels, currentRow, onCellChange,
  sidePanel, sidePanelWidth = 280,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // ResizeObserver for responsive sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const showPositionEditor = !!positionEditor;
  const showSidePanel = !!sidePanel;

  // Compute layout dimensions
  const patternEditorWidth = showSidePanel
    ? containerSize.width - sidePanelWidth - 8
    : containerSize.width;
  const posEditorHeight = showPositionEditor ? positionEditorHeight : 0;
  const patternEditorHeight = containerSize.height - TOOLBAR_H - posEditorHeight;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0d0d0d',
        color: '#ccc',
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        fontSize: '12px',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          height: `${TOOLBAR_H}px`,
          padding: '0 12px',
          borderBottom: '1px solid #222',
          backgroundColor: '#1a1a1a',
        }}
      >
        <div style={{ fontWeight: 'bold', minWidth: '40px' }}>{formatLabel}</div>
        <div style={{ flex: 1, fontSize: '11px', color: '#666' }}>{toolbarInfo}</div>
        <button
          onClick={isPlaying ? onStop : onPlay}
          style={{
            padding: '4px 12px',
            backgroundColor: isPlaying ? '#e95545' : '#4a7c4e',
            color: '#fff',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
          }}
        >
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        {toolbarSlot}
      </div>

      {/* Position Editor (optional) */}
      {showPositionEditor && (
        <div
          style={{
            height: `${positionEditorHeight}px`,
            borderBottom: '1px solid #222',
            overflow: 'auto',
            backgroundColor: '#141414',
          }}
        >
          {positionEditor}
        </div>
      )}

      {/* Main content: Pattern Editor + Side Panel */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          gap: '8px',
          padding: '8px',
          overflow: 'hidden',
        }}
      >
        {/* Pattern Editor */}
        <div
          style={{
            flex: 1,
            border: '1px solid #222',
            overflow: 'hidden',
            backgroundColor: '#0d0d0d',
          }}
        >
          <FormatPatternEditor
            width={patternEditorWidth}
            height={patternEditorHeight}
            columns={columns}
            channels={channels}
            currentRow={currentRow}
            isPlaying={isPlaying}
            onCellChange={onCellChange}
          />
        </div>

        {/* Side Panel (optional) */}
        {showSidePanel && (
          <div
            style={{
              width: `${sidePanelWidth}px`,
              border: '1px solid #222',
              overflow: 'auto',
              backgroundColor: '#141414',
            }}
          >
            {sidePanel}
          </div>
        )}
      </div>
    </div>
  );
};
