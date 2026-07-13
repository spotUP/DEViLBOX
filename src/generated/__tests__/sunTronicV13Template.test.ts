/**
 * Golden test for the committed SunTronic V1.3 export template.
 *
 * Re-derives the template from the reference module (mule.src) at test time and
 * asserts byte-for-byte equality with the committed artifact — so
 * src/generated/sunTronicV13Template.ts can never drift from its source. If this
 * fails, regenerate: npx tsx tools/suntronic-re/extract-template.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SUNTRONIC_V13_TEMPLATE } from '../sunTronicV13Template';
import { deriveSunTronicV13Template } from '../../../tools/suntronic-re/templateDerive';

const MULE = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/mule.src');

describe('SUNTRONIC_V13_TEMPLATE (golden)', () => {
  it('matches a fresh derivation from mule.src', () => {
    const mule = new Uint8Array(readFileSync(MULE));
    const derived = deriveSunTronicV13Template(mule);
    expect(JSON.parse(JSON.stringify(SUNTRONIC_V13_TEMPLATE))).toEqual(derived);
  });

  it('is a self-consistent reference wrap (deltas zero, name block + tracks located)', () => {
    const t = SUNTRONIC_V13_TEMPLATE;
    expect(t.layout.deltaA).toBe(0);
    expect(t.layout.deltaB).toBe(0);
    expect(t.layout.nameBlockEnd).toBeGreaterThan(0);
    expect(t.layout.blockCount).toBeGreaterThan(0);
    expect(t.layout.trackRegionStart).toBeGreaterThan(t.layout.sampledTableOff);
    expect(t.module.length).toBeGreaterThan(0);
  });
});
