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

function run(cap: NesCapture, loopTick: number | undefined, ticks: number): Array<Array<[number, number]>> {
  const meta = JSON.parse(readFileSync(META, 'utf8'));
  const rom = Uint8Array.from(readFileSync(ROM));
  const stream = encodeNesStreams([{ ntsc: cap, loopTick }]).ntsc;
  rom.set(stream, meta.dataOffset);
  const dir = mkdtempSync(join(tmpdir(), 'nesplayer-'));
  try {
    writeFileSync(join(dir, 'p.nes'), rom);
    const lua = `local n=0
emu.addMemoryCallback(function(a,v) print(string.format("W %04X %02X",a,v&0xFF)) end, emu.callbackType.write, 0x4000, 0x4017)
emu.addMemoryCallback(function() n=n+1 print("T") if n>=${ticks + 1} then print("DONE") emu.stop(0) end end, emu.callbackType.exec, ${meta.nmiAddress}, ${meta.nmiAddress})
`;
    writeFileSync(join(dir, 'log.lua'), lua);
    const set = join(homedir(), 'Library/Application Support/Mesen2');
    mkdirSync(set, { recursive: true });
    if (!existsSync(join(set, 'Settings.json'))) writeFileSync(join(set, 'Settings.json'), '{"FirstRun":false}');
    const out = execFileSync(MESEN, ['--testRunner', '--timeout=30', '--doNotSaveSettings', '--enableStdout', join(dir, 'log.lua'), join(dir, 'p.nes')], { encoding: 'utf8', timeout: 60000 });
    expect(out).toContain('DONE');
    const perTick: Array<Array<[number, number]>> = [];
    for (const line of out.split('\n')) {
      if (line.startsWith('T')) perTick.push([]);
      else if (line.startsWith('W ') && perTick.length) { const [, a, v] = line.trim().split(' '); perTick[perTick.length - 1].push([parseInt(a, 16), parseInt(v, 16)]); }
    }
    return perTick.slice(0, ticks);
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
});
