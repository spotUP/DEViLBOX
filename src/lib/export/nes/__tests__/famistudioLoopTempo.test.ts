import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFurnaceSong } from '../../../import/formats/FurnaceSongParser';
import { furnaceToFamistudio, type FamistudioSong } from '../famistudioSong';

const convert = async (name: string): Promise<FamistudioSong> => {
  const fur = readFileSync(path.resolve(import.meta.dirname, '../../../../../public/data/songs/furnace/nes', name));
  return furnaceToFamistudio(await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length) as ArrayBuffer), 0, 0x2000);
};

describe('FamiStudio export: loop pass and mid-song tempo', () => {
  // Famitune1 (56 Hz) is over the 16 KiB area with the loop pass on all 8 channels. Dropping the whole pass made both
  // pulses replay first-pass arp phases after the loop (614 bad frames each in tools/nes-famistudio-check.ts).
  it('Famitune1 keeps the loop pass on the 2A03 pulses and triangle when it does not fit on every channel', async () => {
    const song = await convert('Famitune1.fur');
    expect(song.music.length).toBeLessThanOrEqual(16384);
    expect(song.fme7).toBeFalsy();
    const kept = song.lossy.map((l) => /loop pass kept on channels 1-(\d+)/.exec(l)?.[1]).find(Boolean);
    expect(kept === undefined || Number(kept) >= 3).toBe(true);
    expect(song.sizes.streams[0]).toBeGreaterThan(1900); // pulse 1 with its loop pass (1988 bytes; far less without)
  }, 300_000);

  // Byte-Sized Bop: FD68 on order 8 slows the rows by 155/104; ignoring it put every later row on the wrong frame.
  it('Byte-Sized Bop applies the FDxx virtual tempo change', async () => {
    const song = await convert('Byte-Sized Bop.fur');
    expect(song.lossy.filter((l) => l.includes('virtual tempo'))).toEqual([]);
  }, 300_000);
});
