/**
 * NES player Phase 3 done-check: encode a small 2A03 capture, patch it into public/nes/player.bin, run the ROM in
 * Mesen2 headless and compare the APU write log per NMI tick with the capture. Skips when Mesen2 or player.bin is absent.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NesCapture, NesEvent } from '../nes/nesCapture';
import { encodeNesStreams, nesCaptureToTicks, decodeNesStream } from '../nes/nesStream';
import { buildNesCartridge, type NesPlayer } from '../nes/nesCartridge';
import { NES_CONTROL } from '../nes/nesCapture';

const MESEN = join(homedir(), 'Applications/Mesen.app/Contents/MacOS/Mesen');
const ROM = join(__dirname, '../../../../public/nes/player.bin');
const META = join(__dirname, '../../../../public/nes/player.json');
const ready = existsSync(MESEN) && existsSync(ROM) && existsSync(META);

const SR = 48000, TR = 60;
const at = (tick: number) => Math.round(tick * SR / TR);
const w = (tick: number, addr: number, value: number, chip: 'nes' | 'vrc6' | 'fds' = 'nes'): NesEvent => ({ kind: 'write', chip, sample: at(tick), addr, value });

/** Ticks: sequential run $4000-$4003, repeated identical ticks (dictionary), gaps (empty and repeat), other chips mixed in. */
function capture(): NesCapture {
  const events: NesEvent[] = [w(0, 0x4015, 0x0f), w(0, 0x4000, 0xbf), w(0, 0x4001, 0x08), w(0, 0x4002, 0xa9), w(0, 0x4003, 0x01)];
  for (const t of [2, 5, 6, 9, 12]) events.push(w(t, 0x4000, 0x9f), w(t, 0x4002, 0x55), w(t, 0x9000, 0x8f, 'vrc6'), w(t, 0x4040, 0x20, 'fds'));
  events.push(w(7, 0x400c, 0x3f), w(7, 0x400e, 0x04), w(7, 0x400f, 0x00));
  events.push(w(20, 0x4015, 0x00), w(20, 0x4017, 0x40), w(20, 0xa000, 0x91, 'vrc6'));
  events.push(w(21, 0x4000, 0x30));
  return { events, sampleRate: SR, tickRateHz: TR };
}

function player(): NesPlayer {
  const meta = JSON.parse(readFileSync(META, 'utf8'));
  return { ...meta, bytes: Uint8Array.from(readFileSync(ROM)) };
}

