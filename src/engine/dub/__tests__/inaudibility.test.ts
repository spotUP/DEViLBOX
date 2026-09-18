/**
 * Why the performer cannot be HEARD, as distinct from why it chose to rest.
 *
 * Chasing "King Tubby is mostly idle" on 2026-09-18: AutoDub was running,
 * hearing the tune at RMS 0.07, deciding once per phrase — and the bus was
 * receiving nothing. `registeredChannelTaps: 0`, `inputRms: 0`,
 * `returnRms: 0`, every decision REST. Nothing in the product said so.
 *
 * "I am resting because the phrase wants space" and "nothing I play can reach
 * the speakers" are different answers, and conflating them is how an hour goes
 * into the wrong one. The Performance Monitor exists to answer exactly this,
 * so it now reports the signal-path reasons alongside the musical ones.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const autoDub = readFileSync(join(__dirname, '..', 'AutoDub.ts'), 'utf8');
const monitor = readFileSync(
  join(__dirname, '..', '..', '..', 'components', 'dub', 'PerformanceMonitor.tsx'), 'utf8',
);

describe('the snapshot explains an inaudible performer', () => {
  it('has a reason list separate from the musical why', () => {
    expect(autoDub).toContain('function inaudibilityReasons()');
  });

  it('reports a missing bus', () => {
    expect(autoDub).toContain('no dub bus — nothing to perform through');
  });

  it('reports a bus that is switched off', () => {
    expect(autoDub).toContain('the dub bus is OFF — moves would be inaudible');
  });

  it('reports the case actually measured: bus on, nothing sending to it', () => {
    expect(autoDub).toContain('no channel is sending to the dub bus — raise a channel send');
  });

  it('counts the whole-mix fallback before declaring silence', () => {
    // A tap count of zero is not silence if the whole-mix path is carrying
    // the song, which is how single-output engines feed the bus.
    expect(autoDub).toContain('wholeMixTapGainMax');
    expect(autoDub).toMatch(/taps === 0 && wholeMixGain <= 0/);
  });

  it('stops at the first blocking reason rather than listing consequences', () => {
    // With no bus at all there is no point also saying no channel is sending
    // to it — one cause, one line.
    expect(autoDub).toMatch(/no dub bus[\s\S]{0,120}return reasons;/);
    expect(autoDub).toMatch(/the dub bus is OFF[\s\S]{0,120}return reasons;/);
  });

  it('never breaks the snapshot when diagnostics are unavailable', () => {
    expect(autoDub).toMatch(/catch \{ \/\* diagnostics must never break the snapshot \*\/ \}/);
  });

  it('feeds the same why the monitor renders', () => {
    expect(autoDub).toContain('for (const reason of inaudibilityReasons()) why.push(reason);');
    expect(monitor).toContain('snapshot.why');
  });
});
