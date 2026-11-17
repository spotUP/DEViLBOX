/**
 * NES player Phase 8b: a heavy multi-chip tick (every chip writes its channel registers every frame) must not push PPU writes
 * past vblank. Measured per NMI in Mesen2 headless: CPU cycles from NMI entry to the last write in $2000-$2007, and to NMI end.
 * The capture is synthetic (register counts of a full multi-chip song), not a Furnace song: captures come from the browser worklet.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NesCapture, NesChip, NesEvent } from '../nes/nesCapture';
import { buildNesCartridge, type NesPlayer } from '../nes/nesCartridge';
import { MESEN } from './nesMesenHarness';

const ROM = join(__dirname, '../../../../public/nes/player.bin');
const META = join(__dirname, '../../../../public/nes/player.json');
const ready = existsSync(MESEN) && existsSync(ROM) && existsSync(META);
const SR = 48000, TICKS = 400, FRAMES = Number(process.env.NF ?? 380);
const VBLANK = 2273; // NTSC: 20 scanlines of 113.67 CPU cycles

/** Per tick 52 writes (2A03 8, VRC6 6, VRC7 6, FDS 4, MMC5 4, N163 16, 5B 8), values change every tick so nothing repeats. A tick of 95 writes costs more than one frame in the decoder alone. */
const LAYOUT: Array<[NesChip, number[]]> = [
  ['nes', [0x4000, 0x4002, 0x4003, 0x4004, 0x4006, 0x4007, 0x4008, 0x400a]],
  ['vrc6', [0x9000, 0x9001, 0x9002, 0xa000, 0xa001, 0xa002]],
  ['vrc7', [0x10, 0x11, 0x20, 0x21, 0x30, 0x31]],
  ['fds', [0x4080, 0x4082, 0x4083, 0x4084]],
  ['mmc5', [0x5002, 0x5003, 0x5004, 0x5006]],
  ['n163', Array.from({ length: 16 }, (_, i) => 0x40 + i)],
  ['s5b', [0, 1, 2, 3, 4, 5, 8, 9]],
];

function heavy(): NesCapture {
  const events: NesEvent[] = [];
  for (let t = 0; t < TICKS; t++) {
    for (const [chip, addrs] of LAYOUT.filter(([c]) => !process.env.ONLY || process.env.ONLY.split(',').includes(c))) addrs.forEach((addr, i) => events.push({ kind: 'write', chip, sample: Math.round(t * SR / 60.0988), addr, value: (t * 7 + i * 13 + 1) & 0x7f }));
  }
  return { events, sampleRate: SR, tickRateHz: 60.0988 };
}

function measure(rom: Uint8Array, meta: { nmiAddress: number; nmiEndAddress: number }): { ppu: number; nmi: number } {
  const dir = mkdtempSync(join(tmpdir(), 'nesvblank-'));
  try {
    writeFileSync(join(dir, 'p.nes'), rom);
    const lua = `local f,t0,lp,mp,mx,inn=0,0,0,0,0,false
emu.addMemoryCallback(function() t0=emu.getState()["cpu.cycleCount"] inn=true end, emu.callbackType.exec, ${meta.nmiAddress}, ${meta.nmiAddress})
emu.addMemoryCallback(function() if not inn then return end lp=emu.getState()["cpu.cycleCount"]-t0 if lp>mp then mp=lp end end, emu.callbackType.write, 0x2000, 0x2007)
emu.addMemoryCallback(function() inn=false local d=emu.getState()["cpu.cycleCount"]-t0 if d>mx then mx=d end f=f+1
  if f>=${FRAMES} then print("PPU "..mp) print("NMI "..mx) print("DONE") emu.stop(0) end
end, emu.callbackType.exec, ${meta.nmiEndAddress}, ${meta.nmiEndAddress})
`;
    writeFileSync(join(dir, 's.lua'), lua);
    const set = join(homedir(), 'Library/Application Support/Mesen2');
    mkdirSync(set, { recursive: true });
    if (!existsSync(join(set, 'Settings.json'))) writeFileSync(join(set, 'Settings.json'), '{"FirstRun":false}');
    const out = execFileSync(MESEN, ['--testRunner', '--timeout=15', '--nes.region=Ntsc', '--doNotSaveSettings', '--enableStdout', join(dir, 's.lua'), join(dir, 'p.nes')], { encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26 });
    expect(out).toContain('DONE');
    return { ppu: Number(out.match(/PPU (\d+)/)![1]), nmi: Number(out.match(/NMI (\d+)/)![1]) };
  } catch (e) { console.log('[nes8b] ' + String((e as { stdout?: string }).stdout).slice(-600)); throw e; } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe.skipIf(!ready)('NES player vblank budget with a heavy multi-chip tick', () => {
  it('keeps every PPU write inside vblank', () => {
    const meta = JSON.parse(readFileSync(META, 'utf8'));
    const player: NesPlayer = { ...meta, bytes: Uint8Array.from(readFileSync(ROM)) };
    const rom = buildNesCartridge([{ ntsc: heavy() }], player, 'Heavy Song', 'ntsc', 0, { author: 'Some Author', chipName: 'Famicom expansion', comments: '' }).rom;
    const m = measure(rom, meta);
    console.log(`[nes8b] last PPU write ${m.ppu} cycles after NMI entry, NMI total ${m.nmi}`);
    expect(m.ppu).toBeLessThan(VBLANK);
  }, 120000);
});
