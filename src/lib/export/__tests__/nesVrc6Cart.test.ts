/** VRC6 original cartridge (iNES mapper 24): header, 8 KB stream banks, fixed player bank last, refusals. The Mesen2 bus-write check is `tools/nes-rom-check.ts --target vrc6cart`. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NesCapture, NesChip, NesEvent } from '../nes/nesCapture';
import { buildVrc6Cartridge, type NesPlayer } from '../nes/nesCartridge';

const DIR = join(__dirname, '../../../../public/nes');
const ready = existsSync(join(DIR, 'player24.bin'));
const SR = 48000, TR = 60;
const w = (tick: number, chip: NesChip, addr: number, value: number): NesEvent => ({ kind: 'write', chip, sample: Math.round(tick * SR / TR), addr, value });
const cap = (events: NesEvent[], tickRateHz = TR): NesCapture => ({ events, sampleRate: SR, tickRateHz });
const player = (): NesPlayer => ({ ...JSON.parse(readFileSync(join(DIR, 'player24.json'), 'utf8')), bytes: Uint8Array.from(readFileSync(join(DIR, 'player24.bin'))) });
const song = (chip: NesChip, ticks = 1500) => cap(Array.from({ length: ticks }, (_, t) => [w(t, 'nes', 0x4002, t & 255), w(t, chip, chip === 'vrc6' ? 0x9001 : 0x5002, (t * 5) & 255)]).flat());

describe.skipIf(!ready)('VRC6 cartridge (mapper 24)', () => {
  it('emits a mapper-24 image with the player in the last 8 KB', () => {
    const p = player();
    const { rom, banks } = buildVrc6Cartridge([{ ntsc: song('vrc6') }], p, 'vrc6 test');
    expect(String.fromCharCode(...rom.subarray(0, 3))).toBe('NES');
    expect(((rom[7] & 0xf0) | (rom[6] >> 4))).toBe(24);
    expect(rom[4] * 16384).toBe(rom.length - 16);
    expect(banks % 2).toBe(0);
    expect(rom.length - 16).toBeGreaterThan(3 * 8192); // several stream banks
    expect(Array.from(rom.subarray(rom.length - 6))).toEqual(Array.from(p.bytes.subarray(p.size - 6)));
  });
  it('refuses other chips and non-frame tick rates', () => {
    expect(() => buildVrc6Cartridge([{ ntsc: song('mmc5', 10) }], player())).toThrow(/2A03 and VRC6 only/);
    expect(() => buildVrc6Cartridge([{ ntsc: cap(song('vrc6', 10).events, 75) }], player())).toThrow(/frame rate/);
  });
});

describe.skipIf(!existsSync(join(DIR, 'player26.bin')))('VRC6b cartridge (mapper 26)', () => {
  it('emits a mapper-26 image; the Mesen2 bus check is `tools/nes-rom-check.ts --target vrc6bcart`', () => {
    const p: NesPlayer = { ...JSON.parse(readFileSync(join(DIR, 'player26.json'), 'utf8')), bytes: Uint8Array.from(readFileSync(join(DIR, 'player26.bin'))) };
    const { rom } = buildVrc6Cartridge([{ ntsc: song('vrc6') }], p, 'vrc6b test');
    expect(((rom[7] & 0xf0) | (rom[6] >> 4))).toBe(26);
  });
});
