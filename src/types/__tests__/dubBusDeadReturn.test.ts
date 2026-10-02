/**
 * A dub bus saved with its return closed is wreckage, not a voicing.
 *
 * The failure this guards (2026-10-01): the persisted store held
 * `returnGain: 0`, `echoWet: 0`, `echoIntensity: 0`, `echoRateMs: 40` — the
 * exact values of the CC47-53 wet bank at minimum — so the bus reloaded with
 * its only route to the speakers shut. Measured live: `return_` at -137 dB
 * while every stage upstream of it carried signal, and every move lit its
 * button and moved no air.
 *
 * The rule has to stay narrow in both directions. Too wide and it overwrites
 * a mix somebody chose; too narrow and the next machine write of a control
 * bank ends the session silent again.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DUB_BUS,
  DUB_RETURN_GAIN_MAX,
  isDubBusAudible,
  repairStoredDubBusVoicing,
  type DubBusSettings,
} from '../dub';

/** What the wreckage looked like on disk, plus a few fields nobody broke. */
const DEAD_ON_DISK: DubBusSettings = {
  ...DEFAULT_DUB_BUS,
  returnGain: 0,
  echoWet: 0,
  echoIntensity: 0,
  echoRateMs: 40,
  springWet: 1,
  hpfCutoff: 20,
  sidechainAmount: 0,
  stereoWidth: 0,
  masterBassDb: -12,
  midScoopGainDb: -12,
};

describe('isDubBusAudible', () => {
  it('rejects a closed return — the bus cannot make a sound', () => {
    expect(isDubBusAudible({ returnGain: 0 })).toBe(false);
  });

  it('rejects a missing or corrupt return as well as a zero one', () => {
    expect(isDubBusAudible({})).toBe(false);
    expect(isDubBusAudible({ returnGain: NaN })).toBe(false);
  });

  it('accepts an open return however quiet the performer wants it', () => {
    expect(isDubBusAudible({ returnGain: 0.01 })).toBe(true);
    expect(isDubBusAudible({ returnGain: DEFAULT_DUB_BUS.returnGain })).toBe(true);
  });
});

describe('repairStoredDubBusVoicing', () => {
  it('rebuilds the tail of a bus saved with its return closed', () => {
    const repaired = repairStoredDubBusVoicing(DEAD_ON_DISK);
    expect(repaired.returnGain).toBe(DEFAULT_DUB_BUS.returnGain);
    expect(repaired.echoWet).toBe(DEFAULT_DUB_BUS.echoWet);
    expect(repaired.echoIntensity).toBe(DEFAULT_DUB_BUS.echoIntensity);
    expect(repaired.echoRateMs).toBe(DEFAULT_DUB_BUS.echoRateMs);
  });

  it('leaves everything that was not part of the dead tail alone', () => {
    const repaired = repairStoredDubBusVoicing(DEAD_ON_DISK);
    // A dry echo at a 40 ms rate is only wreckage BECAUSE the return was shut.
    // Once the return is open again these are the performer's own settings.
    expect(repaired.springWet).toBe(1);
    expect(repaired.hpfCutoff).toBe(20);
    expect(repaired.sidechainAmount).toBe(0);
    expect(repaired.stereoWidth).toBe(0);
    expect(repaired.masterBassDb).toBe(-12);
    expect(repaired.midScoopGainDb).toBe(-12);
  });

  it('does not touch a bus whose return is open, however quiet', () => {
    const quiet: DubBusSettings = {
      ...DEFAULT_DUB_BUS,
      returnGain: 0.02,
      echoWet: 0,
      echoIntensity: 0,
      echoRateMs: 40,
    };
    expect(repairStoredDubBusVoicing(quiet)).toEqual(quiet);
  });

  it('does not touch a bus saved with a dry echo and an open return', () => {
    const dryEcho: DubBusSettings = { ...DEFAULT_DUB_BUS, echoWet: 0, echoIntensity: 0 };
    expect(repairStoredDubBusVoicing(dryEcho)).toEqual(dryEcho);
  });

  it('is idempotent — repairing a repair changes nothing', () => {
    const once = repairStoredDubBusVoicing(DEAD_ON_DISK);
    expect(repairStoredDubBusVoicing(once)).toEqual(once);
  });

  it('does not mutate its argument', () => {
    const input = { ...DEAD_ON_DISK };
    repairStoredDubBusVoicing(input);
    expect(input).toEqual(DEAD_ON_DISK);
  });

  it('pulls a return stored above the knob range back to the top of the knob', () => {
    // The 2026-10-02 branch stored returnGain 3.0 to carry the wet make-up;
    // on top of WET_CHAIN_MAKEUP that would sit +11 dB hot until touched.
    const hot = { ...DEFAULT_DUB_BUS, returnGain: 3.0, echoWet: 0.4 };
    const out = repairStoredDubBusVoicing(hot);
    expect(out.returnGain).toBe(DUB_RETURN_GAIN_MAX);
    expect(out.echoWet).toBe(0.4);
  });

  it('keeps a return at the top of the knob exactly as stored', () => {
    const full = { ...DEFAULT_DUB_BUS, returnGain: DUB_RETURN_GAIN_MAX };
    expect(repairStoredDubBusVoicing(full)).toBe(full);
  });
});