/** Runs rom in Mesen2 headless for `ticks` NMIs. Returns the $4000-$4017 writes per tick and, per tick, the byte at $C000 (DPCM window). */
function mesen(rom: Uint8Array, ticks: number, timeout = 30): { writes: Array<Array<[number, number]>>; window: number[] } {
  const meta = JSON.parse(readFileSync(META, 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'nesplayer-'));
  try {
    writeFileSync(join(dir, 'p.nes'), rom);
    const lua = `local n=0
emu.addMemoryCallback(function(a,v) print(string.format("W %04X %02X",a,v&0xFF)) end, emu.callbackType.write, 0x4000, 0x4017)
emu.addMemoryCallback(function() n=n+1 print(string.format("T %02X",emu.read(0xC000, emu.memType.nesMemory))) if n>=${ticks + 1} then print("DONE") emu.stop(0) end end, emu.callbackType.exec, ${meta.nmiAddress}, ${meta.nmiAddress})
`;
    writeFileSync(join(dir, 'log.lua'), lua);
    const set = join(homedir(), 'Library/Application Support/Mesen2');
    mkdirSync(set, { recursive: true });
    if (!existsSync(join(set, 'Settings.json'))) writeFileSync(join(set, 'Settings.json'), '{"FirstRun":false}');
    const out = execFileSync(MESEN, ['--testRunner', `--timeout=${timeout}`, '--doNotSaveSettings', '--enableStdout', join(dir, 'log.lua'), join(dir, 'p.nes')], { encoding: 'utf8', timeout: timeout * 1000 + 30000, maxBuffer: 1 << 28 });
    expect(out).toContain('DONE');
    const writes: Array<Array<[number, number]>> = [];
    const window: number[] = [];
    for (const line of out.split('\n')) {
      if (line.startsWith('T ')) { writes.push([]); window.push(parseInt(line.slice(2), 16)); }
      else if (line.startsWith('W ') && writes.length) { const [, a, v] = line.trim().split(' '); writes[writes.length - 1].push([parseInt(a, 16), parseInt(v, 16)]); }
    }
    return { writes: writes.slice(0, ticks), window: window.slice(0, ticks) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function run(cap: NesCapture, loopTick: number | undefined, ticks: number): Array<Array<[number, number]>> {
  const meta = JSON.parse(readFileSync(META, 'utf8'));
  const rom = Uint8Array.from(readFileSync(ROM));
  rom.set(encodeNesStreams([{ ntsc: cap, loopTick }], meta.bankSize).ntsc, meta.dataOffset);
  return mesen(rom, ticks).writes;
}

/** Distinct 2A03 writes every tick (no dictionary hits), enough ticks for more than 32 KB of stream. */
function bigCapture(ticks: number): NesCapture {
  const events: NesEvent[] = [];
  let x = 12345;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return (x >> 8) & 0xff; };
  for (let t = 0; t < ticks; t++) for (const a of [0x4000, 0x4002, 0x4003, 0x4004, 0x4006]) events.push(w(t, a, rnd()));
  return { events, sampleRate: SR, tickRateHz: TR };
}

describe.skipIf(!ready)('NES player in Mesen2 (APU writes per tick vs capture)', () => {
  it('replays a 2A03 capture once and then stays silent (END)', () => {
    const cap = capture();
    const exp = nesCaptureToTicks(cap).map((t) => t.writes.nes ?? []);
    const got = run(cap, undefined, exp.length + 5);
    expect(got.slice(0, exp.length)).toEqual(exp);
    expect(got.slice(exp.length).flat()).toEqual([]);
  }, 90000);

  it('loops back to the loop tick', () => {
    const cap = capture();
    const exp = nesCaptureToTicks(cap).map((t) => t.writes.nes ?? []);
    const loop = 5, total = exp.length + 2 * (exp.length - loop);
    const want = Array.from({ length: total }, (_, i) => exp[i < exp.length ? i : loop + (i - exp.length) % (exp.length - loop)]);
    expect(decodeNesStream(encodeNesStreams([{ ntsc: cap, loopTick: loop }]).ntsc, 0).loopTick).toBe(loop);
    expect(run(cap, loop, total)).toEqual(want);
  }, 90000);

  it('plays a stream larger than 32 KB across bank switches and loops back over the boundary', () => {
    const cap = bigCapture(4400);
    const exp = nesCaptureToTicks(cap).map((t) => t.writes.nes ?? []);
    const loop = 4000;
    const cart = buildNesCartridge([{ ntsc: cap, loopTick: loop }], player(), 'bank test');
    expect(cart.streamBytes).toBeGreaterThan(32768);
    expect(cart.banks).toBeGreaterThanOrEqual(16);
    const total = exp.length + 100;
    const want = Array.from({ length: total }, (_, i) => exp[i < exp.length ? i : loop + (i - exp.length) % (exp.length - loop)]);
    const got = mesen(cart.rom, total, 120).writes;
    const bad = want.findIndex((x, i) => JSON.stringify(x) !== JSON.stringify(got[i]));
    expect({ firstMismatchTick: bad, got: got[bad], want: want[bad] }).toEqual({ firstMismatchTick: -1, got: undefined, want: undefined });
  }, 180000);

  it('keeps the DPCM window mapped until the sample has been fetched, then switches', () => {
    const ctl = (tick: number, value: number): NesEvent => ({ kind: 'control', chip: 'nes', sample: at(tick), control: NES_CONTROL.DPCM_BANK, channel: 0, value });
    const cap: NesCapture = { events: [ctl(2, 3), w(8, 0x4010, 0x0f), w(8, 0x4012, 0x00), w(8, 0x4013, 0xff), w(8, 0x4015, 0x10), ctl(12, 5), w(150, 0x4000, 0x01)], sampleRate: SR, tickRateHz: TR };
    const cart = buildNesCartridge([{ ntsc: cap }], player(), 'dpcm test');
    cart.rom[16 + 3 * 4096] = 0xa3; // marker at the start of ROM bank 3 and 5, seen at $C000 when mapped
    cart.rom[16 + 5 * 4096] = 0xa5;
    const { window } = mesen(cart.rom, 160);
    expect(window[1]).not.toBe(0xa3);
    expect(window[4]).toBe(0xa3);       // idle DMC: first event applied at once
    expect(window[20]).toBe(0xa3);      // second event waits: DMC still fetching bytes
    expect(window[150]).toBe(0xa5);     // applied after the last byte
    const first = window.indexOf(0xa5);
    expect(first).toBeGreaterThan(40);  // 4081 bytes at the fastest rate take about 59 ticks from tick 8
    expect(window.slice(first).every((v) => v === 0xa5)).toBe(true);
  }, 90000);
});
