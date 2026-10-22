/**
 * The channel VU meters ran ahead of the sound (owner, 2026-10-23). The worklet renders a
 * hybrid song 32 ms ahead of its output (the lead that keeps the first synth note's attack),
 * and the output latency comes on top. The engine fed each 'pos' message's levels to the
 * meters on arrival, so they moved that far before the row was heard. Real
 * LibopenmptEngine.handleMessage and ChannelMeterFeed; the audio context and the meter sink
 * are stubs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChannelMeterFeed, registerChannelMeterSink } from '../../tone/channelMeterFeed';
import { LibopenmptEngine } from '../LibopenmptEngine';

vi.mock('@stores/useMixerStore', () => ({ scheduleWasmEffectRebuild: vi.fn() }));
vi.mock('../../stores/useMixerStore', () => ({ scheduleWasmEffectRebuild: vi.fn() }));
vi.mock('../../tone/ChannelRoutedEffects', () => ({ getChannelRoutedEffectsManager: () => null, settleChannelIsolationBeforeRender: vi.fn(async () => undefined) }));

type EngineInternals = { handleMessage: (msg: { data: Record<string, unknown> }) => void };

const LEAD = 0.032;
const LATENCY = 0.012;

let levels: number[][];
let notes: number[];
beforeEach(() => {
  levels = [];
  notes = [];
  registerChannelMeterSink({
    updateRealtimeChannelLevels: (l) => { levels.push([...l]); },
    triggerChannelMeter: (ch) => { notes.push(ch); },
  });
});
afterEach(() => { registerChannelMeterSink(null); });

describe('the channel meters show a row when it is heard, not when it is rendered', () => {
  const ctx = { currentTime: 1, outputLatency: LATENCY };
  let engine: EngineInternals;
  const pos = (level: number): void => engine.handleMessage({ data: {
    cmd: 'pos', order: 0, pattern: 0, row: 0, audioTime: ctx.currentTime + LEAD, chLevels: new Float32Array([level]),
  } });

  beforeEach(() => {
    engine = Object.create(LibopenmptEngine.prototype) as EngineInternals;
    Object.assign(engine, { output: { context: ctx }, _playing: false, _noteStarts: [] });
    ctx.currentTime = 1;
  });

  it('a level reaches the meters only after the lead and the output latency have passed', () => {
    pos(0.5);
    expect(levels, 'the meters moved before the row was heard').toEqual([]);
    ctx.currentTime += LEAD + LATENCY - 0.003;
    pos(0.25);
    expect(levels, 'the meters moved before the row was heard').toEqual([]);
    ctx.currentTime += 0.004;
    pos(0.125);
    expect(levels).toEqual([[0.5]]);
  });
});

describe('ChannelMeterFeed.reportAt', () => {
  it('feeds only the newest due report, and a note counted in a skipped report still flashes', () => {
    const feed = new ChannelMeterFeed();
    feed.reportAt([0.4], [1], 1.0, 0.9);
    feed.reportAt([0.3], [1], 1.01, 0.9);
    expect(levels).toEqual([]);
    feed.reportAt([0.2], [1], 1.5, 1.02);
    expect(levels).toEqual([[0.3]]);
    expect(notes).toEqual([0]);
  });

  it('a held report is fed when it falls due, not when the next report arrives', () => {
    // UADE reports at 20 Hz: fed only on the next arrival, a level showed up to 50 ms after it was heard.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      const feed = new ChannelMeterFeed();
      feed.reportAt([0.4], [1], 1.033, 1.0);
      vi.advanceTimersByTime(30);
      expect(levels, 'the meters moved before the report was heard').toEqual([]);
      vi.advanceTimersByTime(4);
      expect(levels).toEqual([[0.4]]);
      expect(notes).toEqual([0]);
    } finally { vi.useRealTimers(); }
  });

  it('clearHeld drops held reports and their timer, so a stop does not show the old song', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      const feed = new ChannelMeterFeed();
      feed.reportAt([0.4], null, 1.0, 0.9);
      feed.clearHeld();
      vi.advanceTimersByTime(200);
      expect(levels).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it('clearHeld drops held reports, so a stop does not show the old song', () => {
    const feed = new ChannelMeterFeed();
    feed.reportAt([0.4], null, 1.0, 0.9);
    feed.clearHeld();
    feed.reportAt([0], null, 2.0, 1.5);
    expect(levels).toEqual([]);
  });
});
