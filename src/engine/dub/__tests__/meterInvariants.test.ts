/**
 * The three runtime meter predicates, fed the numbers the real faults produced.
 *
 * Each "starved" / "drifted" case below is a reading taken from the running app
 * on 2026-09-22, and each "healthy" case is a reading taken on 2026-09-23 with
 * the same song, the bus armed and channel 0 sending 0.6. The point of the pair
 * is that the predicate has to separate them: a check that passes on both is
 * what the suite already had.
 *
 * This file cannot prove the bus is wired — happy-dom has no audio graph. That
 * is `tools/dub-invariant-sweep.ts --phase M`, which runs these same predicates
 * against a live `get_dub_bus_state` in real Chrome. This file proves the
 * predicates themselves discriminate.
 */
import { describe, it, expect } from 'vitest';
import {
  checkTailDecays,
  checkBusInputWet,
  checkMasterGainAgrees,
  checkCaptureNotAborted,
  type DubMeterState,
} from '../meterInvariants';

/** amanda.ahx, bus armed, channel 0 sending 0.6, 2026-09-23. */
const HEALTHY: DubMeterState = {
  channelDubSends: [{ dubSend: 0.6 }, { dubSend: 0 }, { dubSend: 0 }, { dubSend: 0 }],
  masterInsertLevels: { busInput: 0.005668, busReturn: 0.114946, insertIn: 0.021769 },
  upstreamLevels: { engineOut: 0.018172, masterEffectsInput: 0.017861 },
  insertProbe: { masterChannelVolumeDb: 0, masterVolumeDbTarget: 0, masterChannelMute: false },
};

describe('checkBusInputWet', () => {
  it('passes when the bus input carries the song', () => {
    expect(checkBusInputWet(HEALTHY).ok).toBe(true);
  });

  it('fails on the starved bus that made every dub move inaudible', () => {
    // The 2026-09-22 reading: a send wide open, the song playing, the master
    // sounding normal, and 0.000001 arriving at the bus.
    const starved: DubMeterState = {
      ...HEALTHY,
      masterInsertLevels: { ...HEALTHY.masterInsertLevels, busInput: 0.000001 },
    };
    const r = checkBusInputWet(starved);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/starved/);
  });

  it('fails when the bus input collapses relative to the stage feeding it', () => {
    // Above the absolute floor, so only the ratio can see this one: the song is
    // at its normal level and a hundredth of it reaches the bus.
    const leaking: DubMeterState = {
      ...HEALTHY,
      masterInsertLevels: { ...HEALTHY.masterInsertLevels, busInput: 0.00012 },
    };
    const r = checkBusInputWet(leaking);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/of the stage feeding it/);
  });

  it('does not fail a quiet passage, where song and bus fall together', () => {
    const quiet: DubMeterState = {
      ...HEALTHY,
      masterInsertLevels: { ...HEALTHY.masterInsertLevels, busInput: 0.00057 },
      upstreamLevels: { engineOut: 0.0018, masterEffectsInput: 0.0017 },
    };
    expect(checkBusInputWet(quiet).ok).toBe(true);
  });

  it('expects nothing at the bus when no send is open', () => {
    const closed: DubMeterState = {
      ...HEALTHY,
      channelDubSends: [{ dubSend: 0 }, { dubSend: 0 }],
      masterInsertLevels: { ...HEALTHY.masterInsertLevels, busInput: 0 },
    };
    expect(checkBusInputWet(closed).ok).toBe(true);
  });

  it('fails when the tap itself is missing rather than reporting a false zero', () => {
    const noTap: DubMeterState = { ...HEALTHY, masterInsertLevels: {} };
    expect(checkBusInputWet(noTap).ok).toBe(false);
    expect(checkBusInputWet({ ...HEALTHY, masterInsertLevels: { busInput: -1 } }).ok).toBe(false);
  });
});

