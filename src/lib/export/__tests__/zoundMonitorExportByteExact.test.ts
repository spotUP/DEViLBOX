import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseZoundMonitorFile } from '@lib/import/formats/ZoundMonitorParser';
import { exportZoundMonitor } from '../ZoundMonitorExporter';

const FILE = 'public/data/songs/zoundmonitor/sonjavanveen.sng';
const load = async () => {
  const b = readFileSync(FILE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { b, ab, song: await parseZoundMonitorFile(ab, 'sonjavanveen.sng') };
};
const run = async (song: Awaited<ReturnType<typeof load>>['song']) =>
  new Uint8Array(await (await exportZoundMonitor(song)).data.arrayBuffer());

describe('ZoundMonitor export', () => {
  it('unedited export equals the source', async () => {
    const { b, song } = await load();
    const out = await run(song);
    const diff = [...out].flatMap((v, i) => (v !== b[i] ? [i] : []));
    expect({ len: out.length, diff: diff.slice(0, 40) }).toEqual({ len: b.length, diff: [] });
  });

  it('a note edit changes one cell word and reparses as the edit', async () => {
    const { b, ab, song } = await load();
    const cell = song.patterns[0].channels[0].rows[0];
    cell.note = cell.note === 25 ? 37 : 25;
    cell.instrument = 1;
    const out = await run(song);
    const diff = [...out].flatMap((v, i) => (v !== b[i] ? [i] : []));
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.length).toBeLessThanOrEqual(4);
    expect(ab.byteLength).toBe(out.length);
    const back = await parseZoundMonitorFile(out.buffer as ArrayBuffer, 'x.sng');
    expect(back.patterns[0].channels[0].rows[0].note).toBe(cell.note);
  });
});
