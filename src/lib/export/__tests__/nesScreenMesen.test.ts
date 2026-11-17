/**
 * NES player Phase 8 done-check in Mesen2 headless: a Lua script reads the PPU nametable (title, author, status line, bar columns)
 * and feeds joypad input (Start = pause, Right = next subsong) through the inputPolled event. Also measures the NMI body length.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NesCapture, NesEvent } from '../nes/nesCapture';
import { buildNesCartridge, type NesPlayer } from '../nes/nesCartridge';
import { MESEN } from './nesMesenHarness';

const ROM = join(__dirname, '../../../../public/nes/player.bin');
const META = join(__dirname, '../../../../public/nes/player.json');
const ready = existsSync(MESEN) && existsSync(ROM) && existsSync(META);
const SR = 48000;

function capture(value: number, ticks = 600): NesCapture {
  const events: NesEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push({ kind: 'write', chip: 'nes', sample: Math.round(t * SR / 60.0988), addr: 0x4000, value });
  return { events, sampleRate: SR, tickRateHz: 60.0988 };
}

/** Frames (NMIs) at which the script dumps, and the joypad schedule: [first frame, last frame, button]. */
const DUMPS = [30, 150, 200, 330];
const PRESS: Array<[number, number, string]> = [[160, 165, 'start'], [210, 215, 'start'], [260, 265, 'right']];

function run(rom: Uint8Array, meta: { nmiAddress: number; nmiEndAddress: number }): string {
  const dir = mkdtempSync(join(tmpdir(), 'nesscreen-'));
  try {
    writeFileSync(join(dir, 'p.nes'), rom);
    const lua = `local f,t0,mx=0,0,0
local function row(r) local t={} for c=0,31 do t[#t+1]=string.char(emu.read(0x2000+r*32+c, emu.memType.nesPpuMemory)+0x20) end return table.concat(t) end
local function bars() local o={} for c=2,29 do local n=0 for r=10,17 do if emu.read(0x2000+r*32+c, emu.memType.nesPpuMemory)==72 then n=n+1 end end o[#o+1]=n end return table.concat(o,",") end
emu.addMemoryCallback(function() t0=emu.getState()["cpu.cycleCount"] end, emu.callbackType.exec, ${meta.nmiAddress}, ${meta.nmiAddress})
emu.addMemoryCallback(function() local d=emu.getState()["cpu.cycleCount"]-t0 if d>mx then mx=d end
  f=f+1
  for _,x in ipairs({${DUMPS.join(',')}}) do if f==x then print("F"..f.."|"..row(1).."|"..row(4).."|"..row(5).."|"..row(7).."|"..bars().."|"..row(24).."|"..emu.read(0x29,emu.memType.nesMemory).."/"..emu.read(0x27,emu.memType.nesMemory).."/"..emu.read(0x2B,emu.memType.nesMemory)) end end
  if f>=${DUMPS[DUMPS.length - 1]} then print("MAX "..mx) print("DONE") emu.stop(0) end
end, emu.callbackType.exec, ${meta.nmiEndAddress}, ${meta.nmiEndAddress})
emu.addEventCallback(function()
${PRESS.map(([a, b, k]) => `  if f>=${a} and f<=${b} then emu.setInput({${k}=true},0) end`).join('\n')}
end, emu.eventType.inputPolled)
`;
    writeFileSync(join(dir, 's.lua'), lua);
    const set = join(homedir(), 'Library/Application Support/Mesen2');
    mkdirSync(set, { recursive: true });
    if (!existsSync(join(set, 'Settings.json'))) writeFileSync(join(set, 'Settings.json'), '{"FirstRun":false}');
    const out = execFileSync(MESEN, ['--testRunner', '--timeout=60', '--nes.region=Ntsc', '--nes.port1.type=NesController', '--doNotSaveSettings', '--enableStdout', join(dir, 's.lua'), join(dir, 'p.nes')], { encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26 });
    expect(out).toContain('DONE');
    return out;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe.skipIf(!ready)('NES player screen in Mesen2', () => {
  const meta = JSON.parse(readFileSync(META, 'utf8'));
  const player: NesPlayer = { ...meta, bytes: Uint8Array.from(readFileSync(ROM)) };
  const rom = buildNesCartridge([{ ntsc: capture(0x3f) }, { ntsc: capture(0x35) }], player, 'Test Song', 'ntsc', 0, { author: 'Some Author', chipName: 'Nintendo 2A03', comments: '' }).rom;

  it('draws title, author, status line, bars and scroller; Start pauses and Right selects the next subsong', () => {
    const out = run(rom, meta);
    const dumps = Object.fromEntries(out.split('\n').filter((l) => /^F\d+\|/.test(l)).map((l) => [l.split('|')[0], l.split('|')]));
    console.log(`[nes8] ${out.split('\n').filter((l) => l.startsWith('MAX') || l.startsWith('F')).join('\n[nes8] ')}`);
    const s0 = dumps.F30, a = dumps.F150, b = dumps.F200, c = dumps.F330;
    expect(a[1].slice(6, 19)).toBe('NINTENDO 2A03');
    expect(a[2]).toMatch(/^TEST SONG/);
    expect(a[3]).toMatch(/^SOME AUTHOR/);
    expect(a[4].slice(2, 28)).toBe('SONG 01/02  00:02  PLAYING');
    expect(a[5].split(',')[0]).toBe('8'); // 2A03 pulse 1 volume 15 = full bar
    expect(a[5].split(',').slice(1).every((n) => n === '0')).toBe(true); // absent chips and silent channels stay empty
    expect(s0[6]).toContain('SONG - SOME AUTHOR'); // scroller window shows the text
    expect(b[4].slice(2, 28)).toBe('SONG 01/02  00:02  PAUSED '); // Start pauses, time frozen
    expect(b[7]).toBe('0/1/0'); // pad/paused/current
    expect(c[4].slice(2, 28)).toBe('SONG 02/02  00:01  PLAYING'); // Start resumed, Right at frame ~261 selected subsong 2 and restarted the clock
    expect(c[7]).toBe('0/0/1');
    const max = Number(out.match(/MAX (\d+)/)![1]);
    expect(max).toBeLessThan(2273); // NTSC vblank budget in CPU cycles: tick plus screen must fit
    }, 120000);
});
