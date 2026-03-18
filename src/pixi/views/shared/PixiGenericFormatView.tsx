/**
 * PixiGenericFormatView — Pixi equivalent of GenericFormatView.
 *
 * Layout (pure Pixi, no DOM overlays):
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format label, info, optional action)    │
 * ├──────────────────────────────────────────────────┤
 * │ Overview slot (format-specific, optional)        │
 * ├──────────────────────────────────────────────────┤
 * │ PixiFormatPatternEditor (fills remaining space)  │
 * └──────────────────────────────────────────────────┘
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiButton } from '@/pixi/components/PixiButton';
import { PixiFormatPatternEditor } from './PixiFormatPatternEditor';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';

const TOOLBAR_H = 32;
const ACCENT_SEP = 0x555555;

interface ActionButton {
  label: string;
  onClick: () => void;
  color?: 'green' | 'red' | 'blue' | 'default';
}

interface Props {
  width: number;
  height: number;

  // Identity
  formatLabel: string;
  formatAccentColor?: number;
  toolbarInfo: string;

  // Optional toolbar button (export, etc.)
  actionButton?: ActionButton;

  // Overview area (song order list, sequence panel, etc.)
  overviewSlot?: React.ReactNode;
  overviewHeight?: number;

  // Pattern data
  columns: ColumnDef[];
  channels: FormatChannel[];
  currentRow: number;
  isPlaying: boolean;
}

export const PixiGenericFormatView: React.FC<Props> = ({
  width, height,
  formatLabel, formatAccentColor = 0x88ccff, toolbarInfo,
  actionButton,
  overviewSlot, overviewHeight = 0,
  columns, channels, currentRow, isPlaying,
}) => {
  const theme = usePixiTheme();

  const patternHeight = height - TOOLBAR_H - overviewHeight;

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TOOLBAR_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TOOLBAR_H - 1, width, 1);
    g.fill({ color: theme.border.color });
  }, [width, theme.bgSecondary.color, theme.border.color]);

  const drawOverviewBg = useCallback((g: GraphicsType) => {
    if (!overviewHeight) return;
    g.clear();
    g.rect(0, 0, width, overviewHeight);
    g.fill({ color: theme.bg.color });
    g.rect(0, overviewHeight - 1, width, 1);
    g.fill({ color: theme.border.color });
  }, [width, overviewHeight, theme.bg.color, theme.border.color]);

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* Toolbar */}
      <pixiContainer
        layout={{
          width, height: TOOLBAR_H,
          flexDirection: 'row', alignItems: 'center',
          paddingLeft: 8, paddingRight: 8, gap: 6,
        }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width, height: TOOLBAR_H }} />
        <pixiBitmapText
          text={formatLabel}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={formatAccentColor}
        />
        <pixiBitmapText
          text="|"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={ACCENT_SEP}
        />
        <pixiBitmapText
          text={toolbarInfo}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textSecondary.color}
        />
        <pixiContainer layout={{ flex: 1, height: TOOLBAR_H }} />
        {actionButton && (
          <PixiButton
            label={actionButton.label}
            variant="ft2"
            size="sm"
            color={actionButton.color ?? 'green'}
            onClick={actionButton.onClick}
          />
        )}
      </pixiContainer>

      {/* Overview slot */}
      {overviewHeight > 0 && (
        <pixiContainer layout={{ width, height: overviewHeight }}>
          <pixiGraphics
            draw={drawOverviewBg}
            layout={{ position: 'absolute', width, height: overviewHeight }}
          />
          {overviewSlot}
        </pixiContainer>
      )}

      {/* Pattern editor */}
      <pixiContainer layout={{ width, height: patternHeight }}>
        <PixiFormatPatternEditor
          width={width}
          height={patternHeight}
          columns={columns}
          channels={channels}
          currentRow={currentRow}
          isPlaying={isPlaying}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
