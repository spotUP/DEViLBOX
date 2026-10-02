/**
 * Sub Harmonic's release must take down only what it built.
 *
 * Source-level asserts: DubBus needs live Web Audio (see the handoff of
 * 2026-10-02 — no fake context constructs it). Three faults:
 *  - the pulse's detector stayed connected to the bus input after release,
 *    so every toggle left a lowpass + 8192-point analyser hanging off it;
 *  - the bed's programme feed was never disconnected from its highpass;
 *  - the bed's release nulled `_subBedTap` 600 ms later even when a re-fire
 *    had already registered its own tap, and a "diagnostic" 8x mix ceiling
 *    sat on a performance control.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '..', 'DubBus.ts'), 'utf8');
const body = (sig: string): string => {
  const start = SRC.indexOf(sig);
  expect(start, `${sig} not found`).toBeGreaterThan(-1);
  return SRC.slice(start, SRC.indexOf('\n  /**', start));
};

describe('Sub Harmonic release', () => {
  it('disconnects the pulse detector from the bus input', () => {
    expect(body('  startSubHarmonic(')).toContain('this.input.disconnect(lowpass);');
  });

  it('disconnects the bed from the programme it reads', () => {
    expect(body('  startSubBassBed(')).toContain('bedSource?.disconnect(hp);');
  });

  it('clears the tap only when it is still this bed\'s', () => {
    const bed = body('  startSubBassBed(');
    expect(bed).toContain('if (this._subBedTap === bedTap) {');
    expect(bed).not.toContain('this._subBedTap?.disconnect()');
  });

  it('caps the bed at the dry low band, not 8x it', () => {
    expect(SRC).toContain('const SUB_BED_MAX_MIX = 1;');
  });
});
