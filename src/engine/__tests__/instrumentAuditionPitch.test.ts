/**
 * K10: clicking an Amiga Sampler in the instrument list sounded one octave too high. The audition named the sample's
 * base note (C3) and relied on the engine playing the base note at the stored rate; since a key takes the grid note's
 * period (keyboardPeriod, K4) C3 is grid C-3, period 214, twice the stored 8287 Hz. The audition now plays the period
 * of the stored rate (naturalPeriod), so it sounds the sample at its recorded pitch, and a typed key still sounds
 * the grid note's period.
 *
 * Measured through the real ToneEngine (renderKeys): a 64-byte sine stored at 8287 Hz is 129.5 Hz at its stored rate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSamplerInstrument } from '@/lib/import/formats/AmigaUtils';
import { naturalPeriod } from '@/engine/keyboardPeriod';
import { renderKeys } from './uadeKeyHarness';
import { fundamentalHz } from './keyboardPreviewHarness';

const sine = (): Uint8Array => Uint8Array.from({ length: 64 }, (_, i) => Math.round(100 * Math.sin((2 * Math.PI * i) / 64)) & 0xff);
const STORED_HZ = 8287 / 64;

async function pitchOf(note: string, period?: number): Promise<number> {
  const inst = createSamplerInstrument(1, '', sine(), 64, 8287, 0, 64);
  const out = await renderKeys(inst, [{ note, at: 0, period }], 0.6);
  const on = out.findIndex((v) => Math.abs(v) > 0.0005);
  return fundamentalHz(out.subarray(on, on + 14000), 30, 3000);
}

describe('instrument audition pitch (K10)', () => {
  it('the audition (base note C3 + naturalPeriod) sounds the sample at its stored rate, not an octave above', async () => {
    const inst = createSamplerInstrument(1, '', sine(), 64, 8287, 0, 64);
    expect(inst.sample!.baseNote).toBe('C3');
    expect(naturalPeriod(inst)).toBeCloseTo(428, 0);
    const hz = await pitchOf('C3', naturalPeriod(inst));
    expect(Math.abs(1200 * Math.log2(hz / STORED_HZ)), `audition ${hz.toFixed(1)} Hz, stored ${STORED_HZ.toFixed(1)} Hz`).toBeLessThan(30);
  }, 120_000);

  it('a typed key still sounds the grid note: C2 is the stored rate (period 428), C3 an octave above', async () => {
    const c2 = await pitchOf('C2');
    const c3 = await pitchOf('C3');
    expect(Math.abs(1200 * Math.log2(c2 / STORED_HZ)), `C2 ${c2.toFixed(1)} Hz`).toBeLessThan(30);
    expect(Math.abs(1200 * Math.log2(c3 / c2) - 1200), `C3 ${c3.toFixed(1)} Hz`).toBeLessThan(30);
  }, 120_000);

  it('instruments that do not play by period have no natural period', () => {
    expect(naturalPeriod({ sample: { sampleRate: 8287 } })).toBeUndefined();
    expect(naturalPeriod({ sample: { sampleRate: 8287 }, metadata: { modPlayback: { usePeriodPlayback: false, periodMultiplier: 3546895 } } })).toBeUndefined();
  });

  it('the instrument list auditions a Sampler at naturalPeriod', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/instruments/InstrumentList.tsx'), 'utf8');
    expect(src).toMatch(/triggerNoteAttack\(inst\.id, previewNote, now, 0\.8, inst, naturalPeriod\(inst\)\)/);
  });
});
