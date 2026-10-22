/**
 * Every play distorted for its first 1-3 rows (owner, 2026-10-22). A play rebuilt the channel isolation
 * slots twice: once on the worklet's playReady and again from the 400 ms backstop timer, which ran even
 * when playReady had already come. A rebuild tears down every slot, disposes its effects, makes new ones
 * cold, and the new slot module joins the main module at the start of its row. So the channels with
 * effects restarted their row with cold effects about 350 ms into the play.
 * Real LibopenmptEngine.play() and handleMessage; the worklet port and the mixer store are stubs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const scheduleWasmEffectRebuild = vi.fn();
vi.mock('@stores/useMixerStore', () => ({ scheduleWasmEffectRebuild }));
vi.mock('../../stores/useMixerStore', () => ({ scheduleWasmEffectRebuild }));
vi.mock('../../tone/ChannelRoutedEffects', () => ({ getChannelRoutedEffectsManager: () => null }));

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
    const { LibopenmptEngine } = await import('../LibopenmptEngine');
    engine = Object.create(LibopenmptEngine.prototype) as EngineInternals;
    Object.assign(engine, {
      _available: true,
      _pendingData: new ArrayBuffer(16),
      _isolationSlotMasks: [null, null, null, null],
      _isolationBackstop: null,
      gainNode: null,
      workletNode: { port: { postMessage: () => undefined } },
    });
  });

  afterEach(() => { vi.useRealTimers(); });

  it('playReady rebuilds, and the 400 ms backstop does not rebuild again', async () => {
    engine.play();
    engine.handleMessage({ data: { cmd: 'playReady' } });
    await flush();
    expect(scheduleWasmEffectRebuild, 'playReady drives the rebuild').toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(500);
    await flush();
    expect(scheduleWasmEffectRebuild, 'the backstop rebuilt the slots a second time').toHaveBeenCalledTimes(1);
  });

  it('a worklet that never sends playReady is still rebuilt by the backstop', async () => {
    engine.play();
    vi.advanceTimersByTime(500);
    await flush();
    expect(scheduleWasmEffectRebuild).toHaveBeenCalledTimes(1);
  });
});
