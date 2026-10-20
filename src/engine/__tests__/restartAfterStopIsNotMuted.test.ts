/**
 * Regression (2026-10-20): Shift on an already playing libopenmpt hybrid song
 * restarts it as ToneEngine.stop() followed at once by transport play. stop()
 * mutes the master channel to cut effect tails and restored it only by a 50 ms
 * timer, so row 00 of the restarted song played into the mute: "I hear like
 * half the snare". Playback start must end that mute immediately.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const transport = vi.hoisted(() => {
  let state = { isPlaying: false };
  const listeners: Array<(s: { isPlaying: boolean }) => void> = [];
  return {
    useTransportStore: {
      getState: () => state,
      subscribe: (fn: (s: { isPlaying: boolean }) => void) => { listeners.push(fn); return () => {}; },
      setState: (next: { isPlaying: boolean }) => { state = next; listeners.forEach(fn => fn(state)); },
    },
  };
});
vi.mock('../../stores/useTransportStore', () => transport);

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const fakeTransport = { start: () => {}, stop: () => {}, bpm: { value: 125 } };
  return {
    ...actual,
    now: () => 0,
    getTransport: () => fakeTransport,
    getContext: () => ({ state: 'running' }),
  };
});

import { ToneEngine } from '../ToneEngine';

const MASTER_DB = -6;

function makeEngine(): { engine: ToneEngine; master: { volume: { value: number } } } {
  const engine = Object.create(ToneEngine.prototype) as ToneEngine;
  const internals = engine as unknown as Record<string, unknown>;
  const master = { volume: { value: MASTER_DB } };
  internals['masterChannel'] = master;
  internals['_masterVolumeDb'] = MASTER_DB;
  internals['_djModeActive'] = false;
  internals['_stopTailMuteTimer'] = null;
  internals['masterEffectConfigs'] = new Map();
  internals['releaseAll'] = () => {};
  internals['clearChannelTriggerLevels'] = () => {};
  return { engine, master };
}

afterEach(() => vi.useRealTimers());

describe('restart right after stop', () => {
  it('keeps the master muted for effect tails when nothing starts', () => {
    vi.useFakeTimers();
    const { engine, master } = makeEngine();
    engine.stop();
    expect(master.volume.value).toBe(-Infinity);
    vi.advanceTimersByTime(60);
    expect(master.volume.value).toBe(MASTER_DB);
  });

  it('unmutes the master as soon as the song transport plays again', async () => {
    vi.useFakeTimers();
    const { engine, master } = makeEngine();
    (engine as unknown as { _followTransport(): void })._followTransport();
    await vi.dynamicImportSettled();
    transport.useTransportStore.setState({ isPlaying: true });

    // playSong() on a hybrid song: stop the store, stop the engine, play the store.
    transport.useTransportStore.setState({ isPlaying: false });
    engine.stop();
    transport.useTransportStore.setState({ isPlaying: true });

    expect(master.volume.value).toBe(MASTER_DB);
  });

  it('unmutes the master when start() runs inside the tail window', async () => {
    vi.useFakeTimers();
    const { engine, master } = makeEngine();
    engine.stop();
    await engine.start();
    expect(master.volume.value).toBe(MASTER_DB);
  });

  it('leaves the master muted in DJ mode', async () => {
    vi.useFakeTimers();
    const { engine, master } = makeEngine();
    (engine as unknown as Record<string, unknown>)['_djModeActive'] = true;
    engine.stop();
    await engine.start();
    vi.advanceTimersByTime(60);
    expect(master.volume.value).toBe(-Infinity);
  });
});
