// @vitest-environment node
/**
 * Reachability: TrackerGLRenderer.render() draws the full-height channel overlays (selected-channel highlight, odd
 * channel stripe) AFTER the opaque main-row backgrounds. Drawn before them, the rows covered the highlight and it only
 * showed on the translucent ghost rows ("selected channel only shows on ghost rows").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../glyph-atlas', async (importOriginal) => {
  const real = await importOriginal<typeof import('../glyph-atlas')>();
  return {
    ...real,
    buildGlyphAtlas: (_gl: unknown, _f: string, _s: number, rowH: number, dpr: number) => ({
      texture: {}, lookup: new Map(), glyphLogicalWidth: 8, glyphLogicalHeight: rowH,
      atlasPixelWidth: 1, atlasPixelHeight: 1, dpr,
    }),
  };
});

import { TrackerGLRenderer } from '../TrackerGLRenderer';
import type { TrackerRenderInput, PatternSnapshot, ThemeSnapshot, CellSnapshot } from '../worker-types';

type Rect = { x: number; y: number; w: number; h: number; color: number[] };
type RectInternals = { addRect: (x: number, y: number, w: number, h: number, color: number[]) => void };

const WIDTH = 800;
const HEIGHT = 600;
const CH_W = 160;
const OFFSETS = [40, 200, 360, 520];

function stubGl(): WebGL2RenderingContext {
  const target: Record<string, unknown> = { canvas: { width: 0, height: 0 } };
  return new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return () => true;
      if (/^[A-Z0-9_]+$/.test(prop)) return 1;
      return () => ({});
    },
  }) as unknown as WebGL2RenderingContext;
}

const theme: ThemeSnapshot = {
  accent: '#ff0000', accentSecondary: '#00ff00', accentGlow: 'rgba(255,0,0,0.2)', rowCurrent: '#222222',
  bg: '#000000', rowNormal: '#101010', rowHighlight: '#181818', rowSecondaryHighlight: '#202020',
  border: '#333333', trackerBorder: '#333333', textNote: '#ffffff', textNoteActive: '#ffffff',
  textMuted: '#888888', textInstrument: '#ffffff', textVolume: '#ffffff', textEffect: '#ffffff',
  lineNumber: '#888888', lineNumberHighlight: '#ffffff', selection: 'rgba(0,0,255,0.3)', bookmark: '#f59e0b',
};

const emptyCell: CellSnapshot = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
const pattern: PatternSnapshot = {
  id: 'p0', length: 64,
  channels: OFFSETS.map((_, i) => ({ id: `c${i}`, effectCols: 2, rows: Array.from({ length: 64 }, () => emptyCell) })),
};

function input(cursorChannel: number): TrackerRenderInput {
  return {
    patterns: [pattern], currentPatternIndex: 0, scrollX: 0,
    cursor: { rowIndex: 32, channelIndex: cursorChannel, columnType: 'note', digitIndex: 0 },
    selection: null,
    playback: { row: 0, smoothOffset: 0, patternIndex: 0, isPlaying: false },
    theme,
    ui: {
      useHex: true, blankEmpty: true, showGhostPatterns: false,
      columnVisibility: { flag1: false, flag2: false, probability: false },
      trackerVisualBg: false, recordMode: false, rowHeight: 24,
      rowHighlightInterval: 4, rowSecondaryHighlightInterval: 16,
      showBeatLabels: false, noteDisplayOffset: 0, bookmarks: [],
    },
    layout: { offsets: OFFSETS, widths: OFFSETS.map(() => CH_W), totalWidth: 680 },
    dragOver: null,
  };
}

let rects: Rect[];
beforeEach(() => { rects = []; });

function renderFrame(cursorChannel: number): void {
  const canvas = { getContext: () => stubGl(), width: 0, height: 0 } as unknown as OffscreenCanvas;
  const proto = TrackerGLRenderer.prototype as unknown as RectInternals;
  const real = proto.addRect;
  proto.addRect = function (x, y, w, h, color) {
    rects.push({ x, y, w, h, color: [...color] });
    return real.call(this, x, y, w, h, color);
  };
  try {
    const r = new TrackerGLRenderer(canvas);
    r.resize(WIDTH, HEIGHT, 1);
    r.render(input(cursorChannel));
  } finally {
    proto.addRect = real;
  }
}

/** Full-height, channel-wide rects: the overlays (the channel border is 1px wide, the row backgrounds 24px high). */
const overlays = () => rects.map((r, i) => ({ r, i })).filter(({ r }) => r.y === 0 && r.h === HEIGHT && r.w === CH_W);
const lastRowBackground = () => rects.reduce((last, r, i) => (r.x === 0 && r.w === WIDTH && r.h === 24 && r.color[3] === 1 ? i : last), -1);

describe('channel overlays over the main rows', () => {
  it('draws the selected-channel highlight over the main rows', () => {
    renderFrame(2);
    const lastRow = lastRowBackground();
    expect(lastRow).toBeGreaterThan(0);
    // Channel 2 is even, so the only overlay on it is the selected-channel highlight
    const hl = overlays().filter(({ r }) => r.x === OFFSETS[2]);
    expect(hl).toHaveLength(1);
    expect(hl[0].i).toBeGreaterThan(lastRow);
  });

  it('stripes every second channel', () => {
    renderFrame(2);
    const lastRow = lastRowBackground();
    const stripes = overlays().filter(({ r }) => r.x !== OFFSETS[2]);
    expect(stripes.map(({ r }) => r.x)).toEqual([OFFSETS[1], OFFSETS[3]]);
    for (const { i } of stripes) expect(i).toBeGreaterThan(lastRow);
  });
});
