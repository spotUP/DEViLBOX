/**
 * "the matrix in the goat tracker view makes no sense" (owner 2026-10-08):
 * the order matrix over the pattern editor drew all 256 bytes of every
 * channel's order buffer, so a four-position song ran on as hundreds of "00"
 * rows - pattern 0 over and over - after its RST.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gtOrderDisplayRows, ORDER_PAST_END } from '@/components/gtultra/GTOrderMatrix';

describe('GoatTracker order matrix', () => {
  it('ends each channel at RST and its restart position, not at the end of the 256-byte buffer', () => {
    const buf = new Uint8Array(256);
    buf.set([0x00, 0x03, 0x00, 0x0a, 0xff, 0x02]);
    const rows = gtOrderDisplayRows(buf);
    expect(rows).toEqual([0x00, 0x03, 0x00, 0x0a, 0xff, 0x100 | 0x02]);
  });

  it('keeps transpose and repeat commands as they are', () => {
    expect(gtOrderDisplayRows([0xd2, 0xe3, 0xf1, 0x04, 0xff, 0x00]).slice(0, 4)).toEqual([0xd2, 0xe3, 0xf1, 0x04]);
  });

  it('draws rows past a channel\'s end blank, and does not move the scopes', () => {
    const src = readFileSync(resolve(__dirname, '../../gtultra/GTOrderMatrix.tsx'), 'utf8');
    expect(src).toMatch(/emptyValue: ORDER_PAST_END/);
    expect(src).toMatch(/displayRows\[ch\]\[row\] \?\? ORDER_PAST_END/);
    expect(ORDER_PAST_END).toBeGreaterThan(0xff);
    // The matrix is a sub-editor: its canvas keeps its own column layout.
    const shared = readFileSync(resolve(__dirname, '../../shared/SongOrderMatrix.tsx'), 'utf8');
    expect(src).toMatch(/<SongOrderMatrix/);
    expect(shared).toMatch(/\bhideVUMeters\b/);
    const canvas = readFileSync(resolve(__dirname, '../PatternEditorCanvas.tsx'), 'utf8');
    expect(canvas).toMatch(/const layoutOut = hideVUMeters \? ownLayoutRef\.current : channelLayout;/);
    expect(canvas).not.toMatch(/\bchannelLayout\.(scrollLeft|offsets|widths|numChannels) = /);
  });

  // Owner, same day: "the pattern order matrix is bigger than the pattern
  // editor - make it half as high" and "the oscilloscopes leak under the
  // order matrix": a fixed 200 px canvas with no clipping.
  it('is half the pattern editor\'s height and clipped to its box', () => {
    const view = readFileSync(resolve(__dirname, '../../gtultra/GTUltraView.tsx'), 'utf8');
    expect(view).toMatch(/\{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' \}/);
    expect(view).toMatch(/<div style=\{\{ flex: '2 1 0', minHeight: 0, overflow: 'hidden' \}\}>\s*<PatternEditorCanvas\s*formatColumns=\{GTU_COLUMNS\}/);
  });
});
