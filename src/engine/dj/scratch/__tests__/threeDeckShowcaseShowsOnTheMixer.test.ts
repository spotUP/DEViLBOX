/**
 * SHOWCASE-VISUALS-DEAD (owner 2026-11-27: "during the three-deck showcase the crossfader and Deck C platter look
 * dead"): while the showcase plays, Deck C's platter follows its strokes, the main mixer's crossfader follows the
 * render's crossfader stream and Deck C is shown; the end restores both; a scratch pool panic leaves the showcase's
 * strokes on the shared Deck C timeline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreeDeckShowcasePlayer, type ShowcaseDeps } from '../threeDeckShowcasePlayer';
import { deckCMotionNow, getDeckCMotion, resetDeckCMotion } from '../deckCMotion';
import { ScratchVoicePool } from '../scratchVoicePool';
import type { ShowcaseRender } from '../threeDeckShowcase';
import type { GestureViz } from '../scratchRender';
import { useDJStore } from '@/stores/useDJStore';

const RATE = 22050;

function fakeCtx() {
  const ctx = {
    currentTime: 0,
    createBuffer: (_c: number, n: number) => { const d = new Float32Array(n); return { getChannelData: () => d }; },
    createBufferSource: () => ({ buffer: null, onended: null, connect() {}, disconnect() {}, start() {}, stop() {} }),
  };
  return ctx;
}

function fakeRender(): ShowcaseRender {
  const n = RATE; // one second stroke
  const recordVel = new Float64Array(n).map((_, i) => (i < n / 2 ? 2 : -1));
  const viz: GestureViz = { recordVel, slipVel: new Float64Array(n), fade: new Float64Array(n).fill(1), position: new Float64Array(n).fill(1) };
  const nTicks = 100;
  const crossfader = new Uint8Array(nTicks).map((_, t) => Math.min(255, t * 3));
  return {
    mix: new Float32Array(2 * RATE),
    strokes: [{ start: 0, length: n, viz }],
    streams: { crossfader },
    nTicks,
  } as unknown as ShowcaseRender;
}

describe('the three deck showcase shows on the main mixer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDeckCMotion();
    useDJStore.getState().setCrossfader(0.5);
    useDJStore.getState().setThirdDeckActive(false);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('drives Deck C and the crossfader while it plays and restores them at the end', async () => {
    const ctx = fakeCtx();
    const render = fakeRender();
    const deps: ShowcaseDeps = {
      ctx: () => ctx as unknown as BaseAudioContext,
      destination: () => ({}) as AudioNode,
      playingDecks: () => [],
      autoDJTransitioning: () => false,
      autoDJTransitionDone: async () => {},
      hold: async () => {},
      resume: async () => {},
      render: async () => render,
    };
    const player = new ThreeDeckShowcasePlayer(deps);
    await player.start();
    expect(player.state.status).toBe('playing');
    expect(useDJStore.getState().thirdDeckActive).toBe(true);

    // Deck C's platter: driven by the stroke, its angle changing
    const a = deckCMotionNow(0.1);
    const b = deckCMotionNow(0.3);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b!.angle).not.toBe(a!.angle);

    // the crossfader follows the stream (tick 25 at 0.05 s + 0.5 s)
    ctx.currentTime = 0.55;
    vi.advanceTimersByTime(40);
    const t = player.tickAt(ctx.currentTime)!;
    expect(useDJStore.getState().crossfaderPosition).toBeCloseTo(render.streams.crossfader[t]! / 255, 6);
    ctx.currentTime = 1.05;
    vi.advanceTimersByTime(40);
    expect(useDJStore.getState().crossfaderPosition).toBeCloseTo(render.streams.crossfader[50]! / 255, 6);

    // a scratch pool panic (a DJ engine rebuild) ends only the pool's strokes
    getDeckCMotion().addStroke(Math.trunc(1.2 * RATE), render.strokes[0]!.viz!, 'scratchVoicePool');
    new ScratchVoicePool({} as BaseAudioContext, {} as AudioNode).panic();
    expect(getDeckCMotion().busyFrom(Math.trunc(1.2 * RATE) + RATE - 10)).toBe(false);
    expect(deckCMotionNow(0.3)).not.toBeNull();

    player.stop();
    await vi.runOnlyPendingTimersAsync();
    expect(player.state.status).toBe('idle');
    expect(useDJStore.getState().crossfaderPosition).toBe(0.5);
    expect(useDJStore.getState().thirdDeckActive).toBe(false);
    // no timer left writing the store
    ctx.currentTime = 0.3;
    vi.advanceTimersByTime(100);
    expect(useDJStore.getState().crossfaderPosition).toBe(0.5);
  });
});
