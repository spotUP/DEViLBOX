/**
 * Measuring a dub knob must not measure the song.
 *
 * Every "this control is dead" call on 2026-10-02 was an instrument fault.
 * Return-RMS was sampled from a playing song whose level drifts, and the two
 * values of an A/B were read seconds apart, so the whole drift landed on the
 * difference: every parameter tested read LOWER when raised. That made
 * springWet look dead at 1.1% "no change" — and it was fine. Two knobs were
 * measured that way and both were innocent.
 *
 * `measureDubKnob` removes the variable that caused all of it:
 *
 * 1. Refuses while the transport plays — a song in the measurement is the
 *    exact bug. Same guard as `measure_dub_bus_stages`.
 * 2. Feeds FIXED seeded pink noise into the bus input for both arms, so the
 *    only thing differing between the two readings is the parameter.
 * 3. Interleaves ABAB rather than all-A-then-all-B, so ramp settling and any
 *    residual LFO are shared by both arms instead of loading onto one.
 * 4. Reports the live value the graph reached alongside the requested one, so
 *    "moves the store but not the node" is distinguishable from "does nothing".
 * 5. Sums both channels; a mono analyser reads a decorrelated stereo reverb
 *    up to 3 dB low.
 *
 * It deliberately does NOT claim a sub-0.5 dB difference is "dead": that is
 * the rig's own noise floor, and saying otherwise is what turned a working
 * knob into a bug report in the first place.
 *
 * Contract-level asserts; the numerical behaviour is proven by running
 * `measure_dub_knob` against the live app.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '..', '..', '..', 'bridge', 'handlers', 'writeHandlers.ts'),
  'utf8',
);
const BRIDGE = readFileSync(resolve(__dirname, '..', '..', '..', 'bridge', 'MCPBridge.ts'), 'utf8');

function knobBody(): string {
  const start = SRC.indexOf('export async function measureDubKnob');
  expect(start, 'measureDubKnob not found').toBeGreaterThan(-1);
  const end = SRC.indexOf('\nexport ', start + 10);
  return SRC.slice(start, end === -1 ? undefined : end);
}

describe('measure_dub_knob measures the parameter, not the song', () => {
  it('refuses while the transport is playing', () => {
    expect(knobBody()).toContain('if (useTransportStore.getState().isPlaying)');
  });

  it('drives fixed seeded pink noise into the bus input', () => {
    const body = knobBody();
    // The shared seeded generator — the reading must be repeatable run to run.
    expect(body).toContain('src.buffer = seededPinkNoise(ctx, 1)');
    expect(body).toContain('src.connect(gate);');
    expect(body).toContain('gate.connect(input);');
  });

  it('interleaves A and B so drift cannot load onto either arm', () => {
    const body = knobBody();
    // A, B, B, A per round.
    expect(body).toMatch(/aSamples\.push\(await arm\(valueA\)\);[\s\S]*bSamples\.push\(await arm\(valueB\)\);[\s\S]*bSamples\.push\(await arm\(valueB\)\);[\s\S]*aSamples\.push\(await arm\(valueA\)\);/);
  });

  it('reports the live node value next to the requested one', () => {
    // This is the line that separates "moves the store only" from "dead".
    expect(knobBody()).toContain('liveState: live');
    expect(knobBody()).toContain('getLiveState?.()');
  });

  it('sums both channels', () => {
    const body = knobBody();
    expect(body).toContain('[0, 1].map((ch)');
    expect(body).toContain('for (const an of analysers)');
  });

  it('does not call a sub-noise-floor difference "dead"', () => {
    const body = knobBody();
    expect(body).toContain('measurable: Math.abs(deltaDb) >= 0.5');
    expect(body).toMatch(/noise floor of the rig/);
  });

  it('never writes the probe values to the persisted store', () => {
    // Every arm used to go through setDubBus, which saves to localStorage: a
    // reload mid-run kept the probe value, and `enabled: true` seeded a send.
    const body = knobBody();
    expect(body).not.toContain('setDubBus(');
    expect(body).toContain('probe = applyEphemeralDubSettings(');
    expect(body).toContain('probe!.write({ [knob]: value });');
    expect(body).toContain('probe?.restore();');
  });

  it('reads the decay after the noise stops in tail mode', () => {
    const body = knobBody();
    expect(body).toContain("return probeKind === 'tail' ? tailArm() : steadyArm();");
    expect(body).toMatch(/g\.setValueAtTime\(0, t0 \+ exciteMs \/ 1000\);[\s\S]*await wait\(exciteMs \+ 100\);[\s\S]*e \+= energy\(\)/);
  });

  it('is registered on the bridge', () => {
    expect(BRIDGE).toContain('measure_dub_knob: measureDubKnob');
  });
});