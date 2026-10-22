/**
 * Regression (STOP-ALLNOTESOFF-TWICE): Stop sent a mono native synth two
 * all-notes-off messages: ToneEngine.releaseAll released the registered
 * instrument, then stopped that same instrument's voice (a mono voice IS the
 * instrument) through ChannelRouting.stopVoice, which released it again. The
 * DX7 queues one key-off per key per message, so the duplicate delayed the next
 * note. releaseAll owns the release; the voice loop only tears down nodes.
 */
import { describe, it, expect, vi } from 'vitest';

const holder = vi.hoisted(() => ({ engine: undefined as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => 0, getTransport: () => ({ stop() {}, cancel() {}, bpm: { value: 120 }, loop: false }) };
});

vi.mock('../ToneEngine', async (orig) => {
  const actual = await orig<typeof import('../ToneEngine')>();
  return { ...actual, getToneEngine: () => holder.engine };
});

import { ToneEngine } from '../ToneEngine';
import { PatternScheduler } from '../PatternScheduler';

const nodes = () => ({ gain: { dispose: vi.fn() }, filter: { dispose: vi.fn() }, panner: { dispose: vi.fn() } });

describe('Stop (PatternScheduler.stop -> ToneEngine.releaseAll)', () => {
  it('sends each synth exactly one all-notes-off, and still tears down its voice nodes', () => {
    vi.useFakeTimers();
    const allNotesOff = vi.fn();
    // A native DevilboxSynth: no releaseAll, triggerRelease(undefined) is all-notes-off.
    const synth = {
      output: { connect() {}, disconnect() {}, numberOfOutputs: 1, gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} } },
      name: 'DX7',
      dispose() {},
      triggerRelease: (note?: unknown) => { if (note === undefined) allNotesOff(); },
    };
    const voiceNodes = nodes();
    const engine = Object.create(ToneEngine.prototype) as ToneEngine;
    const internals = engine as unknown as Record<string, unknown>;
    internals['instruments'] = new Map<number, unknown>([[(1 << 16) | 0, synth]]);
    internals['activeVoices'] = new Map([[0, [{ instrument: synth, nodes: voiceNodes }]]]);
    internals['releaseRestoreTimeouts'] = new Map();
    internals['releaseRestoreVolumeDb'] = new Map();
    for (const m of ['channelActivePlayer', 'channelPitchState', 'slicePlayersMap', 'nativeEngineRouting']) {
      internals[m] = new Map();
    }
    holder.engine = engine;

    const scheduler = Object.create(PatternScheduler.prototype) as PatternScheduler;
    Object.assign(scheduler, {
      applyPitchState() {},
      playbackErrors: new Map(),
      effectProcessor: { clearAll() {} },
      channelNotes: new Map(),
      channelActiveInstruments: new Map(),
    });
    scheduler.stop();
    vi.advanceTimersByTime(200);

    expect(allNotesOff).toHaveBeenCalledTimes(1);
    expect(voiceNodes.gain.dispose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
