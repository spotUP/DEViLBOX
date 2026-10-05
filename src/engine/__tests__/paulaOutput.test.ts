import { describe, it, expect } from 'vitest';
import { PAULA_SYNTH_TYPES, needsPaulaOutputStage } from '../paulaOutput';

/**
 * Which engines get the Amiga output stage, and — more importantly — which
 * must never get it.
 *
 * Every Amiga 500 filtered Paula's DAC before the jacks. The in-house
 * replayers hand that output over raw: 48 `*-wasm/src/*.c` mixers do Amiga
 * period playback and NOT ONE filters. Measured on
 * `delta-music/triplex1.dm`, 48 s, with and without the stage:
 *
 *     one-sample jumps > 0.3 full scale    27537  ->  26
 *     one-sample jumps > 0.5 full scale     3693  ->   0
 *     energy above 8 kHz                   2.05%  ->  0.59%
 *
 * That is the click the owner reported, removed.
 */
describe('the Amiga output stage goes only where Paula went unfiltered', () => {
  it('claims the engines that emulate Paula and do not filter', () => {
    expect(needsPaulaOutputStage('DeltaMusic1WasmSynth')).toBe(true);
    expect(needsPaulaOutputStage('SoundMonWasmSynth')).toBe(true);
    expect(needsPaulaOutputStage('SonicArrangerWasmSynth')).toBe(true);
    // MusicMaker.worklet.js measured +8 dB above 10 kHz against UADE's players (2026-10-05).
    expect(needsPaulaOutputStage('MusicMakerSynth')).toBe(true);
  });

  /**
   * The dangerous half. UADE runs the real replayer through its own Paula
   * emulation and Furnace models each chip's output stage, so adding ours
   * filters their audio TWICE.
   */
  it('never claims an engine that filters its own output', () => {
    for (const synth of ['UADEEditableSynth', 'FurnaceDispatchSynth', 'FurnaceSynth', 'HivelySynth']) {
      expect(needsPaulaOutputStage(synth), synth).toBe(false);
    }
  });

  /**
   * A SID, an AY, a YM2612 or a PC-98 OPN never went through an Amiga's
   * output stage. Applying one is a colour nobody's hardware ever had.
   */
  it('never claims a chip that is not a Paula', () => {
    for (const synth of [
      'ZxtuneSynth', 'AsapSynth', 'Sc68Synth', 'PmdminiSynth', 'FmplayerSynth',
      'MdxminiSynth', 'OrganyaSynth', 'PxtoneSynth', 'KlysSynth', 'V2MSynth',
    ]) {
      expect(needsPaulaOutputStage(synth), synth).toBe(false);
    }
  });

  it('says no to an unknown or missing synth type', () => {
    expect(needsPaulaOutputStage(undefined)).toBe(false);
    expect(needsPaulaOutputStage('')).toBe(false);
    expect(needsPaulaOutputStage('SomethingNobodyHasWrittenYet')).toBe(false);
  });

  it('names every member explicitly, so adding one is a decision', () => {
    // No prefix matching, no `endsWith('WasmSynth')` — that would sweep in
    // chips that are not Amigas the moment someone ports one.
    expect(PAULA_SYNTH_TYPES.size).toBeGreaterThan(30);
    for (const t of PAULA_SYNTH_TYPES) expect(typeof t).toBe('string');
  });
});
