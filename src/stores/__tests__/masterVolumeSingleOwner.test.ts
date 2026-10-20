/**
 * Master volume has ONE owner: useAudioStore.masterVolume (dB).
 *
 * The owner found the app "silent" with the master at -36 dB (2026-10-20).
 * Part of why nobody could tell what set it: the mixer store kept a second,
 * linear copy of the master volume, and several writers drove the engine from
 * that copy or straight at the engine, behind the store the fader shows:
 *   - loading a song applied the saved mixer master (almost always the
 *     untouched default 1.0, so 0 dB) to the engine;
 *   - an automation curve on global.masterVolume wrote the engine directly;
 *   - the AutoDub scrub muted and restored through the mixer copy.
 * Each left the engine's master and the fader disagreeing. These tests pin
 * the two writers that are plain functions; the AutoDub scrub now uses the
 * master mute flag and never touches the volume.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 0; });
afterAll(() => { vi.restoreAllMocks(); });

const engine = {
  instruments: new Map(),
  setMasterVolume: vi.fn(),
  setMasterMute: vi.fn(),
  setMixerChannelVolume: vi.fn(),
  setMixerChannelPan: vi.fn(),
  setMixerChannelMute: vi.fn(),
  setChannelVolume: vi.fn(),
  setChannelPan: vi.fn(),
  setChannelMute: vi.fn(),
};
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => engine }));
vi.mock('../../engine/ToneEngine', () => ({ getToneEngine: () => engine }));
vi.mock('@/midi/performance/parameterRouter', () => ({
  routeParameterToEngine: vi.fn(),
  DUB_MOVE_KINDS: {},
}));
vi.mock('@/engine/ManualOverrideManager', () => ({
  getManualOverrideManager: () => ({ isOverridden: () => false }),
}));
vi.mock('@/engine/ChannelFilterManager', () => ({
  getChannelFilterManager: () => ({ setPosition: vi.fn(), setResonance: vi.fn() }),
}));

import { useAudioStore } from '../useAudioStore';
import { useMixerStore } from '../useMixerStore';
import { AutomationPlayer } from '@/engine/AutomationPlayer';
import type { AutomationCurve } from '@/types/automation';

beforeEach(() => {
  vi.clearAllMocks();
  useAudioStore.setState({ toneEngineInstance: engine as never, masterVolume: -12 });
});

describe('master volume has one owner', () => {
  it('loading a song keeps the master volume the user set', () => {
    // A save from before the fix carries the mixer's default master copy.
    useMixerStore.getState().loadMixerState({ channels: [], master: { volume: 1 } });

    expect(engine.setMasterVolume).not.toHaveBeenCalled();
    expect(useAudioStore.getState().masterVolume).toBe(-12);
  });

  it('an automation curve on global.masterVolume moves the store the fader shows', () => {
    const curve: AutomationCurve = {
      id: 'c', patternId: 'p0', channelIndex: 0, parameter: 'global.masterVolume',
      mode: 'curve', interpolation: 'linear', enabled: true,
      points: [{ row: 0, value: 0.1 }, { row: 16, value: 0.1 }],
    };
    const player = new AutomationPlayer();
    player.setAutomationData({ p0: { 0: { 'global.masterVolume': curve } } });
    player.setPattern({
      id: 'p0', name: 'Test', length: 16,
      channels: [{ id: 'ch0', name: 'Ch 1', rows: Array.from({ length: 16 }, () => ({
        note: 0, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })) }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    player.processPatternRow(0);

    // 0.1 on the -40..0 dB curve range is -36 dB, in the store AND the engine.
    expect(useAudioStore.getState().masterVolume).toBeCloseTo(-36, 6);
    expect(engine.setMasterVolume).toHaveBeenLastCalledWith(-36);
  });
});
