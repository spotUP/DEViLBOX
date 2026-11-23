import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseChuckBiscuitsFile } from '@lib/import/formats/ChuckBiscuitsParser';
import { exportChuckBiscuits } from '../ChuckBiscuitsExporter';

const FILE = 'public/templates/chuckBiscuits.cba';
const load = () => {
  const b = readFileSync(FILE);
  return { b, song: parseChuckBiscuitsFile(new Uint8Array(b), 'chuckBiscuits.cba')! };
};
const run = async (song: ReturnType<typeof load>['song']) =>
  new Uint8Array((await (await exportChuckBiscuits(song as never)).data.arrayBuffer()));

describe('Chuck Biscuits export', () => {
  it('unedited export equals the template', async () => {
    const { b, song } = load();
    const out = await run(song);
    const diff = [...out].flatMap((v, i) => (v !== b[i] ? [i] : []));
    expect({ len: out.length, diff: diff.slice(0, 40).map((i) => `${i}:${b[i]}>${out[i]}`) }).toEqual({ len: b.length, diff: [] });
  });

  it('a note edit changes exactly the cell bytes and reparses', async () => {
    const { b, song } = load();
    song.patterns[0].channels[0].rows[0].note = 49;
    song.patterns[0].channels[0].rows[0].instrument = 1;
    const out = await run(song);
    const diff = [...out].flatMap((v, i) => (v !== b[i] ? [i] : []));
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.length).toBeLessThanOrEqual(2);
    expect(parseChuckBiscuitsFile(out, 'x.cba')!.patterns[0].channels[0].rows[0].note).toBe(49);
  });
});
