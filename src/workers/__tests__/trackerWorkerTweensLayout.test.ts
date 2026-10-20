// @vitest-environment node
/**
 * Reachability: a `layout` message posted to the real worker onmessage glides
 * the geometry over the rAF loop (strictly intermediate row heights are the
 * sentinel), resizes the renderer only when w/h/dpr/scale change, and draws
 * nothing once idle. A channel-count change fades the last frame out, then the
 * new picture in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const renders: Array<{ rowHeight: number; offsets: number[]; fade: number | undefined }> = [];
const resizes: Array<[number, number, number]> = [];
vi.mock('@/engine/renderer/TrackerGLRenderer', () => ({
  TrackerGLRenderer: class {
    resize(w: number, h: number, dpr: number) { resizes.push([w, h, dpr]); }
    render(s: { ui: { rowHeight: number }; layout: { offsets: number[] }; fade?: number }) {
      renders.push({ rowHeight: s.ui.rowHeight, offsets: s.layout.offsets.slice(), fade: s.fade });
    }
  },
}));
vi.mock('@/engine/renderer/TrackerCanvas2DRenderer', () => ({ TrackerCanvas2DRenderer: class { resize() {} render() {} } }));

const frames: FrameRequestCallback[] = [];
let now = 0;
beforeEach(() => {
  renders.length = 0; resizes.length = 0; frames.length = 0; now = 0;
  globalThis.self = globalThis as unknown as Window & typeof globalThis;
  globalThis.postMessage = vi.fn() as never;
  globalThis.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

async function bootWorker() {
  vi.resetModules();
  await import('@/workers/tracker-render.worker');
  return (msg: unknown) => (self.onmessage as (e: { data: unknown }) => void)({ data: msg });
}
function runFrame(dt: number) { now += dt; const cb = frames.shift()!; cb(now); }

const ui = (rowHeight: number) => ({
  useHex: true, blankEmpty: false, showGhostPatterns: false,
  columnVisibility: { flag1: false, flag2: false, probability: false },
  trackerVisualBg: false, recordMode: false, rowHeight,
  rowHighlightInterval: 4, rowSecondaryHighlightInterval: 16,
  showBeatLabels: false, noteDisplayOffset: 0, bookmarks: [],
});
/** The renders after `from`, split at the first frame drawn with the new offsets. */
function outThenIn(from: number, newOffsets: number[]) {
  const after = renders.slice(from);
  const swap = after.findIndex(r => r.offsets.join() === newOffsets.join());
  return { out: after.slice(0, swap), in: after.slice(swap) };
}
const lay = (offsets: number[], width: number) => ({ offsets, widths: offsets.map(() => width), totalWidth: offsets.length * width });
const OFF4 = [40, 200, 360, 520];
const TARGET4 = [40, 280, 520, 760];

function initMsg(extra: Record<string, unknown> = {}, offsets = OFF4) {
  return {
    type: 'init', canvas: {}, dpr: 1, width: 800, height: 600,
    theme: { bg: '#000000' }, uiState: ui(24), patterns: [], currentPatternIndex: 0,
    cursor: { rowIndex: 0, channelIndex: 0, columnType: 'note', digitIndex: 0 },
    selection: null, channelLayout: lay(offsets, 160), scale: 1, ...extra,
  };
}
const layoutMsg = (rowHeight: number, offsets: number[], width: number, extra: Record<string, unknown> = {}) => ({
  type: 'layout', w: 800, h: 600, dpr: 1, scale: 1, uiState: ui(rowHeight), channelLayout: lay(offsets, width), ...extra,
});

