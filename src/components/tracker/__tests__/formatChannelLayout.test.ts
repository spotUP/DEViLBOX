/**
 * Format-mode channel headers fill the canvas (owner, 2026-10-04, F36):
 * MusicLine's one-channel canvases showed a header two thirds across the
 * column. Content never shrinks below its columns.
 */
import { describe, it, expect } from 'vitest';
import { formatChannelLayout } from '../formatChannelLayout';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';

const col = (charWidth: number): ColumnDef => ({ key: `c${charWidth}`, label: '', charWidth } as ColumnDef);
const ch = (columns?: ColumnDef[]): FormatChannel => ({ label: '', patternLength: 0, rows: [], columns } as FormatChannel);
const base = { formatColumns: [col(3), col(2)], charWidth: 8, leftEdge: 40, columnGap: 4, channelPad: 40 };

describe('formatChannelLayout', () => {
  it('one channel in a wide canvas is as wide as the canvas', () => {
    const l = formatChannelLayout({ ...base, formatChannels: [ch()], availableWidth: 660 });
    expect(l.channelOffsets).toEqual([40]);
    expect(l.channelWidths).toEqual([620]);
    expect(l.totalChannelsWidth).toBe(660);
  });
  it('shares the spare width between channels and keeps them contiguous', () => {
    const l = formatChannelLayout({ ...base, formatChannels: [ch(), ch([col(4)])], availableWidth: 400 });
    expect(l.totalChannelsWidth).toBe(400);
    expect(l.channelOffsets[1]).toBe(40 + l.channelWidths[0]);
  });
  it('never shrinks columns: a narrow canvas keeps the content width', () => {
    const l = formatChannelLayout({ ...base, formatChannels: [ch()], availableWidth: 50 });
    expect(l.channelWidths).toEqual([3 * 8 + 4 + 2 * 8 + 40]);
    expect(l.totalChannelsWidth).toBe(40 + 84);
  });
});
