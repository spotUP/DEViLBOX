/**
 * SoundFX export writes the original file back byte for byte, and a cell edit
 * reloads as that edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSoundFXFile } from '@/lib/import/formats/SoundFXParser';
import { exportSoundFX } from '../SoundFXExporter';

const FIXTURE = 'public/data/songs/soundfx/operation_stealth.sfx';

async function parse(bytes: Uint8Array) {
  return parseSoundFXFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'operation_stealth.sfx');
}

async function exportBytes(song: Awaited<ReturnType<typeof parse>>): Promise<Uint8Array> {
  return new Uint8Array(await (await exportSoundFX(song)).data.arrayBuffer());
}

function diffOffsets(a: Uint8Array, b: Uint8Array): number[] {
  const d: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d.push(i);
  return d;
}

describe('SoundFX export', () => {
  it('unedited export is byte-exact', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const out = await exportBytes(await parse(raw));
    expect(out.length).toBe(raw.length);
    expect(diffOffsets(out, raw)).toEqual([]);
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
    const diffs = diffOffsets(out, raw);
    expect(diffs.length).toBeGreaterThan(0);
    // Parser dedups patterns sorted by source index; pattern 0 = lowest referenced.
    const srcIdx = Math.min(...Array.from(raw.subarray(532, 532 + raw[530])));
    const base = 660 + srcIdx * 256 * 4;
    expect(diffs.every((i) => i >= base && i < base + 4)).toBe(true);
    const back = await parse(out);
    expect(back.patterns[0].channels[0].rows[0].note).toBe(edited);
  });
});
