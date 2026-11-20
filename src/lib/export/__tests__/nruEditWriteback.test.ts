import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

async function load() {
  const { parseNRUFile } = await import('@lib/import/formats/NRUParser');
  const raw = readFileSync('public/data/songs/formats/howiedavies.nru');
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  return { raw: new Uint8Array(ab), song: (await parseNRUFile(ab, 'howiedavies.nru'))! };
}
async function save(song: Awaited<ReturnType<typeof load>>['song']) {
  const { exportNRU } = await import('../NRUExporter');
  return new Uint8Array(await (await exportNRU(song)).data.arrayBuffer());
}

describe('NRU edit write-back into the original module', () => {
  it('an unedited song exports byte-identical to the source', async () => {
    const { raw, song } = await load();
    expect(await save(song)).toEqual(raw);
  });

  it('a note edit changes only that cell (4 bytes) and re-imports', async () => {
    const { raw, song } = await load();
    const cell = song.patterns[0].channels[0].rows[1];
    delete cell.period; delete cell.pan; delete cell.cutoff; // an edited grid cell has no source-byte carriers
    cell.note = 49; cell.instrument = 2; cell.effTyp = 0; cell.eff = 0;
    const out = await save(song);
    expect(out.length).toBe(raw.length);
    const diff: number[] = [];
    for (let i = 0; i < raw.length; i++) if (out[i] !== raw[i]) diff.push(i);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every(i => i >= 1084 + 1 * 16 && i < 1084 + 1 * 16 + 4)).toBe(true);
    const { parseNRUFile } = await import('@lib/import/formats/NRUParser');
    const re = (await parseNRUFile(out.buffer.slice(0) as ArrayBuffer, 'howiedavies.nru'))!;
    expect(re.patterns[0].channels[0].rows[1].note).toBe(49);
    expect(re.patterns[0].channels[0].rows[1].instrument).toBe(2);
  });
});
