/**
 * PixiGenericFormatView — reusable Pixi pattern viewer for non-standard formats.
 * Displays a toolbar, optional overview slot, and scrolling pattern rows via
 * PixiFormatPatternEditor (which handles channel headers + row rendering).
 */

import React from 'react';
import { PixiFormatPatternEditor } from './PixiFormatPatternEditor';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';
import { PIXI_FONTS } from '@/pixi/fonts';
import { usePixiTheme } from '@/pixi/theme';

interface ActionButton {
  label: string;
  onClick: () => void;
  color?: string;
}

const TOOLBAR_H = 20;

interface Props {
  width: number;
  height: number;
  formatLabel: string;
  formatAccentColor?: number;
  toolbarInfo?: React.ReactNode;
  actionButton?: ActionButton;
  overviewSlot?: React.ReactNode;
  overviewHeight?: number;
  columns: ColumnDef[];
  channels: FormatChannel[];
  currentRow: number;
  isPlaying: boolean;
  children?: React.ReactNode;
}

export const PixiGenericFormatView: React.FC<Props> = (props) => {
  const theme = usePixiTheme();
  const overviewH = props.overviewSlot ? (props.overviewHeight ?? 80) : 0;
  const toolbarH = props.toolbarInfo ? TOOLBAR_H : 0;
  const patternH = props.height - overviewH - toolbarH;

  return (
    <pixiContainer layout={{ width: props.width, height: props.height, flexDirection: 'column' }}>
      {/* Toolbar */}
      {props.toolbarInfo && (
        <pixiContainer layout={{ width: props.width, height: toolbarH, flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          {typeof props.toolbarInfo === 'string' ? (
            <pixiBitmapText
              text={props.toolbarInfo}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={theme.textSecondary.color}
            />
          ) : (
            <pixiBitmapText
              text={String(props.toolbarInfo)}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={theme.textSecondary.color}
            />
          )}
        </pixiContainer>
      )}

      {/* Overview slot (e.g. song order list) */}
      {props.overviewSlot && (
        <pixiContainer layout={{ width: props.width, height: overviewH }}>
          {props.overviewSlot}
        </pixiContainer>
      )}

      {/* Pattern editor with channel headers */}
      {props.channels.length > 0 && patternH > 0 && (
        <PixiFormatPatternEditor
          width={props.width}
          height={patternH}
          columns={props.columns}
          channels={props.channels}
          currentRow={props.currentRow}
          isPlaying={props.isPlaying}
        />
      )}

      {props.children}
    </pixiContainer>
  );
};
