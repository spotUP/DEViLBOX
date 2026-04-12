/**
 * PixiGTDAWView — Root layout for DAW mode.
 *
 * Three-zone split inspired by Ableton Live:
 * - Top: Toolbar (36px)
 * - Center: Arrangement (220px) + Piano Roll (flex) | Instrument Designer (sidebar, 280px)
 * - Bottom: Switchable panel (240px) — Mixer / Tables / Monitor / Presets / Clips
 *
 * Shares all stores/hooks/engine with Pro and Studio modes.
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { usePixiTheme } from '@/pixi/theme';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
// Engine init and keyboard handler are managed by the parent PixiGTUltraView
import {
  DAW_TOOLBAR_H, DAW_BOTTOM_H, DAW_SIDEBAR_W, DAW_ARRANGEMENT_H,
} from './dawTheme';
import { PixiGTDAWToolbar } from './PixiGTDAWToolbar';
import { PixiGTDAWArrangement } from './PixiGTDAWArrangement';
import { PixiGTInstrumentDesigner } from '../PixiGTInstrumentDesigner';
import { PixiGTDAWBottomPanel } from './PixiGTDAWBottomPanel';

interface Props {
  width: number;
  height: number;
}

export const PixiGTDAWView: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  // Engine init and keyboard handler are managed by parent PixiGTUltraView
  const engine = useGTUltraStore((s) => s.engine);
  const dawSidebarOpen = useGTUltraStore((s) => s.dawSidebarOpen);

  const ready = !!engine;

  // Layout math
  const sidebarW = dawSidebarOpen ? DAW_SIDEBAR_W : 0;
  const centerW = width - sidebarW;
  const centerH = height - DAW_TOOLBAR_H - DAW_BOTTOM_H;
  const arrangementH = Math.min(DAW_ARRANGEMENT_H, centerH * 0.4);
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: theme.bg.color });
  }, [width, height, theme.bg.color]);

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* Loading overlay */}
      {!ready && (
        <pixiContainer layout={{ position: 'absolute', width, height, alignItems: 'center', justifyContent: 'center' }}>
          <pixiBitmapText
            text="GoatTracker Ultra DAW — initializing..."
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
            tint={theme.textMuted.color}
          />
        </pixiContainer>
      )}

      {/* Toolbar */}
      <pixiContainer alpha={ready ? 1 : 0} renderable={ready} layout={{ width, height: DAW_TOOLBAR_H }}>
        <PixiGTDAWToolbar width={width} />
      </pixiContainer>

      {/* Center area: Arrangement + Piano Roll + Sidebar */}
      <pixiContainer alpha={ready ? 1 : 0} renderable={ready} layout={{ width, height: centerH, flexDirection: 'row' }}>
        {/* Left: Arrangement + Piano Roll stacked */}
        <pixiContainer layout={{ width: centerW, height: centerH, flexDirection: 'column' }}>
          <pixiContainer layout={{ width: centerW, height: arrangementH }}>
            <PixiGTDAWArrangement
              width={Math.max(100, centerW)}
              height={Math.max(50, arrangementH)}
            />
          </pixiContainer>
        </pixiContainer>

        {/* Right: Instrument Designer sidebar */}
        {dawSidebarOpen && (
          <pixiContainer layout={{ width: DAW_SIDEBAR_W, height: centerH }}>
            <PixiGTInstrumentDesigner
              width={DAW_SIDEBAR_W}
              height={Math.max(100, centerH)}
            />
          </pixiContainer>
        )}
      </pixiContainer>

      {/* Bottom panel */}
      <pixiContainer alpha={ready ? 1 : 0} renderable={ready} layout={{ width, height: DAW_BOTTOM_H }}>
        <PixiGTDAWBottomPanel
          width={Math.max(100, width)}
          height={DAW_BOTTOM_H}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