describe('tracker worker tweens layout', () => {
  it('c1: geometry glides over 150 ms, resizes once, then idles', async () => {
    const post = await bootWorker();
    post(initMsg());
    runFrame(16);
    const before = renders.length;
    post(layoutMsg(36, TARGET4, 240));
    for (let i = 0; i < 10; i++) runFrame(16);
    expect(resizes.length).toBe(1);
    const after = renders.slice(before);
    expect(after.length).toBeGreaterThan(2);
    const heights = after.map(r => r.rowHeight);
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]);
    expect(heights[0]).toBeGreaterThan(24);
    expect(heights.some(h => h > 24 && h < 36)).toBe(true);
    expect(after[after.length - 1].offsets).toEqual(TARGET4);
    expect(heights[heights.length - 1]).toBe(36);
    const n = renders.length;
    runFrame(16); runFrame(16);
    expect(renders.length).toBe(n);
  });

  it('c2: a channel-count change fades the old picture out, then the new one in, without resizing', async () => {
    const post = await bootWorker();
    post(initMsg());
    runFrame(16);
    const off16 = Array.from({ length: 16 }, (_, i) => 40 + i * 50);
    post({ type: 'patterns', patterns: [], currentPatternIndex: 0, awaitLayout: true });
    const held = renders.length;
    runFrame(16); runFrame(16);
    expect(renders.length).toBe(held);
    post(layoutMsg(24, off16, 50));
    for (let i = 0; i < 60; i++) runFrame(16);
    const { out, in: fadeIn } = outThenIn(held, off16);
    expect(out.length).toBeGreaterThan(2);
    expect(out.every(r => r.offsets.join() === OFF4.join())).toBe(true);
    for (let i = 1; i < out.length; i++) expect(out[i].fade!).toBeLessThan(out[i - 1].fade!);
    expect(out[0].fade).toBeLessThan(1);
    expect(fadeIn[0].fade).toBe(0);
    expect(fadeIn[fadeIn.length - 1].fade).toBe(1);
    expect(resizes.length).toBe(1);
  });

  it('c3: reduced motion snaps in one render', async () => {
    const post = await bootWorker();
    post(initMsg({ reducedMotion: true }));
    runFrame(16);
    const before = renders.length;
    post(layoutMsg(36, TARGET4, 240));
    runFrame(16); runFrame(16); runFrame(16);
    const after = renders.slice(before);
    expect(after.length).toBe(1);
    expect(after[0].rowHeight).toBe(36);
  });

  it('c3b: a canvas resize (side panel sliding) draws the new geometry in the next render, no glide', async () => {
    const post = await bootWorker();
    post(initMsg());
    runFrame(16);
    const before = renders.length;
    post(layoutMsg(24, TARGET4, 240, { w: 700 }));
    runFrame(16); runFrame(16); runFrame(16);
    const after = renders.slice(before);
    expect(after.length).toBe(1);
    expect(after[0].offsets).toEqual(TARGET4);
  });

  it('c4: a scale change resizes once and draws offsets divided by the scale', async () => {
    const post = await bootWorker();
    post(initMsg());
    runFrame(16);
    post(layoutMsg(24, OFF4, 160, { scale: 0.5 }));
    for (let i = 0; i < 3; i++) runFrame(16);
    expect(resizes.filter(r => r[2] === 0.5)).toEqual([[1600, 1200, 0.5]]);
    expect(renders[renders.length - 1].offsets).toEqual(OFF4.map(v => v / 0.5));
  });

  it('c5: a second same-count layout 1 ms after the first keeps the fade rising', async () => {
    const post = await bootWorker();
    post(initMsg());
    runFrame(16);
    const off16 = Array.from({ length: 16 }, (_, i) => 40 + i * 50);
    post({ type: 'patterns', patterns: [], currentPatternIndex: 0, awaitLayout: true });
    const held = renders.length;
    post(layoutMsg(24, off16, 50));
    now += 1;
    post(layoutMsg(24, off16, 51));
    for (let i = 0; i < 60; i++) runFrame(16);
    const fades = outThenIn(held, off16).in.map(r => r.fade ?? 1);
    expect(fades[0]).toBe(0);
    expect(fades.some(f => f > 0 && f < 1)).toBe(true);
    for (let i = 1; i < fades.length; i++) expect(fades[i]).toBeGreaterThanOrEqual(fades[i - 1]);
    expect(fades[fades.length - 1]).toBe(1);
    expect(renders[renders.length - 1].offsets).toEqual(off16);
  });

  it('c6: covered by the song-load overlay, the old picture fades out, the new one waits at 0 and fades in after the reveal', async () => {
    const post = await bootWorker();
    post(initMsg());
    runFrame(16);
    post({ type: 'cover', covered: true });
    const off16 = Array.from({ length: 16 }, (_, i) => 40 + i * 50);
    post({ type: 'patterns', patterns: [], currentPatternIndex: 0, awaitLayout: true });
    post(layoutMsg(24, off16, 50));
    const start = renders.length;
    for (let i = 0; i < 30; i++) runFrame(16); // 480 ms under the overlay
    const { out, in: held } = outThenIn(start, off16);
    expect(out.length).toBeGreaterThan(2);
    expect(out[0].fade).toBeGreaterThan(0);
    expect(held.length).toBeGreaterThan(0);
    expect(held.every(r => r.fade === 0)).toBe(true);
    post({ type: 'cover', covered: false });
    const revealed = renders.length;
    for (let i = 0; i < 30; i++) runFrame(16);
    const fades = renders.slice(revealed).map(r => r.fade ?? 1);
    expect(fades[0]).toBe(0);
    expect(fades.some(f => f > 0 && f < 1)).toBe(true);
    for (let i = 1; i < fades.length; i++) expect(fades[i]).toBeGreaterThanOrEqual(fades[i - 1]);
    expect(fades[fades.length - 1]).toBe(1);
  });

  it('c7: the jingle end (lips torn down, then the restored song at another scale) fades out once and never shows the torn-down picture', async () => {
    const lips = Array.from({ length: 10 }, (_, i) => 40 + i * 70);
    const post = await bootWorker();
    post(initMsg({}, lips));
    runFrame(16);
    const start = renders.length;
    const resizesBefore = resizes.length;
    post(layoutMsg(24, OFF4, 160)); // teardown: the empty pre-jingle song
    post({ type: 'cover', covered: true });
    runFrame(16); runFrame(16);
    post({ type: 'patterns', patterns: [], currentPatternIndex: 0, awaitLayout: true });
    post(layoutMsg(24, TARGET4, 240, { scale: 0.5 })); // the restored song, fit to width
    expect(resizes.length).toBe(resizesBefore); // the old picture keeps its canvas while it leaves
    for (let i = 0; i < 30; i++) runFrame(16);
    post({ type: 'cover', covered: false });
    for (let i = 0; i < 30; i++) runFrame(16);
    const drawn = renders.slice(start);
    const restored = TARGET4.map(v => v / 0.5).join();
    const { out, in: fadeIn } = outThenIn(start, TARGET4.map(v => v / 0.5));
    expect(out.length).toBeGreaterThan(2);
    expect(out.every(r => r.offsets.join() === lips.join())).toBe(true);
    for (let i = 1; i < out.length; i++) expect(out[i].fade!).toBeLessThan(out[i - 1].fade!);
    expect(drawn.every(r => r.offsets.join() === lips.join() || r.offsets.join() === restored)).toBe(true);
    expect(resizes.slice(resizesBefore)).toEqual([[1600, 1200, 0.5]]);
    expect(fadeIn[0].fade).toBe(0);
    expect(fadeIn[fadeIn.length - 1].fade).toBe(1);
  });
});
