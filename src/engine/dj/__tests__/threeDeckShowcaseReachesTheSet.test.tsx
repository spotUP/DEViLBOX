/**
 * The Three Deck Showcase (owner decision 2026-10-13; ledger J1-J10, X8, D1 rest, D3-D6) through its entry points:
 *
 *   MCP       dj_three_deck_showcase -> DJActions.toggleThreeDeckShowcase -> the player:
 *             the demo render (renderThreeDeckShowcase, sentinel 1) plays on the mixer's sampler input; the buffer
 *             it plays nulls three_deck.render_from_params({}) (fixture gen_three_deck_showcase.py); the playing
 *             decks are paused (held), the DJ mixer is untouched; the view draws the render's 50 Hz streams (the
 *             gesture on Deck C at the playing tick = the demo's gesture_id stream)
 *   MCP       dj_three_deck_showcase ends it: the held decks resume where they stopped, and starts it again (the
 *             render is reused)
 *   DJ view   the Auto DJ panel has no showcase button (owner decision 2026-10-14) and shows nothing while it is
 *             idle; while it plays it shows the view
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import fixture from '@/engine/dj/scratch/__tests__/fixtures/three_deck_showcase.json';

const holder = vi.hoisted(() => ({
  ctx: null as unknown, off: null as unknown, now: 0, samplerInput: null as unknown,
  pauses: [] as string[], plays: [] as string[], mixerCalls: 0,
  buffers: [] as AudioBuffer[], connects: [] as unknown[],
}));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => holder.now, start: async () => undefined, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => {
  const deck = (id: string) => ({
    id, playbackMode: 'audio',
    pause: () => { holder.pauses.push(id); },
    play: async () => { holder.plays.push(id); },
    setVolume: () => undefined,
  });
  const decks: Record<string, ReturnType<typeof deck>> = { A: deck('A'), B: deck('B'), C: deck('C') };
  const mixerTouched = () => { holder.mixerCalls++; };
  const engine = () => ({
    getDeck: (id: string) => decks[id],
    setCrossfader: mixerTouched,
    mixer: { samplerInput: holder.samplerInput, inputA: null, inputB: null, setCrossfader: mixerTouched, setCrossfaderCurve: mixerTouched, setMasterVolume: mixerTouched },
  });
  return { getDJEngine: engine, getDJEngineIfActive: engine };
});

interface Sub { n: number; keep: number; x: number[] }
const F = fixture as unknown as { rate: number; mix: Sub; streams: Record<string, number[]> };

function residualDb(ours: ArrayLike<number>, ref: Sub): number {
  expect(ours.length).toBe(ref.n);
  let e = 0, s = 0;
  ref.x.forEach((v, i) => { const d = ours[i * ref.keep]! - v; e += d * d; s += v * v; });
  return 10 * Math.log10(e / s + 1e-300);
}

describe('the Three Deck Showcase reaches the set from the MCP and shows in the DJ view without a button', () => {
  beforeAll(() => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const off = new OfflineAudioContext(1, 22050, 22050);
    holder.off = off;
    holder.samplerInput = off.createGain();
    // the live context as the player sees it: its clock is the test's
    holder.ctx = new Proxy(off, {
      get(target, prop) {
        if (prop === 'currentTime') return holder.now;
        if (prop === 'createBuffer') return (...a: [number, number, number]) => { const b = target.createBuffer(...a); holder.buffers.push(b); return b; };
        if (prop === 'createBufferSource') return () => {
          const src = target.createBufferSource();
          const connect = src.connect.bind(src) as (n: AudioNode) => AudioNode;
          (src as unknown as { connect: (n: AudioNode) => AudioNode }).connect = (n: AudioNode) => { holder.connects.push(n); return connect(n); };
          return src;
        };
        const v = Reflect.get(target, prop, target) as unknown;
        return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(target) : v;
      },
    });
  });
  afterEach(() => cleanup());

  it('MCP -> the demo render while the set holds, no showcase button in the Auto DJ panel -> MCP ends it and the set resumes -> MCP starts and ends it again', async () => {
    // a pause stops the deck's stream auto dub (DJActions imports it on demand): loaded whole first, as in the app
    await import('@/engine/dub/StreamAutoDub');
    const { useDJStore } = await import('@/stores/useDJStore');
    const { ThreeDeckShowcasePanel, showcaseViewStats, showcaseGestureLabel } = await import('@/components/dj/ThreeDeckShowcasePanel');
    const { showcaseStats } = await import('@/engine/dj/scratch/threeDeckShowcase');
    const { showcasePlayerStats } = await import('@/engine/dj/scratch/threeDeckShowcasePlayer');
    const { getThreeDeckShowcase } = await import('@/engine/dj/DJActions');

    const store = useDJStore.getState();
    store.setDeckPlaying('A', true);
    store.setDeckPlaying('B', true);
    store.setCrossfader(0.37);
    const mixerBefore = JSON.stringify({ x: useDJStore.getState().crossfaderPosition, a: useDJStore.getState().decks.A.volume, b: useDJStore.getState().decks.B.volume });
    const renders0 = showcaseStats.renders;

    // --- idle: the Auto DJ panel shows no showcase and no button to start one (owner decision 2026-10-14) ---
    const view = render(<ThreeDeckShowcasePanel />);
    const player = await getThreeDeckShowcase();
    expect(view.queryByTestId('three-deck-showcase')).toBeNull();
    expect(view.queryByRole('button', { name: /showcase/i })).toBeNull();

    // --- the MCP tool starts it ---
    const { djThreeDeckShowcase } = await import('@/bridge/handlers/djHandlers');
    await act(async () => { await djThreeDeckShowcase(); });
    await waitFor(() => expect(player.state.status).toBe('playing'), { timeout: 120_000, interval: 200 });
    expect(view.getByTestId('three-deck-showcase')).toBeTruthy();
    expect(view.queryByRole('button', { name: /showcase/i })).toBeNull();

    expect(showcaseStats.renders - renders0).toBe(1);
    expect(showcasePlayerStats.played).toBe(1);
    expect(player.state.held).toEqual(['A', 'B']);
    expect(holder.pauses).toEqual(['A', 'B']);
    expect(useDJStore.getState().decks.A.isPlaying).toBe(false);
    expect(useDJStore.getState().decks.B.isPlaying).toBe(false);
    // the render played is the demo's, on the mixer's sampler input
    const played = holder.buffers[holder.buffers.length - 1]!;
    expect(played.sampleRate).toBe(22050);
    expect(residualDb(played.getChannelData(0), F.mix)).toBeLessThan(-100);
    expect(holder.connects).toEqual([holder.samplerInput]);

    // the view draws the playing tick's streams: Deck C's gesture = the demo's gesture_id stream
    let tick = -1;
    for (let t = 1000; t < F.streams.gesture_id!.length; t++) if (F.streams.gesture_id![t]! > 0) { tick = t; break; }
    holder.now = player.state.startTime + (tick + 0.5) / 50;
    await waitFor(() => expect(view.getByTestId('showcase-gesture').textContent).toBe(showcaseGestureLabel(F.streams.gesture_id![tick]!)), { timeout: 5_000 });
    expect(showcaseViewStats.frames).toBeGreaterThan(0);
    expect(view.getByTestId('showcase-crossfader').style.left).toBe(`${(F.streams.crossfader![tick]! / 255 * 100).toFixed(1)}%`);

    // Deck C's platter and scratch fader (the views' one timeline, D1) follow every stroke of the playing render, and
    // the platter keeps spinning through the render's silent Deck C sections - the strokes ahead keep it driven (owner: "the plate is dead and the
    // crossfader is dead" - the render's strokes never reached the Deck C timeline)
    const { deckCMotionNow, deckCPlatterRadians } = await import('@/engine/dj/scratch/deckCMotion');
    const r = player.current!;
    const base = Math.trunc(player.state.startTime * 22050);
    const sec = (s: number) => (base + s + 0.5) / 22050;
    let moved = 0;
    for (const st of r.strokes) {
      const mid = st.start + Math.trunc(st.length / 2);
      const m = deckCMotionNow(sec(mid));
      expect(m, `stroke at ${st.start}`).not.toBeNull();
      expect(m!.active).toBe(true);
      expect(m!.fade).toBeGreaterThanOrEqual(st.viz ? st.viz.fade[mid - st.start]! : 1);
      if (Math.abs(deckCPlatterRadians(sec(mid))! - deckCPlatterRadians(sec(st.start))!) > 1e-9) moved++;
    }
    expect(moved).toBe(r.strokes.length);
    const silentBar = 23 * 16 * Math.trunc(22050 * 60 / (92 * 4));
    expect(deckCPlatterRadians(sec(silentBar))).not.toBeNull();
    expect(deckCMotionNow(sec(silentBar))!.fade).toBe(0);

    // --- the MCP tool ends it: the held decks resume where they stopped ---
    const ended = await djThreeDeckShowcase();
    expect(ended.status).toBe('idle');
    // ended early: its later strokes leave the Deck C timeline (the platter goes back to the deck's own clock)
    expect(deckCMotionNow(sec(r.mix.length - 22050))).toBeNull();
    await waitFor(() => expect(holder.plays).toEqual(['A', 'B']));
    expect(useDJStore.getState().decks.A.isPlaying).toBe(true);
    expect(useDJStore.getState().decks.B.isPlaying).toBe(true);
    expect(showcasePlayerStats.resumes).toBe(1);

    // --- the MCP tool starts and ends it again (the same render reused) ---
    void djThreeDeckShowcase();
    await waitFor(() => expect(player.state.status).toBe('playing'), { timeout: 30_000 });
    expect(showcaseStats.renders - renders0).toBe(1);
    expect(holder.pauses).toEqual(['A', 'B', 'A', 'B']);
    await djThreeDeckShowcase();
    await waitFor(() => expect(holder.plays).toEqual(['A', 'B', 'A', 'B']));

    // never the DJ mixer
    expect(holder.mixerCalls).toBe(0);
    expect(JSON.stringify({ x: useDJStore.getState().crossfaderPosition, a: useDJStore.getState().decks.A.volume, b: useDJStore.getState().decks.B.volume })).toBe(mixerBefore);
  }, 240_000);
});
