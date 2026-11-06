/**
 * Jochen Hippel CoSo: the parameter byte that follows a note's info byte (bit 5 = portamento rate, bit 6 = replacement frequency
 * sequence, hippel.c step_voice) shows in the grid's effect column as P / F, loaded through the import entry point, and an edit of
 * it writes that one byte back into the module.
 *
 * Values read from the decoder run on prehistoric_tale.hipc: pattern 12, channel 3, row 0 plays note 27, instrument 4 with
 * Portamento 02; the song holds 5 such cells. Speed changes (FE / FD) are not shown here: they shift the row timing.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HC_FX, commandStreamEffectToString } from '../formats/commandStreamEffectGlyphs';
import { xmEffectToString } from '@/lib/xmConversions';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/HippelCoSoParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/HippelCoSoParser')>();
  return { ...orig, parseHippelCoSoFile: (...a: Parameters<typeof orig.parseHippelCoSoFile>) => { sentinel.calls++; return orig.parseHippelCoSoFile(...a); } };
});

const NAME = 'prehistoric_tale.hipc';

async function load() {
  const { parseModuleToSong } = await import('../parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME)));
  const before = sentinel.calls;
  const song = await parseModuleToSong(new File([raw], NAME));
  expect(sentinel.calls).toBeGreaterThan(before);
  return song;
}

describe('Hippel CoSo note parameter effect column', () => {
  it('shows Portamento beside the note that carries it', async () => {
    const song = await load();
    const c = song.patterns[12].channels[3].rows[0];
    expect([c.note, c.instrument, c.effTyp, c.eff]).toEqual([27, 4, HC_FX.portamento, 2]);
    expect(commandStreamEffectToString(c.effTyp, c.eff)).toBe('P02');
    expect(xmEffectToString(c.effTyp, c.eff)).toBe('P02');
    let n = 0;
    for (const p of song.patterns) for (const ch of p.channels) for (const r of ch.rows) if (r.effTyp === HC_FX.portamento) n++;
    expect(n).toBe(5);
  });

  it('writes an edited parameter back as that one byte, and leaves an unedited song untouched', async () => {
    const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME)));
    const { rebuildHippelModule } = await import('@/engine/hippel/rebuildHippelModule');
    const { mapHippelCoSoCells, parseHippelCoSoFile } = await import('../formats/HippelCoSoParser');
    const song = await parseHippelCoSoFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), NAME);
    const orig = new Uint8Array(song.hippelFileData!);
    const n = song.instruments.length;
    const same = rebuildHippelModule(song.hippelFileData!, song.patterns, n)!;
    expect(same.written).toBe(0);

    song.patterns[12].channels[3].rows[0].eff = 9;
    const out = rebuildHippelModule(song.hippelFileData!, song.patterns, n)!;
    expect(out.refused).toEqual([]);
    expect(out.written).toBe(1);
    const diff: number[] = [];
    out.bytes.forEach((b, i) => { if (b !== orig[i]) diff.push(i); });
    const span = mapHippelCoSoCells(orig, n)[12][3][0]!;
    expect(diff).toEqual([span.offset + span.length - 1]);
    expect(out.bytes[diff[0]]).toBe(9);
    const again = await parseHippelCoSoFile(out.bytes.buffer as ArrayBuffer, NAME);
    expect(again.patterns[12].channels[3].rows[0].eff).toBe(9);
  });
});
