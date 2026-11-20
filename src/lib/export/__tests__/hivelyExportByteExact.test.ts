import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseHivelyFile } from '@lib/import/formats/HivelyParser';
import { exportAsHively } from '../HivelyExporter';

const DIR = 'public/data/songs/formats/';
const load = (f: string) => {
  const b = readFileSync(DIR + f);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { b, song: parseHivelyFile(ab, f) };
};
const run = async (song: ReturnType<typeof load>['song'], format: 'ahx' | 'hvl') =>
  new Uint8Array(await (exportAsHively(song, { format }).data as Blob).arrayBuffer());

describe.each([['aces_high.ahx', 'ahx'], ['hexplosion.hvl', 'hvl']] as const)('Hively export of %s', (f, fmt) => {
  it('unedited export is byte-exact', async () => {
    const { b, song } = load(f);
    expect(Buffer.from(await run(song, fmt))).toEqual(b);
  });

  it('one edited step changes one byte and re-imports', async () => {
    const { b, song } = load(f);
    const step = song.hivelyNative!.tracks.flatMap(t => t.steps).find(s => s.note > 0 && s.note < 60)!;
    step.note += 1;
    const out = await run(song, fmt);
    expect(out.length).toBe(b.length);
    const diff = [...out].flatMap((v, i) => (v !== b[i] ? [i] : []));
    expect(diff.length).toBe(1);
    const re = parseHivelyFile(out.buffer.slice(0) as ArrayBuffer, f);
    expect(re.hivelyNative!.tracks.flatMap(t => t.steps).filter(s => s.note > 0).map(s => s.note))
      .toEqual(song.hivelyNative!.tracks.flatMap(t => t.steps).filter(s => s.note > 0).map(s => s.note));
  });
});
