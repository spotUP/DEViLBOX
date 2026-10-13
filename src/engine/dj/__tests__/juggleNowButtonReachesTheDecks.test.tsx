/**
 * JUGGLE-NOW (owner decision 2026-10-12): the Auto DJ debug panel's "Juggle
 * Now" button asks the juggle controller for a juggle at once, through the
 * poll loop's own entry (DJAutoDJ.juggleTick: the stand-alone setup, then
 * the controller's tick), with the timing gates skipped and the safety gates
 * kept; a refusal shows its reason on screen.
 *
 * Reachability: button -> juggleNowAutoDJ -> DJAutoDJ.juggleNow -> the
 * stand-alone setup and the controller -> deck actions. Sentinels: the
 * `loadDoubleToDeck` call count and the controller's `counts.started`. The set
 * phase is OPENING (owner plan section 28: normal mixing - a timing gate),
 * so the poll loop alone never juggles here. Fake timers, fake decks, no audio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0,
  doubles: 0,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJQuantizedFX', () => {
  const record = () => () => () => {};
  return {
    beatMatchedTransition: record(), cutTransition: record(), filterBuildTransition: record(), bassSwapTransition: record(), echoOutTransition: record(),
    skipTransition: record(), getQuantizeMode: () => 'off', setQuantizeMode: () => {},
    filterSweep: () => () => {}, filterReset: () => () => {}, echoOut: () => () => {}, instantEQKill: () => {}, quantizedEQKill: () => () => {}, cancelAllAutomation: () => {},
  };
});
vi.mock('../DJTrackLoader', async (orig) => {
  const actual = await orig<typeof import('../DJTrackLoader')>();
  return {
    ...actual, preRenderTrack: async () => null, loadPlaylistTrackToDeck: async () => false,
    loadDoubleToDeck: async (...args: Parameters<typeof actual.loadDoubleToDeck>) => { holder.doubles++; return actual.loadDoubleToDeck(...args); },
  };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { useDJStore } from '@/stores/useDJStore';
import { DJAutoDJDebugPanel } from '@/components/dj/DJAutoDJDebugPanel';
import { DJSessionController } from '../autodj/sessionController';
import { setupStandalone, teardownStandalone, runStandalone, type StandaloneRig } from './standaloneJuggleHarness';

let rig: StandaloneRig;

describe('Juggle Now: the debug panel button juggles at once, safety gates kept', () => {
  beforeEach(async () => {
    // A pinned wall clock: DJAutoDJ seeds the juggle with Date.now() (& 0xffff), and the seed's intensity
    // wobble (+-0.05) decides whether a double (intensity 0.75) fits this mid-energy opening's budget
    // (intensity + 0.3). Unpinned, about one run in three drew a low wobble and the double was refused.
    rig = await setupStandalone(holder, { track: 'drops', bpm: 130, startSec: 20, clockMs: Date.UTC(2026, 9, 13, 12) });
    vi.spyOn(DJSessionController.prototype, 'setPhase', 'get').mockReturnValue('OPENING');
  });
  afterEach(() => { cleanup(); teardownStandalone(); });

  it('in the OPENING (no juggle from the poll loop) the button loads a double and a pattern starts', async () => {
    const j = rig.dj.getJuggle();
    rig.dj.startPolling();
    await act(async () => { await runStandalone(rig, 4_000); });
    expect(holder.doubles).toBe(0);
    expect(useDJStore.getState().autoDJJuggleTelemetry?.safety ?? '').toMatch(/OPENING/);

    const view = render(<DJAutoDJDebugPanel telemetry={null} />);
    await act(async () => {
      fireEvent.click(view.getByTestId('autodj-juggle-now'));
      await runStandalone(rig, 40_000, () => j.counts.started >= 1);
    });
    const tel = useDJStore.getState().autoDJJuggleTelemetry;
    const why = `juggleNow: ${JSON.stringify(tel?.juggleNow)}; safety: ${tel?.safety}`;
    expect(holder.doubles, why).toBe(1);
    expect(j.counts.started, why).toBe(1);
    expect(tel?.juggleNow?.state, why).toBe('started');
    expect(view.getByTestId('autodj-juggle-now-result').textContent).toMatch(/^Started: /);
  }, 120_000);

  it('a safety gate refuses it and the reason is on screen: the user started the idle deck by hand', async () => {
    rig.dj.startPolling();
    await act(async () => { await runStandalone(rig, 2_000); });
    useDJStore.getState().setDeckState('B', { fileName: 'users-own.wav', trackName: 'users own' });
    await rig.decks.B.play();
    const view = render(<DJAutoDJDebugPanel telemetry={null} />);
    await act(async () => {
      fireEvent.click(view.getByTestId('autodj-juggle-now'));
      await runStandalone(rig, 1_000);
    });
    expect(holder.doubles).toBe(0);
    expect(rig.dj.getJuggle().counts.started).toBe(0);
    expect(useDJStore.getState().autoDJJuggleTelemetry?.juggleNow).toEqual({ state: 'refused', reason: 'user control: the idle deck was started by hand' });
    expect(view.getByTestId('autodj-juggle-now-result').textContent).toBe('Refused: user control: the idle deck was started by hand');
  }, 60_000);
});
