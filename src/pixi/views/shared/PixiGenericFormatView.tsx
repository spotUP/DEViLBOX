/**
 * PixiGenericFormatView — reusable Pixi pattern viewer for non-standard formats.
 * Displays a toolbar, optional overview slot, and scrolling pattern rows.
 * Stub — renders a basic layout placeholder.
 */

import React from 'react';

interface ColumnDef {
  key: string;
  label: string;
  width?: number;
  render?: (value: any) => string;
}

interface ActionButton {
  label: string;
  onClick: () => void;
  color?: string;
}

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
  channels: any[];
  currentRow: number;
  isPlaying: boolean;
  children?: React.ReactNode;
}

export const PixiGenericFormatView: React.FC<Props> = (props) => {
  void props.width;
  void props.height;
  void props.formatLabel;
  void props.overviewHeight;

  return (
    <pixiContainer x={0} y={0}>
      {props.overviewSlot}
      {props.children}
    </pixiContainer>
  );
};
