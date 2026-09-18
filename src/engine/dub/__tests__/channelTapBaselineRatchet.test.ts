import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ChannelTapBaselines } from '@/lib/dub/channelTapBaseline';

/**
 * Regression: a channel tap's restore target was `tap.gain.value` sampled at
 * open (throws) or at solo time (solo moves). With overlapping moves that
 * sample is a raised transient, not the fader, so release ramped the tap UP
 * and it ratcheted toward 1.0 — "one of the bass effects is stuck firing".
 */
describe('ChannelTapBaselines — a transient restores to the fader, not to a sampled transient', () => {
  it('restores to the stored fader even when the node was sampled mid-throw', () => {
    const b = new ChannelTapBaselines();
    b.set(0, 0.105);            // fader
    expect(b.resolve(0, 1.0)).toBe(0.105);   // node sampled while a throw held it at 1.0
  });

  it('restores to the stored fader when sampled inside a release ramp', () => {
    const b = new ChannelTapBaselines();
    b.set(0, 0.105);
    expect(b.resolve(0, 0.149)).toBe(0.105); // the exact ratchet value from the fire log
  });

  it('falls back to the sampled node only when no fader write has been seen', () => {
    const b = new ChannelTapBaselines();
    expect(b.resolve(3, 0.4)).toBe(0.4);
  });

  it('follows fader moves made during a hold — restore reads the latest value', () => {
    const b = new ChannelTapBaselines();
    b.set(0, 0.1);
    b.set(0, 0.6);              // user dragged the fader while a throw was open
    expect(b.resolve(0, 1.0)).toBe(0.6);
  });

  it('forgets a channel when its tap is unregistered', () => {
    const b = new ChannelTapBaselines();
    b.set(0, 0.5);
    b.delete(0);
    expect(b.resolve(0, 0.2)).toBe(0.2);
  });

  it('clamps stored values to the gain range', () => {
    const b = new ChannelTapBaselines();
    b.set(0, 4);
    expect(b.get(0)).toBe(1);
  });
});

describe('DubBus wiring contract', () => {
  const bus = readFileSync(join(__dirname, '..', 'DubBus.ts'), 'utf8');
  const routed = readFileSync(
    join(__dirname, '..', '..', 'tone', 'ChannelRoutedEffects.ts'),
    'utf8',
  );

  it('openChannelTap releases to the stored baseline, resolved at release time', () => {
    const start = bus.indexOf('  openChannelTap(');
    const body = bus.slice(start, start + 4000);
    // The warm path's releaser must consult the baselines, not a captured node value.
    const warm = body.slice(body.indexOf('const tap = this.channelTaps.get(channelId);'));
    const releaser = warm.slice(warm.indexOf('return () => {'), warm.indexOf('};') + 2);
    expect(releaser).toContain('this.channelTapBaselines.resolve(channelId');
  });

  it('soloChannelTap restores every tap to its stored baseline, not the snapshot', () => {
    const start = bus.indexOf('  soloChannelTap(');
    const body = bus.slice(start, start + 2500);
    const releaser = body.slice(body.indexOf('return () => {'));
    expect(releaser).toContain('this.channelTapBaselines.resolve(id');
  });

  it('ChannelRoutedEffects reports every fader write to the bus', () => {
    const start = routed.indexOf('  setChannelDubSend(');
    const body = routed.slice(start, start + 2500);
    expect(body).toContain('setChannelTapBaseline(channelIndex, curved)');
  });

  it('ChannelRoutedEffects registers taps with their fader baseline', () => {
    expect(routed).toMatch(/registerChannelTap\((channelIndex|ch), gain, dubSendToGain\(/);
  });
});
