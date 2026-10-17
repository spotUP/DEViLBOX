/**
 * Voice to Notes ghost notes through the 2D renderer's public render():
 * the preview's notes replace the displayed note on the target channel only
 * while a preview is set.
 */
import { describe, it, expect } from 'vitest';
import { TrackerCanvas2DRenderer, noteStr } from '../TrackerCanvas2DRenderer';
import type { PatternPreviewSnapshot } from '../worker-types';

function drawWith(preview: PatternPreviewSnapshot | null): string[] {
  const drawn: string[] = [];
  const ctx = new Proxy({ canvas: { width: 800, height: 600 } } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : k === 'fillText' ? (s: string) => drawn.push(s) : () => undefined),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
  const canvas = { width: 800, height: 600, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const r = new TrackerCanvas2DRenderer(canvas);
  r.render({
    patterns: [{
      id: 'p0', length: 8,
      channels: [{
        id: 'c0', effectCols: 2,
        rows: Array.from({ length: 8 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })),
      }],
    }],
    currentPatternIndex: 0, scrollX: 0,
    cursor: { rowIndex: 0, channelIndex: 0, columnType: 'note', digitIndex: 0, noteColumnIndex: 0 },
    selection: null,
    playback: { row: 0, smoothOffset: 0, patternIndex: 0, isPlaying: false },
    theme: new Proxy({}, { get: () => '#000' }) as never,
    ui: { rowHeight: 20, rowHighlightInterval: 4, columnVisibility: {} } as never,
    layout: { offsets: [0], widths: [400], totalWidth: 400 },
    dragOver: null,
    preview,
  });
  return drawn;
}

describe('Voice to Notes preview in the 2D renderer', () => {
  it('draws previewed notes and note-off, and nothing once cleared', () => {
    const c4 = noteStr(49, 0);
    const off = noteStr(97, 0);
    const shown = drawWith({ channelIndex: 0, startRow: 2, notes: [49, 0, 97] });
    expect(shown).toContain(c4);
    expect(shown).toContain(off);
    expect(drawWith(null)).not.toContain(c4);
    expect(drawWith(null)).not.toContain(off);
  });
});
