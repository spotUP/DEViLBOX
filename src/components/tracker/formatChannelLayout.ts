/**
 * Channel widths and offsets for the format-mode pattern canvas.
 *
 * Each channel is as wide as its columns plus padding. When the channels
 * together are narrower than the canvas, the spare width is shared out so the
 * headers and columns fill the canvas; the per-channel views (MusicLine,
 * Hippel, Sonix, SunTronic) put one channel in each canvas, and a header
 * that stops two thirds across its column was the owner's F36 (2026-10-04).
 * With `fit` on, the whole pattern is first shrunk (fitScale, no lower limit)
 * so every channel is on screen.
 */
import { fitAndStretchChannelWidths } from './channelLayout';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';

export interface FormatChannelLayout {
  numChannels: number;
  channelOffsets: number[];
  channelWidths: number[];
  /**
   * Right edge of the last channel, from the canvas's left edge; with `gutter` given, from the end of the row-number
   * gutter instead (the pattern path's definition, which allChannelsFit, the scroll strip and the scroll range add the
   * gutter to).
   */
  totalChannelsWidth: number;
  /** Scale the pattern is drawn at (1 unless fit shrank it). */
  fitScale: number;
}

export interface FormatChannelLayoutInput {
  formatChannels: FormatChannel[];
  formatColumns: ColumnDef[];
  /** Character cell width in pixels. */
  charWidth: number;
  /** Where channel 0 starts: row-number gutter plus the global lane when shown. */
  leftEdge: number;
  /** The row-number gutter (unscaled) inside leftEdge; leave out to measure the total from the canvas edge. */
  gutter?: number;
  columnGap: number;
  channelPad: number;
  /** Canvas width; 0 or less disables the stretch. */
  availableWidth: number;
  /** Shrink the pattern so every channel fits (fit all channels). */
  fit?: boolean;
  /** Scale when fit is off (the zoom slider; 1 = base font). */
  manualScale?: number;
}

export function formatChannelLayout(input: FormatChannelLayoutInput): FormatChannelLayout {
  const { formatChannels, formatColumns, charWidth, leftEdge, gutter = 0, columnGap, channelPad, availableWidth, fit = false, manualScale = 1 } = input;
  const widths: number[] = [];
  for (const channel of formatChannels) {
    if (channel.hidden) { widths.push(0); continue; }
    const cols = channel.columns ?? formatColumns;
    const contentWidth = cols.reduce((sum, col) => sum + col.charWidth * charWidth + columnGap, 0) - columnGap;
    widths.push(contentWidth + channelPad);
  }
  const fitted = fitAndStretchChannelWidths(widths, leftEdge, availableWidth, fit, manualScale);
  const offsets: number[] = [];
  let x = fitted.leftEdge;
  for (const w of fitted.widths) { offsets.push(x); x += w; }
  return { numChannels: fitted.widths.length, channelOffsets: offsets, channelWidths: fitted.widths, totalChannelsWidth: x - Math.floor(gutter * fitted.scale), fitScale: fitted.scale };
}
