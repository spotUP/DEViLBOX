/**
 * KlysView — Main klystrack editor layout (DOM mode).
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, speed, channels, position info) │
 * ├──────────────────────────────────────────────────┤
 * │ Position Editor (~160px tall)                    │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Editor (fills remaining space)           │
 * └──────────────────────────────────────────────────┘
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { KlysPatternEditor } from './KlysPatternEditor';
import { KlysPositionEditor } from './KlysPositionEditor';

const TOOLBAR_H = 36;
const POSITION_H = 160;

export const KlysView: React.FC<{ width?: number; height?: number }> = ({ width: propW, height: propH }) => {
  const nativeData = useTrackerStore(s => s.klysNative);
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

  if (!nativeData) {
    return (
      <div ref={containerRef} className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono items-center justify-center">
        <span className="text-ft2-textDim">No klystrack module loaded</span>
      </div>
    );
  }

  const toolbarInfo = [
    `Speed: ${nativeData.songSpeed}/${nativeData.songSpeed2}`,
    `Rate: ${nativeData.songRate}Hz`,
    `Pat: ${nativeData.patterns.length}`,
    `Len: ${nativeData.songLength}`,
    `CH: ${nativeData.channels}`,
    `${activePosition.toString().padStart(3, '0')}/${nativeData.songLength.toString().padStart(3, '0')}`,
  ].join('  |  ');

  const editorH = height - TOOLBAR_H - POSITION_H;

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 bg-dark-bgPrimary text-ft2-text font-mono" style={propW ? { width, height } : undefined}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 border-b border-ft2-border bg-dark-bgSecondary" style={{ height: TOOLBAR_H }}>
        <span className="text-xs font-bold text-cyan-300">KT</span>
        <span className="text-ft2-textDim">|</span>
        <span className="text-xs text-ft2-textDim">{toolbarInfo}</span>
        <div className="flex-1" />
      </div>

      {/* Position editor */}
      <div className="border-b border-ft2-border" style={{ height: POSITION_H }}>
        <KlysPositionEditor
          width={width}
          height={POSITION_H}
          nativeData={nativeData}
          currentPosition={activePosition}
          onPositionChange={handlePositionChange}
        />
      </div>

      {/* Pattern editor */}
      <div className="flex-1 min-h-0">
        <KlysPatternEditor
          width={width}
          height={Math.max(100, editorH)}
          nativeData={nativeData}
          currentPosition={activePosition}
        />
      </div>
    </div>
  );
};
