import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dubSendToGain, storedDubSendGains, MAX_DUB_SEND_CHANNELS } from '../dubSendCurve';

/**
 * "with all channel faders at max the only one i can hear is sweep"
 * (2026-09-23).
 *
 * Every per-channel dub gain is created at 0, and the only thing that ever
 * wrote one was a live `setChannelDubSend`. So after a song load, a bus
 * recreate or a crash-recovery restore the store held the sends, the worklet
 * rendered its dub slots, DubBus listed the taps, the deck drew the faders up
 * — and the gain between them was zero. Measured live: `busInput` 0.00000
 * with four sends at 0.77-0.84 and `activeDubSlots: 4`; re-writing the same
 * values the store already held took it to 0.04716.
 */
describe('dubSendToGain', () => {
  it('is silent at a closed send and capped at the top of the fader', () => {
    expect(dubSendToGain(0)).toBe(0);
    expect(dubSendToGain(1)).toBeCloseTo(0.7, 6);
  });

  it('stays near linear through the low and mid travel', () => {
    expect(dubSendToGain(0.25)).toBeCloseTo(0.25 * (1 - 0.3 * 0.0625), 6);
    expect(dubSendToGain(0.5)).toBeCloseTo(0.5 * (1 - 0.3 * 0.25), 6);
  });

  it('clamps anything outside the fader, including a broken number', () => {
    expect(dubSendToGain(-2)).toBe(0);
    expect(dubSendToGain(4)).toBeCloseTo(0.7, 6);
    expect(dubSendToGain(NaN)).toBe(0);
  });

  it('rises with the fader', () => {
    for (let f = 0; f < 0.95; f += 0.05) {
      expect(dubSendToGain(f + 0.05)).toBeGreaterThan(dubSendToGain(f));
    }
  });
});

describe('storedDubSendGains', () => {
  it('seeds the owner\'s measured state instead of silence', () => {
    const channels = [{ dubSend: 0.7678611865942029 }, { dubSend: 0.8367023601398601 },
      { dubSend: 0.8367023601398601 }, { dubSend: 0.8367023601398601 }];
    const gains = storedDubSendGains(channels);
    expect(gains[0]).toBeCloseTo(dubSendToGain(0.7678611865942029), 12);
    for (const g of gains.slice(0, 4)) expect(g).toBeGreaterThan(0.4);
  });

  it('is silent for every channel the store has nothing for', () => {
    const gains = storedDubSendGains([{ dubSend: 0.5 }]);
    expect(gains[0]).toBeGreaterThan(0);
    expect(gains.slice(1).every(g => g === 0)).toBe(true);
    expect(gains).toHaveLength(MAX_DUB_SEND_CHANNELS);
  });

  it('survives a missing store entirely', () => {
    expect(storedDubSendGains(null).every(g => g === 0)).toBe(true);
    expect(storedDubSendGains(undefined)).toHaveLength(MAX_DUB_SEND_CHANNELS);
    expect(storedDubSendGains([null, undefined, { dubSend: null }])[2]).toBe(0);
  });
});

/**
 * And the wiring: a gain created at zero is only correct until the store is
 * consulted, so both the initial build and the rebuild must seed from it.
 */
describe('the dub wiring seeds its gains from the store', () => {
  const SRC = readFileSync(join(process.cwd(), 'src/engine/tone/ChannelRoutedEffects.ts'), 'utf-8');

  it('uses the one curve, with no private copy left behind', () => {
    expect(SRC).toContain("from '@/lib/dub/dubSendCurve'");
    expect(SRC, 'a second definition of the curve').not.toContain('function dubSendToGain(');
  });

  it('seeds every channel gain when the wiring is first built', () => {
    const setup = SRC.slice(SRC.indexOf('setupDubBusWiring('), SRC.indexOf('/** Get the per-channel effect chain'));
    expect(setup).toContain('storedDubSendGains(');
    // Opened with a ramp from silence, not as a step: the wiring is built
    // while the engines are still booting, and a step made the startup
    // transient audible ("i heard the warm up", 2026-09-23).
    expect(setup).toContain('g.gain.value = 0;');
    expect(setup).toContain('linearRampToValueAtTime(target, seedFrom + DUB_SEND_SEED_RAMP_SEC)');
  });

  it('writes the gain when a rebuild re-hydrates the send values', () => {
    const rebuild = SRC.slice(SRC.indexOf('async rebuildDubConnections()'), SRC.indexOf('// ── Per-channel effect routing'));
    // The effective send: the fader, or the BLEED floor for a closed channel.
    expect(rebuild).toContain('dubSendToGain(this.effectiveDubSendOf(ch))');
    expect(rebuild).toContain('linearRampToValueAtTime(want, t + DUB_SEND_SEED_RAMP_SEC)');
  });
});
