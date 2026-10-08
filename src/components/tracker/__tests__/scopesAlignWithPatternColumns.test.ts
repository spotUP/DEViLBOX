/**
 * "The scope strip spreads its cells evenly across the width, not lined up
 * with the pattern columns" - owner 2026-10-08: fix. Each scope sits over its
 * own channel column, following the editor's horizontal scroll.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { scopeCells } from '../channelLayout';

describe('track scopes line up with the pattern columns', () => {
  const layout = { offsets: [40, 200, 360], widths: [160, 160, 160], scrollLeft: 0, numChannels: 3 };

  it('puts each scope over its channel column, not in equal cells across the strip', () => {
    const cells = scopeCells(3, 1200, layout);
    expect(cells.map((c) => c.x)).toEqual([40, 200, 360]);
    expect(cells.every((c) => c.w === 159)).toBe(true);
  });

  it('follows the editor when it scrolls sideways', () => {
    expect(scopeCells(3, 1200, { ...layout, scrollLeft: 100 })[1].x).toBe(100);
  });

  it('falls back to equal cells until the editor has published a layout for these channels', () => {
    const cells = scopeCells(4, 403, { ...layout, numChannels: 3 });
    expect(cells.map((c) => c.x)).toEqual([0, 101, 202, 303]);
  });

  it('is what the strip draws and hit-tests', () => {
    const src = readFileSync(resolve(__dirname, '../TrackScopesStrip.tsx'), 'utf8');
    expect(src.match(/scopeCells\(nc, /g)?.length).toBe(2);
  });
});
