/**
 * The Canvas2D fallback draws the same full-height channel overlays as the
 * WebGL renderer: stripe on every second channel, accent tint on the cursor
 * channel, the channel's own colour, and the (soft) mute dim, all at the
 * strengths from channelOverlayStyle.
 */
import { describe, it, expect } from 'vitest';
import { TrackerCanvas2DRenderer } from '../TrackerCanvas2DRenderer';
import {
  CHANNEL_COLOR_TINT_ALPHA, CHANNEL_STRIPE_ALPHA, CURSOR_CHANNEL_TINT_ALPHA,
  MUTED_OVERLAY_ALPHA, isStripedChannel,
} from '../channelOverlayStyle';

const H = 600;
interface Fill { x: number; w: number; h: number; fill: string; alpha: number }

function fullHeightFills(channels: { muted?: boolean; color?: string }[], cursorCh: number): Fill[] {
  const fills: Fill[] = [];
  const t: Record<string, unknown> = { canvas: { width: 800, height: H }, globalAlpha: 1, fillStyle: '' };
  const ctx = new Proxy(t, {
    get: (o, k) => (k in o ? o[k as string]
      : k === 'fillRect' ? (x: number, _y: number, w: number, h: number) => {
        fills.push({ x, w, h, fill: String(o.fillStyle), alpha: Number(o.globalAlpha) });
      }
      : k === 'measureText' ? () => ({ width: 10 }) : () => undefined),
    set: (o, k, v) => { o[k as string] = v; return true; },
  });
  const canvas = { width: 800, height: H, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const r = new TrackerCanvas2DRenderer(canvas);
  const W = 100;
  r.render({
    patterns: [{
      id: 'p0', length: 8,
      channels: channels.map((c, i) => ({
        id: `c${i}`, effectCols: 1, ...c,
        rows: Array.from({ length: 8 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })),
      })),
    }],
    currentPatternIndex: 0, scrollX: 0,
    cursor: { rowIndex: 0, channelIndex: cursorCh, columnType: 'note', digitIndex: 0, noteColumnIndex: 0 },
    selection: null,
    playback: { row: 0, smoothOffset: 0, patternIndex: 0, isPlaying: false },
    theme: new Proxy({}, { get: (_o, k) => (k === 'accent' ? '#ff0000' : '#000') }) as never,
    ui: { rowHeight: 20, rowHighlightInterval: 4, columnVisibility: {} } as never,
    layout: { offsets: channels.map((_, i) => i * W), widths: channels.map(() => W), totalWidth: W * channels.length },
    dragOver: null,
    preview: null,
  } as never);
  // Channel x positions start after the row-number gutter; find it from the cursor tint.
  const full = fills.filter(f => f.h === H && f.w === W);
  const tint = full.find(f => f.fill === '#ff0000' && f.alpha === CURSOR_CHANNEL_TINT_ALPHA);
  const gutter = tint ? tint.x - cursorCh * W : 0;
  return full.map(f => ({ ...f, x: f.x - gutter }));
}

describe('channel overlays in the 2D renderer', () => {
  it('stripes every second channel and tints the cursor channel', () => {
    const fills = fullHeightFills([{}, {}, {}, {}], 2);
    for (let ch = 0; ch < 4; ch++) {
      const at = fills.filter(f => f.x === ch * 100);
      expect(at.some(f => f.fill === '#000000' && f.alpha === CHANNEL_STRIPE_ALPHA)).toBe(isStripedChannel(ch));
      expect(at.some(f => f.fill === '#ff0000' && f.alpha === CURSOR_CHANNEL_TINT_ALPHA)).toBe(ch === 2);
    }
  });

  it('tints a coloured channel and dims a muted one softly', () => {
    const fills = fullHeightFills([{ color: '#00ff00' }, {}, { muted: true }], 1);
    expect(fills.some(f => f.x === 0 && f.fill === '#00ff00' && f.alpha === CHANNEL_COLOR_TINT_ALPHA)).toBe(true);
    const dim = fills.filter(f => f.x === 200 && f.fill === '#000000');
    expect(dim.map(f => f.alpha)).toEqual([MUTED_OVERLAY_ALPHA]);
    expect(MUTED_OVERLAY_ALPHA).toBeLessThan(0.45);
  });
});
