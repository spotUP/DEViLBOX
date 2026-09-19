/**
 * The publish half of X17: the bus telling the UI what a move is doing.
 *
 * Only `dub.channelSend.chN` ever announced itself, which is precisely why the
 * channel faders always moved and nothing else did. A move that sweeps the
 * filter or swells the feedback drove the audio nodes and left every slider
 * showing the value the user last set.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const bus = readFileSync(join(__dirname, '..', 'DubBus.ts'), 'utf8');

describe('the bus announces what it modulates', () => {
  it('has one place that does it', () => {
    expect(bus).toContain('private announce(param: string, value: number): void {');
  });

  it('never lets a dead subscriber break a move', () => {
    expect(bus).toMatch(/catch \{ \/\* a dead subscriber must never break a move \*\/ \}/);
  });

  it('announces the feedback swell, and the hand-back afterwards', () => {
    // Both edges: a control that only moved outward would stick.
    const calls = bus.match(/this\.announce\('dub\.echoIntensity',/g) ?? [];
    expect(calls.length).toBe(2);
    expect(bus).toContain("this.announce('dub.echoIntensity', this.settings.echoIntensity);");
  });

  it('announces every step of the Altec filter climb', () => {
    // `setHpf` is the choke point for the whole sweep, so one call there
    // covers each step rather than only the endpoints.
    expect(bus).toMatch(/const setHpf = \(hz: number\) => \{[\s\S]{0,600}this\.announce\('dub\.hpfCutoff', hpfHzToNormalized\(hz\)\);/);
  });

  it('normalises hertz the way the MIDI router does', () => {
    // So an announced control lands where a CC would put it.
    expect(bus).toContain('function hpfHzToNormalized(hz: number): number {');
    expect(bus).toContain('(hz - 20) / 980');
  });

  it('clamps, because the sweep climbs past the control range', () => {
    // Altec steps reach 10 kHz; the control covers 20 Hz to 1 kHz.
    expect(bus).toMatch(/Math\.max\(0, Math\.min\(1, \(hz - 20\) \/ 980\)\)/);
  });

  it('changes no state — settings still hold what the USER set', () => {
    // A move restores to `settings`, so announcing must not touch it or the
    // restore would land on the modulated value.
    const announceBody = bus.slice(
      bus.indexOf('private announce(param: string, value: number): void {'),
      bus.indexOf('private announce(param: string, value: number): void {') + 400,
    );
    expect(announceBody).not.toMatch(/this\.settings\s*=/);
  });
});
