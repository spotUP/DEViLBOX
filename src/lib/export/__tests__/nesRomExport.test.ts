/**
 * NES ROM export (Phase 11): a real NES-family .fur gives title, author and chips; a synthetic capture (the worklet is
 * not available headless) goes through buildNesRom. Checks the iNES header, PRG, the title bytes and an APU boot in Mesen2.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFurnaceSong, convertFurnaceToDevilbox } from '../../import/formats/FurnaceSongParser';
import type { NesCapture, NesEvent } from '../nes/nesCapture';
import { buildNesRom, nesChipsOf, nesRomExportAvailable, nesTempoWarning } from '../nes/nesExport';
import type { NesPlayer } from '../nes/nesCartridge';
import { MESEN, mesen } from './nesMesenHarness';

const FUR = join(__dirname, '../../../../public/data/songs/furnace/nes/Fur_Nes.fur');
const ROM = join(__dirname, '../../../../public/nes/player.bin');
const META = join(__dirname, '../../../../public/nes/player.json');
const ready = existsSync(FUR) && existsSync(ROM) && existsSync(META);

const SR = 48000, TR = 60;
const w = (tick: number, addr: number, value: number): NesEvent => ({ kind: 'write', chip: 'nes', sample: Math.round(tick * SR / TR), addr, value });
const capture = (): NesCapture => ({ events: [w(0, 0x4015, 0x0f), w(0, 0x4000, 0xbf), w(0, 0x4002, 0xa9), w(0, 0x4003, 0x01), w(3, 0x4000, 0x9f)], sampleRate: SR, tickRateHz: TR });

describe.skipIf(!ready)('NES ROM export', () => {
  it('builds a valid ROM with the song title from a real .fur', async () => {
    const buf = readFileSync(FUR);
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const { furnaceNative } = convertFurnaceToDevilbox(module, 0);
    expect(nesRomExportAvailable(furnaceNative?.chipIds, furnaceNative?.chipFlags)).toBe(true);
    const chips = nesChipsOf(furnaceNative?.chipIds, furnaceNative?.chipFlags);
    const title = (module.name || 'SONG').slice(0, 16);
    const player: NesPlayer = { ...JSON.parse(readFileSync(META, 'utf8')), bytes: Uint8Array.from(readFileSync(ROM)) };
    const r = buildNesRom([{ ntsc: capture() }], player, { title, author: module.author || undefined, chips });
    expect(String.fromCharCode(...r.rom.subarray(0, 4))).toBe('NES\x1a');
    expect(r.rom[4]).toBeGreaterThan(0); // PRG banks
    expect(r.rom.length).toBeGreaterThan(16);
    expect(r.streamBytes).toBeGreaterThan(0);
    const text = Buffer.from(r.rom).toString('latin1');
    expect(text).toContain(title.toUpperCase().replace(/[^\x20-\x5F]/g, ' ').trimEnd());
  }, 60000);

  it('warns when the tick rate is not the frame rate', () => {
    expect(nesTempoWarning(150, ['ntsc'])).toBeNull(); // 60 Hz
    expect(nesTempoWarning(100, ['ntsc'])).not.toBeNull();
  });

  it.skipIf(!existsSync(MESEN))('boots in Mesen2 and writes the APU', () => {
    const player: NesPlayer = { ...JSON.parse(readFileSync(META, 'utf8')), bytes: Uint8Array.from(readFileSync(ROM)) };
    const r = buildNesRom([{ ntsc: capture() }], player, { title: 'TEST', chips: ['nes'] });
    const out = mesen(r.rom, 6);
    expect(out.writes.flat().length).toBeGreaterThan(0);
  }, 60000);
});
