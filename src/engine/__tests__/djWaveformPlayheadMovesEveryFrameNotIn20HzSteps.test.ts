/**
 * DJ view: the waveform, overview and beat-grid playheads and the pattern
 * rows lagged the audio by up to 50 ms and stepped ~8 px at a time. The store
 * position is written at 20 Hz and the render workers drew that held value
 * on every frame until the next write.
 *
 * Every frame now draws the heard position at that frame's time: the store
 * publishes a clock anchor (heard position, rate, the time it is heard) and
 * every per-frame consumer extrapolates it with positionAtFrame.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { positionAtFrame, heardAnchorMs, clockNowMs, type ClockAnchor } from '@/engine/audioLatency';
import { useDJStore } from '@/stores/useDJStore';

describe('positionAtFrame: the heard position at a frame time from a clock anchor', () => {
  const anchor: ClockAnchor = { positionSec: 30, rate: 1.08, anchorMs: 10_000 };

  it('advances by the time since the anchor at the anchor rate', () => {
    expect(positionAtFrame(anchor, 10_000)).toBeCloseTo(30, 9);
    expect(positionAtFrame(anchor, 10_016.7)).toBeCloseTo(30 + 0.0167 * 1.08, 9);
    expect(positionAtFrame(anchor, 10_050)).toBeCloseTo(30 + 0.05 * 1.08, 9);
  });

  it('a paused anchor does not move, and the result stays inside the track', () => {
    expect(positionAtFrame({ ...anchor, rate: 0 }, 99_999)).toBe(30);
    expect(positionAtFrame(anchor, 20_000, 31)).toBe(31);
    expect(positionAtFrame({ positionSec: 0.01, rate: 1, anchorMs: 1000 }, 0)).toBe(0);
  });
});

describe('heardAnchorMs: when the heard position reaches the ear', () => {
  it('maps currentTime minus the output latency through the output timestamp', () => {
    const origin = performance.timeOrigin;
    const nowPerf = performance.now();
    // The context rendered 12 ms past what is at the speaker; 30 ms output latency.
    const ctx = {
      currentTime: 100.040,
      outputLatency: 0.030,
      getOutputTimestamp: () => ({ contextTime: 100.010 - 0.002, performanceTime: nowPerf }),
    };
    // Heard position belongs to ctx time 100.010, output at nowPerf + 2 ms.
    expect(heardAnchorMs(ctx)).toBeCloseTo(origin + nowPerf + 2, 3);
  });

  it('falls back to now without a usable timestamp', () => {
    const before = clockNowMs();
    const t = heardAnchorMs({ currentTime: 5, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) });
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t - before).toBeLessThan(50);
  });
});

describe('the deck clock anchor follows every position write', () => {
  it('a seek re-anchors at the new position, moving at the playing rate; a stop freezes it', () => {
    const s = useDJStore.getState();
    s.setDeckState('A', { isPlaying: true, positionAnchor: { positionSec: 10, rate: 1, anchorMs: clockNowMs() } });
    s.setDeckState('A', { audioPosition: 42, elapsedMs: 42_000 });
    const a = useDJStore.getState().decks.A.positionAnchor;
    expect(a.positionSec).toBe(42);
    expect(a.rate).toBe(1);
    s.setDeckPlaying('A', false);
    expect(useDJStore.getState().decks.A.positionAnchor.rate).toBe(0);
  });
});

// ── The waveform render worker itself ──────────────────────────────────────

type Frame = (t: number) => void;

describe('the DJ waveform worker draws a moving playhead between two anchor posts', () => {
  let frames: Frame[] = [];
  let nowMs = 1000;
  const readouts: string[] = [];

  beforeEach(() => {
    frames = [];
    readouts.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: Frame) => { frames.push(cb); return frames.length; });
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  function fakeCanvas(): OffscreenCanvas {
    const ctx: Record<string, unknown> = {};
    for (const m of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'setTransform', 'strokeRect', 'stroke']) ctx[m] = () => {};
    ctx.fillText = (text: string, x: number) => { if (x === 4) readouts.push(text); };
    return { width: 0, height: 0, getContext: () => ctx } as unknown as OffscreenCanvas;
  }

  function runFrame(atMs: number): void {
    nowMs = atMs;
    const pending = frames;
    frames = [];
    for (const f of pending) f(atMs);
  }

  it('advances the drawn position on every frame from one anchor, without a new post', async () => {
    vi.stubGlobal('postMessage', () => {});
    await import('@/workers/dj-waveform.worker');
    const onmessage = (self as unknown as { onmessage: (e: { data: unknown }) => void }).onmessage;
    const anchorMs = performance.timeOrigin + 1000;
    onmessage({ data: {
      type: 'init', canvas: fakeCanvas(), dpr: 1, width: 400, height: 120,
      waveformPeaks: [0.5, 0.5, 0.5], durationMs: 300_000,
      anchor: { positionSec: 60, rate: 1, anchorMs },
      cuePoints: [],
      overview: { frequencyPeaks: null, loopActive: false, patternLoopStart: 0, patternLoopEnd: 0, cuePoint: -1, totalPositions: 1, colors: { bg: '#000', bgSecondary: '#000', bgTertiary: '#000', border: '#000' }, beats: null, downbeats: null },
    } });

    runFrame(1000);   // the anchor frame
    runFrame(1030);   // 30 ms later, no post in between
    runFrame(1210);   // 210 ms later, still no post
    expect(readouts).toEqual(['1:00.00', '1:00.03', '1:00.21']);

    // A new anchor (a seek) replaces the clock; frames extrapolate from it.
    onmessage({ data: { type: 'position', anchor: { positionSec: 90, rate: 0, anchorMs: performance.timeOrigin + 1300 } } });
    runFrame(1300);
    runFrame(1400);   // paused: one redraw for the message, then nothing new
    expect(readouts.slice(3)).toEqual(['1:30.00']);
  });
});
