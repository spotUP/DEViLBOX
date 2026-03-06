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

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTrackerStore , useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { GenericFormatView } from '@/components/shared/GenericFormatView';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { exportAsHively } from '@lib/export/HivelyExporter';
import { HivelyPositionEditor } from './HivelyPositionEditor';
import { hivelyToFormatChannels, HIVELY_COLUMNS } from './hivelyAdapter';

const TOOLBAR_H = 36;
const POSITION_H = 160;

export const HivelyView: React.FC<{ width?: number; height?: number }> = ({ width: propW, height: propH }) => {
  const nativeData = useFormatStore(s => s.hivelyNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);

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

  const channels = useMemo(() => {
    if (!nativeData) return [];
    return hivelyToFormatChannels(nativeData, activePosition);
  }, [nativeData, activePosition]);

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) setCurrentPosition(pos);
  }, [isPlaying, setCurrentPosition]);

  const handleCellChange = useCallback((channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
    if (!nativeData) return;
    const trackIdx = nativeData.positions[activePosition]?.tracks[channelIdx]?.trackIdx ?? -1;
    if (trackIdx < 0 || trackIdx >= nativeData.tracks.length) return;
    const track = nativeData.tracks[trackIdx];
    if (!track || rowIdx >= (track.numRows || 0)) return;

    // Update the appropriate field
    if (columnKey === 'note') track.notes![rowIdx] = value;
    else if (columnKey === 'instrument') track.instruments![rowIdx] = value;
    else if (columnKey === 'fx1') track.fx1![rowIdx] = value;
    else if (columnKey === 'fx2') track.fx2![rowIdx] = value;

    // Trigger re-render
    const state = useFormatStore.getState();
    if (state.hivelyNative) {
      useFormatStore.setState({ hivelyNative: { ...state.hivelyNative } });
    }
  }, [nativeData, activePosition]);

  const handlePlay = useCallback(() => {
    useTransportStore.setState((s) => { s.isPlaying = true; s.isPaused = false; });
  }, []);

  const handleStop = useCallback(() => {
    useTransportStore.setState((s) => { s.isPlaying = false; s.isPaused = false; });
  }, []);

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

  const toolbarSlot = (
    <>
      <button
        className="px-2 py-0.5 text-xs bg-green-800 hover:bg-green-700 text-green-100 rounded border border-green-600"
        onClick={() => handleExport('hvl')}
      >HVL</button>
      <button
        className="px-2 py-0.5 text-xs bg-green-800 hover:bg-green-700 text-green-100 rounded border border-green-600"
        onClick={() => handleExport('ahx')}
      >AHX</button>
    </>
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono"
      style={propW ? { width, height } : undefined}
    >
      <GenericFormatView
        formatLabel={formatLabel}
        toolbarInfo={toolbarInfo}
        isPlaying={isPlaying}
        onPlay={handlePlay}
        onStop={handleStop}
        toolbarSlot={toolbarSlot}
        positionEditor={
          <HivelyPositionEditor
            width={width}
            height={POSITION_H}
            nativeData={nativeData}
            currentPosition={activePosition}
            onPositionChange={handlePositionChange}
          />
        }
        positionEditorHeight={POSITION_H}
        columns={HIVELY_COLUMNS}
        channels={channels}
        currentRow={currentRow}
        onCellChange={handleCellChange}
      />
    </div>
  );
};
