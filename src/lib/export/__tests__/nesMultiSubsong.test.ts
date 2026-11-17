/** NES ROM with several subsongs: the player table holds one entry per subsong and the start screen count is patched. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NesCapture, NesEvent } from '../nes/nesCapture';
import type { NesPlayer } from '../nes/nesCartridge';
import { buildNesRom } from '../nes/nesExport';
import { decodeNesStream, encodeNesStreams } from '../nes/nesStream';

const ROM = join(__dirname, '../../../../public/nes/player.bin');
const META = join(__dirname, '../../../../public/nes/player.json');
const SR = 48000, TR = 60;
const w = (tick: number, addr: number, value: number): NesEvent => ({ kind: 'write', chip: 'nes', sample: Math.round(tick * SR / TR), addr, value });
const cap = (v: number): NesCapture => ({ events: [w(0, 0x4015, 0x0f), w(0, 0x4002, v), w(2, 0x4003, 0x01)], sampleRate: SR, tickRateHz: TR });

describe('NES multi-subsong build', () => {
  it('encodes one stream per subsong with distinct content', () => {
    const regions = encodeNesStreams([{ ntsc: cap(0x11) }, { ntsc: cap(0x22) }, { ntsc: cap(0x33) }], 4096);
    expect(regions.ntsc[0]).toBe(3);
    const writes = [0, 1, 2].map((i) => JSON.stringify(decodeNesStream(regions.ntsc, i, 4096)));
    expect(new Set(writes).size).toBe(3);
  });

  it.skipIf(!existsSync(ROM) || !existsSync(META))('builds a ROM holding three subsongs, larger than one', () => {
    const player: NesPlayer = { ...JSON.parse(readFileSync(META, 'utf8')), bytes: Uint8Array.from(readFileSync(ROM)) };
    const info = { title: 'MULTI', chips: ['nes'] };
    const one = buildNesRom([{ ntsc: cap(0x11) }], player, info);
    const three = buildNesRom([{ ntsc: cap(0x11) }, { ntsc: cap(0x22) }, { ntsc: cap(0x33) }], player, info);
    expect(String.fromCharCode(...three.rom.subarray(0, 4))).toBe('NES\x1a');
    expect(three.streamBytes).toBeGreaterThan(one.streamBytes);
  });
});
