/**
 * Contract tests for BiquadFilterNode stability.
 *
 * Tone.Filter with rolloff -24/-48/-96 cascades 2-8 internal BiquadFilterNodes.
 * Under fast parameter automation (rapid frequency/Q ramps), cascaded stages
 * can diverge numerically and output NaN — permanently killing the entire
 * downstream audio graph. Chrome never auto-recovers; every node downstream
 * of a NaN-producing filter goes silent forever.
 *
 * This bug destroyed all audio during dub siren auto-dub (2026-04-21).
 * Fix: cap rolloff at -12 (single biquad, immune to divergence) and clamp
 * frequency/Q to safe ranges.
 *
 * These static checks ensure nobody re-introduces cascaded biquads into the
 * live-automated filter paths.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

/**
 * Extract all Tone.Filter rolloff values from a source file.
 * Returns array of { line: number, rolloff: number }.
 */
function extractRolloffs(src: string): Array<{ line: number; rolloff: number }> {
  const results: Array<{ line: number; rolloff: number }> = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/rolloff:\s*(-\d+)/);
    if (m) results.push({ line: i + 1, rolloff: Number(m[1]) });
  }
  return results;
}

describe('BiquadFilterNode stability — no cascaded filters in automated paths', () => {
  describe('ChannelFilterManager (per-channel DJ-style sweeps)', () => {
    const src = read('engine/ChannelFilterManager.ts');

    it('uses rolloff -12 (single biquad) for all filters', () => {
      const rolloffs = extractRolloffs(src);
      expect(rolloffs.length).toBeGreaterThanOrEqual(2); // HPF + LPF
      for (const r of rolloffs) {
        expect(r.rolloff, `line ${r.line}: rolloff must be -12`).toBe(-12);
      }
    });

    it('clamps LPF frequency floor to >= 80 Hz', () => {
      expect(src).toMatch(/Math\.max\(80/);
    });

    it('clamps HPF frequency ceiling to <= 18000 Hz', () => {
      expect(src).toMatch(/Math\.min\(18000/);
    });

    it('caps resonance Q at 10 (not 15)', () => {
      expect(src).toMatch(/\*\s*9\.5/); // 0.5 + x * 9.5 = max 10
      expect(src).not.toMatch(/\*\s*14\.5/); // old: 0.5 + x * 14.5 = max 15
    });
  });

  describe('DeckEngine DJ filters', () => {
    const src = read('engine/dj/DeckEngine.ts');

    it('uses rolloff -12 for main HPF and LPF', () => {
      // Match the two filter creation lines near class initialization
      const rolloffs = extractRolloffs(src);
      for (const r of rolloffs) {
        expect(r.rolloff, `line ${r.line}: rolloff must be -12`).toBe(-12);
      }
    });

    it('clamps LPF sweep floor to >= 80 Hz', () => {
      expect(src).toMatch(/Math\.max\(80/);
    });

    it('clamps HPF sweep ceiling to <= 18000 Hz', () => {
      expect(src).toMatch(/Math\.min\(18000/);
    });

    it('caps filter resonance Q at 10', () => {
      expect(src).toMatch(/Math\.min\(10,\s*q\)/);
    });
  });

  describe('DubFilterEffect (King Tubby HPF)', () => {
    const src = read('engine/effects/DubFilterEffect.ts');

    it('uses rolloff -12 (not -24)', () => {
      const rolloffs = extractRolloffs(src);
      expect(rolloffs.length).toBeGreaterThanOrEqual(1);
      for (const r of rolloffs) {
        expect(r.rolloff, `line ${r.line}: rolloff must be -12`).toBe(-12);
      }
    });

    it('clamps cutoff frequency to 20..18000 Hz range', () => {
      expect(src).toMatch(/Math\.max\(20/);
      expect(src).toMatch(/Math\.min\(18000/);
    });

    it('caps Q at 10 to prevent ringing instability', () => {
      expect(src).toMatch(/Math\.min\(10/);
    });
  });

  describe('DubSirenSynth (already fixed)', () => {
    const src = read('engine/dub/DubSirenSynth.ts');

    it('clamps filter frequency to safe range via clampFilterFreq', () => {
      expect(src).toMatch(/clampFilterFreq/);
    });

    it('caps rolloff at -12', () => {
      expect(src).toMatch(/Math\.max\(-12/);
    });
  });

  describe('MadProfessorPlateEffect pre-HPF', () => {
    const src = read('engine/effects/MadProfessorPlateEffect.ts');

    it('uses rolloff -12 for preHpf (not -24)', () => {
      const rolloffs = extractRolloffs(src);
      expect(rolloffs.some(r => r.rolloff === -12), 'preHpf must use -12 rolloff').toBe(true);
      expect(rolloffs.every(r => r.rolloff >= -12), 'no filter should use rolloff steeper than -12').toBe(true);
    });
  });

  describe('DubBus master/return LPF floor clamping', () => {
    const src = read('engine/dub/DubBus.ts');

    it('clamps sweepMasterLpf floor to >= 100 Hz', () => {
      expect(src).toMatch(/Math\.max\(100,\s*targetHz\)/);
    });

    it('clamps tapeStop LPF to >= 100 Hz', () => {
      // tapeStop ramps down to 100, not 80
      expect(src).toMatch(/exponentialRampToValueAtTime\(100,\s*now\s*\+\s*downSec\)/);
    });

    it('clamps filterDrop floor to >= 40 Hz', () => {
      expect(src).toMatch(/Math\.max\(40,\s*targetHz\)/);
    });

    it('clamps bassShelfGainDb to ±12 dB (shelf is inside feedback loop)', () => {
      // +18 dB bass boost inside the echo feedback loop causes exponential
      // signal growth → NaN → permanent audio death
      expect(src).toMatch(/Math\.max\(-12,\s*Math\.min\(12,\s*merged\.bassShelfGainDb\)\)/);
    });

    it('has a compensating low-shelf CUT in the feedback path', () => {
      // Without this, bass shelf boost inside the feedback loop creates a
      // stable full-amplitude bass drone: each iteration boosts bass →
      // saturator clips to 1.0 → feedback sends back → boost again
      expect(src).toMatch(/feedbackShelfComp/);
      expect(src).toMatch(/feedbackShelfComp\.gain\.setTargetAtTime\(-safeBassGain/);
    });
  });
});
