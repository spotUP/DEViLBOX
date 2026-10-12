/**
 * The S950 grit replays the Up Rough reference (scratch ledger SCR-PG-D2, owner decision O4):
 * `sampler.process(x, "s950", 22050, dither=True)` + `scratch._norm` on a fixed 0.3 s input,
 * fixture `fixtures/s950.json` from `tools/scratch-fixtures/gen_s950_fixture.py`. Within 1e-6.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { s950 } from '../scratchGrit';

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 's950.json'), 'utf8')) as { input: number[]; idx: number[]; out: number[] };

describe('the S950 grit (SCR-PG-D2)', () => {
  it('equals the reference chain within 1e-6', () => {
    const y = s950(fixture.input);
    fixture.idx.forEach((i, k) => expect(Math.abs(y[i]! - fixture.out[k]!), `sample ${i}`).toBeLessThan(1e-6));
  });
});
