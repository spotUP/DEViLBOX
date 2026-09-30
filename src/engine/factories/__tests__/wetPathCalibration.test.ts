/**
 * Delays, reverbs and modulation are calibrated in their WET path.
 *
 * Owner, 2026-09-30: "the echo/reverb is still on overdrive drowning
 * everything", then "Calibrate now". Measured in the app the same day
 * (measure_master_effect, stereo pink noise, wet 100 %, defaults), the
 * effects themselves ranged from -7.1 dB (Leslie) to +6.7 dB (AnotherDelay),
 * and the post-effect gains meant to correct them scaled the dry signal as
 * well and several pointed the wrong way (Chorus at unity came out +4.2 dB).
 * After: every calibrated effect within 0.5 dB (tools/master-fx-wet-calibration.json).
 *
 * This pins the wiring: every calibrated type has a wet path the factory can
 * reach, and none is also corrected after its dry/wet mix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { wetPathCalibratedTypes, getWetPathGain, getEffectGainCompensationDb } from '../effectGainCompensation';

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');
const TONE_BUILTINS = new Set(['Reverb', 'JCReverb', 'Delay', 'FeedbackDelay', 'PingPongDelay']);

describe('wet-path calibration', () => {
  it('has the measured corrections', () => {
    expect(20 * Math.log10(getWetPathGain('AnotherDelay'))).toBeCloseTo(-6.7, 5);
    expect(20 * Math.log10(getWetPathGain('Leslie'))).toBeCloseTo(7.1, 5);
    expect(getWetPathGain('Tremolo')).toBe(1); // exempt: an amplitude modulator
  });

  it('no calibrated type is also scaled after its dry/wet mix', () => {
    for (const t of wetPathCalibratedTypes()) expect(getEffectGainCompensationDb(t), t).toBe(0);
    for (const t of ['Chorus', 'Phaser', 'Tremolo', 'Vibrato', 'AutoPanner', 'SpaceEcho']) {
      expect(getEffectGainCompensationDb(t), t).toBe(0);
    }
  });

  it('every calibrated wrapper takes the gain on its wet signal only', () => {
    for (const t of wetPathCalibratedTypes()) {
      if (TONE_BUILTINS.has(t)) continue;
      const file = t.startsWith('WAM') ? 'engine/wam/WAMEffectNode.ts' : `engine/effects/${t}Effect.ts`;
      expect(existsSync(join(process.cwd(), 'src', file)), file).toBe(true);
      const code = src(file);
      expect(code, t).toMatch(/setWetPathGain\(gain: number\): void/);
      // The wet setter multiplies by the calibration; the dry side does not.
      expect(code, t).toMatch(/_wetPathGain[;)]|\* this\._wetPathGain/);
      expect(code, t).not.toMatch(/dryGain\.gain\.value = [^;]*_wetPathGain/);
    }
  });

  it('the factory applies it to every effect it builds, after the wet return for Tone.js effects', () => {
    const factory = src('engine/factories/EffectFactory.ts');
    expect(factory).toMatch(/function applyGainCompensation\([^)]*\)[^{]*\{\n\s*applyWetPathGain\(effectNode, config\.type\);/);
    expect(factory).toContain('wetSource.connect(cal);');
    expect(factory).toContain('cal.connect(crossfadeB);');
  });
});

/**
 * The drive / amp / dynamics corrections (EFFECT_GAIN_COMPENSATION_DB) go on
 * the wet signal too, in the master chain. A gain after the effect cut the dry
 * signal of a preset running the effect below 100 % wet: Vox Amp Crunch
 * (WAMVoxAmp -13.9 dB at wet 40) came out "low volume and very thin all bass
 * gone" (owner, 2026-09-30); measured after, it reads -2.1 dB at wet 40.
 */
describe('master chain level corrections', () => {
  it('try the wet path first, and scale the whole output only when there is none', () => {
    const chain = src('engine/tone/MasterEffectsChain.ts');
    expect(chain).toMatch(/compLinear !== 1 && applyWetGain\(node, compLinear\) === 'none'/);
  });

  // Wrappers whose mix happens inside the worklet keep the gain after them.
  const MIX_INSIDE = new Set(['ToneArm']);
  it('every corrected wrapper with a wet gain takes it on its wet path', () => {
    const table = src('engine/factories/effectGainCompensation.ts');
    const body = table.slice(table.indexOf('const EFFECT_GAIN_COMPENSATION_DB'), table.indexOf('};', table.indexOf('const EFFECT_GAIN_COMPENSATION_DB')));
    const types = [...body.matchAll(/^\s+(\w+):\s+([-+]?[0-9.]+),/gm)].filter((m) => Number(m[2]) !== 0).map((m) => m[1]);
    let checked = 0;
    for (const t of types) {
      if (MIX_INSIDE.has(t)) continue;
      for (const f of [`engine/effects/${t}Effect.ts`, `engine/effects/${t}.ts`]) {
        if (!existsSync(join(process.cwd(), 'src', f))) continue;
        const code = src(f);
        if (!/wetGain/.test(code)) continue;
        expect(code, t).toMatch(/setWetPathGain\(gain: number\): void/);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
