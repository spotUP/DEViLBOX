/**
 * PixiFurnaceView - Top-level Furnace Editor View
 *
 * Combines the 2D order matrix (left panel) with the per-channel
 * pattern editor (main area), matching the Furnace tracker layout.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (subsong selector, pattern controls)     │
 * ├────────────┬─────────────────────────────────────┤
 * │ Order      │ Pattern Editor                      │
 * │ Matrix     │ (per-channel patterns from current  │
 * │ (left      │  order position)                    │
 * │  panel)    │                                     │
 * └────────────┴─────────────────────────────────────┘
 */

import React, { useCallback, useState } from 'react';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { usePixiTheme } from '@/pixi/theme';
import { PixiFurnaceOrderMatrix } from './PixiFurnaceOrderMatrix';
import { PixiFurnacePatternEditor } from './PixiFurnacePatternEditor';

const ORDER_MATRIX_WIDTH = 220;
const TOOLBAR_HEIGHT = 32;

interface FurnaceViewProps {
  width: number;
  height: number;
}

export const PixiFurnaceView: React.FC<FurnaceViewProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const nativeData = useTrackerStore(s => s.furnaceNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const setFurnaceOrderEntry = useTrackerStore(s => s.setFurnaceOrderEntry);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const displayRow = useTransportStore(s => s.currentRow);

  const [editPosition, setEditPosition] = useState(0);

  // Use playback position when playing, edit position otherwise
  const activePosition = isPlaying ? currentPositionIndex : editPosition;

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) {
      setCurrentPosition(pos);
    }
  }, [isPlaying, setCurrentPosition]);

  const handleOrderChange = useCallback((channel: number, position: number, patternIndex: number) => {
    setFurnaceOrderEntry(channel, position, patternIndex);
  }, [setFurnaceOrderEntry]);

  if (!nativeData) {
    return (
      <div style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: `#${(theme.textMuted.color).toString(16).padStart(6, '0')}`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 13,
        backgroundColor: `#${(theme.bg.color).toString(16).padStart(6, '0')}`,
      }}>
        No Furnace module loaded
      </div>
    );
  }

  const sub = nativeData.subsongs[nativeData.activeSubsong];
  const editorWidth = width - ORDER_MATRIX_WIDTH;
  const editorHeight = height - TOOLBAR_HEIGHT;

  return (
    <div style={{
      width,
      height,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: `#${(theme.bg.color).toString(16).padStart(6, '0')}`,
    }}>
      {/* Toolbar */}
      <div style={{
        height: TOOLBAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        backgroundColor: `#${(theme.bgSecondary.color).toString(16).padStart(6, '0')}`,
        borderBottom: `1px solid #${(theme.border.color).toString(16).padStart(6, '0')}`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        color: `#${(theme.text.color).toString(16).padStart(6, '0')}`,
      }}>
        <span style={{ color: `#${(theme.accent.color).toString(16).padStart(6, '0')}`, fontWeight: 'bold' }}>
          FURNACE
        </span>
        <span style={{ color: `#${(theme.textMuted.color).toString(16).padStart(6, '0')}` }}>|</span>
        <span>
          Subsong: {sub?.name || '0'}
        </span>
        <span style={{ color: `#${(theme.textMuted.color).toString(16).padStart(6, '0')}` }}>|</span>
        <span>
          Spd: {sub?.speed1}/{sub?.speed2}
        </span>
        <span style={{ color: `#${(theme.textMuted.color).toString(16).padStart(6, '0')}` }}>|</span>
        <span>
          Hz: {sub?.hz?.toFixed(1)}
        </span>
        <span style={{ color: `#${(theme.textMuted.color).toString(16).padStart(6, '0')}` }}>|</span>
        <span>
          Len: {sub?.patLen}
        </span>
        <span style={{ color: `#${(theme.textMuted.color).toString(16).padStart(6, '0')}` }}>|</span>
        <span>
          Pos: {activePosition.toString(16).toUpperCase().padStart(2, '0')}/{(sub?.ordersLen ?? 0).toString(16).toUpperCase().padStart(2, '0')}
        </span>
        <span style={{ color: `#${(theme.textMuted.color).toString(16).padStart(6, '0')}` }}>|</span>
        <span>
          CH: {sub?.channels.length ?? 0}
        </span>
      </div>

      {/* Main content: Order Matrix + Pattern Editor */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      }}>
        {/* Order Matrix (left panel) */}
        <div style={{
          width: ORDER_MATRIX_WIDTH,
          borderRight: `1px solid #${(theme.border.color).toString(16).padStart(6, '0')}`,
        }}>
          <PixiFurnaceOrderMatrix
            width={ORDER_MATRIX_WIDTH}
            height={editorHeight}
            nativeData={nativeData}
            currentPosition={activePosition}
            onPositionChange={handlePositionChange}
            onOrderChange={handleOrderChange}
          />
        </div>

        {/* Pattern Editor (main area) */}
        <PixiFurnacePatternEditor
          width={editorWidth}
          height={editorHeight}
          nativeData={nativeData}
          currentPosition={activePosition}
          playbackRow={displayRow}
        />
      </div>
    </div>
  );
};
