/**
 * HivelyView — Main HivelyTracker/AHX editor layout (DOM mode).
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, tempo, speed, tracks, positions)│
 * ├──────────────────────────────────────────────────┤
 * │ Position Editor (~160px tall)                    │
 * ├──────────────────────────────────────────────────┤
 * │ Track Editor (fills remaining space)             │
 * └──────────────────────────────────────────────────┘
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { exportAsHively } from '@lib/export/HivelyExporter';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { HIVELY_COLUMNS, hivelyToFormatChannels } from './hivelyAdapter';
import { HivelyPositionEditor } from './HivelyPositionEditor';

const TOOLBAR_H = 36;
const POSITION_H = 160;

export const HivelyView: React.FC<{ width?: number; height?: number }> = () => {
  const nativeData = useFormatStore(s => s.hivelyNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);

  const [editPosition, setEditPosition] = useState(0);

  // Measure container width for HivelyPositionEditor (canvas-based, needs numeric width)
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

  const handleExport = useCallback((format: 'hvl' | 'ahx') => {
    const song = getTrackerReplayer().getSong();
    if (!song) return;
    const result = exportAsHively(song, { format, nativeOverride: useFormatStore.getState().hivelyNative });
    const url = URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (result.warnings.length > 0) {
      console.warn('[HivelyExport]', result.warnings.join('; '));
    }
  }, []);

  if (!nativeData) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono items-center justify-center">
        <span className="text-ft2-textDim">No HivelyTracker module loaded</span>
      </div>
    );
  }

  const formatLabel = nativeData.channels <= 4 ? 'AHX' : 'HVL';
  const toolbarInfo = [
    `Tempo: ${nativeData.tempo}`,
    `Speed: ${nativeData.speedMultiplier}x`,
    `Tracks: ${nativeData.tracks.length}`,
    `Pos: ${nativeData.positions.length}`,
    `CH: ${nativeData.channels}`,
    `${activePosition.toString().padStart(3, '0')}/${nativeData.positions.length.toString().padStart(3, '0')}`,
  ].join('  |  ');

  const channels = hivelyToFormatChannels(nativeData, activePosition);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
        backgroundColor: '#0d0d0d',
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
        <span style={{ fontWeight: 'bold', color: '#fde047', fontSize: '12px' }}>{formatLabel}</span>
        <span style={{ color: 'var(--color-text-muted)' }}>|</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flex: 1 }}>{toolbarInfo}</span>
        <button
          className="px-2 py-0.5 text-xs bg-green-800 hover:bg-green-700 text-green-100 rounded border border-green-600"
          onClick={() => handleExport('hvl')}
        >HVL</button>
        <button
          className="px-2 py-0.5 text-xs bg-green-800 hover:bg-green-700 text-green-100 rounded border border-green-600"
          onClick={() => handleExport('ahx')}
        >AHX</button>
      </div>

      {/* Position editor */}
      <div style={{
        height: `${POSITION_H}px`,
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <HivelyPositionEditor
          width={containerWidth}
          height={POSITION_H}
          nativeData={nativeData}
          currentPosition={activePosition}
          onPositionChange={handlePositionChange}
        />
      </div>

      {/* Pattern Editor */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <PatternEditorCanvas
          formatColumns={HIVELY_COLUMNS}
          formatChannels={channels}
          formatCurrentRow={currentRow}
          formatIsPlaying={isPlaying}
        />
      </div>
    </div>
  );
};
