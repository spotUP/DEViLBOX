/**
 * Images Music System export writes the original file back byte for byte, and a
 * cell edit reloads as that edit.
 *
 * redoctober-sub-docking.ims has unlooped samples (loopLen word = 1). The parser
 * gives them loopEnd = sample length (createSamplerInstrument default), so the
 * exporter must read sample.loop, not loopEnd > loopStart, or it writes the
 * sample length into the loop-length word.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseIMSFile } from '@/lib/import/formats/IMSParser';
import { exportIMS } from '../IMSExporter';

const FIXTURE = 'public/data/songs/formats/redoctober-sub-docking.ims';

async function parse(bytes: Uint8Array) {
  return parseIMSFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'redoctober-sub-docking.ims');
}

async function exportBytes(song: Awaited<ReturnType<typeof parse>>): Promise<Uint8Array> {
  return new Uint8Array(await (await exportIMS(song)).data.arrayBuffer());
}

describe('Images Music System export', () => {
  it('unedited export is byte-exact', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const out = await exportBytes(await parse(raw));
    expect(out.length).toBe(raw.length);
    expect(Buffer.compare(Buffer.from(out), Buffer.from(raw))).toBe(0);
  });

  it('one note edit changes only that cell and reloads as the edit', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parse(raw);
    const cell = song.patterns[0].channels[0].rows[0];
    const edited = cell.note === 37 ? 49 : 37;
    cell.note = edited;
    if (!cell.instrument) cell.instrument = 1;
    const out = await exportBytes(song);
    expect(out.length).toBe(raw.length);
    const diffs: number[] = [];
    for (let i = 0; i < raw.length; i++) if (out[i] !== raw[i]) diffs.push(i);
    expect(diffs.length).toBeGreaterThan(0);
    // Cell 0 of pattern 0 sits at 1084 (header), 3 bytes.
    expect(diffs.every((i) => i >= 1084 && i < 1087)).toBe(true);
    const back = await parse(out);
    expect(back.patterns[0].channels[0].rows[0].note).toBe(edited);
  });
});
