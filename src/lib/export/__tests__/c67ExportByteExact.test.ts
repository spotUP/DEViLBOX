import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCDFM67File } from '@lib/import/formats/CDFM67Parser';
import { exportCDFM67 } from '../CDFM67Exporter';

const FILE = 'public/data/songs/composer-670-cdfm/amnesia_credits.c67';
const load = () => {
  const b = readFileSync(FILE);
  return { b, song: parseCDFM67File(new Uint8Array(b), 'amnesia_credits.c67')! };
};
const run = async (song: ReturnType<typeof load>['song']) =>
  new Uint8Array(await (await exportCDFM67(song as never)).data.arrayBuffer());

describe('C67 export is byte-exact', () => {
  it('unedited export equals amnesia_credits.c67', async () => {
    const { b, song } = load();
    expect(Buffer.from(await run(song))).toEqual(b);
  });

  it('an edited FM note changes only its note byte', async () => {
    const { b, song } = load();
    // Pattern 0 starts 04 29 0f: channel 4, note 0x29 (octave 2, semitone 9), instr/vol 0f.
    const cell = song.patterns[0].channels[4].rows[0];
    cell.note += 1;
    const out = await run(song);
    const diff = [...out].flatMap((v, i) => (v !== b[i] ? [i] : []));
    expect(diff).toEqual([2978 + 1]);
    expect(out[2978 + 1]).toBe(0x2a);
  });
});
