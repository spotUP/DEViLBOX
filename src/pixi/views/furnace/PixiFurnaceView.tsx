/**
 * PixiFurnaceView - Top-level Furnace Editor View (pure Pixi)
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (subsong selector, pattern controls)     │
 * ├──────────────────────────────────────────────────┤
 * │ Order Matrix (~160px tall)                       │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Editor (fills remaining space)           │
 * └──────────────────────────────────────────────────┘
 */

import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiFurnaceOrderMatrix } from './PixiFurnaceOrderMatrix';
import { PixiFurnacePatternEditor } from './PixiFurnacePatternEditor';

import { PixiCollapsibleSection } from '../../components/PixiCollapsibleSection';

const ORDER_MATRIX_HEIGHT = 160;
const TOOLBAR_HEIGHT = 32;

interface FurnaceViewProps {
  width: number;
  height: number;
}

export const PixiFurnaceView: React.FC<FurnaceViewProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const nativeData = useFormatStore(s => s.furnaceNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const setFurnaceOrderEntry = useFormatStore(s => s.setFurnaceOrderEntry);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const displayRow = useTransportStore(s => s.currentRow);

  const [editPosition, setEditPosition] = useState(0);

  const activePosition = isPlaying ? currentPositionIndex : editPosition;

  const handlePositionChange = useCallback((pos: number) => {
    setEditPosition(pos);
    if (!isPlaying) setCurrentPosition(pos);
  }, [isPlaying, setCurrentPosition]);

  const handleOrderChange = useCallback((channel: number, position: number, patternIndex: number) => {
    setFurnaceOrderEntry(channel, position, patternIndex);
  }, [setFurnaceOrderEntry]);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });
  }, [width, height, theme]);

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TOOLBAR_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TOOLBAR_HEIGHT - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
  }, [width, theme]);

  // ── No module loaded ────────────────────────────────────────────────────────

  if (!nativeData) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiGraphics
          draw={drawBg}
          layout={{ position: 'absolute', width, height }}
        />
        <pixiBitmapText
          text="No Furnace module loaded"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>
    );
  }

  const sub = nativeData.subsongs[nativeData.activeSubsong];
  const patternEditorHeight = height - TOOLBAR_HEIGHT - ORDER_MATRIX_HEIGHT;

  // Build toolbar info string
  const toolbarLeft = `FURNACE`;
  const toolbarInfo = [
    `Subsong: ${sub?.name || '0'}`,
    `Spd: ${sub?.speed1}/${sub?.speed2}`,
    `Hz: ${sub?.hz?.toFixed(1)}`,
    `Len: ${sub?.patLen}`,
    `Pos: ${activePosition.toString(16).toUpperCase().padStart(2, '0')}/${(sub?.ordersLen ?? 0).toString(16).toUpperCase().padStart(2, '0')}`,
    `CH: ${sub?.channels.length ?? 0}`,
  ].join('  |  ');

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* Toolbar */}
      <pixiContainer
        layout={{
          width,
          height: TOOLBAR_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 12,
        }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width, height: TOOLBAR_HEIGHT }} />
        <pixiBitmapText
          text={toolbarLeft}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.accent.color}
        />
        <pixiBitmapText
          text={toolbarInfo}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textSecondary.color}
        />
      </pixiContainer>

      {/* Main content: Order Matrix (top) + Pattern Editor (bottom) */}
      <pixiContainer layout={{ flex: 1, width, flexDirection: 'column' }}>
        {/* Order Matrix (collapsible) */}
        <PixiCollapsibleSection label="Orders" width={width} expandedHeight={ORDER_MATRIX_HEIGHT}>
          <PixiFurnaceOrderMatrix
            width={width}
            height={ORDER_MATRIX_HEIGHT}
            nativeData={nativeData}
            currentPosition={activePosition}
            onPositionChange={handlePositionChange}
            onOrderChange={handleOrderChange}
          />
        </PixiCollapsibleSection>

        {/* Pattern Editor */}
        <PixiFurnacePatternEditor
          width={width}
          height={patternEditorHeight}
          nativeData={nativeData}
          currentPosition={activePosition}
          playbackRow={displayRow}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
