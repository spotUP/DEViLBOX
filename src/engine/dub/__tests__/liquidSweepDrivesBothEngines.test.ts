import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Liquid was reported dead. It was not: the bus was in PHASER mode.
 *
 * `sweepMode` picks one engine — comb (`sweepDelay`, modulated by `sweepLfo`)
 * or phaser (`CalfPhaserEffect`, which has its own rate and cannot hear that
 * LFO). `startCombSweep` moved only the comb. In phaser mode it opened the
 * gate onto a phaser still turning at its resting `phaserRate: 0.15` — one
 * sweep every 6.7 seconds. On and motionless, which is what "dead" sounds
 * like. Measured 2026-09-22 with `sweepMode: "phaser"` while the return was
 * flowing (busReturn 0.178 against programme 0.155) and the governor had
 * already been loosened to -3.68 dB, so neither of those was the cause.
 *
 * happy-dom has no WASM phaser, so this pins the wiring: the gesture must
 * reach the engine that is actually in the path, and must hand the rate back.
 */
const SRC = readFileSync(join(process.cwd(), 'src/engine/dub/DubBus.ts'), 'utf-8');

const startCombSweep = (): string => {
  const start = SRC.indexOf('  startCombSweep(');
  expect(start, 'startCombSweep moved').toBeGreaterThan(-1);
  // Up to the end of the returned release closure.
  return SRC.slice(start, SRC.indexOf('\n  }\n', SRC.indexOf('return () => {', start)));
};

describe('the Liquid sweep drives whichever engine is in the path', () => {
  it('moves the phaser when the bus is in phaser mode', () => {
    const body = startCombSweep();
    expect(body).toContain("this.settings.sweepMode === 'phaser'");
    expect(
      body,
      'in phaser mode the gesture only opened a gate onto a phaser at its resting rate'
    ).toContain('this.phaser.setRate(Math.max(0.05, rateHz))');
  });

  it('still moves the comb, which is the other half of the same control', () => {
    const body = startCombSweep();
    expect(body).toContain('this.sweepLfo.frequency');
    expect(body).toContain('this.sweepLfoGain.gain');
  });

  it('hands the phaser rate back on release, so the BUS tab keeps its value', () => {
    const body = startCombSweep();
    expect(body).toContain('const priorPhaserRate = this.settings.phaserRate;');
    expect(body).toContain('if (wasPhaser) this.phaser.setRate(priorPhaserRate);');
  });

  it('the two engines are still mutually exclusive — this did not merge them', () => {
    // combOutput/phaserOutput are gated by mode; the fix must not touch that.
    // (Each gate's open value is the engine's unity gain - sweepLevel.ts.)
    expect(SRC).toContain("this._settle(this.combOutput.gain, isPhaser ? 0 : sweepBranchNorm('comb'");
    expect(SRC).toContain("this._settle(this.phaserOutput.gain, isPhaser ? sweepBranchNorm('phaser', m.phaserFeedback ?? 0) : 0, now, 0.01);");
  });
});
