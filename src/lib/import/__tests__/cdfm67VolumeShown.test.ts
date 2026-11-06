/**
 * Composer 670 volume commands (the per-note volume nibble and the volume-only command 0x20+channel) already show in the grid's
 * volume column and write back through the encoder; the FX-display survey listed them as a gap by mistake.
 *
 * Values read from the decoder run on amnesia_credits.c67: voice 4 row 0 of pattern 0 plays note 46, instrument 33 at volume 64.
 * No song in public/data/songs holds a volume-only command, so the write-back of that command is checked on the encoder.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeC67SingleChannel } from '@/engine/uade/encoders/CDFM67Encoder';
import type { TrackerCell } from '@/types';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/CDFM67Parser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/CDFM67Parser')>();
  return { ...orig, parseCDFM67File: (...a: Parameters<typeof orig.parseCDFM67File>) => { sentinel.calls++; return orig.parseCDFM67File(...a); } };
});

const empty = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

describe('Composer 670 volume column', () => {
  it('shows the note volume nibble through the import route (amnesia_credits.c67)', async () => {
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/amnesia_credits.c67')));
    const before = sentinel.calls;
    const song = await parseModuleToSong(new File([raw], 'amnesia_credits.c67'));
    expect(sentinel.calls).toBeGreaterThan(before);
    const c = song.patterns[0].channels[4].rows[0];
    expect([c.note, c.instrument, c.volume]).toEqual([46, 33, 64]);
  });

  it('writes a volume-only cell as the 0x20+channel command and a noted cell with the volume nibble', () => {
    const rows = [empty(), { ...empty(), volume: 36 }];
    expect(Array.from(encodeC67SingleChannel(rows, 2))).toEqual([0x22, 0x08]);
    const noted = encodeC67SingleChannel([{ ...empty(), note: 46, instrument: 2, volume: 64 }], 2);
    expect(noted[2] & 0x0F).toBe(0x0F);
  });
});
