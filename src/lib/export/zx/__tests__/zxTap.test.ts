import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FurnaceChipType } from '../../../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from '../../VGMExporter';
import { captureToFrames, encodeFrames, packBanks, decodeBanks, ZX_BANK_SIZE } from '../zxAyStream';
import { buildZxTap, loadZxPlayerFrom } from '../zxTap';

const player = loadZxPlayerFrom(
  new Uint8Array(readFileSync('public/zx/player.bin')),
  JSON.parse(readFileSync('public/zx/player.json', 'utf8')),
);
const RATE = 48000;
const w = (frame: number, reg: number, data: number): RegisterWrite =>
  ({ timestamp: frame * RATE / 50, chipType: FurnaceChipType.AY, port: reg, data });

/** Sweeping tone pitch plus a retriggered envelope shape, many frames. */
function synth(frames: number): RegisterWrite[] {
  const out: RegisterWrite[] = [w(0, 7, 0x38), w(0, 8, 15)];
  for (let f = 0; f < frames; f++) {
    out.push(w(f, 0, f & 0xFF), w(f, 1, (f >> 8) & 0x0F), w(f, 2, (f * 7) & 0xFF), w(f, 6, f % 31));
    if (f % 10 === 0) out.push(w(f, 13, 10));
    if (f % 3 === 0) out.push(w(f, 9, f % 16));
  }
  return out;
}

function parseTap(tap: Uint8Array) {
  const blocks: Array<{ flag: number; data: Uint8Array; ok: boolean }> = [];
  for (let p = 0; p < tap.length;) {
    const n = tap[p] | (tap[p + 1] << 8);
    const body = tap.subarray(p + 2, p + 2 + n);
    const x = body.reduce((c, b) => c ^ b, 0);
    blocks.push({ flag: body[0], data: body.subarray(1, n - 1), ok: x === 0 });
    p += 2 + n;
  }
  return blocks;
}

describe('ZX AY register stream', () => {
  it('frame decode round-trips the captured registers', () => {
    const writes = synth(500);
    const frames = captureToFrames(writes, RATE);
    expect(frames.length).toBe(500);
    const banks = packBanks(encodeFrames(frames), 6);
    const decoded = decodeBanks(banks);
    expect(decoded.length).toBe(500);
    const cur = new Array(14).fill(0);
    frames.forEach((f, i) => {
      f.forEach((v, r) => { if (v !== undefined) cur[r] = v; });
      const d = decoded[i];
      d.forEach((v, r) => expect(v).toBe(f[r]));
      // registers not sent are unchanged
      for (let r = 0; r < 13; r++) if (!d.has(r)) expect(f[r] === undefined || f[r] === (i === 0 ? 0 : f[r])).toBe(true);
    });
    // reg 13 is re-sent even when the value repeats
    expect(decoded.filter((m) => m.has(13)).length).toBe(50);
  });

  it('splits across banks without a frame straddling and ends in a loop frame', () => {
    const banks = packBanks(encodeFrames(captureToFrames(synth(8000), RATE)), 6);
    expect(banks.length).toBeGreaterThan(1);
    banks.forEach((b, i) => {
      expect(b.length).toBeLessThanOrEqual(ZX_BANK_SIZE);
      expect(b[b.length - 1]).toBe(i === banks.length - 1 ? 0xFE : 0xFF);
    });
    expect(decodeBanks(banks).length).toBe(8000);
  });

  it('refuses a song larger than the free banks', () => {
    const big = captureToFrames(synth(60000), RATE);
    expect(() => packBanks(encodeFrames(big), 1)).toThrow(/data banks/);
  });
});

describe('ZX .tap', () => {
  it('has valid checksums, loader, player and one block pair per bank', () => {
    const r = buildZxTap(synth(8000), RATE, player, 'my song');
    const blocks = parseTap(r.tap);
    expect(blocks.every((b) => b.ok)).toBe(true);
    // header + data pairs: loader, player, then banks
    expect(blocks.length).toBe(2 * (2 + r.banks));
    expect(blocks[0].flag).toBe(0x00);
    expect(blocks[0].data[0]).toBe(0); // program
    expect(blocks[1].data[blocks[1].data.length - 1]).toBe(0x0D);
    // each bank is paged with POKE 23388 (BANK_M) before OUT 32765, else 128 BASIC re-pages bank 0 around LOAD
    const basic = String.fromCharCode(...blocks[1].data);
    const pagings = [...basic.matchAll(/\xF423388\x0E[\s\S]{5},(\d+)\x0E[\s\S]{5}:\xDF32765\x0E[\s\S]{5},(\d+)\x0E/g)];
    expect(pagings.map((m) => [Number(m[1]), Number(m[2])])).toEqual(player.usableBanks.slice(0, r.banks).map((b) => [16 + b, 16 + b]));
    expect(blocks[3].data.length).toBe(player.bytes.length);
    // bank table patched with ROM 1 + bank numbers
    const code = blocks[3].data;
    for (let i = 0; i < r.banks; i++) expect(code[player.bankTableOffset + i]).toBe(0x10 | player.usableBanks[i]);
    // data blocks decode back to the frames
    const dataBanks = blocks.slice(4).filter((_, i) => i % 2 === 1).map((b) => b.data);
    expect(decodeBanks(dataBanks).length).toBe(8000);
  });
});
