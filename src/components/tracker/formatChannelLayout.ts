/**
 * Channel widths and offsets for the format-mode pattern canvas.
 *
 * Each channel is as wide as its columns plus padding. When the channels
 * together are narrower than the canvas, the spare width is shared out so the
 * headers and columns fill the canvas; the per-channel views (MusicLine,
 * Hippel, Sonix, SunTronic) put one channel in each canvas, and a header
 * that stops two thirds across its column was the owner's F36 (2026-10-04).
 * Content never shrinks: a canvas narrower than the columns scrolls.
 */
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';

export interface FormatChannelLayout {
  numChannels: number;
  channelOffsets: number[];
  channelWidths: number[];
  /** Right edge of the last channel, from the canvas's left edge. */
  totalChannelsWidth: number;
}

export interface FormatChannelLayoutInput {
  formatChannels: FormatChannel[];
  formatColumns: ColumnDef[];
  /** Character cell width in pixels. */
  charWidth: number;
  /** Where channel 0 starts: row-number gutter plus the global lane when shown. */
  leftEdge: number;
  columnGap: number;
  channelPad: number;
  /** Canvas width; 0 or less disables the stretch. */
  availableWidth: number;
}

export function formatChannelLayout(input: FormatChannelLayoutInput): FormatChannelLayout {
  const { formatChannels, formatColumns, charWidth, leftEdge, columnGap, channelPad, availableWidth } = input;
  const widths: number[] = [];
  for (const channel of formatChannels) {
    const cols = channel.columns ?? formatColumns;
    const contentWidth = cols.reduce((sum, col) => sum + col.charWidth * charWidth + columnGap, 0) - columnGap;
    widths.push(contentWidth + channelPad);
  }
  const content = widths.reduce((a, b) => a + b, 0);
  const spare = availableWidth - leftEdge - content;
  if (spare > 0 && widths.length > 0) {
    const each = Math.floor(spare / widths.length);
    for (let i = 0; i < widths.length; i++) widths[i] += each;
    widths[widths.length - 1] += spare - each * widths.length;
  }
  const offsets: number[] = [];
  let x = leftEdge;
  for (const w of widths) { offsets.push(x); x += w; }
  return { numChannels: widths.length, channelOffsets: offsets, channelWidths: widths, totalChannelsWidth: x };
}
