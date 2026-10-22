/**
 * Every play distorted for its first 1-3 rows (owner, 2026-10-22). A play rebuilt the channel isolation
 * slots twice: once on the worklet's playReady and again from the 400 ms backstop timer, which ran even
 * when playReady had already come. A rebuild tears down every slot, disposes its effects, makes new ones
 * cold, and the new slot module joins the main module at the start of its row. So the channels with
 * effects restarted their row with cold effects about 350 ms into the play.
 * Real LibopenmptEngine.play() and handleMessage; the worklet port and the mixer store are stubs.
 * play() now loads the module paused and builds the slots once, on playReady, before it unpauses
 * (playStartKeepsChannelEffectsIsolated.test.ts is the wiring test).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const scheduleWasmEffectRebuild = vi.fn();
vi.mock('@stores/useMixerStore', () => ({ scheduleWasmEffectRebuild }));
vi.mock('../../stores/useMixerStore', () => ({ scheduleWasmEffectRebuild }));
const settleChannelIsolationBeforeRender = vi.fn(async () => undefined);
vi.mock('../../tone/ChannelRoutedEffects', () => ({ getChannelRoutedEffectsManager: () => null, settleChannelIsolationBeforeRender }));

type EngineInternals = {
  _available: boolean;
  _pendingData: ArrayBuffer | null;
  workletNode: { port: { postMessage: (m: unknown) => void } };
  handleMessage: (msg: { data: { cmd: string } }) => void;
  play: () => void;
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await vi.dynamicImportSettled();
};

describe('a play builds the channel isolation slots once', () => {
  let engine: EngineInternals;

  beforeEach(async () => {
    vi.useFakeTimers();
    scheduleWasmEffectRebuild.mockClear();
    settleChannelIsolationBeforeRender.mockClear();
    const { LibopenmptEngine } = await import('../LibopenmptEngine');
    engine = Object.create(LibopenmptEngine.prototype) as EngineInternals;
    Object.assign(engine, {
      _available: true,
      _pendingData: new ArrayBuffer(16),
      _isolationSlotMasks: [null, null, null, null],
      _isolationBackstop: null,
      _playToken: 0,
      _pendingLoad: null,
      _playing: false,
      gainNode: null,
      workletNode: { port: { postMessage: () => undefined } },
    });
  });

  afterEach(() => { vi.useRealTimers(); });

  it('playReady builds once before rendering, and the backstop does not build again', async () => {
    engine.play();
    engine.handleMessage({ data: { cmd: 'playReady' } });
    await flush();
    expect(settleChannelIsolationBeforeRender, 'playReady drives the build').toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1500);
    await flush();
    expect(settleChannelIsolationBeforeRender, 'the backstop built the slots a second time').toHaveBeenCalledTimes(1);
    expect(scheduleWasmEffectRebuild, 'the backstop rebuilt the slots a second time').toHaveBeenCalledTimes(0);
  });

  it('a worklet that never sends playReady is still played and rebuilt by the backstop', async () => {
    engine.play();
    vi.advanceTimersByTime(1500);
    await flush();
    expect(scheduleWasmEffectRebuild).toHaveBeenCalledTimes(1);
  });

  // The first notes of every Play stuttered (2026-10-23): an 'enableOsc' posted 150 ms into the
  // play made the worklet parse the module once per channel on the audio thread while the song
  // was audible. The worklet now builds the scopes inside the paused 'load'
  // (firstNotesOfPlayDoNotStall.test.ts).
  it('the first notes of a Play: no scope build is asked for while the song plays', async () => {
    const sent: string[] = [];
    engine.workletNode.port.postMessage = (m) => { sent.push((m as { cmd: string }).cmd); };
    engine.play();
    engine.handleMessage({ data: { cmd: 'playReady' } });
    await flush();
    vi.advanceTimersByTime(1500);
    await flush();
    expect(sent).toContain('unpause');
    expect(sent).not.toContain('enableOsc');
  });

  it('a worklet without the paused load is still asked for its scopes by the backstop', async () => {
    const sent: string[] = [];
    engine.workletNode.port.postMessage = (m) => { sent.push((m as { cmd: string }).cmd); };
    engine.play();
    vi.advanceTimersByTime(1500);
    await flush();
    expect(sent).toEqual(expect.arrayContaining(['play', 'enableOsc']));
  });
});
