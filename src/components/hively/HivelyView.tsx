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
import { useTrackerStore , useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { exportAsHively } from '@lib/export/HivelyExporter';
import { HivelyPatternEditor } from './HivelyPatternEditor';
import { HivelyPositionEditor } from './HivelyPositionEditor';

const TOOLBAR_H = 36;
const POSITION_H = 160;

export const HivelyView: React.FC<{ width?: number; height?: number }> = ({ width: propW, height: propH }) => {
  const nativeData = useFormatStore(s => s.hivelyNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const isPlaying = useTransportStore(s => s.isPlaying);

  const [editPosition, setEditPosition] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: propW ?? 800, h: propH ?? 600 });

  useEffect(() => {
    if (propW && propH) { setSize({ w: propW, h: propH }); return; }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    return () => ro.disconnect();
  }, [propW, propH]);

  const { w: width, h: height } = size;
  const activePosition = isPlaying ? currentPositionIndex : editPosition;

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) setCurrentPosition(pos);
  }, [isPlaying, setCurrentPosition]);

  const handleExport = useCallback((format: 'hvl' | 'ahx') => {
    const song = getTrackerReplayer().getSong();
    if (!song) return;
    const result = exportAsHively(song, { format });
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
      <div ref={containerRef} className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono items-center justify-center">
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

  const editorH = height - TOOLBAR_H - POSITION_H;

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono" style={propW ? { width, height } : undefined}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 border-b border-ft2-border bg-dark-bgSecondary" style={{ height: TOOLBAR_H }}>
        <span className="text-xs font-bold text-yellow-300">{formatLabel}</span>
        <span className="text-ft2-textDim">|</span>
        <span className="text-xs text-ft2-textDim">{toolbarInfo}</span>
        <div className="flex-1" />
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
      <div className="border-b border-ft2-border" style={{ height: POSITION_H }}>
        <HivelyPositionEditor
          width={width}
          height={POSITION_H}
          nativeData={nativeData}
          currentPosition={activePosition}
          onPositionChange={handlePositionChange}
        />
      </div>

      {/* Track editor */}
      <div className="flex-1 min-h-0">
        <HivelyPatternEditor
          width={width}
          height={Math.max(100, editorH)}
          nativeData={nativeData}
          currentPosition={activePosition}
        />
      </div>
    </div>
  );
};
