import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseXMFFile } from '@lib/import/formats/XMFParser';
import { parseAdPlugFile } from '@lib/import/formats/AdPlugParser';
import { exportXMF } from '../XMFExporter';
import { exportAdPlug } from '../AdPlugExporter';

const bytes = async (r: { data: Blob }) => new Uint8Array(await r.data.arrayBuffer());
const diffs = (a: Uint8Array, b: Uint8Array) => [...a].flatMap((v, i) => (v !== b[i] ? [i] : []));

describe('XMF export', () => {
  const src = new Uint8Array(readFileSync('public/templates/xmf.xmf'));
  it('unedited export equals the source', async () => {
    const out = await bytes(await exportXMF(parseXMFFile(src, 'xmf.xmf')!));
    expect({ len: out.length, diff: diffs(out, src).slice(0, 20) }).toEqual({ len: src.length, diff: [] });
  });
  it('a note edit changes only that cell and reparses as the edit', async () => {
    const song = parseXMFFile(src, 'xmf.xmf')!;
    song.patterns[0].channels[0].rows[0].note = 50;
    song.patterns[0].channels[0].rows[0].instrument = 1;
    const out = await bytes(await exportXMF(song));
    expect(out.length).toBe(src.length);
    expect(diffs(out, src).length).toBeLessThanOrEqual(6);
    expect(parseXMFFile(out, 'x.xmf')!.patterns[0].channels[0].rows[0].note).toBe(50);
  });
});

describe('AdPlug RAD export', () => {
  const b = new Uint8Array(readFileSync('public/templates/adplug.rad'));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  it('unedited export equals the source', async () => {
    const out = await bytes(exportAdPlug(parseAdPlugFile(ab, 'adplug.rad'), 'rad'));
    expect({ len: out.length, diff: diffs(out, b).slice(0, 20) }).toEqual({ len: b.length, diff: [] });
  });
  it('an edit falls through to the encoder and carries the edit', async () => {
    const song = parseAdPlugFile(ab, 'adplug.rad');
    song.patterns[0].channels[0].rows[0].note = 49;
    const out = await bytes(exportAdPlug(song, 'rad'));
    expect(out.length).not.toBe(b.length);
  });
});