describe('checkMasterGainAgrees', () => {
  it('passes when the engine sits where the store put it', () => {
    expect(checkMasterGainAgrees(HEALTHY, { masterVolume: 0, masterMuted: false }).ok).toBe(true);
  });

  it('fails on the -29.76 dB master the store never knew about', () => {
    // The whole fault: the store read 0 dB all evening, no hardware was
    // attached, and the engine was 29.76 dB down.
    const drifted: DubMeterState = {
      ...HEALTHY,
      insertProbe: { masterChannelVolumeDb: -29.76, masterVolumeDbTarget: -29.76, masterChannelMute: false },
    };
    const r = checkMasterGainAgrees(drifted, { masterVolume: 0, masterMuted: false });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/-29\.76 dB vs store 0\.00 dB/);
  });

  it('fails when only the engine target has drifted', () => {
    const drifted: DubMeterState = {
      ...HEALTHY,
      insertProbe: { masterChannelVolumeDb: 0, masterVolumeDbTarget: -12, masterChannelMute: false },
    };
    expect(checkMasterGainAgrees(drifted, { masterVolume: 0, masterMuted: false }).ok).toBe(false);
  });

  it('fails when the engine is muted and the store is not', () => {
    const muted: DubMeterState = {
      ...HEALTHY,
      insertProbe: { masterChannelVolumeDb: 0, masterVolumeDbTarget: 0, masterChannelMute: true },
    };
    expect(checkMasterGainAgrees(muted, { masterVolume: 0, masterMuted: false }).ok).toBe(false);
  });

  it('tolerates rounding along the store to engine path', () => {
    const rounded: DubMeterState = {
      ...HEALTHY,
      insertProbe: { masterChannelVolumeDb: -6.2, masterVolumeDbTarget: -6, masterChannelMute: false },
    };
    expect(checkMasterGainAgrees(rounded, { masterVolume: -6, masterMuted: false }).ok).toBe(true);
  });

  it('says so rather than passing silently when there is no bus to read', () => {
    const r = checkMasterGainAgrees({ insertProbe: null }, { masterVolume: 0 });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/no bus yet/);
  });
});

describe('checkCaptureNotAborted', () => {
  it('passes on a clean console', () => {
    expect(checkCaptureNotAborted([]).ok).toBe(true);
    expect(checkCaptureNotAborted([{ level: 'warn', message: '[DubBus] plate stage engaged' }]).ok).toBe(true);
  });

  it('fails on the abort DubBus raises when the ring holds no signal', () => {
    const r = checkCaptureNotAborted([{
      level: 'warn',
      message: '[DubBus] backwardReverb abort — captured SILENCE (frames=131072, peak=7.51e-6); nothing is reaching bus.input',
    }]);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/captured SILENCE/);
  });

  it('fails on the reverseEcho empty-ring abort as well', () => {
    expect(checkCaptureNotAborted([{
      level: 'warn',
      message: '[DubBus] reverseEcho abort — ring still empty after retries; bus input likely silent',
    }]).ok).toBe(false);
    expect(checkCaptureNotAborted([{
      level: 'warn',
      message: '[DubBus] backwardReverb abort — empty ring buffer (no audio reached bus.input yet)',
    }]).ok).toBe(false);
  });
});

/**
 * The HOLD check, judged with the sends closed. The recorded 2026-09-23 pairs
 * were read with a send OPEN and are therefore not tail measurements at all;
 * they are here as the shape of a failure, which the sweep can now only
 * produce when something really is still driving the loop.
 */
describe('checkTailDecays', () => {
  it('passes a falling tail', () => {
    expect(checkTailDecays(0.29, 0.02, 'filterDrop').ok).toBe(true);
  });

  it('passes a return already under the floor', () => {
    expect(checkTailDecays(0.0004, 0.0003, 'delayPreset380').ok).toBe(true);
    expect(checkTailDecays(0.5, 0.0009, 'x').detail).toBe('bus return quiet');
  });

  it('fails a return that holds or climbs — the shape the open-send reads had', () => {
    expect(checkTailDecays(0.110, 0.181, 'filterDrop').ok).toBe(false);
    expect(checkTailDecays(0.073, 0.187, 'sonarPing').ok).toBe(false);
    expect(checkTailDecays(0.2, 0.19, 'x').ok).toBe(false);
  });

  it('fails an unreadable meter rather than passing it as quiet', () => {
    expect(checkTailDecays(NaN, 0, 'x').ok).toBe(false);
  });
});
