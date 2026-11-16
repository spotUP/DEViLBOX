import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FurnaceChipType } from '../../../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from '../../VGMExporter';
import { captureToFrames, encodeFrames, decodeBanks } from '../../zx/zxAyStream';
import { buildVectrexCartridge, decodeVectrexStream, runLengthFrames, vectrexTitle, type VectrexPlayer } from '../vectrexCartridge';

const player: VectrexPlayer = {
  ...JSON.parse(readFileSync('public/vectrex/player.json', 'utf8')),
  bytes: new Uint8Array(readFileSync('public/vectrex/player.bin')),
};
const RATE = 48000;
const w = (frame: number, reg: number, data: number): RegisterWrite =>
  ({ timestamp: frame * RATE / 50, chipType: FurnaceChipType.AY, port: reg, data });

function synth(frames: number): RegisterWrite[] {
  const out: RegisterWrite[] = [w(0, 7, 0x38), w(0, 8, 15)];
  for (let f = 0; f < frames; f++) out.push(w(f, 0, f & 0xFF), w(f, 1, (f >> 8) & 0x0F), w(f, 6, f % 31));
  return out;
}

describe('Vectrex cartridge', () => {
  it('has the BIOS header, patched title, and a stream that decodes to the captured frames and loops', () => {
    const writes = synth(200);
    const r = buildVectrexCartridge(writes, RATE, player, 'My Song');
    expect(String.fromCharCode(...r.bin.subarray(0, 10))).toBe('g GCE 2026');
    expect(r.bin[10]).toBe(0x80);
    expect(String.fromCharCode(...r.bin.subarray(player.titleOffset, player.titleOffset + 16))).toBe('MY SONG         ');
    expect([4096, 8192, 16384, 32768]).toContain(r.bin.length);
    const stream = r.bin.subarray(player.dataOffset, player.dataOffset + r.dataBytes);
    expect(stream[stream.length - 1]).toBe(0xFE); // loop frame ends the stream
    const dec = decodeVectrexStream(stream);
    expect(dec.length).toBe(r.frames);
    const cap = captureToFrames(writes, RATE);
    let ok = true;
    const cur = new Array(14).fill(0);
    dec.forEach((f, i) => { f.forEach((v, k) => { cur[k] = v; }); cap[i].forEach((v, k) => { if (v !== undefined && cur[k] !== v) ok = false; }); });
    expect(ok).toBe(true);
  });

  it('run-length compresses silent stretches: compress -> decode equals the raw stream', () => {
    const writes = [w(0, 0, 10), w(0, 8, 15), w(40, 0, 20), w(41, 0, 21), w(300, 8, 0)];
    const frames = captureToFrames(writes, RATE);
    const raw = encodeFrames(frames);
    const rawStream = Uint8Array.from([...raw.flatMap((f) => [...f]), 0, 0xFE]);
    const packed = runLengthFrames(raw);
    expect(packed.length).toBeLessThan(raw.length);
    const packedStream = Uint8Array.from([...packed.flatMap((f) => [...f]), 0, 0xFE]);
    const a = decodeVectrexStream(packedStream), b = decodeBanks([rawStream]);
    expect(a.length).toBe(b.length);
    a.forEach((f, i) => expect([...f]).toEqual([...b[i]]));
    // runs over 255 frames split into several repeat codes
    expect(decodeVectrexStream(Uint8Array.from([...runLengthFrames(new Array(600).fill(Uint8Array.of(0, 0))).flatMap((f) => [...f]), 0, 0xFE])).length).toBe(600);
  });

  it('refuses a song over 32 KB with a clear message', () => {
    const writes: RegisterWrite[] = [];
    for (let f = 0; f < 6000; f++) for (let r = 0; r < 8; r++) writes.push(w(f, r, (f * 7 + r * 13) & 0xFF));
    expect(() => buildVectrexCartridge(writes, RATE, player)).toThrow(/Vectrex cartridge holds 32768 bytes/);
  });

  it('refuses a capture with no AY writes', () => {
    expect(() => buildVectrexCartridge([], RATE, player)).toThrow(/No AY register writes/);
  });

  it('title is upper case, space-padded, non-printables replaced', () => {
    expect(String.fromCharCode(...vectrexTitle('aé~z', 6))).toBe('A  Z  ');
  });
});
