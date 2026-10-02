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

/**
 * Liquid was STILL dead after the rate fix above, and this is why.
 *
 * Measured 2026-10-01 with analyser taps either side of the phaser:
 * `sweepPhaserInRms` 0.00091 against `sweepPhaserOutRms` exactly 0 — signal
 * arriving at the branch, nothing leaving it. That was at depth 1.0, 12 stages,
 * feedback 0.9 and 2 Hz, with `sweepPhaserWasmReady` true and the WASM itself
 * verified healthy offline (residual 0.278 against the input at the shipped
 * settings, so the DSP changes the signal substantially).
 *
 * So the break was the connection, not the engine and not the settings.
 * `Tone.connect` was handed a raw `GainNode` cast into a Tone type, so the
 * worklet's real input node received no audio, the worklet filled its output
 * with zeros, and the effect was silent at every setting. Every other
 * Tone↔native connection in DubBus.ts goes through `getNativeAudioNode`
 * (lines 686, 724, 756, 836) — this one did not. The startup passthrough that
 * would have hidden the fault is explicitly disconnected when the WASM takes
 * over, so there was no fallback left to hear.
 */
describe('the phaser branch is connected to the bus at all', () => {
  it('hands the phaser native nodes on both sides rather than a Tone cast', () => {
    expect(SRC, 'a Tone cast leaves the worklet input silent at every setting')
      .not.toContain('Tone.connect(this.sweepInput');
    expect(SRC).toContain('getNativeAudioNode(this.sweepInput as unknown)');
    expect(SRC).toContain('getNativeAudioNode(this.phaser.input as unknown)');
    expect(SRC).toContain('getNativeAudioNode(this.phaser.output as unknown)');
  });

  it('keeps the branch measurable, so this can never be undiagnosable again', () => {
    // The reason this took a full investigation: a severed branch and a
    // working one both read as "SILENT", because a phaser barely moves level
    // and every other probe (gate, branch gain, wasmReady) read healthy.
    expect(SRC).toContain('sweepPhaserInRms');
    expect(SRC).toContain('sweepPhaserOutRms');
    expect(SRC).toContain('sweepPhaserWasmReady');
  });
});
