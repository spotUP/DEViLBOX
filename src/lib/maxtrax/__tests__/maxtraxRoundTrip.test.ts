import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMaxTrax, encodeMaxTrax } from '@/lib/import/formats/maxtrax/maxtraxFormat';
import { setNoteDuration } from '@/lib/maxtrax/maxtraxGrid';

const buf = () => new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/maxtrax', 'contraptionzack-march.mxtx')));

describe('MaxTrax export round-trip', () => {
  it('unedited data re-encodes byte-identical', () => {
    const original = buf();
    const re = encodeMaxTrax(parseMaxTrax(original));
    expect(Buffer.from(re)).toEqual(Buffer.from(original));
  });

  it('an edited duration survives export -> re-import', () => {
    const data = parseMaxTrax(buf());
    const idx = data.scores[0].events.findIndex((e) => e.command <= 0x7f);
    data.scores[0] = setNoteDuration(data.scores[0], idx, 321);
    const reimported = parseMaxTrax(encodeMaxTrax(data));
    expect(reimported.scores[0].events[idx].stopTime).toBe(321);
  });
});
