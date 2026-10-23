/**
 * Regression: SoundFX had two disagreeing cell codecs. The import loop invented a volume column
 * and dropped effects 3/5/6 params; the UADE decode/encode pair used a ProTracker effect map.
 * Both now go through soundfxCellCodec.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSoundFXFile } from '../SoundFXParser';
import { exportSoundFX } from '@/lib/export/SoundFXExporter';
import { decodeSoundFXCell, encodeSoundFXCell } from '@engine/uade/encoders/soundfxCellCodec';

const FILES = [
  'public/data/songs/formats/operation_stealth.sfx',
  'public/data/songs/soundfx/batdance.sfx',
  'public/data/songs/soundfx/distancia al ano.sfx',
];

function load(rel: string): { ab: ArrayBuffer; raw: Uint8Array } {
  const b = readFileSync(join(process.cwd(), rel));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { ab, raw: new Uint8Array(ab) };
}

let param3Total = 0;

describe('SoundFX shared cell codec', () => {
  it('imported SoundFX note cells have no invented volume', async () => {
    const { ab } = load('public/data/songs/soundfx/batdance.sfx');
    const song = await parseSoundFXFile(ab, 'batdance.sfx');
    let cells = 0;
    for (const p of song!.patterns) for (const ch of p.channels) for (const c of ch.rows) {
      expect(c.volume).toBe(0);
      cells++;
    }
    expect(cells).toBeGreaterThan(0);
  });

  it('import cells equal the shared decoder of the raw bytes', async () => {
    const { ab, raw } = load(FILES[0]);
    const song = await parseSoundFXFile(ab, 'operation_stealth.sfx');
    const base = song!.uadePatternLayout!.patternDataFileOffset;
    // Pattern i of the song = source pattern with the i-th smallest index used in the order.
    const used = [...new Set(Array.from(raw.subarray(532, 532 + raw[530])))].sort((a, b) => a - b);
    let n = 0;
    song!.patterns.forEach((pat, pi) => {
      for (let ch = 0; ch < 4; ch++) for (let row = 0; row < 64; row++) {
        const off = base + (used[pi] * 256 + row * 4 + ch) * 4;
        expect(pat.channels[ch].rows[row]).toEqual(decodeSoundFXCell(raw.subarray(off, off + 4), 'v1'));
        n++;
      }
    });
    expect(n).toBeGreaterThan(0);
  });

  it.each(FILES)('export of an imported song is byte-exact over the pattern region: %s', async (rel) => {
    const { ab, raw } = load(rel);
    const song = (await parseSoundFXFile(ab, 'x.sfx'))!;
    const out = new Uint8Array(await (await exportSoundFX(song)).data.arrayBuffer());
    const len = raw[530];
    expect(out[530]).toBe(len);
    const srcBase = song.uadePatternLayout!.patternDataFileOffset;
    let withParam3 = 0;
    for (let i = 0; i < len; i++) {
      const src = raw[532 + i];
      const dst = out[532 + i];
      const a = raw.subarray(srcBase + src * 1024, srcBase + src * 1024 + 1024);
      const b = out.subarray(660 + dst * 1024, 660 + dst * 1024 + 1024);
      expect([...b], `position ${i}`).toEqual([...a]);
      for (let k = 0; k < 1024; k += 4) if ((a[k + 2] & 0x0F) === 3 && a[k + 3] !== 0) withParam3++;
    }
    param3Total += withParam3;
  });

  it('corpus exercises effect 3 with a non-zero param', () => {
    expect(param3Total).toBeGreaterThan(0);
  });

  it('edited effect re-encodes with SoundFX semantics', () => {
    const cell = decodeSoundFXCell(new Uint8Array([0x01, 0xAC, 0x13, 0x00]), 'v1');
    const edited = { ...cell, sfxEffect: undefined, sfxEffectArg: undefined, effTyp: 0x00, eff: 0x37 };
    const bytes = encodeSoundFXCell(edited, 'v1');
    expect(bytes[2] & 0x0F).toBe(1);
    expect(bytes[3]).toBe(0x37);
    // Carrier present but display changed: also re-encoded.
    const stale = { ...cell, effTyp: 0x00, eff: 0x37 };
    expect([...encodeSoundFXCell(stale, 'v1').subarray(2)]).toEqual([0x11, 0x37]);
  });

  it('v2 samples 16-31 keep bit 12 of the note word', () => {
    const bytes = new Uint8Array([0x11, 0xAC, 0x20, 0x00]);
    const cell = decodeSoundFXCell(bytes, 'v2');
    expect(cell.instrument).toBe(18);
    expect([...encodeSoundFXCell(cell, 'v2')]).toEqual([...bytes]);
  });
});
