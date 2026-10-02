/**
 * The real DubBus, rendered offline (src/test/audio/dubBusRig.ts). These
 * assert on audio and on the graph's live parameters, not on source text.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadDubBus, makeDubBusRig, feedTone, rmsBetween, toDb, releaseDubBusRigClock } from '@/test/audio/dubBusRig';

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());

describe('DubBus, rendered', () => {
  it('passes a send to the master when enabled', async () => {
    // A spec-following renderer mutes a cycle with no DelayNode in it; the
    // siren feedback loop into `input` had none, so Firefox (and this rig)
    // heard a silent bus.
    const rig = await makeDubBusRig(1.5);
    feedTone(rig);
    const out = await rig.render([{ at: 0, run: () => rig.bus.setSettings({ enabled: true }) }]);
    expect(toDb(rmsBetween(out, 0.5))).toBeGreaterThan(-40);
  }, 60_000);

  it('is silent at the master while disabled', async () => {
    const rig = await makeDubBusRig(1.5);
    feedTone(rig);
    const out = await rig.render();
    expect(toDb(rmsBetween(out, 0.5))).toBeLessThan(-90);
  }, 60_000);

  it('comes back on its own after a panic while the store still says enabled', async () => {
    // dubPanic mutes the engine without touching desired state; the drain
    // timer must re-converge it. The no-op guard used to compare against the
    // desired mirror and dropped that write, leaving the bus dead behind a
    // panel that read ON.
    const rig = await makeDubBusRig(4.5);
    feedTone(rig);
    const out = await rig.render([
      { at: 0, run: () => rig.bus.setSettings({ enabled: true }) },
      { at: 1.0, run: () => rig.bus.dubPanic() },
    ]);
    const before = toDb(rmsBetween(out, 0.5, 1.0));
    const during = toDb(rmsBetween(out, 1.3, 2.8));
    const after = toDb(rmsBetween(out, 3.7, 4.4));
    expect(before).toBeGreaterThan(-40);
    expect(during, 'the panic did not mute the bus').toBeLessThan(before - 30);
    expect(after, 'the bus stayed dead after the drain').toBeGreaterThan(before - 6);
  }, 60_000);

  it('reports desired against actual, including through a panic', async () => {
    const rig = await makeDubBusRig(1.5);
    feedTone(rig);
    let mid: ReturnType<typeof rig.bus.getLiveState> | null = null;
    await rig.render([
      { at: 0, run: () => rig.bus.setSettings({ enabled: true }) },
      { at: 0.5, run: () => { mid = rig.bus.getLiveState(); } },
      { at: 0.8, run: () => rig.bus.dubPanic() },
    ]);
    expect(Math.abs(mid!.returnGain.delta!)).toBeLessThan(0.01);
    expect(Math.abs(mid!.inputGain.delta!)).toBeLessThan(0.01);
    // The default echo (SpaceEcho) reports its running delay time.
    expect(mid!.echoRateMs.actual).not.toBeNull();
    const end = rig.bus.getLiveState();
    // Draining: the return's target is shut, so a shut return is not a delta
    // (it used to report the stored returnGain as desired: a -0.85 "fault").
    expect(end.returnGain.desired).toBe(0);
    expect(Math.abs(end.returnGain.delta!)).toBeLessThan(0.01);
    expect(end.enabled.desired).toBe(1);
    expect(end.enabled.actual).toBe(0);
  }, 60_000);

  it('Liquid in phaser mode drives a phaser that carries audio, and survives a mirror push', async () => {
    const rig = await makeDubBusRig(2);
    feedTone(rig);
    let stop: (() => void) | null = null;
    let held = { gain: 0, rate: 0, phaserOut: 0 };
    const phaser = rig.node<{ rate: number }>('phaser');
    await rig.render([
      { at: 0, run: () => rig.bus.setSettings({ enabled: true, sweepMode: 'phaser', phaserRate: 0.3 }) },
      { at: 0.3, run: () => { stop = rig.bus.startCombSweep(1, 0.08, 0.8, 8); } },
      // The store->engine mirror re-pushing its resting sweepAmount mid-hold.
      { at: 0.7, run: () => rig.bus.setSettings({ sweepAmount: 0, echoWet: 0.51 }) },
      { at: 1.2, run: () => {
        held = {
          gain: rig.node<GainNode>('sweepOutput').gain.value,
          rate: phaser.rate,
          phaserOut: Number(rig.bus.getDiagnosticSnapshot().sweepPhaserOutRms),
        };
        stop!();
      } },
    ]);
    expect(held.gain, 'a settings write muted the held sweep').toBeGreaterThan(0.5);
    expect(held.rate, 'the phaser stayed at its resting rate').toBeCloseTo(0.8, 2);
    // Carries audio here; the browser-only Tone.connect failure this branch
    // once had cannot be reproduced on node-web-audio-api.
    expect(held.phaserOut, 'the phaser branch passes no audio').toBeGreaterThan(0.001);
    expect(phaser.rate, 'release did not hand the rate back').toBeCloseTo(0.3, 2);
  }, 60_000);

  it('the plate mix is audible on the default stage', async () => {
    const levels: number[] = [];
    for (const plateStageMix of [0, 0.8]) {
      const rig = await makeDubBusRig(1.5);
      feedTone(rig);
      const out = await rig.render([{ at: 0, run: () => rig.bus.setSettings({ enabled: true, plateStageMix }) }]);
      levels.push(toDb(rmsBetween(out, 0.5)));
    }
    expect(Math.abs(levels[1] - levels[0])).toBeGreaterThan(0.5);
  }, 60_000);

  it('a Sub Bass Bed re-fired inside the release window keeps its own tap', async () => {
    const rig = await makeDubBusRig(2);
    feedTone(rig, 60, 0.4);
    let stopFirst: (() => void) | null = null;
    let stopSecond: (() => void) | null = null;
    await rig.render([
      { at: 0, run: () => rig.bus.setSettings({ enabled: true }) },
      { at: 0.2, run: () => { stopFirst = rig.bus.startSubBassBed(1); } },
      { at: 0.6, run: () => stopFirst!() },
      { at: 0.65, run: () => { stopSecond = rig.bus.startSubBassBed(1); } },
    ]);
    // The first release's cleanup ran at ~1.2 s, after the re-fire.
    expect(rig.bus.getSubBedLevel(), 'the re-fired bed lost its tap to the old release').toBeGreaterThan(0);
    stopSecond!();
  }, 60_000);

  it('a held return processor lifts the wet so the toggle can be heard', async () => {
    // At Auto Dub's resting sends the return sat 30-40 dB under the music, so
    // Wide/Wobble/Liquid/Sweep/Ring/Starve/Ping-Pong changed a signal nobody
    // could hear: "no change at all when pressed" (2026-10-02). +12 dB was then
    // "way too strong"; the lift is +6 dB. Same Wobble twice — once as the
    // move (with its wet gesture), once straight on the bus without one — so
    // the difference is the lift alone.
    const { tapeWobble } = await import('../moves/tapeWobble');
    const levels: number[] = [];
    const afters: number[] = [];
    for (const asMove of [false, true]) {
      const rig = await makeDubBusRig(3);
      feedTone(rig);
      let release: (() => void) | null = null;
      const out = await rig.render([
        { at: 0, run: () => rig.bus.setSettings({ enabled: true }) },
        { at: 1.0, run: () => {
          if (asMove) {
            const h = tapeWobble.execute({ bus: rig.bus, params: { ...tapeWobble.defaults }, bpm: 120, source: 'live' });
            release = () => h?.dispose();
          } else {
            release = rig.bus.startTapeWobble(tapeWobble.defaults.depthMs, tapeWobble.defaults.rateHz);
          }
        } },
        { at: 2.0, run: () => release!() },
      ]);
      levels.push(toDb(rmsBetween(out, 1.4, 2.0)));
      afters.push(toDb(rmsBetween(out, 2.6, 3.0)));
    }
    const lift = levels[1] - levels[0];
    expect(lift, 'the held toggle got no lift').toBeGreaterThan(4);
    expect(lift, 'the lift is heavier than +6 dB').toBeLessThan(8);
    expect(Math.abs(afters[1] - afters[0]), 'the lift outlived the release').toBeLessThan(1.5);
  }, 60_000);
});
