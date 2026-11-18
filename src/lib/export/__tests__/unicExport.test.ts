import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseUNICFile } from '@/lib/import/formats/UNICParser';
import { exportUNIC } from '@/lib/export/UNICExporter';

const FILE = 'public/data/songs/formats/african dreams.unic';
const load = async () => {
  const b = readFileSync(FILE);
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { b, song: await parseUNICFile(buf, 'african dreams.unic') };
};
const bytes = async (r: { data: Blob }) => new Uint8Array(await r.data.arrayBuffer());

describe('UNIC export keeps header bytes the song did not change', () => {
  it('unedited export is the original file (UNIC magic, loop length 1, raw finetune, name tail bytes)', async () => {
    const { b, song } = await load();
    expect(Buffer.from(await bytes(await exportUNIC(song)))).toEqual(b);
  });

  it('an edited sample volume changes that header byte and nothing else', async () => {
    const { b, song } = await load();
    const inst = song.instruments[1];
    inst.metadata = { ...inst.metadata, modPlayback: { ...inst.metadata!.modPlayback!, defaultVolume: 20 } };
    const out = await bytes(await exportUNIC(song));
    const diff = [...out].flatMap((v, i) => (v !== b[i] ? [i] : []));
    expect(diff).toEqual([20 + 30 + 25]);
    expect(out[75]).toBe(20);
  });
});
