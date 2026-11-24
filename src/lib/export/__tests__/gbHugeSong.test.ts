// hUGEDriver Game Boy route: converter output shape on a real GB song, and the staleness guard
// (public/gb/huge-player.gb must be rebuilt with tools/build-gb-player.sh when a player or driver source changes).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
import { buildHugeRom, furnaceToHuge, HUGE_SONG_BASE, type HugePlayerMeta } from '../gb/hugeSong';

const ROOT = join(__dirname, '../../../..');
const META = JSON.parse(readFileSync(join(ROOT, 'public/gb/huge-player.json'), 'utf8')) as HugePlayerMeta & { sources: string[] };

describe('hUGEDriver Game Boy export', () => {
  it('player binary matches its sources (rebuild with tools/build-gb-player.sh)', () => {
    const h = createHash('sha1');
    for (const s of META.sources) h.update(readFileSync(join(ROOT, s)));
    expect(h.digest('hex')).toBe(META.sourceHash);
    expect(META.songAddress).toBe(HUGE_SONG_BASE);
  });

  it('converts cheap.fur into a song whose pointers stay inside the song area', async () => {
    const fur = readFileSync(join(ROOT, 'public/data/songs/furnace/gameboy/cheap.fur'));
    const song = furnaceToHuge(await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length)));
    expect(song.orders).toBe(28 * 2); // 28 Furnace orders of 128 rows -> 2 hUGE orders of 64 rows each
    expect(song.lossy.length).toBeGreaterThan(0);
    const end = HUGE_SONG_BASE + song.blob.length;
    for (let i = 1; i < 23; i += 2) { // descriptor: tempo byte, then 11 little-endian pointers
      const p = song.blob[i] | (song.blob[i + 1] << 8);
      expect(p).toBeGreaterThanOrEqual(HUGE_SONG_BASE);
      expect(p).toBeLessThan(end);
    }
    const player = readFileSync(join(ROOT, 'public/gb/huge-player.gb'));
    const rom = buildHugeRom(player, META, song.blob, song.screen);
    let sum = 0;
    for (let i = 0; i < rom.length; i++) if (i !== 0x14e && i !== 0x14f) sum = (sum + rom[i]) & 0xffff;
    expect((rom[0x14e] << 8) | rom[0x14f]).toBe(sum);
  });

  it('lagtrain.fur: 11xx noise length becomes a per-width noise instrument, not a lossy item', async () => {
    const fur = readFileSync(join(ROOT, 'public/data/songs/furnace/gameboy/lagtrain.fur'));
    const song = furnaceToHuge(await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length)));
    expect(song.lossy.filter((l) => l.startsWith('effect 11'))).toEqual([]);
  });

  it('lagtrain.fur with 13xx / 14xx on channel 1: sweep maps to hUGE 6xy, which a routine writes to NR10', async () => {
    const fur = readFileSync(join(ROOT, 'public/data/songs/furnace/gameboy/lagtrain.fur'));
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    const rows = m.patterns.get(`0_0_${m.subsongs[0].orders[0][0]}`)!.rows;
    // 13xx sets time and shift (bit 7 dropped), 14xx sets the direction bit on top: 0x35 then 0x3D
    for (const [r, type, value] of [[3, 0x13, 0xb5], [5, 0x14, 0x01]] as const) { rows[r].effects = [{ type, value }]; rows[r].volume = -1; }
    const song = furnaceToHuge(m);
    expect(song.lossy.filter((l) => /^effect 1[34]/.test(l))).toEqual([]);
    const b = song.blob;
    const cell = (v: number) => { for (let i = 0; i + 2 < b.length; i++) if ((b[i + 1] & 15) === 6 && b[i + 2] === v) return true; return false; };
    expect(cell(0x35) && cell(0x3d)).toBe(true);
    expect(b.join(',')).toContain('192,121,224,16,201'); // routine: ret nz; ld a,c; ldh [$10],a; ret
  });

  it('lagtrain.fur: a note with a volume beside an effect carries the volume in an instrument variant', async () => {
    const fur = readFileSync(join(ROOT, 'public/data/songs/furnace/gameboy/lagtrain.fur'));
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    // Drop every other volume column so only the cell below can raise the item.
    for (const p of m.patterns.values()) for (const r of p.rows) r.volume = -1;
    // A fresh note + instrument + volume + effect cell on the noise channel (instrument 0 has no volume macro here).
    const rows = m.patterns.get(`0_3_${m.subsongs[0].orders[3][0]}`)!.rows;
    const noMacro = m.instruments.findIndex((i) => !i.macros.some((x) => x.code === 0 && x.length > 0));
    Object.assign(rows[1], { note: 5, octave: 4, instrument: noMacro, volume: 7, effects: [{ type: 0x0f, value: 3 }] });
    const song = furnaceToHuge(m);
    expect(song.lossy.filter((l) => l.startsWith('volume column beside an effect'))).toEqual([]);
    expect(song.lossy.filter((l) => l.includes('instrument repeat'))).toEqual([]);
  });

  it("You're_Doing_Well!.fur: a start-volume variant on a 12xx-set channel carries that duty (no duty reset)", async () => {
    const fur = readFileSync(join(ROOT, "public/data/songs/furnace/gameboy/You're_Doing_Well!.fur"));
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    // Song as is: the instrument-4 arpeggio on channel 2 repeats with volume + 12xx; none of it is a duty reset now.
    expect(furnaceToHuge(m).lossy.filter((l) => l.includes('duty reset'))).toEqual([]);
    // Only these cells keep a volume: 12x1 sets duty 1, then a repeat of macro-less instrument 4 with volume 7 beside a
    // speed effect must reload as a variant whose NR11 duty is 1 (Furnace keeps chan.duty), not the default 2.
    for (const p of m.patterns.values()) for (const r of p.rows) r.volume = -1;
    expect(m.instruments[4].macros.some((x) => x.length > 0)).toBe(false);
    const rows = m.patterns.get(`0_1_${m.subsongs[0].orders[1][2]}`)!.rows;
    Object.assign(rows[0], { note: 5, octave: 4, instrument: 4, volume: -1, effects: [{ type: 0x12, value: 1 }] });
    Object.assign(rows[1], { note: 7, octave: 4, instrument: 4, volume: 7, effects: [{ type: 0x0f, value: 3 }] });
    const song = furnaceToHuge(m);
    expect(song.lossy.filter((l) => l.includes('duty reset') || l.startsWith('volume column beside an effect'))).toEqual([]);
    const dutyAt = (song.blob[11] | (song.blob[12] << 8)) - HUGE_SONG_BASE;
    const slots = Array.from({ length: 15 }, (_, i) => song.blob.slice(dutyAt + i * 6, dutyAt + i * 6 + 6));
    expect(slots.some((b) => b[1] >> 6 === 1 && b[2] >> 4 === 7)).toBe(true);
  });

  it('lagtrain.fur: start-volume variants never push a plain instrument past the 15 hUGE slots', async () => {
    const fur = readFileSync(join(ROOT, 'public/data/songs/furnace/gameboy/lagtrain.fur'));
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    const lossy = furnaceToHuge(m).lossy;
    expect(lossy.filter((l) => l.includes('instruments past 15'))).toEqual([]);
    // The variants that no longer fit fall back to the plain instrument and report the dropped volume.
    expect(lossy.some((l) => l.includes('no free instrument slot'))).toBe(true);
  });

  it('noise arpeggios past the noise table or with fixed steps export as absolute-note instrument variants', async () => {
    // puggs_in_space: C-0 noise notes with fixed-note arp macros; lagtrain: arps that run past either end of
    // gb.cpp noiseTable (NR43 0x00). Each such note gets a variant whose table holds the exact hUGE noise notes.
    for (const name of ['puggs_in_space.fur', 'lagtrain.fur']) {
      const fur = readFileSync(join(ROOT, `public/data/songs/furnace/gameboy/${name}`));
      const lossy = furnaceToHuge(await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length))).lossy;
      expect(lossy.filter((l) => l.includes('note outside') || l.includes('fixed-note arpeggio'))).toEqual([]);
    }
  });
});
